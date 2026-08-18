# Projeto guia — fin-store

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `fin-store` é a **camada de dados** do `fin-platform` — o schema do ledger, as
> réplicas, o particionamento da tabela de lançamentos, o cache de limite e a ponte para
> o analítico. Ele não tem API própria: existe para que `ledger-core` e `fin-flow`
> tenham onde guardar dinheiro sem perder um centavo.

## O que você vai construir

Uma camada de dados que sustenta uma invariante contábil sob concorrência, sobrevive à
perda de um nó, migra de schema com o serviço no ar e prova — com restore cronometrado —
que os dados voltam.

**Contratos que o `fin-store` tem com os vizinhos** — todos simuláveis com um stub, se
você não fez a trilha correspondente:

| Direção | Interface | Vizinho |
| --- | --- | --- |
| serve | tabelas de conta, lançamento e saldo, com a invariante garantida no schema | `ledger-core`, trilha go-fintech |
| serve | projeção de extrato, otimizada para leitura por conta e período | `fin-flow`, trilha arquitetura-eventos |
| serve | limite disponível, com cache de TTL curto e verificação na autorização | `pix-gateway`, trilha spring-boot |
| consome | `payments.authorized` para alimentar projeção (via outbox/CDC) | `pix-stream`, trilha kafka |
| emite | CDC da tabela de lançamentos para o store analítico | marco 14 |

**O que este projeto não é.** Ele não ensina JPA, `@Entity`, repository nem propagation
de transação — isso é `spring-boot/05`, e continua valendo. Aqui você está do outro lado
da fronteira: o que o banco faz quando a anotação já foi processada.

## Pré-requisitos

- Docker para subir Postgres 16+ (dois contêineres, para replicação) e Redis
- `psql` no host — boa parte da trilha é duas sessões `psql` lado a lado
- Uma linguagem qualquer para os testes de concorrência: Go, Java ou Python servem
- Um gerador de carga simples (`pgbench` já vem com o Postgres e resolve quase tudo)
- **Não precisa:** cloud paga, cluster gerenciado, licença comercial, Kubernetes.
  O marco 07 fala de RDS/Aurora e o 08 de NewSQL — os dois por comparação, não por uso.

## Incrementos por marco

Os marcos 01–04 produzem **decisões escritas** antes de qualquer schema. É deliberado: a
chave de shard e o nível de isolamento são as duas decisões mais caras de reverter da
trilha, e as duas são normalmente tomadas por default.

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `ORDEM.md`: a fonte de ordem do ledger, escolhida e defendida | Nenhuma ordenação do sistema depende de relógio de parede de dois hosts |
| 02 | `REPLICACAO.md`: modo de replicação com RPO declarado em número | Você reproduziu a leitura não-monotônica e sabe qual usuário a vê |
| 03 | `SHARDING.md`: chave de shard escolhida, com a query que fica cara | Existe uma linha dizendo por que **não** shardar ainda, ou por que sim |
| 04 | Schema com a invariante de saldo garantida de uma das três formas | Teste com 50 threads concorrentes: saldo nunca fica negativo |
| 05 | Medição do custo de `INSERT` com 2 e com 6 índices | O índice que você removeu tem o número que justificou a remoção |
| 06 | `STORES.md`: 6 queries reais mapeadas para o menor número de stores | Cada store adicional tem backup, plantão e dono escritos |
| 07 | Tabela de lançamentos particionada por mês, com pruning provado | `EXPLAIN` mostra a leitura de uma partição, não de 60 |
| 08 | Job de reconciliação D+1 | Ele detecta uma divergência que você injetou de propósito |
| 09 | Cache-aside do limite com jitter e single-flight | 200 requisições após a expiração não viram 200 queries |
| 10 | Medição de fragmentação de índice com UUIDv4 × UUIDv7 | A escolha está defendida pelo número obtido, não pela moda |
| 11 | Expand/contract completo numa coluna, com o serviço no ar | Zero erro de aplicação durante as 4 fases; backfill rodado 2× dá o mesmo resultado |
| 12 | PITR para 5 minutos antes de um `DELETE` proposital | O tempo de restore está cronometrado e escrito no runbook |
| 13 | Pipeline de anonimização para a cópia de homologação | Um teste injeta PII e prova que ela não sobrevive ao pipeline |
| 14 | CDC do `fin-store` para um store analítico, com data contract | O SLO de freshness tem número, dono e alerta |

## Definição de pronto (capstone)

- [ ] A invariante "saldo nunca negativo" é garantida pelo **schema ou pelo isolamento**, não
      por `if` na aplicação — e um teste concorrente prova isso
- [ ] Nenhuma ordenação de negócio depende de comparar relógios de dois hosts
- [ ] O RPO e o RTO do `fin-store` estão escritos em número, e o ensaio de restore foi
      cronometrado pelo menos uma vez
- [ ] A tabela de lançamentos **nunca** recebe `UPDATE`; correção é lançamento novo
- [ ] Toda query do caminho quente tem `EXPLAIN` lido, não presumido
- [ ] Nenhum dado servido de cache é dado contábil; o que é cacheado tem TTL e plano de
      degradação para o cache indisponível
- [ ] Existe reconciliação automatizada — não "a gente confere se der problema"
- [ ] Toda migration é reversível ou explicitamente irreversível, com ADR
- [ ] Nenhum CPF real existe fora de produção
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Matar o leader** durante carga de escrita. Quantos commits você perdeu de verdade?
   Bate com o RPO que você declarou no marco 02?
2. **Rodar duas transferências concorrentes sobre o mesmo limite conjunto.** As duas
   passam? Se passam, você acabou de ver write skew em produção.
3. **`DELETE` sem `WHERE`** numa tabela de homologação. Cronometre o PITR do início ao
   fim, incluindo o tempo de perceber.
4. **Derrubar o Redis** no pico. O sistema degrada ou cai? Se cai, ele não era cache.
5. **`ALTER TABLE` numa tabela quente** enquanto uma transação longa está aberta. Veja a
   fila de locks crescer — e meça em quantos segundos a leitura também trava.

## Regra do tempo declarado

`estimatedHours` da trilha é ~2× a soma dos `estimatedMinutes` dos marcos: leitura mais
hands-on. Nesta trilha a proporção é mais honesta que nas outras, porque quase todo
hands-on é medição — e medir custa mais que ler.
