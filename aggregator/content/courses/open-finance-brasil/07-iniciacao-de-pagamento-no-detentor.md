---
id: iniciacao-de-pagamento-no-detentor
title: "Iniciação de pagamento no detentor"
summary: "Iniciar um pagamento é o único caso em que o consentimento move dinheiro — por isso ele é de uso único, vinculado ao valor e ao destino, e o resultado precisa ser inequívoco."
estimatedMinutes: 65
references:
  - title: "Banco Central do Brasil — Open Finance"
    url: https://www.bcb.gov.br/estabilidadefinanceira/openfinance
---

## O consentimento de pagamento, revisitado

O marco 04 já diferenciou consentimento de dados e de pagamento; aqui o consentimento de
**pagamento** ganha seus detalhes completos: ele especifica **valor**, **recebedor** e **conta de
débito** de forma exata, tem **validade curta**, e — a propriedade mais importante — é de **uso
único**. Depois de consumido numa iniciação, o mesmo consentimento nunca autoriza uma segunda
movimentação, mesmo que a primeira tenha, por algum motivo, falhado.

## Autenticação forte do cliente

Iniciar um pagamento exige **autenticação forte** do cliente — uma confirmação ativa de que é
realmente ele autorizando aquele movimento específico de dinheiro, não apenas a sessão genérica
que autorizou o consentimento de dados. A jornada pode variar (com ou sem redirecionamento —
**conferir** o que está vigente), mas a exigência de autenticação forte especificamente para
pagamento, mais rigorosa que para consulta de dados, é constante.

## Vinculação: valor e recebedor não mudam entre etapas

Entre o momento em que o consentimento de pagamento é criado e o momento em que a iniciação de
fato ocorre, existem etapas intermediárias (autenticação, confirmação) — e o **valor** e o
**recebedor** declarados no consentimento original precisam permanecer **idênticos** em toda essa
cadeia. Qualquer tentativa de alterar valor ou recebedor entre essas etapas é, por definição, uma
operação diferente da que foi consentida, e precisa ser recusada, não silenciosamente aceita como
"uma atualização".

## Idempotência da iniciação

O TPP que inicia o pagamento carrega sua própria **chave de idempotência** — a mesma disciplina já
vista no ledger (chave natural de operação, restrição de unicidade) garante que retransmitir a
mesma requisição de iniciação, por *retry* de rede, produza **um único** pagamento, nunca dois,
mesmo sob tentativas concorrentes.

## Estados e o estado terminal único

Uma iniciação de pagamento percorre estados (criada, pendente, aceita, rejeitada, liquidada —
**conferir** os nomes exatos vigentes) até alcançar **um único estado terminal** — e esse estado
terminal precisa permanecer único mesmo que **notificações duplicadas** ou **fora de ordem**
cheguem depois que o estado final já foi alcançado. Um sistema que processa uma notificação tardia
como se fosse nova informação, revertendo um estado terminal já estabelecido, introduz exatamente
a inconsistência que este desenho existe para prevenir.

## A ligação com o Pix e o resultado desconhecido

A iniciação, no caso mais comum no contexto brasileiro, termina no **SPI** (o caso de ponta a
ponta de `system-design/09`, e detalhado como mecânica em `pagamentos-e-liquidacao`) — e o mesmo
problema de **resultado desconhecido** (o SPI não respondeu dentro do tempo esperado) se aplica
aqui, com a mesma disciplina: resolver por **consulta**, nunca assumir falha e tentar de novo às
cegas, o que arriscaria uma segunda movimentação de dinheiro para a mesma intenção original.

```diagrama
of-iniciacao
```

## Pagamento agendado, recorrente, e o uso de *hold*

Pagamento **agendado** (executar numa data futura) e **recorrente** (**conferir** as modalidades e
regras vigentes) reaparecem aqui, agora com a mecânica concreta do ledger: um pagamento agendado
**reserva** o valor (um *hold*, já formalizado em `ledger-e-contabilidade`) no momento da
aceitação, e **libera** esse hold se o agendamento for cancelado antes da execução — nunca deixando
o valor bloqueado indefinidamente sem resolução.

## Limites, antifraude e resposta assíncrona

Cada iniciação passa por verificação de **limites** (do cliente, regulatórios) e de **antifraude**
— o mesmo domínio já tratado para detecção de fraude em pagamentos em geral, aqui aplicado
especificamente à iniciação por terceiros, um canal com seu próprio perfil de risco distinto de uma
transação iniciada diretamente pelo cliente no próprio aplicativo do detentor. A resposta ao TPP
pode ser **assíncrona** (confirmação por consulta posterior, ou notificação via *webhook*) — o
design precisa considerar que a resposta síncrona imediata nem sempre é possível.

