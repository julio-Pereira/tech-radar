---
id: semantica-de-entrega
title: "Semântica de entrega e transações"
summary: "O que exactly-once realmente garante, onde a garantia termina, e por que o side-effect externo continua exigindo consumidor idempotente."
estimatedMinutes: 55
references:
  - title: "Apache Kafka — Transactions"
    url: https://kafka.apache.org/documentation/#semantics
  - title: "Spring for Apache Kafka — Transactions"
    url: https://docs.spring.io/spring-kafka/reference/kafka/transactions.html
  - title: "KIP-98: Exactly Once Delivery and Transactional Messaging"
    url: https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging
---

## As três semânticas

- **At-most-once** — cada mensagem é entregue zero ou uma vez. Nunca duplica, pode
  perder. É o commit antes do processamento (marco 04). Aceitável para telemetria.
- **At-least-once** — cada mensagem é entregue uma ou mais vezes. Nunca perde, pode
  duplicar. É o commit depois do processamento. **É o que uma fintech usa.**
- **Exactly-once** — cada mensagem tem efeito exatamente uma vez.

A terceira é a que vende licença de software, e é onde mora a confusão que este marco
existe para desfazer.

Num sistema distribuído, "entregar exatamente uma vez" é impossível no caso geral: o
produtor que não recebe o ack não consegue distinguir "a mensagem não chegou" de "a
mensagem chegou e o ack se perdeu". A única saída é reenviar e **deduplicar do outro
lado**. Exactly-once, portanto, nunca é uma propriedade da entrega — é sempre uma
propriedade do **efeito**, construída com dedupe em algum lugar.

A pergunta certa não é *"tem exactly-once?"*, é *"onde está o dedupe e o que ele
cobre?"*.

## O que o Kafka realmente entrega

O EOS (*exactly-once semantics*) do Kafka é real, e o escopo dele é preciso: o padrão
**consume-process-produce** dentro do Kafka.

Três peças o compõem, e vale separá-las porque resolvem coisas diferentes:

1. **Producer idempotente** (marco 03) — elimina duplicata gerada pelo *retry interno*
   do producer. Escopo: uma sessão de producer, uma partição.
2. **Producer transacional** — `transactional.id`, `beginTransaction()` /
   `commitTransaction()`. Escreve em **várias partições e tópicos atomicamente**, e — a
   peça que amarra tudo — permite commitar o **offset do consumidor dentro da mesma
   transação** (`sendOffsetsToTransaction`).
3. **`isolation.level=read_committed`** no consumidor a jusante — ele só enxerga
   mensagens de transações commitadas. Sem isso, o consumidor lê mensagens abortadas e a
   garantia inteira evapora. É a config que mais gente esquece.

Com as três, o ciclo "li do tópico A, transformei, escrevi no tópico B, marquei A como
lido" é atômico. Ou tudo acontece, ou nada.

Como funciona por baixo: o broker escreve **marcadores de controle** (commit/abort) no
log. O `read_committed` lê até o **LSO** (*last stable offset*) — o offset da transação
em aberto mais antiga. Uma transação pendurada por 10 minutos **bloqueia a leitura**
daquela partição para todos os consumidores `read_committed`, mesmo das mensagens já
commitadas depois dela. Esse é o modo de falha mais desagradável do EOS, e ele aparece
como "lag alto sem causa" (`transaction.timeout.ms` é o botão).

## A verdade desconfortável

**EOS vale dentro do Kafka. O side-effect externo está fora dele.**

```
consumir  →  chamar o PSP (cobrar cartão)  →  produzir resultado  →  commit
                        ↑
              isto não faz parte da transação
```

Se o processo morre depois de cobrar o cartão e antes do commit, o Kafka faz seu
trabalho perfeitamente: aborta a transação, ninguém vê o evento de resultado, o offset
não avança. E o cartão **continua cobrado**. No replay, cobra de novo.

A transação do Kafka não tem como desfazer uma chamada HTTP, uma escrita em banco fora
dela, um e-mail. Toda vez que o processamento tem efeito fora do Kafka — e numa fintech
ele quase sempre tem — a garantia real é a que **você** construir.

Corolário prático: EOS raramente vale a pena numa aplicação de fintech típica. Ele
custa latência e complexidade operacional para resolver um problema que você vai ter
que resolver de novo, com idempotência, por causa do side-effect. Ele brilha em
pipelines **puramente internos** ao Kafka — que é exatamente o caso do Kafka Streams
(marco 09), onde é uma linha de configuração e cobre tudo.

## A garantia que sempre funciona: idempotência no consumidor

A única defesa sólida contra reprocessamento é o consumidor conseguir dizer *"isso eu
já fiz"*. Três formas, em ordem de robustez:

