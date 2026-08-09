---
id: padroes-de-integracao
title: "Padrões de integração: outbox, CDC, saga e DLQ"
summary: "O problema do dual-write e as quatro respostas: outbox transacional, CDC, compensação por saga, e o retry escalonado que não vira retry infinito."
estimatedMinutes: 55
references:
  - title: "microservices.io — Transactional Outbox"
    url: https://microservices.io/patterns/data/transactional-outbox.html
  - title: "Debezium Documentation"
    url: https://debezium.io/documentation/
  - title: "microservices.io — Saga"
    url: https://microservices.io/patterns/data/saga.html
---

## O problema: dual-write

O código mais inocente da fintech:

```java
@Transactional
public void iniciarPagamento(Pagamento p) {
    repository.save(p);                                  // banco
    kafkaTemplate.send("payments.initiated", p.id(), p); // broker
}
```

Duas escritas, dois sistemas, **nenhuma atomicidade**. O `@Transactional` cobre o banco;
o Kafka não participa dele. Três desfechos possíveis, e dois são ruins:

1. Os dois funcionam. É o caso feliz, e é o que você vê em desenvolvimento.
2. O banco commita, o Kafka falha → **o pagamento existe e ninguém foi notificado**. O
   antifraude não analisou, o ledger não lançou. Silêncio.
3. O Kafka aceita, o banco faz rollback → **evento de um pagamento que não existe**. O
   ledger lança um débito sem lastro.

E não adianta inverter a ordem, nem usar XA/2PC (que o Kafka não suporta, e que você não
quer no caminho de um pagamento de qualquer forma). O problema é estrutural: **você não
pode commitar atomicamente em dois sistemas diferentes.**

A saída é sempre a mesma ideia — escrever em **um** sistema, e derivar o outro dele.

## Transactional Outbox

Grave o evento **numa tabela do mesmo banco**, na mesma transação do estado de negócio:

```sql
BEGIN;
  INSERT INTO pagamentos (id, conta, valor_centavos, status) VALUES (...);
  INSERT INTO outbox (id, aggregate_id, topic, payload, created_at)
    VALUES (gen_random_uuid(), ?, 'payments.initiated', ?, now());
COMMIT;
```

Uma transação, um sistema, atômica de verdade. Depois um **relay** lê a outbox e publica
no Kafka, marcando o que já publicou.

O relay é at-least-once por natureza: ele pode publicar e morrer antes de marcar. Isso
não é defeito — é a razão de o consumidor ser idempotente (marco 05). O outbox garante
que o evento **não se perde**; a idempotência garante que ele não tenha efeito duplicado.
As duas peças juntas é que fecham o problema.

Dois detalhes que decidem se funciona em produção:

- **Ordem.** Se o relay publica com `accountId` como chave e processa a outbox por
  ordem de inserção, a ordem por conta se preserva. Um relay com várias threads sem
  cuidado quebra exatamente a garantia do marco 06.
- **Expurgo.** A tabela outbox cresce para sempre se ninguém a limpar. Delete o
  publicado depois de N dias — e não antes, porque ela é a sua evidência de que o evento
  foi emitido.

É o mesmo padrão que aparece nas trilhas Spring Boot e Go; aqui você o vê do lado do
broker, que é onde as consequências (ordem e idempotência) aparecem.

## CDC com Debezium

A alternativa: em vez de o seu código escrever a outbox, um conector lê o **log de
replicação** do banco (WAL do Postgres, binlog do MySQL) e publica cada mudança de
linha como evento. Zero código na aplicação.

O que ganha: nenhuma mudança no código, captura tudo (inclusive o `UPDATE` que alguém
fez à mão), e o log de replicação já é a ordem real das transações.

O que custa, e é o ponto que decide:

- **Acoplamento ao schema do banco.** O evento passa a ser o formato da sua tabela.
  Renomear uma coluna vira mudança de contrato público (marco 07). Sua modelagem interna
  vazou para fora.
- **Operação.** Slot de replicação que não avança **enche o disco do banco** de
  produção. É o modo de falha característico do CDC, e ele derruba o banco, não o
  conector.

O meio-termo prático — e o mais usado hoje — é **CDC lendo a tabela outbox**: a
aplicação escreve a outbox (contrato explícito, seu), e o Debezium a publica (sem relay
para você operar). É o *Outbox Event Router* do Debezium, e junta o melhor dos dois.

## Saga: consistência sem transação distribuída

Um fluxo que atravessa serviços não tem transação. A saga o divide em passos locais,
cada um com sua **compensação**:

```
reservar saldo  →  autorizar no PSP  →  lançar no ledger
      ↓ falhou          ↓ falhou
liberar reserva ←  liberar reserva
```

**Coreografia** — cada serviço reage a eventos e emite o próximo. Simples com 3 passos,
ilegível com 8: ninguém consegue responder "onde está esse pagamento agora?" sem ler o
código de cinco serviços.

**Orquestração** — um orquestrador mantém a máquina de estados e manda comandos. Mais
peça para operar, e você ganha a resposta que a coreografia não dá: o estado do fluxo é
uma linha numa tabela.

Regra prática: coreografia até uns 3–4 passos, orquestração acima disso, ou quando o
fluxo precisa ser consultável pelo atendimento ao cliente.

Duas coisas que numa fintech não são detalhe:

- **Compensação não é rollback.** O estorno é uma **nova transação**, com data própria,
  visível no extrato do cliente. Ele não apaga o débito — e o cliente vai ligar
  perguntando pelos dois lançamentos. Isso é modelagem contábil, não engenharia.
