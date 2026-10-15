---
id: orquestracao-de-pagamentos
title: "Orquestração de pagamentos"
summary: "Quando existem vários provedores, trilhos e regras, a orquestração é o produto: ela roteia, tenta de novo sem cobrar duas vezes e isola o seu domínio dos formatos dos outros."
estimatedMinutes: 65
references:
  - title: "Stripe — Idempotent requests (documentação de conceitos)"
    url: https://docs.stripe.com/api/idempotent_requests
---

## Orquestrador × *gateway* × PSP

Um **PSP** processa pagamentos para um trilho ou arranjo específico; um **gateway** expõe uma
interface simplificada sobre um ou mais PSPs; um **orquestrador** vai além — ele decide **qual**
provedor ou trilho usar para cada pagamento, trata retentativa entre provedores diferentes, e
mantém a máquina de estados do pagamento independente de qual provedor está, no momento, atendendo
a requisição. A fronteira entre os três nem sempre é nítida na prática, mas a responsabilidade de
decisão e de continuidade entre provedores é o que define especificamente a orquestração.

## A máquina de estados do pagamento

Cada pagamento tem seu próprio ciclo de vida — criado, roteado, em processamento, autorizado,
liquidado, falhou, ou (o caso que mais exige disciplina) resultado desconhecido num provedor
específico — e essa máquina de estados precisa ser **independente do provedor atual**: trocar de
provedor no meio do processamento de um pagamento não deveria criar um segundo pagamento, nem
perder o histórico do que já aconteceu com o primeiro.

## Roteamento: custo, aprovação, risco e disponibilidade

A decisão de **roteamento** — qual provedor usar para este pagamento específico — pondera
tipicamente custo (tarifa do provedor), taxa de aprovação histórica daquele provedor para aquele
perfil de transação, sinal de risco, e disponibilidade atual (um provedor degradado não deveria
receber tráfego novo mesmo sendo o mais barato). Modelar essa decisão como **função pura**,
testável contra uma tabela de casos, é o que torna o roteamento auditável em vez de uma lógica
implícita acumulada ao longo do tempo.

## Retentativa entre provedores e o risco de cobrança dupla

O risco central da orquestração: um provedor A responde com timeout (resultado desconhecido —
pode ou não ter cobrado), e o orquestrador precisa decidir se tenta o provedor B. A resposta
correta nunca é "tentar B imediatamente e torcer" — é **consultar ou anular** no provedor A
primeiro, resolvendo o resultado desconhecido antes de rotear para outro lugar, exatamente o
mesmo princípio de resultado desconhecido que `system-design/09` já estabeleceu para o Pix,
aplicado aqui entre múltiplos provedores diferentes.

## Idempotência ponta a ponta entre provedores

Uma chave de idempotência que vale só dentro de um provedor não é suficiente quando a retentativa
muda de provedor — o orquestrador precisa manter sua **própria** chave de idempotência, de ponta a
ponta, que sobrevive à troca de provedor. Dois pedidos do cliente com a mesma chave de idempotência
do orquestrador, mesmo que acabem roteados para provedores diferentes em tentativas sucessivas,
precisam produzir um único pagamento, não dois.

## *Webhooks*: assinatura, janela de tempo e idempotência

Um **webhook** que notifica o orquestrador sobre o resultado de um pagamento precisa de três
proteções: **assinatura** (HMAC, comprovando que o webhook realmente veio do provedor esperado),
**janela de tempo** (rejeitar webhooks fora de uma janela razoável, proteção contra *replay* de um
webhook capturado e reenviado depois), e **idempotência** na ingestão (o mesmo evento de webhook
entregue mais de uma vez — comum em entrega *at-least-once* — tem o efeito de um só). As três
proteções são independentes; faltar qualquer uma deixa uma porta aberta específica.

## A camada anticorrupção por provedor

Cada provedor tem seu próprio formato de mensagem, seus próprios códigos de erro, sua própria
semântica de estado — e deixar esses detalhes vazarem para o resto do orquestrador acopla todo o
sistema ao vocabulário de cada provedor específico. Uma **camada anticorrupção** por provedor
traduz o formato específico para o modelo de domínio único do orquestrador — o mesmo padrão que
`arquitetura-eventos/02` já estabeleceu para integração entre domínios, aqui aplicado a cada
provedor externo individualmente.

## Resiliência por provedor

Cada chamada a um provedor externo se beneficia da mesma disciplina de **timeout, *circuit
breaker* e *bulkhead*** já estabelecida em `spring-boot/08` — um provedor lento ou instável não
deveria conseguir degradar a capacidade do orquestrador de atender chamadas a outros provedores
saudáveis, nem acumular um volume crescente de chamadas pendentes esperando por um provedor que
não vai responder a tempo.

