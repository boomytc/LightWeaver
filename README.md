# LightWeaver

后处理视频生成工作区。一部片子是一个任务实例：场景脚本、资产、旁白、成片。上游文案和画面由任务自带；本仓编排、配音、渲染。

## 怎么用

Agent 主路径：按存放图结合出片。先发现三层路径，再跑 weaver。

```bash
npx weaver project list --json
npx weaver project show <id> --json   # paths + renderable
```

Studio 工作台点名组合并复制给 agent；片子页只复盘。出片仍走 agent：

```bash
make install
make studio          # http://127.0.0.1:5175/  /films /voices /library
                     # 铸声：https://platform.modelbest.cn/console/login?ref=B08B4DDF
make remotion        # Remotion 预览
```

其它动词：

```bash
npx weaver task list
npx weaver project create <id> --task study-explainer|footage-narration
npx weaver validate
npx weaver scene add --project <id> --id shot --kind still --still asset:still.shot
npx weaver voice asr --label 讲解女声
npx weaver tts --project <id> --locale zh
npx weaver render --project <id> --locale zh
```

已有可渲片子：`make films`（截图若片子配了适配器 + 旁白 + 渲染）。

## 目录

```
weaver/                         稳定核与 CLI
library/                        可选增强：音色 / 素材 / 方法
data/                           任务实例（gitignore）
products/study-films/           Remotion 渲染器
products/studio/                工作台 + 复盘
docs/                           现网约定
```

Agent 入口：`/lightweaver`、`/lightweaver-film`、`/lightweaver-assets`。
