# 场次写法

这些不是方法，不能 `recipe apply`。选整片骨架看 catalog。补场才 `scene add`。

## 加一场 still

往对照表片加/绑一场：`id` 用模型名；`still = asset:still.<id>`；`fit: contain`；`role: contrast`。文件名跟 `assets.json` 走，不要 `comp-01.png`。

```bash
npx weaver scene add --project <id> --id floating --kind still \
  --still asset:still.floating --fit contain --role contrast
```

## 易混对口播

两场相邻 still 是理念里点名的易混对时，后一场点出「不是上一场那个模型」；close 再汇总，不要只在 close 才第一次出现。不发明新 scene kind。

| 片子 | 对 |
| --- | --- |
| dropdown | grouped vs cascader |
| nav | drawer vs overlay；dropdown vs mega；shrink vs floating |
| sidebar | collapsible vs offcanvas；multilevel vs wheel |
| intent | diagonal（rule）vs project（contrast） |

## 片头卡

种子已有 `kind=title`，禁止 `scene add --kind title`。`titleCard.kicker` 跟任务 `brand` 走，默认 `LightWeaver  ·  Film`。tags 默认 `名称, 场景, 规则`。lede 一句画面提示，正文写 `points`（2–4 条）。旁白：标题句 + 一句话问题，不要在 title 场开始阅兵。

## 片尾卡

`kind=close` 钉在末尾。禁止 `scene add --kind close`。`closeCard.headline`：`说清楚` / `Say it this way`。lede 只当小节标题。正文写 `points`：易混对用 `左 || 右`，再补一条「先名称场景规则，再谈外观」。不是 CTA、不是品牌秀。
