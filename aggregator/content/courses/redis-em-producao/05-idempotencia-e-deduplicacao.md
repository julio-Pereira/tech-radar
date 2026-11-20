---
id: idempotencia-e-deduplicacao
title: "Idempotência e deduplicação"
summary: "O Redis é um ótimo acelerador de idempotência e um péssimo guardião dela: a chave pode sumir por TTL, por eviction, por failover ou por restart, e cada sumiço é um pagamento duplicado. SET NX como reserva; a máquina de estados da chave e o que fazer com quem chega no meio; TTL × janela de repetição; o buraco entre o efeito e a marca; a unicidade no banco como segunda linha. Medido nos dois motores: 50 reenvios simultâneos deram um efeito, e o efeito continuou único com FLUSHALL entre as chamadas, com o processo morto entre o banco e o Redis e com o Redis fora do ar."
estimatedMinutes: 55
reviewedAt: 2026-11-20
reviewEvery: 6m
competencies: [confiabilidade, dados]
references:
  - title: "Redis — SET"
    url: https://redis.io/docs/latest/commands/set/
  - title: "IETF — The Idempotency-Key HTTP Header Field (draft)"
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
  - title: "Valkey — SET"
    url: https://valkey.io/commands/set/
---

## Acelerador, não guardião

`spring-boot/06` construiu a idempotência no lugar certo: uma tabela com restrição de unicidade na chave,
inserida **antes** do efeito, na mesma transação. Ela é correta e tem um custo. Cada reenvio vai ao banco, e o
reenvio que chega enquanto o primeiro ainda processa fica bloqueado no `INSERT`, segurando uma conexão.

O Redis entra na frente disso como **acelerador**. Ele responde o reenvio de uma operação concluída sem tocar
no banco e segura quem chega no meio sem prender conexão. Ele não entra como **guardião**, porque a chave dele
pode sumir de quatro jeitos:

- **TTL:** a chave expira antes de o cliente parar de reenviar;
- ***eviction*:** a instância chega no `maxmemory` e descarta a chave (marco 09);
- ***failover*:** a réplica promovida não tinha recebido as últimas escritas (marco 10);
- ***restart*:** a instância volta sem persistência, ou com a perda da janela do AOF (marco 09).

Cada sumiço, se o Redis for o único guardião, é um pagamento duplicado. A regra do `fin-kv` é a da
`dados-distribuidos/09` aplicada aqui: **o Redis é a camada rápida, e o banco é a verdade**.

## SET NX como reserva

A reserva é um comando só: `SET pix:idem:<chave> EM_PROCESSAMENTO NX PX 30000` (O(1)). O `NX` grava só se a
chave não existe e devolve se gravou. Entre duas requisições simultâneas com a mesma chave, exatamente uma
recebe "gravei", porque o comando é atômico (marco 01). O `PX` dá um prazo à reserva.

A chave passa por uma **máquina de estados**:

| Estado | Valor | TTL | Quem encontra a chave nesse estado |
| --- | --- | --- | --- |
| ausente | — | — | reserva com `SET NX` e executa |
| em processamento | `EM_PROCESSAMENTO` | curto (o *lease* da reserva) | espera, limitado, e depois recebe o que o contrato diz |
| concluído | `CONCLUIDO:<resposta>` | ≥ janela de repetição | recebe a resposta gravada, sem efeito |

Os dois TTLs são diferentes de propósito. A reserva tem prazo curto: se o dono morrer no meio, ela expira e
outro pode tentar, com o banco decidindo se o efeito já aconteceu. A resposta concluída dura pelo menos a
janela em que o cliente pode reenviar.

## Quem chega no meio

A requisição que encontra `EM_PROCESSAMENTO` não pode executar, porque seria o segundo efeito. Ela também não
pode responder "sucesso", porque ainda não existe resposta. O contrato da API decide entre duas saídas, e o
`fin-kv` escreve a escolha num arquivo que o teste lê (`contratos/pix-iniciacao.json`):

- **espera limitada:** a requisição consulta a chave a cada poucos milissegundos, até um teto, e devolve a
  resposta assim que ela aparece;
- **409 Conflict:** passou do teto, a requisição devolve 409, e o cliente reenvia mais tarde.

O `fin-kv` faz as duas: espera até 1 s e, depois disso, devolve 409. No laboratório, os 50 reenvios
simultâneos de uma mesma chave produziram um efeito e 50 respostas idênticas: uma do efeito e 49 lidas do Redis
depois da espera. Uma chave presa em `EM_PROCESSAMENTO` por um dono lento deu 409 depois de 1 s, sem efeito.

