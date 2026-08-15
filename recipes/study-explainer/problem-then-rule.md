---
id: problem-then-rule
task: study-explainer
level: film
when: |
  study 讲一条会坏的交互规则，而不是一张模型对照表。
canon:
  - intent-cascade
default_scenes:
  - id: problem
    kind: still
    role: problem
    still: asset:still.problem
  - id: diagonal
    kind: still
    role: rule
    still: asset:still.diagonal
    fit: contain
  - id: vertical
    kind: still
    role: contrast
    still: asset:still.vertical
    fit: contain
  - id: third
    kind: still
    role: rule
    still: asset:still.third
    fit: contain
---

# 问题然后规则

## 何时

study 讲一条会坏的交互规则，而不是一张模型对照表。intent-cascade **没有** `kinds.ts`，只读 `idea.md` / `idea.en.md` / `study.json`。

## 骨架

1. `title` — recipe `study-title`
2. `problem`（role=problem）
3. 一条或多条 rule still
4. 至少一条 contrast still
5. `close` — recipe `say-it-this-way`

v1 写死四场 still，与 canon 相同。

## 旁白义务

problem 说会坏什么；rule 说走廊/规则；contrast 说朴素 delay 为什么更差。

## 实证

intent-cascade：`problem` / `diagonal` / `vertical` / `third`。历史文件名（`desktop-full.png` 等）只属于这部老片，新片按 `assets.json`。

## 展开

`project create` 后按 `default_scenes` `scene add` 四场，再 `scene rm --id hero`。不要发明 `beat`/`clip`。
