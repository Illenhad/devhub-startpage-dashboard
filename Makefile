.DEFAULT_GOAL := help

# Couleurs pour le terminal
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RESET  := \033[0m
BOLD   := \033[1m

.PHONY: help install start dev autostart-enable autostart-disable autostart-status check clean

help: ## Affiche l'aide et la liste des commandes disponibles
	@echo ""
	@echo "$(BOLD)$(CYAN)Dev Hub — Tableau de Bord & Startpage Universelle$(RESET)"
	@echo "$(YELLOW)Commandes disponibles :$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

install: ## Installe les dépendances du projet (npm install)
	npm install

start: ## Démarre le serveur Dev Hub
	npm start

dev: ## Démarre le serveur en mode développement (watch mode)
	npm run dev

autostart-enable: ## Active le démarrage automatique au boot (LaunchAgent / systemd / Windows)
	npm run autostart:enable

autostart-disable: ## Désactive le démarrage automatique au boot
	npm run autostart:disable

autostart-status: ## Vérifie le statut du service de démarrage automatique
	npm run autostart:status

check: ## Vérifie la syntaxe JavaScript de tous les fichiers du projet
	@node --check server/index.js scripts/autostart.js server/routes/*.js server/services/*.js public/js/*.js
	@echo "$(GREEN)✅ Syntaxe de tous les fichiers JavaScript valide !$(RESET)"

clean: ## Nettoie les fichiers de logs temporaires
	@rm -f devhub.log devhub.err.log data/server.log data/server.err
	@echo "$(GREEN)🧹 Fichiers de logs nettoyés.$(RESET)"
