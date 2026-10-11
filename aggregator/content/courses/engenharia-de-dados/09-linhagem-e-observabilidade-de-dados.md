---
id: linhagem-e-observabilidade-de-dados
title: "Linhagem e observabilidade de dados"
summary: "\"De onde vem esse número?\" e \"por que o painel está vazio?\" devem ter resposta em minutos. Linhagem de coluna, SLO de dados, e análise de impacto antes de mudar algo."
estimatedMinutes: 55
references:
  - title: "OpenLineage"
    url: https://openlineage.io/
---

## Linhagem: de tabela, e de coluna

**Linhagem de tabela** responde "esta tabela veio de quais outras?" — suficiente para entender o
fluxo geral do pipeline. **Linhagem de coluna** responde a uma pergunta mais fina e mais útil na
prática: "esta coluna específica do ouro veio de quais colunas específicas do bruto, passando por
quais transformações?" — a granularidade que de fato importa quando alguém pergunta "de onde vem
esse número?" depois de um relatório de diretoria mostrar algo inesperado.

## Um padrão aberto, não uma reinvenção por projeto

Emitir eventos de linhagem num formato padronizado (OpenLineage é o tratado aqui) significa que
qualquer ferramenta compatível — um catálogo, um painel, uma consulta ad-hoc sobre os eventos —
consegue consumir essa informação sem que você precise construir um formato próprio e manter
integrações específicas para cada consumidor. O modelo central é **execução, tarefa, dataset**:
cada execução de uma tarefa declara quais *datasets* leu e quais escreveu, e o grafo de linhagem
emerge da composição dessas declarações ao longo do tempo — não precisa ser calculado por um
processo separado que inspeciona o SQL depois do fato.

## Observabilidade de dados: freshness, volume, schema, distribuição

**Freshness**: há quanto tempo o dado mais recente chegou — o mesmo conceito de
`dados-distribuidos/14`, aqui medido na fronteira com uma fonte externa que você não controla.
**Volume**: quantos registros chegaram num período, comparado ao histórico — uma queda ou um pico
abrupto é sinal de algo, mesmo antes de qualquer teste de qualidade formal apontar um problema
específico. **Schema**: mudanças de estrutura detectadas automaticamente. **Distribuição**: o
formato estatístico dos valores (média, percentis, proporção de nulos) muda de forma incomum —
muitas vezes o primeiro sinal de um problema que só seria pego por um teste de acurácia explícito
dias depois.

## SLO de dados, dono, e o *runbook* de incidente

Cada tabela crítica tem um **SLO de freshness** declarado (em até X horas depois da coleta, o dado
está disponível na prata) e um **dono** nomeado — sem os dois, "o painel está desatualizado" é uma
reclamação sem destinatário. Um **incidente de dados** (freshness violada, volume fora do
esperado, schema quebrado) precisa de um **runbook**: o passo a passo de diagnóstico e ação, escrito
**antes** do incidente acontecer, não inventado sob pressão às 3h da manhã.

## Análise de impacto antes de mudar uma coluna

Antes de renomear, remover ou mudar o tipo de uma coluna ouro, a pergunta que a linhagem responde
é "quem consome isso hoje?" — a lista de consumidores afetados, derivada do grafo de linhagem, não
de uma mensagem no chat perguntando "alguém usa essa coluna?". Fazer essa mudança sem essa análise
é o cenário clássico de uma coluna que muda de definição e três consumidores descobrem só quando o
painel deles já está mostrando o número errado.

> **Reencontro — `observabilidade/07`, `observabilidade/12`, `observabilidade/13` e
> `dados-distribuidos/14`.** Freshness, volume e schema como sinais observáveis são o mesmo
> vocabulário de SLI/SLO daquele bloco, aplicado a dado em vez de serviço. E a linhagem de coluna é
> o que `dados-distribuidos/14` já exigia ("toda coluna ouro tem origem rastreável") — aqui
> ensinado com a ferramenta que o implementa de fato, não só a exigência.

## Exemplo numa fintech

Uma coluna ouro `limite_disponivel` muda de definição (passa a descontar uma reserva que antes não
descontava) numa sexta-feira à tarde. Sem análise de impacto, três consumidores — o painel de risco,
um relatório regulatório e o pipeline de features de `ml-em-producao` — descobrem a mudança de
jeitos diferentes e em momentos diferentes ao longo da semana seguinte, cada um via um sintoma
diferente (um número que não bate, um modelo que degrada sem explicação aparente).

## Hands-on

**Tutorial.** Instrumente o pipeline para emitir eventos de linhagem (formato OpenLineage) a cada
execução.

**Desafio.** Construa um painel de freshness/volume/schema e uma regra de alerta testada.

**Invariantes testáveis**

1. Toda coluna da camada ouro tem **origem rastreável** até o bruto — verificado programaticamente
   sobre o grafo de linhagem emitido, não por inspeção manual de código.
2. A regra de alerta de freshness passa em teste automatizado de regras: **dispara** sob um atraso
   simulado e **não dispara** sob carga normal simulada.
3. Uma mudança simulada numa coluna ouro produz uma **lista correta** de consumidores afetados, a
   partir da análise de impacto sobre o grafo de linhagem.

**Complemento.** Estime o custo de armazenar a linhagem (volume de eventos por execução × número
de execuções por dia) para o pipeline completo da trilha.

**Checagem**

1. Qual é a diferença entre linhagem de tabela e linhagem de coluna, e por que a segunda responde
   melhor "de onde vem esse número?"
2. Por que emitir linhagem num formato aberto (OpenLineage) é preferível a um formato próprio do
   projeto?
3. O que um SLO de dados precisa ter, além do número, para não ser "o painel está desatualizado"
   sem destinatário?
4. Por que análise de impacto antes de mudar uma coluna evita o cenário de consumidores descobrindo
   a mudança pelo sintoma?

## Principais aprendizados

- Linhagem de coluna responde "de onde vem esse número" com a granularidade que de fato importa —
  linhagem de tabela sozinha não chega a esse nível de precisão.
- Um padrão aberto de eventos de linhagem (OpenLineage) evita reinventar formato e integração a
  cada ferramenta nova que precisa consumir essa informação.
- Freshness, volume, schema e distribuição são os quatro sinais de observabilidade de dados —
  frequentemente a distribuição muda antes de qualquer teste explícito de acurácia apontar o erro.
- SLO de dados sem dono nomeado é reclamação sem destinatário; o runbook de incidente precisa
  existir antes do incidente, não ser inventado sob pressão.
- Análise de impacto, derivada do grafo de linhagem, responde "quem consome isso hoje" antes de
  mudar uma coluna — a alternativa é consumidores descobrindo pelo sintoma, cada um em momento diferente.
