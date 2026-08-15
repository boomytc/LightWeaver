# Makefile
.PHONY: help install studio typecheck test films films-capture films-tts films-render clean

.DEFAULT_GOAL := help

FILMS_DIR := products/study-films
LIGHTUI_ROOT ?= $(abspath ../LightUI)
LAB_URL ?= http://127.0.0.1:5173

help: ## 显示帮助信息
	@echo "LightWeaver workspace commands"
	@echo ""
	@echo "LIGHTUI_ROOT=$(LIGHTUI_ROOT)"
	@echo "LAB_URL=$(LAB_URL)"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 安装 study-films 依赖
	npm install --prefix $(FILMS_DIR)

studio: ## 预览 Remotion compositions
	npm run studio --prefix $(FILMS_DIR)

typecheck: ## 类型检查
	npm run typecheck --prefix $(FILMS_DIR)

test: ## 运行产品单测
	npm test --prefix $(FILMS_DIR)

films-capture: ## 从运行中的 LightUI lab 截取 stills
	LAB_URL="$(LAB_URL)" LIGHTUI_ROOT="$(LIGHTUI_ROOT)" npm run capture --prefix $(FILMS_DIR)

films-tts: ## 用 VoxCPM2 合成讲解旁白
	npm run tts --prefix $(FILMS_DIR)

films-render: ## Remotion 渲染并写回 LightUI studies/*/references
	LIGHTUI_ROOT="$(LIGHTUI_ROOT)" npm run render --prefix $(FILMS_DIR)

films: ## 截图 + 旁白 + 渲染（lab 需在 LAB_URL）
	LAB_URL="$(LAB_URL)" LIGHTUI_ROOT="$(LIGHTUI_ROOT)" npm run films --prefix $(FILMS_DIR)

clean: ## 清理构建缓存与未压缩渲染
	@rm -rf $(FILMS_DIR)/out $(FILMS_DIR)/.cache
	@find . -name '.DS_Store' -delete
	@echo "Cleaning completed."
