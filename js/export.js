/* export.js — still PNG, raster-in-SVG and animated GIF.
   The avatar is drawn on canvas, so SVG exports embed those PNG frames.
   They are NOT true vector paths (see the comment written into each SVG). */
(function () {
  'use strict';
  var G = window.Gifenc;

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function pngBlob(canvas) {
    return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, 'image/png'); });
  }

  function dataUrlToBlob(url) {
    var p = url.split(','), bin = atob(p[1]), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: 'image/png' });
  }

  /* One embedded PNG. Raster-in-SVG, not a traced vector. */
  function svgStill(pngDataUrl, w, h) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n'
      + '<!-- Raster-in-SVG: one embedded PNG of the canvas render, not a true vector path. -->\n'
      + '<image href="' + pngDataUrl + '" xlink:href="' + pngDataUrl + '" width="' + w + '" height="' + h + '" />\n'
      + '</svg>\n';
  }

  /* PNG frames sequenced with SMIL. Raster-in-SVG, not a true vector animation. */
  function svgAnimated(pngDataUrls, w, h, frameMs) {
    var n = pngDataUrls.length;
    var dur = (n * frameMs / 1000).toFixed(2) + 's';
    var frames = pngDataUrls.map(function (url, i) {
      var values = [];
      for (var k = 0; k < n; k++) values.push(k === i ? '1' : '0');
      return '<image href="' + url + '" xlink:href="' + url + '" width="' + w + '" height="' + h + '" opacity="' + (i === 0 ? '1' : '0') + '">'
        + '<animate attributeName="opacity" values="' + values.join(';') + '" dur="' + dur + '" repeatCount="indefinite" calcMode="discrete"/>'
        + '</image>';
    }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n'
      + '<!-- Raster-in-SVG: PNG frames of the canvas render sequenced with SMIL, not a true vector animation. -->\n'
      + frames + '\n</svg>\n';
  }

  function sample(frames, stride) {
    var w = frames[0].width, h = frames[0].height;
    var count = frames.length * Math.ceil(w / stride) * Math.ceil(h / stride);
    var out = new Uint8ClampedArray(count * 4), o = 0;
    frames.forEach(function (f) {
      var d = f.data;
      for (var y = 0; y < h; y += stride) {
        for (var x = 0; x < w; x += stride) {
          var i = (y * w + x) * 4;
          out[o++] = d[i]; out[o++] = d[i + 1]; out[o++] = d[i + 2]; out[o++] = d[i + 3];
        }
      }
    });
    return out;
  }

  /* imageDatas: ImageData[]. delay in ms. transparent: keep a transparent palette index (light exports). */
  function gif(frames, delay, transparent) {
    var format = transparent ? 'rgba4444' : 'rgb565';
    var opts = transparent ? { format: format, oneBitAlpha: 16 } : { format: format };
    var palette = G.quantize(sample(frames, 4), 256, opts);
    var tIndex = -1;
    if (transparent) {
      for (var p = 0; p < palette.length; p++) if ((palette[p][3] || 0) < 16) { tIndex = p; break; }
    }
    var enc = G.GIFEncoder();
    var w = frames[0].width, h = frames[0].height;
    return new Promise(function (resolve) {
      var i = 0;
      function step() {
        var index = G.applyPalette(frames[i].data, palette, format);
        enc.writeFrame(index, w, h, {
          palette: i === 0 ? palette : null,
          delay: delay,
          repeat: 0,
          transparent: tIndex >= 0,
          transparentIndex: tIndex >= 0 ? tIndex : 0
        });
        if (++i < frames.length) setTimeout(step, 0);
        else { enc.finish(); resolve(new Blob([enc.bytes()], { type: 'image/gif' })); }
      }
      step();
    });
  }

  function copyPng(blob) {
    if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error('no clipboard'));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
  function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.reject(new Error('no clipboard'));
    return navigator.clipboard.writeText(text);
  }

  window.BotExport = {
    download: download,
    pngBlob: pngBlob,
    svgStill: svgStill,
    svgAnimated: svgAnimated,
    gif: gif,
    copyPng: copyPng,
    copyText: copyText,
    svgBlob: function (text) { return new Blob([text], { type: 'image/svg+xml' }); }
  };
})();
