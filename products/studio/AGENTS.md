# studio

Local control site for LightWeaver (`http://127.0.0.1:5175/`).

Top nav is 工作台 / 片子. Under 工作台 a second nav: 组合 / 方法 / 音色 / 素材.
组合 (`/`) only picks a combo and copies the brief. Catalogs do not
persist films. `/films` is instances. Agents generate via weaver.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` 工作台 | human | pick combo; copy brief; do not persist |
| `/films` `/f/<id>` | human names; agent produces | voices + kit + recipe; review scenes/mp4 |
| `/voices` | human | listen, add, edit clone text/style |
| `/library` | human | accumulate elements and references |
| `/methods` | human | film-level method cards; which films use them |

## Rules

- Talk to `@lightweaver/weaver` and `/api/*` only. Do not import Remotion
  or LightUI source.
- `/api/media` may only serve `library/` and project roots (including
  gitignored `assets/outputs/`).
- `<video src>` must use `projectMedia(id, rel)` → `/api/media/project/…`.
  Never put a disk absolute path in `src`.
- No generate-narration button, no TTS/render chrome, no lab iframe, no
  Remotion Player. Do not add scene-authoring as the primary path.
- `film.kit` is `library:element|reference` only.
- Chinese UI labels. Identifiers English.
- Site density, not a marketing page. Token-first CSS in `src/index.css`.
- Theme is `data-theme` on `<html>`, persisted as `lightweaver-theme`. GitHub is this repo.
