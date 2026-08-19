# studio

Local control site for LightWeaver (`http://127.0.0.1:5175/`).

Top nav is 工作台 / 片子. Under 工作台 a second nav: 组合 / 方法 / 音色 / 素材.
组合 (`/`) only picks a combo and copies the brief. Catalogs do not
persist films. `/films` is trajectory review. Agents generate via weaver.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/` 工作台 | human | optional plugins (method / voice / material) + langs + output home; copy brief |
| `/films` `/f/<id>` | human reviews | read-only trajectory: what was used, scenes, mp4 |
| `/voices` | human | voice plugin payloads: upload or instruct, keep, rename/text/delete |
| `/library` | human | material plugins: name + file; create / rename / replace / delete |
| `/methods` | human | method plugins: name + when + expand + scenes; create / edit / delete; go to `/` |

## Rules

- Server talks to `@lightweaver/weaver`. App `src/` only imports
  `/schema` `/voices` `/method` — never the Node barrel. Do not import
  the renderer or other repositories.
- `/api/media` may only serve `library/`, project roots (including
  gitignored `assets/outputs/`), and `data/voice-candidates/` (mint previews).
- `<video src>` must use `projectMedia(id, rel)` → `/api/media/project/…`.
  Never put a disk absolute path in `src`.
- No generate-narration button, no TTS/render chrome, no lab iframe, no
  Remotion Player. Do not add scene-authoring as the primary path.
- `film.kit` is optional `library:element|reference` (reference only).
- Agent brief lives only on `/`. Film pages do not copy a brief.
- Method, voice, and material catalogs are library plugins. Picking on
  `/` constrains the agent; leaving one empty does not. Methods are
  catalog rows (`kind: method`, name / when / expand / scenes).
  Studio reads `/api/library` only — do not join `/api/recipes`.
  `fixed` is an authored still list; `list` expands one still per
  apply-time item. Materials are name + file; id is allocated.
  Humans do not type method or material ids.
- Chinese UI labels. Identifiers English.
- Site density, not a marketing page. Token-first CSS in `src/index.css`.
- Theme is `data-theme` on `<html>`, persisted as `lightweaver-theme`. GitHub is this repo. ModelBest console: `MODELBEST_URL`.
