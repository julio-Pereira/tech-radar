---
id: multimoeda-e-cambio
title: "Multimoeda e câmbio"
summary: "Uma conversão de moeda é dois lançamentos que balanceiam cada um em sua moeda — e a diferença entre as duas visões vai para uma conta de câmbio, não some."
estimatedMinutes: 55
references:
  - title: "ISO 4217 — Currency codes"
    url: https://www.iso.org/iso-4217-currency-codes.html
---

## Moeda como parte do valor

Um valor monetário num ledger multimoeda não é só um número — é um número **mais** um código de
moeda (ISO 4217), e cada moeda tem seu próprio número de **casas decimais** (a maioria tem duas,
mas algumas, como o iene japonês, têm zero). Tratar "valor" e "moeda" como dois campos
independentes, em vez de uma unidade inseparável, é a origem de boa parte dos bugs de multimoeda —
um valor sem moeda associada não tem significado completo.

## Contas por moeda

Cada conta, neste modelo, opera numa **moeda específica** — uma conta em BRL e uma conta em USD do
mesmo cliente são, estruturalmente, duas contas diferentes, não uma conta com um campo "moeda"
mutável. Representar assim torna a regra de balanceamento por moeda (abaixo) natural de implementar
e de verificar, em vez de uma exceção complicada à regra geral de balanceamento.

## A regra de ouro: balancear por moeda

A generalização multimoeda da partida dobrada: **cada moeda balanceia isoladamente** dentro de um
mesmo lançamento — a soma de débitos em BRL precisa igualar a soma de créditos em BRL, e
separadamente, a soma de débitos em USD precisa igualar a soma de créditos em USD, sem misturar as
duas moedas na mesma verificação. Um lançamento que converte moeda, portanto, nunca é "uma perna
em BRL, uma perna em USD que magicamente se igualam" — ele é dois sublançamentos, cada um
balanceado na sua própria moeda, conectados pela operação de conversão.

## Conversão: taxa, hora e *spread*

Toda conversão de moeda registra, junto com o valor, a **taxa** usada, a **hora** exata em que a
taxa foi aplicada, e a fonte da taxa. O **spread** (a diferença entre a taxa que a instituição paga
no mercado e a taxa que ela oferece ao cliente) é a margem da operação de câmbio — e, como qualquer
tarifa, é tratado como parâmetro configurável, nunca um valor embutido sem registro.

## Conta de posição e ganho ou perda cambial

Uma **conta de posição** (ou de câmbio) acumula a diferença entre o valor convertido pela taxa
aplicada e o valor que a mesma quantia representaria em outra taxa de referência — essa diferença
é o **ganho** ou **perda cambial**, e ela precisa, ela mesma, ser um lançamento contábil que
fecha exatamente a diferença, nunca um resto que simplesmente desaparece ou é ignorado.

## Reavaliação de saldos em moeda estrangeira

Quando a taxa de mercado muda, um saldo mantido em moeda estrangeira, expresso na moeda de
referência da instituição, também muda de valor — esse processo de **reavaliação** periódica
gera um lançamento de ganho ou perda cambial **não realizado** (a posição ainda não foi convertida
de fato, mas seu valor na moeda de referência já mudou). Reavaliar é uma prática distinta de
converter: reavaliação ajusta a visão contábil de um saldo existente; conversão move valor de uma
moeda para outra de fato.

## Fonte de taxa e seu atraso

A taxa de câmbio usada numa conversão vem de uma **fonte** específica (uma taxa de referência
oficial, um provedor de mercado) que tem sua própria frequência de atualização e, inevitavelmente,
algum **atraso** entre o momento real do mercado e o momento em que a taxa está disponível para
uso — **conferir** qual fonte e qual frequência são apropriadas para o contexto, já que isso
afeta diretamente quanto ganho ou perda cambial um atraso de taxa pode introduzir.

## Arredondamento na conversão

Toda conversão de moeda é também um cálculo sujeito às regras de arredondamento já detalhadas no
marco 05 — a conversão ida e volta (converter de BRL para USD e depois de volta para BRL), sem
variação de taxa entre as duas operações e sem considerar o spread, deveria devolver
aproximadamente o valor original, dentro de uma **tolerância declarada** que reflete exatamente o
arredondamento esperado em cada etapa da conversão.

