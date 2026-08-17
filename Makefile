# Makefile
.PHONY: help install studio remotion typecheck test weaver films films-capture films-tts films-render sync clean

.DEFAULT_GOAL := help

LIGHTUI_ROOT ?= $(abspath ../LightUI)
LAB_URL ?= http://127.0.0.1:5173
PROJECT ?=

help: ## 显示帮助信息
	@echo "LightWeaver workspace commands"
	@echo ""
	@echo "LIGHTUI_ROOT=$(LIGHTUI_ROOT)"
	@echo "LAB_URL=$(LAB_URL)"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 安装全部 workspace 依赖并同步 Remotion 目录
	npm install
	npm run weaver -- sync

studio: ## 启动 Studio WebUI（127.0.0.1:5175）
	npm run weaver -- sync
	npm run dev -w @lightweaver/studio

remotion: ## Remotion 预览 compositions
	npm run studio -w @lightweaver/study-films

weaver: ## 运行 weaver CLI（例：make weaver ARGS='project list --json'）
	npm run weaver -- $(ARGS)

typecheck: ## 类型检查
	npm run typecheck

test: ## 运行 weaver / studio / study-films 单测
	npm test

sync: ## 刷新 Remotion public/projects 与 catalog
	npm run weaver -- sync

films-capture: ## 从 LightUI lab 截取 stills（可选 PROJECT=slug）
	LAB_URL="$(LAB_URL)" LIGHTUI_ROOT="$(LIGHTUI_ROOT)" npm run weaver -- capture $(if $(PROJECT),--project $(PROJECT),)

films-tts: ## 合成旁白（可选 PROJECT=；无参跳过不可渲片）
	npm run weaver -- tts $(if $(PROJECT),--project $(PROJECT),)

films-render: ## 渲染（可选 PROJECT=；无参跳过不可渲片）
	LIGHTUI_ROOT="$(LIGHTUI_ROOT)" npm run weaver -- render $(if $(PROJECT),--project $(PROJECT),)

films: ## 截图 + 旁白 + 渲染
	$(MAKE) films-capture PROJECT="$(PROJECT)"
	$(MAKE) films-tts PROJECT="$(PROJECT)"
	$(MAKE) films-render PROJECT="$(PROJECT)"

clean: ## 清理构建缓存
	@rm -rf products/study-films/out products/study-films/projects products/study-films/.cache products/studio/dist
	@find . -name '.DS_Store' -delete
	@echo "Cleaning completed."
