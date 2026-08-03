# Filip Kockendal - portfolio

Personal portfolio and landing page. A parametric black and white grid system,
drawn live with p5.js: recursive quadtree subdivision, dithered noise fields,
plotter-pen aesthetic.

Plain HTML/CSS/JS. No build step, no framework. The only dependency is p5.js,
loaded from a pinned CDN.

## Run

```
python3 dev/serve.py 8137
# -> http://localhost:8137 (no-cache, edits show on plain reload)
```

Plain `python3 -m http.server` works too, but the browser will cache
js/css heuristically - you then need hard refreshes after every edit.

Opening `index.html` directly from the filesystem also works (all scripts are
classic scripts, no modules).

## Structure

```
index.html                     landing: living grid, tiles = navigation
work.html                      project index: rows plus a live preview cell
about.html                     bio panel, action tiles, fun-fact drawer
art.html                       generative art gallery (tag-filterable)
case-ai-journal.html           P-01 case study
case-continuous-research.html  P-02 case study
css/style.css                  the single shared stylesheet
js/grid-engine.js              the generative engine (window.createGridSketch)
js/landing.js                  landing: tile links, mold page exits
js/work.js                     work page: row wipes, preview, case links
js/about.js                    about page: cells, photo hovers, fact drawer
js/case.js                     case pages: paper channel, section index
js/interactions.js             shared: red dot cursor, hover sound + toggle
js/site.js                     art page: header strips, thumbs, tag filter
assets/                        img, video, fonts (some slots still empty)
dev/engine-test.html           engine playground: seeds, modes, HUD
dev/serve.py                   the no-cache server used by Run, above
```

## Edit

- Content lives directly in the HTML files.
- About page fun facts: each fact is an `<li class="ff-fact">` in about.html
  (heading + one paragraph). `js/about.js` turns the list into a click-through
  deck and builds one tick per item, so adding or removing a fact is a pure
  HTML edit. Without JS the whole list just shows.
- About page photos: drop `me-01.jpg`, `me-02.jpg`, `me-03.jpg` into
  `assets/img/` - the hover cells show a checker placeholder until then.
  The RESUME tile points at `assets/resume.pdf` (also not in the repo yet).
- Hover-images easter egg: drop images into `assets/img/` and list their
  paths in `HOVER_IMAGES` at the top of `js/landing.js` - hovering the
  landing grid then reveals a random one in the cell under the cursor.
- Every generative canvas is a `data-sketch` host; its `data-seed` is the
  piece's stable identity. Seeds are curated by eye - change one and the
  thumbnail changes forever, so pick deliberately (use the playground).
- Case study media: each `.img-slot` holds a real `<img>` or `<video>` at the
  path in the markup, and falls back to a checker placeholder until that file
  exists. Still missing: `assets/img/case-research/backlog.png`, and the
  invoice example in P-02 carries a visible TO CONFIRM line.
- Sound and cursor live in `js/interactions.js`. Hovering the artwork sounds
  one note per lattice cell entered, pitched by cell size; the toggle sits in
  the wordmark cell and remembers its state. `--accent` in the tokens is the
  cursor red, the only colour on the site.
- Composition tunables live in the `TUNE` block at the top of
  `js/grid-engine.js`.
