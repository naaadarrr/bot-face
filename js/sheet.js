/* sheet.js — review grid of every expression with per-expression PNG export */
(function () {
  'use strict';
  var BF = window.BotFace;
  var qs = new URLSearchParams(location.search);
  var reduced = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var live = qs.get('still') !== '1';
  var bgMode = qs.get('bg') === 'light' ? 'light' : 'dark';
  var view = qs.get('view') === 'full' ? 'full' : 'face';
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var zoom = 0.9;   // fixed framing, same as the studio
  var cards = [];
  var sheet = document.getElementById('sheet');

  BF.EXPRESSION_ORDER.forEach(function (name) {
    var label = BF.EXPRESSIONS[name].label, key = name;
    var card = document.createElement('div'); card.className = 'card';
    var c = document.createElement('canvas'); c.width = Math.round(260 * DPR); c.height = c.width;
    var row = document.createElement('div'); row.className = 'row';
    var nm = document.createElement('div'); nm.className = 'name'; nm.textContent = label; nm.title = key;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'icon-btn';
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>'; btn.title = 'Export PNG';
    btn.setAttribute('aria-label', 'Export ' + label + ' as PNG');
    btn.addEventListener('click', function () { exportPNG(name); });
    row.appendChild(nm); row.appendChild(btn);
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', label);
    card.appendChild(c); card.appendChild(row); sheet.appendChild(card);
    var av = new BF.Avatar({ expression: name, reduced: reduced, follow: false, blink: live, idle: live });
    cards.push({ name: name, av: av, canvas: c, ctx: c.getContext('2d') });
  });

  function exportPNG(name) {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    var av = new BF.Avatar({ expression: name, blink: false, idle: false, follow: false });
    av.draw(c.getContext('2d'), 1024, 1024, { view: view === 'face' ? BF.headView(zoom) : 'full', bg: bgMode === 'light' ? 'none' : 'dark', still: true, px: 1024 });
    var a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'bot-' + name + (bgMode === 'light' ? '-transparent' : '') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.exportPNG = exportPNG;

  function $(id) { return document.getElementById(id); }
  function applyBg() {
    document.documentElement.className = bgMode === 'light' ? 'theme-light' : 'theme-dark';
    $('btnBg').setAttribute('aria-checked', bgMode === 'light');
  }
  applyBg();
  $('btnBg').addEventListener('click', function () { bgMode = bgMode === 'light' ? 'dark' : 'light'; applyBg(); if (!live) drawAll(0); });
  function setCrop(v) {
    view = v;
    $('cropHead').setAttribute('aria-checked', v === 'face'); $('cropFull').setAttribute('aria-checked', v === 'full');
    if (!live) drawAll(0);
  }
  $('cropHead').addEventListener('click', function () { setCrop('face'); });
  $('cropFull').addEventListener('click', function () { setCrop('full'); });
  $('btnLive').addEventListener('click', function () {
    live = !live; this.setAttribute('aria-checked', live);
    cards.forEach(function (k) { k.av.blinkOn = live; k.av.idle = live; if (!live) { k.av.snap(); k.av.blink = 0; } });
    if (live) { last = performance.now(); requestAnimationFrame(loop); } else drawAll(0);
  });
  $('btnAll').addEventListener('click', function () {
    var i = 0; (function next() { if (i < cards.length) { var k = cards[i++]; exportPNG(k.name); setTimeout(next, 350); } })();
  });

  function drawAll(dt) {
    cards.forEach(function (k) {
      if (live) k.av.update(dt);
      var head = view === 'face';
      k.canvas.classList.toggle('round', head);
      k.av.draw(k.ctx, k.canvas.width, k.canvas.height, head
        ? { view: BF.headView(zoom), bg: bgMode, lightColor: '#efe9e1', still: !live, px: 224, frame: 'circle' }
        : { view: 'full', bg: bgMode, lightColor: '#efe9e1', still: !live, frame: Math.round(12 * DPR) });
    });
  }
  var last = performance.now();
  function loop(now) { var dt = (now - last) / 1000; last = now; drawAll(dt); if (live) requestAnimationFrame(loop); }
  BF.loadAssets(function () {
    applyBg();
    setCrop(view);
    $('btnLive').setAttribute('aria-checked', live);
    if (live) requestAnimationFrame(loop); else drawAll(0);
    document.documentElement.dataset.ready = '1';
  });
})();
