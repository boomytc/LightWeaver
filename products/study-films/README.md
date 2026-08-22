# study-films

Remotion renderer for LightWeaver. Task instances (film.json, stills, wav,
mp4) live in `data/first-party/<task>/<id>/` and
`data/projects/<task>/<id>/` — not in this package, not in git. Capture / TTS live in `weaver/scripts`.

```bash
npm run sync       # link public/projects + catalog
npm run studio     # Remotion preview
npx weaver capture --project intent-cascade
npx weaver render --project intent-cascade   # writes data/.../<task>/<id>/assets/outputs/
```

TTS / render / scene CRUD go through `npx weaver`.
