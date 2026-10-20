---
id: matematica-do-credito
title: "Matemática do crédito"
summary: "Dois sistemas que calculam a mesma parcela com arredondamentos diferentes divergem para sempre — a matemática do crédito é o que você prova primeiro e à mão."
estimatedMinutes: 70
references:
  - title: "Banco Central do Brasil — Normas e regulamentação"
    url: https://www.bcb.gov.br/estabilidadefinanceira/buscanormas
---

## Taxa nominal, taxa efetiva, e equivalência

A **taxa nominal** é a taxa declarada; a **taxa efetiva** é o que ela de fato representa quando
capitalizada no regime **composto**. Converter entre períodos diferentes (mensal para anual, e
vice-versa) é **equivalência de taxas** — uma operação que precisa ser **ida e volta**: converter
de mensal para anual e de volta para mensal deveria devolver, dentro de uma tolerância declarada, a
taxa mensal original. Confundir taxa nominal com efetiva, ou aplicar equivalência linear num
regime composto, é um erro clássico que produz um número plausível, mas errado.

## Tabela Price: parcela constante

Na **Tabela Price**, a parcela é **constante** ao longo de todo o contrato; o que varia, mês a
mês, é a composição entre juros (decrescente, porque incide sobre um saldo devedor que diminui) e
amortização (crescente). Para R$ 10.000,00 a 2,00% a.m. em 12 parcelas, a parcela é **R$ 945,60** —
os juros da primeira parcela são **R$ 200,00** (logo, amortização de R$ 745,60), os da segunda
**R$ 185,09**, e assim por diante, até a última parcela, que sai **R$ 945,55** (um ajuste de
poucos centavos para zerar o saldo exatamente). O total pago é **R$ 11.347,15**; os juros totais,
**R$ 1.347,15**.

## SAC: amortização constante

No **SAC** (Sistema de Amortização Constante), a **amortização** é constante; a parcela
**diminui** ao longo do tempo, porque os juros incidem sobre um saldo que cai na mesma proporção a
cada período. No mesmo exemplo (R$ 10.000,00, 2,00% a.m., 12 parcelas), a amortização constante é
**R$ 833,33**; a primeira parcela sai **R$ 1.033,33** (amortização mais os juros do saldo
integral); a última, **R$ 850,04** (amortização de R$ 833,37 — os R$ 833,33 mais os R$ 0,04 de
resíduo de arredondamento acumulados nas onze anteriores — mais R$ 16,67 de juros). Os juros
totais do SAC são **R$ 1.300,00** — menores que no Price, porque o saldo devedor cai mais rápido
no início.

## Carência e capitalização

**Carência** é um período inicial em que o cliente não paga parcela — mas os juros continuam
incidindo e, dependendo do desenho do produto, são **capitalizados** (incorporados ao saldo, que
cresce) ou simplesmente diferidos para o início efetivo do cronograma. Tratar carência como "tempo
de graça sem custo" é um erro de modelagem: salvo desenho explícito em contrário, o juro da
carência existe e precisa aparecer em algum lugar do cronograma.

## Pro rata e base de dias

Quando um período não corresponde exatamente a um mês completo, o cálculo **pro rata** ajusta o
juro proporcionalmente aos dias reais — e isso exige uma **base de dias** declarada (252, 360 ou
365 — **conferir** a convenção do produto específico, já que elas produzem resultados
ligeiramente diferentes para o mesmo intervalo de calendário). Essa é a mesma disciplina de base
de dias já introduzida, de forma geral, em `ledger-e-contabilidade/05` — aqui aplicada
especificamente ao cálculo de parcelas de crédito.

## Custo Efetivo Total (CET)

O **CET** é a taxa que iguala o valor **líquido** efetivamente recebido pelo cliente ao valor
presente de todas as parcelas — incorporando tarifas, seguros e tributos no cálculo, não só a taxa
de juros nominal (**conferir** a composição exata e a fórmula na norma vigente, que especifica o
que entra e o que não entra). No exemplo anterior, com uma tarifa de R$ 150,00 financiada à parte
(o cliente recebe líquido R$ 9.850,00, mas paga as parcelas calculadas sobre R$ 10.000,00), o CET
mensal sobe de 2,00% para aproximadamente **2,25%** (cerca de 30,6% a.a.) — a tarifa, embora pequena
em relação ao principal, desloca visivelmente o custo real da operação.

## IOF e amortização antecipada

O **IOF** é tratado, nesta trilha, como um parâmetro configurável que entra no cálculo do CET —
nunca uma interpretação tributária própria. **Amortização antecipada** de parcelas tem duas
variantes: **reduzir o prazo** (mantendo o valor da parcela, mas terminando o contrato mais cedo)
ou **reduzir a parcela** (mantendo o prazo original, mas com parcelas menores) — a escolha entre
as duas é tipicamente do cliente, não do sistema. **Liquidação antecipada** total tem direito a
**abatimento proporcional dos juros** futuros que não chegaram a incidir (**conferir** a regra
exata vigente).

## Arredondamento e o ajuste na última parcela

