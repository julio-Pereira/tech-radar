---
id: reservas-e-holds
title: "Reservas, holds e autorização"
summary: "Entre 'o cliente pediu' e 'o dinheiro foi liquidado' existe um intervalo — e o hold é o mecanismo que impede o mesmo dinheiro de ser prometido duas vezes."
estimatedMinutes: 60
references:
  - title: "Designing Data-Intensive Applications (Kleppmann)"
    url: https://dataintensive.net/
---

## Autorização × captura × liquidação

Entre o momento em que uma operação é autorizada e o momento em que ela é efetivamente liquidada
no razão existe uma janela de tempo — curta ou longa, dependendo do trilho — durante a qual o
dinheiro já está comprometido, mas ainda não movido de forma final. Essa janela é exatamente o que
uma **reserva** (*hold*) formaliza: um compromisso contábil explícito que não é, em si, um
lançamento final, mas que precisa ser respeitado por qualquer outra operação concorrente sobre a
mesma conta.

## Reserva: redução do disponível sem lançamento final

Uma reserva reduz o **saldo disponível** (marco 02) sem gerar, ainda, um lançamento contábil
definitivo — o saldo contábil permanece inalterado até a reserva ser **capturada** (convertida em
lançamento real) ou **liberada** (descartada sem efeito). Modelar a reserva como uma entidade
separada do lançamento final, em vez de tentar representá-la como um lançamento provisório
"editável", é o que preserva a imutabilidade do journal estabelecida no marco 03.

## As duas fases e os estados de uma reserva

Toda reserva segue duas fases: **reservar** (criar o compromisso, reduzindo o disponível) e depois
**capturar** ou **liberar** (resolver o compromisso, de um jeito ou de outro). Cada reserva tem um
conjunto fechado de **estados**: ativa, capturada, liberada, expirada — e, criticamente, uma
reserva só pode terminar num **único** estado terminal, mesmo que múltiplas tentativas de capturar
ou liberar aconteçam de forma concorrente ou repetida.

## Captura parcial, excedente e expiração

Uma reserva pode ser **capturada parcialmente** (reservou-se R$ 300, capturou-se R$ 280) — o
restante não capturado precisa ser **liberado** automaticamente, nunca deixado como saldo
bloqueado indefinidamente. Toda reserva também carrega uma **expiração**: se nem capturada nem
liberada explicitamente dentro do prazo configurado, ela expira e libera o valor sozinha — sem essa
expiração, uma reserva esquecida bloquearia saldo do cliente para sempre.

## Reserva sob concorrência

A operação de criar uma reserva precisa verificar o disponível e debitá-lo **na mesma transação
atômica** — exatamente a disciplina já detalhada em `concorrencia-e-recursos/10` para o ledger em
geral, aqui aplicada especificamente à criação de uma reserva. Sem essa atomicidade, duas reservas
concorrentes podem, cada uma individualmente, verificar "há saldo suficiente" e ambas serem
criadas, somando mais do que o saldo disponível realmente permitia.

## Idempotência de reserva

Criar, capturar ou liberar uma reserva são todas operações que precisam de idempotência: a mesma
chamada de captura, repetida por retentativa de rede, não deveria capturar o valor duas vezes, nem
uma chamada de liberação repetida deveria liberar um valor já capturado por outra chamada
concorrente. O estado terminal único de uma reserva é, estruturalmente, a garantia que torna essa
idempotência possível de verificar.

## Quem consome o *hold*

Pix agendado (um valor reservado até a data de execução), autorização de cartão (o exemplo
clássico de hold com captura tardia) e débito automático são todos consumidores do mesmo mecanismo
de reserva — cada um com suas próprias regras de prazo e captura, mas todos construídos sobre a
mesma primitiva contábil: reduzir o disponível sem comprometer o contábil até a resolução final.

## O duplo gasto e o saldo disponível

O cenário que todo o marco existe para prevenir: sem reservas, nada impediria que o mesmo saldo
disponível fosse prometido a duas operações diferentes simultaneamente — uma autorização de cartão
e, ao mesmo tempo, uma transferência Pix, cada uma vendo "saldo suficiente" porque nenhuma delas
sabia da outra. A reserva torna esse compartilhamento visível e contabilizado, eliminando a
possibilidade de duplo gasto por desconhecimento mútuo entre operações concorrentes.

