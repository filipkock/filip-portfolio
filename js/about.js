/* about.js - 03 ABOUT: the artwork as a bio sheet.
 * The bio lives in one large panel cell; the actions (contact, resume,
 * linkedin) are black lattice tiles like the landing's; four fixed photo
 * cells reveal an image on hover (placeholders until assets/img/me-0N.jpg
 * exist). All spans are explicit (spanFrac), chosen so lattice snapping
 * cannot make them collide. Inside the panel, the fun-facts list becomes a
 * one-card-at-a-time deck.
 */

/* The deck owes nothing to the canvas, so it is wired first: a dead engine
 * still leaves a working deck.
 */
(function funFacts() {
  'use strict';

  var deck = document.querySelector('.fun-deck');
  if (!deck) return;
  var facts = [].slice.call(deck.querySelectorAll('.ff-fact'));
  var ticks = deck.querySelector('.ff-ticks');
  // the whole window is the pointer target (text and image), not just the list
  var card = deck.querySelector('.ff-window') || deck.querySelector('.ff-list');
  var toggle = deck.querySelector('.ff-toggle');
  var body = deck.querySelector('.ff-body');
  var cue = deck.querySelector('.ff-cue');
  // anything missing and the deck stays the plain authored list
  if (facts.length < 2 || !ticks || !card || !toggle || !body) return;
  var i = 0;
  var open = false;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ticks are built here, so their count can never drift from the markup
  var dots = facts.map(function (fact, n) {
    var b = document.createElement('button');
    var h = fact.querySelector('h3');
    b.type = 'button';
    b.className = 'ff-tick';
    b.setAttribute('aria-label', 'Fact ' + (n + 1) + (h ? ': ' + h.textContent : ''));
    b.addEventListener('click', function () { show(n); });
    ticks.appendChild(b);
    return b;
  });

  var shot = deck.querySelector('.ff-shot');
  var shotLabel = deck.querySelector('.ff-shot-label');
  var at = deck.querySelector('.ff-at');
  var of = deck.querySelector('.ff-of');
  if (of) of.textContent = pad(facts.length);

  function show(n) {
    i = (n % facts.length + facts.length) % facts.length; // wraps both ways
    facts.forEach(function (f, k) { f.hidden = k !== i; });
    dots.forEach(function (b, k) { b.setAttribute('aria-current', String(k === i)); });
    if (cue && open) cue.textContent = pad(i + 1) + '/' + pad(facts.length);
    if (at) at.textContent = pad(i + 1);
    // a fact carries its own image via data-img; the checker placeholder
    // (numbered with the fact) stands in until one exists
    if (shot) {
      var src = facts[i].dataset.img;
      var img = shot.querySelector('img');
      if (src) {
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          shot.insertBefore(img, shot.firstChild);
        }
        img.src = src;
      } else if (img) {
        img.remove();
      }
      if (shotLabel) {
        shotLabel.hidden = !!src;
        shotLabel.textContent = 'IMG ' + pad(i + 1);
      }
    }
  }

  function setOpen(on) {
    open = !!on;
    body.hidden = !open;
    deck.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (cue) cue.textContent = open ? pad(i + 1) + '/' + pad(facts.length) : 'REVEAL';
  }

  // the tile animation belongs to the engine, so the page script drives
  // open/close through here; this IIFE keeps owning the content stepping
  window.__deck = {
    setOpen: setOpen,
    isOpen: function () { return open; },
    show: show
  };

  deck.querySelectorAll('.ff-step').forEach(function (b) {
    b.addEventListener('click', function () { show(i + (+b.dataset.step || 1)); });
  });

  // the card is the big pointer target; links inside it still navigate
  card.addEventListener('click', function (ev) {
    if (ev.target.closest('a, button')) return;
    show(i + 1);
  });

  // arrows step once focus is inside the deck (ticks, PREV / NEXT)
  deck.addEventListener('keydown', function (ev) {
    if (!open || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); show(i + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(i - 1); }
  });

  show(0);
  setOpen(false);
})();

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
  // scale 1.2, stacked row forcing) so narrow spans land on integer rows.
  // The height is the SHEET's height, not the window's: on a phone the sheet
  // grows past the viewport (stageH below) and the page scrolls.
  function lattice() {
    var w = window.innerWidth, h = host.clientHeight || window.innerHeight;
    var stacked = coarse || w < 700;
    var target = 190 * (stacked ? 1.2 : 1);
    var cols = Math.min(16, Math.max(2, Math.round(w / target)));
    var rows = Math.min(24, Math.max(1, Math.round(h / target)));
    // the engine forces rows >= 2 + navCount*2 when stacked; this page
    // carries four nav tiles (contact, resume, linkedin, funfact)
    if (stacked) rows = Math.max(rows, 10);
    return { cols: cols, rows: rows, stacked: stacked };
  }

  var LINES = {
    contact: [
      { t: 'CONTACT', h: 'left', v: 'top', row: 0 },
      { t: 'ME', h: 'right', v: 'bottom', row: 0 }
    ],
    resume: [{ t: 'RESUME', h: 'left', v: 'top', row: 0 }],
    linkedin: [{ t: 'LINKEDIN', h: 'left', v: 'bottom', row: 0 }],
    funfact: [
      { t: 'FUN', h: 'left', v: 'top', row: 0 },
      { t: 'FACTS', h: 'left', v: 'top', row: 1 },
      { t: 'CLICK TO OPEN', h: 'left', v: 'bottom', row: 0, scale: 0.5 }
    ]
  };

  // the bio panel's column run, shared with the deck so the drawer opens to
  // exactly the width of the sheet above it and the two can never drift
  function bioCols(rc) { return Math.max(2, rc - 2); }

  // the deck's band, one row up from the foot of the sheet so it lines up with
  // the linkedin tile beside it. The bio's height is derived from this (not the
  // other way round), so the sheet's bottom edge and the deck's top edge are
  // the same line by construction. The floor of 2 keeps the band clear of the
  // wordmark row on short windows, where R - 2 would land on the bio itself.
  function deckRow(R) { return Math.max(2, R - 2); }

  // the deck's two shapes, in lattice cells: a small tile that unrolls
  // sideways along its own band - same row, more columns, so opening it never
  // pushes the sheet around. Derived on demand (p5 runs setup asynchronously,
  // so this must not depend on a build having happened yet) and re-derived on
  // resize.
  var deckOpen = false;

  function deckShape() {
    var L = lattice();
    var R = L.rows, C = L.cols;
    var cells = function (c0, r0, cs, rs) {
      return { x0: c0 / C, y0: r0 / R, x1: (c0 + cs) / C, y1: (r0 + rs) / R };
    };
    if (window.innerWidth >= 900 && C >= 5) {
      var rc = Math.min(C - 1, Math.max(3, Math.round(C * 0.72)));
      // open to exactly the bio's column run: the drawer reads as the foot of
      // the sheet above it, flush on both edges
      var wide = bioCols(rc);
      return {
        closed: cells(1, deckRow(R), wide > 2 ? 2 : 1, 1),
        open: cells(1, deckRow(R), wide, 1)
      };
    }
    if (L.stacked) {
      // a phone has no width to unroll into, so this band opens upward over
      // the bio instead - the one place the deck grows vertically. Closed it
      // sits flush under the bio (row R-7), keeping the artwork row between
      // itself and the contact band.
      return {
        closed: { x0: 0, y0: (R - 7) / R, x1: 1, y1: (R - 6) / R },
        open: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 6) / R }
      };
    }
    // narrow desktop: half the row, opening across the whole of it
    return {
      closed: { x0: 0, y0: (R - 2) / R, x1: 0.5, y1: (R - 1) / R },
      open: { x0: 0, y0: (R - 2) / R, x1: 1, y1: (R - 1) / R }
    };
  }

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
      // the bio ends where the deck's band starts, two rows short of the foot,
      // which puts that band level with the linkedin tile across from it
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: cells(1, 1, bioCols(rc), Math.max(1, deckRow(R) - 1)) });
      defs.push({
        id: 'funfact', kind: 'nav', labelMax: 5,
        lines: deckOpen ? [] : LINES.funfact,
        spanFrac: deckOpen ? deckShape().open : deckShape().closed
      });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: cells(rc - 1, 1, 2, 1) });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: cells(rc, Math.min(2, R - 1), 1, 1) });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: cells(rc - 1, Math.min(3, R - 1), 1, 1) });
      defs.push({ id: 'photo-1', kind: 'photo', spanFrac: { x0: 0.30, y0: 0.00, x1: 0.42, y1: 0.20 } });
      defs.push({ id: 'photo-2', kind: 'photo', spanFrac: { x0: 0.00, y0: 0.30, x1: 0.10, y1: 0.55 } });
      defs.push({ id: 'photo-3', kind: 'photo', spanFrac: { x0: 0.90, y0: 0.86, x1: 1.00, y1: 1.00 } });
      // the fourth takes the bottom-left corner, diagonally opposite photo-3:
      // column 0 is outside both the bio's run and the deck's, and the last
      // row keeps it clear of photo-2 (snapping would otherwise fuse the two
      // into one domino in the left margin)
      defs.push({ id: 'photo-4', kind: 'photo', spanFrac: { x0: 0.00, y0: 0.80, x1: 0.10, y1: 1.00 } });
    } else if (L.stacked) {
      // full-width bands on integer rows, anchored to the foot of the sheet:
      // funfact R-7, contact R-5, resume R-3, linkedin R-1, with an artwork
      // row between each pair (adjacent black bands would fuse: ink borders
      // vanish on ink). Photos are dropped, and the bio takes every row
      // between the header and the bands - sizeStage grows the sheet until
      // those rows actually hold its text.
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 7) / R } });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: { x0: 0, y0: (R - 5) / R, x1: 1, y1: (R - 4) / R } });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: { x0: 0, y0: (R - 3) / R, x1: 1, y1: (R - 2) / R } });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: { x0: 0, y0: (R - 1) / R, x1: 1, y1: 1 } });
      defs.push({
        id: 'funfact', kind: 'nav', labelMax: 5,
        lines: deckOpen ? [] : LINES.funfact,
        spanFrac: deckOpen ? deckShape().open : deckShape().closed
      });
    } else {
      // narrow desktop window: bio full width, action trio on the last row
      defs.push({ id: 'bio', kind: 'text', panel: true, spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 2) / R } });
      defs.push({ id: 'contact', kind: 'nav', lines: LINES.contact, spanFrac: { x0: 0, y0: (R - 1) / R, x1: 0.45, y1: 1 } });
      defs.push({ id: 'resume', kind: 'nav', lines: LINES.resume, spanFrac: { x0: 0.45, y0: (R - 1) / R, x1: 0.75, y1: 1 } });
      defs.push({ id: 'linkedin', kind: 'nav', lines: LINES.linkedin, spanFrac: { x0: 0.75, y0: (R - 1) / R, x1: 1, y1: 1 } });
      defs.push({
        id: 'funfact', kind: 'nav', labelMax: 5,
        lines: deckOpen ? [] : LINES.funfact,
        spanFrac: deckOpen ? deckShape().open : deckShape().closed
      });
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

  /* on a phone the fixed sheet cannot hold the bio: instead of clipping the
     text (or nesting a scrollbar inside the cell), the sheet itself grows
     past the viewport and the PAGE scrolls. The stage gets an explicit px
     height sized so the bio's rows fit its text; the engine's own resize
     observer sees the taller host and rebuilds everything onto it. Height
     changes converge (one-row tolerance), so build -> size -> rebuild cannot
     ping-pong. */
  var stage = host.closest('.stage') || host.parentElement;

  function sizeStage() {
    var stacked = coarse || window.innerWidth < 700;
    if (!stacked) {
      if (stage.style.height) {
        stage.style.height = '';
        document.body.classList.remove('stage-scroll');
      }
      return;
    }
    var body = overlays.bio && overlays.bio.querySelector('.bio-body');
    if (!body || !body.lastElementChild) return;
    document.body.classList.add('stage-scroll');
    // content height, not scrollHeight: bio-body stretches to min-height
    // 100%, so scrollHeight would ratchet and the sheet could never shrink
    var pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
    var need = body.lastElementChild.getBoundingClientRect().bottom -
      body.getBoundingClientRect().top + pad + 2;
    // the bio holds rows 1..R-8 (tileDefs): solve for the sheet height whose
    // rows give it that room. Iterate because R itself follows the height
    // (228 = the engine's stacked cell target, 190 * 1.2, forced >= 10 rows
    // by this page's four nav tiles); growth converges with mild overshoot.
    var H = Math.max(window.innerHeight, 1);
    for (var k = 0; k < 6; k++) {
      var R = Math.max(10, Math.min(24, Math.round(H / 228)));
      if ((R - 8) * H / R + 1 >= need) break;
      H = Math.max(window.innerHeight, Math.ceil(need * R / (R - 8)));
    }
    if (Math.abs(stage.getBoundingClientRect().height - H) > 8) {
      stage.style.height = H + 'px';
    }
  }

  window.addEventListener('resize', sizeStage);
  // Satoshi arrives late and reflows the bio: re-measure once it lands
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeStage);

  function placeCells(rects) {
    var placed = {};
    rects.forEach(function (r) {
      // the deck is a nav tile but its overlay is a cell, so check both maps
      var el = links[r.id] || overlays[r.id];
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
        // an open deck covers the bio on purpose: that is the drawer, not a bug
        if (deckOpen && (p.id === 'funfact' || q.id === 'funfact')) continue;
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
          console.warn('about: tile overlap', p.id, q.id);
        }
      }
    }
    document.body.classList.add('tiles-ready');
    sizeStage(); // the bio is measurable now: grow the sheet if it clips
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

  /* ---- fun-fact deck: the tile grows open, the drawer appears --------- */
  (function deck() {
    var cell = overlays.funfact;
    if (!cell) return;
    var toggle = cell.querySelector('.ff-toggle');
    var body = cell.querySelector('.ff-body');
    var close = cell.querySelector('.ff-close');
    var GROW_MS = 420; // the page transition's cadence, at cell scale

    function setState(open) {
      deckOpen = open;
      // content state (visibility, aria, counter) lives in the deck module
      if (window.__deck) window.__deck.setOpen(open);
      else if (body) body.hidden = !open;
      // the pixel-face title belongs to the closed tile only
      var shape = deckShape();
      sketch.setTileState('funfact', {
        spanFrac: open ? shape.open : shape.closed,
        lines: open ? [] : LINES.funfact,
        animateMs: GROW_MS
      });
      // stacked, the drawer opens upward OVER the bio: the bio overlay would
      // otherwise keep painting its text across the drawer's ink, and the
      // fact itself would land above the fold - so the bio steps aside and
      // the view follows the drawer to its top
      var covers = lattice().stacked;
      if (overlays.bio) overlays.bio.classList.toggle('is-covered', open && covers);
      if (open && covers) {
        var reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () {
          cell.scrollIntoView({ block: 'start', behavior: reducedNow ? 'auto' : 'smooth' });
        }, GROW_MS);
      }
      if (open) {
        sketch.setTileHover(null);
        var first = body && body.querySelector('.ff-step');
        if (first) first.focus();
      } else {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () { setState(!deckOpen); });
    if (close) close.addEventListener('click', function () { setState(false); });

    // hover polarity only while closed: an open drawer holds content
    if (!coarse) {
      toggle.addEventListener('pointerenter', function () { if (!deckOpen) sketch.setTileHover('funfact'); });
      toggle.addEventListener('pointerleave', function () { sketch.setTileHover(null); });
    }
    toggle.addEventListener('focus', function () { if (!deckOpen) sketch.setTileHover('funfact'); });
    toggle.addEventListener('blur', function () { sketch.setTileHover(null); });

    cell.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && deckOpen) { ev.stopPropagation(); setState(false); }
    });

    setState(false); // authored open (no-JS readable), closed once wired
  })();

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
