# Auditoria — Walkthrough por eventos (Fase 1.7)

Registro da execução do plano "Walkthrough por eventos nos marcos". O plano manda re-auditar
`main` antes de começar e diz que, onde ele divergir do código, o código vence e o plano é
ajustado. Esta seção lista essas divergências e o que foi decidido.

## 1. Re-auditoria de `main` (24 nov 2026, commit `1a0f837`)

| Item | O que o código tem | Consequência |
| --- | --- | --- |
| Referência no marco | Diagramas entram por um bloco cercado ```` ```diagrama ```` com o id, trocado por um marcador `⟦diagrama:id⟧` antes do goldmark (o sanitizer apaga a classe de linguagem). Não há marcador em comentário HTML | O walkthrough usa o mesmo mecanismo: bloco ```` ```walkthrough ````, marcador `⟦walkthrough:id⟧`, coluna 0 obrigatória |
| Onde fica o arquivo | `content/courses/<trilha>/diagramas/<id>.yaml`, por id, não por marco. Não existem `*.tutorial.md` nem `*.challenge.md`: o hands-on é uma seção do próprio `NN-slug.md` | `content/courses/<trilha>/walkthroughs/<id>.yaml`, não `<NN>-<slug>.walkthrough.yaml`. O id é o que o marco cita, como nos diagramas |
| JSON | `web/data/diagramas/<slug>.json`, carregado só quando um marco na tela tem diagrama | `web/data/walkthroughs/<slug>.json`, fora do JSON da trilha |
| `topologia` | Até 12 nós, 6 colunas, rótulo ≤ 28 caracteres, aresta que corta caixa é erro de build. Aresta é direcional; o renderer já desenha o par `a→b` e `b→a` (`hasReverse`) | Os diagramas de camada seguem essas regras sem exceção. Sentidos opostos são duas arestas, como o plano pede |
| `sequencia` | Até 6 participantes e 14 mensagens; rótulo de mensagem ≤ 28 caracteres | A sequência derivada é uma por etapa (≤ 6 eventos cabe), e o rótulo da mensagem é o rótulo da aresta da topologia (≤ 28), não a `msg` (≤ 110), que fica no cartão |
| Estados da Fase 1.6 | `ativo, novo, saindo, removido, falha, inativo, destaque`, cumulativos, com marca textual além da cor | Os mesmos valores e a mesma semântica, cumulativos no walkthrough inteiro |
| Roteador | Só segmentos: `#/learn/<slug>/<marco>/<conceito>`. Não há query string em nenhuma rota | O deep link não pode ser `…?wt=…&e=14`; vai seguir os segmentos (decidido no PR do player) |
| `diagram.js` | Não exporta `draw`; o `diagram-player.js` (≤ 4 KB gzip) tem pacote WAAPI, estados e pausa por viewport/aba dentro de `attach` | A extração do núcleo compartilhado é passo próprio, com a suíte da Fase 1.6 sem alteração |

## 2. Decisões tomadas na execução

- **D1 — Etapa tem `id`.** A regra 1 do plano pede ids únicos para etapas, mas o exemplo não
  tem `id`. Etapa passa a ter `id` kebab-case obrigatório; ele também nomeia a sequência
  derivada (`<walkthrough>-<etapa>`).
- **D2 — Regra da sequência (§3.4).** Com até 6 atores, toda etapa mostra todos, na ordem
  declarada, e as colunas nunca mudam entre etapas. Com mais de 6, cada etapa mostra só os
  atores que usa, na ordem declarada, e registra quantos omitiu (`omitidos`). Se uma etapa
  precisar de mais de 6 colunas, o build falha. Coberto por `TestWalkthroughSequenciaGolden`,
  `TestWalkthroughSequenciaOmiteAtores` e `TestWalkthroughSequenciaRespeitaORenderer`.
- **D3 — `tipo` opcional no evento** (`sync | async | reply`, padrão `sync`). É o que a visão
  de sequência desenha como seta cheia, aberta ou tracejada. O plano não tinha esse campo,
  mas sem ele o "201 Created" e uma notificação de watch sairiam iguais a uma escrita.
- **D4 — Walkthrough não referenciado é erro**, não aviso (diagramas não referenciados são
  aviso). Um walkthrough é sempre feito para um marco; um arquivo solto é engano.
- **D5 — Diagrama de camada conta como referenciado.** Ele é citado pelo walkthrough, não pelo
  marco, e não gera o aviso de arquivo solto.
- **D6 — `<ol start>` liberado no sanitizer**, só com número de 1 a 3 dígitos, para a
  descrição textual manter a numeração contínua dos eventos ("14 de 18").
