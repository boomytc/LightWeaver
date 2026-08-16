# studio

Local control site for LightWeaver (`http://127.0.0.1:5175/`).

Top nav is 工作台 / 片子. Under 工作台 a second nav: 组合 / 方法 / 音色 / 素材.
组合 (`/`) only picks a combo and copies the brief. Catalogs do not
persist films. `/films` is instances. Agents generate via weaver.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` 工作台 | human | pick combo (langs + voice + kit + recipe); copy brief; do not persist |
| `/films` `/f/<id>` | human names; agent produces | voices + kit + recipe; review scenes/mp4 |
| `/voices` | human | kept wav is the pack; mint, listen, keep; ModelBest console link |
| `/library` | human | accumulate elements and references |
| `/methods` | human | reusable film cards: when, shape, apply; copy usage |

## Rules

- Talk to `@lightweaver/weaver` and `/api/*` only. Do not import Remotion
  or LightUI source.
- `/api/media` may only serve `library/`, project roots (including
  gitignored `assets/outputs/`), and `data/voice-candidates/` (mint previews).
- `<video src>` must use `projectMedia(id, rel)` → `/api/media/project/…`.
  Never put a disk absolute path in `src`.
- No generate-narration button, no TTS/render chrome, no lab iframe, no
  Remotion Player. Do not add scene-authoring as the primary path.
- `film.kit` is `library:element|reference` only.
- Chinese UI labels. Identifiers English.
- Site density, not a marketing page. Token-first CSS in `src/index.css`.
- Theme is `data-theme` on `<html>`, persisted as `lightweaver-theme`. GitHub is this repo. ModelBest console: `MODELBEST_URL`.
