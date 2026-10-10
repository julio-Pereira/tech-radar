---
id: diagnosticar-em-producao
title: "Diagnosticar concorrência em produção"
summary: "\"CPU baixa e latência alta\" significa espera — e a pergunta certa é sempre: esperando o quê?"
estimatedMinutes: 55
references:
  - title: "Go — Diagnostics"
    url: https://go.dev/doc/diagnostics
  - title: "Prometheus — Unit testing for rules (promtool)"
    url: https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/
---

## A árvore de decisão

CPU **alta**, latência alta: o sistema está de fato computando — o problema é de algoritmo ou
volume, não de concorrência. CPU **baixa**, latência alta: o sistema está **esperando**, e a
pergunta que decide o próximo passo é "esperando o quê?" — lock, conexão de pool, resposta de
I/O externo, ou uma fila que cresce. Contagem de threads ou goroutines **crescendo** sem parar,
sem corresponder a aumento de carga: vazamento. Essas quatro perguntas, respondidas em ordem,
cobrem a maioria dos incidentes de concorrência em produção — e a maior parte do trabalho é
simplesmente ter, de antemão, como responder cada uma rapidamente.

## As ferramentas, lado a lado

**Em Java**: `jcmd <pid> Thread.print` (ou `jstack`) tira um dump de todas as threads, incluindo
virtual threads desde o suporte correspondente no JDK — e ler um dump é reconhecer os estados:
`BLOCKED` (esperando entrar num monitor que outra thread segura), `WAITING`/`TIMED_WAITING`
(esperando uma condição, um `join()`, ou um timeout). Um dump com muitas threads em `BLOCKED` no
mesmo monitor aponta direto para o lock disputado. **JFR** (Java Flight Recorder) vai além do
instantâneo do dump: grava eventos de contenção de monitor e de `park` ao longo do tempo, com
overhead baixo o bastante para rodar continuamente em produção.

**Em Go**: o `pprof` tem perfis específicos para cada pergunta — perfil de **goroutine** (quantas
existem e onde estão bloqueadas, o equivalente ao dump de thread), perfil de **mutex**
(`runtime.SetMutexProfileFraction`, mostra onde o programa espera por locks) e perfil de
**block** (`runtime.SetBlockProfileRate`, mostra onde o programa bloqueia em qualquer operação
de sincronização — channel, lock, ou chamada de sistema). `runtime/trace` captura uma linha do
tempo detalhada de agendamento de goroutines, útil para entender uma janela curta e específica de
comportamento anômalo.

**O mesmo dump, lido nos dois formatos**: uma thread Java em `BLOCKED` esperando um monitor e uma
goroutine no perfil de mutex esperando o mesmo `Mutex` são a mesma assinatura — "N participantes
esperando um recurso que M participantes seguram" — só que cada runtime expõe isso com um
vocabulário e um comando diferentes.

> **Reencontro — `go-fintech/07`.** O `pprof` de CPU e heap daquele marco responde "onde o tempo
> vai" e "o que ocupa memória". Os perfis de goroutine, mutex e block respondem a pergunta que
> falta: "o que está **esperando**, e por quê" — a mesma ferramenta, uma dimensão que o marco de
> performance não cobriu.

## Métricas que contam a história antes do dump

Um dump é reativo — alguém precisa decidir tirá-lo. As métricas que tornam isso desnecessário na
maioria dos casos: `pending`/`WaitCount` do pool de conexões, `queue.size`/`rejected` do
executor, contagem de goroutines/threads vivas ao longo do tempo, e tempo de espera por lock
(quando exposto). **Profiling contínuo** (`observabilidade/11`) é o que torna possível olhar
"o que estava acontecendo às 15h03 de ontem" sem ter capturado nada manualmente naquele momento.

## Alertar na saturação, não na causa

A regra que evita alertas inúteis: alertar em **sintomas de saturação** (`pool.pending > 0` por
mais de um minuto, fila do executor crescendo sem parar, contagem de goroutines acima da linha de
base) e não tentar prever a causa específica de antemão. A causa muda (hoje é o PSP lento, amanhã
é um deadlock de pool); o sintoma de saturação é estável o bastante para ser a base do alerta. E o
runbook — escrito **enquanto ainda se lembra do incidente**, não semanas depois — é o que
transforma "sabíamos diagnosticar" em "qualquer pessoa de plantão consegue diagnosticar".

## Exemplo numa fintech

Sexta-feira, 15h: p99 sobe de 200 ms para 9 segundos, CPU em 8%. A árvore de decisão aponta direto
para espera. Um dump mostra duzentas threads em `BLOCKED` no mesmo monitor — a seção crítica do
débito, que normalmente dura microssegundos, está seguindo uma chamada de rede que começou a
travar. O sintoma era visível em `pool.pending` minutos antes do p99 explodir, se alguém tivesse
olhado o painel certo.

## Hands-on

**Tutorial.** O `fin-contention` do marco 10 expõe três falhas injetáveis sob demanda: deadlock,
esgotamento de pool, vazamento de goroutine/thread (executor saturado). Diagnosticar cada uma
usando **só** dump e profile — sem olhar o código fonte da falha injetada.

**Desafio.** Escrever o runbook de cada falha (comando exato, assinatura esperada, ação) e uma
regra de alerta de saturação testada com `promtool`.

**Invariantes testáveis**

1. Para cada uma das três falhas injetadas, um script a dispara, captura o dump/profile
   correspondente, e **encontra a assinatura** descrita no runbook (verificado por busca de texto
   no dump/profile capturado).
2. A regra de alerta `pool_pending > 0 por 1 minuto` passa em `promtool test rules`: dispara no
   cenário de saturação simulado e **não** dispara no cenário de carga normal simulado.
3. O runbook de cada falha tem o comando exato, a assinatura a procurar, e a ação — um teste de
   documento (checando a presença das três seções) reprova se qualquer uma faltar.
4. Os perfis de mutex e block estão habilitados no serviço de exemplo e protegidos por
   autenticação (não expostos sem controle de acesso).

**Complemento.** Habilite um perfil de lock contínuo (Pyroscope ou equivalente) e compare o que
ele mostra com o dump manual tirado no mesmo instante.

**Checagem**

1. Qual é a árvore de decisão de quatro passos para diagnosticar um sintoma de "CPU baixa, latência
   alta"?
2. O que o estado `BLOCKED` num dump de thread Java significa, e qual é o equivalente em um perfil
   de goroutine?
3. Por que alertar em saturação é mais robusto que tentar alertar na causa específica?
4. O que um dump de thread/goroutine **não** mostra, que um profile contínuo mostra?

## Principais aprendizados

- "CPU baixa, latência alta" significa espera; a pergunta certa é sempre "esperando o quê?" — lock,
  pool, I/O, ou fila — e isso guia a ferramenta a usar, antes de qualquer outra investigação.
- `jstack`/`jcmd Thread.print` e o perfil de goroutine do `pprof` são o mesmo tipo de instantâneo,
  com vocabulário diferente; JFR e `runtime/trace` capturam a linha do tempo, não só o instante.
- Perfis de mutex e block no `pprof` respondem diretamente "onde o programa espera por
  sincronização" — a pergunta que um profile de CPU não responde.
- Alertar em sintoma de saturação (pool pendente, fila crescendo, goroutines acima da linha de
  base) é mais estável que tentar prever a causa específica de antemão.
- O runbook escrito logo após o incidente, com comando e assinatura exatos, é o que transforma
  conhecimento de quem investigou numa vez em capacidade de qualquer plantão.
