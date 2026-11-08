# Auditoria do adendo de entrevista da trilha `spring-boot`

Registro do que foi conferido em cada fase do adendo: programação reativa (marco 13), *feature
toggles* (marco 14) e a renumeração do `arquitetura-modulith` para 15.

## 1. Fase 0 — versões, licenças e compatibilidade

**Versões estáveis no Maven Central** (nov/2026):

| Biblioteca | Versão | Licença |
| --- | --- | --- |
| Spring Boot | 4.1.2 | Apache 2.0 |
| Reactor Core / Reactor Test | 3.8.8 | Apache 2.0 |
| BlockHound | 1.0.18.RELEASE | Apache 2.0 |
| OpenFeature Java SDK | 1.23.0 | Apache 2.0 (POM) |
| flagd *provider* (`dev.openfeature.contrib.providers:flagd`) | 0.15.0 | Apache 2.0 |
| Micrometer Context Propagation | 1.2.1 | Apache 2.0 (POM) |

**Executado no JDK 25** (projeto de conferência com Reactor 3.8.8, BlockHound e OpenFeature):
- **BlockHound:** `BlockHound.install()` detecta um `Thread.sleep` dentro de um `Mono.delay`
  (`BlockingOperationError: Blocking call! java.lang.Thread.sleepNanos0`). Mas só com
  `-XX:+AllowRedefinitionToAddDeleteMethods`:
  - sem a flag, a instalação falha com `IllegalStateException`;
  - com ela, a JVM avisa que a flag está *deprecated* desde o 13 e pode ser removida;
  - o ByteBuddy embutido no BlockHound também dispara avisos de `sun.misc.Unsafe`.

  O marco 13 vai registrar isso como risco de compatibilidade.
- **`StepVerifier.withVirtualTime`:** prova um `timeout` de 2 s sem esperar 2 s (verificação com
  limite de 1 s).
- **OpenFeature:** o `InMemoryProvider` do SDK avalia uma flag booleana sem serviço externo. Fica como
  *provider* local de teste; a escolha entre ele e o `flagd` é a ADR do marco 14.

**Fontes novas no `course.yaml`:** as páginas do Reactor e do OpenFeature foram conferidas pela busca
na web, porque `projectreactor.io` e `openfeature.dev` não resolvem a partir do contêiner. O
repositório da especificação Reactive Streams foi aberto e confere (licença MIT-0).

**Pontes planejadas:** `kotlin-backend/07` e `design-de-codigo/05` em `bridges-planned.yaml`.

## 2. Fase A — renumeração e stubs

- **Renumeração:** `13-arquitetura-modulith.md` (e o quiz) foi renomeado para `15-...`, com o `id` e o
  `## Capstone` intactos.
- **Stubs válidos:** `13-programacao-reativa.md` (65 min) e `14-feature-toggles-e-mudanca-segura.md`
  (55 min).
- **`course.yaml`:** a lista nova de marcos e `estimatedHours: 21` (625 × 2 / 60 = 20,8). Isso também
  resolve a exceção antiga de 22 h.

**Pontes, provadas pelo resolvedor do compilador** (`TestPontesSnapshot`, `PONTES_SLUG=spring-boot`):
- **Antes:** 108 pontes resolvem para a `spring-boot`, das quais 24 vão para `arquitetura-modulith`,
  todas literais (`spring-boot/13`), sem `/13` herdado.
- **Textuais:** 26 ocorrências de `spring-boot/13` no `content/` (as 24 pontes e 2 no `tambem:` de
  `conceitos.yaml`), reescritas para `spring-boot/15` em 15 arquivos. Nenhuma sobrou.
- **Depois:** com `PONTES_ANTES` e `PONTES_RENOMEAR=13-arquitetura-modulith.md=15-arquitetura-modulith.md`,
  o teste passa. O *diff* da coluna de destino, linha a linha, é vazio.
- **Fora das pontes:** "(marco 13)" no próprio capstone, dois verbetes do glossário (Modulith e Event
  Publication Registry) e a linha 13 da tabela de incrementos do `PROJETO.md` passaram a 15.

**Testes:** a lista de marcos sem hands-on ganhou os dois stubs.

## 3. Fase B — marco 13, programação reativa

Projeto de conferência com Reactor 3.8.8, Reactor Test, BlockHound 1.0.18 e Micrometer Context
Propagation 1.2.1, no JDK 25. Ao fim da fase, 17 testes passam, em duas rodadas seguidas.

**Saídas e medições citadas no texto:**
- **Montagem × assinatura:** 0 chamadas depois de montar, 2 depois de dois `block()`.
- **Threads:** `publishOn(parallel)` com `subscribeOn(boundedElastic)` deram `[A:boundedElastic, B:parallel, C:parallel]`.
- **Ordem:** com atrasos de i × 50 ms sobre `3, 1, 2`, o `flatMap` deu `[1, 2, 3]` e o `concatMap`
  `[3, 1, 2]`.
