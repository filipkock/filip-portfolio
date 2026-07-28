/* about.js - 03 ABOUT: the artwork as a bio sheet.
 * The bio lives in one large panel cell; the actions (contact, resume,
 * linkedin) are black lattice tiles like the landing's; three fixed photo
 * cells reveal an image on hover (placeholders until assets/img/me-0N.jpg
 * exist). All spans are explicit (spanFrac), chosen so lattice snapping
 * cannot make them collide.
 */
(function () {
  'use strict';

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

  var overlays = {};
  document.querySelectorAll('.grid-cell-overlay').forEach(function (el) {
    overlays[el.dataset.cell] = el;
  });
  var links = {};
  document.querySelectorAll('.tile-link').forEach(function (a) {
    links[a.dataset.tile] = a;
  });

  // mirrors the engine's lattice derivation (CELL_TARGET_PX 190, mobile
  // scale 1.2, stacked row forcing) so narrow spans land on integer rows
  function lattice() {
    var w = window.innerWidth, h = window.innerHeight;
    var stacked = coarse || w < 700;
    var target = 190 * (stacked ? 1.2 : 1);
    var cols = Math.min(16, Math.max(2, Math.round(w / target)));
    var rows = Math.min(24, Math.max(1, Math.round(h / target)));
    if (stacked) rows = Math.max(rows, 8);
    return { cols: cols, rows: rows, stacked: stacked };
  }

  var LINES = {
    contact: [
      { t: 'CONTACT', h: 'left', v: 'top', row: 0 },
      { t: 'ME', h: 'right', v: 'bottom', row: 0 }
    ],
    resume: [{ t: 'RESUME', h: 'left', v: 'top', row: 0 }],
    linkedin: [{ t: 'LINKEDIN', h: 'left', v: 'bottom', row: 0 }]
  };

  function tileDefs() {
    var L = lattice();
    var R = L.rows;
    var desktop = window.innerWidth >= 900 && L.cols >= 5;
    var defs = [
      { id: 'wordmark', kind: 'text' },
      { id: 'menu', kind: 'text', at: 'tr' }
    ];
    if (desktop) {
      var C = L.cols;
      // actions are pinned to exact lattice-cell counts (viewport fractions
      // would balloon them on wide screens): contact 2x1, the rest 1x1
      var cells = function (c0, r0, cs, rs) {
        return { x0: c0 / C, y0: r0 / R, x1: (c0 + cs) / C, y1: (r0 + rs) / R };
      };
      // the trio steps down as a triangle anchored on resume's column:
      // contact spans the two columns above, linkedin sits one column left
      // (never straight under resume - they would read as one button)
      var rc = Math.min(C - 1, Math.max(3, Math.round(C * 0.72)));
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: { x0: 0.10, y0: 0.20, x1: 0.52, y1: 0.88 } });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: cells(rc - 1, 1, 2, 1) });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: cells(rc, Math.min(2, R - 1), 1, 1) });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: cells(rc - 1, Math.min(3, R - 1), 1, 1) });
      defs.push({ id: 'photo-1', kind: 'photo', spanFrac: { x0: 0.30, y0: 0.00, x1: 0.42, y1: 0.20 } });
      defs.push({ id: 'photo-2', kind: 'photo', spanFrac: { x0: 0.00, y0: 0.30, x1: 0.10, y1: 0.55 } });
      defs.push({ id: 'photo-3', kind: 'photo', spanFrac: { x0: 0.90, y0: 0.86, x1: 1.00, y1: 1.00 } });
    } else if (L.stacked) {
      // full-width bands on integer rows with an artwork row between each
      // (adjacent black bands would fuse: ink borders vanish on ink);
      // photos are dropped. Engine forces R >= 8 here (3 nav tiles).
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 5) / R } });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: { x0: 0, y0: (R - 5) / R, x1: 1, y1: (R - 4) / R } });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: { x0: 0, y0: (R - 3) / R, x1: 1, y1: (R - 2) / R } });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: { x0: 0, y0: (R - 1) / R, x1: 1, y1: 1 } });
    } else {
      // narrow desktop window: bio full width, action trio on the last row
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 1) / R } });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: { x0: 0, y0: (R - 1) / R, x1: 0.45, y1: 1 } });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: { x0: 0.45, y0: (R - 1) / R, x1: 0.75, y1: 1 } });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: { x0: 0.75, y0: (R - 1) / R, x1: 1, y1: 1 } });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 20260728, // this sheet's own identity
      tiles: tileDefs,
      density: coarse ? 'low' : 'default',
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced && !arriving,
      arrive: arriving,
      onArrived: function () { document.documentElement.classList.remove('arriving'); },
      onTiles: placeCells
    });
  } catch (err) {
    document.documentElement.classList.remove('arriving');
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle (console tinkering, tests)

  function placeCells(rects) {
    var placed = {};
    rects.forEach(function (r) {
      var el = r.kind === 'nav' ? links[r.id] : overlays[r.id];
      if (!el) return;
      placed[r.id] = true;
      el.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      el.classList.add('is-placed');
    });
    Object.keys(overlays).forEach(function (id) {
      if (!placed[id]) overlays[id].classList.remove('is-placed');
    });
    // spans are designed to never collide after snapping; if a viewport
    // proves otherwise, say so instead of failing silently
    for (var a = 0; a < rects.length; a++) {
      for (var b = a + 1; b < rects.length; b++) {
        var p = rects[a], q = rects[b];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
          console.warn('about: tile overlap', p.id, q.id);
        }
      }
    }
    document.body.classList.add('tiles-ready');
  }

  // action tiles: engine polarity wipe on hover/focus; navigation stays
  // native (mailto / new tab), so no click handlers here
  Object.keys(links).forEach(function (id) {
    var a = links[id];
    if (!coarse) {
      a.addEventListener('pointerenter', function () { sketch.setTileHover(id); });
      a.addEventListener('pointerleave', function () { sketch.setTileHover(null); });
    }
    a.addEventListener('focus', function () { sketch.setTileHover(id); });
    a.addEventListener('blur', function () { sketch.setTileHover(null); });
  });

  // photo cells: hover/focus reveal is pure CSS; click toggles a pinned
  // state, which is also the whole interaction on touch
  document.querySelectorAll('.photo-cell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var on = btn.classList.toggle('is-revealed');
      btn.setAttribute('aria-pressed', String(on));
    });
  });

  // exits: same erase gesture as everywhere; internal links only
  document.querySelectorAll('[data-cell="menu"] a, [data-cell="wordmark"] a').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 ||
          ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.getAttribute('aria-current') === 'page') { ev.preventDefault(); return; }
      ev.preventDefault();
      document.body.classList.add('leaving');
      try { sessionStorage.setItem('grid-mold', '1'); } catch (e) { /* fine */ }
      var cellId = a.closest('.grid-cell-overlay').dataset.cell;
      var t = sketch.getTiles().filter(function (x) { return x.id === cellId; })[0];
      var origin = t ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : null;
      sketch.sweepOut(origin, function () { window.location.href = a.href; });
    });
  });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) window.location.reload();
  });
})();
