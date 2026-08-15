# study-films

Scene explainer product. Bind capture to `127.0.0.1`. Film definitions are
JSON; Remotion compositions are generated from `src/lib/catalog.ts`.

## Layout

```
films/<id>.json          scene list + locale copy + publish dest
scripts/narration.json   spoken lines
scripts/paths.mjs        LIGHTUI_ROOT / LAB_URL / film job list
scripts/capture.mjs      LightUI lab adapter (Playwright)
scripts/tts.py           VoxCPM2 Hi-Fi clone
scripts/render.mjs       Remotion + ffmpeg + publish
src/                     Remotion root, scene cards, subtitles
public/stills            first-party fixtures
public/voice             first-party fixtures
assets/                  locale prompt wavs
```

## Rules

- Add a film by writing JSON + narration + one import in `src/lib/catalog.ts`.
- Capture code may know LightUI lab selectors. Do not generalize capture
  until a second source exists.
- Publish destination is `LIGHTUI_ROOT` + `film.publish.dir`. Fail if that
  root is missing when publishing.
- Brand text comes from the film JSON, not hardcoded "LightUI" in cards.
- Comments and operator logs: Chinese. Identifiers: English.