- **Concorrência padrão do `flatMap`:** 256 (`Queues.SMALL_BUFFER_SIZE`, lido em tempo de execução).
- **`onErrorResume`:** fora do `flatMap`, `[1, -1]`; dentro, `[1, 3]`.
- ***Backpressure*:** `onBackpressureBuffer(16)` com produtor a 1/ms e consumidor a 1/20 ms deu
  `OverflowException`; `limitRate(10)` pediu 10 e depois 8 em 8.
- **Bloqueio:** 8 chamadas de 200 ms num *scheduler* de 2 threads, ~843 ms; no `boundedElastic`,
  ~209 ms.
- **Contexto:** sem propagação, `trace=null` no `flatMap`; com o `ThreadLocalAccessor` e
  `Hooks.enableAutomaticContextPropagation()`, `trace=abc123`.
- **Tempo virtual:** `retryWhen(Retry.backoff(5, 1s))` com 3 tentativas, e `timeout` de 2 s.

**Invariantes do desafio** (`StatusEmLote`): os 5 testes passam. Dois problemas apareceram na
conferência e entraram no texto:
- **Contador de chamadas em voo:** decrementado no `doFinally`, ele mediu pico 7 com `flatMap(..., 4)`,
  porque o `doFinally` roda depois de o sinal descer e o `flatMap` já assinou a próxima chamada.
  Decrementado no `doOnTerminate`, o pico foi 4 nas três rodadas.
- **BlockHound global:** ele é instalado no processo e não desinstala. Instalado num teste, travou o
  teste de `trace_id` da mesma JVM: o `jstack` mostrou o `main` parado no `Mono.block`. A solução foi
  uma classe própria para o teste do BlockHound, com o *surefire* em `reuseForks=false`. Depois disso,
  a suíte passou inteira duas vezes.

**Viés das respostas:** em nenhuma das 6 questões a correta é estritamente a opção mais longa.

**Revisão independente:** fica para a Fase D, como o plano pede.

## 4. Fase C — marco 14, *feature toggles*, e as edições da §4

**Marco 14.** Conferido no mesmo projeto, com o OpenFeature SDK 1.23.0 e o `InMemoryProvider`. Os 7
testes do desafio passaram em três rodadas seguidas:
- **Determinismo:** 1.000 clientes avaliados 6 vezes cada, sem troca de variante.
- **Fração observada** em 100 mil clientes sintéticos:

  | Porcentagem configurada | Fração observada |
  | ---: | ---: |
  | 5% | 4,977% |
  | 25% | 24,796% |
  | 50% | 49,680% |

  O balde vem do SHA-256 de `flag:cliente` em 0..9.999.
- **Contrato das duas variantes:** um teste parametrizado, com escala, limites e monotonicidade.
- ***Kill switch*:** com `updateFlags`, a avaliação seguinte já usa o cálculo antigo.
- **Flag vencida:** com relógio falso, a mensagem traz a flag e o dono.
- **Auditoria:** `onProviderConfigurationChanged` entregou `[tarifa-nova-porcentagem,
  tarifa-nova-kill-switch]` e `[tarifa-nova-kill-switch]`.

  A primeira versão esperava os eventos com um `sleep` fixo; a versão final espera com prazo, porque o
  SDK os entrega noutra thread.

**Fontes.** O flagd foi conferido pelo repositório `open-feature/flagd`: Apache 2.0, fontes de
arquivo, HTTP e Kubernetes, e serviço por HTTP ou gRPC. A busca não abriu o `flagd.dev`, então a
referência aponta para o repositório.

**Edições em marcos existentes:**
- **04:** nova seção "Padrões que o Spring já usa por você", com a tabela padrão → onde no Spring →
  quando escrever à mão (*Proxy*, *Template Method*, *Strategy*, *Chain of Responsibility*,
  *Observer* e *Factory*) e a ponte planejada para `design-de-codigo/05`. No quiz, a questão sobre
  *singletons stateless* deu lugar a uma sobre *Strategy* com `List<RegraAntifraude>`; continuam 4
  questões.
  - **Desvio do plano:** o plano citava o `RestClient` como *Template Method*. O exemplo usado é o
    `JdbcTemplate`/`TransactionTemplate`, que de fato tem o *callback* do passo variável.
- **07:** ponte para o marco 13 na seção de WebFlux, com a nota de que a propagação de contexto traz o
  `ThreadLocal` de volta.
- **10:** nota sobre o mesmo OTLP chegar ao Datadog Agent (portas 4317/4318) e ao *endpoint* nativo
  do New Relic, conferida nas documentações dos dois. Ressalvas do Datadog: *logs* por OTLP vêm
  desligados por padrão, e alguns produtos proprietários não usam dados do SDK OpenTelemetry.
- **15:** na **Entrega** do capstone, a consulta reativa e a tarifa atrás de flag. Nos **Critérios de
  pronto**, o invariante 1 do 13 e o 4 do 14.
