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

PENDENTE
