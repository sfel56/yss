(function () {
  "use strict";

  var API = {
    search: function (q) { return "/api/search?q=" + encodeURIComponent(q); },
    play: function (url) { return "/api/play?url=" + encodeURIComponent(url); },
  };

  var QUICK = ["电影", "电视剧", "动漫", "综艺", "哪吒", "流浪地球", "斗罗大陆", "狂飙", "庆余年", "三体"];

  var state = {
    results: [],
    byId: {},
    query: "",
    loading: false,
    detailId: null,
    playId: null,
    playEp: 0,
    hls: null,
    video: null,
  };

  var el = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function posterUrl(p) {
    if (!p) return "";
    if (p.indexOf("//") === 0) return "https:" + p;
    return p;
  }
  function epLabel(i, total) {
    if (total === 1) return "正片";
    return "第" + (i + 1) + "集";
  }

  // ---------- Router ----------
  function route() {
    var hash = location.hash.replace(/^#\/?/, "");
    var parts = hash ? hash.split("/") : [];
    closeDetail();
    closePlayer();
    if (parts[0] === "detail" && parts[1]) {
      openDetail(parts[1], parts[2] ? parseInt(parts[2], 10) : null);
    } else if (parts[0] === "play" && parts[1]) {
      var ep = parts[2] ? parseInt(parts[2], 10) : 0;
      openPlayer(parts[1], ep);
    } else {
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  // ---------- Home / Search ----------
  function renderHome() {
    var view = $("view-home");
    var html = "";
    html += '<div class="hero"><div class="hero-content">';
    html += '<h1>海量影视 <span>一搜即看</span></h1>';
    html += '<p>聚合多源影视资源，支持高清 m3u8 在线播放，自动去广告。搜索你喜欢的电影、电视剧、动漫与综艺。</p>';
    html += "</div></div>";

    html += '<div class="section-head"><h2 class="section-title">快捷搜索</h2></div>';
    html += '<div class="tags">';
    QUICK.forEach(function (t) {
      html += '<button class="tag" data-q="' + esc(t) + '">' + esc(t) + "</button>";
    });
    html += "</div>";

    html += '<div class="section-head"><h2 class="section-title" id="resultHead">' +
      (state.query ? "搜索结果" : "热门推荐") +
      '</h2><span class="section-sub" id="resultSub"></span></div>';
    html += '<div id="resultArea"></div>';

    view.innerHTML = html;

    view.querySelectorAll(".tag").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = b.getAttribute("data-q");
        $("searchInput").value = q;
        doSearch(q, true);
      });
    });

    if (state.results.length) {
      renderResults();
    } else {
      var head = $("resultHead");
      var sub = $("resultSub");
      if (head) head.textContent = "开始探索";
      if (sub) sub.textContent = "";
      $("resultArea").innerHTML = welcomeState();
    }
  }

  function renderResults() {
    var area = $("resultArea");
    var sub = $("resultSub");
    var head = $("resultHead");
    if (sub) sub.textContent = state.query ? ("关键词: " + state.query) : "";
    if (head) head.textContent = state.query ? "搜索结果" : "热门推荐";

    if (state.loading) {
      area.innerHTML = skeletonGrid();
      return;
    }
    if (!state.results.length) {
      area.innerHTML = emptyState("没有找到相关影视", "试试其他关键词，或点击上方快捷标签");
      return;
    }
    area.innerHTML = '<div class="grid" id="grid"></div>';
    var grid = $("grid");
    var frag = "";
    state.results.forEach(function (it) {
      frag += cardHtml(it);
    });
    grid.innerHTML = frag;
    grid.querySelectorAll(".card").forEach(function (c) {
      c.addEventListener("click", function () {
        var id = c.getAttribute("data-id");
        location.hash = "#/detail/" + id;
      });
    });
    lazyImages();
  }

  function cardHtml(it) {
    var year = it.year ? esc(it.year) : "";
    var type = it.type_name ? esc(it.type_name) : "";
    var epCount = (it.episodes && it.episodes.length) || 0;
    var badge = epCount > 1 ? (epCount + "集") : "电影";
    var p = posterUrl(it.poster);
    var ph = '<div class="poster skel"></div>';
    var img = p
      ? '<img data-src="' + esc(p) + '" alt="' + esc(it.title) + '" src="" loading="lazy" onerror="this.style.display=\'none\'" />'
      : "";
    return (
      '<button class="card" data-id="' + esc(it.id) + '">' +
      '<div class="poster">' +
      '<span class="badge">' + esc(badge) + "</span>" +
      (year ? '<span class="badge year">' + year + "</span>" : "") +
      img +
      '<div class="poster-play"><svg viewBox="0 0 24 24" width="46" height="46"><circle cx="12" cy="12" r="12" fill="rgba(0,0,0,.5)"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg></div>' +
      "</div>" +
      '<p class="card-title">' + esc(it.title) + "</p>" +
      '<div class="card-meta">' +
      (type ? "<span>" + type + "</span><span class='dot'></span>" : "") +
      "<span>" + (year || "—") + "</span>" +
      "</div>" +
      "</button>"
    );
  }

  function skeletonGrid() {
    var n = 18;
    var html = '<div class="grid">';
    for (var i = 0; i < n; i++) {
      html += '<div class="card skeleton-card">' +
        '<div class="poster"></div>' +
        '<div class="skel skel-line" style="width:80%"></div>' +
        '<div class="skel skel-line" style="width:50%"></div>' +
        "</div>";
    }
    html += "</div>";
    return html;
  }

  function emptyState(title, sub) {
    return (
      '<div class="state">' +
      '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      "<h3>" + esc(title) + "</h3><p>" + esc(sub) + "</p></div>"
    );
  }

  function welcomeState() {
    return (
      '<div class="state welcome-state">' +
      '<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="url(#wg)" stroke-width="1.5">' +
      '<defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#e055a0"/></linearGradient></defs>' +
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      "<h3>搜索你想看的影视</h3>" +
      "<p>在上方搜索框输入片名，或点击快捷标签开始</p>" +
      "</div>"
    );
  }

  function loadingState(txt) {
    return '<div class="state"><div class="spinner"></div><p>' + esc(txt || "加载中…") + "</p></div>";
  }

  // ---------- Search ----------
  function doSearch(q, pushHash) {
    q = (q || "").trim();
    if (!q) return;
    state.query = q;
    state.loading = true;
    if ($("searchInput").value !== q) $("searchInput").value = q;
    renderResults();
    fetch(API.search(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.results = (data && data.results) || [];
        state.byId = {};
        state.results.forEach(function (it) { state.byId[it.id] = it; });
        state.loading = false;
        renderResults();
      })
      .catch(function () {
        state.results = [];
        state.loading = false;
        renderResults();
        var area = $("resultArea");
        if (area) area.innerHTML = emptyState("加载失败", "网络异常，请稍后重试");
      });
  }

  // ---------- Detail ----------
  function openDetail(id, autoEp) {
    var item = state.byId[id];
    var modal = $("detailModal");
    if (!item) {
      // Try to find in current results; if not, close
      modal.classList.add("open");
      $("detailBody").innerHTML = loadingState("加载详情…");
      // Fallback: not in cache, show message
      setTimeout(function () {
        $("detailBody").innerHTML = emptyState("未找到该影视", "请返回首页重新搜索");
      }, 600);
      return;
    }
    state.detailId = id;
    document.body.style.overflow = "hidden";
    var epCount = (item.episodes && item.episodes.length) || 0;
    var classes = item.class ? String(item.class).split(/[,，]/).filter(Boolean) : [];
    var type = item.type_name ? String(item.type_name).split(/[,，]/).filter(Boolean) : [];

    var html = '<div class="detail-head">';
    html += '<div class="detail-poster">' +
      (item.poster ? '<img src="' + esc(posterUrl(item.poster)) + '" alt="' + esc(item.title) + '" onerror="this.style.display=\'none\'"/>' : "") +
      "</div>";
    html += '<div class="detail-info">';
    html += "<h2 id='detailTitle'>" + esc(item.title) + "</h2>";
    html += '<div class="detail-meta">';
    if (item.year) html += '<span class="chip accent">' + esc(item.year) + "</span>";
    type.forEach(function (t) { html += '<span class="chip">' + esc(t) + "</span>"; });
    classes.forEach(function (c) { html += '<span class="chip">' + esc(c) + "</span>"; });
    if (item.source_name) html += '<span class="chip gold">源: ' + esc(item.source_name) + "</span>";
    html += "</div>";
    if (item.desc) html += '<p class="detail-desc">' + esc(item.desc) + "</p>";
    html += '<div class="detail-actions">';
    if (epCount > 0) {
      html += '<button class="btn-primary" id="detailPlay">' +
        '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> 立即播放</button>';
    }
    html += '<button class="btn-ghost" data-close>关闭</button>';
    html += "</div></div></div>";

    if (epCount > 1) {
      html += '<div class="detail-eps"><h3>选集 (' + epCount + ")</h3><div class='eps-grid'>";
      for (var i = 0; i < epCount; i++) {
        html += '<button class="ep-btn" data-ep="' + i + '">' + (i + 1) + "</button>";
      }
      html += "</div></div>";
    }
    $("detailBody").innerHTML = html;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    if ($("detailPlay")) {
      $("detailPlay").addEventListener("click", function () {
        location.hash = "#/play/" + id + "/0";
      });
    }
    $("detailBody").querySelectorAll(".ep-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var ep = parseInt(b.getAttribute("data-ep"), 10);
        location.hash = "#/play/" + id + "/" + ep;
      });
    });
    $("detailBody").querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", closeDetailAndHome);
    });

    if (autoEp != null) {
      setTimeout(function () { location.hash = "#/play/" + id + "/" + autoEp; }, 120);
    }
  }

  function closeDetail() {
    var modal = $("detailModal");
    if (modal.classList.contains("open")) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }
  function closeDetailAndHome() {
    closeDetail();
    if (location.hash.indexOf("#/detail") === 0 || location.hash.indexOf("#/play") === 0) {
      location.hash = "#/";
    }
  }

  // ---------- Player ----------
  function openPlayer(id, ep) {
    var item = state.byId[id];
    var view = $("playerView");
    if (!item) {
      view.classList.add("open");
      $("playerTitle").textContent = "未找到内容";
      $("playerEps").innerHTML = "";
      showPlayerError();
      return;
    }
    state.playId = id;
    state.playEp = ep;
    closeDetail();
    document.body.style.overflow = "hidden";
    view.classList.add("open");
    view.setAttribute("aria-hidden", "false");

    var epCount = (item.episodes && item.episodes.length) || 0;
    if (ep < 0 || ep >= epCount) ep = 0;
    $("playerTitle").textContent = item.title + " · " + epLabel(ep, epCount);

    // Episode list
    var epsHtml = "";
    if (epCount > 1) {
      for (var i = 0; i < epCount; i++) {
        epsHtml += '<button class="ep-btn' + (i === ep ? " active" : "") + '" data-ep="' + i + '">' + (i + 1) + "</button>";
      }
    }
    $("playerEps").innerHTML = epsHtml;
    $("playerEps").querySelectorAll(".ep-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var next = parseInt(b.getAttribute("data-ep"), 10);
        if (next !== state.playEp) {
          location.hash = "#/play/" + id + "/" + next;
        }
      });
    });

    var src = item.episodes[ep];
    if (!src) { showPlayerError(); return; }
    startPlay(API.play(src));
  }

  function startPlay(src) {
    var video = $("video");
    var loading = $("playerLoading");
    var error = $("playerError");
    loading.classList.remove("hidden");
    loading.style.display = "flex";
    error.classList.remove("show");
    video.pause();

    if (state.hls) { state.hls.destroy(); state.hls = null; }
    state.video = video;

    var ready = function () {
      loading.style.display = "none";
      video.play().catch(function () {});
    };

    if (window.Hls && Hls.isSupported()) {
      var hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
      });
      state.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, ready);
      hls.on(Hls.Events.ERROR, function (_e, data) {
        if (data.fatal) {
          loading.style.display = "none";
          showPlayerError();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", ready, { once: true });
      video.addEventListener("error", function () {
        loading.style.display = "none";
        showPlayerError();
      }, { once: true });
    } else {
      loading.style.display = "none";
      showPlayerError();
    }
  }

  function showPlayerError() {
    $("playerError").classList.add("show");
  }

  function closePlayer() {
    var view = $("playerView");
    if (view.classList.contains("open")) {
      view.classList.remove("open");
      view.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      var video = $("video");
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      if (state.hls) { state.hls.destroy(); state.hls = null; }
      $("playerLoading").style.display = "flex";
      $("playerError").classList.remove("show");
    }
  }

  // ---------- Lazy images ----------
  var io;
  function lazyImages() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("img[data-src]").forEach(revealImg);
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { revealImg(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: "200px" });
    }
    document.querySelectorAll("img[data-src]").forEach(function (img) {
      if (!img.dataset.loaded) io.observe(img);
    });
  }
  function revealImg(img) {
    var src = img.getAttribute("data-src");
    if (src) { img.src = src; img.dataset.loaded = "1"; }
  }

  // ---------- Theme ----------
  function setupTheme() {
    var btn = $("themeToggle");
    if (!btn) return;
    var meta = $("metaTheme");
    function current() {
      return document.documentElement.getAttribute("data-theme") || "dark";
    }
    function apply(t) {
      document.documentElement.setAttribute("data-theme", t);
      try { localStorage.setItem("ys-theme", t); } catch (e) {}
      if (meta) meta.setAttribute("content", t === "light" ? "#f4f5fa" : "#0b0b14");
    }
    btn.addEventListener("click", function () {
      apply(current() === "light" ? "dark" : "light");
    });
    if (meta) meta.setAttribute("content", current() === "light" ? "#f4f5fa" : "#0b0b14");
  }

  // ---------- Init ----------
  function init() {
    el.searchForm = $("searchForm");
    el.searchInput = $("searchInput");

    setupTheme();

    el.searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = el.searchInput.value.trim();
      if (q) {
        if (location.hash !== "#/") location.hash = "#/";
        doSearch(q, true);
      }
    });

    // Modal close handlers
    $("detailModal").querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", closeDetailAndHome);
    });

    $("playerBack").addEventListener("click", function () {
      if (state.detailId && state.byId[state.detailId]) {
        location.hash = "#/detail/" + state.detailId;
      } else {
        location.hash = "#/";
      }
    });

    // ESC closes
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if ($("playerView").classList.contains("open")) {
          closePlayer();
          history.back();
        } else if ($("detailModal").classList.contains("open")) {
          closeDetailAndHome();
        }
      }
    });

    window.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
