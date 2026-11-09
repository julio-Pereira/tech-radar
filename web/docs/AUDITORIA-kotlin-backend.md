# Auditoria — trilha `kotlin-backend`

A trilha é um **delta sobre Java e Spring**: 9 marcos, 490 minutos, `estimatedHours: 16`,
42 questões, com o projeto guia `pix-status`. Este documento registra o que foi conferido em cada
fase, e como.

## 1. Fase 0 — versões, esqueleto e pontes

### Versões conferidas (8 nov 2026)

As versões foram lidas do `maven-metadata.xml` e dos POMs no Maven Central. As versões gerenciadas
pelo Boot vêm do `spring-boot-dependencies-4.1.2.pom`.

| Item | Mais nova estável | Gerenciada pelo Boot 4.1.2 | Decisão |
| --- | --- | --- | --- |
| Kotlin | 2.4.21 (a 2.5.0 está em Beta) | 2.3.21 | **2.3.21**, a do Boot |
| kotlinx.coroutines | 1.11.0 | 1.10.2 | **1.10.2** no Spring; o Ktor 3.6.1 depende da 1.11.0 |
| Spring Boot | 4.1.2 (a 4.2.0 está em RC) | — | **4.1.2** |
| Spring Framework | 7.0.10 | 7.0.10 | — |
| Jackson | 3.1.8 | `jackson-bom` 3.1.7 | **3.1.x**, `tools.jackson.module:jackson-module-kotlin` |
| Ktor | 3.6.1 | — | **3.6.1**; o POM do `ktor-server-core-jvm` depende do `kotlin-stdlib` 2.3.21 |
| detekt | 1.23.8 (`io.gitlab.arturbosch.detekt`) | — | a 2.0 (`dev.detekt`) ainda está em *alpha* (2.0.0-alpha.6); a escolha é do marco 02 |
| MockK | 1.14.x | — | ADR no marco 01 |
| kotlinx.serialization | — | 1.11.0 | só citada no marco 08 |

**Baseline Kotlin do Spring.** O post oficial do Spring sobre o suporte a Kotlin no Boot 4 diz que o
Spring Framework 7 e o Boot 4 passam para uma **baseline Kotlin 2.2**. O Boot 4.1 usa Kotlin 2.3,
mantendo a baseline 2.2. O mesmo post diz que bibliotecas que dependem do Spring Framework 7 devem
fixar `apiVersion` e `languageVersion` em 2.2. Ele também registra:

- a tradução automática de JSpecify para a nulidade do Kotlin;
- a propagação automática de contexto em coroutines, com `spring.reactor.context-propagation=auto`;
- o `BeanRegistrarDsl` para registrar *beans*.

**Compilado aqui.** Um projeto mínimo em Gradle 8.14.3 com toolchain JDK 25 (Temurin 25.0.4.1)
compilou e passou um teste com `runTest` e `withTimeoutOrNull(5.seconds)` em tempo virtual
(`currentTime == 5000`). O teste passou com Kotlin 2.3.21 e com Kotlin 2.4.21, usando
kotlinx.coroutines 1.10.2. O teste imprimiu `Kotlin 2.3.21 / Java 25.0.4.1+1-LTS`.

**Ainda a conferir nas fases seguintes:**

- **`suspend` com `@Transactional` no Spring 7.** A documentação de referência descreve o caminho
  programático (`TransactionalOperator.executeAndAwait`, `Flow.transactional`). A correção gh-33095
  (2024) reescreveu o tratamento de coroutines no aspecto de transação. O `docs.spring.io` não
  resolve neste ambiente, então o marco 08 prova o comportamento com um teste, em vez de citar.
- **Controllers `suspend` no MVC e no WebFlux.** O mesmo post lista o suporte nativo no Spring MVC,
  sem a ponte reativa, como item futuro. O marco 08 prova o que funciona onde.
- **Regra de "nenhum `!!`".** A regra `UnsafeCallOnNullableType` do detekt 1.x exige resolução de
  tipos. O marco 02 decide entre o detekt e um teste que varre o código-fonte.
