# Projeto guia — fin-offers

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você constrói
> enquanto lê a trilha. O `fin-offers` é o **motor de ofertas** da instituição receptora: decide qual
> oferta apresentar, registra a decisão, aprende com o resultado e respeita o consentimento até o fim.

## O que você vai construir

Sete partes: `sim-clientes/` (gerador com verdade-base), `features/` (definições e registro), `treino/`
(pipeline reprodutível), `registry/` (modelos e gates), `servico-ofertas/` (decisão com *policy gate*,
fallback e log), `experimentacao/` (atribuição, controle, análise) e `monitoramento/` (drift, qualidade,
alertas).

**Contratos com os vizinhos** (todos simuláveis):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | tabelas ouro, `dado_utilizavel` e política de consentimento/finalidade | `fin-insight`, trilha engenharia-de-dados (planejada) |
| consome | elegibilidade e limite (resposta de política/risco, **fora de escopo**) | stub de motor de risco |
| serve | `GET /ofertas?cliente=...` → oferta, braço do experimento, *reason codes*, `decisionId` | canais (app/`pix-gateway`) |
| emite | log de decisão (entradas, versão do modelo, features, política, resultado) | auditoria / `fin-insight` |
| emite | métricas de drift, qualidade e exposição; regras de alerta | trilha observabilidade |
| consome | resultado da oferta (clique, contratação, maturação do rótulo) | canais |

**O que este projeto não é.** Não é motor de risco de crédito, não usa dado real, não treina modelo de
linguagem. O `sim-clientes` substitui qualquer base real.

## Pré-requisitos

- Python 3.11+, scikit-learn, LightGBM, MLflow, DuckDB; Docker; `promtool`
- Opcional: ONNX Runtime (Java) para o complemento do marco 06 — **sujeito à Fase 0** (suporte e licença
  ainda não verificados)
- **Não precisa:** GPU, nuvem paga, plataforma de ML gerenciada. Confirmar versões/licenças antes de fixar
  a versão usada.
- Se a trilha `engenharia-de-dados` ainda não estiver publicada, o `sim-clientes` gera as tabelas
  necessárias sozinho — a trilha funciona de forma independente, com os links marcados "(trilha
  planejada)" até a publicação.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Baseline por regras + *harness* de avaliação offline + *policy gate* | Mesma seed → mesma métrica; oferta fora da finalidade nunca é candidata |
| 02 | Dataset de treino *point-in-time* versionado | Nenhuma feature posterior à decisão; hash reproduzível; split temporal sem sobreposição |
| 03 | Registro de features com dono, frescor e consentimento | Feature offline = online; feature de consentimento revogado devolve ausente em ≤ SLA |
| 04 | Pipeline de treino reprodutível + *model card* | Mesmo dado/seed/código → mesmas métricas; promoção só se supera o baseline |
| 05 | Registry + gates + *shadow* + rollback | Assinatura incompatível rejeitada; rollback restaura a decisão anterior; shadow não altera resposta |
| 06 | Serviço de ofertas com fallback e log de decisão | Com feature store fora, responde dentro do orçamento; *replay* reproduz a decisão |
| 07 | Monitoramento de drift e qualidade + alertas | Drift injetado dispara; estável não; `promtool test rules` verde |
| 08 | Experimentação com controle, exploração e análise | Efeito estimado dentro do IC; SRM detecta atribuição quebrada; cap de frequência respeitado |
| 09 | *Reason codes*, auditoria de justiça, fluxo de revisão | Códigos reproduzíveis; feature proibida/proxy barrada; modelo enviesado reprova o gate |
| 10 | Linhagem de treino + expiração por revogação + ADRs | Consulta "quais modelos usaram o consentimento X" correta; modelo expirado é bloqueado |

### Definição de pronto (capstone)

- [ ] Toda decisão é registrada e **reproduzível** (mesmas entradas + versão do modelo → mesma saída)
- [ ] Nenhuma feature de treino usa informação posterior ao instante da decisão (teste por construção)
- [ ] Cada feature tem **um único caminho** de cálculo; paridade offline/online provada
- [ ] Todo candidato passa pelo *policy gate* (consentimento, finalidade, elegibilidade, frequência) antes
      do modelo
- [ ] Nenhum modelo é promovido sem superar o baseline em validação temporal, com calibração dentro do
      limite
- [ ] Existe *rollback* testado e *shadow* que não altera a resposta
- [ ] Drift e queda de qualidade têm alerta testado com `promtool`
- [ ] Existe grupo de controle/exploração e **a probabilidade da ação é registrada** para avaliação
      contrafactual
- [ ] Há limite de frequência de ofertas por cliente, aplicado e testado
- [ ] Toda oferta tem *reason codes*; atributos proibidos e *proxies* são barrados; disparidade é medida
- [ ] A revogação de consentimento propaga até features, conjuntos de treino e **expiração/retreino de
      modelos**, com política declarada
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Vazamento plantado:** uma feature com informação futura entra no treino. Qual teste a pega? Em
   quanto tempo?
2. **Feature store fora do ar** no pico: o serviço responde? Dentro do orçamento? Com que qualidade?
3. **Drift súbito** (a distribuição de renda muda). Quem é avisado e o que o serviço faz?
4. **Rollback** de um modelo promovido há 2h: a decisão volta a ser a anterior?
5. **Revogação em massa** (20% dos consentimentos): o que acontece com features, datasets e o modelo em
   produção?
6. **Atribuição quebrada** no experimento (proporção 70/30 em vez de 50/50): o SRM avisa?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 600 min de leitura viram ~20h porque o hands-on é montar uma
armadilha (vazamento, viés, drift) e provar que o teste a pega.
