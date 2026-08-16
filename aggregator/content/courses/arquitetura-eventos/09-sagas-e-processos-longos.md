---
id: sagas
title: "Sagas e processos de longa duração"
summary: "Coreografia × orquestração com critério, a saga como máquina de estado persistida, compensação como semântica e o pivot step — porque nem toda ação é reversível."
estimatedMinutes: 60
references:
  - title: "Microservices.io — Saga pattern"
    url: https://microservices.io/patterns/data/saga.html
  - title: "Garcia-Molina & Salem — Sagas (1987)"
    url: https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf
  - title: "Temporal — What is a Workflow"
    url: https://docs.temporal.io/workflows
---

## O problema que a saga resolve

Uma liquidação Pix atravessa cinco passos, quatro sistemas e pode levar horas: reservar
saldo → decidir risco → enviar ao PSP → liquidar → notificar. Não existe transação que
segure isso. E não é limitação de tecnologia: manter locks por horas seria pior do que o
problema (é o argumento contra 2PC do marco 08, levado ao extremo).

Uma **saga** é a resposta: quebrar o processo em passos locais, cada um com sua própria
transação, e definir para cada um uma **compensação** que desfaz semanticamente o que ele
fez. Você troca atomicidade por um estado intermediário visível — e passa a ter que decidir
o que fazer com ele.

## Coreografia × orquestração, com critério

**Coreografia**: cada serviço reage a eventos, ninguém coordena. Acoplamento mínimo, fácil
de começar. O preço é que o processo não existe em lugar nenhum — ele emerge da soma dos
consumidores, e ninguém consegue desenhá-lo sem ler cinco repositórios.

**Orquestração**: um componente conhece o processo inteiro e comanda os passos. O processo
fica explícito, testável e observável. O preço é um componente a mais, que precisa não virar
o monolito com todas as regras de todos os contextos.

O critério não é gosto:

| Use coreografia | Use orquestração |
| --- | --- |
| até ~3 passos | 4 passos ou mais |
| ninguém pergunta o status | alguém pergunta "onde está esse pagamento?" |
| compensação simples ou desnecessária | compensação em vários degraus |
| times independentes, acoplamento é o inimigo | precisa de prazo, retentativa e histórico |

Numa fintech, **alguém sempre pergunta onde está o pagamento** — o cliente, o atendimento, o
regulador. Isso resolve a discussão na maioria dos casos: liquidação é orquestrada.

## A saga é uma máquina de estado persistida

Este é o ponto que separa saga de "um monte de consumidores que se chamam".

A saga precisa ser um **objeto com estado no banco**: qual é o passo atual, quantas
tentativas já houve, qual o prazo, o que aconteceu até agora. Não é um `switch` dentro de um
consumidor — é uma entidade, com id próprio, consultável.

```
Saga: settlement-8f2c
  estado: AGUARDANDO_PSP
  passo: 3 de 5
  tentativa: 2
  prazo: 2026-08-15T18:00:00Z
  histórico: [SaldoReservado, RiscoAprovado, EnvioAoPSP(tentativa 1, timeout)]
```

Sem isso, você tem uma **saga implícita**: o processo existe, mas espalhado, e ninguém
consegue responder quantas estão abertas nem em que passo. É dívida invisível — não aparece
em nenhum diagrama, e aparece no primeiro incidente.

E permite responder à pergunta do parágrafo anterior com uma consulta, em vez de um mergulho
em log.

## Compensação é semântica, não rollback

Um rollback apaga; uma compensação **acrescenta**.

Estorno não é o desfazimento do débito: é uma transação nova, com data própria, taxa
própria, registro contábil próprio, e possivelmente uma diferença de câmbio. O cliente vê os
dois lançamentos no extrato — e é isso que a contabilidade exige (é a mesma regra do ledger
double-entry do marco 07: nada se apaga).

Duas consequências importantes:

**Compensação pode falhar.** E aí? Ela também tem retentativa, prazo e, no limite, uma fila
de intervenção humana. Saga que assume compensação infalível está incompleta.

**Nem toda ação é compensável.** E-mail enviado não volta. Dinheiro que saiu para outra
instituição volta com processo, custo e prazo — às vezes não volta. Isso leva ao conceito
que organiza a saga inteira:

**Pivot step.** O passo a partir do qual não há mais volta. Antes dele, tudo é reversível a
baixo custo; depois dele, o processo só vai para a frente. A regra de desenho é **ordenar os
passos para que o irreversível venha o mais tarde possível**: valide tudo, reserve tudo,
decida tudo — e só então envie o dinheiro. Notificar o cliente vem depois, nunca antes.

Uma saga cujo passo irreversível está no meio tem um problema de desenho que nenhuma
implementação conserta.

## Timeout: cidadão de primeira classe

O modo de falha mais comum de saga não é erro — é **silêncio**. O PSP não responde, ninguém
lança exceção, e a saga fica em `AGUARDANDO_PSP` para sempre. Não há alerta, porque nada
falhou.

Toda saga precisa de:

- **Prazo por passo**, com ação definida ao estourar: retentar, compensar ou escalar.
- **Temporizador como evento.** "Passaram-se 30 minutos" é um fato que dispara uma política,
  exatamente como qualquer outro evento (marco 03).
- **Alerta por idade**, não por erro: "sagas abertas há mais de 30 minutos" (marco 11).

Saga pendurada é dinheiro parado no meio do caminho, e o cliente vê isso antes de você.

## Ferramenta × caseiro

**Caseiro** — máquina de estado no seu serviço, tabela no seu banco, temporizador por job.
Você controla tudo, entende tudo, e escreve retentativa, prazo, histórico e idempotência com
as próprias mãos. Cabe bem em até uns poucos processos.

**Temporal / Camunda** — o motor cuida de estado durável, retentativa, temporizador e
visualização; você escreve o fluxo como código. Ganho real quando são muitos processos
longos e complexos.

O critério honesto é o de sempre: **uma ferramenta a mais é um plantão a mais**. O motor
vira infraestrutura crítica — se ele cai, nenhum pagamento avança. Adote quando o custo de
escrever e manter as máquinas de estado à mão for maior que o custo de operar o motor, e
não porque a apresentação era boa.

## Exemplo numa fintech

A liquidação Pix do `fin-flow`, com a compensação de cada degrau:

| Passo | Ação | Compensação |
| --- | --- | --- |
| 1 | reservar saldo | liberar reserva |
| 2 | decidir risco | nenhuma (só leitura) |
| 3 | enviar ao PSP | **pivot step** — a partir daqui, só para a frente |
| 4 | liquidar no ledger | lançamento de estorno |
| 5 | notificar o cliente | notificação de correção |

E o hotspot que apareceu no event storming do marco 03: **o estorno que chega depois do
fechamento da janela**. A resposta de operações era "a gente resolve no dia seguinte, na
mão". Modelado, isso vira um estado explícito — `ESTORNO_FORA_DE_JANELA` — com dono, prazo e
uma decisão de negócio escrita sobre quem absorve a diferença.

Repare no que aconteceu: o processo manual não sumiu. Ele passou a ser **visível, contável e
alertável**, que é o máximo que a arquitetura pode fazer por uma decisão que é de negócio.

## Hands-on

**Tutorial — orquestrador `fin-flow` com estado persistido.**

1. Modele a tabela `saga(id, tipo, estado, passo, tentativa, prazo, correlation_id)` e a
   tabela de histórico de passos.
2. Implemente a máquina de estado dos cinco passos, com a compensação de cada um.
3. Todo passo escreve o resultado no histórico **na mesma transação** em que muda o estado
   da saga — é o outbox/inbox do marco 08 aplicado ao próprio orquestrador.
4. Implemente o temporizador: um job que busca sagas com prazo estourado e dispara a ação.
5. Exponha `GET /sagas/{correlationId}` respondendo em que passo o pagamento está.
6. `git commit -m "feat: orquestrador de liquidação com máquina de estado e compensação"`.

**Desafio — matar o orquestrador no meio.** Com uma saga no passo 3, mate o processo
(`kill -9`). Suba de novo. Prove que ela **retoma** de onde estava, sem duplicar o débito e
sem perder a compensação pendente. Depois faça o mesmo entre o passo 4 e o 5.

**Invariantes testáveis**

1. Depois de matar e reiniciar em qualquer passo, o ledger fecha idêntico ao cenário sem
   falha.
2. Nenhuma saga fica sem prazo: uma consulta prova que toda saga aberta tem `prazo` não nulo.
3. Toda ação anterior ao pivot step tem uma compensação implementada e testada.
4. Uma compensação que falha é retentada e, no limite, escalada — não é silenciosamente
   perdida.
5. O passo irreversível é o último com efeito externo; um teste de ordem dos passos prova
   isso.

**Complemento.** Inverta de propósito os passos 3 e 4 (envie ao PSP antes de liquidar no
ledger) e escreva o que quebra. É o exercício que faz o conceito de pivot step parar de ser
abstrato.

**Checagem**

1. Qual critério decide entre coreografia e orquestração — e por que numa fintech ele quase
   sempre aponta para o mesmo lado?
2. O que é uma saga implícita, e por que ela é dívida invisível?
3. Por que compensação não é rollback, e o que o cliente vê no extrato?
4. Qual é o modo de falha mais comum de uma saga, e por que ele não dispara alerta de erro?

## Principais aprendizados

- Saga troca atomicidade por estado intermediário visível: passos locais, cada um com sua
  transação e sua compensação.
- Coreografia até ~3 passos e sem status central; orquestração quando alguém pergunta "onde
  está esse pagamento?" — e numa fintech alguém sempre pergunta.
- A saga é máquina de estado persistida, com passo, tentativa, prazo e histórico. Espalhada
  por consumidores, ela é dívida invisível.
- Compensação é transação nova, pode falhar e precisa de retentativa. O **pivot step**
  organiza o desenho: o irreversível vem por último.
- O modo de falha mais comum é silêncio, não erro: prazo por passo, temporizador como evento
  e alerta por idade.