- **D7 — Linguagens de painel**: `yaml, bash, texto, json, go, java, log`. O destaque de
  linhas é por classe, sem highlight de sintaxe.

## 3. Validação no compilador (§4 do plano)

Cada regra tem caso válido e caso inválido em `aggregator/internal/course/walkthroughs_test.go`:

| Regra | Teste |
| --- | --- |
| 1 — ids únicos, referências existem | `TestWalkthroughRegra1Ids` |
| 2 — diagrama de camada existe, é `topologia`, contém os atores | `TestWalkthroughRegra2Diagrama` |
| 3 — aresta `de → para` no mesmo sentido | `TestWalkthroughRegra3Aresta` |
| 4 — `de ≠ para` | `TestWalkthroughRegra4MesmoAtor` |
| 5 — `pai` existe, sem ciclo, profundidade ≤ 2 | `TestWalkthroughRegra5Pai` |
| 6 — `painel.linhas` | `TestWalkthroughRegra6Linhas` |
| 7 — limites, `msg`, `anotacao`, 120 palavras | `TestWalkthroughRegra7Limites` |
| 8 — valores de `estados` | `TestWalkthroughRegra8Estados` |
| Caso válido (numeração contínua, estados cumulativos, painéis, breadcrumb) | `TestWalkthroughValido` |
| Descrição textual | `TestWalkthroughDescricaoTextual` |
| De ponta a ponta no `compileCourse` | `TestCompileCourseWalkthroughs` |

## 4. PR do player e do piloto 7.1

### Decisões

- **D8 — Deep link por segmentos**: `#/learn/<slug>/<marco>/wt/<id>/<evento>`. O roteador não
  tem query string em rota nenhuma, e o 4º segmento já é o ponto de retorno de um conceito;
  `wt` passa a ser reservado (o compilador recusa um conceito com esse id, coberto em
  `TestResolveConceitosRejectsInvalidRegistry`). O roteador não trata `wt` como conceito; o
  player lê o resto do hash, abre pausado no evento e rola a figura até a tela. Navegar no
  player usa `history.replaceState`, e só quando o hash é da própria trilha (um ponto de
  retorno de conceito aberto não é sobrescrito).
- **D9 — Núcleo compartilhado** em `web/js/courses/diagram-core.js`: pacote (WAAPI +
  `getPointAtLength`), estados com marca textual, cancelamento de animações e pausa fora da
  tela, aba oculta ou diálogo fechado. O `diagram-player.js` usa o núcleo sem mudar de
  comportamento: a suíte da Fase 1.6 (`diagram-player`, `diagram`, `diagram-budget`) passou
  com **67 de 67, sem alterar nenhum teste**, e o arquivo caiu de 2.944 para 2.340 bytes gzip.
- **D10 — Orçamento.** `diagram.js` + `diagram-svg.js` estavam em 9.943 de 10.000 bytes gzip;
  o walkthrough só acrescentou `export` em `draw`, `fitViewBox` e `openZoom` (e o `return svg`
  deste), e o par ficou em 9.952. O `walkthrough-player.js` tem 4.383 bytes gzip (teto 6.000),
  com teste em `diagram-budget.spec.js`.
- **D11 — Espaço faz play/pause também com o foco num botão**, como no `diagram-player` (que
  tem teste para isso). A exceção é o `<summary>` do painel, onde o Espaço abre e fecha.
  Dentro do `tablist`, ←/→ trocam de aba (padrão ARIA); fora dele, trocam de evento.
- **D12 — `«` no meio de uma etapa volta ao início dela**; no início, vai à etapa anterior
  (como "faixa anterior" num player de áudio). O PageUp faz o mesmo.

- **D13 — Ampliar com controles (pedido no checkpoint do celular).** No PR do piloto, o
  Ampliar pausava e abria só a visão; como a página atrás de um `<dialog>` modal fica inerte,
  no celular não havia como avançar nem tocar. Agora o diálogo ganha a sua própria "face":
  cartão do evento, os 7 controles e uma região `aria-live` (a da figura fica inerte, então só a
  do diálogo fala). As duas faces mostram o mesmo estado, a visão ampliada troca de camada e de
  visão junto com o roteiro, e fechar o diálogo pausa e devolve o foco, com a figura no evento
  onde ele parou. A barra usa a classe `diagrama-player`, que o `openZoom` já remove ao fechar,
  como faz com o player da Fase 1.6. O `walkthrough-player.js` foi para 5.031 bytes gzip.

### Piloto 7.1: conteúdo conferido

Encaixe: marco 01 (`arquitetura`), logo depois de "Quem executa esse laço", que já ensina o
API server como única porta, o apply que retorna antes da convergência e o kubelet que puxa o
trabalho. Diagramas de camada novos: `k8s-wt-cluster` e `k8s-wt-node`.