A mesma disciplina de arredondamento de `ledger-e-contabilidade/05` se aplica aqui: cada parcela é
calculada e arredondada, e qualquer resíduo de centavos acumulado ao longo do cronograma é
absorvido na **última parcela** — nunca distribuído de forma inconsistente entre parcelas
intermediárias, e nunca descartado silenciosamente.

## TIR e a precisão nunca em ponto flutuante

A **TIR** (taxa interna de retorno) de um fluxo de caixa é calculada por métodos numéricos
(bisseção ou Newton-Raphson), com uma **tolerância explícita** declarada para convergência — não
existe uma fórmula fechada simples para inverter o fluxo de parcelas numa taxa. E, como em todo o
restante desta trilha, nenhuma função que lida com **valor monetário** aceita ou devolve ponto
flutuante binário — apenas decimal de precisão fixa; `float` só é tolerado em cálculos puramente
estatísticos (risco, Bloco C), nunca em dinheiro.

## Exemplo numa fintech

R$ 10.000,00 a 2,00% a.m. em 12 parcelas pela Tabela Price: parcela **R$ 945,60**, juros totais
**R$ 1.347,15**. No SAC, amortização constante de **R$ 833,33**, juros totais **R$ 1.300,00**. Com
uma tarifa de R$ 150,00 financiada à parte, o CET mensal passa de 2,00% para aproximadamente
**2,25%**. *(Valores calculados e conferidos por script; reconfira contra o gabarito ao
implementar.)*

## Hands-on

**Tutorial.** Implemente `calc/` com Price e SAC, reproduzindo a tabela do exemplo em `casos/`.

**Desafio.** Implemente o CET com tarifa e IOF parametrizados, e a amortização antecipada de
parcelas.

**Invariantes testáveis**

1. As tabelas **à mão** de Price e SAC do exemplo são reproduzidas **ao centavo**.
2. **Σ amortizações = principal** e o **saldo final é zero**, para qualquer entrada válida —
   propriedade verificada com entradas geradas aleatoriamente.
3. No Price, a **parcela é constante** exceto a última (ajuste de poucos centavos); no SAC, a
   **amortização é constante** — verificado sobre o cronograma gerado.
4. **Prazo maior ⇒ parcela menor**, e **taxa maior ⇒ parcela maior** — monotonicidade verificada
   sobre pares de cronogramas que variam só um parâmetro por vez.
5. **CET ≥ taxa nominal** sempre que há custos adicionais (tarifa, seguro), e **CET = taxa
   nominal** quando não há nenhum custo adicional.
6. **Antecipar parcelas reduz os juros totais pagos**, e o saldo devedor nunca fica negativo em
   nenhum ponto do cronograma recalculado.
7. **Equivalência de taxas é ida e volta**: mensal → anual → mensal devolve a taxa original,
   dentro da tolerância declarada.
8. **Nenhuma função de `calc/` aceita ou devolve `float`** para valor monetário — verificado por
   teste de assinatura de API.

**Complemento.** Reproduza, em `calc/`, a simulação de um contrato de crédito público real que
você conheça (mantendo os dados específicos privados, só comparando o resultado).

**Checagem**

1. Por que a parcela é constante no Price, mas decrescente no SAC — e o que isso implica sobre o
   total de juros pago em cada um?
2. Por que o CET incorpora tarifas e seguros, enquanto a taxa nominal de juros não?
3. Por que equivalência de taxas precisa ser verificada como uma operação de ida e volta, não só
   numa direção?
4. Por que nenhuma função de cálculo monetário deveria aceitar ou devolver ponto flutuante
   binário?
5. No SAC do exemplo, por que a última parcela sai R$ 850,04 e não R$ 850,00 — e o que quebraria
   se o resíduo de R$ 0,04 fosse descartado?
6. Na amortização antecipada, o que muda no cronograma restante quando o cliente escolhe reduzir o
   prazo em vez de reduzir a parcela — e por que os juros totais caem nos dois casos?

> **Reencontro — `go-fintech/02`.** O tipo `Money` daquele marco é exatamente a base de
> representação decimal sem ponto flutuante que `calc/` usa para todo valor monetário neste
> marco — nenhuma função aqui inventa uma representação própria.

A concorrência de `go-fintech/03` é relevante quando múltiplos cronogramas são calculados em
paralelo sobre a carteira sintética; o custo e a escala de métricas de `observabilidade/16` se
aplicam quando a geração de cronogramas para 50 mil contratos precisa ser monitorada em produção;
e as anomalias de transação e isolamento de `dados-distribuidos/04` seguem relevantes sempre que o
cálculo de um cronograma precisa ser persistido de forma consistente, mesmo sob concorrência.

## Principais aprendizados

- Price mantém parcela constante com juros decrescentes; SAC mantém amortização constante com
  parcela decrescente — e o SAC paga menos juros totais no mesmo prazo e taxa.
- CET incorpora tarifas, seguros e tributos ao custo real da operação — é sempre maior ou igual à
  taxa nominal quando há custos adicionais.
- Equivalência de taxas precisa ser verificada ida e volta, dentro de uma tolerância declarada.
- Qualquer resíduo de arredondamento ao longo do cronograma é absorvido na última parcela, nunca
  descartado ou distribuído de forma inconsistente.
- Nenhuma função que lida com valor monetário usa ponto flutuante binário — só decimal de
  precisão fixa.
