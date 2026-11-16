export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400',
    },
  });
}

export async function onRequestGet(context) {
  const u = new URL(context.request.url);
  const q = u.searchParams.get('q');
  if (!q || !q.trim()) {
    return json({ results: [] });
  }
  try {
    const api = 'https://apiv1.yrain.top/tv.php?q=' + encodeURIComponent(q.trim());
    const resp = await fetch(api, {
      headers: { 'user-agent': 'Mozilla/5.0 (CloudflarePages)' },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    const body = await resp.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = { results: [] };
    }
    return json(payload, {
      'cache-control': 'public, max-age=600, s-maxage=1800',
    });
  } catch (e) {
    return json({ results: [], error: String(e) }, { 'cache-control': 'no-cache' });
  }
}

function json(obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      ...extra,
    },
  });
}
