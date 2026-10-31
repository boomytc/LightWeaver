# LightWeaver

LightWeaver 是后处理视频制作工具。外部 agent 负责创作和语义选择，人可在 Studio 修改同一项目修订。

## 职责

- `weaver/` 是共享核与 CLI。产品只使用公开 `app`、`contracts` 入口。
- `products/studio/` 是本地编辑与作业界面。修改前读产品 AGENTS.md。
- `products/study-films/` 只渲染无声卡片。整片由共享媒体链制作。
- `library/` 是可选插件包与预设的显式导入来源。
- 运行数据默认在 `data/.weaver/`。旧 `data/projects/`、`data/first-party/` 仅由一次性迁移器读取，原件保留。

源视频和静帧由任务提供。观察是创作证据，旁白由作者另写。方法、音色和素材库均可不选。模型配置是替换边界，预设不限制混合 card、still、clip。

## 工作入口

先读 `docs/conventions.md`。电影制作流程见 `skills/lightweaver-film/SKILL.md`，素材管理见 `skills/lightweaver-assets/SKILL.md`。模型功能确认记录在 `docs/acceptance-v2.md`。

本仓采用 `confident-development-conventions`。按改动选择有限验收，临时脚本与合成媒体放系统临时目录，结束后清理。保留产品诊断、schema 校验和类型检查。

```bash
make install
make typecheck
npm run build -w @lightweaver/studio
make studio
make desktop
make desktop-package
```

只清理本次创建的临时数据。用户原始媒体、旧项目和迁移备份保留。Git 提交、推送和发布需要用户授权。
