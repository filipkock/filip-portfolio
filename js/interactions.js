/* interactions.js - shared pointer feel, sound, and the motion switch, on
 * every page that runs the grid engine.
 *
 * 1. CURSOR  a red dot replaces the arrow on fine pointers, growing over
 *            anything clickable. Touch keeps the native pointer.
 * 2. SOUND   hovering the artwork plays it: each lattice cell the pointer
 *            crosses sounds one soft note, pitched by the cell's size, so
 *            fine dithered areas chime high and calm empty cells ring low.
 *            Off by default, toggled by a persistent button, remembered.
 *            A remembered "on" cannot sound until the visitor has clicked
 *            once, so the switch carries a small note saying so until then.
 * 3. MOTION  a switch beside it freezes the artwork into a still
 *            image. The state itself lives in the engine (window.gridMotion),
 *            which every live sketch listens to; this file is only the
 *            control. Hidden when the OS already asks for reduced motion,
 *            where there is nothing left to stop.
 * 4. TYPE    the small chrome links (wordmark, menus, contact) are re-set in
 *            the engine's 5x7 pixel face, so the chrome speaks the same type
 *            as the big tiles it sits among.
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
    // the word rides in its own element inside the dot: the dot owns the
    // transform that follows the pointer and the size the pill grows to, the
    // label owns its fade, so neither animation fights the other for a
    // property
    var label = document.createElement('span');
    label.className = 'cursor-label';
    dot.appendChild(label);
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
      // an element can name what it does; the dot grows into that word
      if (near) {
        var text = near.getAttribute('data-cursor');
        // a caption that leaves the sheet says so. The arrow is appended here
        // rather than written into every data-cursor so it can never drift
        // from what the element actually does.
        if (near.matches('a[target="_blank"]') || near.closest('a[target="_blank"]')) {
          text += ' ↗';
        }
        // the pill needs a real size to grow towards - `width: auto` does not
        // animate - so the label's own box is measured and handed to CSS.
        // Only when the word changes, and with offsetWidth, which ignores the
        // scale the label enters on.
        if (label.textContent !== text) {
          label.textContent = text;
          dot.style.setProperty('--label-w', label.offsetWidth + 'px');
          dot.style.setProperty('--label-h', label.offsetHeight + 'px');
        }
        dot.classList.add('has-label');
        dot.classList.remove('is-link');
        return;
      }
      // the word is left in place rather than cleared: it fades out with the
      // pill instead of vanishing the instant the pointer leaves
      dot.classList.remove('has-label');
      dot.classList.toggle('is-link', !!(ev.target.closest && ev.target.closest(HIT)));
    }, { passive: true });

    document.addEventListener('pointerdown', function () { dot.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { dot.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () { dot.classList.remove('is-live'); });
    document.addEventListener('mouseenter', function () { dot.classList.add('is-live'); });
  })();

  /* both switches share one row, pinned inside the wordmark cell: they are
     the same kind of control, so they read as a pair rather than as two
     lone marks. Built on demand, placed by slot rather than in call order:
     motion sits first and sound last, so the sound switch is the neighbour of
     the note that hangs off the end of the row. */
  var switchSlot = document.querySelector('[data-cell="wordmark"]') ||
    document.querySelector('.site-head');
  var switchRow = null;

  function addSwitch(cls, svg, slot) {
    if (!switchSlot) return null;
    if (!switchRow) {
      switchRow = document.createElement('div');
      switchRow.className = 'cell-switches';
      switchSlot.appendChild(switchRow);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell-switch ' + cls;
    btn.innerHTML = svg;
    btn.dataset.slot = slot;
    // the row is kept in slot order, so DOM order, reading order and tab order
    // stay the same thing however the sections are called
    var after = null;
    [].forEach.call(switchRow.children, function (el) {
      if (!after && el.dataset.slot && Number(el.dataset.slot) > slot) after = el;
    });
    switchRow.insertBefore(btn, after); // a null anchor appends
    // the nudge rides at the end of the row, after every switch: it is moved
    // along rather than stranded among them
    var nudge = switchRow.querySelector('.switch-nudge');
    if (nudge) switchRow.appendChild(nudge);
    return btn;
  }

  /* ---- 2. sound ------------------------------------------------------ */
  (function sound() {
    // the sound is played by hovering the artwork, and only mouse pointers
    // hover: on touch the whole feature is unreachable, so building its
    // switch would ship a control that does nothing
    if (!fine) return;
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
    // icon only: a speaker, waves when on, crossed out when off
    var btn = addSwitch('sound-toggle',
      '<svg class="switch-icon" viewBox="0 0 20 16" width="18" height="15" aria-hidden="true" focusable="false">' +
      '<path class="si-body" d="M2 6h3.2L9.5 2.6v10.8L5.2 10H2z"/>' +
      '<path class="si-wave si-wave-1" d="M12.4 6.2a3.4 3.4 0 0 1 0 3.6"/>' +
      '<path class="si-wave si-wave-2" d="M14.7 4a6.4 6.4 0 0 1 0 8"/>' +
      '<path class="si-mute" d="M12.6 6.2 16.4 9.8M16.4 6.2 12.6 9.8"/>' +
      '</svg>', 2);
    if (!btn) return;

    function paint() {
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Sound on - click to mute' : 'Sound off - click to unmute');
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
      hideNudge(); // this click is the gesture, whichever way it moved
      paint();
    });

    /* a switch that reads "on" while nothing can be heard is a small lie, and
       the reason is invisible: the browser holds the audio until the visitor
       has touched the page once. So the switch says so, quietly, beside
       itself - and the note leaves on the first click or key, which is the
       same gesture that lets the sound in. Never shown from a cold start,
       where sound is off and there is nothing to explain. */
    var nudge = null, nudged = false;

    function showNudge() {
      if (nudge || nudged) return;
      nudged = true;
      nudge = document.createElement('span');
      nudge.className = 'switch-nudge';
      // the label is decoration: pressing any key both dismisses it and
      // starts the sound, so a reader who cannot see it loses nothing
      nudge.setAttribute('aria-hidden', 'true');
      nudge.textContent = 'Click to allow sound';
      // it joins the switch row as a third box rather than floating over it,
      // next to the speaker it speaks for: the pair keeps its own space, and a
      // narrow cell wraps the note the same way it wraps the switches. It
      // fades in on a CSS animation rather than a class flipped a frame later,
      // so a page opened in a background tab still shows it when looked at.
      switchRow.appendChild(nudge);
    }

    function hideNudge() {
      if (!nudge) return;
      var el = nudge;
      nudge = null;
      el.classList.add('is-gone');
      setTimeout(function () { el.remove(); }, 300);
    }

    // remembered as on: still needs one gesture before the context starts
    if (on) {
      var settle = function () {
        // resume resolves a beat later, by which time the gesture may have
        // been the mute button itself: the switch, not this, decides the level
        if (ctx && on) ramp(0.5);
        hideNudge();
        window.removeEventListener('pointerdown', wake);
        window.removeEventListener('keydown', wake);
      };
      var wake = function () {
        if (!build()) return;
        if (ctx.state === 'suspended') {
          // resume can be refused: the note stays until it is not. Older
          // Safari resumes without handing back a promise, and is trusted.
          var p = ctx.resume();
          if (p && p.then) p.then(settle, function () { /* still waiting */ });
          else settle();
        } else {
          settle();
        }
      };
      // a context built running means the gesture is already spent (a reload
      // inside the same interaction, say): nothing to ask for
      if (build() && ctx.state === 'running') {
        settle();
      } else {
        showNudge();
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake);
      }
    }
    paint();
  })();

  /* ---- 3. motion ----------------------------------------------------- */
  (function motion() {
    var M = window.gridMotion;
    if (!M) return; // engine absent: nothing is moving anyway
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // the pair belongs to the artwork: pages that only carry card thumbnails
    // (art) animate on hover alone, and their header is not this chrome
    if (!document.getElementById('grid-host')) return;

    // the glyph is the state, as on the speaker: a play mark while the
    // artwork runs, pause bars once it is frozen
    var btn = addSwitch('motion-toggle',
      // the same 20x16 box as the speaker, so the two switches match
      '<svg class="switch-icon" viewBox="0 0 20 16" width="18" height="15" aria-hidden="true" focusable="false">' +
      '<path class="mi-pause" d="M6.2 2.6h2.8v10.8H6.2zM11 2.6h2.8v10.8H11z"/>' +
      '<path class="mi-play" d="M6.8 2.6 14.8 8 6.8 13.4z"/>' +
      '</svg>', 1);
    if (!btn) return;

    function paint() {
      // pressed is the running state, so accent means "moving" here just as
      // it means "audible" on the speaker
      var on = !M.paused();
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on
        ? 'Animation playing - click to pause'
        : 'Animation paused - click to play');
    }

    btn.addEventListener('click', function () {
      M.set(!M.paused());
      paint();
    });

    paint();
  })();

  /* ---- 4. type: chrome labels in the tiles' pixel face ---------------- */
  (function pixelLabels() {
    if (typeof window.pixelWordSVG !== 'function') return;
    // every small chrome link, across page shells: the overlay pages'
    // wordmark/menu/contact cells, the case pages' header cells, and the art
    // page's plain site-head/site-foot
    var links = document.querySelectorAll(
      '.wordmark a, a.wordmark, [data-cell="menu"] a, [data-cell="contact"] a, ' +
      '.site-head nav a, .site-foot nav a');
    links.forEach(function (a) {
      var text = a.textContent.replace(/\s+/g, ' ').trim();
      var svg = window.pixelWordSVG(text);
      if (!svg) return; // a glyph the face lacks: the mono text stands
      a.textContent = '';
      a.insertAdjacentHTML('beforeend', svg);
      // the SVG is decoration; the name stays real text for assistive tech
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = text;
      a.appendChild(sr);
    });
  })();
})();
