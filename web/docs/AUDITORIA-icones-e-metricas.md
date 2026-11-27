# Auditoria — Ícones por tipo de componente e métricas no walkthrough (Fase 1.8)

Plano: "Ícones por tipo de componente e métricas no walkthrough (Fase 1.8)", sobre `main` em
`f01c8b3`. Onde o plano diverge do código, o código vence e a divergência fica aqui.

## 1. Re-auditoria de `main` (`f01c8b3`)

| Ponto do plano | Estado no código |
| --- | --- |
| Esquema de nós | `diagramaNo` (`diagrams.go:78`): `id`, `rotulo`, `grupo`, `col`, `row`, `papel`, `conceito`. `diagramaParticipante` (`diagrams.go:112`): `id`, `rotulo`, `papel`, `conceito`. Nenhum dos dois tem `icone`. |
| Largura dos nós | `cellWidthFor` (`diagram.js`): `maior rótulo × NODE_CHAR_W (7,4) + 28`, preso entre `CELL_W_MIN` 140 e `CELL_W_MAX` 200 px. Os 20 px do ícone (§3.3 do plano) competem com esse teto de 200, não só com o de 1.100. |
| Teto de 1.100 px | `diagramaLarguraMax = 1100.0` em `diagrams_layout.go`: é **aviso** do compilador, não erro. |
| Sequência | `SEQ_COL` entre 150 e 200 px, pelo maior rótulo de participante (× 7,4 + 40) ou de mensagem. |
| Temas claro e escuro | **Divergência:** o site tem **um** tema. Os tokens vivem só em `:root` (`style.css`), escuros (`--bg: #0f1117`), e não há `prefers-color-scheme` nem `data-theme`. "Legível nos dois temas" passa a ser "legível no tema do site"; um tema claro está fora desta fase. |
| Orçamentos (`diagram-budget.spec.js`) | `diagram.js` + `diagram-svg.js` ≤ 10.000 B; `diagram-player.js` ≤ 4.000; `walkthrough-player.js` ≤ 6.000; `diagram-zoom.js` ≤ 1.500; `diagram-chart.js` ≤ 3.500 (gzip). |
| `cmd/cobertura` | Existe (`aggregator/cmd/cobertura/main.go`); a coluna de ícones entra no PR do catálogo. |

## 2. PR 1 — Firefox e WebKit no Playwright (§3.6)

**Escopo.** O Chromium continua rodando a suíte inteira. Firefox e WebKit rodam só os arquivos em
que os motores divergem (`CROSS_ENGINE` em `playwright.config.js`):

- `diagram*.spec.js`, `walkthrough.spec.js`, `higiene.spec.js` e `a11y.spec.js`, os do plano;
- `csp.spec.js`, acrescentado porque o aceite da Fase 1 pede "CSP intacta nos três motores";
- `progress-bar.spec.js`, novo, para a pendência da frente 2 dos ajustes.

No CI, `web-tests.yml` instala os três motores.

### O que os dois motores novos acharam