Coerência com a trilha (o plano manda validar a semente contra o marco):

| Semente do plano | Publicado | Por quê |
| --- | --- | --- |
| `replicas: 4`, "os outros 3 Pods" | `replicas: 3`, "os outros 2 Pods" | A trilha usa 3 réplicas para o `pix-gateway` (marcos 01, 02 e 06, e o overlay de prod do marco 03) |
| `node-1..3`, Pod no `node-2` | `fin-platform-worker` e `fin-platform-worker2`, Pod no worker2 | É o cluster `kind` do hands-on do próprio marco 01 (1 control plane, 2 workers) |
| 18 eventos; o 17 é "o controller de EndpointSlice vê o Pod e o inclui" | 19 eventos: ver (`api → kcm`) e gravar (`kcm → api`) são dois eventos | Incluir é uma escrita no API server; juntar as duas coisas num evento `api → kcm` contradiria a regra do próprio roteiro (todo efeito passa pelo API server) |
| namespace não dito | `payments`, imagem `ghcr.io/fin/pix-gateway@sha256:9c8f2e…` | Os nomes que a trilha já usa |

Motivos e mensagens dos eventos do painel `kubectl get events`, conferidos no código do
Kubernetes (`master` em `43cbb94`, 21 nov 2026):

| Motivo | Mensagem | Fonte |
| --- | --- | --- |
| `ScalingReplicaSet` | `Scaled up replica set %s from 0 to %d` | `pkg/controller/deployment/sync.go` |
| `SuccessfulCreate` | `Created pod: %v` | `pkg/controller/controller_utils.go` |
| `Scheduled` | `Successfully assigned %v/%v to %v` | `pkg/scheduler/schedule_one.go` |
| `Pulling` | `Pulling image %q` | `pkg/kubelet/images/image_manager.go` |
| `Pulled` | `Successfully pulled image %q in %v (%v including waiting). Image size: %v bytes.` | idem |
| `Created` | `Container created` | `pkg/kubelet/kuberuntime/kuberuntime_container.go` |
| `Started` | `Container started` | idem |

A ordem do kubelet também está no código: sandbox (com o CNI) antes do pull, e pull antes de
criar e iniciar o container. O painel é marcado como **saída ilustrativa** e diz que as
colunas `LAST SEEN` e `TYPE` foram omitidas.

### Testes (`web/tests/walkthrough.spec.js`, 15 testes, sobre o piloto real)

Começa pausado; teclado completo (←/→, PageUp/PageDown, Home/End, Espaço); texto do
`aria-live` por evento e por troca de etapa; play para no fim da etapa; deep link abre pausado
no evento e a navegação não cria entrada no histórico; a troca de visão preserva o evento; o
painel começa fechado e destaca as linhas; Ampliar abre a visão com cartão e controles próprios, sincronizados com a figura, inclusive na troca de camada e no play; com
`reducedMotion: 'reduce'`, `document.getAnimations()` vazio; zero violação de CSP e zero
`style` no player; pausa com a aba oculta; 360 px com a visão sticky, a área ≤ 45vh e sem
rolagem lateral; o módulo só é baixado em marco com walkthrough; rótulos dentro do `viewBox`
nas duas camadas e em cada sequência derivada, em todos os 19 eventos. O `a11y.spec.js`
roda o axe nas duas visões. O `diagram-real.spec.js` deixa os diagramas de camada fora da
regra "todo diagrama aparece como figura num marco", porque eles aparecem dentro do
walkthrough e são cobertos pelo teste acima.

### Achados fora do escopo (registrados, não corrigidos aqui)

- `web/js/dom-helpers.js:26` põe `style="width: N%"` na barra de progresso da trilha (CSSOM,
  permitido pela CSP, mas é um atributo `style`). O teste do walkthrough verifica só a figura e
  o diálogo.
- A transição de cor do link ativo no cabeçalho roda mesmo com `prefers-reduced-motion`. Não é
  movimento, mas aparece em `document.getAnimations()` logo depois da troca de rota; o teste de
  movimento reduzido espera a página assentar antes de navegar.

### Candidatos a walkthrough (passo 9 do plano)

O `PLANO-visuais-animacao.md` não está no repositório; o registro fica aqui. Candidatos, pela
regra do README (mais de 12 passos, troca de escala ou painel): `system-design` / caso Pix de
ponta a ponta, `seguranca-aplicacao` / OAuth 2 e OIDC, `open-finance-brasil` / iniciação de
pagamento. O piloto 7.2 (`pagamentos-e-liquidacao`, "Um Pix por dentro") espera o checkpoint.

## 5. Piloto 7.2: `pagamentos-e-liquidacao` / marco 02, "Um Pix por dentro"

