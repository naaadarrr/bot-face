/*
 * bot-face.js — live-drawn face features for Shawn's avatar.
 * Classic script (no modules) so it works from file://.
 * Exposes window.BotFace = { Avatar, EXPRESSIONS, EXPRESSION_ORDER, loadAssets, VIEWS }.
 * All geometry is in the 1024×1024 space of the base art.
 */
(function () {
  'use strict';

  var DEG = Math.PI / 180;

  // ---------------------------------------------------------------- geometry
  // Measured from the original art (capsule / ellipse least-squares fits at 2048px, halved).
  var GEO = {
    size: 1024,
    faceTilt: 19.11 * DEG,
    origin: { x: 475.16, y: 546.52 },            // midpoint between eyes
    eyes: {
      L: { x: 365.45, y: 508.50, w: 65.65, h: 165.66, tilt: 17.86 * DEG, side: -1 },
      R: { x: 584.88, y: 584.53, w: 59.38, h: 162.52, tilt: 19.05 * DEG, side: 1 }
    },
    blush: {
      L: { x: 270.44, y: 588.62, rx: 32.83, ry: 19.47, ang: 19.26 * DEG },
      R: { x: 607.90, y: 700.69, rx: 28.65, ry: 17.94, ang: 18.35 * DEG }
    },
    eyeColor: [26, 26, 27],
    blushColor: [251, 185, 164],
    mouth: { u: -2, v: 120, w: 38 },
    neckPivot: { x: 470, y: 1010 }
  };
  var COS_F = Math.cos(GEO.faceTilt), SIN_F = Math.sin(GEO.faceTilt);
  // face frame -> image delta
  function fdx(u, v) { return u * COS_F - v * SIN_F; }
  function fdy(u, v) { return u * SIN_F + v * COS_F; }

  // Head framing for circular avatars. zoom 1 = whole hair silhouette (crown + side layers)
  // plus a bit of neck/collar; larger zoom moves in toward the face.
  var HEAD = { cx: 420, cy: 478, size: 920 }, FACE_C = { x: 455, y: 560 };
  function headView(zoom) {
    var z = clamp(+zoom || 1, 0.7, 2);
    var size = HEAD.size / z, k = clamp((z - 1) / 0.8, 0, 1);
    var cx = mix(HEAD.cx, FACE_C.x, k), cy = mix(HEAD.cy, FACE_C.y, k);
    return { x: cx - size / 2, y: cy - size / 2, w: size, h: size, circle: true };
  }
  var DEFAULT_ZOOM = 0.9;
  var VIEWS = {
    full: { x: 0, y: 0, w: 1024, h: 1024 },
    face: null   // filled below (needs clamp/mix)
  };

  // ---------------------------------------------------------------- params
  // Per-eye parameters (relative to the measured base eye).
  var EYE_DEFAULT = {
    sx: 1, sy: 1,        // width / height multipliers
    round: 1,            // corner radius factor (1 = full capsule)
    dx: 0, dy: 0,        // offset in face frame (px @1024)
    rot: 0,              // extra tilt (deg)
    close: 0,            // 0 open … 1 closed line
    bend: 0,             // arch of closed line (+ = ^, - = ∪), fraction of width
    lidT: 0, lidTs: 0,   // top lid cut (fraction of height) and slant (deg, + = inner corner lower)
    lidB: 0, lidBc: 0,   // bottom lid cut (fraction) and upward curve (fraction of height)
    heart: 0             // morph to heart shape
  };
  var GLOBAL_DEFAULT = {
    gx: 0, gy: 0,                   // expression gaze (face frame px)
    headTilt: 0,                    // deg
    headDy: 0,                      // px
    blushA: 1, blushS: 1, blushPulse: 0, blushLines: 0,
    mouthA: 0, mW: 1, mOpen: 0, mCurve: 0, mRound: 0, mWave: 0, mX: 0, mTilt: 0, mY: 0,
    browA: 0, browY: 0, browAng: 0, browCurve: 0,
    fxZ: 0, fxThink: 0, fxQ: 0, fxSweat: 0, fxAnger: 0, fxHearts: 0, fxWork: 0, fxBang: 0,
    saccade: 0,                     // reading micro-saccades (working)
    bobRate: 1, bobAmp: 1
  };

  function eye(o) { var r = {}; for (var k in EYE_DEFAULT) r[k] = (o && k in o) ? o[k] : EYE_DEFAULT[k]; return r; }

  // ---------------------------------------------------------------- expressions
  // Each: { label, L:{eye}, R:{eye}, g:{global} }. Omitted values = defaults.
  var EXPRESSIONS = {
    neutral:   { label: 'Neutral', L: {}, R: {}, g: {} },
    happy:     { label: 'Happy', L: { close: 1, bend: 0.46, sx: 1.32, dy: 2 }, R: { close: 1, bend: 0.46, sx: 1.32, dy: 2 },
                 g: { mouthA: 1, mW: 0.9, mCurve: 1, mOpen: 0.18, blushS: 1.08, headTilt: -1 } },
    laugh:     { label: 'Laugh', L: { close: 1, bend: 0.55, sx: 1.4, dy: 0 }, R: { close: 1, bend: 0.55, sx: 1.4, dy: 0 },
                 g: { mouthA: 1, mW: 1.25, mCurve: 0.7, mOpen: 0.95, mRound: 0, blushS: 1.15, bobRate: 2.6, bobAmp: 1.6, headTilt: -1.5 } },
    smile:     { label: 'Smile', L: { close: 0.25, bend: 0.8, sx: 1.05, dy: -3 }, R: { close: 0.25, bend: 0.8, sx: 1.05, dy: -3 },
                 g: { mouthA: 1, mW: 0.8, mCurve: 0.85, blushS: 1.05 } },
    surprised: { label: 'Surprised', L: { sx: 1.38, sy: 0.94, dy: -8 }, R: { sx: 1.38, sy: 0.94, dy: -8 },
                 g: { mouthA: 1, mW: 0.5, mOpen: 0.62, mRound: 1, mY: 6, browA: 1, browY: 12, headDy: -3, fxBang: 1 } },
    sad:       { label: 'Sad', L: { lidT: 0.3, lidTs: -24, sy: 0.9, dy: 8 }, R: { lidT: 0.3, lidTs: -24, sy: 0.9, dy: 8 },
                 g: { mouthA: 1, mW: 0.7, mCurve: -0.9, gy: 5, browA: 1, browAng: 16, browY: 2, headDy: 3, headTilt: 1.5, blushA: 0.85 } },
    worried:   { label: 'Worried', L: { lidT: 0.14, lidTs: -20, sx: 0.96 }, R: { lidT: 0.14, lidTs: -20, sx: 0.96 },
                 g: { mouthA: 1, mW: 0.75, mCurve: -0.35, mWave: 1, mOpen: 0.08, browA: 1, browAng: 20, browY: 6, fxSweat: 1 } },
    angry:     { label: 'Determined', L: { lidT: 0.34, lidTs: 30, sy: 0.94 }, R: { lidT: 0.34, lidTs: 30, sy: 0.94 },
                 g: { mouthA: 1, mW: 0.65, mCurve: -0.45, browA: 1, browAng: -22, browY: -6, fxAnger: 1, blushA: 0.8 } },
    shy:       { label: 'Shy', L: { lidT: 0.22, sy: 0.9, dx: -12, dy: 12 }, R: { lidT: 0.22, sy: 0.9, dx: -12, dy: 12 },
                 g: { mouthA: 1, mW: 0.55, mCurve: 0.35, mWave: 0.8, mX: -6, blushS: 1.45, blushPulse: 1, blushLines: 1, headTilt: 2.2, headDy: 2 } },
    wink:      { label: 'Wink', L: { sx: 1.04, dy: -2 }, R: { close: 1, bend: 0.46, sx: 1.3, dy: 2 },
                 g: { mouthA: 1, mW: 0.85, mCurve: 1, mOpen: 0.3, blushS: 1.08, headTilt: -2 } },
    sleepy:    { label: 'Sleepy', L: { close: 1, bend: -0.24, sx: 1.18, dy: 12 }, R: { close: 1, bend: -0.24, sx: 1.18, dy: 12 },
                 g: { mouthA: 1, mW: 0.35, mOpen: 0.16, mRound: 1, fxZ: 1, headTilt: 3, headDy: 4, bobRate: 0.55, bobAmp: 1.8, blushA: 0.9 } },
    thinking:  { label: 'Thinking', L: { sy: 0.96, lidT: 0.08 }, R: { sy: 0.96, lidT: 0.08 },
                 g: { gx: 15, gy: -14, mouthA: 1, mW: 0.42, mCurve: -0.15, mX: 10, mTilt: -8, fxThink: 1, headTilt: -2.5, browA: 1, browAng: 6, browY: 4 } },
    love:      { label: 'Love', L: { heart: 1, sx: 1.55, sy: 0.64, dy: 2 }, R: { heart: 1, sx: 1.55, sy: 0.64, dy: 2 },
                 g: { mouthA: 1, mW: 0.8, mCurve: 1, mOpen: 0.3, blushS: 1.25, blushPulse: 1, fxHearts: 1 } },
    confused:  { label: 'Confused', L: { sx: 1.08, sy: 1.02, dy: -3 }, R: { sx: 0.8, sy: 0.55, lidT: 0.12, lidTs: 12, dy: 6 },
                 g: { mouthA: 1, mW: 0.55, mCurve: -0.25, mWave: 1, mX: 6, mTilt: 10, fxQ: 1, headTilt: -3.5, browA: 1, browAng: 0, browY: 0 } },
    working:   { label: 'Working', L: { lidT: 0.32, sy: 0.9, dy: 14 }, R: { lidT: 0.32, sy: 0.9, dy: 14 },
                 g: { gy: 4, saccade: 1, fxWork: 1, bobRate: 0.8, headTilt: 1 } },
    speaking:  { label: 'Speaking', L: {}, R: {}, g: { mouthA: 1, mOpen: 0.42, mRound: 0.35, mW: 0.8, mCurve: 0.2 }, speak: true }
  };
  var EXPRESSION_ORDER = ['neutral', 'happy', 'laugh', 'smile', 'surprised', 'sad', 'worried', 'angry',
    'shy', 'wink', 'sleepy', 'thinking', 'love', 'confused', 'working', 'speaking'];

  // Per-parameter spring tuning groups.
  var FAST = { mOpen: 1, mRound: 1, mW: 1, mCurve: 1 };

  VIEWS.face = headView(DEFAULT_ZOOM);

  // ---------------------------------------------------------------- assets
  var IMG = {};
  function loadAssets(cb) {
    var A = window.BOT_ASSETS, keys = ['base', 'cutout', 'bangs', 'original'], left = keys.length;
    keys.forEach(function (k) {
      var im = new Image();
      im.onload = function () { if (--left === 0) { buildBangs(); cb(IMG); } };
      im.onerror = function () { console.error('asset failed: ' + k); if (--left === 0) { buildBangs(); cb(IMG); } };
      im.src = A[k];
      IMG[k] = im;
    });
  }

  // Fringe overlay = the art's own pixels, masked to the hair that overlaps the forehead.
  // Built from the same decoded image that is drawn underneath, so it composites invisibly.
  function buildBangs() {
    var b = window.BOT_ASSETS.meta.bangs;
    ['base', 'cutout'].forEach(function (src) {
      var c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
      var x = c.getContext('2d');
      x.drawImage(IMG[src], b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(IMG.bangs, 0, 0, b.w, b.h);
      IMG['bangs_' + src] = c;
    });
  }

  // ---------------------------------------------------------------- shape helpers
  var N = 72;
  var HEART = (function () {
    // radial table of a heart, normalized to bbox [-1,1]², sampled by angle from bbox centre
    var pts = [], i, t, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (i = 0; i < 2400; i++) {
      t = i / 2400 * Math.PI * 2;
      var x = 16 * Math.pow(Math.sin(t), 3);
      var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x, y]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 + (maxY - minY) * 0.06, sx = (maxX - minX) / 2, sy = (maxY - minY) / 2;
    var bins = 720, tab = new Float32Array(bins);
    pts.forEach(function (p) {
      var nx = (p[0] - cx) / sx, ny = (p[1] - cy) / sy, a = Math.atan2(ny, nx), r = Math.sqrt(nx * nx + ny * ny);
      var b = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * bins) % bins;
      tab[b] = Math.max(tab[b], r);
    });
    for (i = 0; i < bins; i++) if (!tab[i]) tab[i] = (tab[(i + bins - 1) % bins] + tab[(i + 1) % bins]) / 2 || 0.5;
    return function (a) {
      var f = ((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * bins, i0 = Math.floor(f) % bins, i1 = (i0 + 1) % bins, k = f - Math.floor(f);
      return tab[i0] * (1 - k) + tab[i1] * k;
    };
  })();

  // distance from centre to rounded-rect boundary along unit ray (c,s)
  function rrRay(c, s, A, B, r) {
    var ac = Math.abs(c), as = Math.abs(s);
    var t = Math.min(ac > 1e-9 ? A / ac : 1e9, as > 1e-9 ? B / as : 1e9);
    var px = t * ac, py = t * as;
    if (px > A - r && py > B - r) {
      var cx = A - r, cy = B - r, b = ac * cx + as * cy, cc = cx * cx + cy * cy - r * r;
      t = b + Math.sqrt(Math.max(0, b * b - cc));
    }
    return t;
  }

  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------------------------------------------------------------- Avatar
  function Avatar(opts) {
    opts = opts || {};
    this.reduced = !!opts.reduced;
    this.follow = opts.follow !== false;
    this.blinkOn = opts.blink !== false;
    this.idle = opts.idle !== false;
    this.workStyle = 'pencil';   // the only working indicator
    this.expr = 'neutral';
    this.speaking = false;
    this.speakForced = false;
    this.t = Math.random() * 10;
    this.pointer = { x: 0, y: 0, active: false };
    this.state = {}; this.vel = {}; this.target = {};
    this._initParams();
    this.blink = 0; this._blinkPhase = -1; this._nextBlink = 1.5 + Math.random() * 3;
    this._sacc = 0; this._nextSacc = 0.5;
    this._syll = { t: 0, dur: 0.12, amp: 0, round: 0.4 };
    this.setExpression(opts.expression || 'neutral', true);
  }

  Avatar.prototype._keys = function () {
    var ks = [], k;
    for (k in EYE_DEFAULT) { ks.push('L.' + k); ks.push('R.' + k); }
    for (k in GLOBAL_DEFAULT) ks.push(k);
    ks.push('pgx', 'pgy', 'ptilt');
    return ks;
  };
  Avatar.prototype._initParams = function () {
    var self = this;
    this._keys().forEach(function (k) { self.state[k] = 0; self.vel[k] = 0; self.target[k] = 0; });
  };
  Avatar.prototype.setExpression = function (name, snap) {
    var e = EXPRESSIONS[name] || EXPRESSIONS.neutral, k;
    this.expr = EXPRESSIONS[name] ? name : 'neutral';
    var L = eye(e.L), R = eye(e.R);
    for (k in L) { this.target['L.' + k] = L[k]; this.target['R.' + k] = R[k]; }
    for (k in GLOBAL_DEFAULT) this.target[k] = (k in e.g) ? e.g[k] : GLOBAL_DEFAULT[k];
    this.speaking = !!e.speak || this.speakForced;
    if (snap) this.snap();
  };
  Avatar.prototype.setSpeaking = function (on) {
    this.speakForced = !!on;
    this.speaking = this.speakForced || !!(EXPRESSIONS[this.expr] || {}).speak;
  };
  Avatar.prototype.snap = function () {
    for (var k in this.target) { this.state[k] = this.target[k]; this.vel[k] = 0; }
  };
  Avatar.prototype.setPointer = function (nx, ny, active) {
    this.pointer.x = clamp(nx, -1.5, 1.5); this.pointer.y = clamp(ny, -1.5, 1.5); this.pointer.active = active;
  };

  Avatar.prototype.update = function (dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    var k, red = this.reduced;
    // pointer gaze
    var pAct = this.follow && this.pointer.active && !red;
    this.target.pgx = pAct ? this.pointer.x * 10 : 0;
    this.target.pgy = pAct ? this.pointer.y * 8 : 0;
    this.target.ptilt = pAct ? this.pointer.x * 0.9 : 0;

    // speaking: syllable generator drives mouth targets
    var e = EXPRESSIONS[this.expr] || EXPRESSIONS.neutral;
    if (this.speaking) {
      var s = this._syll; s.t += dt;
      if (s.t > s.dur) {
        s.t = 0; s.dur = 0.08 + Math.random() * 0.13;
        var pause = Math.random() < 0.12;
        s.amp = pause ? 0.02 : 0.25 + Math.random() * 0.55;
        s.round = Math.random() * 0.9;
        if (pause) s.dur += 0.15;
      }
      this.target.mouthA = 1;
      this.target.mOpen = s.amp * (red ? 0.6 : 1);
      this.target.mRound = s.round;
      this.target.mW = 0.62 + (1 - s.round) * 0.3;
      this.target.mCurve = Math.max(0.15, e.g.mCurve || 0);
    } else if (this._wasSpeaking) {
      this.setExpression(this.expr, false);
    }
    this._wasSpeaking = this.speaking;

    // working: reading saccades
    if (this.state.saccade > 0.05 && !red) {
      this._nextSacc -= dt;
      if (this._nextSacc <= 0) { this._sacc = this._sacc > 0 ? -7 : 7; this._nextSacc = 0.45 + Math.random() * 0.7; }
    } else this._sacc = 0;
    this._saccS = (this._saccS || 0) + (this._sacc * this.state.saccade - (this._saccS || 0)) * Math.min(1, dt * 22);

    // springs
    var stiff = red ? 420 : 210, zeta = red ? 1 : 0.72;
    for (k in this.target) {
      var st = stiff, z = zeta;
      if (FAST[k]) { st = red ? 700 : 620; z = red ? 1 : 0.8; }
      if (k.indexOf('fx') === 0) { st = 90; z = 1; }
      if (k === 'pgx' || k === 'pgy' || k === 'ptilt') { st = 60; z = 0.9; }
      var c = 2 * Math.sqrt(st) * z;
      var x = this.state[k], v = this.vel[k];
      var a = st * (this.target[k] - x) - c * v;
      v += a * dt; x += v * dt;
      this.state[k] = x; this.vel[k] = v;
    }

    // blink (≈ every 2.5–6 s, sometimes double)
    if (this.blinkOn) {
      if (this._blinkPhase < 0) {
        this._nextBlink -= dt;
        if (this._nextBlink <= 0) { this._blinkPhase = 0; }
      }
      if (this._blinkPhase >= 0) {
        this._blinkPhase += dt;
        var p = this._blinkPhase, dClose = 0.07, dHold = 0.04, dOpen = 0.12;
        if (p < dClose) this.blink = p / dClose;
        else if (p < dClose + dHold) this.blink = 1;
        else if (p < dClose + dHold + dOpen) this.blink = 1 - (p - dClose - dHold) / dOpen;
        else {
          this.blink = 0; this._blinkPhase = -1;
          this._nextBlink = Math.random() < 0.18 ? 0.18 : 2.5 + Math.random() * 3.5;
          if (this.expr === 'sleepy') this._nextBlink += 2;
        }
      }
    } else this.blink = 0;
  };

  // ------------------------------------------------------------ drawing
  // opts: { view: {x,y,w,h} | 'full'|'face'|'tight', bg: 'dark'|'light'|'none', px: output pixel size (for min stroke widths), still: bool }
  Avatar.prototype.draw = function (ctx, W, H, opts) {
    opts = opts || {};
    var view = typeof opts.view === 'string' ? VIEWS[opts.view] : (opts.view || VIEWS.full);
    if (typeof opts.view === 'number') view = headView(opts.view);
    var bg = opts.bg || 'dark';
    var S = this.state, t = opts.still ? 0 : this.t, red = this.reduced || opts.still;
    var scale = W / view.w;
    var minPx = 1 / scale;          // one output pixel in art units
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bg === 'dark') { ctx.fillStyle = 'rgb(24,25,26)'; ctx.fillRect(0, 0, W, H); }
    else if (bg === 'light') { ctx.fillStyle = opts.lightColor || '#efe9e1'; ctx.fillRect(0, 0, W, H); }
    ctx.scale(scale, W / view.w);
    ctx.translate(-view.x, -view.y);

    // ---- head motion (whole art): bob + tiny tilt around the neck
    var bob = 0, tilt = 0;
    if (!red && this.idle) {
      bob = Math.sin(t * Math.PI * 2 / 3.4 * S.bobRate) * 1.6 * S.bobAmp;
      if (S.saccade > 0.3) bob += Math.max(0, Math.sin(t * 17)) * 0.7 * S.saccade; // typing nod
      tilt = Math.sin(t * Math.PI * 2 / 7.3) * 0.45;
    }
    tilt += S.headTilt * (this.reduced ? 0.5 : 1) + S.ptilt;
    var over = (bob !== 0 || tilt !== 0 || S.headDy !== 0) ? 1.02 : 1;  // overscan hides image edges
    var P = GEO.neckPivot;
    ctx.translate(P.x, P.y + bob + S.headDy);
    ctx.rotate(tilt * DEG);
    ctx.scale(over, over);
    ctx.translate(-P.x, -P.y);

    var art = bg === 'dark' ? IMG.base : IMG.cutout;
    if (art && art.complete) {
      ctx.drawImage(art, 0, 0, 1024, 1024);
      if (over !== 1) {   // smear the cropped jacket edges outward so head tilt never reveals a gap
        ctx.drawImage(art, 0, 1021, 1024, 3, 0, 1023.5, 1024, 90);
        ctx.drawImage(art, 0, 700, 3, 324, -90, 700, 90.5, 324);
        ctx.drawImage(art, 0, 1021, 3, 3, -90, 1023.5, 90.5, 90);
      }
    }

    // ---- features
    this._drawBlush(ctx, S, t, minPx);
    this._drawMouth(ctx, S, t, minPx);
    this._drawEyes(ctx, S, t, minPx);
    this._drawBrows(ctx, S, minPx);
    // bangs overlay: hair over forehead so brows / raised eyes tuck under the fringe
    var bangsC = IMG[bg === 'dark' ? 'bangs_base' : 'bangs_cutout'];
    if (bangsC) {
      var b = window.BOT_ASSETS.meta.bangs;
      ctx.drawImage(bangsC, b.x, b.y, b.w, b.h);
    }
    this._drawSweat(ctx, S, t, minPx, opts);
    // Floating symbols: designed for the dark space right of the head in the full view.
    // In circular head crops each group is pulled toward the centre just enough to stay inside
    // the circle, and enlarged at tiny sizes.
    var cssPx = opts.px || W;
    this._fxc = {
      full: view === VIEWS.full || !view.circle,
      cx: view.x + view.w / 2, cy: view.y + view.h / 2, r: view.w / 2,
      s: view.circle ? (cssPx < 40 ? 1.8 : cssPx < 70 ? 1.65 : cssPx < 140 ? 1.25 : 1) : 1
    };
    this._drawFx(ctx, S, t, minPx, opts);
    ctx.restore();
  };

  // translate/scale so an effect group anchored at (ax,ay) with radius ext stays inside the crop
  Avatar.prototype._place = function (ctx, ax, ay, ext) {
    var f = this._fxc;
    if (!f || f.full) return;
    var dx = ax - f.cx, dy = ay - f.cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var maxD = Math.max(0, f.r * 0.94 - ext * f.s), k = d > maxD ? maxD / d : 1;
    ctx.translate(f.cx + dx * k, f.cy + dy * k);
    ctx.scale(f.s, f.s);
    ctx.translate(-ax, -ay);
  };

  Avatar.prototype._drawBlush = function (ctx, S, t, minPx) {
    var a = clamp(S.blushA, 0, 1.4), s = Math.max(0, S.blushS);
    if (a < 0.01 || s < 0.01) return;
    var pulse = 1 + (this.reduced ? 0 : Math.sin(t * 3.2) * 0.07 * S.blushPulse);
    var col = GEO.blushColor, deep = [247, 160, 150];
    var k = clamp((s - 1) * 1.5, 0, 1);         // bigger blush also gets a touch deeper
    var c = [Math.round(mix(col[0], deep[0], k)), Math.round(mix(col[1], deep[1], k)), Math.round(mix(col[2], deep[2], k))];
    ['L', 'R'].forEach(function (side) {
      var b = GEO.blush[side];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      ctx.fillStyle = rgba(c, clamp(a, 0, 1));
      ctx.beginPath();
      ctx.ellipse(0, 0, b.rx * s * pulse * (1 + (s - 1) * 0.25), b.ry * s * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      if (S.blushLines > 0.02) {
        ctx.strokeStyle = rgba([226, 118, 112], clamp(S.blushLines, 0, 1) * 0.85);
        ctx.lineWidth = Math.max(3.2, minPx * 1.1); ctx.lineCap = 'round';
        for (var i = -1; i <= 1; i++) {
          var x = i * b.rx * 0.5 * s;
          ctx.beginPath(); ctx.moveTo(x + 5, -b.ry * 0.45 * s); ctx.lineTo(x - 5, b.ry * 0.45 * s); ctx.stroke();
        }
      }
      ctx.restore();
    });
  };

  Avatar.prototype._eyePoints = function (S, side, minPx, blink) {
    var g = GEO.eyes[side], p = function (k) { return S[side + '.' + k]; };
    var w = g.w * Math.max(0.05, p('sx')), h = g.h * Math.max(0.05, p('sy'));
    var close = clamp(1 - (1 - clamp(p('close'), 0, 1)) * (1 - blink), 0, 1);
    var thick = Math.max(20, minPx * 1.7);
    var hEff = thick + Math.max(0, h - thick) * (1 - close);
    var A = w / 2, B = hEff / 2, rr = Math.min(A, B) * clamp(p('round'), 0, 1);
    var heart = clamp(p('heart'), 0, 1);
    var hh = heart > 0 ? { A: A, B: Math.max(B, thick / 2) } : null;
    var bend = p('bend') * w * close; // bend only matters as eye closes
    var pts = [];
    for (var i = 0; i < N; i++) {
      var th = -Math.PI / 2 + i / N * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      var r = rrRay(c, s, A, B, rr), x = c * r, y = s * r;
      if (heart > 0) {
        var rh = HEART(th);
        x = mix(x, c * rh * hh.A, heart); y = mix(y, s * rh * hh.B, heart);
      }
      var u = clamp(x / A, -1, 1);
      y -= bend * (1 - u * u);
      pts.push(x, y);
    }
    return { pts: pts, w: w, h: hEff, A: A, B: B, close: close };
  };

  Avatar.prototype._drawEyes = function (ctx, S, t, minPx) {
    var self = this;
    var blink = this.blink;
    var gx = S.gx + S.pgx + this._saccOffset(t), gy = S.gy + S.pgy;
    ['L', 'R'].forEach(function (side) {
      var g = GEO.eyes[side], p = function (k) { return S[side + '.' + k]; };
      var E = self._eyePoints(S, side, minPx, blink);
      var u = p('dx') + gx, v = p('dy') + gy;
      ctx.save();
      ctx.translate(g.x + fdx(u, v), g.y + fdy(u, v));
      ctx.rotate(g.tilt + p('rot') * DEG);
      // lids (clip). inner corner direction: L eye inner = +x, R eye inner = -x
      var inner = side === 'L' ? 1 : -1;
      var open = 1 - E.close;
      var lidT = clamp(p('lidT'), 0, 1) * open, lidB = clamp(p('lidB'), 0, 1) * open, lidBc = p('lidBc') * open;
      if (lidT > 0.001 || lidB > 0.001 || Math.abs(lidBc) > 0.001) {
        var X = E.A + 30, slope = Math.tan(p('lidTs') * DEG) * inner;
        var yT = -E.B + lidT * E.h;
        var yB = E.B - lidB * E.h;
        ctx.beginPath();
        ctx.moveTo(-X, yT - slope * X);
        ctx.lineTo(X, yT + slope * X);
        for (var i = 0; i <= 16; i++) {
          var x = X - i / 16 * 2 * X, uu = clamp(x / E.A, -1, 1);
          ctx.lineTo(x, yB - lidBc * E.h * (1 - uu * uu));
        }
        ctx.closePath();
        ctx.clip();
      }
      ctx.fillStyle = rgba(GEO.eyeColor, 1);
      ctx.beginPath();
      var P = E.pts;
      ctx.moveTo(P[0], P[1]);
      for (var j = 2; j < P.length; j += 2) ctx.lineTo(P[j], P[j + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  };

  Avatar.prototype._saccOffset = function () { return this._saccS || 0; };

  Avatar.prototype._drawBrows = function (ctx, S, minPx) {
    var a = clamp(S.browA, 0, 1);
    if (a < 0.01) return;
    var gx = S.gx * 0.3 + S.pgx * 0.3, gy = S.gy * 0.3 + S.pgy * 0.3;
    ['L', 'R'].forEach(function (side) {
      var g = GEO.eyes[side], inner = side === 'L' ? 1 : -1;
      var h = g.h * S[side + '.sy'];
      var u = S[side + '.dx'] * 0.5 + gx, v = S[side + '.dy'] * 0.5 + gy;
      ctx.save();
      ctx.translate(g.x + fdx(u, v), g.y + fdy(u, v));
      ctx.rotate(GEO.faceTilt);
      ctx.translate(inner * 4, -h / 2 - 26 - S.browY);
      if (inner < 0) ctx.scale(-1, 1);      // mirror so +x is always the inner end
      ctx.rotate(-S.browAng * DEG);
      var L = g.w * 0.92, th = Math.max(9, minPx * 1.3);
      ctx.fillStyle = rgba([48, 34, 28], a);
      ctx.beginPath();
      // tapered stroke: thicker at inner end
      var x0 = -L / 2, x1 = L / 2, cy = -S.browCurve * 6 - 3;
      ctx.moveTo(x0, 0);
      ctx.quadraticCurveTo(0, cy - th * 0.6, x1, -th * 0.2);
      ctx.quadraticCurveTo(x1 + 3, th * 0.3, x1 - 2, th * 0.5);
      ctx.quadraticCurveTo(0, cy + th * 0.7, x0, th * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  };

  Avatar.prototype._drawMouth = function (ctx, S, t, minPx) {
    var a = clamp(S.mouthA, 0, 1);
    if (a < 0.02) return;
    var M = GEO.mouth;
    var u = M.u + S.mX, v = M.v + S.mY;
    var w = M.w * Math.max(0.1, S.mW);
    var open = Math.max(0, S.mOpen) * 34;
    var cT = S.mCurve * 7 * (1 - clamp(open / 30, 0, 1) * 0.5);     // smile: centre lower than corners
    var rnd = clamp(S.mRound, 0, 1), wave = S.mWave;
    var n = 22, top = [], bot = [], i;
    for (i = 0; i <= n; i++) {
      var x = -w / 2 + i / n * w, q = (2 * x / w), sq = Math.sqrt(Math.max(0, 1 - q * q));
      var wv = wave * 2.4 * Math.sin(q * Math.PI * 1.5);
      // D-shape (laugh / talk) vs ellipse ("o")
      var tD = cT * (1 - q * q), bD = cT * (1 - q * q) + open * Math.pow(sq, 0.8);
      var tO = open / 2 - open / 2 * sq, bO = open / 2 + open / 2 * sq;
      top.push([x, mix(tD, tO, rnd) + wv]);
      bot.push([x, mix(bD, bO, rnd) + wv]);
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(GEO.origin.x + fdx(u, v), GEO.origin.y + fdy(u, v));
    ctx.rotate(GEO.faceTilt + S.mTilt * DEG);
    var ink = [52, 26, 28];
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (i = 1; i <= n; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (i = n; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fillStyle = rgba(ink, 1);
    ctx.strokeStyle = rgba(ink, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(5.4, minPx * 1.3);
    ctx.fill();
    ctx.stroke();
    if (open > 9 && rnd < 0.6) {           // tongue
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgba([232, 116, 122], 1 - rnd);
      ctx.beginPath();
      ctx.ellipse(0, cT + open * 0.98, w * 0.3, open * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  // ---- effects (sticker style: dark ink with white rim so they read on any background)
  function inkStroke(ctx, drawPath, lw, ink, rim) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rim || '#fffaf3'; ctx.lineWidth = lw + 7; drawPath(); ctx.stroke();
    ctx.strokeStyle = ink || '#1a1a1b'; ctx.lineWidth = lw; drawPath(); ctx.stroke();
  }

  Avatar.prototype._drawSweat = function (ctx, S, t, minPx, opts) {
    var red = this.reduced || opts.still;
    var tt = red ? 0.6 : t;
    // sweat drop
    if (S.fxSweat > 0.02) {
      ctx.save();
      var sy = red ? 0 : (tt * 0.5 % 1) * 10;
      ctx.globalAlpha = clamp(S.fxSweat, 0, 1);
      ctx.translate(676, 452 + sy);
      ctx.rotate(0.35);
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.bezierCurveTo(8, -14, 18, 0, 18, 10); ctx.arc(0, 10, 18, 0, Math.PI, false); ctx.bezierCurveTo(-18, 0, -8, -14, 0, -30);
      ctx.fillStyle = '#9fd8f5'; ctx.strokeStyle = '#2a5d7a'; ctx.lineWidth = Math.max(3.5, minPx);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(-6, 10, 4, 7, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  Avatar.prototype._drawFx = function (ctx, S, t, minPx, opts) {
    var self = this;
    var red = this.reduced || opts.still;
    var tt = red ? 0.6 : t;
    var lw = Math.max(6, minPx * 1.4 / ((this._fxc && this._fxc.s) || 1));
    var INK = '#1a1a1b', RIM = '#fffaf3';
    function group(alpha, ax, ay, ext, fn) {
      if (alpha <= 0.02) return;
      ctx.save(); self._place(ctx, ax, ay, ext); ctx.globalAlpha = clamp(alpha, 0, 1); fn(); ctx.restore();
    }
    // zZ
    group(S.fxZ, 735, 305, 105, function () {
      for (var i = 0; i < 3; i++) {
        var ph = red ? [0.15, 0.5, 0.85][i] : ((tt * 0.35 + i / 3) % 1);
        var al = clamp(S.fxZ, 0, 1) * (red ? 1 : Math.sin(ph * Math.PI));
        if (al < 0.02) continue;
        var sz = 18 + ph * 26, x = 690 + ph * 80 + Math.sin(ph * 6 + i) * 6, y = 380 - ph * 150;
        ctx.globalAlpha = al;
        inkStroke(ctx, function () {
          ctx.beginPath();
          ctx.moveTo(x - sz / 2, y - sz / 2); ctx.lineTo(x + sz / 2, y - sz / 2);
          ctx.lineTo(x - sz / 2, y + sz / 2); ctx.lineTo(x + sz / 2, y + sz / 2);
        }, lw * 0.9);
      }
    });
    // thinking: white cloud with trailing circles and static dots
    group(S.fxThink, 712, 300, 100, function () {
      var bx = 728, by = 272 + (red ? 0 : Math.sin(tt * 1.6) * 3);
      var puffs = [[-44, 6, 24], [-20, -16, 28], [12, -20, 28], [42, -2, 26], [26, 22, 22], [-8, 22, 24], [-36, 22, 18]];
      var trail = [[664, 350, 12], [646, 380, 7.5]];
      ctx.lineWidth = lw * 0.85; ctx.strokeStyle = INK; ctx.fillStyle = RIM;
      trail.forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      puffs.forEach(function (p) { ctx.beginPath(); ctx.arc(bx + p[0], by + p[1], p[2], 0, Math.PI * 2); ctx.stroke(); });
      puffs.forEach(function (p) { ctx.beginPath(); ctx.arc(bx + p[0], by + p[1], p[2], 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = INK;
      for (var d = 0; d < 3; d++) { ctx.beginPath(); ctx.arc(bx - 24 + d * 24, by + 3, 6.5, 0, Math.PI * 2); ctx.fill(); }
    });
    // "?"
    group(S.fxQ, 738, 318, 62, function () {
      ctx.translate(738, 318);
      ctx.rotate((red ? 0.18 : 0.18 + Math.sin(tt * 2.2) * 0.1));
      ctx.scale(1.15, 1.15);
      inkStroke(ctx, function () {
        ctx.beginPath();
        ctx.arc(0, -22, 20, Math.PI * 1.1, Math.PI * 2.25);
        ctx.quadraticCurveTo(0, -4, 0, 12);
      }, lw * 1.05);
      ctx.fillStyle = RIM; ctx.beginPath(); ctx.arc(0, 36, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 36, 6.5, 0, Math.PI * 2); ctx.fill();
    });
    // anger mark
    group(S.fxAnger, 722, 318, 40, function () {
      var pa = red ? 1 : 1 + Math.max(0, Math.sin(tt * 6)) * 0.08;
      ctx.translate(722, 318); ctx.scale(pa, pa);
      inkStroke(ctx, function () {
        ctx.beginPath();
        for (var q = 0; q < 4; q++) {
          var ang = q * Math.PI / 2 + Math.PI / 4;
          var cx = Math.cos(ang) * 17, cy = Math.sin(ang) * 17;
          ctx.moveTo(cx + Math.cos(ang + Math.PI / 2) * 12, cy + Math.sin(ang + Math.PI / 2) * 12);
          ctx.quadraticCurveTo(cx * 0.35, cy * 0.35, cx + Math.cos(ang - Math.PI / 2) * 12, cy + Math.sin(ang - Math.PI / 2) * 12);
        }
      }, lw * 0.95, '#d83a34');
    });
    // floating hearts
    group(S.fxHearts, 728, 318, 100, function () {
      for (var hI = 0; hI < 3; hI++) {
        var hp = red ? [0.2, 0.55, 0.85][hI] : ((tt * 0.3 + hI / 3) % 1);
        var ha = clamp(S.fxHearts, 0, 1) * (red ? 1 : Math.sin(hp * Math.PI));
        if (ha < 0.02) continue;
        var hx = 700 + hI * 26 + Math.sin(hp * 7 + hI) * 10, hy = 400 - hp * 170, hs = 14 + hp * 10 + hI * 3;
        ctx.globalAlpha = ha;
        ctx.save(); ctx.translate(hx, hy); ctx.scale(hs / 16, hs / 16);
        ctx.beginPath();
        ctx.moveTo(0, 6); ctx.bezierCurveTo(-16, -6, -8, -18, 0, -9); ctx.bezierCurveTo(8, -18, 16, -6, 0, 6);
        ctx.fillStyle = '#f0607a'; ctx.strokeStyle = RIM; ctx.lineWidth = 3.5;
        ctx.stroke(); ctx.fill();
        ctx.restore();
      }
    });
    // surprise lines
    group(S.fxBang, 735, 305, 70, function () {
      var pop = red ? 1 : 1 + Math.sin(tt * 8) * 0.05;
      inkStroke(ctx, function () {
        ctx.beginPath();
        [[-0.55, 58], [-0.15, 66], [0.25, 58]].forEach(function (r) {
          var a0 = r[0] - Math.PI / 2 + 0.55, cx = 700, cy = 360;
          ctx.moveTo(cx + Math.cos(a0) * r[1] * pop, cy + Math.sin(a0) * r[1] * pop);
          ctx.lineTo(cx + Math.cos(a0) * (r[1] + 26) * pop, cy + Math.sin(a0) * (r[1] + 26) * pop);
        });
      }, lw * 0.9);
    });
    // working · pencil: small pencil writing a short scribble
    group(S.fxWork, 858, 340, 90, function () {
      var p = red ? 0.72 : (tt * 0.55) % 1;
      var x0 = 808, x1 = 900, yb = 396;
      var sy = function (x) { return yb + Math.sin((x - x0) / (x1 - x0) * Math.PI * 5) * 7; };
      var tipX = x0 + (x1 - x0) * p, tipY = sy(tipX);
      // scribble so far (fades out at the end of the loop)
      var fade = red ? 1 : (p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1);
      ctx.save();
      ctx.globalAlpha *= fade;
      inkStroke(ctx, function () {
        ctx.beginPath(); ctx.moveTo(x0, sy(x0));
        for (var x = x0; x <= tipX; x += 3) ctx.lineTo(x, sy(x));
        ctx.lineTo(tipX, tipY);
      }, lw * 0.6);
      ctx.restore();
      // pencil body, tip at (tipX, tipY), leaning up-right, with a little writing wiggle
      ctx.translate(tipX, tipY);
      ctx.rotate(-0.85 + (red ? 0 : Math.sin(tt * 18) * 0.07));
      var L = 104, Wd = 24, cone = 26;
      var outline = function () {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(cone, -Wd / 2); ctx.lineTo(L, -Wd / 2);
        ctx.arcTo(L + 12, -Wd / 2, L + 12, 0, 8); ctx.arcTo(L + 12, Wd / 2, L, Wd / 2, 8);
        ctx.lineTo(cone, Wd / 2); ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.strokeStyle = RIM; ctx.lineWidth = 9; outline(); ctx.stroke();
      ctx.fillStyle = INK; outline(); ctx.fill();
      // sharpened wood cone (light) + graphite point (dark), ferrule band
      ctx.fillStyle = RIM;
      ctx.beginPath(); ctx.moveTo(8, -3.5); ctx.lineTo(cone, -Wd / 2 + 2.5); ctx.lineTo(cone, Wd / 2 - 2.5); ctx.lineTo(8, 3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RIM; ctx.fillRect(L - 18, -Wd / 2 + 2.5, 4, Wd - 5);
    });
  };

  window.BotFace = { headView: headView, DEFAULT_ZOOM: DEFAULT_ZOOM, Avatar: Avatar, EXPRESSIONS: EXPRESSIONS, EXPRESSION_ORDER: EXPRESSION_ORDER, loadAssets: loadAssets, VIEWS: VIEWS, GEO: GEO };
})();
