# Changelog

Este projeto segue **SemVer** (x.y.z).

## 1.1.10

- Refatoração da interface (issue #34) — entrega 4 (estados da aba iShare2):
  - Estado vazio (placeholder com ícone de lupa) exibido antes da primeira busca.
  - Estado de carregamento (spinner) durante a busca, substituindo o cursor de espera.
  - Componentes reutilizáveis `.empty-state` e `.loading-state` no design system.
  - Novas chaves i18n `ui.ishare2.emptyState` e `ishare2.searching` (PT/EN/ES).

## 1.1.9

- Refatoração da interface (issue #34) — entrega 3 (paridade da aba Sistema):
  - Barra de disco fica em estado crítico (gradiente âmbar→vermelho) quando o uso passa de 85%.
  - Banner de aviso "Disco quase cheio" exibido automaticamente acima de 85% de uso.
  - Nova chave i18n `ui.system.diskWarning` (PT/EN/ES).

## 1.1.8

- Refatoração da interface (issue #34) — entrega 2 (interações do shell):
  - Toasts (`#messages`) com auto-dismiss após 7s, mantendo o fechamento manual.
  - Toggle de tema dark/light no gate e na top bar, persistido em `localStorage` (`netconfig-theme`).
  - Animação de sincronização no gate ao carregar dados: passos SSH → autenticação → detecção do ambiente → sync, sincronizada com o carregamento real.
  - Novas chaves i18n (PT/EN/ES) para os passos de sincronização.

## 1.1.7

- Refatoração da interface (issue #34) — entrega 1 (shell): novo layout de dashboard com sidebar fixa de 248px, top bar e tela de gate de conexão dedicada, baseado no design handoff.
- Novo sistema de design em `web/static/css/app.css` com tokens (tema dark padrão + light), fontes IBM Plex Sans/Mono e componentes (cards, botões pílula, toasts, barras de progresso).
- Novo `web/static/js/ui_shell.js`: alterna gate/dashboard, seletor de idioma segmentado (PT/EN/ES), título por aba, card de status, botão Desconectar e drawer responsivo da sidebar.
- Navegação por abas migrada para itens de sidebar preservando todos os IDs e contratos de JS existentes; toasts movidos para pilha fixa; banner de atualização no topo da área principal.

## 1.1.6

- Versão incrementada para 1.1.6.

## 1.1.5

- Aviso visual de atualização disponível no frontend, baseado na checagem do GitHub já exposta em `/api/update`.
- Inclusão do script `scripts/update.sh` para facilitar `git pull` com `docker compose up -d --build`.
- Endpoint de update enriquecido com metadados locais do projeto e comando sugerido para atualização.
- Versão incrementada para 1.1.5.

## 1.1.4

- Removido o campo obsoleto `version` do `docker-compose.yml`.
- Versão incrementada para 1.1.4.

## 1.1.3

- Versão incrementada para 1.1.3.

## 1.1.2

- Versão incrementada para 1.1.2.

## 1.1.1

- Versão incrementada para 1.1.1.
- Priorização de repositórios por latência no fluxo de instalação iShare2.
- Fallback automático entre repositórios quando o primeiro falha ou não possui a imagem.
- Exibição no frontend do ranking de latência medido para os repositórios.

## 1.0.9

- Versão incrementada para 1.0.9.

## 1.0.8

- Versão incrementada para 1.0.8.

## 1.0.2

- Suporte inicial ao VRNETLAB em hosts ContainerLab, com detecção do diretório /opt/vrnetlab e instalação automática via git clone quando ausente.

## 1.0.3

- Nova aba "Container Images" para hosts ContainerLab, listando automaticamente imagens Docker/Podman.
- VRNETLAB e Container Images auto-carregam ao detectar ContainerLab; iShare2, Images, Templates e Icons são ocultadas nesse cenário.
- Caminho padrão do VRNETLAB ajustado para /opt/containerlab/vrnetlab sem fallback.

## 1.0.4

- Aba "Laboratórios" exclusiva para ContainerLab, listando automaticamente os diretórios em /opt/containerlab/labs.
- Carregamento automático de Container Images, VRNETLAB e Laboratórios ao identificar ContainerLab.

## 1.0.5

- Botão de edição de arquivos nos labs ganhou tamanho/estilo mais discreto para não poluir a lista.

## 1.0.7

- Versão incrementada para 1.0.7.

## 1.0.6

- Versão incrementada para 1.0.6.

## 1.0.0

- Release inicial do NetConfig Lab Image Manager.

## 1.0.1

- Adiciona testes unitários iniciais (unittest) e melhora compatibilidade do módulo i18n para uso fora do Flask.
