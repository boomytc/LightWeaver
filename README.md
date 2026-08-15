# LightWeaver

演示场景编排与讲解片合成工作区。一部片子是一个项目：场景脚本、资产、旁白、成片。

## 和相邻工作区怎么分

| 工作区 | 负责 |
| --- | --- |
| **LightWeaver** | 项目、资产配料、场景编排、讲解片渲染 |
| CineWeaver | 成片 / 短剧自动剪 |
| LightTTS | TTS 模型探索 |
| LightCanvas | 素材关系画布 |
| LightAsset | 通用文件资产库 |
| LightUI | UI lab；讲解片发布回 `studies/*/references/` |

## 怎么用

Agent 主路径：按存放图结合出片。先发现三层路径，再跑 weaver。

```bash
npx weaver project list --json
npx weaver project show <id> --json   # paths + renderable
```

Studio 是复核面（改词、补静帧、看 issue）：

```bash
make install
make studio          # http://127.0.0.1:5175/
make remotion        # Remotion 预览
```

其它动词：

```bash
npx weaver task list
npx weaver validate
npx weaver scene add --project <id> --id shot --kind still --still asset:still.shot
npx weaver tts --project intent-cascade --locale zh
npx weaver render --project intent-cascade --locale zh
```

LightUI lab 在跑时：`make films`（截图 + 旁白 + 渲染并发布）。

## 目录

```
weaver/                         稳定核与 CLI
library/                        共享音色 / 元素 / 参考
data/projects/                  本地项目
products/study-films/           Remotion + LightUI 截图
products/studio/                复核面
```

Agent 入口：`/lightweaver`、`/lightweaver-film`、`/lightweaver-assets`。
