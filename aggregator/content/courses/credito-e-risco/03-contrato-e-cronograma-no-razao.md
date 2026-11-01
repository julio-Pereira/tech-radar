---
id: contrato-e-cronograma-no-razao
title: "Contrato e cronograma no razão"
summary: "O contrato diz o que é devido; o razão diz o que aconteceu — e os dois só são confiáveis se um deriva do outro e qualquer divergência dispara alarme."
estimatedMinutes: 65
references:
  - title: "Accounting for Computer Scientists (Martin Kleppmann)"
    url: https://martin.kleppmann.com/2011/03/07/accounting-for-computer-scientists.html
---

## Desembolso: o primeiro lançamento

O **desembolso** — o momento em que o valor do empréstimo efetivamente sai da instituição para o
cliente — é o primeiro lançamento contábil do ciclo de vida de um contrato: débito na conta de
empréstimos a receber (um ativo que nasce), crédito na conta de disponibilidades. Esse lançamento
posta no razão (`fin-books`) exatamente como qualquer outro lançamento balanceado — nenhuma
exceção especial para crédito.

## *Accrual* diário × reconhecimento por vencimento

Os **juros** de um contrato podem ser reconhecidos de duas formas: por **vencimento** (só no
momento em que a parcela é devida) ou por ***accrual* diário** (reconhecendo, dia a dia, a
fração proporcional de juros já "ganha" até aquele ponto — a mesma prática de acúmulo diário já
introduzida no ledger). A segunda abordagem mantém o saldo contábil sempre refletindo o valor
econômico real da carteira, em vez de "pular" o reconhecimento inteiro de uma vez no vencimento.

## Ordem de imputação do pagamento

Quando um pagamento chega — especialmente um pagamento **parcial** ou em **atraso**, que não cobre
integralmente tudo que é devido — a **ordem de imputação** determina a quais componentes o valor
se aplica primeiro: tipicamente **encargos** (multa, juros de mora) → **juros** → **principal**
(**conferir** a ordem exigida pelo produto e pela regulação específica). Aplicar um pagamento na
ordem errada distorce tanto o saldo devedor remanescente quanto a contabilização de receita de
juros.

## Atraso: multa, juros de mora e correção

Um pagamento em atraso acumula, tipicamente, **multa** (um percentual ou valor fixo),
**juros de mora** (proporcionais aos dias de atraso) e, eventualmente, **correção** monetária —
cada um como parâmetro configurável, com **limites legais** que **conferir** sempre contra a
regulação vigente (esses limites existem especificamente para proteger o consumidor contra encargos
abusivos). Calcular esses três componentes como lançamentos **separados e identificáveis**, em vez
de um único "valor de atraso" agregado, é o que permite auditoria e conciliação posteriores.

## Pagamento parcial e amortização antecipada

Um **pagamento parcial** (menor que o valor total devido) segue a mesma ordem de imputação, só que
parando antes de cobrir tudo — o saldo remanescente continua devido e acumulando encargos conforme
as regras do produto. **Amortização antecipada** (já vista no marco 02 do ponto de vista
matemático) aqui ganha o lançamento contábil correspondente: reduz o principal diretamente,
recalculando o cronograma restante.

```diagrama
cr-razao
```

## Renegociação: um novo contrato que liquida o antigo

**Renegociar** um contrato em crédito não é editar o contrato existente — é, estruturalmente,
**liquidar o contrato antigo** (um lançamento que encerra sua posição) e **originar um novo
contrato** com os termos renegociados, carregando o saldo devedor remanescente como seu principal
inicial. Essa escolha de modelagem preserva a imutabilidade do histórico (o contrato original
nunca é editado) e deixa um rastro completo e auditável de toda a história da relação com o
cliente.

## Estorno de pagamento

Um pagamento que precisa ser desfeito (uma retentativa duplicada do banco pagador, por exemplo)
usa a mesma disciplina de **estorno** já estabelecida no ledger: um lançamento que desfaz o
pagamento original, devolvendo o saldo devedor ao estado anterior — nunca uma edição direta do
lançamento de pagamento já registrado.

## Sagas de contratação

A sequência **aprovar → assinar → desembolsar → registrar** é, estruturalmente, um processo de
longa duração com múltiplas etapas, cada uma potencialmente precisando de **compensação** se uma
etapa posterior falhar (o desembolso falha depois da assinatura: a saga precisa reverter a
formalização, não deixar o contrato num limbo). Essa é exatamente a mesma disciplina de sagas já
formalizada, de forma geral, para processos de longa duração.

