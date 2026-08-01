# Assets

Drop files at these paths and they appear automatically. Until a file
exists, the page shows a labelled checker placeholder in its place - so
missing media never breaks the layout.

## Case study: AI journaling assistant (case-ai-journal.html)

| Path | What it is |
|---|---|
| `img/case-ai/hero.jpg` | Hero: the assistant panel inside the journal (wide crop) |
| `img/case-ai/discovery.jpg` | Workflow map / exploration from discovery |
| `video/case-ai/walkthrough.mp4` | Full walkthrough: calendar → record → draft → save |
| `img/case-ai/walkthrough-poster.jpg` | Poster frame shown before the video plays |
| `img/case-ai/step-1.jpg` | Starting a session from the calendar |
| `img/case-ai/step-2.jpg` | Recording + transcription states |
| `img/case-ai/step-3.jpg` | SOAP draft in review / edit mode |
| `img/case-ai/step-4.jpg` | Second document from the same transcript |
| `img/case-ai/adoption.jpg` | Adoption over time (optional) |

Images are `object-fit: contain`, so screenshots are never cropped - any
aspect ratio is safe. The slot's own ratio is set inline in the HTML
(`--slot-ratio`) if you want to change the reserved space.

To add a slot elsewhere, copy the markup pattern:

```html
<div class="img-slot" data-slot="my-slot" style="--slot-ratio: 16 / 9">
  <img src="assets/img/…" alt="…" loading="lazy" decoding="async">
  <span class="slot-label">IMAGE · WHAT IT SHOULD SHOW</span>
</div>
```

## About page

| Path | What it is |
|---|---|
| `img/me-01.jpg` … `me-03.jpg` | Photo cells revealed on hover |
| `img/ff-01.jpg` … | Optional image per fun fact (`data-img` on the fact) |