| Achado | Motor | Natureza | Resposta |
| --- | --- | --- | --- |
| O app não carrega sobre `http://127.0.0.1` | WebKit | **Ambiente de teste.** O WebKit aplica o `upgrade-insecure-requests` da CSP também ao loopback: CSS e `main.js` viram `https://` e falham. Chromium e Firefox isentam o loopback. Produção é HTTPS (GitHub Pages) e não sofre disso. | O projeto `webkit` usa um segundo servidor, HTTPS, com certificado descartável (`tests/helpers/https-server.py`, porta 4174, `ignoreHTTPSErrors`). A CSP de produção **não** muda. |
| O player da Fase 1.6 abre sem "passo 1 de 4" e sem legenda | WebKit | **Defeito real no site.** `getPointAtLength` lança `InvalidStateError` numa aresta que o WebKit ainda não diagramou, ao montar o passo 1. A exceção interrompia `go()` antes de escrever a posição e a legenda. | `packet()` (`diagram-core.js`) mede dentro de `try` e, se não der, não cria o pacote. O pacote é decoração; o passo nunca fica pela metade. O teste existente, agora rodando no WebKit, é a regressão. |
| Rótulos "sobrepostos" ou "fora do `viewBox`" em 5 trilhas | Firefox | **Medida do teste.** O `getBoundingClientRect` de um `<text>` SVG no Firefox devolve a caixa de linha (≈ 1,9 em de altura, contra 1,2 no Chromium) e a área de tinta (≈ 4 px a mais de cada lado), no mesmo centro. Os screenshots confirmam glifos separados e dentro da figura. | `diagram-real.spec.js` mede todo motor na mesma faixa: largura de avanço (`getComputedTextLength`) × 1,2 em, centrada na caixa, com a faixa girada para os títulos de eixo verticais dos gráficos. |
| `k8s-gitops`: "drift: selfHeal reverte" fora do `viewBox`, em 2 de cada 16 execuções | WebKit | **Corrida no teste.** O `fitViewBox` roda pelo `ResizeObserver` quando a figura ganha layout, e o WebKit às vezes o entrega um quadro depois do clique; o teste media antes do ajuste (`viewBox` ainda `1072`, depois `1082`). Para o leitor é um quadro. | `openAll` espera todas as figuras desenhadas terem `data-ajustado` antes de medir: 16 de 16 no WebKit, e o arquivo inteiro verde nos três motores. |
| Trusted Types "não recusou" | Firefox | **Medida do teste.** O Firefox recusa, mas com outra mensagem: "Sink type mismatch violation blocked by CSP". | A expressão do teste aceita as três redações. |

### Barra de progresso (pendência da frente 2)

Em vez de comparar screenshots entre motores, que nunca são idênticos pixel a pixel, o teste
fixa a barra em 50%, tira o screenshot e lê os pixels num canvas. Em 75% da largura, a cor deve
ser a do trilho (`--surface2`); em 25%, não. Assim prova que `::-webkit-progress-value` e
`::-moz-progress-bar` pintam o preenchimento nos três motores. Os screenshots vão anexados ao
relatório do Playwright, para comparar lado a lado.

## 3. PR 2 — Catálogo, esquema, validação e cobertura (§3.1, §3.2)

**O que entra:**
- **Catálogo:** `diagrams_icones.go` traz os 13 ícones do plano, cada um com a sua forma fixa. É o único lugar do catálogo.
- **Esquema:** `icone` opcional em `diagramaNo` e em `diagramaParticipante`.
- **JSON compilado:** cada nó e participante com ícone leva `icone` **e** `forma`. O front lê a forma pronta e nunca a deduz.
- **Walkthrough:** cada ator recebe o ícone do seu nó nos diagramas de camada, e a sequência derivada herda esse ícone.
- **Cobertura:** `cmd/cobertura` ganha a coluna "Ícones".

Nenhum diagrama muda neste PR: o front ainda não desenha ícone (é o PR 3) e nenhum YAML tem `icone` por enquanto.

### Decisões e divergências

