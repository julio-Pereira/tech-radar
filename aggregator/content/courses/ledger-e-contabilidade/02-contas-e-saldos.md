---
id: contas-e-saldos
title: "Contas e saldos"
summary: "'Qual é o saldo?' tem pelo menos três respostas corretas — e a única que importa é a que o código declara de forma inequívoca."
estimatedMinutes: 60
references:
  - title: "Designing Data-Intensive Applications (Kleppmann)"
    url: https://dataintensive.net/
---

## Quatro tipos de saldo

**Saldo contábil** (ou efetivo) é o que o ledger de fato registrou; **saldo disponível** é o que
pode ser movimentado agora, descontando reservas ativas (marco 04); **saldo bloqueado** é a parte
retida por alguma reserva ou restrição; **saldo projetado** inclui movimentos futuros conhecidos
mas ainda não efetivados (um boleto agendado, por exemplo). Nenhum desses quatro é "o" saldo
verdadeiro — cada um responde a uma pergunta diferente, e confundi-los é a origem de boa parte da
confusão de usuário sobre "por que meu saldo mostra um número e o aplicativo mostra outro".

## Saldo derivado × saldo materializado

**Saldo derivado** é calculado, a cada consulta, como a soma de todos os lançamentos da conta —
sempre correto, sempre caro em contas com muito histórico. **Saldo materializado** é uma coluna
mantida atualizada transacionalmente a cada novo lançamento — rápido de consultar, mas que precisa
de disciplina para nunca divergir do que o histórico realmente diz. A escolha entre os dois (ou
um híbrido: materializado com verificação periódica contra o derivado) é uma decisão explícita de
performance *versus* simplicidade de garantia, não um detalhe de implementação irrelevante.

## Saldo "em data": consulta pelo tempo

Responder "qual era o saldo desta conta em 15 de março?" exige somar apenas os lançamentos com
data de competência até aquela data — uma operação natural sobre saldo derivado, e que exige
desenho deliberado (um índice por data, por exemplo) para ser eficiente sobre saldo materializado,
que por definição só guarda o estado atual. Um saldo materializado sem essa capacidade histórica
não substitui completamente o derivado — ele resolve "agora", não "em qualquer momento do
passado".

## Conta normal e sinal

Cada conta tem uma **conta normal** (devedora ou credora) — a direção que naturalmente aumenta seu
saldo, de acordo com a categoria vista no marco 01. Representar o saldo internamente sempre com um
sinal consistente em relação à conta normal (em vez de "positivo é sempre bom") evita um erro
recorrente: interpretar um saldo negativo numa conta de passivo como "problema", quando na
verdade só significa que a conta está operando na direção oposta à sua normal — algo que pode ser,
ou não, uma situação esperada, dependendo do contexto.

## Contas de cliente × contas internas

**Contas de cliente** representam o que a instituição deve (ou tem) para pessoas e empresas que
usam o produto; **contas internas** — compensação, *suspense* (valores temporariamente não
classificados), receita de tarifas, despesa operacional — existem para que a contabilidade interna
da instituição também balanceie, sem nunca se misturar com saldo de cliente em nenhuma consulta ou
relatório voltado ao cliente. Uma consulta de saldo de cliente que, por erro, inclui uma conta
interna na soma é um bug estruturalmente grave, não um detalhe cosmético.

## Limites como política, não como saldo

Um limite de cheque especial, por exemplo, não é um saldo — é uma **política** aplicada no
cálculo do disponível (disponível = contábil + limite − bloqueios). Tratar o limite como se fosse
parte do saldo contábil confundiria duas coisas estruturalmente diferentes: quanto dinheiro a
conta realmente tem, e quanto crédito a instituição decidiu estender a ela.

## Extrato como projeção do diário

Um **extrato** (a lista de movimentos que o cliente vê) é, estruturalmente, uma **projeção** do
diário de lançamentos — filtrada para a conta do cliente, formatada para leitura humana, sem expor
nenhuma conta interna da instituição. Pensar o extrato como "outro produto, derivado da mesma fonte
de verdade" em vez de "outra tabela que precisa ser mantida sincronizada" evita uma classe inteira
de bugs de divergência entre o que o extrato mostra e o que o ledger realmente registrou.

## A corrida clássica: ler saldo e decidir

