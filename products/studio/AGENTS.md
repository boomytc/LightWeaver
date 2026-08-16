# studio

Local control site for LightWeaver (`http://127.0.0.1:5175/`).

Humans pick a combo on `/` (voices + kit + film-level recipe) and copy
the agent brief. They supervise catalogs at `/voices` and `/library`.
Agents write scenes and generate video via weaver. This site does not
author or render films.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` | both | map: films, voices, materials |
| `/films` `/f/<id>` | human names; agent produces | voices + `kit`; review scenes/mp4 |
| `/voices` | human | listen, add, edit clone text/style |
| `/library` | human | accumulate elements and references |

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
