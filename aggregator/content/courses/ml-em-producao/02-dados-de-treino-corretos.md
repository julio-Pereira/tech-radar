---
id: dados-de-treino-corretos
title: "Dados de treino corretos"
summary: "O erro mais caro de ML é um modelo que acerta porque viu o futuro. Vazamento, join point-in-time e split temporal."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Hidden Technical Debt in Machine Learning Systems (Sculley et al.)"
    url: https://papers.nips.cc/paper_files/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html
---

## O rótulo chega atrasado

Inadimplência leva meses para se confirmar; contratação de uma oferta pode levar semanas. O **rótulo**
(o que o modelo tenta prever) só existe depois de uma **janela de maturação** — e um dataset de treino só
pode incluir uma decisão depois que essa janela se fechou para ela. Decisões recentes demais simplesmente
não têm rótulo ainda; incluí-las como "negativo" antes da hora é um erro silencioso que infla a classe
errada.

## O instante da decisão, e o join *point-in-time*

Toda linha de treino representa uma decisão tomada num **instante** específico. Cada feature dessa linha
precisa refletir o valor que ela tinha *naquele instante* — não o valor atual, não o valor de ontem. Um
**join point-in-time** busca, para cada feature e cada linha, o valor "como era" no momento da decisão,
nunca um valor calculado depois. Isso é mais difícil do que parece: a maioria dos joins SQL simples junta
pelo valor mais recente disponível *hoje*, que já é veneno para uma linha de treino que representa uma
decisão do passado.

## Vazamento: alvo, temporal, de grupo, de pré-processamento

**Vazamento de alvo**: uma feature calculada a partir do próprio resultado que se quer prever (direta ou
indiretamente). **Vazamento temporal**: uma feature com informação só disponível depois do instante da
decisão — o caso mais comum e mais sutil, geralmente introduzido por um join que não respeitou o
point-in-time. **Vazamento de grupo**: linhas do mesmo cliente espalhadas entre treino e validação,
inflando a métrica porque o modelo "já viu" aquele cliente. **Vazamento de pré-processamento**: normalizar
ou calcular estatísticas (média, desvio) usando o conjunto de validação ou teste, não só o de treino.
Qualquer um dos quatro produz a mesma assinatura: métrica excelente no laboratório, resultado decepcionante
em produção.

## Split temporal, não aleatório

Separar treino e validação aleatoriamente mistura o futuro com o passado — uma linha de validação pode ter
uma data anterior a uma linha de treino, o que nunca aconteceria em produção (o modelo nunca treina com o
futuro para prever o passado). O **split temporal** corta por data: tudo antes de um ponto é treino, tudo
depois é validação — a única forma de simular honestamente a situação real de "o modelo só conhece o
passado quando decide".

## Reprodutibilidade do dataset

Toda versão de um dataset de treino precisa ser identificável por um **hash** (ou snapshot versionado) —
sem isso, "qual dado treinou esse modelo" é uma pergunta sem resposta confiável, e o marco 04 (treino
reprodutível) não tem como se sustentar. Duas execuções do mesmo pipeline sobre o mesmo recorte de dados
devem produzir o mesmo hash.

## Desbalanceamento e viés de seleção: o aperitivo do marco 08

A classe positiva (contratação, inadimplência) costuma ser rara, o que exige cuidado na avaliação (métricas
sensíveis a desbalanceamento, não acurácia simples). E todo dataset de treino desta trilha tem uma
limitação estrutural: ele só contém decisões que **já foram tomadas** — o que aconteceria com quem nunca
recebeu oferta alguma é, por definição, desconhecido a partir desses dados. Esse é o **viés de seleção**
que o marco 08 trata em profundidade; aqui basta reconhecer que ele existe desde a origem do dataset.

## Consentimento no instante da decisão

