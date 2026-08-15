# How to add a film

One JSON file per film. Do not start a second implementation of the same
film unless the first one is retired.

## Name

Use a short kebab-case slug that names the *subject*, matching the LightUI
study slug when the film is a study explainer.

Good: `intent-cascade`, `dropdown-taxonomy`.
Bad: `film-1`, `new-demo`.

## Required files

```
products/study-films/
  films/<id>.json           scene list, locale copy, publish dest
  scripts/narration.json    spoken lines per locale (same scene ids)
  src/lib/catalog.ts        import the new JSON (Remotion has no glob)
```

If the source is a live LightUI lab page, add a capture path in
`scripts/capture.mjs`. Do not invent a plugin layer for a second source
kind until one exists.

`films/<id>.json` should answer:

1. Which scenes, in order, and which still each still-scene uses.
2. Title / close card copy per locale.
3. Where the rendered mp4 is published (`publish.dir` relative to
   `LIGHTUI_ROOT` for LightUI studies).

`scripts/narration.json` is the spoken script. Every scene id must have a
line in every locale the film declares.

## After adding

```bash
make typecheck
make test
make studio
```

Confirm the new `<id>-zh` and `<id>-en` compositions. Capture and render
only after the lab page (if any) can be driven headlessly.

Voice wavs under `public/voice/` and stills under `public/stills/` are
fixtures. Do not commit Remotion `out/` intermediates.
