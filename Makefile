# This file is part of NetConfig Lab Image Manager.
#
# NetConfig Lab Image Manager is free software: you can redistribute it and/or
# modify it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version. See <https://www.gnu.org/licenses/>.

# Atalhos para subir/gerir o projeto. Gera um .env com uma senha de acesso
# (APP_PASSWORD) e um segredo de sessão (APP_SECRET_KEY) aleatórios no primeiro
# `make up`, ativando a autenticação automaticamente.

SHELL := /bin/bash
COMPOSE := docker compose
ENV_FILE := .env
PORT ?= 8080

.DEFAULT_GOAL := help

# Gera um valor aleatório url-safe (openssl, com fallback para /dev/urandom).
define randval
$(shell openssl rand -base64 24 2>/dev/null | tr -d '/+=' | cut -c1-32 || head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)
endef

.PHONY: help
help: ## Mostra esta ajuda
	@echo "NetConfig Lab Image Manager — alvos do Makefile:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

$(ENV_FILE): ## Cria o .env com senha e segredo aleatórios (se não existir)
	@if [ ! -f $(ENV_FILE) ]; then \
	  PW="$(call randval)"; SK="$(call randval)"; \
	  printf 'APP_PASSWORD=%s\nAPP_SECRET_KEY=%s\nAPP_COOKIE_SECURE=\n' "$$PW" "$$SK" > $(ENV_FILE); \
	  echo "[make] .env criado com APP_PASSWORD e APP_SECRET_KEY aleatórios."; \
	else \
	  echo "[make] .env já existe — mantendo."; \
	fi

.PHONY: env
env: $(ENV_FILE) ## Garante o .env (gera se faltar)

.PHONY: up
up: $(ENV_FILE) ## Sobe o projeto inteiro (build) com autenticação ativada
	@$(COMPOSE) up -d --build
	@echo ""
	@echo "================ NetConfig Lab Image Manager ================"
	@echo " URL:   http://localhost:$(PORT)"
	@echo " Senha: $$(grep '^APP_PASSWORD=' $(ENV_FILE) | cut -d= -f2-)"
	@echo " (guarde a senha; está em ./$(ENV_FILE))"
	@echo "============================================================"

.PHONY: down
down: ## Para e remove os containers
	@$(COMPOSE) down

.PHONY: restart
restart: ## Reinicia os containers (sem rebuild)
	@$(COMPOSE) restart

.PHONY: rebuild
rebuild: $(ENV_FILE) ## Rebuild + sobe (web e api)
	@$(COMPOSE) up -d --build web api

.PHONY: logs
logs: ## Acompanha os logs (Ctrl-C para sair)
	@$(COMPOSE) logs -f --tail=100

.PHONY: ps
ps: ## Lista os containers do projeto
	@$(COMPOSE) ps

.PHONY: password
password: ## Mostra a senha de acesso atual
	@if [ -f $(ENV_FILE) ]; then \
	  echo "APP_PASSWORD=$$(grep '^APP_PASSWORD=' $(ENV_FILE) | cut -d= -f2-)"; \
	else echo "[make] .env não existe ainda. Rode 'make up'."; fi

.PHONY: regen-password
regen-password: ## Gera uma nova senha aleatória e reinicia a API
	@if [ ! -f $(ENV_FILE) ]; then echo "[make] rode 'make up' primeiro."; exit 1; fi
	@PW="$(call randval)"; \
	  if grep -q '^APP_PASSWORD=' $(ENV_FILE); then \
	    sed -i "s|^APP_PASSWORD=.*|APP_PASSWORD=$$PW|" $(ENV_FILE); \
	  else printf 'APP_PASSWORD=%s\n' "$$PW" >> $(ENV_FILE); fi; \
	  echo "[make] nova senha: $$PW"
	@$(COMPOSE) up -d --build api
	@echo "[make] API reiniciada com a nova senha."

.PHONY: open-mode
open-mode: ## Desativa a autenticação (esvazia APP_PASSWORD) e reinicia a API
	@if [ ! -f $(ENV_FILE) ]; then echo "[make] nada a fazer (sem .env)."; exit 0; fi
	@sed -i "s|^APP_PASSWORD=.*|APP_PASSWORD=|" $(ENV_FILE)
	@$(COMPOSE) up -d --build api
	@echo "[make] modo aberto (sem autenticação) ativado."
