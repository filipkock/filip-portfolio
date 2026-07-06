/* site.js - shared wiring for all pages: hydrates [data-sketch] hosts
 * (header strips + card thumbnails) and runs the art tag filter.
 * Content lives in the HTML; only generative params ride on data attributes.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var engineOK = typeof window.createGridSketch === 'function' && typeof window.p5 === 'function';

  window.__sketches = { strips: [], cards: [] }; // debug handles

  if (!engineOK) {
    document.documentElement.classList.add('engine-failed');
  } else {
    document.querySelectorAll('[data-sketch="strip"]').forEach(function (el) {
      try {
        window.__sketches.strips.push(window.createGridSketch(el, {
          mode: 'strip',
          seed: Number(el.dataset.seed) || 401,
          animate: !reduced,
          reducedMotion: reduced,
          touch: coarse,
          buildIn: !reduced
        }));
      } catch (err) { /* band stays empty paper; the border keeps the layout */ }
    });

    document.querySelectorAll('[data-sketch="card"]').forEach(function (el) {
      try {
        var sketch = window.createGridSketch(el, {
          mode: 'card',
          seed: Number(el.dataset.seed) || 1,
          variant: el.dataset.variant || 'quadtree',
          animate: 'hover',
          reducedMotion: reduced,
          touch: coarse
        });
        window.__sketches.cards.push(sketch);
        if (!coarse && !reduced) {
          var hit = el.closest('.card, .art-cell') || el;
          hit.addEventListener('pointerenter', function () { sketch.setHover(true); });
          hit.addEventListener('pointerleave', function () { sketch.setHover(false); });
        }
      } catch (err) { /* empty bordered box is an acceptable fallback */ }
    });
  }

  // art tag filter: toggles [hidden]; the tag row itself is only shown
  // under html.js, so no-JS visitors simply see everything
  var tagRow = document.querySelector('.tag-row');
  if (tagRow) {
    tagRow.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-tag]');
      if (!btn) return;
      tagRow.querySelectorAll('button[data-tag]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      var tag = btn.dataset.tag;
      document.querySelectorAll('.art-cell').forEach(function (cell) {
        var tags = (cell.dataset.tags || '').split(/\s+/);
        cell.hidden = tag !== 'all' && tags.indexOf(tag) === -1;
      });
    });
  }
})();
