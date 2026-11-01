---
id: razao-e-partida-dobrada
title: "Razão e partida dobrada"
summary: "Um ledger só aceita movimentos de dinheiro entre contas, em pares que se anulam — e essa restrição única elimina uma classe inteira de bugs."
estimatedMinutes: 55
references:
  - title: "Accounting for Computer Scientists (Martin Kleppmann)"
    url: https://martin.kleppmann.com/2011/03/07/accounting-for-computer-scientists.html
---

## Contas: ativo, passivo, receita, despesa, patrimônio

Toda conta contábil pertence a uma de cinco categorias: **ativo** (o que a instituição possui ou
tem a receber), **passivo** (o que ela deve), **patrimônio** (o que resta depois de ativo menos
passivo), **receita** e **despesa** (os fluxos que alteram o patrimônio ao longo do tempo). Essas
categorias não são jargão decorativo — elas determinam o **sinal esperado** de cada conta: um
ativo normalmente cresce com débito; um passivo, com crédito. Entender a categoria de uma conta é
o que permite prever, antes de qualquer cálculo, se um lançamento deveria aumentar ou diminuir seu
saldo.

## Débito e crédito como direção, não como "bom" e "ruim"

O erro mais comum de quem aprende contabilidade depois de já saber programar: tratar débito como
"subtrair" e crédito como "somar" (ou o contrário). Débito e crédito são **direções** — a mesma
operação é um débito numa conta e um crédito em outra, e se a conta cresce ou diminui com cada
direção depende inteiramente da **categoria** da conta (ativo ou despesa crescem com débito;
passivo, patrimônio e receita crescem com crédito). Não existe "lado bom" universal — existe a
convenção de cada tipo de conta.

## Partida dobrada e a equação contábil

A **partida dobrada** é a regra central: todo lançamento tem, no mínimo, duas pernas — uma de
débito e uma de crédito — e a soma de todos os débitos é sempre igual à soma de todos os créditos.
Essa restrição é, na prática, a **equação contábil** (ativo = passivo + patrimônio) mantida
verdadeira em todo instante, lançamento após lançamento. Um sistema que permite um lançamento
desbalanceado está, literalmente, permitindo que dinheiro apareça ou desapareça do nada.

## Lançamento com várias pernas e a regra de balanceamento

Um **lançamento** pode ter mais de duas pernas (uma transação com taxa envolve, por exemplo, três
contas: a do pagador, a do recebedor e a da taxa) — a regra de balanceamento generaliza para
"a soma de todas as pernas de débito é igual à soma de todas as pernas de crédito do mesmo
lançamento", não apenas "existem exatamente duas pernas". Um lançamento de uma única perna nunca é
válido, independente do que ele tentasse representar — sozinho, não tem como balancear.

```diagrama
lg-partida
```

## Plano de contas

O **plano de contas** organiza as contas numa hierarquia (contas de cliente, contas internas como
compensação, suspense, receita de tarifas, despesa operacional) — o plano de contas oficial do
sistema financeiro nacional, com seus códigos e categorias específicas, é tratado aqui como um
**parâmetro configurável**, nunca hardcoded (**conferir** o plano vigente com contabilidade antes
de qualquer implementação real). Esta trilha testa o **mecanismo** de um plano de contas
(hierarquia, balanceamento por categoria), não a interpretação contábil ou regulatória específica
de nenhuma instituição.

## Razão × diário

O **diário** (*journal*) é a sequência cronológica e imutável de todos os lançamentos; o **razão**
(*ledger*) é a visão organizada por conta, derivada do diário. Na prática de engenharia, o diário é
a fonte de verdade append-only; o razão (os saldos por conta) é, estruturalmente, uma **consulta**
sobre o diário — mesmo quando, por performance, esse resultado é armazenado (marco 02 detalha essa
escolha).

## Por que "saldo" não é um campo mutável

Tratar saldo como uma coluna `balance` que se atualiza diretamente com cada operação parece
simples, mas destrói a propriedade mais valiosa de um ledger: a capacidade de **reconstruir** e
**explicar** qualquer saldo a partir do histórico completo de lançamentos. Um saldo que é só um
número atualizado não tem como responder "por que esse valor?" — um saldo derivado do diário
sempre tem essa resposta, porque ela é, literalmente, a soma de tudo que já aconteceu.

## Dinheiro como inteiro na menor unidade

