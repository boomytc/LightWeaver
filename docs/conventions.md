# How to add a film

One directory per film. Scene ids live only in `film.json`.

## Project layout

```
film.json                 scenes, locale copy, voice refs, publish
assets.json               project asset registry
assets/stills/<locale>/   stills
assets/lines/<locale>/    spoken wavs
assets/outputs/           rendered mp4
```

First-party LightUI films: `products/study-films/projects/<id>/`.
User films: `data/projects/<id>/`.

Shared voices / elements / references: `library/assets.json`.

## film.json

- `voices.<locale>` is a ref (`library:voice.prompt-zh`).
- `scenes[].still` is a ref (`asset:still.problem`).
- `scenes[].lines.<locale>` is the spoken sentence. Do not keep a second
  narration file.

Register nothing by hand. `weaver sync` writes Remotion
`src/generated/catalog.json` and `public/projects/<id>` links.

## After adding

```bash
make weaver ARGS='validate <id>'
make remotion
```

Capture (LightUI lab only) still lives in
`products/study-films/scripts/capture.mjs`.