- **Contagem de coroutines vivas.** O marco 06 verifica o `kotlinx-coroutines-debug`
  (`DebugProbes`) na versão 1.10.2.

### URLs das fontes

- **`kotlinlang.org/docs/home.html` e `kotlinlang.org/docs/coroutines-guide.html`:** HTTP 200 daqui.
- **`spring.io/blog/2025/12/18/next-level-kotlin-support-in-spring-boot-4/`:** HTTP 200 daqui, e o
  texto foi lido.
- **`github.com/Kotlin/kotlinx.coroutines`:** o *proxy* deste ambiente bloqueia o `github.com`. O
  repositório é o oficial do projeto.
- **`docs.spring.io/.../languages/kotlin.html` e `ktor.io/docs/`:** não resolvem neste ambiente. A
  existência foi conferida por busca:
  - `docs.spring.io/spring/reference/languages/kotlin.html` (o caminho `spring-framework/reference`
    é o mesmo site, e é o que as outras trilhas usam);
  - páginas `ktor.io/docs/...` da versão 3.6.

### Esqueleto

- **`course.yaml`:** idêntico ao §4 do plano. O único acréscimo é a menção a esta auditoria no
  comentário das horas.
- **9 stubs válidos:**
  - frontmatter com `id`, `title`, `summary` e `estimatedMinutes`, somando 490 min;
  - o 09 já tem `## Capstone` mínimo;
  - `reviewedAt` e `reviewEvery` entram com o conteúdo de cada bloco: `6m` para 05, 06, 08 e 09, e
    `12m` para os demais.
- **`PROJETO.md`:** o porquê de uma trilha própria (com o "revisitar"), as peças por marco, os
  contratos do §6 do plano e os pré-requisitos com as versões acima.
- **`GLOSSARIO.md` mínimo:** 4 verbetes. A meta da Fase 3 é ≥30.
- **`capstones.yaml`:** entra o `pix-status`, com `depends_on: [pix-gateway, pix-core]` (as linhas
  "consome" do §6). O `pix-stream` é a alternativa ao `pix-gateway` ("ou") e por isso não vira
  aresta.
- **`bridges-planned.yaml`:** saíram `kotlin-backend/01`, `/03` e `/07`.
  - As três pontes vêm de `java-e-jvm/11`, `java-e-jvm/05` e `spring-boot/13`.
  - Os stubs existem, então o `TestBridgesResolve` as resolve de verdade.

### Testes

- **`sections_test.go`:** os 9 stubs entram em `wantNoSection` e saem à medida que cada bloco é
  escrito.
- **Golden de cobertura do glossário:** `kotlin-backend 4/4`.
- **`capstone.spec.js`:** 23 componentes.

## 2. Fase 1 — Bloco A (marcos 01 a 04)

Os quatro marcos ganharam o texto completo, os cinco blocos de Hands-on, os quizzes com 4, 6, 4 e 4
questões e 19 verbetes de glossário (23 no total). `reviewEvery` é `12m` nos quatro.

### Código conferido

Todo o código dos tutoriais e dos invariantes foi escrito num projeto `pix-status` de verificação,
com estas versões:

- Gradle 8.14.3, Kotlin 2.3.21 e toolchain JDK 25;
- Jackson 3.1.7 com o módulo Kotlin, JUnit 6.0.3 e AssertJ 3.27.7, as versões do Boot 4.1.2;
- `kotlin-compiler-embeddable` 2.3.21 nos testes.

São 32 testes, todos verdes. Os testes de "não compila" usam o `K2JVMCompiler` em memória contra o
classpath do teste. A regra de "nenhum `!!`" lê os fontes com a PSI do compilador.

