# Changelog

Este projeto segue **SemVer** (x.y.z).

## 2.16.2

- Editor de topologia (issue #50): layout **force-directed** (Fruchterman–Reingold) com anti-sobreposição para topologias UNL — espalha nós e arestas sem encostar (antes os nós do .unl se sobrepunham). Aplicado ao abrir e no botão "Reorganizar" (UNL).

## 2.16.1

- Editor de topologia (issue #50): posições do `.unl` (left/top) que extrapolavam o canvas agora são **reescaladas/centralizadas** para caber, deixando todos os nós visíveis e arrastáveis (antes parte da topologia ficava fora da área).

## 2.16.0

- EVE-NG/PNETLab (issue #50) — descoberta via UNL + topologia.
  - Nova aba "Labs (EVE/PNETLab)" para hosts EVE-NG/PNETLab: lista os `.unl` em `/opt/unetlab/labs` (`POST /unl/labs`).
  - Abre a topologia do lab (nós, redes/bridges, enlaces, posições left/top) no editor nativo em modo **somente leitura** (`POST /unl/topology`, parser XML do .unl).
  - Editor de topologia ganha modo read-only (esconde edição/save/deploy). Testes do parser UNL.
  - Pendente em #50: status rodando/parado por lab no EVE/PNETLab.

## 2.15.0

- ContainerLab (issue #52) — itens 7 e 2:
  - **Captura de pacote** por nó: botão Capture (`POST /container-labs/node/capture`) roda tcpdump na interface do nó e baixa um `.pcap`.
  - **Terminal** (pragmático): botão Terminal copia o comando `ssh ... docker exec -it <node> sh` pra colar num terminal (PTY web real fica como follow-up — ttyd/websocket).

## 2.14.0

- ContainerLab (issue #52) — itens 8 e 9:
  - **Validação** da topologia: botão "Validar" no editor combina checagem local + estrutural no backend (`POST /container-labs/validate`): nome, kind/imagem por nó, links referenciando nós existentes, endpoints duplicados.
  - **Stats por nó**: botão Stats no painel do nó rodando mostra CPU/memória (`POST /container-labs/node/stats`, docker/podman).

## 2.13.0

- ContainerLab (issue #52) — item 6: impairments por enlace (netem).
  - Painel do enlace ganha campos delay/loss/rate por endpoint; aplica via `containerlab tools netem set` (`POST /container-labs/netem`). Usa o container do nó (rode "Status" antes).

## 2.12.0

- ContainerLab (issue #52) — item 5: criar e clonar laboratórios.
  - Botão **Novo lab**: cria diretório + `.clab.yml` inicial (`POST /container-labs/create-lab`) e abre pronto pra editar na topologia.
  - Botão **Clonar** por lab: copia o lab para um novo nome (`POST /container-labs/clone-lab`).

## 2.11.0

- ContainerLab (issue #52) — itens 3 e 11:
  - **Salvar configs** dos nós rodando: botão no editor → `containerlab save` (`POST /container-labs/save-configs`).
  - **Histórico de backups**: cada save guarda também uma cópia com timestamp (`.bak.<ts>`); botão "Backups" lista as versões e permite restaurar uma específica (`/backups`, `/restore-backup`).
  - Correção: geração de YAML preservando comentários agora cria `topology/nodes/labels` como mapas YAML válidos (corrige save em labs sem topologia/novos).

## 2.10.0

- ContainerLab (issue #52) — itens 4 e 10:
  - **Checagem de imagens antes do deploy**: novo `POST /container-labs/check-images` compara as imagens dos nós (kind/image) com `docker images` do host; se faltar alguma, a UI avisa e pede confirmação.
  - Botão **Redeploy** (deploy `--reconfigure`) por topologia.
  - Destroy pergunta se também faz `--cleanup` (limpa diretórios do lab).

## 2.9.0

- ContainerLab (issue #52) — item 1: deploy/destroy **assíncrono com log ao vivo**.
  - Novos endpoints `POST /container-labs/deploy_async` e `/destroy_async` (job em thread no backend) + `GET /container-labs/job?job_id` para polling.
  - Stream da saída do containerlab linha a linha (via `run_ssh_stream`) na tela de progresso, sem travar a requisição. Estado final sucesso/erro + atalho "Ver status" após deploy.

## 2.8.1

- Editor de topologia (issue #43): no modo expandido (tela cheia) agora há um botão flutuante ✕ para sair, e a tecla **Esc** também cancela a expansão.

## 2.8.0

- Editor de topologia (issue #43): melhorias de UX e correção do save.
  - Save agora **preserva comentários e formatação** do YAML (lib eemeli `yaml` vendorizada): só atualiza nós/links/posições, mantendo header de licença, comentários de seção e estilo. Fallback para js-yaml se indisponível.
  - Removido o botão "Tela cheia"; novo botão **expandir (⛶)** dentro do editor para ocupar a tela inteira inline.
  - Ao expandir um laboratório, a **topologia abre automaticamente**.
  - Lista de laboratórios mostra **badge RODANDO/PARADO** por lab (via `containerlab inspect --all`, casando pelo diretório do topo-file).

## 2.7.0

- Visual Lab Manager (issue #43) — P5: robustez.
  - Undo/redo no editor de topologia (histórico de até 50 passos; botões ↶/↷).
  - Validação client-side antes de salvar (nó sem nome, nome duplicado, enlace para nó inexistente, self-link) com confirmação.
  - Exportar a topologia como SVG.
  - Rollback já coberto pelo backup .bak + botão Reverter (P1).

## 2.6.0

- Visual Lab Manager (issue #43) — P4: runtime no canvas.
  - Botão "Status" no editor chama `containerlab inspect` e pinta cada nó: verde (rodando) / cinza (parado), com estado e IPv4 no tooltip.
  - Painel do nó (quando rodando) ganha ações Logs e Exec direto do diagrama (casa o nó ao container clab-<lab>-<node>).

## 2.5.0

- Visual Lab Manager (issue #43) — P3: paleta de nós + edição rica.
  - Paleta de kinds comuns (nokia_srlinux, arista_ceos, linux, juniper_crpd, cisco_xrd/iol/n9kv, sonic-vs): adiciona nó já com o kind.
  - Painel do nó ganha campos: Tipo, IPv4 de gerência, Grupo (alimenta o layout em camadas) e Startup-config — gravados no YAML preservando os demais campos.

## 2.4.0

- Visual Lab Manager (issue #43) — P2: sync YAML↔grafo no editor de topologia.
  - Botão "YAML" abre split view com o YAML do lab ao vivo (regenerado a cada mudança do grafo).
  - "Aplicar do YAML" reconstrói o grafo a partir do YAML editado à mão (parse client com js-yaml).
  - Save agora mostra **diff** (linhas +/-) antes de gravar e escreve via `/file/save` (com backup .bak), preservando campos fora do grafo (carregados do YAML cru).

## 2.3.0

- Visual Lab Manager (issue #43) — P1: puxar cabo no editor de topologia.
  - Handle de porta em cada nó: arraste de um nó até outro para criar um enlace.
  - Interfaces auto-geradas por nó (prefixo detectado pelo kind, ex.: e1-1) e editáveis.
  - Painel de enlace ao clicar: editar as duas interfaces e remover. Bloqueia self-link, avisa duplicado.
  - Save agora faz backup (.bak) antes de sobrescrever; novo botão "Reverter" + endpoint `POST /container-labs/topoviewer/restore` para rollback.

## 2.2.4

- Integração ContainerLab (issue #7): tela de deploy/destroy repaginada — header com subtítulo (lab/arquivo), linha de status (spinner → ✓/✗ colorido), log estilo terminal, botão "Copiar log" e atalho "Ver status" após deploy bem-sucedido. Mesma tela usada por logs/exec/status com estado visual.

## 2.2.3

- Correção: chamadas SSH podiam "carregar para sempre" quando o host remoto estava lento/inacessível. Adicionado `ConnectTimeout=15` + keepalive (`ServerAliveInterval/CountMax`) a todas as chamadas SSH e tetos de tempo por operação (leituras 45s, exec 60s, deploy/destroy 600s). Conexões mortas agora falham rápido em vez de pendurar a interface.

## 2.2.2

- Editor de topologia (issue #7): auto-layout passa a usar **group/level do YAML** para organizar em camadas (ex.: spine no topo, leaf, client, telemetria embaixo). Lê `group` do node e labels `graph-level`/`graph-group`/`topoViewer-group`/`topoViewer-groupLevel`. Sem grupos, cai no layout em grade.

## 2.2.1

- Editor de topologia (issue #7): auto-layout trocado de círculo (amontoava) para **grade** que preenche o canvas — sem sobreposição mesmo com muitos nós. Arestas agora alinham exatamente aos nós (`preserveAspectRatio=none`). Novo botão "Reorganizar" e canvas mais alto.

## 2.2.0

- Integração ContainerLab (issue #7) — entrega 6 (editor de topologia nativo inline):
  - Novo `web/static/js/topology_editor.js`: editor visual SVG próprio (sem dependência vendored) renderizado inline na aba Laboratórios ao clicar em "Topologia".
  - Arrastar nós (posições persistem em labels graph-posX/Y), adicionar/remover nós, criar/remover enlaces (modo "Ligar nós") e editar nome/kind/imagem.
  - Carrega via `/container-labs/topoviewer/cyto` e salva via `/container-labs/topoviewer/save` (merge no YAML existente).
  - Botão "Tela cheia" mantém o TopoViewer vendored como opção. Estados loading/empty/erro; i18n PT/EN/ES.

## 2.1.4

- Correção: `web/static/js/vendor/js-yaml.min.js` estava truncado (~7KB) e lançava erro no carregamento de toda página. Substituído pelo js-yaml 4.1.0 oficial (39KB); parsing de YAML no client volta a funcionar e o erro no console desaparece.

## 2.1.3

- Integração ContainerLab (issue #7) — entrega 4 (salvar topologia do TopoViewer):
  - Novo endpoint `POST /container-labs/topoviewer/save`: converte os elementos do editor (cytoscape) de volta para YAML ContainerLab fazendo **merge** no arquivo existente (preserva campos de node e chaves de topo-nível) e grava no host.
  - Recusa gravar (sem destruir o arquivo) se o payload não contiver nós válidos.
  - Stub do TopoViewer (`topoviewer.html`) passa a persistir de verdade nos endpoints de save do editor vendored.
  - Testes do conversor cyto→YAML (merge e recusa de payload vazio). Nova chave i18n backend `container_labs.save_invalid_payload` (PT/EN/ES).

## 2.1.2

- Integração ContainerLab (issue #7) — entrega 3 (status + logs/exec por nó):
  - Botão Status por topologia: chama `containerlab inspect` e abre modal com os containers do lab (nome, kind, estado, IPv4).
  - Por nó rodando: botões Logs (últimas linhas via docker/podman) e Exec (comando único não interativo) com saída em modal.
  - Novas chaves i18n `ui.labs.status*`/`ui.labs.logs*`/`ui.labs.exec*` (PT/EN/ES).

## 2.1.1

- Integração ContainerLab (issue #7) — entrega 2 (frontend deploy/destroy):
  - Botões Deploy e Destroy por arquivo de topologia (*.clab.yml) na aba Laboratórios, com confirmação e modal de log da saída do containerlab.
  - Novas chaves i18n `ui.labs.deploy*`/`ui.labs.destroy*`/`ui.labs.action*` (PT/EN/ES).
  - Observado (pré-existente, não regressão): `web/static/js/vendor/js-yaml.min.js` está truncado (~7KB) e lança erro no load — não afeta deploy/destroy; rastrear separadamente.

## 2.1.0

- Integração ContainerLab (issue #7) — entrega 1 (backend): novos endpoints no blueprint `/container-labs`:
  - `POST /deploy` e `POST /destroy` (`containerlab deploy/destroy -t <topo>`, com `--reconfigure`/`--cleanup` opcionais).
  - `POST /inspect` (`containerlab inspect [--all|-t] --format json`) com normalização tolerante a variações de formato.
  - `POST /node/logs` e `POST /node/exec` (docker/podman, com fallback), comando único não interativo.
  - Validação de nome de container (`^[A-Za-z0-9_.-]+$`) e `shlex.quote` para evitar injeção.
  - Chaves i18n backend (PT/EN/ES) e testes unitários (validação, construção de comando, parsing do inspect).

## 2.0.1

- Testes unitários para o endpoint `GET /repositories` do serviço ishare2 (ranking por latência e tratamento de erro).

## 2.0.0

- Release principal da nova interface (issue #34, PR #35) — consolida as entregas 1–11 (1.1.7 → 1.1.17) em um marco de versão maior.
- Novo layout de dashboard (sidebar fixa de 248px + top bar + gate de conexão dedicado) substituindo a SPA de card central.
- Sistema de design em `web/static/css/app.css` (tema dark padrão + light, IBM Plex, tokens, componentes reutilizáveis) e novo `web/static/js/ui_shell.js`.
- Estados loading/empty/erro/sucesso em todas as listagens; aba Sistema com disco crítico; TopoViewer com grafo (nós + arestas SVG); painel de latência dos mirrors do iShare2.
- Idiomas PT/EN/ES em toda a UI; IDs/contratos de JS preservados; única alteração de backend foi o endpoint `GET /api/ishare2/repositories` para suportar o painel de latência.

## 1.1.17

- Refatoração da interface (issue #34) — entrega 11 (painel de latência iShare2):
  - Novo endpoint `GET /api/ishare2/repositories` (proxy) e `GET /repositories` no serviço ishare2, retornando os mirrors ordenados por latência medida.
  - Painel "Ranking de latência dos mirrors" exibido na aba iShare2 ao buscar, com barras coloridas por faixa (<40ms verde, <100ms accent, senão âmbar).
  - Nova chave i18n `ui.ishare2.latencyTitle` (PT/EN/ES).
  - Observação: única alteração de backend do refactor, estritamente para suportar a UI (exceção prevista no requisito O1/R7 da issue).

## 1.1.16

- Refatoração da interface (issue #34) — entrega 10 (TopoViewer):
  - Modal de topologia agora renderiza um grafo (nós posicionados + arestas em SVG) sobre grade pontilhada, no lugar das listas de texto.
  - Toolbar com contador "N nós · M enlaces"; listas de nós/links mantidas como detalhe abaixo do grafo.
  - Novas chaves i18n `ui.topo.canvasTitle`, `ui.topo.counter`, `ui.topo.empty` (PT/EN/ES).

## 1.1.15

- Refatoração da interface (issue #34) — entrega 9 (ajuste do tema light):
  - Chip escuro atrás dos logos (PNGs claros) no tema light para manter legibilidade no gate e na sidebar.

## 1.1.14

- Refatoração da interface (issue #34) — entrega 8 (estado da aba Laboratórios):
  - Spinner de carregamento na lista de laboratórios, com estado vazio restaurado em erros.
  - Conclui a cobertura de estados loading/empty/erro/sucesso (F20) em todas as listagens.

## 1.1.13

- Refatoração da interface (issue #34) — entrega 7 (estados das abas ContainerLab):
  - Spinner de carregamento nas listas de Container Images e VRNETLAB, com estado vazio restaurado em erros.
  - Estados vazios e labels de loading nos botões já existentes preservados.

## 1.1.12

- Refatoração da interface (issue #34) — entrega 6 (estados de Templates e Ícones):
  - Spinner de carregamento ao listar templates e ícones, com limpeza em erros.
  - Estados vazios já existentes preservados (`templates.none` / `icons.none`).
  - Novas chaves i18n `templates.loading` e `icons.loading` (PT/EN/ES).

## 1.1.11

- Refatoração da interface (issue #34) — entrega 5 (estados da aba Imagens):
  - Estado vazio no card "Imagens existentes" antes da primeira checagem.
  - Spinner de carregamento durante a listagem, com restauração do estado vazio em erros.
  - Novas chaves i18n `ui.images.emptyState` e `images.loading` (PT/EN/ES).

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
