# study-films

Remotion renderer for LightWeaver. Task instances (film.json, stills, wav,
mp4) live in `data/first-party/` and `data/projects/` — not in this
package, not in git. `weaver capture` reads LightUI `/s/<slug>/stage`
and writes stills into `data/first-party/<id>/assets/stills/`.

```bash
npm run sync       # link public/projects + catalog
npm run studio     # Remotion preview
npx weaver capture --project intent-cascade
npx weaver render --project intent-cascade   # writes data/first-party/<id>/assets/outputs/
```

TTS / render / scene CRUD go through `npx weaver`.
