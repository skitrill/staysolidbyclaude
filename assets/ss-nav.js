/*
  STAYSOLID floating navigation (snippets/ss-nav.liquid).

  1. BAG count: shown only when the bag holds something. It follows the
     real cart (data-cart-count, written by cart.js / product-form.js):
     0 -> n animates it in, n -> 0 animates it out and removes it, and any
     other change only refreshes the digits.
  2. Filled BAG: on the cart page, while the bag holds something, the page
     changes material to smoked graphite (html.ss-dark, staysolid-system.css
     §16). Data-driven, so removing the last item dissolves it back to light.
  3. Compaction: the bar gets a little thinner once the page is scrolled.
  4. Legibility: content scrolls behind colourless glass, so each word (and
     the RETURN tab) reads what is directly underneath it — on the light
     store it flips to off-white over something dark; in the smoked BAG it
     flips to charcoal over something bright. Hysteresis keeps it calm.
  5. RETURN: a tab hanging under the bar on every screen but the rack. It
     slides out from behind the bar after the bar settles, stays put while
     moving between deeper screens, and retracts when the rack is reached.
     It steps back through real history when the previous page was on this
     site, otherwise it follows its href (the logical parent).

  Scroll work is passive + requestAnimationFrame and throttled; images are
  read once into a 32x32 cache. No layout writes happen during reads.
*/
(function () {
  var bar = document.querySelector('[data-ss-navbar]');
  var nav = document.querySelector('[data-ss-nav]');
  if (!bar || !nav) return;

  var root = document.documentElement;
  var items = Array.prototype.slice.call(nav.querySelectorAll('.ss-nav__item'));
  var RETURN_KEY = 'ss-return-shown';

  function store(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {}
  }

  function recall(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function nextFrame(fn) {
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  /* ---------- 1 + 2. BAG count and the filled-BAG material ---------- */
  var bubble = document.getElementById('CartBubble');
  var onCartPage = root.hasAttribute('data-ss-cart-page');

  function readCount() {
    if (!bubble) return 0;
    var n = parseInt(bubble.getAttribute('data-cart-count'), 10);
    if (isNaN(n)) n = parseInt((bubble.textContent || '').replace(/\D/g, ''), 10);
    return n > 0 ? n : 0;
  }

  function setBagMaterial(filled) {
    if (!onCartPage || root.classList.contains('ss-dark') === filled) return;
    root.classList.toggle('ss-dark', filled);
    resetLegibility();
  }

  function animateOnce(el, cls, done) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', function end() {
      el.removeEventListener('animationend', end);
      el.classList.remove(cls);
      if (done) done();
    });
  }

  var shownCount = readCount();

  if (bubble) {
    new MutationObserver(function () {
      var n = readCount();
      // one format everywhere (an older inline script writes "(n)")
      if (bubble.textContent !== String(n)) bubble.textContent = String(n);
      if (n === shownCount) return;
      if (shownCount === 0) {
        bubble.classList.remove('is-empty', 'is-leaving');
        animateOnce(bubble, 'is-entering');
      } else if (n === 0) {
        animateOnce(bubble, 'is-leaving', function () {
          if (readCount() === 0) bubble.classList.add('is-empty');
        });
      } else {
        animateOnce(bubble, 'is-ticking');
      }
      shownCount = n;
      setBagMaterial(n > 0);
    }).observe(bubble, {
      attributes: true,
      attributeFilter: ['data-cart-count'],
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  // a filled bag opens light and glides into graphite, rather than hard-cutting
  if (onCartPage && shownCount > 0) nextFrame(function () {
    setBagMaterial(true);
  });

  /* ---------- 5. RETURN tab ---------- */
  var ret = bar.querySelector('[data-ss-return]');
  var ghost = bar.querySelector('[data-ss-return-ghost]');

  // the tab's arrow starts exactly under USER, wherever the line sits
  function alignReturn() {
    var first = items[0] && (items[0].querySelector('.ss-nav__word') || items[0]);
    if (!first) return;
    var offset = first.getBoundingClientRect().left - bar.getBoundingClientRect().left - 1;
    [ret, ghost].forEach(function (tab) {
      if (tab) tab.style.paddingLeft = Math.max(0, offset) + 'px';
    });
  }

  alignReturn();
  window.addEventListener('resize', alignReturn);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignReturn);

  // RETURN out (or already out) on a deeper screen; retracting on the rack.
  // `wasShown` is whether the previous screen showed it.
  function settleTabs(wasShown) {
    if (ret) {
      if (wasShown) {
        // already out on the previous screen: it simply stays
        ret.classList.add('is-instant', 'is-shown');
        nextFrame(function () {
          ret.classList.remove('is-instant');
        });
      } else {
        ret.classList.remove('is-shown');
        nextFrame(function () {
          ret.classList.add('is-shown');
        });
      }
      store(RETURN_KEY, '1');
    }
    if (ghost) {
      if (wasShown) {
        // arriving at the rack from a deeper screen: retract under the bar
        ghost.classList.add('is-instant', 'is-shown');
        nextFrame(function () {
          ghost.classList.remove('is-instant');
          ghost.classList.remove('is-shown');
        });
      } else {
        ghost.classList.remove('is-shown');
      }
      store(RETURN_KEY, '0');
    }
  }

  settleTabs(recall(RETURN_KEY) === '1');

  // pages restored from the back/forward cache don't rerun this script
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) settleTabs(recall(RETURN_KEY) === '1');
  });

  if (ret) {
    ret.addEventListener('click', function (event) {
      var sameSite = false;
      try {
        sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
      } catch (e) {}
      if (sameSite && history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
  }

  /* ---------- 3 + 4. scroll state and legibility ---------- */
  var readable = items.slice();
  if (ret) readable.push(ret);

  var pixelCache = new WeakMap();
  var canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function dark() {
    return root.classList.contains('ss-dark');
  }

  // what an empty / transparent spot reads as: the page surface
  function pageLuminance() {
    return dark() ? 0.07 : 0.95;
  }

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
    if (x < left || x > left + width || y < top || y > top + height) return pageLuminance();
    var px = Math.min(31, Math.floor(((x - left) / width) * 32));
    var py = Math.min(31, Math.floor(((y - top) / height) * 32));
    var i = (py * 32 + px) * 4;
    var alpha = data[i + 3] / 255;
    // transparent pixels show the page surface through them
    return alpha * luminance(data[i], data[i + 1], data[i + 2]) + (1 - alpha) * pageLuminance();
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
    return pageLuminance();
  }

  function luminanceAt(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (bar.contains(el)) continue;
      if (el.tagName === 'IMG') {
        var fromImage = imageLuminanceAt(el, x, y);
        if (fromImage !== null) return fromImage;
      }
      var bg = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      var parts = bg ? bg[1].split(',') : [];
      var opaque = bg && (parts.length < 4 || parseFloat(parts[3]) > 0.5);
      if (opaque || i === stack.length - 1) return backgroundLuminance(el);
    }
    return pageLuminance();
  }

  // each word reads what is directly under it, so a garment crossing only
  // part of the bar flips only the words it sits behind. Light store: flip
  // to off-white over something clearly dark. Smoked BAG: flip to charcoal
  // over something clearly bright. Hysteresis keeps it from flickering.
  function sampleUnderneath() {
    var smoked = dark();
    readable.forEach(function (item) {
      var rect = item.getBoundingClientRect();
      if (!rect.width) return;
      var y = rect.top + rect.height / 2;
      var avg = (
        luminanceAt(rect.left + rect.width * 0.25, y) +
        luminanceAt(rect.left + rect.width * 0.5, y) +
        luminanceAt(rect.left + rect.width * 0.75, y)
      ) / 3;
      var cls = smoked ? 'is-on-light' : 'is-on-dark';
      var on = item.classList.contains(cls);
      if (smoked) {
        if (!on && avg > 0.62) item.classList.add(cls);
        else if (on && avg < 0.5) item.classList.remove(cls);
      } else {
        if (!on && avg < 0.38) item.classList.add(cls);
        else if (on && avg > 0.5) item.classList.remove(cls);
      }
    });
  }

  function resetLegibility() {
    readable.forEach(function (item) {
      item.classList.remove('is-on-dark', 'is-on-light');
    });
    // sample again once the material has finished changing
    setTimeout(sampleUnderneath, 320);
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