```diagrama
cr-saga
```

## Conciliação contrato × razão: a divergência como relatório, não mistério

Em qualquer momento, o **saldo devedor calculado a partir do cronograma do contrato** deveria ser
**igual** ao **saldo derivado dos lançamentos do razão** para aquele contrato. A conciliação entre
os dois não é uma tarefa ocasional de auditoria — é um **relatório contínuo**, que deveria estar
**vazio** no caso normal e apontar exatamente qual contrato diverge, e por quanto, quando algo dá
errado.

## Exemplo numa fintech

O pagamento de uma parcela chega **duas vezes** ao sistema (uma retentativa do banco pagador que
reenviou a confirmação); o contrato aplica o pagamento **uma única vez** (pela chave de
idempotência); o razão registra um **estorno** explícito da segunda tentativa duplicada; e o
relatório de conciliação entre contrato e razão aponta **zero divergência** — a história completa
(pagamento, duplicata, estorno) fica registrada e consistente nos dois lados.

## Hands-on

**Tutorial.** Implemente o adaptador `razao/` e a postagem do cronograma do exemplo do marco 02.

**Desafio.** Implemente um pagamento parcial em atraso com ordem de imputação completa, e uma
renegociação.

**Invariantes testáveis**

1. **Todo lançamento** gerado pelo ciclo de vida do contrato é **balanceado** (débitos = créditos).
2. O **saldo devedor do razão é igual ao saldo derivado do cronograma do contrato**, em qualquer
   data — propriedade verificada sobre uma sequência aleatória de eventos válidos.
3. **Replay** de todos os eventos reconstrói razão e contrato **idênticos** ao estado atual.
4. Um **pagamento duplicado** (mesma chave de idempotência) é aplicado **uma única vez**, mesmo
   sob tentativas concorrentes.
5. A **imputação** de um pagamento parcial segue exatamente a ordem configurada — verificado
   contra uma tabela de casos com diferentes combinações de encargos, juros e principal devidos.
6. Uma **renegociação conserva o total devido**, salvo um desconto explícito, que aparece como
   seu próprio lançamento identificável — nunca embutido silenciosamente no principal do novo
   contrato.
7. O **relatório de conciliação** contrato × razão é **vazio** no caso normal, e **lista
   exatamente o contrato afetado** quando um lançamento é corrompido de propósito para o teste.

**Complemento.** Descreva, por escrito, como a sua própria instituição (ou uma que você conheça)
concilia contrato e contabilidade de crédito — e onde ficam as maiores fontes de divergência.

**Checagem**

1. Por que renegociar um contrato é modelado como liquidar o antigo e originar um novo, em vez de
   editar o contrato existente?
2. Por que a ordem de imputação de um pagamento parcial importa para o cálculo correto do saldo
   remanescente?
3. Por que um pagamento duplicado deveria ser corrigido por estorno, nunca por edição direta do
   lançamento original?
4. Por que a conciliação entre contrato e razão deveria ser um relatório contínuo, não uma tarefa
   ocasional de auditoria?

> **Reencontro — `arquitetura-eventos/09`.** As sagas e processos de longa duração daquele marco
> são exatamente o padrão que a sequência aprovar → assinar → desembolsar → registrar, deste
> marco, segue — cada etapa com sua compensação correspondente se uma etapa posterior falhar.

O outbox/inbox de `arquitetura-eventos/08` sustenta a publicação confiável de cada evento do
ciclo de contratação; as anomalias de isolamento de transação de `dados-distribuidos/04` são o
vocabulário preciso para descrever os riscos de concorrência na postagem simultânea de lançamentos
do mesmo contrato; e o caso de ponta a ponta do Pix em `system-design/09` segue sendo a referência
geral de resultado desconhecido e estado terminal único, aqui aplicada ao pagamento de uma parcela
em vez de a uma transação Pix.

## Principais aprendizados

- O desembolso é o primeiro lançamento contábil do ciclo de vida de um contrato de crédito —
  balanceado como qualquer outro lançamento do razão.
- A ordem de imputação de um pagamento parcial (encargos → juros → principal) determina
  corretamente o saldo remanescente.
- Renegociação é modelada como liquidar o contrato antigo e originar um novo, preservando o
  histórico imutável.
- Um pagamento duplicado se corrige por estorno, nunca por edição direta do lançamento original.
- A conciliação entre contrato e razão deveria ser um relatório contínuo e vazio no caso normal —
  não uma tarefa ocasional de auditoria.
