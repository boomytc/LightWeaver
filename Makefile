.DEFAULT_GOAL := help
.PHONY: help install studio remotion typecheck weaver films clean

help: ## 显示工作区命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 按 lockfile 安装 Node 依赖
	npm ci

studio: ## 启动同一 API、worker 与 Studio（127.0.0.1:5175）
	npm run dev -w @lightweaver/studio

remotion: ## 预览独立无声卡片组件
	npm run studio -w @lightweaver/study-films

weaver: ## 调用共享应用 CLI（ARGS='doctor --json'）
	./weaver/bin/weaver.mjs $(ARGS)

typecheck: ## 检查公开模块边界与 TypeScript
	npm run typecheck

films: ## 制作已保存项目（PROJECT=稳定项目ID）
	./weaver/bin/weaver.mjs build --project "$(PROJECT)" --wait --json

clean: ## 仅清理可重建构建缓存，不删除项目或原始媒体
	rm -rf products/studio/dist products/study-films/.cache products/study-films/out
