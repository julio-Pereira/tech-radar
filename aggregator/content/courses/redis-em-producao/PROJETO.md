# Projeto guia: `fin-kv`

> Componente do `fin-platform`. O `fin-kv` é a **camada de estado em memória** do `fin-platform`: o que
> precisa de latência de submilissegundo e o que pode ser perdido, com o tamanho da perda escrito e
> provado.

## Por que uma trilha própria

O catálogo já usa o Redis em vários marcos, mas sempre como meio para outro tema: o cache em
`dados-distribuidos/09`, o lock em `dados-distribuidos/10` e o *rate limit* em `system-design/06`.
Nenhum deles ensina o que o Redis garante e o que ele perde. Quase todo incidente sério com Redis vem de
acreditar numa garantia que ele não dá:

- que o `MULTI` faz *rollback*;
- que um *script* longo não trava ninguém;
- que a réplica tem o que o primário confirmou;
- que a chave de idempotência continua lá depois do pico de memória;
- que o cliente não reenvia o `INCR` que deu *timeout*.

A trilha conhece cada uma dessas fronteiras **pelo número**.

## O que você vai construir

| Pasta | O quê |
| --- | --- |
| `lab/` | Docker Compose com as topologias `standalone`, `replica`, `sentinel` (1 primário, 2 réplicas, 3 sentinelas) e `cluster` (3 primários e 3 réplicas), mais Toxiproxy e Prometheus com `redis_exporter` |
| `scripts/` | *scripts* Lua e *Functions* versionados, com as chaves declaradas em `KEYS[]` |
| `java/` | adaptadores Spring Data Redis (Lettuce) do `pix-gateway` |
| `go/` | adaptadores go-redis do `ledger-core` |
| `STATE-MAP.md` | o mapa de estado, com validador |
| `testes/` | a suíte de invariantes, com Testcontainers, rodando contra o Redis **e** o Valkey |
| `adr/` | as decisões: modelagem, topologia, motor e gerenciado |

São cinco usos que atravessam a trilha:

1. o **limite Pix por janela** (período noturno e por transação);
2. o ***store* de idempotência** do `pix-gateway`;
3. os **contadores de velocidade do antifraude** do `ledger-core`;
4. o ***lease* do job de conciliação D+1**;
5. a **notificação de Pix recebido** por Streams.

A **sessão de consentimento do Open Finance** é o exemplo de estado efêmero com TTL.

## O mapa de estado

Todo uso do `fin-kv` entra no `STATE-MAP.md`, no mesmo formato de `system-design/07`, com:

- a classe: **fonte da verdade, derivado, cache ou efêmero**;
- a perda tolerável (RPO, em segundos);
- o comportamento quando o Redis cai: falha aberta, falha fechada ou degradação.

A regra-mãe vem de `dados-distribuidos/09`: **saldo contábil nunca é servido do Redis**. O validador do
mapa é invariante do capstone e recusa qualquer uso classificado como fonte da verdade de saldo.

## Contratos com os vizinhos

Todos os vizinhos podem ser simulados com *stub*.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | API de iniciação com `Idempotency-Key` | `pix-gateway` (`spring-boot`) |
| consome | antifraude e lançamentos | `ledger-core` (`go-fintech`) |
| consome | restrição de unicidade e verificação do *fencing token* no recurso | `fin-store` (`dados-distribuidos`) |
| consome | evento de Pix recebido | `pix-stream` (`kafka`) |
| consome | SLOs e orçamento de latência | `observabilidade/12`, `system-design/02` |
| serve | limites, idempotência, *lease*, notificação | `fin-platform` |
| serve | o módulo de cache e de estado gerenciado | `fin-aws`, `fin-azure` |

## Dois motores, um contrato

O texto se apoia no **Redis Open Source 8.x**, e o **Valkey 9.x** é o alvo de compatibilidade. A
suíte de invariantes roda contra os dois na matriz de CI do próprio `fin-kv`, com as imagens oficiais
fixadas por *digest*:

```yaml
strategy:
  matrix:
    motor:
      - redis:8.10.3@sha256:1f88291b4c57bdf249f02eb085a8669889b2d2954e91d4de5118a5da6b78dd53
      - valkey/valkey:9.1.4@sha256:3ab0eca823ebbf0fe352476ebac330ac9e5f14b592b9a954eab296d341e81b0e
```

Uma divergência vira caixa **"diferença Redis × Valkey"** no marco. Nunca vira um invariante que passa
num motor e falha no outro sem explicação. As divergências já conferidas estão na auditoria da trilha
(`web/docs/AUDITORIA-redis-em-producao.md`). Entre elas:

- o `DEL` assíncrono por padrão no Valkey;
- os comandos de comparar e apagar: `DELEX` no Redis e `DELIFEQ` no Valkey;
- o `INCREX` com teto, só no Redis;
- as estruturas probabilísticas, que no Valkey se resumem ao Bloom filter.

## Ferramenta e motor → versão conferida (19 nov 2026)

| Item | Versão | Fonte |
| --- | --- | --- |
| Redis Open Source | 8.10.3; licença RSALv2, SSPLv1 ou AGPLv3, à escolha (desde o 8.0) | `LICENSE.txt` e *tags* de `redis/redis` |
| Valkey | 9.1.4; BSD-3-Clause | `COPYING` e *tags* de `valkey-io/valkey` |
| Valkey Bundle | *tag* `9.1.4`, que roda o Valkey 9.1.3; módulos Bloom (só `BF.*`), JSON, Search, LDAP e Lua | imagem `valkey/valkey-bundle:9.1.4`, conferida com `MODULE LIST` |
| Lettuce | 7.9.0 | *tags* de `redis/lettuce` |
| go-redis | v9.23.0 | *tags* de `redis/go-redis` |
| Spring Data Redis | 4.1.2 | *tags* de `spring-projects/spring-data-redis` |

A trilha tem `reviewEvery: 6m`: o ecossistema mudou de licença duas vezes desde 2024 e lança uma
versão maior por ano.

## Pré-requisitos

- Obrigatórios: Docker, JDK, Go e Testcontainers.
- Opcionais: `redis-cli` ou `valkey-cli` e o RedisInsight.
- Nenhuma conta de nuvem: o gerenciado aparece só no marco 13, por documentação e ADR.

## O que este projeto não é

- Não é cache de leitura. Os padrões de cache são de `dados-distribuidos/09`.
- Não é fonte da verdade de saldo.
- Não exige nuvem.

## Regras de autoria

- **Complexidade na primeira menção:** todo comando aparece com a complexidade na primeira vez que é
  citado no marco, por exemplo `ZADD` O(log N) e `KEYS` O(N).
- **Número com fonte:** todo limite numérico (limiar de *encoding*, tamanho de *backlog*, número de
  *slots*) traz a fonte, a versão e a data da conferência.
- **Medir antes de afirmar:** toda afirmação de desempenho ou de perda tem um teste que a mede, e o
  número entra no marco junto com o ambiente em que foi medido.

## Regra do tempo declarado

O `estimatedHours` da trilha é cerca de 2× a soma dos `estimatedMinutes`: 775 min × 2 / 60 = 25,8 → 26.
