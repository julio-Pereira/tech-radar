# Spike — "2.5D leve" nos diagramas (Fase 1.8, plano §3.4)

Fora do build de produção e fora do CI. **Decisão do Julio pendente; sem decisão, fica a
variante A** (a que já está em produção desde o PR #196).

## O que se comparou

Os mesmos três diagramas de camada, no evento 1 de cada walkthrough:

| Diagrama | Walkthrough | Por quê |
| --- | --- | --- |
| `k8s-wt-cluster` | `kubernetes/k8s-do-apply-ao-pod-ready` | o mais denso, com grupos |
| `sd-wt-falha` | `system-design/sd-pix-resultado-desconhecido` | 4 colunas, todas as formas de ponta |
| `ae-wt-saga` | `arquitetura-eventos/ae-saga-sem-resposta` | 9 nós e o maior número de arestas |

- **A — plano:** forma e ícone, como está em produção.
- **B — 2.5D leve** (`profundidade.js`): por nó, uma face lateral e inferior. É o mesmo contorno, deslocado 5 px, atrás da forma, em 55% do tom do preenchimento. Sem projeção isométrica e sem mudar o layout.

Como reproduzir (depois de `go run .` em `aggregator/`):

```bash
cd web && npx playwright test -c ../spikes/icones-25d/playwright.config.js
```

O comando grava `resultados.json` e as capturas em `capturas/`, a 2× de densidade.

## Medidas

| Medida | A | B |
| --- | --- | --- |
| Bytes gzip a mais em produção | 0 | **+162 B** (a função em `diagram.js` e uma regra CSS) |
| Contraste (axe, `color-contrast`), desktop e 360 px | 0 violação | 0 violação |
| Rótulos dentro do `viewBox`, desktop e 360 px | todos | todos |
| Faces dentro do `viewBox` | — | todas (a margem do `fitViewBox` absorve os 5 px) |
| Pontas de seta que chegam pela direita ou por baixo de um nó | visíveis | **cobertas pela face, parcial ou totalmente** |

O site tem **um** tema (auditoria §1). "Os dois temas" vira "o tema do site".

## O que as capturas mostram

| Diagrama | Desktop | 360 px |
| --- | --- | --- |
| `ae-wt-saga` | [A](capturas/ae-wt-saga-1280-A.png) · [B](capturas/ae-wt-saga-1280-B.png) | [A](capturas/ae-wt-saga-360-A.png) · [B](capturas/ae-wt-saga-360-B.png) |
| `k8s-wt-cluster` | [A](capturas/k8s-wt-cluster-1280-A.png) · [B](capturas/k8s-wt-cluster-1280-B.png) | [A](capturas/k8s-wt-cluster-360-A.png) · [B](capturas/k8s-wt-cluster-360-B.png) |
| `sd-wt-falha` | [A](capturas/sd-wt-falha-1280-A.png) · [B](capturas/sd-wt-falha-1280-B.png) | [A](capturas/sd-wt-falha-360-A.png) · [B](capturas/sd-wt-falha-360-B.png) |

1. **B esconde pontas de seta.** As arestas são desenhadas antes dos nós. Uma seta que chega à borda direita ou inferior termina **dentro** da face, que cobre 5 dos cerca de 9 px da ponta.
   - Em `ae-wt-saga`, a ponta some ou vira um toco em "decidir" (`orq → risco`, por baixo), "reserva / libera" (`ledger → orq`, pela direita) e "prazo vencido" (`timer → orq`).
   - Em `sd-wt-falha`, "terminal" (`ledger → gw`, por baixo) vira um toco.
   - Em `k8s-wt-cluster`, as pontas ficam menores, mas ainda se leem.
   - Corrigir exigiria recuar a ponta 5 px nesses lados, o que **muda as âncoras das arestas**, e a §3.3 do plano proíbe isso.
   - Desenhar a face por cima das arestas também não resolve: a face continuaria cobrindo a ponta.
   - A direção da seta é informação, e a forma da face é só decoração.
2. **A profundidade quase não aparece no tema escuro.** A face é mais escura que o nó, mas o fundo da figura também é escuro. O ganho de leitura é pequeno, e em 360 px some.
3. **O resto empata.** Nenhum rótulo sai do `viewBox`, o contraste dos rótulos não muda e o custo é baixo (162 B).

## Recomendação

**Ficar com a A.** A B custa pouco em bytes, mas esconde a direção de setas, que é informação. Para
consertar, seria preciso mexer nas âncoras, que o plano preserva, e o ganho visual no tema escuro é
pequeno. Se o Julio quiser a B mesmo assim, o caminho seria um PR próprio: a face só em nós sem
aresta chegando pela direita ou por baixo, ou o recuo das pontas nesses lados, com os testes de
legibilidade refeitos.