Encaixe: marco 02 (`pix-por-dentro`), logo depois do "Exemplo numa fintech", que narra o mesmo
caminho (QR dinâmico → URL → DICT → identificador fim a fim → SPI liquida). 7 etapas, 21
eventos, 2 camadas (`Ecossistema Pix` e `PSP do pagador`), 11 atores (a visão de sequência mostra
só os atores de cada etapa, de 2 a 4 colunas). Diagramas de camada novos: `pg-wt-ecossistema` e
`pg-wt-psp`. **Fica em PR aberto para o checkpoint com o Julio antes de publicar**, como o plano
pede para domínio regulado.

### A regra "o marco vence"

| O plano sugeria | O que a trilha ensina | Publicado |
| --- | --- | --- |
| citar `pacs.008` e `pacs.002` | O marco 02 diz "mensagem estruturada baseada num padrão internacional (**conferir** o conjunto exato e a versão vigente)" e não nomeia mensagem nenhuma | Nenhum nome de mensagem ISO. "Ordem", "aceita" e "liquidado", os termos do marco e do diagrama `pg-pix` |
| "liquidação nas contas PI" | A trilha diz "conta de liquidação", caso da "conta de reserva" do marco 01 | "contas de liquidação" |
| camada `dentro-do-psp` com gateway, antifraude, ledger e "conector SPI" | O `PROJETO.md` da trilha tem o `pix-gateway` como cliente do `orquestrador`, que consome a antifraude e o razão; o marco 09 define o orquestrador e a camada anticorrupção por provedor | `pix-gateway`, `orquestrador`, `antifraude` e `razão`; quem fala com o SPI é o orquestrador |
| "autorização interna (antifraude + reserva no ledger)" | `system-design/09`: validação de limite e antifraude, depois "reserva no ledger (debita e marca como em trânsito, dentro de uma transação local)" | Etapa 3, com essas palavras |

### Cada afirmação e a sua fonte na trilha

| Etapa | Afirmação | Fonte |
| --- | --- | --- |
| 1 | O QR dinâmico carrega uma URL; o payload é hospedado pelo recebedor (ou seu PSP) e tem estado | marco 02, "O payload dinâmico hospedado pelo recebedor" |
| 1 | Valor como texto decimal com duas casas (`"120.00"`) | marco 02, "valor como texto decimal"; nota do `pg-pix` |
| 2 | O DICT traduz a chave na conta; limite de consultas; inexistente e recusada respondem igual | marco 02, "O DICT como diretório de chaves" e "Proteção contra enumeração" |
| 3 | Antifraude, reserva em trânsito numa transação local, chave de idempotência até o SPI, razão como última defesa | `system-design/09`, "O fluxo feliz", "Idempotência de ponta a ponta" e "O que é síncrono" |
| 4 | Identificador fim a fim, base da idempotência; aceite dentro do prazo do manual vigente (sem número) | marco 02, "Mensagens, identificador fim a fim e estado" e "Limites de tempo"; `pg-pix` |
| 5 | Liquidação bruta, individual, 24x7, entre as contas de liquidação; confirmação aos dois lados | marco 02, "O SPI como infraestrutura de liquidação"; `pg-pix` |
| 6 | Em trânsito vira definitivo; estado terminal liquidado; se rejeitado, a compensação reverte a reserva | `system-design/09`, "Estados terminais únicos" e "O que é síncrono, e onde entra a saga" |
| 7 | O crédito ao recebedor vem depois da liquidação | marco 02 (aceite → liquida → confirma) e marco 03 (devolução "depois da transação concluída e do valor creditado") |

Fora do roteiro, de propósito: prazos e limites numéricos (o marco manda conferir o valor
vigente), participação direta × indireta, MED e devolução (marco 03).

**Salvaguarda do `PROJETO.md`.** Os painéis usam o formato didático do `sim-spi` do hands-on,
marcados como tal, e só dados sintéticos: chave `loja@exemplo.test` (domínio reservado `.test`),
contas `0001-000123` e `0007-004567`, PSPs `PSP-A` e `PSP-B`. Nenhum CPF, CNPJ, chave ou
participante real.

### Teste

O teste de legibilidade do `walkthrough.spec.js` passou a percorrer todo walkthrough compilado
(achando o marco pelo JSON da trilha), nas duas visões, em todos os eventos, em desktop e em
360 px, com zero violação de CSP e sem rolagem lateral; e um teste falha se algum walkthrough
compilado não for citado por um marco. O primeiro desenho do `pg-wt-ecossistema` passou de
1.100 px (1.135); os rótulos das arestas horizontais foram encurtados ("busca", "cobrança",
"confirma") e o aviso sumiu.