| Marco | O que foi provado |
| --- | --- |
| 01 | rateio com a mesma tabela do `pix-core` (5 casos e `33.34, 33.33, 33.33`); classe sem anotação é `final`, e com `@Service` e o `kotlin-spring` não é (reflexão) |
| 01 | `@Transactional` no Spring 7.0.10 com um gerenciador de transação de teste: classe `final` → `BeanCreationException: Cannot subclass final class`; classe `open` com método `final` → contexto sobe, transação inativa, só um `WARNING`; tudo aberto → transação ativa |
| 02 | JSON sem `pagamentoId` e com `null` → `KotlinInvalidNullException` (um `MismatchedInputException`) na leitura |
| 02 | sem o módulo: `data class` não desserializa, `noarg` nasce com `null` e a NPE aparece no `uppercase()` |
| 02 | `lateinit` passa e falha no acesso; `= ""` passa em silêncio |
| 02 | tipo de plataforma → `NullPointerException: assinar(...) must not be null`; JSpecify → `initializer type mismatch: expected 'String', actual 'String?'` |
| 02 | a regra de PSI acha `x!!` na linha 3 da *fixture* e ignora o `!!` de *string* e de comentário |
| 03 | os 20 pares estado × evento com a tabela do `pix-core`; `data object Cancelado` → `'when' expression must be exhaustive. Add the 'Cancelado' branch` |
| 03 | `PixKey` inválida lança `IllegalArgumentException`; *boxing* em `Any` e `List<PixKey>`; o *bytecode* tem `registrar-mvVK3hg(String)` |
| 03 | `copy` com construtor privado compila com aviso no 2.3.21 ("vira erro na linguagem 2.5", KT-11914); com `@ConsistentCopyVisibility`, `cannot access 'fun copy(...)': it is private` |
| 04 | `@DslMarker` → `cannot be called in this context with an implicit receiver`; sem ele, compila |
| 04 | regras inválidas falham no `construir()`; extensão pelo tipo declarado × método `open` pelo tipo real |
| 04 | sobre 1 milhão de eventos, depois do aquecimento: `List` + `take(10)` aloca 11,3 MB e `Sequence` 448 B; a soma com `Sequence` + `map` variou de 152 B a 6 MB entre execuções (a caixa do `Long` até o JIT otimizar); `sumOf` aloca 24–56 B e `mapToLong` 392 B |

Todos os trechos de código dos quizzes foram compilados e executados, e os resultados estão nas
explicações. Por exemplo: `[m1, f2, m2, f4]` × `[m1, m2, m3, f2, f4, f6]`, `ab 1 c`, `-1`, `true false`
e o cache de `Long` (`127` idêntico, `128` não).

### Decisões e desvios do plano

- **Exemplo do marco 01.** O plano pressupunha que uma classe `final` deixa o `@Transactional` sem
  efeito em silêncio. O teste mostrou que a classe `final` derruba o *startup*; o caso silencioso é o
  método `final` numa classe aberta à mão. O exemplo e a checagem usam o comportamento medido.
- **Exemplo do marco 02.** A "NPE longe dali" do plano acontece com a classe do plugin `noarg` (o que
  o `kotlin-jpa` gera) desserializada sem o módulo Kotlin. Com o módulo, a falha é na leitura. O
  marco mostra as cinco formas lado a lado.
- **"Nenhum `!!`" (marco 02).** A regra é um teste com a PSI do compilador, não o detekt. A regra
  `UnsafeCallOnNullableType` do detekt exige resolução de tipos, e o detekt 1.23.8 depende do Kotlin
  2.0.21; a linha 2.0, que acompanha o Kotlin atual, ainda é *alpha*.
- **Bibliotecas de asserção.** JUnit 6 e AssertJ, com a escolha registrada numa ADR do Tutorial do
  marco 01. O Kotest fica como alternativa citada.

## 3. Fase 2 — Bloco B (marcos 05 a 07)

Os marcos 05, 06 e 07 ganharam o texto completo, os cinco blocos de Hands-on e quizzes de 6, 6 e 4
questões. O glossário ganhou 18 verbetes e chegou a 41. O `reviewEvery` é `6m` em 05 e 06, e `12m`
em 07.

### Código conferido

O projeto de verificação `pix-status` ganhou:

- `kotlinx-coroutines-core`, `-reactor`, `-test` e `-debug` 1.10.2, a versão do Boot 4.1.2;
- BlockHound 1.0.18.

Cada classe de teste roda numa JVM própria (`forkEvery = 1`), porque o BlockHound é global. São
53 testes, todos verdes.

