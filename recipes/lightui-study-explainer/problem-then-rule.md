---
id: problem-then-rule
task: study-explainer
level: film
when: |
  study 讲一条会坏的交互规则，而不是一张模型对照表。
canon:
  - intent-cascade
default_scenes:
  - id: status
    kind: still
    role: problem
    still: asset:still.status
    fit: contain
  - id: diagonal
    kind: still
    role: rule
    still: asset:still.diagonal
    fit: contain
  - id: project
    kind: still
    role: contrast
    still: asset:still.project
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
2. `status`（role=problem）
3. 一条或多条 rule still
4. 至少一条 contrast still
5. `close` — recipe `say-it-this-way`

v1 写死四场 still，与 LightUI stage kinds 相同：`status` `diagonal` `project` `third`。文件名与 `references/SOURCE.md` 一致。

## 旁白义务

status 说会坏什么；diagonal 说斜着走先别换；project 说上下扫马上换；third 说进了右边菜单路就定住。不要念「走廊 / 安全三角 / 上一帧」。

## 实证

intent-cascade：`status` / `diagonal` / `project` / `third`。静帧名 = LightUI `status.png` `diagonal.png` `project.png` `third.png`。

## 展开

`project create` 后按 `default_scenes` `scene add` 四场，再 `scene rm --id hero`。不要发明 `beat`/`clip`。
