---
id: arredondamento-rateio-e-juros
title: "Arredondamento, rateio e juros"
summary: "O erro mais caro de um ledger costuma valer um centavo — multiplicado por milhões de operações e por um auditor."
estimatedMinutes: 60
references:
  - title: "Accounting for Computer Scientists (Martin Kleppmann)"
    url: https://martin.kleppmann.com/2011/03/07/accounting-for-computer-scientists.html
---

## Arredondamento: para cima, para baixo, para o par

Existem várias convenções de arredondamento — **para cima**, **para baixo**, e **half-even**
(arredondar para o número par mais próximo quando o valor está exatamente na metade, o que evita
um viés sistemático que "para cima" ou "para baixo" introduziriam ao longo de milhões de
operações). A escolha da convenção é uma decisão explícita e documentada, nunca um acidente do
comportamento padrão de uma biblioteca.

## Onde arredondar: sempre no último passo

A regra mais importante deste marco: **arredondar sempre no último passo** de um cálculo, nunca em
etapas intermediárias. Arredondar um valor intermediário e depois continuar calculando sobre o
valor já arredondado acumula erro de uma forma que arredondar só no resultado final evita — a
mesma operação, com arredondamentos intermediários desnecessários, pode produzir um resultado
diferente (e menos correto) do que a mesma operação calculada em precisão total até o fim.

## Rateio sem perder centavo: o algoritmo do maior resto

Dividir R$ 100,00 em três partes iguais produz 33,33 + 33,33 + 33,33 = 99,99 — um centavo
desaparece. O **rateio por maior resto** resolve isso: calcula a divisão inteira, distribui o
resto (os centavos que faltam) para as partes que tiveram o maior resto fracionário descartado,
e garante que a soma das partes seja **exatamente** igual ao total original, sempre. Esse mesmo
algoritmo resolve tarifas divididas entre participantes, parcelas de uma venda, e qualquer outro
cenário de "dividir um total inteiro em N partes sem perder nem criar valor".

## Juros simples e compostos, e a base de dias

**Juros simples** aplicam a taxa sobre o principal original em cada período; **juros compostos**
aplicam sobre o saldo já acrescido de juros anteriores. Calcular juros sobre um número de dias
exige uma **base de dias** — convenções como 252 (dias úteis, comum em mercado financeiro
brasileiro), 360 ou 365 dias por ano produzem resultados ligeiramente diferentes para o mesmo
período de calendário, e qual convenção usar é, estritamente, **conferir** com a área de produto
ou contabilidade — nunca assumida de memória.

## *Accrual*: o acúmulo diário como lançamento periódico

Em vez de calcular juros só no vencimento final, um sistema de **accrual** lança, periodicamente
(diariamente, por exemplo), o juro proporcional já "ganho" ou "devido" até aquele ponto — essa
prática torna o saldo contábil, em qualquer dia, já refletindo o valor econômico real acumulado,
em vez de "pular" o valor inteiro de juros de uma vez só no vencimento.

## Tarifas e tributos como parâmetro

Tarifas (uma taxa fixa ou percentual sobre uma operação) e tributos (que variam por jurisdição, por
tipo de operação, e mudam com frequência de regulação) são tratados, nesta trilha, como
**parâmetros configuráveis e marcados "conferir"** — a trilha ensina o **mecanismo** de aplicar
uma tarifa ou um tributo parametrizado corretamente (sem perder centavo, aplicado no momento
certo), nunca a interpretação tributária ou regulatória específica de nenhuma jurisdição.

## Precisão: inteiro, decimal exato, e taxas com mais casas

Um valor monetário final é inteiro na menor unidade ou decimal exato com duas casas — mas uma
**taxa** (de juros, de câmbio) frequentemente precisa de **mais casas decimais** do que o valor
monetário final para evitar erro de arredondamento acumulado ao multiplicar por um principal
grande. Misturar a precisão do valor final com a precisão da taxa usada para calculá-lo é uma fonte
comum de discrepância pequena, mas real, entre sistemas que deveriam produzir o mesmo resultado.

## Overflow: detectar, nunca silenciar

