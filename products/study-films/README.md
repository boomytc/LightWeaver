# study-films

Remotion renderer for LightWeaver projects. First-party LightUI films live
in `projects/`. Capture adapters exist only for `intent-cascade` and
`dropdown-taxonomy`. `nav-taxonomy` / `sidebar-taxonomy` are study-explainer
scaffolds: scene list is ready, stills are uploaded by hand.

```bash
npm run sync       # link public/projects + catalog
npm run studio     # Remotion preview
npx weaver capture --project intent-cascade
```

TTS / render / scene CRUD go through `npx weaver`.
