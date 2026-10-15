---
id: fechamento-de-periodo
title: "Fechamento de período"
summary: "Um ledger só é auditável se algum dia ele diz 'fechado' — e se esse 'fechado' realmente impede mudança."
estimatedMinutes: 60
references:
  - title: "Accounting for Computer Scientists (Martin Kleppmann)"
    url: https://martin.kleppmann.com/2011/03/07/accounting-for-computer-scientists.html
---

## Períodos: dia, mês, e o ato de fechar

Um **período** contábil (dia, mês) tem um começo e um fim definidos, e **fechar** um período é o
ato de declarar formalmente que nenhum lançamento novo com data de competência dentro dele será
mais aceito — exceto por uma via explícita de ajuste auditado. Sem esse ato de fechamento, "o
período de março" seria uma janela de tempo sempre potencialmente mutável, nunca algo que um
relatório pudesse citar com confiança de que o número não vai mudar depois.

## *Cut-off* e calendário bancário

O **cut-off** é o horário exato em que o fechamento de um período é executado — e definir esse
horário exige um **calendário bancário** (quais dias são dias úteis, quais são feriados) tratado
como **configuração testada** (**conferir** a fonte correta do calendário vigente, nunca assumida
de memória). Um lançamento que chega exatamente no limiar do cut-off — alguns segundos antes ou
depois — precisa de uma regra explícita e determinística para decidir a qual período ele pertence.

## *Snapshot* de fechamento e sua imutabilidade

O fechamento de um período gera um **snapshot**: os saldos de todas as contas naquele exato
momento, congelados. Esse snapshot precisa ser **imutável** depois de gerado — ele é, por
construção, igual ao saldo que seria reconstruído a partir do diário até aquela data, e qualquer
divergência entre os dois é, em si, um sinal de bug a investigar, nunca algo a "corrigir" editando
o snapshot diretamente.

## Balancete: a prova de que o período fecha

O **balancete** (*trial balance*) soma os saldos devedores de todas as contas e, separadamente, os
saldos credores — e a prova fundamental de que um período fechou corretamente é que **essas duas
somas sejam iguais**, para cada moeda. Um balancete que não fecha não é um relatório com um
problema cosmético: é um sinal direto de que algum lançamento, em algum lugar do período, violou a
partida dobrada (ou que o cálculo do próprio balancete tem um bug).

## Razão geral × subrazão e conta de controle

O **razão geral** mostra o total agregado; um **subrazão** detalha um grupo específico de contas
(todas as contas de clientes, por exemplo) sob uma única **conta de controle** no razão geral — o
balancete do subrazão, fechado isoladamente, precisa bater com o saldo da conta de controle
correspondente. Essa verificação cruzada entre razão geral e subrazão é uma segunda camada de
garantia, independente do balancete do razão geral como um todo.

## Lançamento tardio: a regra explícita

Um lançamento que chega **depois** do cut-off de fechamento, mas com data de competência **dentro**
do período já fechado, precisa de uma regra explícita e decidida com antecedência: ele entra no
próximo período com a competência original preservada (um lançamento retroativo, já visto no marco
03), ou é tratado como ajuste do período fechado por uma via auditada? A pior resposta possível é
"decidir caso a caso, sob pressão, quando a situação realmente aparecer".

## Fechamento incremental e reabertura controlada

**Fechar** um período duas vezes seguidas, sem nenhuma mudança entre as duas execuções, deveria
ser **idempotente** — produzir exatamente o mesmo resultado, sem efeito colateral de rodar
novamente. **Reabrir** um período já fechado é uma operação excepcional, que exige registro
auditável explícito (quem, quando, por quê) e **refaz** o balancete inteiro depois da correção —
nunca uma operação silenciosa ou informal.

## Reprocessamento seguro

Se o processo de fechamento falhar no meio (uma queda de energia, um erro de infraestrutura) e
precisar ser executado novamente, o reprocessamento não pode duplicar nem perder nenhum efeito do
fechamento — a mesma disciplina de idempotência que já apareceu em todo o restante desta trilha se
aplica, aqui, especificamente ao próprio ato de fechar um período.