## TTL, janela de repetição e janela regulatória

Três prazos diferentes, e o primeiro tem de cobrir o segundo:

- a **janela de repetição** do contrato: por quanto tempo o cliente pode reenviar com a mesma chave. No
  `fin-kv`, 24 horas;
- o **TTL da resposta concluída** no Redis, que tem de ser **maior ou igual** à janela. O `fin-kv` usa 25 horas, e
  um teste lê o contrato e o código e falha se o TTL ficar menor;
- a **janela regulatória:** por quanto tempo a operação precisa ser rastreável. Essa não é do Redis. É do banco,
  pelo identificador fim a fim do Pix de `pagamentos-e-liquidacao/02`.

Um TTL menor que a janela é um buraco silencioso. O reenvio da 23ª hora com TTL de 12 horas encontra a chave
ausente e, sem o banco, executa de novo.

## O buraco entre o efeito e a marca

O efeito acontece no banco e no mundo (a chamada ao SPI). A marca `CONCLUIDO` acontece no Redis. São dois
sistemas, e o processo pode morrer entre eles. Quando isso acontece, a reserva fica `EM_PROCESSAMENTO` até
expirar, e o reenvio seguinte encontra a chave ausente.

É por isso que o banco é a **segunda linha de defesa**, e não um detalhe. A sequência do `fin-kv`:

1. `SET NX` no Redis. Se não reservou, segue a máquina de estados.
2. Se reservou, **ou se o Redis falhou**, abre a transação no banco e insere a chave na tabela com restrição de
   unicidade, **antes** do efeito, como em `spring-boot/06`. Uma segunda transação com a mesma chave fica
   bloqueada nesse `INSERT` e falha com `unique_violation` quando a primeira confirma.
3. Executa o efeito, grava a resposta na mesma linha e confirma.
4. Grava `CONCLUIDO:<resposta>` no Redis. Uma falha aqui não é erro: o banco já protege.

Se o `INSERT` falha por unicidade, o efeito já aconteceu. A requisição lê a resposta do banco, regrava o Redis
e devolve a mesma resposta.

> **Armadilha.** Usar só o Redis como *store* de idempotência de pagamento e descobrir, no primeiro
> *failover*, que a réplica promovida não tinha as últimas chaves. Os reenvios dos TPPs que estavam no meio
> da janela encontram as chaves ausentes e executam de novo. Ninguém vê em teste, porque o teste não derruba
> o primário. O marco 10 mede quantas escritas confirmadas o *failover* perde.

## Deduplicação de eventos

O mesmo raciocínio vale para eventos. O consumidor que recebe a mesma mensagem duas vezes (*at-least-once*,
`arquitetura-eventos/08`) pode marcar no Redis "já processei o evento X" para descartar a repetição rápido.
Isso é uma otimização. O **inbox** de `arquitetura-eventos/08` continua sendo a garantia: a inserção do id do
evento e o efeito de negócio na mesma transação do banco. Um `SET NX` no Redis antes do processamento tem o
mesmo buraco entre a marca e o efeito.

## Exemplo numa fintech

O `pix-gateway` recebe iniciações de pagamento de TPPs do Open Finance com `Idempotency-Key`. Um TPP mandou uma
iniciação, a chamada ao SPI demorou, e o TPP deu *timeout* aos 10 s e reenviou com a mesma chave. Entre as duas
chamadas, a instância Redis reiniciou por uma atualização do serviço gerenciado e voltou vazia.

Com o Redis como guardião, o segundo `SET NX` teria reservado a chave de novo, e o pagamento sairia duas vezes.
Com o banco como segunda linha, o segundo `INSERT` falhou por unicidade, e o `pix-gateway` devolveu a resposta
da primeira chamada.

O laboratório reproduziu os quatro cenários, nos dois motores:

| Cenário | Efeitos | Quem respondeu o reenvio |
| --- | --- | --- |
| 50 reenvios simultâneos | 1 | o efeito (1) e o Redis (49) |
| `FLUSHALL` entre a primeira e a segunda chamada | 1 | o banco |
| processo morto entre o *commit* e a marca no Redis | 1 | o banco, quando a reserva expirou |
| Redis fora do ar, 20 chamadas simultâneas | 1 | o banco (a unicidade serializou as 20) |

