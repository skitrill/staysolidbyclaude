/*
  Equal visual weight for product-grid images.

  Product photos carry different amounts of transparent/empty padding, so one
  product can look much bigger than another inside the same square. This
  measures the visible subject of each grid image and sets --stww-fit (scale)
  and --stww-dx / --stww-dy (re-centering) so every subject fills about the
  same share of its square. Images are never stretched or cropped; the CSS in
  staysolid-system.css applies the values with object-fit: contain.

  Works for any product: nothing here refers to specific products. If an image
  cannot be read, it is left exactly as the CSS renders it.
*/
(function () {
  var TARGET = 0.84; // visible subject fills ~84% of the square's longer side
  var MIN_FIT = 0.78;
  var MAX_FIT = 1.12;
  var MAX_SHIFT = 0.06; // never re-center by more than 6% of the box
  var SAMPLE = 160; // analysis resolution; small is plenty for a bounding box
  // every product image box on the site: grid cards and the product page stage
  var SELECTOR = '.product-grid .card__media img, .product__media-list .product__media img';

  var canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function measure(img) {
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    if (!nw || !nh || !ctx) return null;

    // draw as object-fit: contain would: centered in a SAMPLE x SAMPLE square
    var k = SAMPLE / Math.max(nw, nh);
    var dw = nw * k;
    var dh = nh * k;
    ctx.clearRect(0, 0, SAMPLE, SAMPLE);
    ctx.drawImage(img, (SAMPLE - dw) / 2, (SAMPLE - dh) / 2, dw, dh);

    var data;
    try {
      data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    } catch (e) {
      return null; // tainted canvas: leave the image alone
    }

    // background = what the letterboxed canvas corner looks like; an image
    // with a transparent background is measured by alpha, otherwise by
    // difference from the opaque corner colour
    var ox = Math.floor((SAMPLE - dw) / 2) + 1;
    var oy = Math.floor((SAMPLE - dh) / 2) + 1;
    var ci = (oy * SAMPLE + ox) * 4;
    var cornerA = data[ci + 3];
    var cr = data[ci];
    var cg = data[ci + 1];
    var cb = data[ci + 2];

    var minX = SAMPLE;
    var minY = SAMPLE;
    var maxX = -1;
    var maxY = -1;

    for (var y = 0; y < SAMPLE; y++) {
      for (var x = 0; x < SAMPLE; x++) {
        var i = (y * SAMPLE + x) * 4;
        var a = data[i + 3];
        var subject;
        if (cornerA < 16) {
          subject = a > 24;
        } else {
          subject =
            a > 24 &&
            Math.abs(data[i] - cr) + Math.abs(data[i + 1] - cg) + Math.abs(data[i + 2] - cb) > 48;
        }
        if (subject) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0) return null;

    var bw = (maxX - minX + 1) / SAMPLE;
    var bh = (maxY - minY + 1) / SAMPLE;
    if (bw < 0.1 || bh < 0.1) return null;

    var fit = Math.min(TARGET / bw, TARGET / bh);
    fit = Math.max(MIN_FIT, Math.min(MAX_FIT, fit));

    var cx = (minX + maxX + 1) / 2 / SAMPLE - 0.5;
    var cy = (minY + maxY + 1) / 2 / SAMPLE - 0.5;
    var dx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, -cx * fit));
    var dy = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, -cy * fit));

    return { fit: fit, dx: dx, dy: dy };
  }

  function balance(img) {
    var src = img.currentSrc || img.src;
    if (!src || img.getAttribute('data-stww-balanced') === src) return;
    if (!img.complete || !img.naturalWidth) return;

    var m = measure(img);
    img.setAttribute('data-stww-balanced', src);
    if (!m) return;

    img.style.setProperty('--stww-fit', m.fit.toFixed(3));
    img.style.setProperty('--stww-dx', (m.dx * 100).toFixed(2) + '%');
    img.style.setProperty('--stww-dy', (m.dy * 100).toFixed(2) + '%');
  }

  function scan(root) {
    var imgs = (root || document).querySelectorAll(SELECTOR);
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.complete && img.naturalWidth) {
        balance(img);
      } else if (!img.__stwwBound) {
        img.__stwwBound = true;
        img.addEventListener('load', function () {
          balance(this);
        });
      }
    }
  }

  var queued = false;
  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      scan();
    });
  }

  function start() {
    scan();
    // grids re-render on filtering / pagination / theme editor edits
    if (window.MutationObserver) {
      new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
