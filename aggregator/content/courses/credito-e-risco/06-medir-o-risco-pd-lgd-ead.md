---
id: medir-o-risco-pd-lgd-ead
title: "Medir o risco: PD, LGD, EAD e a qualidade dos modelos"
summary: "Um modelo de risco não é bom ou ruim: ele discrimina, é estável e é calibrado até a próxima mudança de população — e só medindo você sabe quando isso acabou."
estimatedMinutes: 70
---

## PD, LGD, EAD e a perda esperada

Três números descrevem o risco de um contrato:

- **PD** (*probability of default*) — a probabilidade de o contrato entrar em **default** num
  horizonte declarado (12 meses, por exemplo).
- **LGD** (*loss given default*) — a fração da exposição que se perde **se** houver default,
  depois da recuperação (cobrança, garantia).
- **EAD** (*exposure at default*) — quanto estará exposto **no momento** do default: o saldo
  devedor e, num limite rotativo, a parte provável do limite ainda não usada (marco 07).

A **perda esperada** é o produto: **EL = PD × LGD × EAD**. Ela é **aditiva** entre contratos (a
perda esperada da carteira é a soma das perdas esperadas de cada contrato) e **linear** em cada
fator — dobrar a EAD dobra a perda esperada.

```diagrama
cr-perda-esperada
```

## O que é default, e a janela de maturação

**Default** não é uma opinião: é um critério declarado, tipicamente um número de **dias de atraso**
(**conferir** o critério que a sua política e a regulação aplicável usam). E só se sabe se um
contrato entrou em default depois de uma **janela de maturação**: um contrato originado no mês
passado ainda não teve tempo de inadimplir. Medir um modelo com contratos imaturos subestima a
inadimplência — o mesmo cuidado com o rótulo atrasado de `ml-em-producao/02`.

## O *scorecard*, em nível de leitura

Esta trilha **não treina** modelo (`ml-em-producao` é o dono); ela usa um ***scorecard* fixo**
sintético e ensina a **lê-lo e medi-lo**. Um *scorecard* soma **pontos** por **faixa** de cada
variável (renda, tempo de relacionamento, comprometimento) e chega a um **score**; uma tabela
converte cada faixa de score numa **PD**. Saber ler essa conversão é o que permite perguntar se a
PD que o score promete ainda é a PD que acontece.

## Discriminação: AUC, KS e Gini

**Discriminar** é ordenar: o modelo dá score maior a quem paga do que a quem não paga? A **curva
ROC** e a **AUC** medem isso: a AUC é a probabilidade de que, sorteando um bom pagador e um mau
pagador, o bom tenha score maior. O **KS** é a maior distância entre as distribuições acumuladas
de score de bons e maus. O **Gini** é 2 × AUC − 1. Num conjunto de brinquedo, com maus de score 300
e 500 e bons de score 400, 600 e 700: dos 6 pares (mau, bom), 5 estão na ordem certa, então
**AUC = 5/6 ≈ 0,833**, **Gini ≈ 0,667**; e a maior distância entre as acumuladas é no corte de 500
(100% dos maus contra 33% dos bons), então **KS ≈ 0,667**.

Scores **aleatórios** dão AUC ≈ 0,5; um score **perfeito** dá AUC = 1.

## Estabilidade: PSI

O modelo foi construído sobre uma população; a população que chega hoje pode ser outra. O **PSI**
(*population stability index*) compara a distribuição de hoje com a de referência, faixa a faixa:
**PSI = Σ (atual − referência) × ln(atual / referência)**. Distribuições iguais dão PSI = 0, e ele
nunca é negativo. O PSI se mede na **população** inteira e em cada **variável**, e cada um tem um
limiar de alerta declarado (**conferir** os limiares da sua política).

```diagrama
cr-psi
```

## Calibração: a PD prometida acontece?

Um modelo pode **ordenar bem** e **errar o nível**: a faixa que promete PD de 5% tem, na verdade, 9%
de inadimplência. Isso é **calibração**, e se mede comparando, por faixa, a PD **prevista** com a
inadimplência **observada** — num ***backtest*** sobre safras já maduras. Um modelo com AUC alta e
calibração péssima serve para **ordenar** propostas, mas não para **precificar** nem para
**provisionar** (marco 09), porque esses dois usam o nível da PD, não só a ordem.

