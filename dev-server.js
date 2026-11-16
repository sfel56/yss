// Zero-dependency local dev server.
// Mirrors the Cloudflare Pages Functions in /functions/api/* so the SPA
// works locally without wrangler. For production, deploy to Cloudflare Pages
// and the functions/ directory handles these routes automatically.

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const REF = "https://apiv1.yrain.top/";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let p = pathname === "/" ? "/index.html" : pathname;
  // Prevent path traversal
  p = p.replace(/\.\.+/g, "");
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not Found");
    const ext = path.extname(file).toLowerCase();
    send(res, 200, buf, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-cache" });
  });
}

async function handleSearch(req, res, q) {
  if (!q) return send(res, 200, JSON.stringify({ results: [] }), { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  try {
    const r = await fetch("https://apiv1.yrain.top/tv.php?q=" + encodeURIComponent(q), { headers: { "user-agent": UA } });
    const text = await r.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { results: [] }; }
    send(res, 200, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=600" });
  } catch (e) {
    send(res, 502, JSON.stringify({ results: [], error: String(e) }), { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  }
}

async function handlePlay(req, res, target, direct) {
  if (!target) return send(res, 400, "#EXTM3U\n", { "content-type": "application/vnd.apple.mpegurl", "access-control-allow-origin": "*" });
  try {
    let playlistUrl = target;
    if (!direct) {
      const clean = await fetch("https://apiv1.yrain.top/m3u8.php?url=" + encodeURIComponent(target), { headers: { "user-agent": UA, referer: REF } });
      playlistUrl = (await clean.text()).trim();
      if (!/^https?:/.test(playlistUrl)) playlistUrl = target;
    }
    const plResp = await fetch(playlistUrl, { headers: { "user-agent": UA, referer: REF } });
    let text = await plResp.text();
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const isMaster = text.includes("#EXT-X-STREAM-INF");
    const out = text.split("\n").map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      try {
        const abs = new URL(t, playlistUrl).href;
        if (isMaster) return "/api/play?direct=1&url=" + encodeURIComponent(abs);
        return "/api/seg?url=" + encodeURIComponent(abs);
      } catch { return line; }
    }).join("\n");
    send(res, 200, out, {
      "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": direct ? "public, max-age=3600" : "no-cache",
    });
  } catch (e) {
    send(res, 502, "#EXTM3U\n#EXT-X-ENDLIST\n", { "content-type": "application/vnd.apple.mpegurl", "access-control-allow-origin": "*" });
  }
}

async function handleSeg(req, res, target) {
  if (!target) return send(res, 400, "missing url", { "access-control-allow-origin": "*" });
  try {
    const headers = { "user-agent": UA, referer: REF };
    const range = req.headers["range"];
    if (range) headers["range"] = range;
    const r = await fetch(target, { headers });
    const buf = Buffer.from(await r.arrayBuffer());
    const outHeaders = {
      "content-type": r.headers.get("content-type") || "video/mp2t",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=86400, immutable",
    };
    const cr = r.headers.get("content-range");
    if (cr) outHeaders["content-range"] = cr;
    send(res, r.status, buf, outHeaders);
  } catch (e) {
    send(res, 502, "upstream error", { "access-control-allow-origin": "*" });
  }
}

async function handleDiag(req, res) {
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  var REF = "https://apiv1.yrain.top/";
  var TEST_EP = "https://vip.dytt-tvs.com/20261001/39315_245403f0/index.m3u8";
  var steps = [];
  function add(name, ok, detail) { steps.push({ name: name, ok: ok, detail: detail }); }

  try {
    var r = await fetch("https://apiv1.yrain.top/tv.php?q=" + encodeURIComponent("熊出没"), { headers: { "user-agent": UA } });
    var txt = await r.text(); var n = -1;
    try { n = JSON.parse(txt).results.length; } catch (e) {}
    add("1. tv.php search", r.status === 200 && n >= 0, "status=" + r.status + " results=" + n + " bytes=" + txt.length);
  } catch (e) { add("1. tv.php search", false, String(e)); }

  var cleanUrl = "";
  try {
    var r2 = await fetch("https://apiv1.yrain.top/m3u8.php?url=" + encodeURIComponent(TEST_EP), { headers: { "user-agent": UA, referer: REF } });
    cleanUrl = (await r2.text()).trim();
    add("2. m3u8.php clean url", r2.status === 200 && /^https?:/.test(cleanUrl), "status=" + r2.status + " url=" + cleanUrl.slice(0, 70));
  } catch (e) { add("2. m3u8.php clean url", false, String(e)); }

  var firstSeg = "";
  try {
    var r3 = await fetch(cleanUrl, { headers: { "user-agent": UA, referer: REF } });
    var body = await r3.text();
    var segLine = body.split("\n").map(function (s) { return s.trim(); }).find(function (s) { return s && s[0] !== "#"; });
    firstSeg = segLine ? new URL(segLine, cleanUrl).href : "";
    add("3. fetch clean m3u8", r3.status === 200 && !!firstSeg, "status=" + r3.status + " bytes=" + body.length);
  } catch (e) { add("3. fetch clean m3u8", false, String(e)); }

  try {
    var r4 = await fetch(firstSeg, { headers: { "user-agent": UA, referer: REF } });
    var buf = await r4.arrayBuffer();
    add("4. fetch TS segment", r4.status === 200 && buf.byteLength > 1000, "status=" + r4.status + " bytes=" + buf.byteLength + " type=" + (r4.headers.get("content-type") || ""));
  } catch (e) { add("4. fetch TS segment", false, String(e)); }

  var rows = steps.map(function (s) {
    return '<div class="s ' + (s.ok ? "ok" : "bad") + '"><b>' + (s.ok ? "OK" : "FAIL") + "</b> " + s.name + '<div class="d">' + String(s.detail).replace(/</g, "&lt;") + "</div></div>";
  }).join("");
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>Diag</title><style>body{font:14px/1.6 monospace;background:#0b0b14;color:#ececf4;padding:24px}.s{padding:10px 14px;margin:8px 0;border-radius:8px;border:1px solid #2a2a3d}.ok{background:#14201a;border-color:#1f5a3a;color:#7ee}.bad{background:#201414;border-color:#5a1f1f;color:#e88}.d{color:#a0a0b8;word-break:break-all}</style></head><body><h1>播放链诊断</h1>' + rows + "</body></html>";
  send(res, 200, html, { "content-type": "text/html; charset=utf-8" });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === "OPTIONS") {
    return send(res, 204, null, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400",
    });
  }

  if (pathname === "/api/search") return handleSearch(req, res, parsed.query.q);
  if (pathname === "/api/play") return handlePlay(req, res, parsed.query.url, parsed.query.direct === "1");
  if (pathname === "/api/seg") return handleSeg(req, res, parsed.query.url);
  if (pathname === "/api/diag") return handleDiag(req, res);

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log("\n  影视搜 dev server running:");
  console.log("  -> http://localhost:" + PORT + "\n");
});
