const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REF = 'https://apiv1.yrain.top/';

function cors(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
    ...extra,
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet(context) {
  const u = new URL(context.request.url);
  const target = u.searchParams.get('url');
  const direct = u.searchParams.get('direct') === '1';
  if (!target) {
    return new Response('#EXTM3U\n', {
      status: 400,
      headers: cors({ 'content-type': 'application/vnd.apple.mpegurl' }),
    });
  }
  try {
    let playlistUrl = target;
    if (!direct) {
      const clean = await fetch(
        'https://apiv1.yrain.top/m3u8.php?url=' + encodeURIComponent(target),
        { headers: { 'user-agent': UA, referer: REF, accept: '*/*' } }
      );
      playlistUrl = (await clean.text()).trim();
      if (!playlistUrl.startsWith('http')) {
        playlistUrl = target;
      }
    }
    const plResp = await fetch(playlistUrl, {
      method: 'GET',
      headers: { 'user-agent': UA, referer: REF, accept: '*/*' },
      redirect: 'follow',
    });
    let text = await plResp.text();
    const isMaster = text.includes("#EXT-X-STREAM-INF");
    const lines = text.split('\n').map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return line;
      try {
        const abs = new URL(t, playlistUrl).href;
        if (isMaster) {
          return '/api/play?direct=1&url=' + encodeURIComponent(abs);
        }
        return '/api/seg?url=' + encodeURIComponent(abs);
      } catch {
        return line;
      }
    });
    return new Response(lines.join('\n'), {
      headers: cors({
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': direct ? 'public, max-age=3600' : 'no-cache',
      }),
    });
  } catch (e) {
    return new Response('#EXTM3U\n#EXT-X-ENDLIST\n', {
      status: 502,
      headers: cors({ 'content-type': 'application/vnd.apple.mpegurl' }),
    });
  }
}
