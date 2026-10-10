---
id: concorrencia-no-ledger
title: "Concorrência no ledger: do invariante à prova"
summary: "Segurança de concorrência é uma propriedade do sistema inteiro — memória, lock, banco, pool, executor — e só vale o que o teste de invariante provar."
estimatedMinutes: 55
references:
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
  - title: "PostgreSQL — Explicit Locking (deadlocks)"
    url: https://www.postgresql.org/docs/current/explicit-locking.html
---

## Costurando o caminho completo

O débito de uma conta, de ponta a ponta, atravessa todas as camadas desta trilha: **lock ou
ator**, em processo, protege o estado em memória (marco 03); **transação e ordem de aquisição**,
no banco, protegem a mesma invariante entre linhas (marco 04); **pool dimensionado** garante que a
conexão necessária está disponível sem segurar o sistema inteiro (marco 07); **executor limitado**
garante que a carga de trabalho concorrente não explode em memória (marco 05); **cancelamento**
libera recursos quando o cliente desiste (marco 06); e **métricas** tornam qualquer degradação
visível antes de virar incidente (marco 09). Remover qualquer uma dessas camadas não quebra o
sistema imediatamente — quebra sob a carga, a falha ou a intercalação específica que aquela
camada existia para cobrir. É por isso que "funcionou no teste manual" nunca foi evidência
suficiente em concorrência.

> **Reencontro — `spring-boot/07`, `/08` e `go-fintech/03`.** O lado Java deste caminho completo
> é o `pix-gateway`: virtual threads e pinning (`/07`), o pool isolado por dependência do bulkhead
> (`/08`). O lado Go é o `ledger-core`: sharding por conta e `context`/`errgroup` (`go-fintech/03`).
> O que esta trilha acrescentou a cada um foi o número — quanto, não só como.

## A matriz: qual mecanismo para qual contenção

| Cenário | Baixa contenção | Alta contenção |
| --- | --- | --- |
| 1 processo, invariante simples | lock simples ou `Atomic*`/CAS | lock por chave, `LongAdder`, ou ator |
| 1 processo, invariante composta (mais de uma variável) | lock cobrindo todas as variáveis juntas | ator/single-writer — compor CAS corretamente fica caro demais |
| N processos, invariante simples | transação curta + índice | transação curta + ordem de aquisição + retry |
| N processos, invariante composta | transação + constraint | materializar o conflito (`dados-distribuidos/04`) + retry |

A régua que atravessa a tabela inteira: quanto mais processos e quanto mais variáveis a invariante
cobre, mais caro fica manter tudo em lock fino e CAS — e mais cedo vale a pena serializar via
transação, ator, ou aceitar o custo de um lock mais grosso.

## Antipadrões, revisitados com nome

`synchronized` em tudo (serializa o que não precisava, sem ganho de correção); `ThreadLocal`
vazando (o custo que o marco 06 mediu em escala); fila ilimitada (o antipadrão do marco 05, que é
a configuração de fábrica do `@Async` do Spring Boot); "aumentar o pool" como resposta padrão a
qualquer lentidão, sem medir o tempo de retenção primeiro (marco 07); `parallelStream` usado para
I/O, roubando capacidade do `commonPool` compartilhado (marco 05); retry sem jitter segurando uma
conexão de pool enquanto espera (compõe o problema do marco 04 com o do 07); `Thread.sleep` em
teste (marco 08); e transação aninhada via `REQUIRES_NEW` sem considerar o tamanho do pool (o
deadlock de pool do marco 04).

## O que vem depois

Esta trilha para na fronteira de "o mecanismo de recurso finito existe e está dimensionado". O que
fazer quando, mesmo dimensionado certo, o sistema ainda precisa **degradar com intenção** sob
carga acima da capacidade — *load shedding*, *backpressure* adaptativo, *circuit breaker* como
política de negócio — é o assunto de `performance-resiliencia`.

## Exemplo numa fintech

O débito Pix de ponta a ponta: o que protege o saldo em cada camada, e o que acontece quando uma
camada específica é removida — essa é literalmente a estrutura do desafio deste marco.

## Hands-on

**Tutorial.** Rodar a bateria completa de testes (invariante, `-race`/jcstress, verificador de
histórico, teste de mutação) contra as 6 implementações do débito, em Java e em Go.

**Desafio.** Remover uma camada de proteção por vez — o lock em memória, a ordem de aquisição no
banco, o limite do pool, o limite do executor — e observar qual teste especificamente passa a
falhar. Essa é a prova de que cada camada é necessária, não decorativa.

