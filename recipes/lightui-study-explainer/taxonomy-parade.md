---
id: taxonomy-parade
task: study-explainer
level: film
when: |
  有一份互斥模型清单，一种模型一场，收束点破最容易混的一对。
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

一种模型一场 still。禁止把多份模型压进一场。scene id = 模型 id，来自人给或任务自带的清单；weaver 不解析上游源码。

## 旁白义务

每场 still 用听者的话讲清这一场要记住的一件事（选完拿到什么、占不占地方、滚的时候干什么）。idea.md 可以写实现词，片子里改成动作和后果。不要念「叶子 / 提交模型 / sticky / 观察器 / occupancy」。一场只留一个名字。close 用易混对。中间场不要过早收束。

## 实证

- dropdown：`select` `multi` `grouped` `cascader` `split` `mega` `date`
- nav：`floating` `sidebar` `breadcrumb` `dropdown` `mega` `drawer` `overlay` `scrollspy` `shrink`
- sidebar：`floating` `wheel` `multilevel` `collapsible` `offcanvas`

静帧文件名跟该片 `assets.json`（dropdown 常用 `<kind>-open.png`；nav 的打开态用 `dropdown-open.png` 等）。

## 展开

对每个 kind：`scene add --id <kind> --kind still --still asset:still.<kind> --fit contain --role contrast`，最后 `scene rm --id hero`。