Operações aritméticas sobre inteiros têm limites de representação — um overflow silencioso
(quando o resultado de uma multiplicação ou soma excede o que o tipo numérico consegue representar
e "dá a volta" sem erro) é um dos bugs mais perigosos possíveis num ledger, porque produz um
número plausível, mas completamente errado, sem nenhum sinal de que algo deu errado. Detectar e
rejeitar explicitamente um overflow é sempre preferível a um resultado numérico silenciosamente
incorreto.

## Reprodutibilidade entre Go e Java

A mesma tabela de casos de teste (mesmos valores de entrada, mesma convenção de arredondamento e
de base de dias) deveria produzir **exatamente o mesmo resultado** em Go (inteiro na menor
unidade) e em Java (`BigDecimal`) — essa paridade entre implementações é o que prova que a lógica
de negócio (não a linguagem) é o que determina o resultado, e que as duas abordagens de
representação de dinheiro são, de fato, equivalentes quando implementadas corretamente.

## Exemplo numa fintech

Dividir R$ 100,00 em três parcelas iguais produziria 33,33 + 33,33 + 33,33 = R$ 99,99 — um
centavo perdido. O rateio por maior resto entrega 33,34 + 33,33 + 33,33 = R$ 100,00 exatos,
atribuindo o centavo extra à parcela que teria o maior resto fracionário descartado no cálculo
ingênuo.

## Hands-on

**Tutorial.** Implemente o rateio por maior resto e o acúmulo diário de juros.

**Desafio.** Construa uma tabela de casos de referência (valores esperados calculados à mão) e o
teste de propriedade correspondente.

**Invariantes testáveis**

1. Para **qualquer** total e número de partes, **Σ das partes = total** — propriedade verificada
   com semente fixa sobre uma ampla variedade de valores e divisões.
2. O rateio é **determinístico**: a mesma entrada, na mesma ordem, sempre produz a mesma
   distribuição dos centavos extras.
3. O acúmulo de juros reproduz a **tabela de casos** de referência, incluindo os casos de borda
   (ano bissexto, fim de semana), com a base de dias configurada.
4. `half-even` e `half-up` produzem resultados **diferentes exatamente** nos casos de valor na
   metade exata — a tabela de casos lista esses pontos de divergência especificamente.
5. A mesma tabela de casos produz **o mesmo resultado em Go e em Java** — um teste de paridade
   entre as duas implementações.
6. Um overflow aritmético é **detectado e rejeitado** explicitamente, nunca silenciado — testado
   com valores próximos ao limite de representação do tipo.

**Complemento.** Meça, com uma simulação simples, quantos centavos "somem" numa carga de um
milhão de rateios feitos de forma ingênua (sem rateio por maior resto), comparado ao resultado
correto.

**Checagem**

1. Por que arredondar sempre no último passo de um cálculo é preferível a arredondar em etapas
   intermediárias?
2. Como o rateio por maior resto garante que a soma das partes seja exatamente igual ao total
   original?
3. Por que a base de dias usada para calcular juros precisa ser tratada como parâmetro
   "conferir", em vez de assumida de memória?
4. Por que um overflow aritmético silencioso é mais perigoso do que um erro explícito?

> **Reencontro — `engenharia-de-dados/04`.** A modelagem para análise daquele marco é o que
> permite que os valores de juros acumulados diariamente por este marco sejam consumidos de forma
> consistente por relatórios e painéis analíticos, sem recalcular a lógica de negócio em cada
> consumidor.

O tipo `Money` já introduzido em `go-fintech/02` é a base sobre a qual o rateio e o cálculo de
juros deste marco operam, e a escolha de armazenamento para históricos de taxas e de cálculos de
juros se conecta diretamente às considerações de modelagem de dados já vistas em
`dados-distribuidos/06`. A disciplina de transformar um requisito de negócio em números concretos
de `system-design/02` se aplica igualmente a decidir, com precisão, quantas casas decimais uma
taxa realmente precisa.

## Principais aprendizados

- Arredondar sempre no último passo evita acúmulo de erro que arredondamentos intermediários
  introduziriam.
- O rateio por maior resto garante que a soma das partes seja exatamente igual ao total original,
  sem perder nem criar centavo.
- A base de dias para cálculo de juros é um parâmetro que precisa ser conferido, nunca assumido de
  memória.
- Taxas frequentemente precisam de mais casas decimais do que o valor monetário final que elas
  ajudam a calcular.
- Um overflow aritmético silencioso é mais perigoso que um erro explícito — ele produz um número
  plausível, mas completamente errado.
