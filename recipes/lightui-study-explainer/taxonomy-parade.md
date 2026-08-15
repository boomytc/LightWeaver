---
id: taxonomy-parade
task: study-explainer
level: film
when: |
  study 以 kinds.ts 列出互斥模型，idea.md 用「名称/场景/规则」
  收束，close 要点破易混对。
canon:
  - dropdown-taxonomy
  - nav-taxonomy
  - sidebar-taxonomy
requires_kinds: true
---

# 对照表阅兵

## 何时

`kinds.ts` 列出互斥模型；close 点破易混对。

## 骨架

1. `title` — recipe `study-title`
2. 每个 kind 一场 still — recipe `kind-still`（`role: contrast`）
3. `close` — recipe `say-it-this-way`，易混对来自 idea.md

一种 LightUI kind 一场 still。禁止把 7/9/5 个模型压进一场。scene id = kind id，来自 LightUI `kinds.ts` 的 `KindId`；weaver 不 parse TS。

## 旁白义务

每场 still 用听者的话讲清「交出去什么、面板关不关」。不要把 idea.md 的「叶子 / 提交模型 / leaf / commit model」原样念出来。close 用易混对。中间场不要过早收束。

## 实证

- dropdown：`select` `multi` `grouped` `cascader` `split` `mega` `date`
- nav：`floating` `sidebar` `breadcrumb` `dropdown` `mega` `drawer` `overlay` `scrollspy` `shrink`
- sidebar：`floating` `wheel` `multilevel` `collapsible` `offcanvas`

dropdown 历史 `comp-0N.png` 不要复制；新片 / nav / sidebar 用 `<kind>.png`。

## 展开

对每个 kind：`scene add --id <kind> --kind still --still asset:still.<kind> --fit contain --role contrast`，最后 `scene rm --id hero`。