| Marco | O que foi provado |
| --- | --- |
| 05 | 10 mil entregas HTTP reais, para 100 recebedores, a um `HttpServer` do JDK que responde em 200 ms, com 2 threads e limite de 50 por recebedor: 3,8 s, todas 200, e o pico medido no recebedor ficou no limite |
| 05 | o mesmo cliente bloqueante (`HttpClient.send`) em `Dispatchers.Default`, com 4 threads: 200 entregas em 10,1 s |
| 05 | prazo de 5 s com `runTest`: `Expirou`, `currentTime = 5000` e 5 ms de tempo real |
| 05 | `Semaphore(7)` com mil entregas: pico exatamente 7, em 28,6 s virtuais |
| 05 | BlockHound com a integração do `kotlinx-coroutines-debug`: `Thread.sleep` no `Default` lança `BlockingOperationError: Blocking call! java.lang.Thread.sleepNanos0`, e no IO passa |
| 05 | memória por unidade parada, com 100 mil de cada: coroutine ~370 B, *virtual thread* ~994 B (JDK 25), goroutine ~2.695 B, dos quais 2.052 B de pilha (Go 1.24.7, o Go disponível neste ambiente) |
| 06 | o cliente cancela aos 150 ms (tempo virtual), e as três fontes registram o cancelamento aos 150 ms |
| 06 | falha opcional → `null` e as irmãs continuam; falha obrigatória → as opcionais são canceladas no mesmo instante; opcional lenta → `null` aos 300 ms |
| 06 | `catch (e: Exception)` em volta de `delay`: a coroutine cancelada aos 250 ms roda as 50 voltas; com `ensureActive()` no `catch`, para em 2 |
| 06 | laço de CPU de 300 ms em `withTimeoutOrNull(50)`: sem `ensureActive`, `terminou` em 300 ms; com ele, `null` em 52 ms |
| 06 | `DebugProbes`: 10 mil consultas deram 40 mil coroutines vivas no meio e 0 depois do cancelamento |
| 06 | regra de PSI: acusa só o `catch` genérico que engole, entre cinco variantes da *fixture* |
| 07 | pendentes máximos com consumidor de 10 ms: 1 sem *buffer* e 18 com `buffer(16)`; `conflate` coletou `[0, 3, 6, 9]` |
| 07 | ordem por pagamento com 8 partições: mil eventos de 50 pagamentos, todos em ordem, pico de concorrência 8; com `flatMapMerge(8)`, 31 dos 50 ficaram fora de ordem |
| 07 | retry com *backoff*: transitório entregue na terceira tentativa, permanente na DLQ com 1 tentativa, o que esgota na DLQ depois de 4; tempo virtual 1.000 ms |
| 07 | frio executa por coletor (2) e `shareIn` uma vez (1); `withContext` dentro do `flow { }` lança `Flow invariant is violated` |
| 07 | `asFlux()` com `request(5)`: 5 recebidos e 5 produzidos; `Flux.range(1, 3).asFlow()` dá `[1, 2, 3]` |

Os trechos dos quizzes foram executados, e cada explicação traz o resultado:

- a ordem `[D, A, C, B]`;
- o `async` em paralelo (1.000 ms) e com `await` imediato (2.000 ms);
- `[B cancelado, scope: A falhou]` × `[handler: C falhou, D terminou]`;
- o `withTimeout` dentro de `launch`, que cancela em silêncio e não chama o *handler*;
- o *handler* que só vale na raiz;
- as threads do `flowOn`.

### Decisões

- **Linter de `CancellationException`.** É um teste de PSI, como o de `!!` do marco 02, pelo mesmo
  motivo (detekt).
- **Linguagens da tabela.** A tabela coroutines × *virtual threads* × goroutines junta a documentação
  com as medições acima. A preempção assíncrona das goroutines é a do Go 1.14 em diante.
- **Revisão independente.** A revisão dos marcos 05 e 06 fica para a Fase 4, como no plano.

## 4. Fase 3 — Bloco C (marcos 08 e 09), capstone e conceitos

Os marcos 08 e 09 estão completos, com os cinco blocos de Hands-on e quizzes de 4 questões cada. O
marco 09 tem o `## Capstone`, com a entrega, os critérios de pronto e a pergunta final do plano.

