# Projeto guia — fin-contention

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `fin-contention` é o **laboratório de contenção** do `fin-platform`: o caminho de
> débito de uma conta, escrito nas duas linguagens e em várias versões, mais um harness
> que prova invariantes e injeta falhas. Ele não tem API própria — existe para que
> `ledger-core` e `pix-gateway` tenham uma versão de débito que sobrevive à intercalação
> e à carga.

## O que você vai construir

Um repositório com `java/` (Gradle ou Maven) e `go/`, cada um com as mesmas cinco
implementações do débito — **ingênua**, **com lock global**, **com lock por conta**,
**com CAS/atômico** e **por ator** (single-writer) — mais uma sexta, **no banco**
(`FOR UPDATE` com ordem de aquisição), e um `harness/` que roda a mesma bateria nas duas
linguagens: invariantes de saldo, injeção de deadlock, de vazamento, de esgotamento de
pool, e a coleta de dumps/profiles.

**Contratos que o `fin-contention` tem com os vizinhos** — todos simuláveis com um stub:

| Direção | Interface | Vizinho |
| --- | --- | --- |
| serve | operação `debit(accountId, amount)` com invariante "saldo ≥ 0 e nenhum débito perdido ou duplicado" | `ledger-core`, trilha go-fintech |
| serve | o mesmo contrato em Java, com pool dimensionado e timeouts definidos | `pix-gateway`, trilha spring-boot |
| consome | a tabela `conta` e a estratégia de lock do `fin-store` | trilha dados-distribuidos |
| serve | números de pool/executor (tamanho, retenção, `pending`) para dimensionar `requests`/HPA | trilha kubernetes |
| emite | métricas de pool, executor, goroutines e espera de lock; regra de alerta testada | trilha observabilidade |
| serve | a base de implementação para bulkhead e fila limitada | trilha `performance-resiliencia` (planejada) |

**O que este projeto não é.** Ele não reimplementa transação distribuída, saga nem o
ledger completo — usa uma tabela `conta` simples. Também não configura broker nem
cluster.

## Pré-requisitos

- JDK 21 e Maven ou Gradle (callouts no texto para o que muda em 24/25); Go 1.22+
  (1.25+ nos marcos 05, 06 e 08, com fallback documentado para 1.22)
- Docker para Postgres 16+ (duas sessões `psql` lado a lado em parte dos marcos 04 e 07)
- jcstress (`org.openjdk.jcstress`, versão 0.16), Awaitility (4.3.x), `goleak`
  (v1.3.0), `promtool`, e `jcmd`/`jstack` do próprio JDK
- Um gerador de carga: `k6`, `hey`, ou o próprio harness em Go
- **Não precisa:** cloud paga, Kubernetes, broker. Onde o Kubernetes entra (limite de
  CPU, HPA), o marco usa um cálculo sobre manifestos de exemplo, não um cluster.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `TAXONOMIA.md` + 3 programas (data race; race condition sem data race; lost update no banco) + experimento de Amdahl | O programa 2 passa limpo no detector de race **e** viola a invariante; a tabela de 6 trechos é classificada corretamente; speedup medido ≤ limite de Amdahl |
| 02 | `MEMORIA.md` + teste de litmus (store-buffering e publicação insegura) nas duas linguagens | A versão corrigida tem 0 ocorrências do resultado proibido; a quebrada é contada (ou "não reproduziu") |
| 03 | As 5 implementações do débito (Java e Go) + o fake que falha se chamado com lock tomado | Sob 50 threads / 500 goroutines: saldo ≥ 0, soma aceita = saldo inicial, sem I/O sob lock |
| 04 | Transferência cruzada A→B e B→A com deadlock reproduzido, detectado e corrigido; deadlock de pool; `40P01` com retry | Watchdog detecta o deadlock da versão ingênua; versão ordenada conclui; 0 `40P01` com ordem, ≥1 sem ordem, e todos concluem com retry |
| 05 | Experimento de dimensionamento + executor com fila limitada e rejeição | A 3× de carga a fila nunca passa da capacidade; p99 dos aceitos com limite < sem limite; Little confere ±5% |
| 06 | Cancelamento ponta a ponta + teste de vazamento + semáforo sobre o pool | Contagem de goroutines volta à linha de base; irmãos cancelados em ≤100 ms; `pending` do pool ≤ teto |
| 07 | Calculadora de pool + checagem de manifestos + mapeamento de erro de pool esgotado | Pool calculado tem `pending` ≈ 0 no TPS-alvo; `maxReplicas × pool` acima do limite derruba o CI; esgotamento vira 503 em ≤ `connectionTimeout` |
| 08 | Verificador de histórico (linearizabilidade simplificada) + suíte `-race -count` + jcstress no CI | Aceita histórias corretas, rejeita uma história impossível 100%, e a mutação plantada é pega pelo CI |
| 09 | Runbook de 3 falhas injetadas + regra de alerta | Script dispara cada falha, captura o dump e encontra a assinatura; `promtool test rules` verde |
| 10 | ADRs do bloco, matriz "qual mecanismo para qual contenção" e a bateria completa | Todos os critérios da Definição de pronto passam em Java **e** em Go |

## Definição de pronto (capstone)

- [ ] O débito mantém "saldo ≥ 0 e nenhum débito perdido ou duplicado" sob 50 threads
      (Java) e 500 goroutines (Go), em **todas** as 6 implementações marcadas como
      corretas
- [ ] A implementação ingênua é reprovada pela mesma bateria (ela existe para ser
      reprovada)
- [ ] Nenhuma chamada de I/O ocorre com lock tomado — provado por teste, não por revisão
- [ ] Toda aquisição de mais de um lock segue uma ordem total documentada; o deadlock de
      transferência cruzada tem teste de regressão
- [ ] Todo `ExecutorService`/worker pool tem fila **limitada**, política de rejeição
      explícita e métrica de `queue`/`rejected`
- [ ] Todo pool (JDBC e HTTP) tem tamanho **calculado** (com a conta escrita),
      `connectionTimeout`/`maxLifetime` definidos e detecção de vazamento ligada
- [ ] `réplicas máximas × pool` está dentro de 80% do `max_connections`, verificado em CI
- [ ] Contagem de goroutines/threads volta à linha de base depois de cancelar mil
      requisições
- [ ] Existe suíte de concorrência no CI: `-race -count`, jcstress e um verificador de
      histórico; uma mutação plantada derruba o CI
- [ ] Existe runbook de "serviço travou com CPU baixa", cada passo com comando e
      assinatura, e uma regra de alerta de pool/executor testada
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de
      reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada
quebrar.

1. **Transferências cruzadas** em carga máxima. Em quanto tempo o watchdog detectou?
   O que o dump mostra, na ordem?
2. **Banco lento** (injete 300 ms por query) com o pool no tamanho atual. A fila está
   visível na aplicação ou escondida no banco?
3. **Dobrar as réplicas** (simule o HPA). Quantas conexões o banco recebe? Passa de 80%
   do limite?
4. **Cancelar mil requisições** no meio da chamada. A contagem de goroutines/threads
   volta?
5. **Liberar uma mudança** que troca o lock por uma versão "otimizada" sem a ordem de
   aquisição. O CI pega antes do deploy?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`. Aqui quase todo hands-on é *provocar uma
falha e medi-la*, que custa mais que ler; os 600 min de leitura viram ~20h.