## Conciliação, custo e homologação de mudanças

A conciliação entre os relatórios de cada provedor e o estado interno do orquestrador segue a
mesma disciplina de classificação de divergência já vista no marco 05; e **custo e *lock-in***
(quanto custaria trocar de provedor, tecnicamente e contratualmente) é uma consideração de
arquitetura de solução, não só de preço por transação. Por fim, uma mudança no formato ou
comportamento de um provedor precisa de **homologação** antes de ir para produção — um catálogo de
casos de teste versionado que prova que a integração ainda funciona como esperado, não uma
suposição de que "nada vai quebrar".

## Exemplo numa fintech

O provedor A responde com um código 504 depois de, possivelmente, já ter processado a cobrança; em
vez de tentar imediatamente o provedor B, o orquestrador consulta o status da transação no próprio
provedor A (ou emite uma anulação explícita) — só depois de resolver esse resultado desconhecido é
que decide, com segurança, se roteia a tentativa para B.

## Hands-on

**Tutorial.** Implemente `orquestrador/` com dois provedores simulados e a máquina de estados do
pagamento.

**Desafio.** Implemente o roteamento com *failover* entre provedores e a ingestão de *webhooks*
com assinatura e proteção contra replay.

**Invariantes testáveis**

1. Sob falhas injetadas (timeout depois de cobrar, erro 5xx, resposta duplicada), **nunca há duas
   cobranças** para o mesmo pedido — verificado contra a verdade-base interna dos provedores
   simulados.
2. A retentativa em outro provedor só ocorre **depois** de resolver o resultado desconhecido do
   primeiro (consulta ou anulação), verificado pelo log de eventos do orquestrador simulado.
3. Cada pagamento simulado tem **um único** estado terminal, independentemente de quantos
   provedores foram tentados no processo.
4. Um *webhook* com assinatura inválida, ou entregue fora da janela de tempo configurada, é
   **rejeitado**; o mesmo evento de webhook entregue mais de uma vez tem o efeito de **um só**.
5. A decisão de **roteamento** é uma função pura (custo, taxa de aprovação, risco, disponibilidade)
   testada contra uma tabela de casos.
6. Tipos específicos de um provedor **não vazam** para fora da camada anticorrupção correspondente
   — um teste de arquitetura reprova qualquer violação.

**Complemento.** Projete, por escrito, o que mudaria no orquestrador se um dos provedores
simulados mudasse o formato do seu *webhook* de um dia para o outro.

**Checagem**

1. Por que a retentativa em outro provedor nunca deveria acontecer antes de resolver o resultado
   desconhecido do provedor original?
2. Por que uma chave de idempotência válida só dentro de um provedor não é suficiente para um
   orquestrador que pode trocar de provedor no meio do processamento?
3. Quais são as três proteções independentes que um *webhook* de pagamento precisa, e o que cada
   uma impede especificamente?
4. Por que deixar o formato específico de um provedor vazar para o resto do orquestrador é um
   problema de arquitetura, não só um detalhe de integração?

> **Reencontro — `arquitetura-eventos/08`, `/09`; `spring-boot/08`.** O outbox/inbox e a
> idempotência de `arquitetura-eventos/08` são o mecanismo que sustenta a idempotência ponta a
> ponta deste marco; as sagas de `arquitetura-eventos/09` são o padrão que a retentativa entre provedores — múltiplos
> passos compensáveis — já segue estruturalmente; e a resiliência de cliente de `spring-boot/08`
> é aplicada, aqui, a cada provedor externo individualmente.

A assinatura e verificação de *webhooks* se apoiam no mesmo uso de JOSE/JWS de
`seguranca-aplicacao/04`, e os padrões de integração assíncrona de `kafka/08` (outbox, CDC, saga,
DLQ) são o vocabulário geral que a orquestração entre provedores externos aplica de forma
específica a chamadas síncronas de pagamento.

## Principais aprendizados

- Orquestração é decidir qual provedor usar e manter continuidade quando um provedor falha — mais
  do que um gateway simplificador de API.
- Retentativa entre provedores só é segura depois de resolver o resultado desconhecido do
  provedor original, nunca antes.
- Idempotência de orquestrador precisa ser própria e de ponta a ponta, sobrevivendo à troca de
  provedor entre tentativas.
- *Webhooks* precisam de assinatura, janela de tempo e idempotência de ingestão — três proteções
  independentes.
- Uma camada anticorrupção por provedor impede que o vocabulário específico de cada integração
  vaze para o resto do sistema.
