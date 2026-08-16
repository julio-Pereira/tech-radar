---
id: outbox-inbox-idempotencia
title: "Outbox, inbox e idempotência ponta a ponta"
summary: "O lado que quase ninguém implementa: o inbox no consumidor, a diferença entre idempotência técnica e de negócio, e por que descartar por versão vence bufferizar."
estimatedMinutes: 55
references:
  - title: "Microservices.io — Transactional outbox"
    url: https://microservices.io/patterns/data/transactional-outbox.html
  - title: "Microservices.io — Idempotent consumer"
    url: https://microservices.io/patterns/communication-style/idempotent-consumer.html
  - title: "Pat Helland — Life beyond Distributed Transactions"
    url: https://queue.acm.org/detail.cfm?id=3025012
---

## Retomada em cinco linhas

Não existe commit atômico entre banco e broker: gravar o pagamento e publicar o evento são
duas operações, e qualquer falha entre elas deixa inconsistência — pagamento sem evento, ou
evento de um pagamento que não existe. O **outbox** resolve gravando o evento numa tabela,
na mesma transação do dado, e publicando depois a partir dela. A mecânica está em
`spring-boot/06` (implementação) e `kafka/08` (relay e CDC); o marco 02 mostrou de onde a
regra vem: se a mudança de estado é uma transação de agregado, o fato que a anuncia mora
dentro dela.

Isso resolve **metade** do problema. O outbox garante que o evento sai pelo menos uma vez.
"Pelo menos uma vez" é o que o resto deste marco trata.

## Inbox: a metade que falta

O broker entrega at-least-once. Logo, o mesmo evento vai chegar duas vezes ao consumidor —
não por bug, por projeto. Se o efeito do consumo for lançar no ledger, dois lançamentos.

O **inbox** é a peça simétrica ao outbox, do lado de quem consome: uma tabela de
deduplicação com o `eventId` como chave primária.

```sql
-- na MESMA transação do efeito de negócio
INSERT INTO inbox (event_id, consumer, processed_at) VALUES (?, ?, now());
-- se violar a PK, este evento já foi processado: aborta e confirma o consumo
INSERT INTO ledger_entries (...) VALUES (...);
```

O detalhe que faz funcionar: a inserção no inbox e o efeito de negócio estão na **mesma
transação**. Deduplicar num Redis antes de processar não é inbox — é uma otimização com uma
janela de falha entre a marcação e o efeito.

É essa peça que transforma at-least-once do transporte em **efeito exactly-once no negócio**.
Não existe exactly-once na entrega; existe efeito único, e ele é responsabilidade do
consumidor.

Duas decisões operacionais: o inbox cresce para sempre, então tem retenção (dias, não anos —
o suficiente para cobrir a janela de reentrega); e a chave é `(eventId, consumer)`, porque
dois consumidores diferentes devem processar o mesmo evento.

## Técnica × negócio: dois problemas diferentes

Este é o ponto do marco que mais gera confusão em revisão de arquitetura.

**Idempotência técnica** protege de **reentrega**. A chave é o `eventId`, gerada pelo
produtor. O mesmo evento, entregue três vezes, produz um efeito. É o inbox.

**Idempotência de negócio** protege da **mesma intenção repetida**. O cliente apertou
"pagar" duas vezes; são duas requisições diferentes, com dois `eventId` diferentes, e o
inbox deixa as duas passarem — corretamente, porque para ele são eventos distintos. A chave
aqui é de negócio: `Idempotency-Key` enviada pelo cliente, ou uma chave natural (conta +
valor + destino + janela de tempo), com constraint única no banco (`spring-boot/06`).

| | protege de | chave | onde vive |
| --- | --- | --- | --- |
| técnica | reentrega do broker | `eventId` | inbox do consumidor |
| de negócio | intenção repetida | `Idempotency-Key` | agregado, na entrada |

Ter uma e achar que tem as duas é o erro caro: o time implementa o inbox, dorme tranquilo, e
o cliente é debitado duas vezes por ter dado dois cliques.

## Tabela de decisão

| Abordagem | Quando | Custo |
| --- | --- | --- |
| **Outbox** | padrão para publicar a partir de um agregado | uma tabela e um relay |
| **CDC** | ponte com legado que você não pode alterar | acopla ao schema do banco; slot parado enche o disco |
| **2PC** | praticamente nunca | bloqueio durante a decisão, coordenador como SPOF |
| **"confia no broker"** | quando perder o evento é aceitável | inconsistência silenciosa quando não é |

Sobre **2PC**: ele funciona, e morreu por dois motivos. Durante a fase de decisão os
recursos ficam bloqueados, o que num sistema com pico é fatal; e a queda do coordenador
deixa participantes travados esperando. Ainda vive dentro de um único banco distribuído,
onde o coordenador é o próprio sistema — não entre serviços de times diferentes.

