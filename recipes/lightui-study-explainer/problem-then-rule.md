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
    fit: contain
  - id: rule
    kind: still
    role: rule
    fit: contain
  - id: contrast
    kind: still
    role: contrast
    fit: contain
---

# 问题然后规则

## 何时

study 讲一条会坏的交互规则，而不是一张模型对照表。没有 `kinds.ts` 时只读 `idea.md` / `idea.en.md` / `study.json`。

## 骨架

下一张片子复用这副骨架，不要把某一张片子的场次名写进这张卡。

1. `title` — recipe `study-title`
2. `problem`（role=problem）
3. `rule`（role=rule）
4. `contrast`（role=contrast）
5. `close` — recipe `say-it-this-way`

还要多一条规则或对照，apply 后再 `scene add`，不要改这张卡。

## 旁白义务

problem 说会坏什么；rule 说正确做法；contrast 说旁边那条为什么更差。idea.md 可以写实现词，片子里改成动作和后果。

## 实证

intent-cascade 是实例，不是卡本身。它用了 `status` / `diagonal` / `project` / `third`，静帧名跟 LightUI `SOURCE.md`。新片子用上面的通用 id。

## 展开

`project create` 后 `recipe apply --recipe problem-then-rule`，再 `scene rm --id hero`（apply 会做）。不要发明 `beat`/`clip`。
