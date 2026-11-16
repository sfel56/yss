const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REF = 'https://apiv1.yrain.top/';

function corsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
    ...extra,
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const u = new URL(context.request.url);
  const target = u.searchParams.get('url');
  if (!target) {
    return new Response('missing url', { status: 400, headers: corsHeaders() });
  }
  try {
    const reqHeaders = { 'user-agent': UA, referer: REF };
    const range = context.request.headers.get('range');
    if (range) reqHeaders['range'] = range;
    const resp = await fetch(target, {
      headers: reqHeaders,
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    const headers = corsHeaders({
      'content-type': resp.headers.get('content-type') || 'video/mp2t',
      'cache-control': 'public, max-age=86400, immutable',
    });
    const rh = resp.headers.get('content-range');
    if (rh) headers['content-range'] = rh;
    const cl = resp.headers.get('content-length');
    if (cl) headers['content-length'] = cl;
    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    return new Response('upstream error', { status: 502, headers: corsHeaders() });
  }
}
