.DEFAULT_GOAL := help
.PHONY: help install studio desktop desktop-package desktop-dist remotion typecheck weaver films clean

help: ## 显示工作区命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 按 lockfile 安装 Node 依赖
	npm ci

studio: ## 启动同一 API、worker 与 Studio（127.0.0.1:5175）
	npm run dev -w @lightweaver/studio

desktop: ## 桌面开发：Electron、Vite HMR、动态端口服务
	npm run dev -w @lightweaver/desktop

desktop-package: ## 本机平台未签名可运行包
	npm run package -w @lightweaver/desktop

desktop-dist: ## 未签名安装分发包（不含公证）
	npm run dist -w @lightweaver/desktop

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