| Plano | Código / decisão |
| --- | --- |
| `cliente` e `pessoa` em "caixa arredondada"; `servico` em "caixa (atual)" | A caixa atual **já** é arredondada (`rect` com `rx` 6 em `topologia`). Para as duas se distinguirem, a forma de `cliente` e `pessoa` se chama `arredondada` e será uma pílula (raio = metade da altura). `caixa` continua sendo a caixa de hoje. |
| "Catálogo exportado no JSON compilado" | Exportado **por nó**: `icone` e `forma` ao lado de `papel`. Não há tabela global no JSON; o front não precisa de uma, e um nó sem ícone não leva nenhum dos dois campos. |
| Erro "ator com ícones diferentes em camadas diferentes" | Uma camada em que o nó do ator **não** tem ícone não conta. Com o retrofit gradual (§3.5), um ator pode ter ícone numa camada antes da outra; o erro é só quando duas camadas dizem tipos diferentes. |
| `icone` só em `topologia` | `grid()` é compartilhado por `topologia`, `fluxo` e `estados`. O ícone só é aceito quando o campo é `nos`; em `passos` (fluxo) e `estados`, o erro explica que ali os nós não são componentes. |
| Cobertura: "percentual de nós com ícone por trilha" | A conta inclui os nós de `topologia`, os participantes de `sequencia` e também os diagramas de camada dos walkthroughs. Esses não são citados por um bloco ```` ```diagrama ````, mas aparecem para o leitor; eles entram só na conta de ícones, não no total de diagramas. |

### Testes Go (`diagrams_icones_test.go`, `cobertura_test.go`)

- O catálogo tem os 13 ícones, cada um com a sua forma.
- `topologia` e `sequencia` válidas compilam `icone` e `forma`; `papel` convive com `icone`; um nó sem ícone não leva os campos no JSON.
- Um ícone fora do catálogo é erro, em nó e em participante.
- Um ícone em `estados` ou em `fluxo` é erro; o mesmo diagrama sem o ícone compila.
- Walkthrough: o ator herda o ícone, e a sequência derivada também. O mesmo ícone em duas camadas é válido; ícones diferentes, erro.
- Cobertura: conta componentes e ícones, inclusive numa camada de walkthrough, sem mudar o total de diagramas.

## 4. PR 3 — Sprite, formas e renderização, nas camadas dos 7 walkthroughs (§3.3, §3.5 item 1)

### O que entra

- **`web/assets/icones.svg`:** 13 `<symbol id="i-<icone>">`, todos desenhados para o projeto. Grade de 24×24, traço de 1,5, pontas e junções arredondadas, só `path`, `circle` e `rect`, sem texto, cor por `currentColor`. São **892 B gzip**, com teto de 4 KB em `diagram-budget.spec.js`.
- **`diagram-svg.js`:**
  - `shape()` desenha a forma do nó dentro do retângulo atual, de modo que âncoras e layout não mudam;
  - `icon()` cria o `<use href="assets/icones.svg#i-…">`, same-origin, sem atributo `style`.
- **`diagram.js`:**
  - **Topologia:** o ícone de 16 px fica na borda esquerda da caixa (`x + 10`), e o rótulo desloca 10 px.
  - **Sequência:** o ícone vai acima do rótulo, num cabeçalho 18 px mais alto, só quando algum participante tem ícone.
  - O ícone é `aria-hidden`; o nome acessível continua sendo o rótulo.
- **Largura:** `cellWidthFor` (JS) e `newGridLayout` (Go) somam 20 px **só** quando o diagrama tem ícone. Nenhum diagrama sem ícone muda de layout. Nenhuma camada passou do aviso de 1.100 px.
- **CSS:** o ícone em `--text-muted`, e a linha interna da `borda-dupla`.

### `<use>` externo nos três motores

A alternativa do plano (embutir os `<symbol>` no JSON) **não foi necessária**. O `<use>` externo desenha nos três motores: no Chromium, no Firefox e no WebKit (este pelo servidor HTTPS do PR 1). O "Ampliar" também desenha nos três.

`icones.spec.js` prova isso pelos pixels: o screenshot do `<use>` precisa ter tinta. Sem o arquivo de ícones, o teste falha.

Nota de teste: no WebKit, o `screenshot` do Playwright injeta um estilo que a CSP recusa (`style-src-elem inline`). Isso acontece também em `main`, sem ícones. Por isso o teste lê as violações de CSP **antes** de qualquer screenshot.

### Formas

| Forma | Desenho |
| --- | --- |
| `caixa` | `rect`, como antes (`rx` 6 em `topologia`) |
| `arredondada` | `rect` com `rx` = metade da altura (pílula) |
| `hexagono` | `path` de 6 lados, com recuo de 12 px |
| `cilindro` | `path`: corpo mais a borda frontal do topo (elipse de 6 px) |
| `cilindro-baixo` | `cilindro` recuado 6 px em cima e embaixo, elipse de 5 px |
| `tubo` | `path` horizontal com tampas elípticas de 8 px e a borda da tampa direita |
| `canto-dobrado` | `path` com o canto superior direito dobrado em 12 px |
| `borda-dupla` | `rect` mais um `rect` interno recuado 4 px (`.diagrama-no-borda`) |

A classe `.diagrama-no-caixa` continua na forma (seja `rect` ou `path`). Por isso os estados (`diagrama-est-*`), o `papel` e os testes de "aresta atravessa caixa" valem sem mudança.

### Ícones nas camadas: o papel na figura

| Diagrama | Ícones |
| --- | --- |
| `k8s-wt-cluster` | `kubectl` cliente · `etcd` banco · `api`, `sched`, `kcm`, `worker`, `worker2` plataforma · `proxy` rede |
| `k8s-wt-node` | `api`, `kubelet`, `cri` plataforma · `cni` rede · `pod` servico |
| `pg-wt-ecossistema` | `pagador` cliente · `recebedor` pessoa · `psp-pa`, `psp-pb`, `dict`, `spi` instituicao · `liq` banco |
| `pg-wt-psp` | `pagador` cliente · `gateway` gateway · `orq`, `antifraude` servico · `razao` banco |
| `sa-wt-code-pkce` | `titular` cliente · `atacante` pessoa · `client`, `api` servico · `as` identidade |
| `sd-wt-falha` | `cliente` cliente · `gw` servico · `toxi` rede · `spi` instituicao · `ledger` banco · `conc` job · `arquivo` arquivo |
| `of-wt-ecossistema` | `cliente` cliente · `itp`, `det`, `spi` instituicao |
| `of-wt-detentora` | `itp` instituicao · `pag` gateway · `antifraude`, `cons`, `rails` servico · `ledger` banco |
| `ae-wt-saga` | `gw`, `risco`, `orq`, `ledger`, `notif` servico · `psp` instituicao · `atend` pessoa · `sagadb` banco · `timer` job |
| `dd-wt-2pc` | `outro`, `coord` servico · `banco` banco · `plantao` pessoa · `fila` fila · `recon` job |

A regra do §6 do plano aparece na tabela:
- **Ledger, dois ícones:** em `sd-wt-falha`, `of-wt-detentora` e `pg-wt-psp`, o ledger é onde o débito fica gravado, então é `banco`. Em `ae-wt-saga`, é o serviço síncrono que reserva e libera, então é `servico`.
- **Atores em duas camadas:** `api` (kubernetes), `itp` (open finance) e `pagador` (pagamentos) aparecem em duas camadas com o mesmo ícone, como o compilador exige.

Cobertura depois deste PR: as 7 trilhas com walkthrough têm entre 16% e 48% dos nós com ícone (`go run ./cmd/cobertura`).

## 5. PR 4 — Spike "2.5D leve" (§3.4): **aguarda decisão do Julio**

Tudo do spike está em `spikes/icones-25d/`, fora do build e do CI: o README com as medidas, as capturas lado a lado em desktop e 360 px, `resultados.json` e o código que mede. O resumo:

| Medida | A (plano) | B (2.5D leve) |
| --- | --- | --- |
| Bytes gzip a mais | 0 | +162 B |
| Contraste (axe) | 0 violação | 0 violação |
| Rótulos e faces no `viewBox` | ok | ok |
| Pontas de seta que chegam pela direita ou por baixo | visíveis | cobertas pela face (5 dos cerca de 9 px) |

**Recomendação: A.** A B esconde a direção de setas, que é informação. Consertar exigiria mexer nas âncoras das arestas, o que a §3.3 do plano proíbe, e a profundidade quase não aparece no tema escuro. Sem decisão, fica a A, já em produção.

Decisão do Julio: _pendente_.

Merge do #197 em 27 nov 2026, sem uma escolha registrada entre A e B. Pelo plano, vale a **A**; a decisão continua aberta para o Julio.

## 6. PR 5 — Ícones nos diagramas dos marcos com walkthrough e convenção no README (§3.5, itens 2 e 3)

### Retrofit

São 7 marcos com walkthrough, um diagrama em cada. **Cinco** recebem ícones; dois são `estados`, que o compilador recusa (§3.2). Os ícones seguem os das camadas dos walkthroughs, para o mesmo componente não mudar de tipo entre a figura do marco e o roteiro.

| Marco | Diagrama | Ícones |
| --- | --- | --- |
| `kubernetes/01` | `k8s-control-plane` (topologia) | `kubectl` cliente · `etcd` banco · `api`, `scheduler`, `controllers`, `kubelet` plataforma · `pod` servico |
| `pagamentos-e-liquidacao/02` | `pg-pix` (sequencia) | `pa`, `dict`, `spi`, `pb` instituicao |
| `seguranca-aplicacao/05` | `sa-code-pkce-par` (sequencia) | `titular` cliente · `client` servico · `as` identidade |
| `open-finance-brasil/07` | `of-iniciacao` (sequencia) | `itp`, `det`, `spi` instituicao · `cliente` cliente |
| `dados-distribuidos/08` | `dd-2pc` (sequencia) | `coord` servico · `banco` banco · `fila` fila · `humano` pessoa |
| `system-design/09` | `sd-pix-estados` (estados) | — (estados não leva ícone) |
| `arquitetura-eventos/09` | `ae-saga-orquestrada` (estados) | — (idem) |

### Defeito do PR #196, corrigido aqui

`pg-wt-ecossistema` passou a 1.113 px de largura natural com os 20 px do ícone, acima do aviso de 1.100. O aviso saiu no build do #196, mas ficou escondido entre os avisos das fontes de feed (que o proxy bloqueia aqui), e eu não o vi.

Como o plano manda, encurtei o rótulo e não subi o teto: "contas de liquidação" (20 caracteres) virou "liquidação no BACEN" (19). O novo nome mantém o conceito do marco 02, que se liquida no BACEN, e não introduz o termo "conta PI", que a trilha não usa. O ator do walkthrough `pg-um-pix-por-dentro` mudou junto, para os dois nomes baterem. O build agora não emite nenhum aviso de largura.

### Convenção

O README ganhou a seção "Icons by component type", com:
- o catálogo e as formas;
- a diferença entre `icone` e `papel`;
- os erros de build;
- a regra do papel na figura (o ledger como `banco` ou `servico`);
- a regra da largura (encurtar o rótulo, nunca o teto);
- a convenção: todo `topologia` e `sequencia` **novo** tem ícone em todos os nós, e os antigos migram trilha a trilha, guiados pela coluna "Ícones" da cobertura.

## 7. PR 6 — Legenda dos tipos de pacote e nome do próximo passo (§4.1, §4.2)

### Legenda (§4.1)

- **Compilador:** `Walkthrough.Legenda` traz os tipos usados, em ordem fixa (`sync`, `async`, `reply`, `timeout`). A lista sai das mensagens das sequências derivadas, em que um evento sem tipo já é `sync`. Assim o front não varre os eventos. Teste: `TestWalkthroughLegenda`.
- **Player:** uma lista abaixo da visão, só com esses tipos. Cada item tem uma amostra `aria-hidden` e o nome: "pedido", "evento assíncrono", "resposta", "sem resposta".
- **A amostra repete o que a sequência desenha:**
  - o traço: contínuo; tracejado em `reply`; pontilhado em `timeout`;
  - a ponta: cheia em `sync`; aberta em `async` e `reply`; nenhuma em `timeout`;
  - o pacote: ● nos tipos que andam; ✕ em `timeout`, que não anda.
- O tipo nunca é dito só por cor.

**Divergência:** o plano fala em "a forma do pacote" por tipo. No player, o pacote é **o mesmo círculo** em todos os tipos; o que muda é o traço e a ponta. A legenda mostra o que o leitor vê. Ela não inventa formas de pacote que o desenho não tem.

### Próximo passo (§4.2)

- O `»` ganha `aria-label="Próxima etapa: {título}"`. Na última etapa, fica "Próxima etapa", com `aria-disabled`.
- No **último evento de cada etapa**, o cartão mostra "A seguir: {título da próxima}", ou "Fim do roteiro" na última. Nos outros eventos, a linha fica escondida.
- O indicador passa a "Etapa 3 de 7 · {título}".
- Teste em `walkthrough.spec.js`, nos 7 walkthroughs: a legenda bate com os tipos usados, e, em cada etapa, o primeiro e o último evento mostram a linha e o `aria-label` certos.

### Orçamento

`walkthrough-player.js`: de 5.416 para **5.770 B gzip** (teto 6.000). Sobram 230 B. Por isso as métricas (§4.3) vão para um módulo lazy com teto próprio, como o plano prevê.

## 8. PR 7 — Métricas acumuladas e os 2 pilotos (§4.3)

### O que entra

- **Compilador** (`walkthroughs_metricas.go`):
  - O bloco `metricas` aceita até 3 métricas, e cada evento muda valores com `+N` ou `=N`.
  - Os valores são acumulados como inteiros ×10⁴, sem erro de ponto flutuante, e cada evento leva o **texto** pronto (vírgula decimal, ponto de milhar, "N de M" com `max`) mais a lista `mudou`.
  - A descrição textual (`<details>`) acrescenta os valores depois de cada evento que os muda.
  - Testes: as operações, o acúmulo, `max`, a descrição, um walkthrough sem métricas e 11 casos de erro.
- **Player:** os cartões ficam num módulo lazy, `walkthrough-metricas.js` (838 B gzip, teto de 1 KB), baixado só quando o walkthrough tem `metricas`. `walkthrough-player.js` fica em 5.916 B (teto 6.000).
  - Os cartões ficam acima da visão e também no "Ampliar".
  - O cartão que mudou ganha borda e um ▲ visível; nada anima.
  - O `aria-live` acrescenta só o que mudou ("Em trânsito: R$ 120,00.").
  - Em 360 px, os três cartões dividem uma linha (o rótulo quebra), sem rolagem lateral, e a visão segue em até 45vh.

### Divergência: as métricas do piloto `sd` (o marco vence)

O plano pedia "Desde o envio" (s) e "Em trânsito" (R$), com "os 8 s e o timeout". Só que **nem o marco 09, nem os painéis, nem o hands-on dão o valor do timeout**: o texto diz "acima do timeout configurado". Um número no evento do timeout seria inventado, e a §6 do plano proíbe isso. Além disso, "desde o envio" em segundos não alcança a conciliação, que acontece em D+1.

No lugar, entram três métricas com fonte, que contam a mesma lição: o dinheiro fica em trânsito enquanto o tempo passa, até a conciliação, e nunca se reenvia.

| Métrica | Evento → valor | Fonte |
| --- | --- | --- |
| Em trânsito (R$) | 2 → R$ 120,00 · 12 → R$ 0,00 | painel `ledger`, linhas 1 (RESERVA -120.00 EM_TRANSITO) e 4 (EFETIVA, LIQUIDADO) |
| Envios ao SPI | 3 → 1, e **fica 1** na consulta (eventos 7–9) | etapa "Consultar, nunca reenviar"; marco 09, "nunca é assumir que falhou e tentar de novo" |
| Dias desde o envio | 3 → 0 · 10 → 1 | etapa 5, "No dia seguinte, a conciliação…"; marco 09, conciliação D+1 |

### Piloto `dd` (§4.3)

O plano pedia "Locks presos há" (min) e "Transações em dúvida". Entram estas, e mais uma terceira, com fonte.

| Métrica | Evento → valor | Fonte |
| --- | --- | --- |
| Tempo com locks (h) | 3 → 0 h · 10 → 3 h | evento 3 ("passa a segurar os locks"); evento 10, "preparada há 3 horas" |
| Em dúvida | 5 → 1 · 12 → 0 | etapa 2 (o coordenador cai depois dos sim); evento 12 (o segundo plantão decide) |
| Pix que falharam | 8 → 1 | evento 8 e painel `banco`, linha 9 (`ERROR: canceling statement due to lock timeout`) |

- A unidade é `h`, não `min` como no plano: a fonte diz "3 horas", e 180 min seria a mesma coisa num número menos legível.
- Depois do `COMMIT PREPARED` (evento 11), o cartão continua em "3 h". Ele mede o tempo **total** com locks, não o tempo de agora; o rótulo diz "Tempo com locks", não "presos há".
