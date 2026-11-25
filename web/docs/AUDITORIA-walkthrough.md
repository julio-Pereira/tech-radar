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

### Achados fora do escopo

Os dois achados desta seção (o `style` da barra de progresso e a transição do cabeçalho com
movimento reduzido) foram corrigidos e estão registrados na seção 9, "Ajustes pós-Fase 1.7",
frente 2.

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
| 7 | O crédito ao recebedor vem depois da liquidação | marco 02 (aceite → liquida → confirma aos dois lados); o marco 03 põe o bloqueio cautelar "no recebimento, antes de o valor ficar disponível", isto é, entre a liquidação e o crédito disponível ao lojista, que este roteiro não aborda |

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

## 6. Expansão: `seguranca-aplicacao` / marco 05, "Authorization code com PKCE, do redirect ao refresh roubado"

Checkpoint do Julio no celular e no desktop aprovado depois do piloto 7.2; esta é a primeira
trilha da expansão. Regra do README atendida: **painel** (o tutorial do marco, comando a comando)
e mais de 12 passos (16 eventos em 5 etapas, contra os 9 do diagrama `sa-code-pkce-par`, que
fica). Uma camada, `sa-wt-code-pkce`; 5 atores, então a sequência derivada mostra sempre as 5
colunas na mesma ordem.

O roteiro vai além do diagrama em dois pontos que o marco ensina e o diagrama não mostra: o
`access_token` indo à API (e o `id_token` ficando no client, com a validação do marco 04:
algoritmo fixo, `kid` no JWKS, `iss`, `aud`, `exp`) e o **complemento** do hands-on, a rotação
do refresh token com detecção de reuso.

### Correções no próprio marco 05, achadas ao ligar os eventos ao tutorial

| Achado | Correção |
| --- | --- |
| O texto ensina que o `nonce` protege o `id_token` contra replay, mas a URL de autorização do tutorial não mandava `nonce`, e o passo 4 não o conferia | O tutorial gera `NONCE`, manda `&nonce=${NONCE}` e o passo 4 diz qual valor esperar no `id_token`; a lista "inspecione cada parâmetro" inclui o `nonce` |
| "o degrau completo, com mTLS de verdade (...), é o marco 06" | É o marco 07 (`fapi-mtls-e-ciba`; o `PROJETO.md` também põe o mTLS no 07) |
| "autorização sobre um recurso específico, tema que o marco 07 aprofunda" | É o marco 08 (`autorizacao`) |

### Papéis neste laboratório

