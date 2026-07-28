/* landing.js - index only: living grid + in-grid tile links and text cells.
 * The anchors are real links; the canvas draws only tile fills. No click
 * handlers anywhere - navigation stays native (tab, middle-click, right-click).
 * Wordmark and contact live in reserved lattice cells, so chrome sits inside
 * the artwork instead of floating on top of it.
 */
(function () {
  'use strict';

  // Easter egg (off by default): add image paths, e.g. 'assets/img/me-01.jpg',
  // and hovering the grid reveals a random one in the cell under the cursor.
  var HOVER_IMAGES = [];

  var host = document.getElementById('grid-host');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  // the inline head script normally sets .arriving (and the black pre-paint),
  // but read the flag directly too so a stale HTML cache cannot skip the
  // retreat animation
  var arriving = document.documentElement.classList.contains('arriving');
  try {
    arriving = arriving || sessionStorage.getItem('grid-mold') === '1';
    sessionStorage.removeItem('grid-mold');
  } catch (e) { /* private mode */ }

  var links = {};
  document.querySelectorAll('.tile-link').forEach(function (a) {
    links[a.dataset.tile] = a;
  });
  var cells = {};
  document.querySelectorAll('.grid-cell-overlay').forEach(function (el) {
    cells[el.dataset.cell] = el;
  });

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 20260706,
      tiles: [
        // labels render as the engine's 5x7 pixel face; the anchors keep
        // real (visually hidden) text for assistive tech and no-JS
        {
          id: 'work', kind: 'nav',
          lines: [
            { t: 'PRODUCT', h: 'left', v: 'top', row: 0 },
            { t: 'DESIGN', h: 'right', v: 'top', row: 1 }
          ]
        },
        {
          id: 'art', kind: 'nav',
          lines: [
            { t: 'ART', h: 'right', v: 'top', row: 0 },
            { t: '& STUFF', h: 'left', v: 'bottom', row: 0 }
          ]
        },
        {
          id: 'about', kind: 'nav',
          lines: [
            { t: 'ABOUT', h: 'left', v: 'top', row: 0 },
            { t: 'ME', h: 'right', v: 'bottom', row: 0 }
          ]
        },
        { id: 'wordmark', kind: 'text' },
        { id: 'contact', kind: 'text' }
      ],
      density: coarse ? 'low' : 'default',
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced && !arriving,
      arrive: arriving,
      onArrived: function () { document.documentElement.classList.remove('arriving'); },
      onTiles: placeTiles
    });
  } catch (err) {
    // no p5, engine crash: the static CSS layout takes over
    document.documentElement.classList.remove('arriving');
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle (console tinkering, tests)

  function placeTiles(rects) {
    // build + resize only, never per frame; transform = no layout shift
    rects.forEach(function (r) {
      var el = r.kind === 'text' ? cells[r.id] : links[r.id];
      if (!el) return;
      el.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      el.classList.add('is-placed');
    });
    document.body.classList.add('tiles-ready');
  }

  Object.keys(links).forEach(function (id) {
    var a = links[id];
    if (!coarse) {
      a.addEventListener('pointerenter', function () { sketch.setTileHover(id); });
      a.addEventListener('pointerleave', function () { sketch.setTileHover(null); });
    }
    // focus implies the polarity swap, so the dashed focus ring always has
    // a defined field to sit on
    a.addEventListener('focus', function () { sketch.setTileHover(id); });
    a.addEventListener('blur', function () { sketch.setTileHover(null); });

    // exit gesture: ink spreads from the clicked tile until the sheet is
    // consumed, then we navigate and the next page retreats the mold.
    // Modified clicks (new tab etc.) and reduced motion keep native behavior.
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 ||
          ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      document.body.classList.add('leaving');
      try { sessionStorage.setItem('grid-mold', '1'); } catch (e) { /* fine */ }
      var t = sketch.getTiles().filter(function (x) { return x.id === id; })[0];
      var origin = t ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : null;
      sketch.sweepOut(origin, function () { window.location.href = a.href; });
    });
  });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) window.location.reload();
  });

  // -- hover images easter egg ------------------------------------------
  if (HOVER_IMAGES.length && !coarse && !reduced) {
    var imgEl = document.querySelector('.hover-img');
    var rng = function () { return Math.random(); }; // cosmetic only, determinism not needed
    var lastKey = null;
    var raf = 0;
    document.addEventListener('mousemove', function (ev) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var cell = sketch.cellAt(ev.clientX, ev.clientY);
        if (!cell || cell.w < 40 || cell.w > 320) { // too small to read / too big to cover
          imgEl.classList.remove('is-visible');
          lastKey = null;
          return;
        }
        var key = Math.round(cell.x) + ':' + Math.round(cell.y);
        if (key === lastKey) return;
        lastKey = key;
        imgEl.style.backgroundImage = 'url("' + HOVER_IMAGES[Math.floor(rng() * HOVER_IMAGES.length)] + '")';
        imgEl.style.transform = 'translate(' + cell.x + 'px,' + cell.y + 'px)';
        imgEl.style.width = cell.w + 'px';
        imgEl.style.height = cell.h + 'px';
        imgEl.classList.add('is-visible');
      });
    });
    document.addEventListener('mouseleave', function () {
      imgEl.classList.remove('is-visible');
      lastKey = null;
    });
  }
})();
