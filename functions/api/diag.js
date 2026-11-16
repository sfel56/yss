// Diagnostic endpoint: run the full play chain inside the Cloudflare environment
// and report each step's status. Visit /api/diag to see where it breaks.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REF = 'https://apiv1.yrain.top/';
const TEST_EP = 'https://vip.dytt-tvs.com/20261001/39315_245403f0/index.m3u8';

export async function onRequestGet(context) {
  const steps = [];
  const add = (name, ok, detail) => steps.push({ name, ok, detail });

  // Step 1: search API
  try {
    const r = await fetch('https://apiv1.yrain.top/tv.php?q=' + encodeURIComponent('熊出没'), {
      headers: { 'user-agent': UA },
    });
    const txt = await r.text();
    let n = -1;
    try { n = JSON.parse(txt).results.length; } catch (e) {}
    add('1. tv.php search', r.status === 200 && n >= 0, 'status=' + r.status + ' results=' + n + ' bytes=' + txt.length);
  } catch (e) {
    add('1. tv.php search', false, String(e));
  }

  // Step 2: m3u8.php ad-removal -> clean url
  let cleanUrl = '';
  try {
    const r = await fetch('https://apiv1.yrain.top/m3u8.php?url=' + encodeURIComponent(TEST_EP), {
      headers: { 'user-agent': UA, referer: REF },
    });
    cleanUrl = (await r.text()).trim();
    add('2. m3u8.php clean url', r.status === 200 && /^https?:/.test(cleanUrl), 'status=' + r.status + ' url=' + cleanUrl.slice(0, 70));
  } catch (e) {
    add('2. m3u8.php clean url', false, String(e));
  }

  // Step 3: fetch clean m3u8 playlist
  let firstSeg = '';
  try {
    const r = await fetch(cleanUrl, { headers: { 'user-agent': UA, referer: REF } });
    const body = await r.text();
    const segLine = body.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'));
    firstSeg = segLine ? new URL(segLine, cleanUrl).href : '';
    add('3. fetch clean m3u8', r.status === 200 && !!firstSeg, 'status=' + r.status + ' bytes=' + body.length + ' firstSeg=' + (firstSeg || '').slice(0, 60));
  } catch (e) {
    add('3. fetch clean m3u8', false, String(e));
  }

  // Step 4: fetch a TS segment (HEAD-free, GET with UA)
  try {
    const r = await fetch(firstSeg, { headers: { 'user-agent': UA, referer: REF } });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || '';
    add('4. fetch TS segment', r.status === 200 && buf.byteLength > 1000, 'status=' + r.status + ' bytes=' + buf.byteLength + ' type=' + ct);
  } catch (e) {
    add('4. fetch TS segment', false, String(e));
  }

  // Step 5: fetch segment with NO user-agent (test WAF)
  try {
    const r = await fetch(firstSeg, {});
    const txt = await r.text();
    add('5. fetch TS no-UA (WAF test)', false, 'status=' + r.status + ' first120=' + txt.slice(0, 120).replace(/\n/g, ' '));
  } catch (e) {
    add('5. fetch TS no-UA (WAF test)', false, String(e));
  }

  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diag</title><style>body{font:14px/1.6 monospace;background:#0b0b14;color:#ececf4;padding:24px}h1{color:#b6a3ff}.s{padding:10px 14px;margin:8px 0;border-radius:8px;border:1px solid #2a2a3d}.ok{background:#14201a;border-color:#1f5a3a;color:#7ee}.bad{background:#201414;border-color:#5a1f1f;color:#e88}.d{color:#a0a0b8;word-break:break-all}</style></head><body><h1>影视搜 · 播放链诊断</h1><p style="color:#a0a0b8">在 Cloudflare Pages 运行环境内逐步执行播放链路，定位失败步骤。</p>'
    + steps.map(s => '<div class="s ' + (s.ok ? 'ok' : 'bad') + '"><b>' + (s.ok ? 'OK' : 'FAIL') + '</b> ' + s.name + '<div class="d">' + s.detail + '</div></div>').join('')
    + '</body></html>';

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}