## Quando o Pix aceita mas depois falha

Um caso específico que merece tratamento deliberado: a iniciação é **aceita** inicialmente, mas o
SPI, depois, rejeita a transação por algum motivo (saldo insuficiente detectado tardiamente, chave
inválida). A regra de negócio para esse caso — o que o TPP vê, o que o cliente vê, como o estado
final é comunicado — precisa ser decidida e documentada explicitamente, não deixada como um caso
de borda não especificado.

## Exemplo numa fintech

Um TPP inicia um Pix de R$ 100 para um recebedor específico; o cliente autentica fortemente dentro
do aplicativo do seu próprio banco; o banco debita, envia ao SPI, e devolve o estado final —
aceito, liquidado, ou rejeitado. Se o TPP repetir a mesma chamada de iniciação (por exemplo, por
não ter recebido a resposta a tempo), a chave de idempotência garante que nada se duplica.

## Hands-on

**Tutorial.** Implemente o consentimento de pagamento e a iniciação idempotente, ligada a um stub
simulado de SPI.

**Desafio.** Implemente os estados terminais da iniciação e a resolução de resultado desconhecido
por consulta.

**Invariantes testáveis**

1. A **mesma chave de idempotência** enviada **N vezes concorrentes** cria **um único** pagamento,
   com N respostas idênticas entre si.
2. Um consentimento de pagamento só pode ser **usado uma vez** — a segunda tentativa de iniciação
   com o mesmo consentimento é **recusada**.
3. Alterar **valor** ou **recebedor** entre o consentimento original e a iniciação de fato é
   **recusado** — testado com uma tabela de casos que tenta cada alteração isoladamente.
4. A iniciação tem **um único estado terminal**, mesmo sob notificações **duplicadas** e **fora de
   ordem** chegando depois do estado final já ter sido alcançado.
5. Com o stub de SPI devolvendo **timeout**, o resultado é tratado como **desconhecido** e
   resolvido por **consulta** — nunca por um novo débito às cegas.
6. Um pagamento **agendado** reserva o valor (hold) no momento da aceitação, e **libera** esse hold
   corretamente se o agendamento for cancelado antes da execução.
7. **Demonstração do limite:** sem a checagem de uso único do consentimento, o mesmo consentimento
   move dinheiro **duas vezes** — reproduzido deliberadamente para evidenciar por que a checagem é
   necessária.

**Complemento.** Descreva, por escrito, a regra de negócio para o caso em que uma iniciação é
aceita inicialmente, mas o SPI a rejeita depois — o que o TPP e o cliente deveriam ver.

**Checagem**

1. Por que o consentimento de pagamento é de uso único, mesmo quando a primeira tentativa de
   iniciação falha?
2. O que impede que valor ou recebedor mudem entre o consentimento original e a iniciação de fato?
3. Por que uma notificação tardia, recebida depois que o estado terminal já foi alcançado, não
   deveria reverter esse estado?
4. Por que um pagamento agendado precisa usar um *hold* no momento da aceitação, em vez de debitar
   diretamente ou não reservar nada?

> **Reencontro — `system-design/09`.** O caso de ponta a ponta do Pix já estabeleceu, naquele
> marco, a disciplina de resultado desconhecido resolvido por consulta — este marco aplica
> exatamente essa disciplina à iniciação de pagamento por um terceiro, não pelo próprio cliente
> no aplicativo do detentor.

O outbox/inbox de `arquitetura-eventos/08` e as sagas de `arquitetura-eventos/09` sustentam, respectivamente, a
publicação confiável de eventos de estado da iniciação e o processo de longa duração com etapas
compensáveis que um pagamento agendado representa; a detecção de fraude e abuso de
`seguranca-aplicacao/14` se aplica com um perfil de risco próprio à iniciação por terceiros; e a
idempotência e outbox de `spring-boot/06` é a implementação concreta, do lado Java, do mesmo
mecanismo que garante que a iniciação nunca duplica.

## Principais aprendizados

- Consentimento de pagamento é de uso único — mesmo uma primeira tentativa falhada não o torna
  reutilizável.
- Valor e recebedor precisam permanecer idênticos entre o consentimento original e a iniciação de
  fato, em toda a cadeia de etapas intermediárias.
- Uma iniciação tem um único estado terminal, que notificações duplicadas ou fora de ordem nunca
  deveriam reverter.
- Resultado desconhecido do SPI se resolve por consulta, nunca por um novo débito às cegas.
- Pagamento agendado usa *hold* no momento da aceitação, liberado corretamente se cancelado antes
  da execução.