**1. Chave natural com constraint única.** A melhor, quando existe: o `paymentId` é
chave primária da tabela de pagamentos, e a segunda inserção falha por violação de
constraint. O banco garante, não o seu código.

```sql
INSERT INTO pagamentos (payment_id, conta, valor_centavos, status)
VALUES (?, ?, ?, 'PROCESSADO')
ON CONFLICT (payment_id) DO NOTHING;
-- linhas afetadas = 0  →  já processado, siga em frente
```

**2. Tabela de deduplicação.** Quando o efeito não é uma linha (mandar e-mail, chamar
PSP): uma tabela `eventos_processados(event_id PK, processado_em)`, escrita **na mesma
transação** do efeito. Precisa de política de expurgo, e o TTL tem que ser maior que a
retenção do tópico — senão um replay antigo passa direto.

**3. Idempotência no destino.** Melhor de todas quando disponível: o PSP aceita um
`Idempotency-Key` e devolve o resultado original na repetição. Aí o dedupe mora do lado
de quem tem a verdade. É a ponte direta com o marco de idempotência da trilha Spring
Boot — o `pix-gateway` é, para você, esse destino idempotente.

A armadilha das três: a **janela** entre o efeito e o registro do dedupe. Se você
cobra o cartão e depois grava "processado" em outra transação, o crash no meio traz o
problema de volta. Efeito e marca de dedupe precisam ser atômicos entre si — o que é
fácil quando os dois são o mesmo banco, e é exatamente o problema do **outbox** quando
não são (marco 08).

## Exemplo numa fintech

O débito não pode acontecer duas vezes. Não existe "provavelmente não vai duplicar":
duplicar débito é incidente com cliente, com ouvidoria e, dependendo do volume, com o
regulador.

O desenho do `pix-stream`:

- O consumidor de `payments.authorized` é **at-least-once** com commit manual.
- O efeito (lançamento no ledger) é uma escrita idempotente por `paymentId`, com
  constraint única.
- **Não** usamos transação do Kafka nesse caminho: ela custaria latência sem eliminar a
  necessidade da constraint.
- Usamos EOS no Streams do marco 09, onde tudo é interno ao Kafka e a garantia é
  completa.

Escrever essa decisão numa ADR de 15 linhas — *"por que não usamos exactly-once"* — é
um exercício melhor do que implementá-la.

## Hands-on

**Tutorial — o fluxo transacional.** Implemente consume-process-produce com transação:
consuma `payments.initiated`, transforme, produza em `payments.authorized` e commite o
offset **dentro** da transação. Depois:

1. Suba um consumidor de `payments.authorized` com `isolation.level=read_uncommitted` e
   outro com `read_committed`.
2. Force um `abortTransaction()` no meio.
3. Observe: o primeiro consumidor **vê** a mensagem abortada, o segundo não. Essa
   diferença é o marco inteiro.
4. Deixe uma transação aberta sem commitar e observe o lag do `read_committed` travar
   (o LSO). `git commit`.

**Desafio — provar a duplicidade e depois eliminá-la.** Em duas partes, e a primeira é
obrigatória:

*Parte 1 — provar que existe.* Consumidor ingênuo at-least-once que insere em
`pagamentos` sem constraint. Produza 5.000 eventos distintos, mate o processo com
`kill -9` três vezes durante o consumo. Rode:

```sql
SELECT count(*), count(DISTINCT payment_id) FROM pagamentos;
```

Os dois números **têm** que divergir. Anote a diferença — é o dinheiro debitado duas
vezes.

*Parte 2 — eliminar.* Adicione a constraint única e o `ON CONFLICT DO NOTHING`. Repita o
teste, mesmos 5.000 eventos, mesmos `kill -9`.

**Invariante testável:** `count(*) = count(DISTINCT payment_id) = 5000`. Sem transação
do Kafka em lugar nenhum — é a demonstração de que a constraint resolve o que a
transação não resolveria sozinha.

**Checagem.** (a) Você habilitou EOS e o consumidor a jusante continua vendo
duplicatas — qual config faltou? (b) O processo morre entre cobrar o PSP e commitar a
transação: o que o Kafka faz e o que o cartão faz? (c) Por que o TTL da tabela de dedupe
precisa ser maior que a retenção do tópico? (d) Quando EOS vale claramente a pena?

## Principais aprendizados

- Exactly-once nunca é propriedade da entrega, é propriedade do efeito: a pergunta é
  onde está o dedupe e o que ele cobre.
- O EOS do Kafka cobre consume-process-produce **dentro** do Kafka e exige
  `read_committed` a jusante — sem ele, não há garantia nenhuma.
- Side-effect externo está fora da transação: a única defesa é consumidor idempotente,
  e o efeito precisa ser atômico com a marca de dedupe.
- Transação pendurada trava a leitura da partição via LSO — o "lag alto sem causa".
