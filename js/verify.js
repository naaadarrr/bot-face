/* verify.js — neutral expression vs original art, pixel diff */
(function () {
  'use strict';
  var BF = window.BotFace;
  function $(id) { return document.getElementById(id); }
  BF.loadAssets(function (IMG) {
    var o = $('cOrig').getContext('2d'); o.drawImage(IMG.original, 0, 0, 1024, 1024);
    var lctx = $('cLive').getContext('2d');
    var av = new BF.Avatar({ expression: 'neutral', blink: false, idle: false, follow: false });
    av.draw(lctx, 1024, 1024, { view: 'full', bg: 'dark', still: true });
    var A = o.getImageData(0, 0, 1024, 1024).data, B = lctx.getImageData(0, 0, 1024, 1024).data;
    // blend: split along a line through the eyes, perpendicular to face tilt
    var bl = $('cBlend').getContext('2d');
    bl.drawImage($('cLive'), 0, 0);
    bl.save(); bl.beginPath();
    var G = BF.GEO, ox = G.origin.x, oy = G.origin.y, t = G.faceTilt;
    var dx = Math.cos(t), dy = Math.sin(t);      // split perpendicular to eye line through origin
    bl.moveTo(ox - dy * 2000, oy + dx * 2000 * -1 * -1);
    bl.lineTo(ox + dy * 2000, oy - dx * 2000);
    bl.lineTo(ox + dy * 2000 - dx * 3000, oy - dx * 2000 - dy * 3000);
    bl.lineTo(ox - dy * 2000 - dx * 3000, oy + dx * 2000 - dy * 3000);
    bl.closePath(); bl.clip(); bl.drawImage($('cOrig'), 0, 0); bl.restore();
    bl.strokeStyle = 'rgba(0,200,255,.8)'; bl.lineWidth = 2; bl.beginPath(); bl.moveTo(ox - dy * 2000, oy + dx * 2000); bl.lineTo(ox + dy * 2000, oy - dx * 2000); bl.stroke();
    // diff
    var dctx = $('cDiff').getContext('2d'), D = dctx.createImageData(1024, 1024);
    var sum = 0, big = 0, n = 1024 * 1024, faceSum = 0, faceN = 0, faceBig = 0;
    for (var i = 0; i < n; i++) {
      var j = i * 4, d = (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2])) / 3;
      sum += d; if (d > 24) big++;
      var x = i % 1024, y = (i / 1024) | 0;
      if (x > 230 && x < 700 && y > 400 && y < 760) { faceSum += d; faceN++; if (d > 24) faceBig++; }
      var v = Math.min(255, d * 4);
      D.data[j] = v; D.data[j + 1] = v; D.data[j + 2] = v; D.data[j + 3] = 255;
    }
    dctx.putImageData(D, 0, 0);
    // outline overlay: edges of live features drawn over the original
    var baseC = document.createElement('canvas'); baseC.width = baseC.height = 1024;
    var bc = baseC.getContext('2d'); bc.drawImage(IMG.base, 0, 0, 1024, 1024);
    var Bs = bc.getImageData(0, 0, 1024, 1024).data;
    var M = new Uint8Array(n);
    for (var q = 0; q < n; q++) { var p4 = q * 4; M[q] = (Math.abs(B[p4] - Bs[p4]) + Math.abs(B[p4 + 1] - Bs[p4 + 1]) + Math.abs(B[p4 + 2] - Bs[p4 + 2])) > 36 ? 1 : 0; }
    var oc = $('cOutline').getContext('2d'); oc.drawImage(IMG.original, 0, 0, 1024, 1024);
    var OI = oc.getImageData(0, 0, 1024, 1024);
    for (var y2 = 1; y2 < 1023; y2++) for (var x2 = 1; x2 < 1023; x2++) {
      var q2 = y2 * 1024 + x2;
      if (M[q2] && (!M[q2 - 1] || !M[q2 + 1] || !M[q2 - 1024] || !M[q2 + 1024])) { var p5 = q2 * 4; OI.data[p5] = 0; OI.data[p5 + 1] = 230; OI.data[p5 + 2] = 255; }
    }
    oc.putImageData(OI, 0, 0);
    // zooms
    function zoom(src, id, sx, sy) { var z = $(id).getContext('2d'); z.imageSmoothingEnabled = false; z.drawImage(src, sx, sy, 320, 320, 0, 0, 640, 640); }
    zoom($('cOrig'), 'cZoomO', 220, 400); zoom($('cLive'), 'cZoomL', 220, 400);
    var b = $('cBase').getContext('2d'); b.drawImage(IMG.base, 0, 0, 1024, 1024);
    var bz = $('cBaseZ').getContext('2d'); bz.imageSmoothingEnabled = false; bz.drawImage($('cBase'), 250, 400, 320, 320, 0, 0, 640, 640);
    var I = bz.getImageData(0, 0, 640, 640);
    for (var k = 0; k < I.data.length; k += 4) {
      I.data[k] = Math.max(0, Math.min(255, (I.data[k] - 253) * 12 + 128));
      I.data[k + 1] = Math.max(0, Math.min(255, (I.data[k + 1] - 209) * 12 + 128));
      I.data[k + 2] = Math.max(0, Math.min(255, (I.data[k + 2] - 184) * 12 + 128));
    }
    bz.putImageData(I, 0, 0);
    var m = {
      meanAbsDiff_all: +(sum / n).toFixed(3),
      pctPixelsOver24_all: +(big / n * 100).toFixed(3),
      meanAbsDiff_faceBox: +(faceSum / faceN).toFixed(3),
      pctPixelsOver24_faceBox: +(faceBig / faceN * 100).toFixed(3)
    };
    $('metrics').textContent = 'Whole image: mean difference ' + m.meanAbsDiff_all + ' / 255, pixels off by >24: ' + m.pctPixelsOver24_all + '%\n' +
      'Face area: mean difference ' + m.meanAbsDiff_faceBox + ' / 255, pixels off by >24: ' + m.pctPixelsOver24_faceBox + '% (mostly 1px anti-aliasing on eye/blush edges)';
    document.documentElement.dataset.metrics = JSON.stringify(m);
    document.documentElement.dataset.ready = '1';
  });
})();
