# study-films

First product in LightWeaver: scene-orchestrated explainer films.

Stills come from the running LightUI lab (`http://127.0.0.1:5173/s/<slug>`).
Each study gets a Chinese film and an English film. Voice is VoxCPM2 Hi-Fi
clone from a per-locale prompt wav. Subtitles follow the spoken sentences.

Published mp4s and Chinese stills still land in LightUI
`studies/<slug>/references/`. This product owns the pipeline.

## Outputs

| Study | Chinese | English |
| --- | --- | --- |
| intent-cascade | `cursor-movement.mp4` | `cursor-movement.en.mp4` |
| dropdown-taxonomy | `source-tutorial.mp4` | `source-tutorial.en.mp4` |

## Prerequisites

- LightUI lab: `make dev` in the LightUI repo (`LIGHTUI_ROOT`, default `../../../LightUI`)
- Chromium for Playwright (installed on first capture)
- `MODELBEST_API_KEY` and `MODELBEST_BASE_URL`, or `config.local.yaml` (gitignored)
- `ffmpeg` on `PATH`
- `python3` with `requests` and `pyyaml` (`pip install -r requirements.txt`)

## Commands

From this directory, after `npm install`:

```bash
npm run studio     # preview compositions
npm run capture    # lab stills (zh → LightUI references + public/stills; en → public/stills/en)
npm run tts        # Hi-Fi clone WAV lines into public/voice/{zh,en}
                   # add -- --seed to rebuild prompt wavs
npm run render     # Remotion, then 720p CRF 26 → LightUI studies/*/references
npm run films      # all three
npm test
npm run typecheck
```

From the LightWeaver repo root: `make films`. From the LightUI repo root:
`make films` (forwards here).

Do not mention sibling private repos on public LightUI lab pages.
