---
id: alem-do-credito-liquidez-mercado-e-operacional
title: "Além do crédito: liquidez, mercado e operacional"
summary: "O banco que concede crédito precisa de dinheiro nas datas certas — e perder dinheiro por descasamento, por taxa ou por falha de processo não é menos real que perder por inadimplência."
estimatedMinutes: 50
---

## Uma taxonomia em nível de engenheiro

Até aqui a trilha tratou do **risco de crédito**: o cliente não pagar. Mas a mesma carteira carrega
outros riscos, e um engenheiro que constrói o produto precisa reconhecê-los, mesmo sem ser
especialista em cada um: **liquidez** (ter dinheiro na data), **mercado** (a taxa de juros mudar
contra você), **operacional** (um processo, um sistema ou uma pessoa falhar), **modelo** (usar um
modelo que já não descreve a realidade) e **conformidade** (descumprir uma regra). Este marco é uma
visão geral: cada tema tem especialistas e regulação própria (**conferir** o regime aplicável à sua
instituição).

## Liquidez: a escada de vencimentos

A instituição empresta por 24 meses com dinheiro que capta por prazos diferentes. A **escada de
vencimentos** coloca, mês a mês, o que **entra** (as parcelas dos cronogramas) contra o que **sai**
(a captação que vence). A diferença acumulada, somada à reserva, é a **cobertura**: enquanto for
positiva, há dinheiro para honrar o que vence. O **descasamento** entre os prazos é o que a escada
torna visível — e a escada precisa somar **exatamente** os fluxos dos cronogramas, ou ela mente.

Dois efeitos mexem na escada: **atraso** (a parcela não entra quando devia) e **pré-pagamento** (o
cliente quita antes, e a entrada vem antes, mas as dos meses seguintes somem). Um teste de
**estresse** aplica esses efeitos e mostra em que mês a cobertura vira negativa. A liquidez da
**liquidação** de pagamentos é outro problema, tratado em `pagamentos-e-liquidacao/07`; aqui é a
liquidez da **carteira**.

```diagrama
cr-escada
```

## Mercado: taxa de juros e repactuação

Uma carteira de contratos **prefixados**, financiada por captação **pós-fixada**, ganha quando os
juros caem e perde quando sobem: o custo do dinheiro muda, a receita não. Esse **descasamento pré ×
pós** é risco de mercado. Os conceitos de **repactuação** (quando a taxa de cada lado pode mudar) e
de **duração** (a sensibilidade do valor à taxa) entram aqui só em nível de leitura: o que o
engenheiro precisa é que os cronogramas exponham as datas e os indexadores de cada fluxo, para que a
área de risco consiga medir.

## Operacional: falhas que custam dinheiro

**Risco operacional** é perder dinheiro por falha de processo, sistema, pessoa ou evento externo: o
motor de decisão fora do ar por três horas numa segunda de pico, uma cobrança em massa com valor
errado, uma fraude que passou pela originação. Um **evento de perda** tem impacto financeiro
calculável (propostas perdidas × margem esperada, reembolsos, multas), e os **KRIs** (*key risk
indicators*) são os sinais que antecipam esses eventos: taxa de decisões degradadas, *backlog* de
fila manual, mensagens fora da janela.

## Modelo, conformidade e apetite

O **risco de modelo** é o do marco 06 visto pela área de risco: usar um modelo descalibrado ou fora
da população para a qual foi feito. O **risco de conformidade** é o de descumprir uma regra — e a
trilha inteira trata regra como parâmetro com fonte a conferir para reduzi-lo. Todos esses riscos se
encontram no **apetite a risco** (marco 11): os limites que a instituição aceita e quem escala
quando um deles estoura. **Capital** é o colchão que absorve a perda inesperada; aqui, só como
conceito.

## Exemplo numa fintech

Os 50 mil contratos sintéticos do `fin-lend` geram R$ 42 milhões de entradas por mês; a captação
que vence varia de R$ 38 milhões a R$ 46 milhões, e a reserva inicial é de R$ 6 milhões. No cenário
base, a cobertura acumulada nunca fica negativa. No estresse — um pico de atraso que reduz as
entradas em 5% —, ela cai mês a mês e **vira negativa no mês 8**, quando os vencimentos maiores da
captação chegam. A escada não diz o que fazer; diz **quando** o problema chega, com meses de
antecedência.

## Hands-on

**Tutorial.** Implemente `alm/`, que gera a escada de vencimentos a partir dos cronogramas da
carteira sintética e de uma tabela de captação.

**Desafio.** Rode cenários de estresse (atraso e pré-pagamento) e leia em que mês a cobertura vira
negativa em cada um.

**Invariantes testáveis**

1. A escada soma **exatamente** os fluxos dos cronogramas (conservação).
2. **Mais atraso**, ou menos pré-pagamento quando ele antecipa entradas, **nunca melhora** a
   cobertura em nenhum mês (monotonicidade, conforme o sinal do cenário).
3. A escada é **determinística** por semente.
4. Um **evento operacional** sintético (motor fora do ar por X horas) produz o **impacto financeiro**
   esperado no gabarito: propostas perdidas × margem.
5. **Nenhum** relatório de risco usa dado de cliente identificado (teste de ausência).

**Complemento.** Liste os KRIs de risco operacional do seu produto de crédito e o limiar de cada
um.

**Checagem**

1. O que a escada de vencimentos mostra que o saldo total da carteira não mostra?
2. Por que o pré-pagamento pode piorar a liquidez nos meses seguintes?
3. O que é o descasamento pré × pós, e por que ele é risco de mercado?
4. Como se calcula o impacto de um evento operacional?

> **Reencontro — `pagamentos-e-liquidacao/07`.** A liquidez da liquidação — ter saldo na conta de
> reserva para o Pix das 18h — está lá; aqui é a liquidez da carteira, mês a mês.

O orçamento de erro de `observabilidade/12` é o molde para tratar um KRI como sinal com limiar e
dono; o desenho para disponibilidade de `system-design/13` é o que reduz o evento operacional mais
caro, o motor fora do ar; o arquivamento de `dados-distribuidos/12` sustenta o histórico que a
escada e os KRIs precisam; e a governança de `arquitetura-de-solucoes/06` define quem aceita um
risco fora do apetite.

## Principais aprendizados

- Crédito carrega também riscos de liquidez, mercado, operacional, modelo e conformidade.
- A escada de vencimentos mostra quando a cobertura vira negativa, e precisa somar exatamente os
  fluxos.
- Atraso e pré-pagamento mexem na escada; o estresse mostra o mês do problema.
- Descasamento pré × pós é risco de mercado; os cronogramas precisam expor datas e indexadores.
- Evento operacional tem impacto calculável, e os KRIs antecipam esses eventos.