## Exposição cambial

A **exposição cambial** — quanto valor a instituição mantém em moedas diferentes da sua moeda de
referência, e portanto quanto ela ganha ou perde com movimentos de taxa — é um número que o
negócio precisa monitorar continuamente, não algo descoberto só na reavaliação periódica. O
mesmo fluxo de uma compra internacional no cartão (onde a conversão acontece no momento da
transação, não de forma agendada) é uma instância concreta desse mesmo mecanismo multimoeda,
sem precisar reensinar a mecânica de autorização de cartão já tratada em outra trilha.

## Exemplo numa fintech

Um cliente converte USD 100 para BRL a uma taxa específica, registrada com hora e fonte; a
instituição aplica um spread, que é sua margem na operação. Dias depois, a taxa de mercado mudou —
a posição em USD que a instituição ainda mantém é reavaliada, gerando um ganho ou perda cambial não
realizado que é, ele mesmo, lançado como ajuste contábil.

## Hands-on

**Tutorial.** Implemente contas em duas moedas e a operação de conversão com taxa, hora e fonte
registradas.

**Desafio.** Implemente a reavaliação diária de uma posição cambial e o lançamento de ganho ou
perda correspondente.

**Invariantes testáveis**

1. **Cada moeda balanceia isoladamente** — Σ débitos = Σ créditos por moeda, verificado sobre
   qualquer sequência de operações que inclua conversões.
2. Toda conversão registra **taxa, hora e fonte**; uma conversão sem taxa registrada é **rejeitada**
   antes de qualquer outro processamento.
3. O ganho ou perda cambial de uma reavaliação **fecha exatamente** a diferença entre o valor
   reavaliado e o valor contábil anterior — conservação na moeda de referência.
4. Uma conversão de ida e volta, sem variação de taxa e sem spread, devolve o **valor original**
   dentro da tolerância de arredondamento declarada.
5. As **casas decimais** específicas de cada moeda (por exemplo, zero para JPY, duas para BRL) são
   respeitadas em toda operação de conversão.

**Complemento.** Projete, por escrito, o que deveria acontecer se a taxa de câmbio de uma fonte
externa chegar com um atraso maior do que o esperado — qual taxa usar, e como registrar essa
decisão.

**Checagem**

1. Por que uma conta num ledger multimoeda é melhor modelada como uma conta por moeda, em vez de
   uma conta com um campo "moeda" mutável?
2. O que significa, concretamente, "balancear por moeda" num lançamento que envolve conversão?
3. Qual é a diferença entre reavaliação e conversão de moeda?
4. Por que uma conversão ida e volta, sem variação de taxa, não devolve exatamente o valor
   original, mas sim um valor dentro de uma tolerância?

> **Reencontro — `dados-distribuidos/06`.** A escolha de modelo de armazenamento daquele marco é
> diretamente relevante para decidir como representar o histórico de taxas de câmbio aplicadas —
> um registro imutável por conversão, não um valor único reutilizado.

O tipo `Money` com moeda explícita, já apresentado em `go-fintech/02`, é a base que impede
exatamente o erro de misturar valores de moedas diferentes sem conversão explícita. E o caso de
ponta a ponta do Pix em `system-design/09`, apesar de operar numa única moeda, já estabeleceu a
disciplina de registrar explicitamente cada parâmetro usado numa operação — a mesma disciplina que
este marco aplica à taxa, hora e fonte de uma conversão.

## Principais aprendizados

- Valor e moeda formam uma unidade inseparável — um valor sem moeda associada não tem significado
  completo.
- Cada moeda balanceia isoladamente dentro de um lançamento; uma conversão é dois sublançamentos
  conectados, não uma mistura direta de moedas diferentes.
- Toda conversão registra taxa, hora e fonte — sem esses três dados, a conversão não deveria ser
  aceita.
- Ganho ou perda cambial é sempre um lançamento contábil que fecha a diferença exatamente, nunca
  um resto ignorado.
- Reavaliação ajusta a visão contábil de um saldo existente; conversão move valor de fato entre
  moedas — são operações distintas.
