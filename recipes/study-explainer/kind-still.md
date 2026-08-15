---
id: kind-still
task: study-explainer
level: scene
when: |
  往 taxonomy 片加/绑一场。
---

# 一种 kind 一场

`id = kind`；`still = asset:still.<kind>`；`fit: contain`；`role: contrast`；文件名 `<kind>.png`（不要 `comp-01.png`）。不可当整片骨架。

```bash
npx weaver scene add --project nav-taxonomy --id floating --kind still \
  --still asset:still.floating --fit contain --role contrast
```