## O fechamento como evento para consumidores

Quando um período fecha, esse evento é, ele mesmo, um sinal relevante para sistemas consumidores —
um pipeline de dados (`engenharia-de-dados`) que só processa dados "definitivos" de um período
espera exatamente esse sinal antes de iniciar seu próprio processamento, evitando trabalhar sobre
números que ainda poderiam mudar.

## Exemplo numa fintech

O fechamento do dia roda automaticamente às 22h; um lançamento legítimo, gerado por uma operação
que começou antes das 22h mas só terminou de processar às 22h03, chega três minutos depois do
cut-off — a regra explícita decidida com antecedência determina que ele entra no próximo dia, com
a data de competência do dia que já fechou, preservando a correção econômica sem reabrir nada.

## Hands-on

**Tutorial.** Implemente períodos, o processo de fechamento, e o cálculo do balancete.

**Desafio.** Implemente o calendário bancário configurável e a regra de lançamento tardio.

**Invariantes testáveis**

1. Um **período fechado rejeita** qualquer novo lançamento com data de competência dentro dele,
   exceto pela via explícita de ajuste auditado.
2. O **balancete fecha** a cada período (Σ saldos devedores = Σ saldos credores), verificado por
   moeda, sobre uma massa sintética de lançamentos.
3. O **snapshot** de fechamento é **igual** ao saldo reconstruído diretamente do diário para a
   mesma data — propriedade verificada por reconstrução independente.
4. O **calendário de dias úteis** é uma função configurável e testada, verificada contra uma
   tabela que inclui fins de semana e feriados fictícios.
5. Reabrir um período exige um **registro auditável explícito** e **refaz** o balancete inteiro —
   verificado comparando o balancete antes e depois da reabertura e correção.
6. **Fechar o mesmo período duas vezes**, sem nenhuma mudança entre as execuções, é **idempotente**
   — produz exatamente o mesmo snapshot e balancete nas duas vezes.

**Complemento.** Escreva, por escrito, a regra de lançamento tardio que você adotaria para o seu
próprio contexto — o que determina se ele entra no próximo período ou exige ajuste auditado.

**Checagem**

1. Por que um balancete que não fecha é um sinal direto de um problema real, não um detalhe
   cosmético de relatório?
2. Qual é a diferença entre um lançamento retroativo (marco 03) comum e um lançamento que chega
   depois do cut-off de fechamento?
3. Por que reabrir um período fechado precisa de registro auditável explícito, em vez de ser uma
   operação informal?
4. Por que fechar o mesmo período duas vezes seguidas deveria ser idempotente?

> **Reencontro — `dados-distribuidos/11`, `/12`.** A migração de schema sem downtime daquele
> primeiro marco se aplica diretamente a uma tabela de lançamentos imutáveis que nunca para de
> crescer; e o backup, PITR e DR do segundo são a referência de que dados se perdem (e o que a
> conciliação do marco 08 consegue revelar) numa restauração de ponto no tempo deste razão.

A orquestração de `engenharia-de-dados/07` é o mecanismo que, na prática, dispara e sequencia o
processo de fechamento como um pipeline confiável; e o outbox/inbox de `arquitetura-eventos/08` é
o que garante que o evento de fechamento de período chegue exatamente uma vez a cada sistema
consumidor que depende dele.

## Principais aprendizados

- Fechar um período é declarar formalmente que nenhum lançamento novo com aquela competência será
  mais aceito, exceto por ajuste auditado.
- Um balancete que não fecha é sinal direto de uma violação de partida dobrada em algum
  lançamento, nunca um problema cosmético.
- O snapshot de fechamento precisa ser igual ao saldo reconstruído do diário — qualquer
  divergência é um bug a investigar.
- Reabrir um período fechado exige registro auditável explícito e refaz o balancete inteiro.
- Fechar o mesmo período duas vezes, sem mudanças entre as execuções, deveria produzir exatamente
  o mesmo resultado.
