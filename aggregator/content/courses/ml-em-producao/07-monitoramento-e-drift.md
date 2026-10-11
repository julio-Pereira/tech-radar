---
id: monitoramento-e-drift
title: "Monitoramento e drift"
summary: "Um modelo degrada em silêncio; o que se mede é o que o mundo permite medir hoje, enquanto o rótulo não chega."
estimatedMinutes: 55
references:
  - title: "Rules of Machine Learning (Google)"
    url: https://developers.google.com/machine-learning/guides/rules-of-ml
---

## Três tipos de *drift*

***Data drift***: a distribuição das features de entrada muda (a renda média dos candidatos sobe ou
desce). ***Concept drift***: a relação entre as features e o resultado muda (a mesma renda que antes
previa contratação agora não prevê mais). ***Label drift***: a distribuição do próprio rótulo muda (a taxa
de contratação geral sobe ou cai). Os três são detectáveis por sinais diferentes, e um modelo pode sofrer
de um sem sofrer dos outros.

## Medidas e limiares

**PSI** (*population stability index*) e **KS** (teste de Kolmogorov-Smirnov) são formas comuns de medir a
distância entre a distribuição de hoje e a distribuição de referência (do treino) para uma feature — cada
uma com um limiar declarado a partir do qual se considera que houve deslocamento relevante, não só ruído
normal de amostragem.

## Qualidade de entrada

Antes de perguntar se o modelo degradou, pergunte se a **entrada** está saudável: taxa de nulos, valores
fora de faixa esperada, taxa de ausência de feature (ligada ao TTL do marco 03) — um problema de qualidade
de entrada produz o mesmo sintoma final (decisões piores) que um drift real, mas tem causa e remédio
diferentes, e por isso precisa de um alerta **distinto**.

## Desempenho com rótulo atrasado

O rótulo real (contratação, inadimplência) leva tempo para maturar (marco 02) — monitorar desempenho "ao
vivo" com um rótulo que só existe meses depois exige usar **proxies** (sinais mais rápidos, mas
imperfeitos, correlacionados com o resultado final) ou olhar só para **coortes já maduras** (decisões
antigas o suficiente para já terem rótulo). Nenhuma das duas opções é tão boa quanto o rótulo real, e as
duas precisam ser declaradas como aproximações, não tratadas como a verdade.

## Taxa de *fallback*, e alerta sem fadiga

Uma taxa de *fallback* (marco 06) crescente é, por si só, um sinal de monitoramento — indica que o sistema
normal está falhando com frequência anormal. E toda regra de alerta precisa ser calibrada contra **fadiga**:
um limiar sensível demais gera alarme falso repetido até que a equipe pare de confiar nos alertas; um
limiar insensível demais deixa passar degradação real. O limiar certo é medido, não escolhido por
intuição.

## Gatilhos de retreino, e custo

Drift relevante, degradação de desempenho medida por proxy, ou simplesmente o tempo (um calendário de
retreino periódico) são os três gatilhos típicos de retreino. Retreinar tem custo (computação, validação,
todo o ciclo do marco 04 de novo) — retreinar com muita frequência desperdiça esse custo sem ganho
correspondente; retreinar raro demais deixa o modelo obsoleto por mais tempo que o necessário.

## Exemplo numa fintech

Uma mudança no mercado de trabalho (ilustrativa) desloca a renda média dos candidatos a oferta para baixo
em poucas semanas. O PSI da feature de renda cruza o limiar declarado antes que qualquer rótulo de
contratação ou inadimplência tenha maturado o suficiente para confirmar o impacto — o alerta de *data
drift* é, nesse caso, o primeiro sinal disponível, semanas antes do primeiro sinal de desempenho via
proxy.

## Hands-on

**Tutorial.** Implemente métricas de drift (PSI, KS) sobre janelas de dados do `sim-clientes`.

**Desafio.** Escreva as regras de alerta e teste-as formalmente.

**Invariantes testáveis**

1. Um **drift injetado** (deslocamento conhecido numa feature) faz o alerta correspondente disparar em até
   **N janelas** declaradas.
2. Sob dados estáveis (sem drift injetado), a taxa de **falso positivo** em 100 janelas simuladas fica
   **abaixo de um limite** declarado.
3. A regra de alerta passa em `promtool test rules` — testada formalmente, não só observada em um painel.
4. Um aumento na taxa de ausência de feature gera um alerta **distinto** do alerta de drift, mesmo que o
   sintoma final pareça parecido.

**Complemento.** Estime o custo de um falso alarme semanal (tempo da equipe investigando um alerta que não
correspondia a um problema real).

**Checagem**

1. Qual é a diferença entre *data drift*, *concept drift* e *label drift*?
2. Por que um problema de qualidade de entrada precisa de um alerta distinto do de drift, mesmo com
   sintoma parecido?
3. Por que monitorar desempenho com rótulo atrasado exige usar proxies ou coortes maduras?
4. Quais são os três gatilhos típicos de retreino, e por que retreinar com muita frequência tem custo sem
   ganho correspondente?

> **Reencontro — `observabilidade/07`, `/12`, `/13`; `engenharia-de-dados/08`, `/09` (trilha planejada).**
> PSI e KS como métricas com limiar testado reusam o mesmo vocabulário de SLI/SLO de `observabilidade/12`;
> a regra de alerta testada com `promtool` é a mesma disciplina de `observabilidade/13`, e as métricas em
> si (Prometheus) usam o ferramental de `observabilidade/07`. A distinção entre problema de qualidade de
> entrada e drift real retoma a suíte de qualidade de dados que `engenharia-de-dados/08` ensina, e a
> observabilidade de linhagem para achar a causa de um drift é o mesmo raciocínio de `/09`.

## Principais aprendizados

- *Data drift*, *concept drift* e *label drift* têm sinais distintos — um modelo pode sofrer de um sem
  sofrer dos outros.
- PSI e KS medem o deslocamento de distribuição de uma feature contra um limiar declarado, não contra
  intuição.
- Um problema de qualidade de entrada produz sintoma parecido com drift real, mas precisa de alerta
  distinto, porque a causa e o remédio são diferentes.
- Com rótulo atrasado, monitorar desempenho ao vivo exige proxies ou coortes maduras — nenhum dos dois é o
  rótulo real, e os dois precisam ser tratados como aproximação.
- Retreino tem três gatilhos típicos (drift, degradação por proxy, calendário) e um custo real — nem
  sempre mais frequente é melhor.