**Invariantes testáveis.** Os mesmos da Definição de pronto abaixo: saldo ≥ 0 e nenhum débito
perdido ou duplicado em todas as implementações marcadas como corretas; a implementação ingênua
reprovada pela mesma bateria; nenhuma chamada de I/O sob lock; ordem total de aquisição
documentada e testada; toda fila de executor limitada; todo pool calculado; e uma mutação
plantada derrubando o CI.

**Complemento.** Escreva o caminho completo do débito como um parágrafo que um colega entenda em
dois minutos, nomeando a camada que protege cada tipo de falha.

**Checagem**

1. Para cada uma das seis camadas (lock, transação, pool, executor, cancelamento, métricas), qual
   falha especificamente ela previne?
2. Quando a matriz recomenda ator/single-writer em vez de CAS, e por quê?
3. Qual antipadrão desta lista combina o problema do marco 04 com o do marco 07?
4. Por que remover uma camada de proteção, uma de cada vez, é uma forma válida de provar que ela é
   necessária?

## Principais aprendizados

- Segurança de concorrência é uma propriedade do sistema inteiro — memória, banco, pool, executor
  — e cada camada cobre uma falha que as outras não cobrem.
- A matriz "mecanismo por contenção" favorece lock fino e CAS em baixa contenção e invariante
  simples, e empurra para ator/transação/materializar o conflito conforme contenção e
  complexidade de invariante sobem.
- Os antipadrões desta trilha têm uma estrutura comum: uma decisão de concorrência tomada sem
  medir — fila sem limite, pool aumentado sem calcular retenção, lock removido sem testar a
  remoção.
- Remover uma camada de proteção por vez e observar qual teste falha é a prova executável de que
  ela é necessária — "parece que não faz nada" e "não é necessária" não são a mesma coisa.
- O que falta depois de pools e filas dimensionados é degradar com intenção sob carga acima da
  capacidade — isso é o assunto de `performance-resiliencia`, não desta trilha.

## Capstone

O `fin-contention` é o seu laboratório de contenção do `fin-platform` — a especificação completa
está em `PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `TAXONOMIA.md` com os três programas do marco 01 e o experimento de Amdahl
- [ ] `MEMORIA.md` com os testes de litmus do marco 02, em Java e em Go
- [ ] As 6 implementações do débito (ingênua, lock global, lock por conta, CAS, ator, banco),
      em Java e em Go, com o fake que falha se chamado com lock tomado
- [ ] A transferência cruzada com deadlock reproduzido, detectado e corrigido; o deadlock de pool
      reproduzido e corrigido; o wrapper de retry para `40P01`
- [ ] O experimento de dimensionamento de executor e a versão com fila limitada e rejeição
- [ ] O teste de vazamento de goroutine/thread e o semáforo sobre o pool de conexões
- [ ] A calculadora de pool, o verificador de manifestos, e o mapeamento de erro de pool esgotado
      para 503
- [ ] O verificador de histórico, a suíte `-race -count`/jcstress, e a mutação plantada no CI
- [ ] O runbook das três falhas injetadas e a regra de alerta testada com `promtool`
- [ ] As ADRs do bloco e a matriz "qual mecanismo para qual contenção"

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] O débito mantém "saldo ≥ 0 e nenhum débito perdido ou duplicado" sob 50 threads (Java) e 500
      goroutines (Go), em todas as 6 implementações marcadas como corretas
- [ ] A implementação ingênua é reprovada pela mesma bateria
- [ ] Nenhuma chamada de I/O ocorre com lock tomado — provado por teste, não por revisão
- [ ] Toda aquisição de mais de um lock segue uma ordem total documentada; o deadlock de
      transferência cruzada tem teste de regressão
- [ ] Todo `ExecutorService`/worker pool tem fila limitada, política de rejeição explícita, e
      métrica de `queue`/`rejected`
- [ ] Todo pool (JDBC e HTTP) tem tamanho calculado, `connectionTimeout`/`maxLifetime` definidos, e
      detecção de vazamento ligada
- [ ] `réplicas máximas × pool` está dentro de 80% do `max_connections`, verificado em CI
- [ ] Contagem de goroutines/threads volta à linha de base depois de cancelar mil requisições
- [ ] Existe suíte de concorrência no CI (`-race -count`, jcstress, verificador de histórico), e
      uma mutação plantada derruba o CI
- [ ] Existe runbook de "serviço travou com CPU baixa", com comando e assinatura por passo, e uma
      regra de alerta de pool/executor testada
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das dez
decisões que você tomou aqui, qual só se sustenta porque o seu teste não consegue reproduzir a
intercalação que a quebraria — e o que você faria para torná-la reproduzível?**
