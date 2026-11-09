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