## Vintage, mudança de população e modelo × política

Medir por **safra** (*vintage*: o mês de originação) separa o efeito da idade do contrato do
efeito da população que entrou (marco 11). Quando a população muda — um canal novo, uma crise que
reduz a renda média —, o modelo continua devolvendo números, só que de uma população que ele não
conhece. E o modelo **não é** a política: o *cutoff* de aprovação depende de custo de captação,
apetite a risco e capacidade operacional, não só da PD. Um modelo melhor não muda o corte sozinho.

## Exemplo numa fintech

Um contrato com **PD de 4%**, **LGD de 45%** e **EAD de R$ 10.000** tem perda esperada de
**R$ 180,00** (0,04 × 0,45 × 10.000). Na carteira, a distribuição de score da referência era 30% /
40% / 30% nas faixas baixa, média e alta; a de hoje é 20% / 40% / 40%. O PSI é
(0,2 − 0,3) × ln(0,2/0,3) + 0 + (0,4 − 0,3) × ln(0,4/0,3) **≈ 0,069** — abaixo dos limiares
habituais de alerta. O número não diz "está tudo bem"; diz que a mudança, até aqui, não é grande
o bastante para disparar a revisão que a política prevê.

## Hands-on

**Tutorial.** Implemente `risco/` com KS, AUC, PSI e calibração por faixa sobre o *scorecard*
fixo e a carteira sintética.

**Desafio.** Injete na carteira sintética uma quebra de população (a renda média cai a partir de um
mês) e mostre que o alarme de PSI dispara **antes** de a inadimplência observada subir.

**Invariantes testáveis**

1. KS, AUC e PSI reproduzem a **tabela à mão** de um conjunto pequeno (o do texto e mais dois).
2. A AUC de scores **aleatórios** fica em 0,5 dentro da tolerância declarada, e a de um score
   **perfeito** é 1.
3. O PSI de duas distribuições **idênticas** é 0, e o PSI é **não negativo** para quaisquer
   distribuições (propriedade).
4. A perda esperada é **aditiva** entre contratos e **linear** em cada fator (propriedade).
5. A calibração por faixa fica dentro da tolerância na população de origem e **sai** dela na
   população deslocada.
6. O alarme de PSI dispara na quebra injetada **antes** do mês em que a inadimplência observada a
   confirma.
7. **Demonstração:** um modelo com AUC alta e calibração péssima — bom para ordenar, ruim para
   precificar — construído de propósito sobre o conjunto sintético.

**Complemento.** Descreva quais medidas de qualidade o modelo de risco da sua instituição reporta,
com que frequência, e quem lê.

**Checagem**

1. Por que a perda esperada de uma carteira é a soma das perdas dos contratos?
2. O que a janela de maturação protege na medição de um modelo?
3. Qual é a diferença entre discriminar e estar calibrado?
4. O que um PSI alto diz, e o que ele não diz?
5. Por que um modelo melhor não muda o *cutoff* de aprovação sozinho?
6. Por que medir por safra, e não pela carteira inteira de uma vez?

> **Reencontro — `ml-em-producao/07` e `/02`.** O monitoramento de drift e o rótulo com maturação
> estão lá, para qualquer modelo; aqui eles ganham o vocabulário de risco de crédito — PSI,
> calibração por faixa, janela de default.

A avaliação contra baseline de `ml-em-producao/04` é o que separa "o modelo ordena" de "o modelo é
melhor que a regra simples"; e o orçamento de erro de `observabilidade/12` é o molde para tratar o
limiar de PSI como um alarme com dono e ação, não como um número num painel.

## Principais aprendizados

- EL = PD × LGD × EAD, aditiva entre contratos e linear em cada fator.
- Default é um critério declarado, e só se mede depois da janela de maturação.
- AUC, KS e Gini medem discriminação; PSI mede estabilidade; o *backtest* por faixa mede
  calibração.
- Um modelo pode ordenar bem e errar o nível — e precificar e provisionar dependem do nível.
- Modelo não é política: o corte depende de custo, apetite e capacidade.