Uma linha de treino só é válida se o consentimento do titular **cobria a finalidade de oferta na data
daquela decisão** — não no instante em que o dataset está sendo construído. Um consentimento revogado
depois não invalida retroativamente uma decisão que foi legítima quando tomada, mas um consentimento que
*ainda não existia* ou que *não cobria aquela finalidade* no instante da decisão invalida a linha
imediatamente, antes de qualquer outro filtro.

## Exemplo numa fintech

A feature "dias desde a última inadimplência" é calculada **hoje**, com o dado mais recente disponível, e
aplicada a uma decisão de oferta tomada seis meses atrás. Se naquele momento o cliente ainda não tinha
ficado inadimplente, mas ficou depois, a feature "sabe" algo que a decisão real não podia saber — vazamento
temporal clássico, e o motivo exato pelo qual o join precisa ser point-in-time.

## Hands-on

**Tutorial.** Construa o dataset de treino point-in-time com DuckDB, a partir das tabelas do `sim-clientes`.

**Desafio.** O `sim-clientes` embute deliberadamente uma **armadilha de vazamento** (uma coluna calculada
depois do instante da decisão). Encontre-a e prove, com números, que ela infla a métrica.

**Invariantes testáveis**

1. Para **toda linha** do dataset de treino, o timestamp de cálculo de toda feature é **menor ou igual**
   ao instante da decisão — verificado por construção sobre o pipeline, não por amostragem.
2. O pipeline que inclui a coluna com vazamento produz uma métrica irrealista (AUC próximo de 1); o
   pipeline correto, sobre o mesmo recorte de dados, não — lado quebrado como demonstração, lado correto
   com asserção rígida de que a métrica cai dentro de uma faixa plausível.
3. O hash do dataset é **idêntico** em duas execuções do pipeline sobre o mesmo recorte temporal.
4. Treino e validação são separados **no tempo**, sem nenhuma linha de validação com data anterior a
   qualquer linha de treino.
5. Nenhuma linha do dataset tem um consentimento que não cobria a finalidade de oferta **na data da
   decisão** daquela linha — verificado exaustivamente contra o estado de consentimento simulado.

**Complemento.** Estime a perda de volume de dados causada pela janela de maturação (quantas decisões
recentes ficam de fora por não terem rótulo ainda).

**Checagem**

1. O que distingue um join point-in-time de um join SQL comum, e por que a diferença importa?
2. Dê um exemplo de cada um dos quatro tipos de vazamento descritos.
3. Por que um split aleatório, em vez de temporal, mistura passado e futuro de forma inválida?
4. Por que uma linha de treino cujo consentimento só passou a cobrir a finalidade depois da decisão precisa
   ser excluída?

> **Reencontro — `engenharia-de-dados/04`, `/06` e `/12` (trilha planejada); `dados-distribuidos/14`;
> `concorrencia-e-recursos/08`.** O join point-in-time retoma o modelo dimensional e os testes de dados
> que `engenharia-de-dados/04` e `/06` ensinam, aqui aplicados à construção de um dataset de treino. A
> separação OLTP/analítico de `dados-distribuidos/14` é o mesmo tipo de fronteira que isola o dataset de
> treino do sistema transacional. E a disciplina de "lado correto com asserção rígida, lado quebrado como
> demonstração, sob seed fixa" é exatamente a regra de teste de `concorrencia-e-recursos/08`.

## Principais aprendizados

- O rótulo tem uma janela de maturação; decisões recentes demais simplesmente não têm rótulo ainda, e
  tratá-las como negativo antes da hora é um erro silencioso.
- Um join point-in-time busca o valor da feature "como era" no instante da decisão — um join comum, pelo
  valor mais recente disponível hoje, já é vazamento.
- Vazamento tem quatro formas (alvo, temporal, de grupo, de pré-processamento) e a mesma assinatura:
  métrica ótima no laboratório, resultado ruim em produção.
- Split deve ser temporal, não aleatório — a única forma de simular honestamente que o modelo só conhece o
  passado quando decide.
- Uma linha de treino só é válida se o consentimento cobria a finalidade de oferta **na data da decisão**,
  não na data em que o dataset está sendo construído.
