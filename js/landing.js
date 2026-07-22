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
        { id: 'work', kind: 'nav' },
        { id: 'art', kind: 'nav' },
        { id: 'about', kind: 'nav' },
        { id: 'wordmark', kind: 'text' },
        { id: 'contact', kind: 'text' }
      ],
      density: coarse ? 'low' : 'default',
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced,
      onTiles: placeTiles
    });
  } catch (err) {
    // no p5, engine crash: the static CSS layout takes over
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
    });
    document.body.classList.add('tiles-ready');
  }

  Object.keys(links).forEach(function (id) {
    var a = links[id];
    if (!coarse) {
      a.addEventListener('pointerenter', function () { sketch.setTileHover(id); });
      a.addEventListener('pointerleave', function () { sketch.setTileHover(null); });
    }
    // focus implies the hatch swap, so the dashed focus ring always has
    // a defined field to sit on
    a.addEventListener('focus', function () { sketch.setTileHover(id); });
    a.addEventListener('blur', function () { sketch.setTileHover(null); });
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