Sobre **CDC como ponte**: legítimo, e com data de validade escrita na ADR. Ele acopla o
consumidor ao schema interno do produtor, que é exatamente o que o marco 02 proíbe — é
tolerável enquanto é transição, e vira dívida no dia em que alguém o chama de arquitetura.

## Evento fora de ordem na chegada

Reentrega não é o único desvio: o evento pode chegar **fora de ordem**, e o consumidor
precisa de uma política escrita.

- **Descartar por versão** — o evento carrega a versão do agregado; se a que chegou é menor
  ou igual à que já apliquei, descarto. Simples, sem estado extra, e é o que **quase sempre
  vence**.
- **Bufferizar e esperar** — segura o evento fora de ordem esperando o anterior. Exige
  estado, prazo e um caminho para quando o anterior nunca chega. Só quando cada evento é um
  delta que não pode ser perdido.
- **Reordenar o fluxo** — não existe. O que existe é escolher a chave de partição certa para
  que a ordem que importa seja preservada na origem (`kafka/06`).

E há o caso que não é desordem: o estorno que chega antes do débito porque veio de outro
canal. Isso é um fato legítimo fora de sequência causal, e a resposta é estado pendente com
resolução quando o par chegar — não descarte, que é perder dinheiro do cliente.

## Exemplo numa fintech

Dois incidentes na mesma semana, com a mesma aparência e causas opostas.

**Segunda-feira.** O webhook do PSP é reenviado três vezes porque o `200 OK` se perdeu na
volta. Sem inbox, três liquidações registradas para um pagamento. O time implementa o inbox
por `eventId`, e o problema some.

**Quinta-feira.** Um cliente é debitado duas vezes. O time olha o inbox: dois `eventId`
diferentes, os dois processados corretamente. **O inbox funcionou** — e é isso que confunde.
A causa é outra: o app não desabilitou o botão, o cliente clicou duas vezes, e duas intenções
distintas viraram dois pagamentos. A correção não é no consumidor, é na entrada: chave de
idempotência de negócio, com constraint única.

A lição vale mais que os dois incidentes: quando o dado duplica, a primeira pergunta é **de
qual duplicidade estamos falando** — a do transporte ou a da intenção. Elas têm sintoma
idêntico e correção em lugares diferentes.

## Hands-on

**Tutorial — inbox no consumidor de liquidação.**

1. Crie `inbox(event_id, consumer, processed_at)` com PK composta.
2. No consumidor, abra transação, insira no inbox e aplique o efeito no ledger — nessa
   ordem, no mesmo commit. Violação de PK significa "já processado": confirme o consumo e
   siga.
3. Adicione a versão do agregado no evento e a regra de descarte por versão.
4. Adicione uma rotina de limpeza do inbox por retenção.
5. `git commit -m "feat: inbox com dedupe por eventId e descarte por versão"`.

**Desafio — provar a idempotência ponta a ponta.** Monte um cenário com 10 eventos, injete
**3 reentregas** e **1 evento fora de ordem**, processe, e compare o estado final do ledger
com o do cenário limpo. Depois faça o mesmo pelo outro lado: envie duas vezes a mesma
intenção de pagamento com a mesma `Idempotency-Key` e prove que só um pagamento existe.

**Invariantes testáveis**

1. Processar o mesmo evento 3× produz exatamente um efeito no ledger.
2. O ledger fecha idêntico entre o cenário limpo e o cenário com reentregas e desordem.
3. Duas requisições com a mesma `Idempotency-Key` produzem um pagamento — e a segunda
   resposta é igual à primeira, não um erro.
4. Duas requisições com chaves diferentes produzem dois pagamentos (o teste que impede a
   deduplicação de virar bug).

**Complemento.** Remova a inserção do inbox da transação e coloque-a antes, num commit
separado. Mate o processo entre as duas operações. Você acabou de reproduzir o modo de falha
que a "dedupe no Redis" tem e ninguém percebe em teste.

**Checagem**

1. Por que o inbox precisa estar na mesma transação do efeito de negócio?
2. Qual duplicidade o `eventId` **não** protege, e qual chave protege?
3. Por que 2PC praticamente morreu, e onde ele ainda vive legitimamente?
4. Por que "descartar por versão" quase sempre vence bufferizar — e qual é o caso em que
   descartar seria perder dinheiro do cliente?

## Principais aprendizados

- O outbox garante que o evento sai pelo menos uma vez; o **inbox** é a metade que falta, e
  ele só funciona na mesma transação do efeito de negócio.
- Não existe exactly-once na entrega. Existe efeito único, e ele é responsabilidade do
  consumidor.
- Idempotência técnica (por `eventId`) protege de reentrega; de negócio (por
  `Idempotency-Key`) protege do clique duplo. Ter uma e achar que tem as duas é o erro caro.
- CDC é ponte com data de validade na ADR; 2PC morreu por bloqueio e coordenador único;
  "confiar no broker" só vale quando perder o evento é aceitável.
- Fora de ordem se resolve descartando por versão. Reordenar o fluxo não é uma operação que
  exista — a ordem se escolhe na chave de partição, na origem.