- **`PROJETO.md`:** incrementos dos marcos 13 e 14 e os pré-requisitos (Reactor Test, BlockHound com
  a flag, OpenFeature e *provider* local).
- **`GLOSSARIO.md`:** 12 verbetes novos (56 no total, 56/56 na cobertura). A *feature flag* não foi
  duplicada: o verbete OpenFeature remete ao glossário de `system-design`.

**Viés das respostas:** em nenhuma das 4 questões do 14, nem na nova do 04, a correta é estritamente a
opção mais longa.

## 5. Fase D — auditoria automatizada e revisão independente do marco 13

**Auditoria automatizada.** `aggregator/internal/course/springboot_adendo_auditoria_test.go` roda em todo
build. Confere:
- 15 marcos, Σ 625 min e `estimatedHours: 21`;
- os `id`s dos marcos 13, 14 e 15 (`arquitetura-modulith` intacto);
- o `## Capstone` só no último marco;
- nos marcos novos: `reviewedAt`/`reviewEvery` e competências, os cinco blocos do hands-on, 6 e 4
  questões, e nenhuma correta como a opção estritamente mais longa.

Testada com dois defeitos de propósito: 5 minutos a menos no 14 e o `id` do 15 trocado. Reprovou os
dois.

**Revisão independente do marco 13**, por um agente que não escreveu o conteúdo, no JDK 25 com
Reactor 3.8.8 e Boot 4.1.2. As 6 respostas do quiz conferiram, e nenhum distrator estava
acidentalmente certo. Os três bloqueantes foram reproduzidos antes de corrigir:

| Achado | Evidência | Correção |
| --- | --- | --- |
| **B1.** O diagnóstico do BlockHound estava errado. O problema não é a propagação de contexto nem a JVM compartilhada: instalado depois que as threads `parallel` existem, o BlockHound acusa a espera ociosa delas (`Unsafe#park` em `DelayedWorkQueue.take`) e mata os *workers* | Reproduzido: um `flatMap` sem bloqueio nenhum deu *timeout* nas 3 rodadas com o BlockHound instalado tarde; com `static { BlockHound.install(); }`, os testes de BlockHound e de `trace_id` passaram juntos na mesma JVM | Texto, invariante 2 e aprendizados: instalar antes de qualquer thread do Reactor (`static` ou `blockhound-junit-platform`); `reuseForks=false` vira proteção extra. No projeto de conferência, o teste passou a instalar num `static` |
| **B2.** O Boot não liga a propagação automática por padrão | `spring.reactor.context-propagation`, padrão `limited`, lido no *metadata* do `spring-boot-reactor` 4.1.2 | O texto pede `spring.reactor.context-propagation=auto` |
| **B3.** O contador do invariante 1 vazava justamente no cenário do desafio: o `timeout` cancela, e o `doOnTerminate` não roda em cancelamento | Reproduzido: pico 11 e contador final 10 | Decremento também em `doOnCancel`. Teste novo, com um terço das chamadas presas: pico 4 e contador zero. O "7" do `doFinally` virou "de 5 a 7 conforme a execução" |

**Menores corrigidos:**
- **Threads:** os operadores de tempo também trocam de thread (emitem no `parallel`), e o *event loop*
  do WebFlux é o do Netty, não o `Schedulers.parallel()`.
- **`subscribeOn`:** com vários, vale o mais próximo da fonte; e ele não move fontes que emitem na
  própria thread.
- **`zip`:** pareia por posição.
- **`onBackpressureDrop`:** só conta com um consumidor passado ao operador.
- **`limitRate`:** reabastece com n − n/4, não 75%.
- **Tempo do *overflow*:** o assinante só recebe o erro depois de drenar os itens guardados.
- **`Retry.backoff`:** tem *jitter* de 50% por padrão; esperas exatas pedem `jitter(0)`.
- **BlockHound:** só acusa o que roda numa thread não bloqueante. O invariante 2 e o exemplo passaram
  a dizer isso.
- **Invariante 4:** reformulado para o que o teste prova (`Exceptions.isOverflow` e o limite de 16
  mais o *prefetch*).
- **R2DBC:** também aceita `@Transactional` com `ReactiveTransactionManager`.
- **Virtual threads:** o novo gargalo é o *pool* de conexões, no texto e no quiz 6.
- **Medição de bloqueio:** o texto descreve o arranjo, `publishOn` por item dentro de um `flatMap`.

**Conferido pelo revisor e certo:**
- as quatro interfaces do Reactive Streams;
- montagem × assinatura e a concorrência padrão de 256;
- a ordem de `flatMap` × `concatMap`;
- o `onErrorResume` dentro × fora;
- `trace=null` × `trace=abc123`;
- a mensagem do BlockHound e a necessidade da flag no JDK 25;
- `StepVerifier` com tempo virtual;
- `spring.threads.virtual.enabled` no Boot 4.1.2;
- a ausência de *timeout* padrão no `WebClient`.

O projeto de conferência termina com 25 testes verdes, em duas rodadas seguidas.
