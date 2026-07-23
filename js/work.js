/* work.js - 01 WORK: the landing's artwork read as a project index.
 * The list and preview are reserved paper cells inside the living lattice
 * (engine text tiles), so the page is the same sheet in a different view.
 * Rows are real anchors; content lives in the HTML, generative params ride
 * on data attributes.
 */
(function () {
  'use strict';

  var host = document.getElementById('grid-host');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  var overlays = {};
  document.querySelectorAll('.grid-cell-overlay').forEach(function (el) {
    overlays[el.dataset.cell] = el;
  });
  var rows = Array.prototype.slice.call(document.querySelectorAll('.w-row'));

  // spans re-derived on every rebuild, so a resize past the breakpoint
  // swaps between split view and full-width list
  function tileDefs() {
    var narrow = window.innerWidth < 900;
    var defs = [
      { id: 'wordmark', kind: 'text' },
      { id: 'menu', kind: 'text', at: 'tr' },
      { id: 'contact', kind: 'text' }
    ];
    if (narrow) {
      defs.push({ id: 'list', kind: 'text', spanFrac: { x0: 0, y0: 0.16, x1: 1, y1: 0.88 } });
    } else {
      defs.push({ id: 'list', kind: 'text', spanFrac: { x0: 0.125, y0: 0.18, x1: 0.55, y1: 0.85 } });
      defs.push({ id: 'preview', kind: 'text', spanFrac: { x0: 0.55, y0: 0.18, x1: 0.9, y1: 0.85 } });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 20260723, // this sheet's own identity
      tiles: tileDefs,
      density: coarse ? 'low' : 'default',
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced,
      onTiles: placeCells
    });
  } catch (err) {
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle (console tinkering, tests)

  function placeCells(rects) {
    var placed = {};
    rects.forEach(function (r) {
      var el = overlays[r.id];
      if (!el) return;
      placed[r.id] = true;
      el.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      el.classList.add('is-placed');
    });
    // cells omitted this build (the preview on narrow screens) hide again
    Object.keys(overlays).forEach(function (id) {
      if (!placed[id]) overlays[id].classList.remove('is-placed');
    });
    document.body.classList.add('tiles-ready');
  }

  /* ---- preview ------------------------------------------------------ */
  var pvIdx = document.getElementById('pv-idx');
  var pvTitle = document.getElementById('pv-title');
  var pvDesc = document.getElementById('pv-desc');
  var pvTags = document.getElementById('pv-tags');
  var pvCanvas = document.getElementById('pv-canvas');
  var pvSketch = null;
  var current = -1;

  function select(i) {
    if (i === current || !rows[i]) return;
    current = i;
    var row = rows[i];
    rows.forEach(function (r, j) { r.classList.toggle('is-current', j === i); });
    pvIdx.textContent = row.querySelector('.idx').textContent;
    pvTitle.textContent = row.querySelector('h2').textContent;
    pvDesc.textContent = row.dataset.desc || '';
    pvTags.textContent = row.dataset.tags || '';
    // variant is baked into an instance's tune, so swapping = fresh instance
    if (pvSketch) { pvSketch.destroy(); pvSketch = null; }
    try {
      pvSketch = window.createGridSketch(pvCanvas, {
        mode: 'card',
        seed: Number(row.dataset.seed) || 1,
        variant: row.dataset.variant || 'quadtree',
        animate: 'hover',
        reducedMotion: reduced,
        touch: coarse
      });
    } catch (e) { /* preview cell stays paper */ }
  }

  rows.forEach(function (row, i) {
    if (!coarse) {
      row.addEventListener('pointerenter', function () {
        select(i);
        if (pvSketch) pvSketch.setHover(true);
      });
      row.addEventListener('pointerleave', function () {
        if (pvSketch) pvSketch.setHover(false);
      });
    }
    row.addEventListener('focus', function () { select(i); });
    // no case pages yet: a click selects (matters on touch, where there
    // is no hover) instead of navigating to a dead link
    row.addEventListener('click', function (ev) {
      ev.preventDefault();
      select(i);
    });
  });
  select(0);

  /* ---- exits: same erase gesture as the landing tiles ---------------- */
  document.querySelectorAll('[data-cell="menu"] a, [data-cell="wordmark"] a').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 ||
          ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.getAttribute('aria-current') === 'page') { ev.preventDefault(); return; }
      ev.preventDefault();
      document.body.classList.add('leaving');
      sketch.sweepOut(function () { window.location.href = a.href; });
    });
  });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) window.location.reload();
  });
})();
