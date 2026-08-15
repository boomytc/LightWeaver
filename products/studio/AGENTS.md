# studio

Local review surface for LightWeaver. Films are written by an agent via
weaver; this UI inspects issues, plays local mp4s, edits lines, and binds
stills. Bind to `127.0.0.1`.

## Rules

- Talk to `@lightweaver/weaver` and `/api/*` only. Do not import Remotion
  or LightUI source.
- `/api/media` may only serve `library/` and project roots (including
  gitignored `assets/outputs/`).
- `<video src>` must use `projectMedia(id, rel)` → `/api/media/project/…`.
  Never put a disk absolute path in `src`.
- No generate-narration button, no lab iframe, no Remotion Player.
- Chinese UI labels. Identifiers English.
- Review-surface density, not a marketing page. Token-first CSS in `src/index.css`.