O `PROJETO.md` da trilha usa o `pix-gateway` como client **e** como resource server ("ou um
resource server mínimo equivalente"). O roteiro os mostra como dois atores, `pix-gateway (client)`
e `API /payments`, porque o que cada papel confere no token é diferente; o texto da etapa 4 diz
isso. O PAR aparece na prosa da etapa 1 ("como no diagrama acima"), não nos eventos, porque o
tutorial usa a requisição de autorização sem PAR.

## 7. Expansão: `system-design` / marco 09, "Um Pix sem resposta do SPI, até a conciliação D+1"

O caminho feliz do Pix já é o piloto 7.2; este roteiro segue o **caminho da falha**, que é o
coração do marco 09 ("o desenho de um pagamento é o desenho de estados terminais únicos e de
resultado desconhecido"). Regra do README atendida: **painel** (a falha injetada no Toxiproxy e os
lançamentos no ledger) e mais passos que o diagrama `sd-pix-estados` (6 passos), que fica: 6
etapas, 14 eventos, uma camada `sd-wt-falha`. 7 atores, então cada etapa mostra na sequência só os
seus.

O cenário é o do **"Exemplo numa fintech" do próprio marco**: débito feito, SPI sem resposta por
8 s, acima do timeout configurado; o cliente vê "em processamento"; o ledger guarda "em
trânsito"; a conciliação D+1 decide e, como o arquivo mostra que liquidou, "em trânsito" vira
"liquidado" e o cliente é notificado tarde. O ramo "não liquidou → revertido" fica na anotação do
evento da conciliação, para não haver dois desfechos no mesmo roteiro.

| Afirmação | Fonte |
| --- | --- |
| Validação, antifraude e reserva síncronas e locais; chave de idempotência até o SPI | marco 09, "O fluxo feliz", "Idempotência de ponta a ponta", "O que é síncrono" |
| Timeout não é falha; não reenviar; consultar o status | marco 09, "Estados terminais únicos" e "Resultado desconhecido" |
| "Em verificação" com prazo declarado e alerta; conciliação D+1 contra o arquivo do SPI | marco 09, "Resultado desconhecido" |
| 8 s sem resposta, "em processamento", "em trânsito", notificação tardia | marco 09, "Exemplo numa fintech" |
| Estados `EM_TRANSITO`, `ENVIADO_AO_SPI`, `EM_VERIFICACAO`, `LIQUIDADO` | diagrama `sd-pix-estados` |
| Fake do SPI atrás do Toxiproxy, latência injetada | marco 09, Desafio; `PROJETO.md` ("Toxiproxy, falha injetada no caso do marco 09") |
| Conservação: débitos = créditos + em trânsito | marco 09, invariante 2 |

Os comandos do painel seguem o README do Toxiproxy (`Shopify/toxiproxy`, commit `49299d8`, 14 out
2026): `toxiproxy-cli create -l <listen> -u <upstream> <nome>` e `toxiproxy-cli toxic add -t
latency -a latency=<ms> <nome>`. Portas e nomes são do laboratório e estão marcados como
ilustrativos.

## 8. Expansão: `open-finance-brasil` / marco 07, "Uma iniciação de pagamento, do consentimento ao estado terminal"

Domínio regulado: o PR fica aberto para o Julio revisar o conteúdo antes do merge, como no piloto
7.2. **Aguarda revisão do Julio** (o PR #188 foi mergeado, mas a revisão de conteúdo no celular e no
desktop continua pendente, como a task de ajustes registra; a correção do evento 13 na seção 9,
frente 3, também entra nessa revisão). 6 etapas, 19 eventos, 2 camadas (`Ecossistema` e `Detentora`), 9 atores. Vai além do
diagrama `of-iniciacao` (9 mensagens, que fica) em três pontos que o marco ensina e os invariantes
testam: o que acontece **dentro** da detentora (conferência de valor e recebedor, consumo do
consentimento, limites e antifraude, débito, ordem), o **retry com a mesma chave** (invariante 1)
e a **notificação repetida** depois do estado terminal (invariante 4).

| Afirmação | Fonte |
| --- | --- |
| Consentimento de pagamento com valor, recebedor e conta exatos, validade curta, uso único | marco 07, "O consentimento de pagamento, revisitado" |
| Autenticação forte daquele movimento, mais rigorosa que a de dados; jornada com ou sem redirecionamento (**conferir**) | marco 07, "Autenticação forte do cliente" |
| Valor e recebedor idênticos entre consentimento e iniciação; diferença é recusada | marco 07, "Vinculação" e invariante 3 |
| Chave de idempotência da ITP; mesma chamada, um único pagamento | marco 07, "Idempotência da iniciação" e invariante 1 |
| Limites e antifraude com o perfil de risco da iniciação por terceiros | marco 07, "Limites, antifraude e resposta assíncrona" |
| A detentora debita e envia ao SPI; Pix de R$ 100 | marco 07, "Exemplo numa fintech" |
| SPI sem resposta: resultado desconhecido, resolvido por consulta | marco 07, "A ligação com o Pix" e invariante 5; diagrama `of-iniciacao` |
| Notificação duplicada ou fora de ordem não reverte o terminal | marco 07, "Estados e o estado terminal único" e invariante 4 |
| `fin-books` (contas) e `fin-rails` (Pix) como vizinhos da detentora | `PROJETO.md` da trilha, contratos com os vizinhos |

**Fora do roteiro, de propósito:** nomes de estados (o marco manda conferir os vigentes; o roteiro
diz "liquidado", como o marco faz em prosa), o desenho exato da jornada com ou sem
redirecionamento, pagamento agendado com *hold* e o caso "aceito e depois rejeitado pelo SPI",
que o marco deixa como regra de negócio a decidir no complemento. Não há painel: o marco não tem
código nem mensagem para ligar aos eventos, e inventar um leiaute de API regulada seria afirmar o
que o marco manda conferir.


## 9. Ajustes pós-Fase 1.7

Task do Julio sobre `main` em `2228ed0`: três frentes, um PR cada. **Re-auditoria:** a frente 2 já
estava quase toda no PR #189 (aberto antes da task, a pedido do Julio); ela foi completada no
próprio #189 e entrou antes da frente 1. A ordem da task existe porque a frente 3 consome o
orçamento que a frente 1 libera, e a frente 2 não mexe no renderer, então a troca não afeta isso.

### Frente 2 — higiene (PR #189)

- **Barra de progresso:** `<progress max="100">` nativo em `dom-helpers.js`, com `bar.value` em
  `course-view.js`. Saíram o `role="progressbar"` e os `aria-value*`, redundantes no elemento
  nativo; o `aria-label` fica. O visual está em CSS (`::-webkit-progress-bar`,
  `::-webkit-progress-value`, `::-moz-progress-bar`).
- **Outros `.style.` em `web/js`**, que ficam e por quê: `desvio.js:121` grava `--site-header-h`
  no `<html>` com a altura medida do cabeçalho, e `conceitos.js:168-169` posiciona a prévia de
  conceito em px junto ao termo. Os dois usam coordenadas que só existem em tempo de execução e
  não cabem em classe estática; a CSP (`style-src 'self'`) permite CSSOM. Nenhum dos dois aparece
  nas rotas do teste de higiene: o primeiro só durante um desvio de conceito, o segundo só com a
  prévia aberta.
- **Movimento reduzido:** em vez de uma regra por componente, uma regra **global** em `style.css`
  (`*, *::before, *::after { transition: none !important; animation: none !important; }` dentro de
  `prefers-reduced-motion: reduce`). É mais segura porque cobre também as transições criadas
  depois: o CSS tinha 28 `transition` e quase todas valiam sem condição. As `animation` CSS já
  eram todas condicionadas a `no-preference`. O `::-webkit-progress-value`, que o seletor universal
  não alcança, fica explícito em `course.css`. As Web Animations disparadas por JS (pacotes dos
  diagramas e do walkthrough) já consultam o media query.
- **Testes:** `higiene.spec.js` confere zero `[style]` no documento inteiro em quatro rotas: início,
  índice de trilhas (com as barras), trilha com marco e diagrama desenhado, e marco com
  walkthrough. Também confere `document.getAnimations()` vazio **imediatamente** depois de cada
  troca de rota pelo menu, com movimento reduzido. Sem a regra global, o teste falha com
  `CSSTransition`; com ela, passa. O teste de movimento reduzido do walkthrough deixou de esperar a
  página assentar, e o de CSP verifica o documento inteiro.
- **Não feito:** a comparação de screenshot da barra em Chromium, Firefox e WebKit. O aceite a pede
  "se já estiverem configurados", e o `playwright.config.js` só tem o projeto `chromium`. O
  Firefox usa `::-moz-progress-bar`, que está no CSS, mas não foi verificado em navegador.

### Frente 1 — orçamento do renderer

**Medição** (gzip do arquivo menos gzip sem a função; aproximado, porque o gzip não é aditivo).
O par `diagram.js` + `diagram-svg.js` estava em 9.952 de 10.000 B, e o `diagram.js` sozinho em
8.586 B:

| Bloco | ≈ B gzip | Quem usa |
| --- | --- | --- |
| `drawChart` + `axisScale` + `niceStep` + `point` + `wireChartKeys` + `fmt`, `MARKS`, `CH_*` | ≈ 2.060 | só `grafico` |
| `drawSequence` | 705 | `sequencia` e a visão de sequência do walkthrough |
| `drawGraph` + `drawEdge` + `drawNode` | ≈ 1.370 | `topologia`, `fluxo`, `estados` e o walkthrough |
| `drawInto` | 547 | toda figura |
| `zoomDialog` + `openZoom` | ≈ 566 | só ao clicar em Ampliar |
| `fitViewBox` | 229 | toda figura e o walkthrough |
| `resumeReturnPoint` | 226 | desvio de conceito |
| demais (catálogo, `draw`, larguras, links de conceito, utilitários) | < 125 cada | todos |

**Decisão: Opção A.** Saem do caminho crítico os dois blocos que nem todo marco usa:

- `diagram-zoom.js`: o diálogo do Ampliar, baixado por `import()` no primeiro clique. O
  `diagram.js` mantém `openZoom` exportado, agora devolvendo uma Promise; o walkthrough espera
  por ela (se o play avançou enquanto o módulo descia, o `go()` seguinte redesenha a visão
  ampliada).
- `diagram-chart.js`: o tipo `grafico`, baixado pelo `renderDiagrams` só quando uma figura é um
  gráfico.
- O `drawSequence` fica: o walkthrough o usa e o caminho seria assíncrono num ponto (a troca de
  visão) que hoje é síncrono.

**Resultado:** o par foi de 9.952 para **7.042 B**, com 2.958 B de folga sob o teto de 10.000,
que **não muda** (a Opção B, subir o teto, não foi necessária). Tetos novos em
`diagram-budget.spec.js`: `diagram-zoom.js` com 1.097 B (teto 1.500) e `diagram-chart.js` com
3.132 B (teto 3.500). O `walkthrough-player.js` foi para 5.104 B (teto 6.000).

**Achado ao mover o Ampliar, e corrigido.** Sob carga, `diagram.spec.js:99` falhou uma vez: depois
do Esc, ainda havia um `svg` no diálogo. A causa é a ordem que a especificação do `<dialog>` define:
`close()` devolve o foco na hora e dispara o evento `close` uma tarefa depois. O teste espera o
foco voltar e conta os `svg` sem esperar, e a limpeza rodava no handler de `close`. A corrida já
existia (isolado, o teste passava 6 vezes seguidas com o código antigo e com o novo). Agora a
limpeza roda **antes** de fechar, nos três caminhos: Esc (evento `cancel`), botão Fechar e clique
fora. O evento `close` continua disparando para quem depende dele, como a pausa dos players.
Depois disso, o teste do Ampliar e os do walkthrough passaram 20 de 20 com `--repeat-each 10
--workers 6`.

**Testes:** as suítes da Fase 1.6 e do walkthrough passam **sem alteração de teste** (103 de 103:
`diagram*`, `walkthrough`, `a11y`, `higiene`). `diagram-lazy.spec.js` é novo e cobre três casos:
num marco sem diagrama, nenhum dos módulos novos desce; num marco com diagrama numa trilha sem
gráfico, só desce o `diagram.js`, e o `diagram-zoom.js` desce no primeiro clique em Ampliar; numa
trilha com gráfico, desce o `diagram-chart.js`.

**Achado fora do escopo.** A visão da trilha monta o corpo de todos os marcos ao abrir (escondidos
até expandir), e o `hydrateDiagrams` roda para cada um. Por isso o `diagram.js` desce assim que a
trilha tem algum diagrama, mesmo que o marco aberto não tenha, e o `diagram-chart.js` desce se
algum marco da trilha tem gráfico. Isso já era assim antes desta frente. Hidratar só ao expandir
mudaria o comportamento da timeline (desvios, retorno a conceito, "Continuar") e fica para uma
task própria.

### Frente 3 — evento `tipo: timeout`

**Problema.** Um pedido que não teve resposta era desenhado como uma **resposta**: um pacote
viajando de quem não respondeu para quem esperou. A visão contradizia a lição do "resultado
desconhecido", que aparece em `system-design/09`, `open-finance-brasil/07` e
`pagamentos-e-liquidacao`.

**Esquema.** `tipo: timeout` passa a valer ao lado de `sync | async | reply`. `de` é quem pediu e
esperou, `para` é quem não respondeu, e a aresta é a do pedido original (`de → para`). O build
falha se nenhum evento **anterior** do walkthrough fez esse pedido (`de → para`, `sync`, `async` ou
sem tipo). Um `reply` não conta como pedido. O `timeout` aceita painel. O evento compilado carrega
`tipo: "timeout"`, e só ele. A sequência derivada o recebe com o rótulo "sem resposta". Teste:
`TestWalkthroughTimeout`, com um caso válido e dois inválidos (sem pedido anterior; o anterior era
só uma resposta).

**Renderização**, toda com texto além do traço:

| Onde | Como |
| --- | --- |
| Topologia | A aresta do pedido acende pontilhada (`2 5`, diferente do `6 4` do `reply`), **sem pacote**, com "✕ sem resposta" perto da ponta que não respondeu |
| Sequência derivada | Seta pontilhada que para 26 px antes da linha de vida do destino, sem ponta de seta, com "✕" e o rótulo "sem resposta" |
| Cartão | `detentora ⇢ SPI · sem resposta` |
| `aria-live` | "Evento N de M. Sem resposta de {para} para {de}. {msg}" |
| Descrição textual | `{de} → {para} (sem resposta): {msg}` |
| Movimento reduzido | Igual aos outros tipos; aqui já não há pacote |

**Conteúdo.** A varredura dos 5 walkthroughs (`não responde`, `sem resposta`, `não chega`,
`estoura`, `não volta`, `silêncio`, `não recebe`) achou **dois** eventos que desenhavam uma
ausência como resposta, e não só o da revisão:

| Walkthrough | Antes | Depois |
| --- | --- | --- |
| `of-iniciacao-ponta-a-ponta`, evento 13 | `spi → det`, `reply`: "O SPI não responde no prazo" | `det → spi`, `timeout`: "O prazo vence sem resposta do SPI: o resultado é desconhecido" (pedido anterior: o evento 12, `det → spi`, `async`) |
| `sd-pix-resultado-desconhecido`, evento 8 | `toxi → gw`: "A consulta cai na mesma latência e não volta no prazo" | `gw → toxi`, `timeout`: "O prazo da consulta vence sem resposta: ela caiu na mesma latência" (pedido anterior: o evento 7, a consulta) |

A contagem e a numeração dos eventos não mudaram (19 e 14), e a prosa das etapas continua valendo.
Ficaram como estão, porque são eventos reais e não ausências:

- "Sem resposta a tempo, a ITP repete a iniciação…" (`of`, evento 16): é a retentativa em si.
- "Estoura o timeout, e o pix-gateway responde ao cliente…" (`sd`, evento 5): é uma resposta real
  ao cliente. Um `gw → toxi` `timeout` antes dele repetiria o que a `msg` já diz, e a task pede o
  `timeout` ali "só se deixar o roteiro mais claro".
- "A readiness probe começa. Até ela passar, o Pod não recebe tráfego" (`kubernetes`, evento 15):
  é a probe começando.

**Testes.** `walkthrough.spec.js` percorre todo evento `timeout` compilado e confere, com movimento
**normal**:
- nada se move dentro da figura no evento (nem pacote, nem crossfade);
- o cartão, o `aria-live`, a marca na topologia, a seta da sequência (sem `marker-end`, com "✕" e
  "sem resposta") e a descrição textual;
- zero CSP.

Sem a condição que bloqueia o pacote no timeout, o teste falha com `Animation diagrama-pacote`. A
conta exclui as transições CSS de cor e traço, que valem para qualquer evento, e o que está fora da
figura: o diagrama animado `of-iniciacao` (Fase 1.6), no mesmo marco, desenha um pacote ao exibir o
seu passo 1, comportamento antigo dele. O teste de legibilidade continua percorrendo todos os
eventos, inclusive os de timeout, nas duas visões, em desktop e em 360 px.

**Orçamento:** `walkthrough-player.js` com 5.392 B (teto 6.000) e o par do renderer com 7.192 B
(teto 10.000).

## 10. Expansão: `arquitetura-eventos` / marco 09, "Uma liquidação que o PSP deixa sem resposta"

Base `c57d297`. 7 etapas, 26 eventos, 1 camada (`ae-wt-saga`), 9 atores; a sequência mostra por
etapa só os atores que usa (D2), de 3 a 4 colunas. O diagrama `ae-saga-orquestrada` (estados, 8
passos) **fica**: ele mostra para onde a saga vai, e o roteiro mostra quem faz o quê para ela ir.
Encaixe: no fim do "Exemplo numa fintech", antes do "Hands-on", como o plano pede.

**Pré-requisito:** `sql` entrou em `wtLinguagens`, sem highlight (D7), com
`TestWalkthroughPainelSQL` (aceita `sql` e recusa uma linguagem desconhecida). Nenhum JS mudou: o
player não usa a linguagem do painel.

### Divergências entre o plano e o marco (o marco vence)

| Plano | Marco / projeto | Publicado |
| --- | --- | --- |
| Painel `timer`, linhas "3-9" | O SQL do próprio plano tem 8 linhas; "3-9" quebraria a regra 6 | linhas "2-8" (do `SELECT` ao `FOR UPDATE`) |
| Aresta `orq → sagadb` "grava estado" | O evento 15 é uma **leitura** ("lê a saga"), e o rótulo aparece na sequência | "grava / lê estado" |
| Evento 1: "o pix-gateway pede ao fin-flow a liquidação" | O `PROJETO.md` diz que o `fin-flow` **consome** `payments.initiated` do `pix-gateway` | "O pix-gateway publica payments.initiated, e o fin-flow abre a liquidação" |
| Ator `ledger` | O `PROJETO.md` chama o vizinho de `ledger-core` (síncrono, idempotente por chave de negócio) | rótulo `ledger-core` |
| Risco por pedido e resposta | O `PROJETO.md` lista `payments.authorized` como evento consumido; o marco descreve a orquestração como "comandar os passos" | pedido e resposta, como o marco ensina; a divergência fica registrada aqui |

### Cada afirmação e a sua fonte no marco 09

| Etapa | Afirmação | Fonte |
| --- | --- | --- |
| 1 | A saga é um registro com id, estado, passo, tentativa, prazo e histórico, consultável; "onde está?" vira uma consulta | "A saga é uma máquina de estado persistida"; tutorial, item 1 |
| 1, 5 | `settlement-8f2c`, `correlation_id`, `GET /sagas/{correlationId}` | registro de exemplo do marco; tutorial, itens 1 e 5 |
| 2 | O histórico é escrito na mesma transação em que muda o estado, como o outbox/inbox do marco 08 | tutorial, item 3 |
| 2 | Reservar saldo tem a compensação "liberar reserva"; risco é só leitura, sem compensação | "Exemplo numa fintech", tabela dos passos |
| 3 | O envio ao PSP é o pivot step; o irreversível vem o mais tarde possível | "Compensação é semântica", "Pivot step"; tabela dos passos |
| 3 | Nenhuma saga aberta fica sem prazo | invariante 2 |
| 4 | O modo de falha mais comum é silêncio, sem exceção nem alerta; "passaram-se 30 minutos" é um fato que dispara uma política | "Timeout: cidadão de primeira classe" |
| 4 | Temporizador como job que busca sagas com prazo estourado | tutorial, item 4 |
| 5 | Numa fintech alguém sempre pergunta: cliente, atendimento, regulador | "Coreografia × orquestração" |
| 6 | Ao estourar o prazo: retentar, compensar ou escalar; esgotou → `ESCALADA` | "Timeout"; diagrama `ae-saga-orquestrada` |
| 6 | **Consultar antes de reenviar, com o mesmo identificador** | **não está no marco**: vem de `system-design/09` e `open-finance-brasil/07`; a frase proposta abaixo o leva para o marco |
| 6, 7 | O PSP rejeita → `COMPENSANDO` → reserva liberada → `CANCELADA` | diagrama `ae-saga-orquestrada` |
| 7 | Compensação acrescenta (transação nova, registro próprio), pode falhar e tem retentativa; notificar vem depois, nunca antes | "Compensação é semântica, não rollback" |

**Fora, de propósito:** coreografia, Temporal e Camunda, o `kill -9` do desafio (é do leitor), o
`ESTORNO_FORA_DE_JANELA` e a falha da própria compensação (só na prosa da etapa 7). O ramo feliz
(`LIQUIDADA → NOTIFICADA`) fica no diagrama `estados`; o ramo `ESCALADA`, só como anotação.

### Proposta no marco 09 — **aguarda checkpoint do Julio**

Em commit próprio, neste mesmo PR: a seção "Timeout: cidadão de primeira classe" ganha uma frase
dizendo que retentar um envio sem resposta é consultar o estado pelo identificador e, só se o PSP
não tiver registro, reenviar com o mesmo identificador, com a ponte para `system-design/09`. Sem
ela, o marco diz "prazo estoura → retentar" e o roteiro ensina "consultar antes de reenviar". As
duas coisas são compatíveis, mas só o roteiro diz isso.