- **Glossário:** ganhou 9 verbetes, na seção "No servidor". São 50 no total.
- **`conceitos.yaml`:** ganhou `tipo-de-plataforma` (dono `kotlin-backend/02`) e
  `concorrencia-estruturada` (dono `kotlin-backend/06`).
- **`wantNoSection`:** voltou a ficar vazio.

### Código conferido

Foram usados dois projetos de verificação novos, além do `pix-status` das fases anteriores.

**`pix-status-boot`**: Spring Boot 4.1.2 com WebFlux, R2DBC/H2, validation, o *starter* de
OpenTelemetry, o módulo Kotlin do Jackson 3, `kotlinx-coroutines-reactor`, BlockHound e MockK
1.14.12. São 8 testes, todos verdes:

- o `GET /payments/{id}/status` devolve o estado certo depois de cada uma das 5 transições, e 404
  para pagamento inexistente;
- `@Transactional suspend` com R2DBC: a falha entre as duas gravações deixa 0 eventos;
- o `trace_id` aparece na linha de log escrita depois do `delay`, em outra thread
  (`trace_id=f0d7e37b...`), com `spring.reactor.context-propagation=auto`;
- com o BlockHound instalado, 20 consultas passam sem `BlockingOperationError`;
- `limite-por-recebedor=0` impede o *startup*, com `ConfigurationPropertiesBindException` e
  `Binding validation errors`, apontando `limitePorRecebedor`;
- o `BeanRegistrarDsl` registra o *bean*;
- o MockK simula a função `suspend` com `coEvery` e confere com `coVerify`;
- o teste de contrato passa.

**`pix-status-mvc`**: Spring Boot 4.1.2 com Spring MVC e JDBC/H2.

- O *controller* `suspend` funciona: começa em `http-nio-...-exec-1` e continua numa thread do
  `kotlinx.coroutines` depois do `delay`.
- **`@Transactional suspend` com o `JdbcTransactionManager`:** o log de `TRACE` mostra
  `Creating new transaction` e `Completing transaction` antes do `insert`. Com a falha, a linha
  ficou gravada (1 → 2), e nada foi desfeito nem avisado.
- O mesmo método sem `suspend` faz o *rollback* normal.

**`pix-status-ktor`**: Ktor 3.6.1 com Netty, `ktor-serialization-jackson` (Jackson 2) e StatusPages.
São 4 testes, todos verdes:

- o mesmo arquivo de contrato que roda no Spring. Os quatro corpos e o 404 deram as mesmas linhas
  nos dois projetos, por exemplo
  `{"pagamentoId":"R","estado":"REJEITADO","e2eId":null,"motivo":"saldo"}`;
- o teste em Java chama `ConsultaStatus.emMemoria()` (`@JvmStatic`), `consultar("P1")`
  (`@JvmOverloads`) e `exigir(id)` com `catch` da exceção verificada (`@Throws`);
- o `null` passado pelo Java falha com `Parameter specified as non-null is null: method
  ...consultar, parameter id`;
- `add` numa lista de `listOf` lança `UnsupportedOperationException`;
- com `K2JVMCompiler` e `javax.tools`, a API sem `@Throws` deixa o `catch` Java sem compilar
  (`exception NaoAchou is never thrown in body of corresponding try statement`), e com `@Throws`
  compila.

### Decisões e desvios do plano

- **`@Transactional` com `suspend`.** O plano pedia para conferir suporte e limites. O teste mostrou
  que a anotação funciona com o gerenciador reativo e falha em silêncio com o JDBC. O marco 08 traz
  a tabela e as duas regras práticas, e o Exemplo numa fintech usa esse caso.
- **Contrato byte a byte.** As duas pilhas usam versões diferentes do Jackson (3 no Boot 4, 2 no
  Ktor). Por isso o contrato compara o texto do corpo, e não um mapa desserializado, o que também
  pega a ordem dos campos e o `null` explícito.
- **Fontes do marco 08.** O `docs.spring.io` não resolve neste ambiente. As URLs da referência foram
  conferidas por busca (§1), e todo comportamento citado no marco foi testado aqui.