O contraexemplo também foi medido: o mesmo roteiro com `FLUSHALL`, sem a tabela no banco, aplicou 2 efeitos.

## Hands-on

**Tutorial.** Escreva o filtro de idempotência no `pix-gateway` (Java) e no `ledger-core` (Go), sobre o Redis
e o Postgres do laboratório (`lab/standalone.sh`, que agora sobe também o `postgres:17-alpine` fixado por
*digest*):

```go
reservou, err := rdb.SetNX(ctx, "pix:idem:"+chave, "EM_PROCESSAMENTO", 2*time.Second).Result()
if err == nil && !reservou {
    return f.esperar(ctx, chave) // espera limitada; depois, 409
}
// reservou, ou o Redis falhou: o banco decide
tx, _ := db.Begin(ctx)
_, err = tx.Exec(ctx, `INSERT INTO iniciacao_pix (idempotency_key, resposta) VALUES ($1, '')`, chave)
// 23505 (unique_violation): o efeito já aconteceu → devolve a resposta gravada
```

```java
Boolean reservou = template.opsForValue()
        .setIfAbsent("pix:idem:" + chave, "EM_PROCESSAMENTO", Duration.ofSeconds(2));
if (Boolean.FALSE.equals(reservou)) return esperar(chave); // espera limitada; depois, 409
// reservou, ou o Redis falhou: INSERT da chave antes do efeito, na mesma transação
```

**Desafio.** Idempotência que sobrevive à perda do Redis: o mesmo efeito único com o Redis presente, vazio e fora
do ar.

**Invariantes testáveis**

Todos rodam contra o Redis **e** o Valkey, em Java e em Go.

1. 50 reenvios concorrentes da mesma chave produzem um efeito e 50 respostas idênticas.
2. A requisição que chega com a chave em `EM_PROCESSAMENTO` recebe a resposta definida no contrato (espera
   limitada, depois 409), nunca um segundo efeito.
3. Com `FLUSHALL` entre a primeira e a segunda chamada, o efeito continua único. É a prova de que a defesa no
   banco funciona.
4. A falha do processo entre o efeito no banco e a marca no Redis não gera duplicata no reenvio. A falha é
   injetada.
5. O TTL da chave concluída é maior ou igual à janela de repetição declarada no contrato da API. O teste lê os
   dois.

**Complemento.** Mova a chamada ao SPI para **antes** do `INSERT` e rode o cenário com o Redis fora do ar.
Quantas chamadas ao SPI acontecem para 20 requisições? O que isso diz sobre a ordem dos passos de
`spring-boot/06`?

**Checagem**

1. Por que duas requisições simultâneas com `SET NX` nunca reservam as duas, e o que o `NX` não protege?
2. O que o filtro faz com a requisição que encontra a chave em `EM_PROCESSAMENTO`, e por que ela não pode
   executar nem responder sucesso?
3. Qual prazo o TTL da chave concluída tem de cobrir, e qual prazo não é responsabilidade do Redis?
4. Cite os quatro jeitos de a chave sumir do Redis, e diga o que segura a idempotência em cada um.

> **Reencontro — `spring-boot/06`; `arquitetura-eventos/08`; `dados-distribuidos/10`;
> `pagamentos-e-liquidacao/02`.** A tabela com unicidade inserida antes do efeito é a de `spring-boot/06`, e
> continua sendo a garantia: o Redis só a poupa. A mesma divisão vale para o inbox de
> `arquitetura-eventos/08`. A unicidade no banco é o mecanismo de `dados-distribuidos/10` para "não pode haver
> dois". E a rastreabilidade regulatória fica com o identificador fim a fim de `pagamentos-e-liquidacao/02`,
> que nunca expira.

## Principais aprendizados

- O Redis acelera a idempotência e não a garante. TTL, *eviction*, *failover* e *restart* apagam a chave, e cada
  apagão sem segunda linha é um pagamento duplicado.
- `SET NX PX` reserva atomicamente. A chave passa de ausente a `EM_PROCESSAMENTO` (prazo curto) a `CONCLUIDO`
  (prazo ≥ janela de repetição).
- Quem chega no meio espera um tempo limitado e depois recebe o que o contrato diz. Nunca executa.
- A chave entra no banco antes do efeito, na mesma transação. O Redis fora do ar, vazio ou atrasado não muda o
  resultado: um efeito.
- O TTL cobre a janela de repetição, e a janela regulatória é do banco.
- A deduplicação de eventos no Redis é otimização. O inbox no banco é a garantia.
