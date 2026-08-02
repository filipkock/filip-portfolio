/* interactions.js - shared pointer feel and sound, on every page that
 * runs the grid engine.
 *
 * 1. CURSOR  a red dot replaces the arrow on fine pointers, growing over
 *            anything clickable. Touch keeps the native pointer.
 * 2. SOUND   hovering the artwork plays it: each lattice cell the pointer
 *            crosses sounds one soft note, pitched by the cell's size, so
 *            fine dithered areas chime high and calm empty cells ring low.
 *            Off by default, toggled by a persistent button, remembered.
 *
 * The note is synthesised with the Web Audio API rather than p5.sound: it
 * is the same engine p5.sound wraps, without the ~300KB dependency, and it
 * gives direct control over the autoplay gesture. The musical input comes
 * from the sketch itself via window.__grid.cellAt().
 */
(function () {
  'use strict';

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---- 1. cursor ----------------------------------------------------- */
  (function cursor() {
    if (!fine) return;

    var dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.documentElement.classList.add('has-dot');

    var HIT = 'a, button, [role="button"], input, textarea, select, summary';
    var x = -100, y = -100, shown = false;

    function place() {
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%)';
    }

    document.addEventListener('pointermove', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      x = ev.clientX;
      y = ev.clientY;
      place();
      if (!shown) { shown = true; dot.classList.add('is-live'); }
      var near = ev.target.closest ? ev.target.closest('[data-cursor]') : null;
      // an element can name what it does; the dot becomes that word
      if (near) {
        var text = near.getAttribute('data-cursor');
        if (dot.textContent !== text) dot.textContent = text;
        dot.classList.add('has-label');
        dot.classList.remove('is-link');
        return;
      }
      if (dot.textContent) dot.textContent = '';
      dot.classList.remove('has-label');
      dot.classList.toggle('is-link', !!(ev.target.closest && ev.target.closest(HIT)));
    }, { passive: true });

    document.addEventListener('pointerdown', function () { dot.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { dot.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () { dot.classList.remove('is-live'); });
    document.addEventListener('mouseenter', function () { dot.classList.add('is-live'); });
  })();

  /* ---- 2. sound ------------------------------------------------------ */
  (function sound() {
    var KEY = 'grid-sound';
    var host = document.getElementById('grid-host');
    if (!host) return; // pages without the artwork have nothing to sound

    // one octave of a pentatonic scale, low to high: no wrong notes
    var SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    var BASE = 220; // A3
    var MIN_GAP_MS = 55;
    var CELL_SMALL = 8, CELL_LARGE = 320; // px, maps onto the scale

    var ctx = null, master = null, on = false, lastAt = 0, lastKey = null;

    try { on = localStorage.getItem(KEY) === 'on'; } catch (e) { /* private mode */ }

    function build() {
      if (ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      // a gentle roll-off keeps the plucks soft rather than glassy
      var tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      tone.Q.value = 0.4;
      master.connect(tone);
      tone.connect(ctx.destination);
      return true;
    }

    function ramp(to) {
      if (!master) return;
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + 0.25);
    }

    // smaller cell -> higher note, so dense dithered areas sparkle
    function noteFor(w) {
      var t = (Math.log(Math.max(CELL_SMALL, Math.min(CELL_LARGE, w))) - Math.log(CELL_SMALL)) /
        (Math.log(CELL_LARGE) - Math.log(CELL_SMALL));
      var i = Math.round((1 - t) * (SCALE.length - 1));
      return BASE * Math.pow(2, SCALE[i] / 12);
    }

    /* one voice for the whole site: a sine with a quiet fifth above it.
       Cells and tiles differ only in how it is played. */
    function tone(freq, pan, dur, level, when) {
      var t = when || ctx.currentTime;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.006); // soft attack
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var air = ctx.createOscillator();   // a fifth above, very quiet: body
      air.type = 'triangle';
      air.frequency.value = freq * 1.5;
      var airGain = ctx.createGain();
      airGain.gain.value = 0.12;

      var out = g;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner();
        p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
        g.connect(p);
        out = p;
      }
      osc.connect(g);
      air.connect(airGain);
      airGain.connect(g);
      out.connect(master);

      osc.start(t); air.start(t);
      osc.stop(t + dur + 0.05); air.stop(t + dur + 0.05);
    }

    function pluck(freq, pan) {
      tone(freq, pan, 0.55, 0.5);
    }

    /* the wipe's voice: the same notes, played as a quick rising figure
       that travels left to right with the ink. Same material as the cells,
       different gesture - so a tile reads as an event, not another chime. */
    function swish() {
      var t = ctx.currentTime;
      var start = 3; // a few degrees up the same pentatonic scale
      for (var i = 0; i < 3; i++) {
        var f = BASE * Math.pow(2, SCALE[Math.min(SCALE.length - 1, start + i * 2)] / 12) * 2;
        tone(f, -0.45 + i * 0.45, 0.3, 0.22, t + i * 0.055);
      }
    }

    function ready(ev) {
      if (!on || !ctx || ctx.state !== 'running') return false;
      return !(ev.pointerType && ev.pointerType !== 'mouse');
    }

    /* cells sound only over bare artwork: a tile has its own voice, and
       hearing both at once just muddles them */
    var WIPES = '.tile-link, .w-row, .ff-toggle';

    function hover(ev) {
      if (!ready(ev)) return;
      if (ev.target.closest && ev.target.closest(WIPES)) return;
      var now = performance.now();
      if (now - lastAt < MIN_GAP_MS) return;
      var grid = window.__grid;
      if (!grid || typeof grid.cellAt !== 'function') return;
      // canvas space: the hosts are all viewport-anchored
      var r = host.getBoundingClientRect();
      var cell = grid.cellAt(ev.clientX - r.left, ev.clientY - r.top);
      if (!cell) return;
      var key = Math.round(cell.x) + ':' + Math.round(cell.y);
      if (key === lastKey) return; // one note per cell entered
      lastKey = key;
      lastAt = now;
      pluck(noteFor(cell.w), (ev.clientX / window.innerWidth) * 2 - 1);
    }

    document.addEventListener('pointermove', hover, { passive: true });

    // one swish per wiping element entered (delegated: rows and tiles are
    // created or re-placed after this script runs)
    var lastWipe = null;
    document.addEventListener('pointerover', function (ev) {
      if (!ready(ev)) return;
      var el = ev.target.closest && ev.target.closest(WIPES);
      if (!el || el === lastWipe) return;
      lastWipe = el;
      swish();
    }, { passive: true });

    document.addEventListener('pointerout', function (ev) {
      var el = ev.target.closest && ev.target.closest(WIPES);
      if (el && el === lastWipe && !el.contains(ev.relatedTarget)) lastWipe = null;
    }, { passive: true });

    // keyboard focus wipes the same way, so it should sound the same
    document.addEventListener('focusin', function (ev) {
      if (!on || !ctx || ctx.state !== 'running') return;
      if (ev.target.closest && ev.target.closest(WIPES)) swish();
    });

    /* the toggle: same corner on every page, inside the wordmark cell */
    var slot = document.querySelector('[data-cell="wordmark"]') ||
      document.querySelector('.site-head');
    if (!slot) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sound-toggle';
    // icon only: a speaker, waves when on, crossed out when off
    btn.innerHTML =
      '<svg class="sound-icon" viewBox="0 0 20 16" width="18" height="15" aria-hidden="true" focusable="false">' +
      '<path class="si-body" d="M2 6h3.2L9.5 2.6v10.8L5.2 10H2z"/>' +
      '<path class="si-wave si-wave-1" d="M12.4 6.2a3.4 3.4 0 0 1 0 3.6"/>' +
      '<path class="si-wave si-wave-2" d="M14.7 4a6.4 6.4 0 0 1 0 8"/>' +
      '<path class="si-mute" d="M12.6 6.2 16.4 9.8M16.4 6.2 12.6 9.8"/>' +
      '</svg>';
    slot.appendChild(btn);

    function paint() {
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Sound on - click to mute' : 'Sound off - click to unmute');
      btn.classList.toggle('is-on', on);
    }

    btn.addEventListener('click', function () {
      on = !on;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* fine */ }
      if (on) {
        if (!build()) { on = false; paint(); return; }
        // the click is the gesture browsers require before audio may play
        if (ctx.state === 'suspended') ctx.resume();
        ramp(0.5);
      } else if (ctx) {
        ramp(0.0001);
      }
      paint();
    });

    // remembered as on: still needs one gesture before the context starts
    if (on) {
      var wake = function () {
        if (build() && ctx.state === 'suspended') ctx.resume();
        if (ctx) ramp(0.5);
        window.removeEventListener('pointerdown', wake);
        window.removeEventListener('keydown', wake);
      };
      window.addEventListener('pointerdown', wake);
      window.addEventListener('keydown', wake);
    }
    paint();
  })();
})();