## Observabilidade das reservas

Medir quantas reservas estão ativas, por quanto tempo, e a taxa de expiração **versus** captura
explícita revela padrões operacionais importantes — uma taxa alta de expiração pode indicar
captura mal implementada em algum consumidor do *hold*, não apenas comportamento esperado do
cliente, o mesmo tipo de sinal de negócio que `observabilidade/08` já trata de forma geral.

## Exemplo numa fintech

Um cartão autoriza R$ 300 para uma reserva de hotel; o cliente consome parte do limite durante a
estadia; a captura final, de R$ 280, chega três dias depois — e o restante (R$ 20) é liberado
automaticamente no momento da captura parcial, nunca ficando bloqueado sem motivo depois que a
transação real já se resolveu.

## Hands-on

**Tutorial.** Implemente a tabela de reservas e a API de reservar, capturar e liberar.

**Desafio.** Implemente expiração por tempo e captura parcial com liberação automática do
excedente.

**Invariantes testáveis**

1. **Disponível = contábil − Σ reservas ativas**, verificado em todo instante observado durante a
   simulação.
2. Sob **1000 reservas concorrentes** disputando um saldo limitado, a soma reservada **nunca**
   excede o disponível inicial (asserção rígida sobre a versão com verificação atômica); a versão
   sem essa verificação **demonstra** o excesso (contagem explícita).
3. Uma reserva tem **um único** estado terminal (capturada, liberada ou expirada), mesmo com
   chamadas de captura e liberação repetidas e concorrentes sobre a mesma reserva.
4. Com relógio falso avançado além do prazo configurado, uma reserva não resolvida **expira** e
   libera o valor automaticamente.
5. Uma captura parcial libera **automaticamente** o restante não capturado — testado verificando
   que disponível e contábil refletem corretamente os dois efeitos (captura parcial + liberação do
   excedente) na mesma operação.

**Complemento.** Projete, por escrito, a regra de captura quando o valor capturado excede o valor
originalmente autorizado — o que deveria acontecer, e por quê.

**Checagem**

1. Por que uma reserva reduz o disponível sem gerar um lançamento contábil final imediatamente?
2. O que garante que duas reservas concorrentes, sobre o mesmo saldo limitado, nunca somem mais do
   que o disponível realmente permitia?
3. Por que uma reserva precisa de expiração automática, em vez de depender só de captura ou
   liberação explícitas?
4. Por que o estado terminal único de uma reserva é o que torna a idempotência de captura e
   liberação possível de verificar?

> **Reencontro — `concorrencia-e-recursos/10`.** A disciplina de verificar e escrever na mesma
> transação atômica, já formalizada naquele marco para o ledger em geral, é exatamente o mecanismo
> que impede a corrida de reservas concorrentes deste marco de ultrapassar o saldo disponível.

O caso de ponta a ponta do Pix em `system-design/09` já tratou de resultado desconhecido e estados
terminais em geral — uma reserva não capturada nem liberada por tempo indefinido é uma instância
específica desse mesmo problema, resolvida aqui pela expiração automática. E o ciclo de duas fases
de uma reserva (reservar, depois capturar ou liberar) é o mesmo padrão de processo de longa duração
compensável já formalizado como saga em `arquitetura-eventos/09`.

## Principais aprendizados

- Uma reserva reduz o disponível sem comprometer o contábil final — ela existe especificamente
  para a janela entre autorização e liquidação.
- Reserva, captura e liberação precisam ser atômicas e idempotentes, com um único estado terminal
  por reserva.
- Uma reserva sem expiração automática bloquearia saldo do cliente indefinidamente se nunca for
  resolvida explicitamente.
- Captura parcial precisa liberar automaticamente o restante não capturado, nunca deixá-lo
  bloqueado sem necessidade.
- Sem reservas, o mesmo saldo disponível poderia ser prometido a duas operações concorrentes que
  não sabem uma da outra — o duplo gasto por desconhecimento mútuo.
