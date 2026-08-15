# LightWeaver

演示场景编排与讲解片合成工作区：把「场景脚本 + 静帧 + 旁白」编成可预览、可渲染的片子。

仓库根目录不是应用。可运行单元在下一层：`products/<name>/`。

## 和相邻工作区怎么分

| 工作区 | 负责 | 不负责 |
| --- | --- | --- |
| **LightWeaver** | 场景时间线、讲解片构图、旁白对齐、渲染发布 | 成片自动剪、TTS 模型探索、素材库 |
| CineWeaver | 成片 / 短剧的 AI 解说与自动剪辑 | 演示场景脚本 |
| LightTTS | TTS 模型探索 | 片子时间线 |
| LightCanvas | 项目素材库与关系画布 | 渲染成片 |
| LightUI | UI 理念与 lab | 讲解片管线（只保留转发） |

第一则产品是从 LightUI `tools/study-films` 抽离的 `products/study-films`：给 lab study 拍静帧、合成中英讲解片，再写回 `studies/<slug>/references/`。

## 怎么用

```bash
make install
make studio          # Remotion 预览
```

Lab 在跑（默认 `http://127.0.0.1:5173`）时：

```bash
make films           # 截图 + 旁白 + 渲染并发布
```

分步：`make films-capture`、`make films-tts`、`make films-render`。

LightUI 根目录的 `make films` 会转到这里。默认把 LightUI 看作兄弟目录 `../LightUI`，可用 `LIGHTUI_ROOT` 覆盖。

## 目录

```
skills/                       本仓库的 agent skill
docs/                         片子约定
products/study-films/         第一则产品：场景讲解片
```

不要在仓库根放应用 `src/`。下一则片子先写 `films/<id>.json` 和旁白，再补截图适配；不要为空想法建空产品目录。

Agent 入口：`/lightweaver`。
