/*
  STAYSOLID floating navigation (snippets/ss-nav.liquid).

  1. Active indicator: one 2px orange line that slides between items. On page
     load it starts under the previously active item and glides to the current
     one; on tap it glides to the tapped item before the page changes.
  2. Compaction: the panel gets a little thinner once the page is scrolled.
  3. Legibility: content scrolls behind colourless glass, so each word flips to
     off-white only when what is directly underneath it is dark (sampled pixels
     of product images, or opaque backgrounds), with hysteresis so it never
     flickers.

  Scroll work is passive + requestAnimationFrame and throttled; images are
  read once into a 32x32 cache. No layout writes happen during reads.
*/
(function () {
  var nav = document.querySelector('[data-ss-nav]');
  if (!nav) return;

  var list = nav.querySelector('.ss-nav__list');
  var indicator = nav.querySelector('.ss-nav__indicator');
  var items = Array.prototype.slice.call(nav.querySelectorAll('.ss-nav__item'));
  var STORE_KEY = 'ss-nav-active';

  /* ---------- 1. sliding indicator ---------- */
  var current = items.filter(function (item) {
    return item.getAttribute('aria-current') === 'page';
  })[0];

  function place(item, instant) {
    if (!item || !indicator) {
      nav.classList.remove('has-indicator');
      return;
    }
    var box = list.getBoundingClientRect();
    var rect = item.getBoundingClientRect();
    if (instant) indicator.style.transition = 'none';
    indicator.style.width = rect.width + 'px';
    indicator.style.transform = 'translate3d(' + (rect.left - box.left) + 'px, 0, 0)';
    if (instant) {
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
    nav.classList.add('has-indicator');
  }

  function remember(item) {
    try {
      sessionStorage.setItem(STORE_KEY, String(items.indexOf(item)));
    } catch (e) {}
  }

  var previous = null;
  try {
    previous = items[parseInt(sessionStorage.getItem(STORE_KEY), 10)] || null;
  } catch (e) {}

  if (current) {
    if (previous && previous !== current) {
      place(previous, true);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          place(current);
        });
      });
    } else {
      place(current, true);
    }
    remember(current);
  }

  items.forEach(function (item) {
    item.addEventListener('click', function () {
      place(item);
      remember(item);
    });
  });

  function replace() {
    if (current) place(current, true);
  }
  window.addEventListener('resize', replace);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(replace);

  /* ---------- 2 + 3. scroll state ---------- */
  var pixelCache = new WeakMap();
  var canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function luminance(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function imagePixels(img) {
    if (pixelCache.has(img)) return pixelCache.get(img);
    var data = null;
    if (img.complete && img.naturalWidth && ctx) {
      try {
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 0, 0, 32, 32);
        data = ctx.getImageData(0, 0, 32, 32).data;
      } catch (e) {
        data = null; // cross-origin image: treat as unknown
      }
      pixelCache.set(img, data);
    }
    return data;
  }

  function imageLuminanceAt(img, x, y) {
    var data = imagePixels(img);
    if (!data) return null;
    var rect = img.getBoundingClientRect();
    // product images are object-fit: contain, so map into the drawn picture
    // (centred) rather than the element box; outside it is page background
    var left = rect.left;
    var top = rect.top;
    var width = rect.width;
    var height = rect.height;
    if (getComputedStyle(img).objectFit === 'contain') {
      var fit = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      left += (width - img.naturalWidth * fit) / 2;
      top += (height - img.naturalHeight * fit) / 2;
      width = img.naturalWidth * fit;
      height = img.naturalHeight * fit;
    }
    if (x < left || x > left + width || y < top || y > top + height) return 0.95;
    var px = Math.min(31, Math.floor(((x - left) / width) * 32));
    var py = Math.min(31, Math.floor(((y - top) / height) * 32));
    var i = (py * 32 + px) * 4;
    var alpha = data[i + 3] / 255;
    // transparent pixels show the off-white page through them
    return alpha * luminance(data[i], data[i + 1], data[i + 2]) + (1 - alpha) * 0.95;
  }

  function backgroundLuminance(el) {
    while (el && el !== document.documentElement) {
      var match = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (match) {
        var p = match[1].split(',').map(parseFloat);
        if ((p.length > 3 ? p[3] : 1) > 0.5) return luminance(p[0], p[1], p[2]);
      }
      el = el.parentElement;
    }
    return 0.95;
  }

  function luminanceAt(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (nav.contains(el)) continue;
      if (el.tagName === 'IMG') {
        var fromImage = imageLuminanceAt(el, x, y);
        if (fromImage !== null) return fromImage;
      }
      var bg = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      var parts = bg ? bg[1].split(',') : [];
      var opaque = bg && (parts.length < 4 || parseFloat(parts[3]) > 0.5);
      if (opaque || i === stack.length - 1) return backgroundLuminance(el);
    }
    return 0.95;
  }

  // each word reads what is directly under it, so a garment crossing only
  // part of the bar flips only the words it sits behind
  function sampleUnderneath() {
    items.forEach(function (item) {
      var rect = item.getBoundingClientRect();
      var y = rect.top + rect.height / 2;
      var avg = (
        luminanceAt(rect.left + rect.width * 0.25, y) +
        luminanceAt(rect.left + rect.width * 0.5, y) +
        luminanceAt(rect.left + rect.width * 0.75, y)
      ) / 3;
      var dark = item.classList.contains('is-on-dark');
      // hysteresis: clearly dark to switch, clearly light to switch back
      if (!dark && avg < 0.38) item.classList.add('is-on-dark');
      else if (dark && avg > 0.5) item.classList.remove('is-on-dark');
    });
  }

  var ticking = false;
  var lastSample = 0;
  var settleTimer = null;
  function onScroll() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(sampleUnderneath, 140);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      nav.classList.toggle('is-compact', window.scrollY > 24);
      var now = Date.now();
      if (now - lastSample > 90) {
        lastSample = now;
        sampleUnderneath();
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', onScroll);
  onScroll();
})();
