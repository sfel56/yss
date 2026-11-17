// Diagnostic endpoint v2: test multiple segment hosts from the Cloudflare environment
// to find which CDNs are reachable and whether they send CORS headers.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REF = 'https://apiv1.yrain.top/';

async function testSeg(url, withOrigin) {
  try {
    const headers = { 'user-agent': UA, referer: REF };
    if (withOrigin) headers['origin'] = 'https://yss-1dn.pages.dev';
    const r = await fetch(url, { method: 'GET', headers, redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || '';
    const acao = r.headers.get('access-control-allow-origin') || '';
    return {
      status: r.status,
      bytes: buf.byteLength,
      type: ct,
      cors: acao,
      ok: r.status === 200 && buf.byteLength > 1000,
    };
  } catch (e) {
    return { status: 0, bytes: 0, type: '', cors: '', ok: false, err: String(e).slice(0, 120) };
  }
}

export async function onRequestGet(context) {
  const steps = [];
  const add = (name, ok, detail) => steps.push({ name, ok, detail });

  // Step 1: search
  let firstItem = null;
  try {
    const r = await fetch('https://apiv1.yrain.top/tv.php?q=' + encodeURIComponent('爱情'), {
      headers: { 'user-agent': UA },
    });
    const data = await r.json();
    firstItem = (data.results || []).find((x) => x.episodes && x.episodes.length);
    add('1. tv.php search', r.status === 200 && firstItem, 'status=' + r.status + ' firstTitle=' + (firstItem ? firstItem.title : 'none'));
  } catch (e) {
    add('1. tv.php search', false, String(e));
  }

  // Step 2-3: m3u8.php + clean playlist for first item
  let segHosts = [];
  if (firstItem) {
    try {
      const ep = firstItem.episodes[0];
      const cr = await fetch('https://apiv1.yrain.top/m3u8.php?url=' + encodeURIComponent(ep), {
        headers: { 'user-agent': UA, referer: REF },
      });
      const cleanUrl = (await cr.text()).trim();
      add('2. m3u8.php clean', cr.status === 200 && /^https?:/.test(cleanUrl), 'status=' + cr.status + ' url=' + cleanUrl.slice(0, 70));
      const pr = await fetch(cleanUrl, { headers: { 'user-agent': UA, referer: REF } });
      const body = await pr.text();
      const segs = body.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
      // unique hosts
      const hostMap = {};
      for (const s of segs) {
        try {
          const h = new URL(s, cleanUrl).hostname;
          if (!hostMap[h]) hostMap[h] = new URL(s, cleanUrl).href;
        } catch (e) {}
      }
      segHosts = Object.keys(hostMap).slice(0, 3);
      add('3. fetch clean m3u8', pr.status === 200 && segs.length > 0, 'status=' + pr.status + ' segCount=' + segs.length + ' hosts=' + segHosts.join(','));
    } catch (e) {
      add('3. fetch clean m3u8', false, String(e));
    }
  }

  // Step 4: test first segment WITHOUT Origin (plain GET)
  let firstSegUrl = '';
  if (segHosts.length) {
    try {
      const ep = firstItem.episodes[0];
      const cr = await fetch('https://apiv1.yrain.top/m3u8.php?url=' + encodeURIComponent(ep), { headers: { 'user-agent': UA, referer: REF } });
      const cleanUrl = (await cr.text()).trim();
      const pr = await fetch(cleanUrl, { headers: { 'user-agent': UA, referer: REF } });
      const body = await pr.text();
      const segLine = body.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
      firstSegUrl = segLine ? new URL(segLine, cleanUrl).href : '';
    } catch (e) {}

    if (firstSegUrl) {
      const t1 = await testSeg(firstSegUrl, false);
      add('4. seg GET (no Origin)', t1.ok, 'status=' + t1.status + ' bytes=' + t1.bytes + ' type=' + t1.type + ' CORS=' + (t1.cors || 'none') + (t1.err ? ' err=' + t1.err : ''));

      const t2 = await testSeg(firstSegUrl, true);
      add('5. seg GET (with Origin)', t2.ok, 'status=' + t2.status + ' bytes=' + t2.bytes + ' CORS=' + (t2.cors || 'none') + (t2.err ? ' err=' + t2.err : ''));
    }
  }

  // Step 6: test a sampling of OTHER hosts from a different title
  const sampleEp = 'https://vod1.maowushi.com';
  try {
    const r = await fetch('https://apiv1.yrain.top/tv.php?q=' + encodeURIComponent('斗罗大陆'), { headers: { 'user-agent': UA } });
    const data = await r.json();
    const items = (data.results || []).filter((x) => x.episodes && x.episodes.length).slice(0, 4);
    const tested = [];
    for (const it of items) {
      const ep = it.episodes[0];
      const cr = await fetch('https://apiv1.yrain.top/m3u8.php?url=' + encodeURIComponent(ep), { headers: { 'user-agent': UA, referer: REF } });
      const cleanUrl = (await cr.text()).trim();
      if (!/^https?:/.test(cleanUrl)) continue;
      const pr = await fetch(cleanUrl, { headers: { 'user-agent': UA, referer: REF } });
      const body = await pr.text();
      const segLine = body.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
      if (!segLine) continue;
      const segAbs = new URL(segLine, cleanUrl).href;
      const host = new URL(segAbs).hostname;
      if (tested.find((x) => x.host === host)) continue;
      const t = await testSeg(segAbs, false);
      tested.push({ host, status: t.status, ok: t.ok, cors: t.cors });
      if (tested.length >= 5) break;
    }
    add('6. sample other hosts', true, tested.map((t) => t.host + ':' + t.status + (t.ok ? '(OK' : '(BLOCKED') + (t.cors ? ',CORS=' + t.cors : '') + ')').join(' | '));
  } catch (e) {
    add('6. sample other hosts', false, String(e).slice(0, 150));
  }

  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diag v2</title><style>body{font:13px/1.6 -apple-system,monospace;background:#0b0b14;color:#ececf4;padding:20px;max-width:900px;margin:0 auto}h1{color:#b6a3ff}h2{color:#ff9ed1;margin-top:18px}.s{padding:10px 14px;margin:6px 0;border-radius:8px;border:1px solid #2a2a3d}.ok{background:#14201a;border-color:#1f5a3a;color:#7ee}.bad{background:#201414;border-color:#5a1f1f;color:#e88}.d{color:#a0a0b8;word-break:break-all;font-size:12px}</style></head><body><h1>影视搜 · 播放链诊断 v2</h1><p style="color:#a0a0b8">在 Cloudflare Pages 环境内测试多个影视源的可达性与 CORS。</p>'
    + steps.map((s) => '<div class="s ' + (s.ok ? 'ok' : 'bad') + '"><b>' + (s.ok ? 'OK' : 'FAIL') + '</b> ' + s.name + '<div class="d">' + String(s.detail).replace(/</g, '&lt;') + '</div></div>').join('')
    + '</body></html>';

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}