Valores monetários neste domínio são representados como **inteiros na menor unidade** (centavos,
não reais com ponto flutuante) ou como tipo decimal exato — nunca como `float`/`double` binário,
que não representa exatamente a maioria dos valores decimais e acumula erro de arredondamento ao
longo de operações sucessivas. Em Java, `BigDecimal` resolve o mesmo problema por um caminho
diferente (decimal exato, não inteiro); comparar as duas abordagens revela que o problema central
— nunca usar ponto flutuante binário para dinheiro — é o mesmo, independente da linguagem.

## O que um ledger garante, e o que não garante

Um ledger garante a **integridade contábil**: todo lançamento balanceia, todo saldo é
reconstruível, nada é apagado. Um ledger **não** garante que uma operação faça sentido de negócio
(ele não sabe se uma transferência de R$ 1 milhão é legítima), não executa pagamentos (ele só
registra o resultado de uma operação já decidida em outro lugar) e não decide política de crédito
ou limite — essas responsabilidades pertencem a outros componentes do sistema que **usam** o
ledger como fonte de verdade.

## Exemplo numa fintech

Um cliente deposita R$ 100 na sua conta: o lançamento tem uma perna de débito na conta do banco no
Banco Central (um ativo que aumenta) e uma perna de crédito na conta do cliente (um passivo do
banco para o cliente, que também aumenta). Sem o par balanceado, o dinheiro teria simplesmente
"aparecido" do lado do cliente, sem origem contábil nenhuma.

## Hands-on

**Tutorial.** Implemente o esquema de contas e a função `Postar(lançamento)` com validação de
balanceamento, em Go e SQL.

**Desafio.** Escreva um gerador de lançamentos aleatórios e o teste de propriedade que verifica o
balanceamento sobre qualquer sequência gerada.

**Invariantes testáveis**

1. Um lançamento cuja soma de débitos difere da soma de créditos **nunca persiste** — verificado
   tanto na camada de aplicação quanto por uma restrição ou gatilho no próprio banco de dados.
2. Para **qualquer sequência aleatória** de lançamentos válidos gerados com semente fixa, **Σ
   débitos = Σ créditos** no razão inteiro, em todo instante observado.
3. Nenhuma coluna monetária no esquema, e nenhum tipo monetário no código Go, é ponto flutuante
   binário — verificado por varredura automática de esquema e de tipos.
4. Um lançamento com uma única perna é **rejeitado** — a regra de balanceamento exige, no mínimo,
   uma perna de débito e uma de crédito.
5. O tipo `Money` não aceita nenhuma operação entre valores de moedas diferentes sem conversão
   explícita — testado com uma tabela de casos que tenta misturar moedas diretamente.

**Complemento.** Modele o mesmo depósito em Java usando `BigDecimal` e compare, por escrito, os
pontos onde cada abordagem (inteiro na menor unidade em Go, decimal exato em Java) poderia
introduzir um erro se mal implementada.

**Checagem**

1. Por que débito e crédito são descritos como direções, não como "aumentar" ou "diminuir"
   universalmente?
2. O que a equação contábil (ativo = passivo + patrimônio) tem a ver com a regra de que todo
   lançamento precisa balancear?
3. Por que tratar saldo como uma coluna simplesmente atualizada destrói a capacidade de
   reconstruir e explicar esse saldo depois?
4. O que, especificamente, um ledger não garante — e por que essas responsabilidades pertencem a
   outro componente do sistema?

> **Reencontro — `dados-distribuidos/04`.** As transações e o isolamento daquele marco são o
> mecanismo que garante que a validação de balanceamento deste marco realmente se sustente sob
> concorrência — postar um lançamento com várias pernas precisa da mesma atomicidade que esse
> marco já formalizou.

O tipo `Money` e o processador em lote de `go-fintech/02` são o ponto de partida que esta trilha
leva a um razão completo, e o domínio de pagamento como conjunto de eventos de negócio, já
delimitado em `arquitetura-eventos/02`, é o vocabulário que um lançamento contábil formaliza em
termos de débito e crédito. A disciplina de transformar um requisito em números concretos de
`system-design/02` se aplica diretamente ao dimensionamento de qualquer plano de contas real.

## Principais aprendizados

- Débito e crédito são direções — o que cada uma faz ao saldo depende da categoria da conta, não
  de uma regra universal de "bom" ou "ruim".
- Partida dobrada é a equação contábil mantida verdadeira lançamento após lançamento: todo débito
  tem um crédito correspondente de igual valor.
- Um lançamento pode ter várias pernas, mas a soma de débitos sempre precisa igualar a soma de
  créditos do mesmo lançamento.
- Saldo como campo mutável simples destrói a capacidade de reconstruir e explicar esse saldo a
  partir do histórico.
- Dinheiro é sempre inteiro na menor unidade ou decimal exato — nunca ponto flutuante binário.