- **Timeout de saga.** Todo passo precisa de prazo. Sem isso, uma saga fica pendurada
  para sempre com o saldo reservado do cliente — dinheiro travado que ninguém percebe.
  Um job que varre sagas expiradas é obrigatório, não opcional.

## Retry, DLQ e a regra que evita o desastre

Falha acontece. O que separa um sistema saudável de uma tempestade é **como** se tenta
de novo.

**Retry escalonado com tópicos separados** é o padrão: em vez de bloquear o consumidor
principal esperando, mande a mensagem para um tópico de retry com atraso crescente.

```
payments.authorized  →  falhou  →  retry.5s  →  retry.1m  →  retry.10m  →  DLQ
```

Cada tópico de retry tem seu consumidor, que espera o atraso e reprocessa. O consumidor
principal **nunca bloqueia** — que é o ponto inteiro, porque bloquear estoura o
`max.poll.interval.ms` (marco 04) e provoca rebalance no meio de um incidente.

**A regra que não se negocia: retry só em operação idempotente.** Retentar um débito
não idempotente é multiplicar o problema por 3. Se você não sabe se o efeito aconteceu
(timeout de rede é exatamente isso), retry sem idempotência é a decisão de,
possivelmente, cobrar de novo.

E distinga os erros, porque tratá-los igual é o erro comum:

- **Transitório** (broker fora, timeout, 503 do PSP) → retry faz sentido.
- **Permanente** (payload inválido, schema incompatível, conta inexistente) → retry
  nunca vai funcionar. Vá **direto** para a DLQ; não gaste 3 tentativas.

A **poison pill** é a mensagem que sempre falha. Sem DLQ, ela trava a partição para
sempre — o consumidor tenta, falha, não commita, tenta de novo, e as mensagens atrás
dela nunca são processadas. Lag crescente numa partição, com o consumidor "vivo" e
consumindo 100% de CPU, é a assinatura disso.

**Alarme no DLQ é incidente, não estatística.** Uma mensagem na DLQ é um pagamento que
não aconteceu. O dashboard de DLQ com 4.000 mensagens acumuladas há três meses, que
ninguém olha, é uma das piores coisas que se encontra numa fintech — e é comum. A DLQ
precisa de dono, de alerta na primeira mensagem e de um caminho de reprocessamento
testado.

## Exemplo numa fintech

**Webhook de PSP reenviado 3×.** O parceiro não recebeu o seu `200` a tempo e reenvia a
confirmação. Se o handler publica em `payments.authorized` sem dedupe, o ledger lança
três vezes. A defesa é a mesma da trilha inteira: dedupe pela chave do parceiro
(`providerEventId`) na borda, com constraint única, **antes** de virar evento.

**Pagamento que falha no antifraude e precisa compensar.** O saldo já foi reservado. A
compensação emite `payments.reversed`, o ledger lança o crédito de volta, e o cliente vê
**dois** lançamentos no extrato — a reserva e o estorno. Tentar esconder isso
"cancelando" o primeiro lançamento é o que quebra a conciliação contábil: em
contabilidade double-entry (trilha `go-fintech`), lançamento não se apaga.

## Hands-on

**Tutorial — outbox relay do `pix-gateway`.** Implemente:

1. Tabela `outbox` e a escrita atômica junto com `pagamentos`.
2. Um relay que lê a outbox em ordem, publica com chave `accountId` e marca como
   publicado.
3. **Prove o dual-write primeiro:** com a versão ingênua (`save` + `send`), mate o
   processo entre as duas operações e mostre a inconsistência. Depois mostre que a versão
   com outbox não tem esse estado possível.
4. Prove que matar o relay entre publicar e marcar gera evento duplicado — e que o
   consumidor idempotente do marco 05 absorve. `git commit`.

**Desafio — retry escalonado + DLQ.** Monte a cadeia `retry.5s` → `retry.1m` →
`retry.10m` → `payments.dlq` para o consumidor do ledger.

**Invariantes testáveis:**

1. **Erro transitório** (o consumidor falha nas 2 primeiras tentativas e funciona na
   3ª): a mensagem é processada com sucesso e **não** chega na DLQ. Meça o tempo total
   e confira que bate com o escalonamento.
2. **Erro permanente** (payload inválido): vai **direto** para a DLQ, sem passar pelos
   tópicos de retry. Zero mensagens nos tópicos intermediários.
3. **Poison pill**: injete uma mensagem que sempre falha no meio de 1.000 boas. Ao final,
   `count(processadas) = 999` e `count(dlq) = 1`. **O critério é que as 999 tenham sido
   processadas** — se o consumidor travou, você reproduziu o bug em vez de corrigi-lo.
4. **Reprocessamento controlado**: uma ferramenta que relê a DLQ, republica no tópico
   original e prova, pela contagem, que nada duplicou.

**Checagem.** (a) Por que inverter a ordem (`send` antes de `save`) não resolve o
dual-write? (b) Qual é o modo de falha do CDC que derruba o **banco**? (c) Por que
retry no próprio consumidor, com `Thread.sleep`, provoca rebalance? (d) DLQ com 4.000
mensagens de três meses — o que isso diz sobre o time?

## Principais aprendizados

- Dual-write não tem solução atômica: escreva em um sistema e derive o outro — outbox
  ou CDC.
- Outbox garante que o evento não se perde; a idempotência do consumidor garante que
  ele não duplique. As duas peças são necessárias.
- Compensação é lançamento novo, não rollback — e toda saga precisa de timeout, senão
  o saldo do cliente fica travado.
- Retry escalonado em tópicos separados nunca bloqueia o consumidor; retry só em
  operação idempotente; erro permanente vai direto para a DLQ, e DLQ é incidente.
