/* case.js - case study pages: the living lattice runs fixed behind a
 * scrolling document. No lattice-pinned chrome here (cells are viewport
 * fixed, the document is not), so the bar and panels are plain HTML.
 * Mold transitions still work: the background canvas is full-viewport.
 */
(function () {
  'use strict';

  var host = document.getElementById('grid-host');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var arriving = document.documentElement.classList.contains('arriving');
  try {
    arriving = arriving || sessionStorage.getItem('grid-mold') === '1';
    sessionStorage.removeItem('grid-mold');
  } catch (e) { /* private mode */ }

  var overlays = {};
  document.querySelectorAll('.case-cell').forEach(function (el) {
    overlays[el.dataset.cell] = el;
  });

  // mirrors the engine's own sizing so spans can be whole lattice cells.
  // Same target as the other sheets: the chrome cells must not change size
  // when you move between pages.
  var WIDE_MIN = 1240;
  var CELL_TARGET = 190;
  function predict() {
    return {
      cols: Math.min(16, Math.max(2, Math.round(window.innerWidth / CELL_TARGET))),
      rows: Math.min(24, Math.max(1, Math.round(window.innerHeight / CELL_TARGET))),
      wide: window.innerWidth >= WIDE_MIN
    };
  }

  // The document lives in a paper channel cut into the lattice: a full-height
  // reserved column, so scrolling text is always backed by the sheet instead
  // of floating over the drawing. Chrome takes the columns either side, which
  // is also why nothing can scroll underneath it.
  var SIDE = 2; // lattice columns reserved for chrome on each side

  function columns(L) {
    var cols = L ? L.cols : predict().cols;
    // a channel needs the two chrome columns plus at least two of its own
    if (cols < SIDE * 2 + 2) return { channel: false, start: 0, span: cols, cols: cols };
    return { channel: true, start: SIDE, span: cols - SIDE * 2, cols: cols };
  }

  function tileDefs() {
    var L = predict();
    var C = columns(L);
    var defs = [];
    // corner cells are 2 lattice columns each: without a channel the lattice
    // is too coarse for them, and CSS lays them out as a flush top row
    if (C.channel) {
      defs.push({ id: 'wordmark', kind: 'text' });
      defs.push({ id: 'menu', kind: 'text', at: 'tr' });
      defs.push({
        id: 'channel', kind: 'text',
        spanFrac: { x0: C.start / C.cols, x1: (C.start + C.span) / C.cols, y0: 0, y1: 1 }
      });
      // the index sits in the left chrome column, under the wordmark
      defs.push({
        id: 'index', kind: 'text',
        spanFrac: {
          x0: 0, x1: SIDE / C.cols,
          y0: 1 / L.rows, y1: Math.min(L.rows, 3) / L.rows
        }
      });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 1101, // the project's own seed: same identity as its row thumb
      tiles: tileDefs,
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
  window.__grid = sketch; // debug handle
  // onTiles only fires when the page actually reserved cells; run one pass
  // regardless so the CSS fallbacks and the column alignment always apply
  placeCells([]);

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
    Object.keys(overlays).forEach(function (id) {
      if (placed[id]) return;
      // unplaced cells fall back to their CSS layout: clear the inline
      // geometry so it cannot fight the stylesheet
      var el = overlays[id];
      el.classList.remove('is-placed');
      el.style.transform = '';
      el.style.width = '';
      el.style.height = '';
    });
    document.body.classList.add('tiles-ready');
    alignTries = 0;
    alignSoon();
  }

  // the reading column is not a tile (it outgrows the viewport), so instead
  // its edges are snapped onto the lattice's column lines: the document
  // reads as a continuation of the grid rather than a floating card
  // p5 runs setup() asynchronously, and rebuilds are debounced, so the
  // lattice may not exist yet: retry until it does
  var alignTries = 0;
  function alignSoon() {
    if (alignDocument() || alignTries++ > 12) return;
    setTimeout(alignSoon, 80);
  }

  function alignDocument() {
    var L;
    try { L = sketch.lattice(); } catch (e) { return false; }
    if (!L || !L.cols || !L.cw) return false;
    var root = document.documentElement.style;
    var C = columns(L);
    root.setProperty('--doc-x', Math.round(C.start * L.cw) + 'px');
    root.setProperty('--doc-w', Math.round(C.span * L.cw) + 'px');
    // clear the chrome: a full lattice row when it is canvas-drawn cells.
    // The fallback row is measured, not assumed - anything added to it (the
    // sound switch, a second line) would otherwise sit over the document.
    var top = Math.round(L.ch);
    if (!C.channel) {
      var wm = overlays.wordmark, mn = overlays.menu;
      var h = 0;
      if (wm) h = Math.max(h, wm.getBoundingClientRect().height);
      if (mn) h = Math.max(h, mn.getBoundingClientRect().height);
      top = Math.ceil(h) + 12;
    }
    root.setProperty('--doc-top', top + 'px');
    root.setProperty('--lat-ch', Math.round(L.ch) + 'px');
    document.body.classList.toggle('has-channel', C.channel);
    return true;
  }

  window.addEventListener('resize', function () {
    alignDocument();          // immediate, using the current lattice
    alignTries = 0;
    setTimeout(alignSoon, 260); // again after the engine's debounced rebuild
    setTimeout(sizeIndex, 280);
  });

  // the index keeps the lattice column's width and left edge, but only the
  // height its list needs - a full cell left a tall empty box beneath it
  function sizeIndex() {
    var el = overlays.index;
    if (!el || !el.classList.contains('is-placed')) return;
    if (!el.querySelector('.ci-list')) return;
    // measure with the list at its natural height: while the cell has a
    // fixed height the list is a flex child and collapses to nothing
    el.classList.add('is-measuring');
    el.style.height = 'auto';
    var h = Math.ceil(el.getBoundingClientRect().height);
    el.style.height = h + 'px';
    el.classList.remove('is-measuring');
    // paint the canvas cell at the same height, so the two stay one object
    try { sketch.setTileHeight('index', h); } catch (e) { /* no-op */ }
  }

  /* ---- the hero: grab the screens and turn them ----------------------
     A shallow 3D scene, not a model: drag (or arrow keys) rotates it, it
     eases back toward rest when released, and it drifts very slightly on
     its own until first touched, which is what advertises the affordance. */
  (function heroScene() {
    var scene = document.querySelector('[data-scene]');
    var stage = document.querySelector('[data-stage]');
    if (!scene || !stage) return;

    var REST_X = 4, REST_Y = -14;   // the resting three-quarter view
    var MAX_X = 22, MAX_Y = 38;     // never turn so far the screens read edge-on
    var rx = REST_X, ry = REST_Y, held = false, touched = false, id = null;
    var px = 0, py = 0, raf = 0;

    function paint() {
      stage.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      stage.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    }

    function clamp2(v, m) { return v < -m ? -m : v > m ? m : v; }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (held) return;
      if (!touched && !reduced) {
        // idle drift: slow, small, and it stops for good once you grab it
        rx = REST_X + Math.sin(now / 2600) * 1.6;
        ry = REST_Y + Math.sin(now / 1900) * 3.2;
      } else {
        rx += (REST_X - rx) * 0.06; // ease home
        ry += (REST_Y - ry) * 0.06;
      }
      paint();
    }

    scene.addEventListener('pointerdown', function (ev) {
      held = true;
      touched = true;
      id = ev.pointerId;
      px = ev.clientX;
      py = ev.clientY;
      scene.classList.add('is-held');
      scene.setPointerCapture(id);
    });

    scene.addEventListener('pointermove', function (ev) {
      if (!held || ev.pointerId !== id) return;
      ry = clamp2(ry + (ev.clientX - px) * 0.35, MAX_Y);
      rx = clamp2(rx - (ev.clientY - py) * 0.25, MAX_X);
      px = ev.clientX;
      py = ev.clientY;
      paint();
    });

    function release(ev) {
      if (!held || (ev && ev.pointerId !== id)) return;
      held = false;
      scene.classList.remove('is-held');
      if (id !== null && scene.hasPointerCapture && scene.hasPointerCapture(id)) {
        scene.releasePointerCapture(id);
      }
      id = null;
    }
    scene.addEventListener('pointerup', release);
    scene.addEventListener('pointercancel', release);

    scene.addEventListener('keydown', function (ev) {
      var step = 6;
      if (ev.key === 'ArrowLeft') ry = clamp2(ry - step, MAX_Y);
      else if (ev.key === 'ArrowRight') ry = clamp2(ry + step, MAX_Y);
      else if (ev.key === 'ArrowUp') rx = clamp2(rx + step, MAX_X);
      else if (ev.key === 'ArrowDown') rx = clamp2(rx - step, MAX_X);
      else return;
      ev.preventDefault();
      touched = true;
      paint();
    });

    paint();
    if (reduced) return; // static under reduced motion, still draggable
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(frame);
    });
  })();

  /* ---- clips play only while on screen -------------------------------
     Four silent loops running at once is wasted work and a distraction;
     each one starts when it scrolls into view and pauses when it leaves.
     Under reduced motion they stay paused and keep their poster.        */
  (function inViewClips() {
    var clips = [].slice.call(document.querySelectorAll('video[data-autoplay]'));
    if (!clips.length) return;
    if (reduced || typeof IntersectionObserver !== 'function') {
      clips.forEach(function (v) { v.setAttribute('controls', ''); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          var p = v.play();
          if (p && p.catch) p.catch(function () { v.setAttribute('controls', ''); });
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { threshold: 0.35 });
    clips.forEach(function (v) { io.observe(v); });
  })();

  /* ---- media slots: real files when present, placeholder when not ----- */
  document.querySelectorAll('.img-slot').forEach(function (slot) {
    var media = slot.querySelector('img, video');
    // only a real failure falls back to the labelled checker: a lazy image
    // or a preload="none" clip simply has not fetched yet, which is not the
    // same as missing (the clip shows its poster meanwhile)
    if (!media) { slot.classList.add('is-empty'); return; }
    function empty() { slot.classList.add('is-empty'); }
    media.addEventListener('error', empty, true);
    if (media.tagName === 'IMG' && media.complete && !media.naturalWidth) empty();
  });

  /* ---- section index: scroll-spy ------------------------------------ */
  (function buildIndex() {
    var host = document.getElementById('case-index');
    var panels = Array.prototype.slice.call(document.querySelectorAll('.case-panel[data-nav]'));
    if (!host || panels.length < 2) return;

    var list = document.createElement('ol');
    list.className = 'ci-list';
    var links = panels.map(function (panel, i) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + panel.id;
      a.innerHTML = '<span class="ci-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="ci-label">' + panel.dataset.nav + '</span>';
      // native anchors still work; this just adds smooth scroll + no hash
      a.addEventListener('click', function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });
    host.appendChild(list);

    host.classList.add('is-ready');
    sizeIndex();

    // the section whose top is closest to a line ~a third down the viewport
    var current = -1;
    function update() {
      var mark = window.innerHeight * 0.33;
      var best = 0, bestDist = Infinity;
      for (var i = 0; i < panels.length; i++) {
        var top = panels[i].getBoundingClientRect().top;
        var dist = Math.abs(top - mark);
        // prefer sections already started over ones still below the mark
        if (top <= mark + 1) { best = i; bestDist = 0; }
        else if (bestDist > 0 && dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best !== current) {
        current = best;
        links.forEach(function (a, j) {
          a.classList.toggle('is-current', j === best);
          if (j === best) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    window.__caseIndex = { update: update }; // debug/test handle
  })();

  // internal links exit through the mold, like the artwork sheets
  document.querySelectorAll('a[href$=".html"]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 ||
          ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.getAttribute('aria-current') === 'page') { ev.preventDefault(); return; }
      ev.preventDefault();
      document.body.classList.add('leaving');
      // the destination reads this and starts fully consumed, so the mold
      // retreats there instead of the page just appearing
      try { sessionStorage.setItem('grid-mold', '1'); } catch (e) { /* fine */ }
      // origin: the clicked link, so the ink spreads from where you pressed
      var r = a.getBoundingClientRect();
      sketch.sweepOut({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, function () {
        window.location.href = a.href;
      });
    });
  });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) window.location.reload();
  });
})();
