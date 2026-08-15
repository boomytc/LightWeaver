# studio

Local workbench for LightWeaver: projects, asset library, scene lines,
validate / tts / render jobs. Bind to `127.0.0.1`.

## Rules

- Talk to `@lightweaver/weaver` and `/api/*` only. Do not import Remotion
  or LightUI source.
- `/api/media` may only serve `library/` and project roots.
- Chinese UI labels. Identifiers English.
- Workbench density, not a marketing page. Token-first CSS in `src/index.css`.
