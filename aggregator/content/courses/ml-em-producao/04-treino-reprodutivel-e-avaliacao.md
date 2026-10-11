---
id: treino-e-avaliacao
title: "Treino reprodutível e avaliação"
summary: "Um modelo que não se reproduz não se audita, não se corrige e não se promove com segurança."
estimatedMinutes: 60
references:
  - title: "MLflow — documentation"
    url: https://mlflow.org/docs/latest/
---

## O pipeline de treino é código, com três versões fixadas

Reproduzir um modelo exige fixar três coisas: a **versão do dado** (o hash do dataset do marco 02), a
**versão do código** (o commit do pipeline de treino) e as **seeds** de qualquer fonte de aleatoriedade
(inicialização, amostragem, ordem de embaralhamento). Sem as três fixadas e registradas juntas, "o que
gerou esse modelo" é uma pergunta sem resposta confiável.

## *Gradient boosting* como caixa-preta útil

Esta trilha não ensina a matemática de *gradient boosting* — trata o algoritmo como uma caixa-preta cujo
comportamento externo (como reage a mudanças de dado, como se comporta em casos-limite) é o que importa
para operar o sistema em volta dele. Entender a árvore de decisão por dentro é opcional; entender como
testar o comportamento do modelo de fora não é.

## Avaliação: ranking, calibração, *lift*, custo esperado

Métricas de ranking (AUC, precisão no topo-k) dizem se o modelo ordena bem os candidatos; **calibração**
diz se a probabilidade que o modelo produz corresponde à frequência real (um modelo que diz "70% de chance"
deveria acertar perto de 70% das vezes, em um grupo grande de previsões com esse valor); ***lift*** mede o
ganho sobre uma seleção aleatória; **custo esperado** aplica a matriz de custo do marco 01 sobre as
previsões para estimar o resultado em reais, não só em métrica abstrata.

## Validação temporal e a margem mínima sobre o baseline

A validação usa o split temporal do marco 02 — nunca uma validação cruzada aleatória, pelo mesmo motivo que
o split de treino já não podia ser aleatório. Um modelo só se torna **candidato** à promoção se superar o
baseline por uma **margem mínima declarada** (não qualquer melhora, mesmo que estatisticamente real) e com
erro de calibração abaixo de um limite — as duas condições, não uma ou outra.

## Rastreio de experimentos, e o *model card*

Cada execução de treino registra hiperparâmetros, métricas, hash do dado e do código — o **rastreio** que
permite comparar tentativas e responder "por que esse modelo e não aquele outro". O ***model card***
documenta, em linguagem simples, o que o modelo faz, com que dado foi treinado, suas limitações conhecidas
e seu desempenho por segmento relevante — um documento para quem vai operar e auditar o modelo, não só para
quem o treinou.

## Testes de modelo: invariância, limites, casos-borda

Além da métrica agregada, o modelo precisa de testes de comportamento: invariância (mudar um atributo que
não deveria importar não deveria mudar a decisão), monotonicidade onde faz sentido de negócio (aumentar a
renda não deveria, em geral, piorar a avaliação de uma oferta de crédito) e comportamento sensato em
casos-borda (entrada com todos os valores ausentes, por exemplo). Um modelo que passa na métrica agregada e
falha nesses testes não deveria ser promovido.

## Não otimizar hiperparâmetro em demasia

Buscar o último ponto percentual de métrica ajustando hiperparâmetros tem retorno decrescente e risco de
*overfitting* na própria validação (se a busca for repetida demais sobre o mesmo split). O ganho raramente
justifica o esforço, e quase nunca justifica abrir mão da margem de segurança sobre o baseline por um ganho
marginal que pode não se sustentar fora da amostra de validação.

## Exemplo numa fintech

Um modelo tem AUC 0,01 acima do baseline — uma melhora real, mensurável, estatisticamente significativa —
mas exige uma feature cara de calcular em tempo real e um pipeline de treino mais complexo para manter. O
ganho de receita estimado pela matriz de custo é menor que o custo adicional de operação. A margem mínima
declarada existe exatamente para recusar esse tipo de promoção antes que ela aconteça.

## Hands-on

**Tutorial.** Construa o pipeline de treino com rastreio de experimentos (hiperparâmetros, métricas, hash
do dado e do código).

**Desafio.** Implemente o gate "supera o baseline" como parte do pipeline, não como revisão manual.

**Invariantes testáveis**

1. Mesmo dado, mesma seed, mesmo código → **mesmas métricas**, com igualdade exata na máquina de
   referência.
2. O modelo só é marcado "candidato" se superar o baseline por margem declarada em validação **temporal**
   e com erro de calibração abaixo do limite — as duas condições, testadas juntas.
3. O rastreio de cada execução registra o hash do dado e do código usados — consultável depois, não só no
   momento do treino.
4. Um teste de comportamento falha deliberadamente se o modelo piora a avaliação de uma oferta ao aumentar
   a renda simulada (monotonicidade onde faz sentido de negócio).

**Complemento.** Compare o ganho de métrica do modelo candidato com o custo operacional estimado de
mantê-lo em produção.

**Checagem**

1. Quais três elementos precisam estar fixados e registrados juntos para reproduzir um treino?
2. O que calibração mede, e por que é diferente de uma métrica de ranking como AUC?
3. Por que a validação usa split temporal, e não validação cruzada aleatória?
4. Por que um modelo com melhora real de métrica pode, ainda assim, não valer a pena promover?

> **Reencontro — `engenharia-de-dados/06` (trilha planejada); `spring-boot/11`; `observabilidade/04`.**
> A disciplina de testes de dados que quebram o build, de `engenharia-de-dados/06`, é a mesma que esta
> trilha aplica ao próprio modelo — um teste que falha antes da promoção, não depois. `spring-boot/11`
> trata testes de integração que provam comportamento real, não só cobertura; os testes de invariância e
> monotonicidade aqui seguem o mesmo espírito. E os modelos de dado e estatística de `observabilidade/04`
> fundamentam a leitura correta de métricas de calibração e ranking.

## Principais aprendizados

- Reprodutibilidade exige fixar e registrar juntos: versão do dado, versão do código e seeds — sem os
  três, "o que gerou esse modelo" não tem resposta confiável.
- Calibração, ranking, *lift* e custo esperado medem coisas diferentes; nenhum substitui os outros.
- A validação usa split temporal, nunca aleatório, pelo mesmo motivo que o dataset de treino.
- Promoção exige superar o baseline por margem declarada **e** calibração dentro do limite — as duas
  condições juntas, não qualquer melhora isolada.
- Testes de comportamento (invariância, monotonicidade, casos-borda) pegam problemas que a métrica agregada
  sozinha não pega.
