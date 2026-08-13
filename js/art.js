/* art.js - 02 SIDE QUESTS: the artwork as the gallery itself.
 * A fixed sheet like the landing and about pages: the living lattice fills
 * the viewport, and the pieces hide inside it as photo cells (the about
 * page's pattern) that reveal on hover and carry their caption on the red
 * cursor dot (data-cursor). Anchor spots open the piece elsewhere; button
 * spots just pin the reveal. All spans are explicit (spanFrac), chosen so
 * lattice snapping cannot make them collide with the chrome or each other.
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

  // mirrors the engine's lattice derivation (CELL_TARGET_PX 190, mobile
  // scale 1.2) so narrow spans land on integer rows. No stacked row forcing:
  // the engine only forces rows for nav tiles, and this page has none.
  function lattice() {
    var w = window.innerWidth, h = window.innerHeight;
    var stacked = coarse || w < 700;
    var target = 190 * (stacked ? 1.2 : 1);
    var cols = Math.min(16, Math.max(2, Math.round(w / target)));
    var rows = Math.min(24, Math.max(1, Math.round(h / target)));
    return { cols: cols, rows: rows, stacked: stacked };
  }

  /* the spots' lattice homes, id-matched to the overlays in art.html.
     Chrome owns the corners (wordmark top-left, menu top-right, contact
     bottom-left), so the spots keep clear of them. Order matters on narrow
     screens: the first few in this list are the ones that fit. */
  var SPOTS = [
    { id: 'art-1', spanFrac: { x0: 0.30, y0: 0.00, x1: 0.42, y1: 0.20 } },
    { id: 'art-2', spanFrac: { x0: 0.62, y0: 0.16, x1: 0.75, y1: 0.38 } },
    { id: 'art-3', spanFrac: { x0: 0.10, y0: 0.36, x1: 0.24, y1: 0.58 } },
    { id: 'art-4', spanFrac: { x0: 0.78, y0: 0.46, x1: 1.00, y1: 0.86 } }, // the big one
    { id: 'art-5', spanFrac: { x0: 0.40, y0: 0.62, x1: 0.53, y1: 0.84 } }
  ];

  function tileDefs() {
    var L = lattice();
    var R = L.rows;
    var defs = [
      { id: 'wordmark', kind: 'text' },
      { id: 'menu', kind: 'text', at: 'tr' },
      { id: 'contact', kind: 'text' } // engine default: bottom-left
    ];
    if (!L.stacked && L.cols >= 5) {
      SPOTS.forEach(function (s) {
        defs.push({ id: s.id, kind: 'photo', spanFrac: s.spanFrac });
      });
    } else {
      // a narrow sheet has no room to scatter: the spots become full-width
      // bands on the free rows (top row is chrome, last row is contact),
      // and however many fit is however many show
      var free = Math.max(0, R - 2);
      SPOTS.slice(0, free).forEach(function (s, i) {
        defs.push({
          id: s.id, kind: 'photo',
          spanFrac: { x0: 0, y0: (1 + i) / R, x1: 1, y1: (2 + i) / R }
        });
      });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 20260807, // this sheet's own identity
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
      var el = overlays[r.id];
      if (!el) return;
      placed[r.id] = true;
      el.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      el.classList.add('is-placed');
    });
    // spots dropped this build (a narrow sheet) hide again
    Object.keys(overlays).forEach(function (id) {
      if (!placed[id]) overlays[id].classList.remove('is-placed');
    });
    // spans are designed to never collide after snapping; if a viewport
    // proves otherwise, say so instead of failing silently
    for (var a = 0; a < rects.length; a++) {
      for (var b = a + 1; b < rects.length; b++) {
        var p = rects[a], q = rects[b];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
          console.warn('art: tile overlap', p.id, q.id);
        }
      }
    }
    document.body.classList.add('tiles-ready');
  }

  // every spot now points at the piece where it lives, so the browser owns
  // the click and hover/focus reveal is pure CSS. On touch the spots arrive
  // already revealed (CSS, gated on is-placed) and a tap opens the link.

  /* ---- clip spots: the reveal is CSS, playback is not ------------------
     preload="none" means the file is not fetched until the first hover, so
     a spot nobody finds costs nothing.

     Sound is the awkward part. A page cannot make noise off a hover alone:
     unmuted playback needs a real user gesture, and mouseenter is not one.
     Since every spot is a link now, the click belongs to the piece it opens
     and cannot be spent on unmuting. So a data-sound spot asks for sound on
     hover and takes muted playback when the browser says no - which it will
     until the reader has clicked something on the page, after which the
     same hover starts working. The corner mark on the spot is the tell.
     Only one spot sounds at a time: two side quests talking over each other
     is just noise.                                                       */
  (function clipSpots() {
    var clips = [].slice.call(document.querySelectorAll('.photo-cell video'));
    if (!clips.length) return;

    function silence(except) {
      clips.forEach(function (v) {
        if (v === except) return;
        v.muted = true;
        v.closest('.photo-cell').classList.remove('is-sounding');
      });
    }

    function play(v) {
      if (reduced) return; // the poster is the whole piece under reduced motion
      var cell = v.closest('.photo-cell');
      if (v.hasAttribute('data-sound')) {
        silence(v);
        v.muted = false;
      }
      var p = v.play();
      if (p && p.catch) {
        p.catch(function () {
          // blocked, and the only thing ever blocked is the sound: fall back
          // to a muted play so the spot still moves
          if (v.muted) return;
          v.muted = true;
          cell.classList.remove('is-sounding');
          var q = v.play();
          if (q && q.catch) q.catch(function () { /* poster stands */ });
        });
      }
      cell.classList.toggle('is-sounding', !v.muted);
    }

    function stop(v) {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
      v.closest('.photo-cell').classList.remove('is-sounding');
    }

    clips.forEach(function (v) {
      var cell = v.closest('.photo-cell');
      cell.addEventListener('mouseenter', function () { play(v); });
      cell.addEventListener('mouseleave', function () { stop(v); });
      cell.addEventListener('focus', function () { play(v); });
      cell.addEventListener('blur', function () { stop(v); });
    });

    // clicking a spot opens its piece in a new tab, which leaves this one
    // alive and behind it: a clip left playing here would be sound coming
    // from a page nobody is looking at
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clips.forEach(stop);
    });
  })();

  // on touch the spots show up revealed instead (the hunt is a hover game,
  // and touch has no hover): that lives in CSS, gated on is-placed, so a
  // spot dropped by a narrow rebuild cannot leak its reveal at the origin

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
