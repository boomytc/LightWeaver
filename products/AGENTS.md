# Products

Each `products/<name>/` is a standalone product root: its own manifest,
commands, fixtures, and `AGENTS.md`.

- Do not import sibling products at runtime.
- Do not read LightUI or CineWeaver source as a library. Capture may HTTP
  the LightUI lab; publish may copy files into `LIGHTUI_ROOT`.
- Product runtime data (`out/`, `.cache/`) stays product-local and gitignored.
- First-party stills and voice wavs under `public/` are fixtures, not cache.

Index: `study-films` is the only product today. Add a second product only
when there is a real, separate surface — not to express a future editor.