Ler o saldo disponível e, com base nele, decidir se uma operação pode prosseguir, é uma operação
que — se a leitura e a decisão não acontecem na mesma transação atômica — permite que duas
operações concorrentes leiam o mesmo saldo "suficiente" e ambas prossigam, gastando mais do que
existia. Essa é a mesma classe de corrida que `concorrencia-e-recursos/10` já tratou de forma
geral; aqui ela aparece especificamente como "ler saldo, decidir, escrever" sem atomicidade.

## Verificação periódica do saldo materializado

Mesmo com disciplina transacional rigorosa, um saldo materializado se beneficia de uma
**verificação periódica** independente que o recalcula a partir do histórico completo e compara —
a primeira linha de defesa contra um bug sutil que, de outra forma, só seria descoberto quando um
cliente ou um auditor notasse a divergência.

## Exemplo numa fintech

A tela do aplicativo mostra R$ 80 de saldo disponível; o cartão autoriza uma compra de R$ 90
porque o cliente tem R$ 50 de limite de cheque especial; a fatura do mês seguinte mostra R$ 70 como
saldo contábil efetivo da conta corrente, já líquido de uma tarifa — três números, cada um correto
no seu próprio contexto, sem nenhuma contradição real entre eles.

## Hands-on

**Tutorial.** Implemente saldo derivado e saldo materializado para o mesmo conjunto de contas, com
consulta por data.

**Desafio.** Implemente o verificador que reconstrói o saldo materializado a partir do histórico e
compara os dois.

**Invariantes testáveis**

1. **Saldo materializado é igual à soma dos lançamentos** (saldo derivado), para todas as contas —
   verificado por reconstrução completa sobre uma massa sintética.
2. O saldo "em data" bate com o saldo atual quando a data consultada é o presente — propriedade
   verificável comparando as duas consultas no mesmo instante.
3. Contas internas e contas de cliente **nunca se misturam** em nenhuma consulta de saldo voltada a
   cliente — testado com uma tabela que inclui ambos os tipos de conta e verifica o resultado
   filtrado.
4. O verificador **detecta** um saldo materializado corrompido de propósito (divergente do
   histórico real) e indica exatamente qual conta diverge.
5. Com o limite de cheque especial configurado como política (não como saldo), o disponível é
   igual a contábil mais limite menos bloqueios — testado contra uma tabela de casos.
6. Ler o saldo disponível e decidir se uma operação prossegue, sob concorrência, nunca permite que
   duas operações concorrentes "gastem" mais do que o saldo realmente permitia — a versão sem
   atomicidade **demonstra** o excesso.

**Complemento.** Descreva, por escrito, em que cenário o custo de manter um saldo materializado
atualizado compensa, comparado a sempre calcular o saldo derivado.

**Checagem**

1. Por que confundir saldo contábil, disponível, bloqueado e projetado é a origem de boa parte da
   confusão de um usuário sobre "qual é o meu saldo real"?
2. Qual é o custo de cada abordagem — saldo derivado e saldo materializado — e em que situação cada
   uma é preferível?
3. Por que um limite de cheque especial deveria ser tratado como política aplicada no cálculo do
   disponível, e não como parte do saldo contábil?
4. Por que ler o saldo e decidir se uma operação prossegue precisa ser atômico, não duas operações
   separadas?

> **Reencontro — `concorrencia-e-recursos/10`.** A matriz de mecanismos de concorrência daquele
> marco é exatamente o que decide como "ler saldo, decidir, escrever" deste marco deveria ser
> implementado sem permitir a corrida clássica de gasto duplicado sob concorrência.

As anomalias de isolamento de transação já catalogadas em `dados-distribuidos/04` são o vocabulário
preciso para descrever por que ler saldo fora de uma transação atômica cria a corrida deste marco;
e o `CQRS` e as projeções de `arquitetura-eventos/06` são o mesmo padrão arquitetural que o extrato,
como projeção do diário de lançamentos, já aplica na prática.

## Principais aprendizados

- "Saldo" tem pelo menos quatro respostas corretas (contábil, disponível, bloqueado, projetado) —
  cada uma respondendo a uma pergunta diferente.
- Saldo derivado é sempre correto e caro; saldo materializado é rápido e exige disciplina para
  nunca divergir do histórico real.
- Contas internas e contas de cliente nunca deveriam se misturar em nenhuma consulta voltada ao
  cliente.
- Um limite de crédito é política aplicada no cálculo do disponível, não parte do saldo contábil.
- Ler saldo e decidir se uma operação prossegue precisa ser atômico — a versão não atômica permite
  gasto duplicado sob concorrência.
