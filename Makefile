# This file is part of NetConfig Lab Image Manager.
#
# NetConfig Lab Image Manager is free software: you can redistribute it and/or
# modify it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version. See <https://www.gnu.org/licenses/>.

# Atalhos para subir/gerir o projeto. Por padrão sobe em MODO ABERTO (sem
# senha): o `.env` é criado com APP_PASSWORD vazio e apenas um segredo de sessão
# (APP_SECRET_KEY) aleatório. Para ativar o login, rode `make secure`.

SHELL := /bin/bash
COMPOSE := docker compose
ENV_FILE := .env
PORT ?= 8080

# Comando único (`make`) sobe o projeto inteiro.
.DEFAULT_GOAL := up

# Gera um valor aleatório url-safe (openssl, com fallback para /dev/urandom).
define randval
$(shell openssl rand -base64 24 2>/dev/null | tr -d '/+=' | cut -c1-32 || head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)
endef

.PHONY: help
help: ## Mostra esta ajuda
	@echo "NetConfig Lab Image Manager — alvos do Makefile:"
	@echo "  (rode apenas 'make' para subir o projeto inteiro)"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: check-docker
check-docker: ## Verifica se Docker + compose estão disponíveis
	@command -v docker >/dev/null 2>&1 || { echo "[make] Docker não encontrado. Instale: curl -fsSL https://get.docker.com | sh"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "[make] 'docker compose' (v2) não disponível. Atualize o Docker."; exit 1; }

$(ENV_FILE): ## Cria o .env em MODO ABERTO (APP_PASSWORD vazio) + segredo de sessão (se não existir)
	@if [ ! -f $(ENV_FILE) ]; then \
	  SK="$(call randval)"; \
	  printf 'APP_PASSWORD=\nAPP_SECRET_KEY=%s\nAPP_COOKIE_SECURE=\n' "$$SK" > $(ENV_FILE); \
	  echo "[make] .env criado em MODO ABERTO (sem senha). Ative o login com 'make secure'."; \
	else \
	  echo "[make] .env já existe — mantendo."; \
	fi

.PHONY: env
env: $(ENV_FILE) ## Garante o .env (gera se faltar)

.PHONY: up
up: check-docker $(ENV_FILE) ## (padrão) Sobe o projeto INTEIRO num único comando: build + todos os serviços (modo aberto)
	@echo "[make] Subindo o projeto inteiro (web + api + ishare2)..."
	@$(COMPOSE) up -d --build
	@echo ""
	@echo "================ NetConfig Lab Image Manager ================"
	@echo " URL:   http://localhost:$(PORT)"
	@PW="$$(grep '^APP_PASSWORD=' $(ENV_FILE) | cut -d= -f2-)"; \
	  if [ -n "$$PW" ]; then \
	    echo " Auth:  ATIVADA — senha em ./$(ENV_FILE) (veja 'make password')"; \
	  else \
	    echo " Auth:  MODO ABERTO (sem senha). Ative com 'make secure' antes de expor a rede."; \
	  fi
	@echo "------------------------------------------------------------"
	@$(COMPOSE) ps
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

.PHONY: secure
secure: $(ENV_FILE) ## Ativa a autenticação: gera senha aleatória, grava no .env e reinicia a API
	@PW="$(call randval)"; \
	  if grep -q '^APP_PASSWORD=' $(ENV_FILE); then \
	    sed -i "s|^APP_PASSWORD=.*|APP_PASSWORD=$$PW|" $(ENV_FILE); \
	  else printf 'APP_PASSWORD=%s\n' "$$PW" >> $(ENV_FILE); fi; \
	  echo "[make] autenticação ativada. Senha: $$PW (salva em ./$(ENV_FILE))"
	@$(COMPOSE) up -d --build api
	@echo "[make] API reiniciada com login ativado."

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
