# study-films

Remotion renderer for LightWeaver projects. First-party LightUI films live
in `projects/`. Capture adapters exist only for `intent-cascade` and
`dropdown-taxonomy`. `nav-taxonomy` / `sidebar-taxonomy` stills come from
the LightUI stage (`/s/<slug>/stage`) and live in each project's
`assets/stills/`.

```bash
npm run sync       # link public/projects + catalog
npm run studio     # Remotion preview
npx weaver capture --project intent-cascade
```

TTS / render / scene CRUD go through `npx weaver`.
