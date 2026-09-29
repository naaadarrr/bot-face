/* app.js — studio tabs, export, and the expression strip. */
(function () {
  'use strict';
  var BF = window.BotFace;
  var I = window.BotI18n;
  var EX = window.BotExport;
  var qs = new URLSearchParams(location.search);
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = mq.matches || qs.get('reduced') === '1';
  var ZOOM = 0.9;
  var DPR = Math.min(window.devicePixelRatio || 1, 3);
  var $ = function (id) { return document.getElementById(id); };
  var STEP = 2.4;
  var VIEWS = ['expressions', 'status', 'settings'];

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* file:// */ } }
  function tr(key, vars) { return I ? I.t(key, vars) : key; }
  function labelOf(name) { return I ? I.expr(name) : BF.EXPRESSIONS[name].label; }

  var motion = lsGet('botface.motion', 'animated') === 'static' ? 'static' : 'animated';
  var bgMode = lsGet('botface.bg', 'dark') === 'light' ? 'light' : 'dark';
  var follow = lsGet('botface.gaze', 'follow') !== 'straight';

  var main = new BF.Avatar({ reduced: reduced, expression: 'neutral' });
  var thumbs = [];
  var mainCanvas = $('main'), mctx = mainCanvas.getContext('2d');
  var order = BF.EXPRESSION_ORDER.slice();
  var selected = null;
  var view = 'status';

  function animated() { return motion === 'animated' && !reduced; }
  function drawBg() { return bgMode === 'light' ? 'none' : 'dark'; }

  function fitMain() {
    var px = Math.round(mainCanvas.getBoundingClientRect().width * DPR);
    if (px > 0 && mainCanvas.width !== px) { mainCanvas.width = px; mainCanvas.height = px; }
  }
  function renderHead(av, ctx, W, o) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    if (o.pad) { ctx.fillStyle = o.pad; ctx.fillRect(0, 0, W, W); }
    ctx.imageSmoothingEnabled = true;
    if (o.hq) ctx.imageSmoothingQuality = 'high';
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    av.draw(ctx, W, W, { view: BF.headView(ZOOM), bg: o.bg || drawBg(), lightColor: '#efe9e1', still: o.still, px: o.px });
    ctx.restore();
  }

  var picker = $('picker');
  var wall = $('wall');
  order.forEach(function (name) {
    var e = BF.EXPRESSIONS[name];
    var chip = document.createElement('button');
    chip.className = 'chip'; chip.type = 'button'; chip.dataset.expr = name;
    chip.setAttribute('aria-pressed', 'false');
    var c = document.createElement('canvas'); c.width = c.height = Math.round(52 * DPR);
    var label = document.createElement('span'); label.dataset.expr = name; label.textContent = labelOf(name);
    var dur = document.createElement('i'); dur.className = 'dur'; dur.textContent = STEP.toFixed(1) + 's';
    var slot = document.createElement('div'); slot.className = 'chip-slot'; slot.setAttribute('role', 'listitem');
    chip.appendChild(c); chip.appendChild(label); slot.appendChild(chip); slot.appendChild(dur); picker.appendChild(slot);
    var av = new BF.Avatar({ reduced: reduced, expression: name, follow: false, idle: false, blink: false });
    thumbs.push({ av: av, canvas: c, ctx: c.getContext('2d') });
    chip.addEventListener('click', function () { pick(name); });

    var card = document.createElement('button');
    card.className = 'wall-card'; card.type = 'button'; card.dataset.expr = name;
    card.setAttribute('aria-pressed', 'false');
    var wc = document.createElement('canvas'); wc.width = wc.height = Math.round(160 * DPR);
    var wl = document.createElement('span'); wl.textContent = e.label;
    card.appendChild(wc); card.appendChild(wl); wall.appendChild(card);
    var wav = new BF.Avatar({ reduced: reduced, expression: name, follow: false, idle: true, blink: false });
    thumbs.push({ av: wav, canvas: wc, ctx: wc.getContext('2d'), wall: true, px: 160 });
    card.addEventListener('click', function () { pick(name); });
  });

  function relabel() {
    Array.prototype.forEach.call(picker.querySelectorAll('span[data-expr]'), function (el) {
      el.textContent = labelOf(el.dataset.expr);
    });
    syncExportLabel();
  }
  if (I) I.onChange(relabel);

  function highlight(name) {
    Array.prototype.forEach.call(picker.querySelectorAll('.chip'), function (ch) {
      var on = !!name && ch.dataset.expr === name;
      ch.classList.toggle('active', on);
      ch.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(wall.querySelectorAll('.wall-card'), function (ch) {
      var on = !!name && ch.dataset.expr === name;
      ch.classList.toggle('active', on);
      ch.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  var playing = false, t = 0, idx = -1;
  function setPlaying(on) {
    playing = on;
    var b = $('btnPlay');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? 'Pause' : 'Play all expressions');
    picker.classList.toggle('is-playing', on);
  }
  function show(name) { main.setExpression(name); }
  function pick(name) {
    setPlaying(false);
    t = 0; idx = -1;
    selected = name;
    show(name);
    highlight(name);
  }
  function tickPlay(dt) {
    if (!playing) return;
    var total = order.length * STEP;
    t += dt;
    if (t >= total) {
      t = 0; idx = -1;
      setPlaying(false);
      selected = order[order.length - 1];
      show(selected);
      highlight(selected);
      return;
    }
    var i = Math.min(order.length - 1, Math.floor(t / STEP));
    if (i !== idx) { idx = i; selected = order[i]; show(selected); highlight(selected); }
  }
  $('btnPlay').addEventListener('click', function () {
    if (playing) { setPlaying(false); return; }
    if (idx < 0) { t = 0; selected = order[0]; show(selected); highlight(selected); idx = 0; }
    setPlaying(true);
  });

  function readView() {
    var h = new URLSearchParams((location.hash || '').replace(/^#/, '')).get('view');
    if (h === 'demo') h = 'status';
    if (VIEWS.indexOf(h) >= 0) return h;
    var stored = lsGet('botface.view', 'status');
    if (stored === 'demo') stored = 'status';
    return VIEWS.indexOf(stored) >= 0 ? stored : 'status';
  }
  function syncExportLabel() {
    var el = $('exportLabel');
    el.setAttribute('data-i18n', 'export.asPng');
    el.textContent = tr('export.asPng');
  }
  function setView(v, writeHash) {
    if (v === 'demo') v = 'status';
    if (VIEWS.indexOf(v) < 0) v = 'status';
    view = v;
    document.body.dataset.view = v;
    $('stageWrap').hidden = v !== 'status';
    $('exprDock').hidden = v !== 'status';
    $('settingsView').hidden = v !== 'settings';
    $('export').hidden = v === 'settings';
    Array.prototype.forEach.call($('tabs').querySelectorAll('[role="tab"]'), function (b) {
      var on = b.dataset.view === v;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (v !== 'status') setPlaying(false);
    if (v === 'expressions') {
      Array.prototype.forEach.call($('wall').querySelectorAll('canvas'), function (c) {
        var w = c.width, h = c.height;
        if (w && h) { c.width = w; c.height = h; }
      });
    }
    lsSet('botface.view', v);
    if (writeHash) history.replaceState(null, '', '#view=' + v);
    syncExportLabel();
    fitRow();
  }
  $('tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-view]');
    if (b) setView(b.dataset.view, true);
  });

  function mark(group, attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll(group), function (b) {
      b.setAttribute('aria-checked', b.getAttribute(attr) === value ? 'true' : 'false');
    });
  }
  function applyPrefs() {
    document.documentElement.classList.toggle('theme-light', bgMode === 'light');
    document.documentElement.classList.toggle('theme-dark', bgMode !== 'light');
    main.follow = follow && animated();
    main.idle = animated();
    main.blinkOn = animated();
    if (!animated()) main.blink = 0;
    if (!follow) main.setPointer(0, 0, false);
    mark('[data-motion]', 'data-motion', motion);
    mark('[data-bg]', 'data-bg', bgMode);
    mark('[data-follow]', 'data-follow', follow ? '1' : '0');
    if (I) mark('[data-lang]', 'data-lang', I.lang);
    $('rmHint').hidden = !reduced;
  }
  document.querySelector('.settings-view').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.lang) { I.set(b.dataset.lang, true); applyPrefs(); return; }
    if (b.dataset.motion) { motion = b.dataset.motion; lsSet('botface.motion', motion); applyPrefs(); return; }
    if (b.dataset.bg) { bgMode = b.dataset.bg; lsSet('botface.bg', bgMode); applyPrefs(); return; }
    if (b.dataset.follow) { follow = b.dataset.follow === '1'; lsSet('botface.gaze', follow ? 'follow' : 'straight'); applyPrefs(); }
  });

  window.addEventListener('pointermove', function (ev) {
    if (!follow || !animated()) return;
    var r = mainCanvas.getBoundingClientRect(), v = BF.headView(ZOOM);
    var cx = r.left + r.width * (455 - v.x) / v.w, cy = r.top + r.height * (560 - v.y) / v.h;
    main.setPointer((ev.clientX - cx) / (r.width * 0.6), (ev.clientY - cy) / (r.height * 0.6), true);
  });
  document.addEventListener('pointerleave', function () { main.setPointer(0, 0, false); });
  window.addEventListener('blur', function () { main.setPointer(0, 0, false); });

  function fitRow() {
    var row = $('picker');
    if (!row.parentElement) return;
    row.parentElement.classList.toggle('is-overflow', row.scrollWidth > row.clientWidth + 1);
  }
  window.addEventListener('resize', fitRow);

  /* ---------- export */
  var noteTimer = 0;
  function note(msg) {
    var n = $('exportNote');
    n.hidden = !msg;
    n.textContent = msg || '';
    clearTimeout(noteTimer);
    if (msg) noteTimer = setTimeout(function () { n.hidden = true; }, 2400);
  }
  function closeMenu() {
    $('exportMenu').hidden = true;
    $('btnExportMenu').setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    $('exportMenu').hidden = false;
    $('btnExportMenu').setAttribute('aria-expanded', 'true');
  }
  $('btnExportMenu').addEventListener('click', function (ev) {
    ev.stopPropagation();
    if ($('exportMenu').hidden) openMenu(); else closeMenu();
  });
  document.addEventListener('click', function (ev) {
    if (!$('export').contains(ev.target)) closeMenu();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeMenu(); });

  function fresh(name, still) {
    var av = new BF.Avatar({
      expression: name, reduced: reduced || still, follow: false,
      idle: !still && animated(), blink: false
    });
    av.snap();
    av.t = 0;
    return av;
  }
  function paint(av, size, still) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    var pad = (bgMode === 'dark' && still) ? '#070708' : (bgMode === 'dark' ? '#070708' : '');
    renderHead(av, ctx, size, { still: still, px: size, hq: true, bg: drawBg(), pad: pad });
    return c;
  }
  function framesOf(av, size, seconds, fps) {
    var n = Math.max(1, Math.round(seconds * fps));
    var dt = 1 / fps;
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = paint(av, size, !animated());
      out.push(c.getContext('2d').getImageData(0, 0, size, size));
      if (animated()) av.update(dt);
    }
    return out;
  }
  function dataUrl(canvas) { return canvas.toDataURL('image/png'); }
  function busy(on) { $('export').classList.toggle('is-busy', on); }
  function exportName() { return selected || 'neutral'; }

  function runExport(kind) {
    closeMenu();
    var name = exportName();
    busy(true);
    var css = mainCanvas.getBoundingClientRect().width || 540;
    var size = Math.min(1080, Math.max(640, Math.round(css * 2)));
    var animSize = Math.min(720, size);
    var file = 'bot-' + name;
    function done() { busy(false); }
    function fail() { busy(false); note(tr('export.failed')); }
    try {
      if (kind === 'png' || kind === 'copy-png') {
        var canvas = paint(fresh(name, true), size, true);
        EX.pngBlob(canvas).then(function (blob) {
          if (kind === 'png') { EX.download(blob, file + '.png'); done(); return; }
          EX.copyPng(blob).then(function () { note(tr('export.copiedImage')); done(); }, function () {
            EX.download(blob, file + '.png'); note(tr('export.clipboardPng')); done();
          });
        }, fail);
        return;
      }
      if (kind === 'svg' || kind === 'copy-svg') {
        var shot = paint(fresh(name, true), size, true);
        var svg = EX.svgStill(dataUrl(shot), shot.width, shot.height);
        if (kind === 'svg') { EX.download(EX.svgBlob(svg), file + '.svg'); done(); return; }
        EX.copyText(svg).then(function () { note(tr('export.copiedSvg')); done(); }, function () {
          EX.download(EX.svgBlob(svg), file + '.svg'); note(tr('export.clipboardSvg')); done();
        });
        return;
      }
      if (kind === 'gif') {
        note(tr('export.encodingGif'));
        var frames = framesOf(fresh(name, !animated()), animSize, animated() ? STEP : 0.1, 10);
        EX.gif(frames, 100, bgMode === 'light').then(function (blob) {
          EX.download(blob, file + '.gif'); note(''); done();
        }, fail);
        return;
      }
      if (kind === 'svg-anim') {
        note(tr('export.buildingSvg'));
        var count = animated() ? 12 : 1;
        var urls = [];
        var av = fresh(name, !animated());
        for (var i = 0; i < count; i++) {
          urls.push(dataUrl(paint(av, 480, !animated())));
          if (animated()) av.update(STEP / count);
        }
        var anim = EX.svgAnimated(urls, 480, 480, 200);
        EX.download(EX.svgBlob(anim), file + '.svg');
        note(''); done();
        return;
      }
      done();
    } catch (e) { fail(); }
  }
  $('btnExport').addEventListener('click', function () { runExport('png'); });
  $('exportMenu').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-export]');
    if (b) runExport(b.dataset.export);
  });

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    fitMain();
    tickPlay(dt);
    if (animated()) main.update(dt);
    renderHead(main, mctx, mainCanvas.width, { still: !animated(), px: mainCanvas.width / DPR, hq: true });
    thumbs.forEach(function (th) {
      if (th.wall) {
        th.av.idle = animated();
        th.av.reduced = !animated();
        th.av.blinkOn = animated();
        if (animated()) th.av.update(dt);
        renderHead(th.av, th.ctx, th.canvas.width, { still: !animated(), px: th.px || 160, hq: true, bg: drawBg(), pad: '' });
        return;
      }
      renderHead(th.av, th.ctx, th.canvas.width, { still: true, px: 52, hq: true, bg: 'dark', pad: '' });
    });
    requestAnimationFrame(frame);
  }

  applyPrefs();
  setView(readView(), false);
  BF.loadAssets(function () {
    main.setExpression('neutral', true);
    thumbs.forEach(function (th) { th.av.snap(); });
    highlight(null);
    fitRow();
    relabel();
    requestAnimationFrame(frame);
    document.documentElement.dataset.ready = '1';
  });
})();
