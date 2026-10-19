/* 共同元件包 cms-kit v0.4.1 互動部分：浮動視窗（G1）、打名字選人（G9）、toast（G10）。
   沒有任何外部相依；全部掛在 window.CmsKit 底下，不改各系統自己的全域變數。
   v0.2（10-12，對齊 A7 提案板第 2 輪）：視窗標題列加小圖示＋副標（編號）；左下小籤改成工作列（每個視窗一張、最前藍框、收起虛線、可關）；
   自動完成可分組（已編號／未編號）、狀態字上色、方向鍵＋Enter 選。 */
(function () {
  "use strict";
  var MAX = 4, z = 100, seq = 0, wins = [];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function layer() {
    var l = document.querySelector(".cms-layer");
    if (!l) { l = document.createElement("div"); l.className = "cms-layer cms-root";   /* 掛在 body 底下，不在各系統的 .cms-root 裡：自己帶字型 */ document.body.appendChild(l); }
    var d = document.querySelector(".cms-dock");
    if (!d) { d = document.createElement("div"); d.className = "cms-dock cms-root"; document.body.appendChild(d); }
    return l;
  }
  function posKey(kind) { return "cms:winpos:" + kind; }
  function loadPos(kind) { try { return JSON.parse(localStorage.getItem(posKey(kind)) || "null"); } catch (e) { return null; } }
  function savePos(kind, x, y) { try { localStorage.setItem(posKey(kind), JSON.stringify({ x: x, y: y })); } catch (e) { /* 存不了就算了，不影響操作 */ } }
  /** 視窗底部不能超出畫面：最高＝畫面高－視窗頂端位置（底部按鈕一定看得到）。 */
  function fit(w) { w.el.style.maxHeight = Math.max(220, window.innerHeight - w.el.offsetTop - 16) + "px"; }
  function front(w) { z += 1; w.el.style.zIndex = z; wins.forEach(function (x) { x.el.classList.toggle("front", x === w); }); dock(); }
  function icon(w) { return '<span class="cms-wico' + (w.tone ? " " + esc(w.tone) : "") + '">' + esc(w.icon) + "</span>"; }
  function dock() {
    var d = document.querySelector(".cms-dock"); if (!d) return;
    d.innerHTML = wins.map(function (w) {
      var cls = "cms-dchip" + (w.min ? " min" : w.el.classList.contains("front") ? " front" : "");
      return '<div class="' + cls + '"><button type="button" data-cms-restore="' + w.id + '" title="' + (w.min ? "叫回" : "移到最前") + '">' + icon(w) + "<b>" + esc(w.title) + "</b>" + (w.sub ? "<small>" + esc(w.sub) + "</small>" : "") +
        '</button><button type="button" data-cms-dclose="' + w.id + '" title="關閉">✕</button></div>';
    }).join("");
  }
  function collapseOldestIfFull() {
    var live = wins.filter(function (w) { return !w.min; });
    if (live.length >= MAX) { live[0].min = true; live[0].el.style.display = "none"; live[0].el.classList.remove("front"); }
  }
  function drag(w) {
    var h = w.el.querySelector(".cms-whead"), on = false, sx, sy, ox, oy;
    h.addEventListener("pointerdown", function (e) { if (e.target.closest(".cms-wbtn")) return; on = true; sx = e.clientX; sy = e.clientY; ox = w.el.offsetLeft; oy = w.el.offsetTop; h.setPointerCapture(e.pointerId); front(w); });
    h.addEventListener("pointermove", function (e) {
      if (!on) return;
      var x = Math.min(window.innerWidth - 80, Math.max(-w.el.offsetWidth + 80, ox + e.clientX - sx));
      var y = Math.min(window.innerHeight - 50, Math.max(0, oy + e.clientY - sy));
      w.el.style.left = x + "px"; w.el.style.top = y + "px"; fit(w);
    });
    h.addEventListener("pointerup", function () { if (!on) return; on = false; savePos(w.kind, w.el.offsetLeft, w.el.offsetTop); });
  }
  /** 開一個浮動視窗。opts：{ key（同 key 不重開、改叫回）, kind（記位置用，例 "case"）, title, sub（副標，例個案編號）, icon（一個字或符號，純文字）,
      tone（圖示底色：sky 預設／coral／sun／mint／lav）, width（px，預設 520，A7 定稿）, html（內容）, foot（底部按鈕 html）, onClose } */
  function open(opts) {
    var ex = opts.key && wins.filter(function (w) { return w.key === opts.key; })[0];
    if (ex) { setBody(ex, opts); if (ex.min) { collapseOldestIfFull(); ex.min = false; ex.el.style.display = ""; } front(ex); return ex; }
    var l = layer(); collapseOldestIfFull(); seq += 1;
    var el = document.createElement("div"); el.className = "cms-win"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", opts.title || "");
    var p = loadPos(opts.kind || "default"), off = (seq % 5) * 28;
    if (opts.width) el.style.width = opts.width + "px";
    el.style.left = (p ? p.x : Math.max(12, window.innerWidth - (opts.width || 520) - 40 - off)) + "px";
    el.style.top = (p ? p.y : 70 + off) + "px";
    el.innerHTML = '<div class="cms-whead"><span class="cms-wico"></span><b></b><small class="cms-wsub"></small><button class="cms-wbtn" type="button" data-cms-min title="收到左下角">–</button><button class="cms-wbtn" type="button" data-cms-close title="關閉">✕</button></div><div class="cms-wbody"></div><div class="cms-wfoot"></div>';
    l.appendChild(el);
    var w = { id: "cmsw" + seq, key: opts.key || null, kind: opts.kind || "default", el: el, title: "", sub: "", icon: "", tone: "", min: false, onClose: opts.onClose };
    setBody(w, opts); wins.push(w); front(w); drag(w); fit(w);
    el.addEventListener("mousedown", function () { if (!el.classList.contains("front")) front(w); });
    el.querySelector("[data-cms-close]").addEventListener("click", function () { close(w); });
    el.querySelector("[data-cms-min]").addEventListener("click", function () { w.min = true; el.style.display = "none"; el.classList.remove("front"); dock(); });
    return w;
  }
  function setBody(w, opts) {
    w.title = opts.title || w.title; w.el.querySelector(".cms-whead b").textContent = w.title;
    if (opts.sub != null) w.sub = opts.sub; w.el.querySelector(".cms-wsub").textContent = w.sub;
    if (opts.icon != null) w.icon = opts.icon; if (opts.tone != null) w.tone = opts.tone;
    var ic = w.el.querySelector(".cms-wico"); ic.textContent = w.icon; ic.className = "cms-wico" + (w.tone ? " " + w.tone : "");
    if (opts.html != null) w.el.querySelector(".cms-wbody").innerHTML = opts.html;
    var f = w.el.querySelector(".cms-wfoot"); f.innerHTML = opts.foot || ""; f.style.display = opts.foot ? "" : "none";
  }
  function close(w) { w.el.remove(); wins = wins.filter(function (x) { return x !== w; }); dock(); if (w.onClose) w.onClose(); }
  function byId(id) { return wins.filter(function (x) { return x.id === id; })[0]; }
  document.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("[data-cms-dclose]");
    if (c) { var wc = byId(c.getAttribute("data-cms-dclose")); if (wc) close(wc); return; }
    var b = e.target.closest && e.target.closest("[data-cms-restore]"); if (!b) return;
    var w = byId(b.getAttribute("data-cms-restore"));
    if (!w) return;
    if (w.min) { collapseOldestIfFull(); w.min = false; w.el.style.display = ""; }
    front(w);
  });

  window.addEventListener("resize", function () { wins.forEach(fit); });

  /** 打名字選人（G9）。input：輸入框；search(q) 回 Promise<[{value,label,sub,state,tone,group}]>
      label 例「鄭淑貞(CA11590028)」、sub 例「主責 王心怡」、state 例「已受理」＋tone（ok／go／wait／no 上色）、group 例「已編號個案（同名）」「未編號（尚未建立個案）」——
      同一組要排在一起，組名換了才出標題。只有一位也要點一下（識別規則 T3），所以不會自動選；方向鍵移動、Enter 選目前反白的那一位。 */
  function combo(input, search, onPick, opts) {
    opts = opts || {}; var wrap = input.parentElement; wrap.classList.add("cms-combo");
    var pop = document.createElement("div"); pop.className = "cms-acpop"; pop.hidden = true; wrap.appendChild(pop);
    var timer = 0, items = [], cur = -1;
    function render() {
      var g = null, html = "";
      items.forEach(function (it, i) {
        if (it.group && it.group !== g) { g = it.group; html += '<div class="cms-acgroup">' + esc(g) + "</div>"; }
        var tail = [it.sub ? esc(it.sub) : "", it.state ? '<span class="t-' + esc(it.tone || "go") + '">' + esc(it.state) + "</span>" : ""].filter(Boolean).join("・");
        html += '<button type="button" data-i="' + i + '"><b>' + esc(it.label) + "</b>" + (tail ? "<small>・" + tail + "</small>" : "") + "</button>";
      });
      pop.innerHTML = items.length ? html : '<div class="cms-none">' + esc(opts.empty || "找不到；可以先照存，交主責認領") + "</div>";
      cur = -1; pop.hidden = false;
    }
    function mark() { Array.prototype.forEach.call(pop.querySelectorAll("button[data-i]"), function (b) { b.classList.toggle("on", +b.getAttribute("data-i") === cur); if (+b.getAttribute("data-i") === cur) b.scrollIntoView({ block: "nearest" }); }); }
    input.addEventListener("input", function () {
      clearTimeout(timer); var q = input.value.trim();
      if (q.length < (opts.min || 1)) { pop.hidden = true; return; }
      timer = setTimeout(function () { Promise.resolve(search(q)).then(function (r) { items = r || []; render(); }, function (err) { items = []; pop.innerHTML = '<div class="cms-none">查詢失敗：' + esc(err && err.message || err) + "</div>"; pop.hidden = false; }); }, opts.delay || 300);
    });
    input.addEventListener("keydown", function (e) {
      if (pop.hidden || !items.length) return;
      if (e.key === "ArrowDown") { cur = Math.min(items.length - 1, cur + 1); mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { cur = Math.max(0, cur - 1); mark(); e.preventDefault(); }
      else if (e.key === "Enter" && cur >= 0) { pop.hidden = true; onPick(items[cur]); e.preventDefault(); }
      else if (e.key === "Escape") { pop.hidden = true; }
    });
    pop.addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (!b) return; pop.hidden = true; onPick(items[+b.getAttribute("data-i")]); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) pop.hidden = true; });
  }

  /** toast（G10）：成功 3 秒消失（規格 R-06，v0.4.0 由 3.5 秒改）；錯誤不自動消失（失敗一定要被看到）。 */
  function toast(msg, err) {
    var t = document.createElement("div"); t.className = "cms-toast cms-root" + (err ? " err" : ""); t.textContent = msg;
    var x = document.createElement("button"); x.type = "button"; x.textContent = "知道了"; x.className = "cms-btn small"; x.addEventListener("click", function () { t.remove(); });
    t.appendChild(x); document.body.appendChild(t);
    if (!err) setTimeout(function () { t.remove(); }, 3000);
  }

  window.CmsKit = { version: "0.4.1", open: open, close: close, combo: combo, toast: toast, esc: esc, windows: function () { return wins.slice(); } };
})();
