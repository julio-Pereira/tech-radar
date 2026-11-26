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
