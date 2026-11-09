---
id: spring-com-kotlin
title: "Spring com Kotlin"
summary: "O Spring trata Kotlin como cidadão de primeira classe; o que exige atenção são as fronteiras com proxy, transação, JPA e nulidade. Controllers suspend no WebFlux e no MVC, o @Transactional em função suspend que funciona com R2DBC e vira decoração com JDBC (medido no Spring 7.0.10), bean DSL do Spring 7, @ConfigurationProperties imutável que barra o startup, o trace_id que atravessa o suspend, BlockHound e MockK."
estimatedMinutes: 60
reviewedAt: 2026-11-09
reviewEvery: 6m
competencies: [arquitetura, confiabilidade]
references:
  - title: "Spring Framework — Kotlin support"
    url: https://docs.spring.io/spring-framework/reference/languages/kotlin.html
  - title: "Spring Framework — Coroutines"
    url: https://docs.spring.io/spring-framework/reference/languages/kotlin/coroutines.html
  - title: "Spring blog — Next level Kotlin support in Spring Boot 4"
    url: https://spring.io/blog/2025/12/18/next-level-kotlin-support-in-spring-boot-4/
  - title: "MockK"
    url: https://mockk.io/
---

## O que o Spring já resolve, e o que fica com você

O Spring Boot 4 usa Kotlin 2.2 como versão mínima, e o Boot 4.1 traz o Kotlin 2.3. O suporte vai além
de "compila":

- **Nulidade:** as APIs do Spring 7 são anotadas com JSpecify, e o Kotlin vê `String?` onde o Spring
  pode devolver `null` (marco 02).
- **Extensões Kotlin:** `awaitSingle`, `awaitOneOrNull` e `bodyToMono<T>()` reificado estão no próprio
  *framework*.
- **Coroutines nos *controllers*:** funções `suspend` e `Flow` como tipos de retorno.
- **DSLs:** de rotas e de registro de *beans*.

Mas quatro fronteiras continuam com você: proxy (marco 01), transação, JPA e propagação de contexto.
É delas que este marco trata.

## Plugins: `kotlin-spring` e `kotlin-jpa`

O **`kotlin-spring`** abre as classes anotadas do Spring e os membros delas. No marco 01, a tabela
medida mostrou o que acontece sem ele: a classe `final` derruba o *startup*, e o método `final` numa
classe aberta à mão perde o `@Transactional` em silêncio.

O **`kotlin-jpa`** gera um construtor sem argumentos para as classes com `@Entity`, `@Embeddable` e
`@MappedSuperclass`, que o Hibernate precisa para instanciar. Ele não abre a classe. Para o *lazy
loading* por proxy, a entidade também precisa ser aberta, com o `all-open` configurado para as
anotações do JPA. O construtor gerado não existe para o seu código, mas existe para o Jackson: é a
armadilha do marco 02, com o `null` num campo não-nulo. Por isso a entidade não é o DTO de entrada, e
não é `data class` (marco 03).

## *Controllers* `suspend` no WebFlux e no MVC

No WebFlux, uma função `suspend` no *controller* é a forma idiomática. O *framework* faz a ponte para o
`Mono` (o `kotlinx-coroutines-reactor` precisa estar no *classpath*), e um retorno `Flow<T>` vira um
`Flux` com *backpressure* (marco 07):

```kotlin
@GetMapping("/payments/{id}/status")
suspend fun status(@PathVariable id: String): StatusResposta =
    service.buscar(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "pagamento $id não encontrado")
```

No **Spring MVC**, a mesma função `suspend` também funciona. Testado com o Boot 4.1.2 e o Tomcat: a
requisição começa na thread `http-nio-...-exec-1` e, depois de um `delay`, continua numa thread do
`kotlinx.coroutines`. O MVC usa o processamento assíncrono do Servlet, e a ponte ainda passa pelo
Reactor; o post do Spring sobre o Boot 4 lista o suporte nativo no MVC, sem essa ponte, como trabalho
futuro. Na prática: com MVC e *virtual threads* (`spring-boot/07`), o código bloqueante simples
resolve; `suspend` no MVC compensa quando há concorrência estruturada dentro da requisição (o
agregador do marco 06).

## `@Transactional` com `suspend`: depende do gerenciador

Esta é a fronteira que mais engana. O mesmo `@Transactional` numa função `suspend`, testado no Spring
Framework 7.0.10, gravando duas linhas e falhando entre elas:

| Gerenciador de transação | O que aconteceu |
| --- | --- |
| R2DBC (`ReactiveTransactionManager`), WebFlux | a falha desfez as duas gravações: zero linhas |
| JDBC (`JdbcTransactionManager`), MVC | a transação foi aberta e **concluída antes** do corpo rodar; a gravação aconteceu fora dela, e a linha ficou no banco depois da falha |
| JDBC, a mesma função sem `suspend` | *rollback* normal |

O log de `TRACE` mostra a sequência: `Creating new transaction`, `Completing transaction`, e só depois o
`insert` e a exceção. Nenhum aviso. O motivo: para uma função `suspend`, o aspecto de transação trata a
chamada como reativa e precisa de um `ReactiveTransactionManager`. Com o gerenciador JDBC, ele abre e
fecha a transação em volta da criação da coroutine, não da execução dela.

As regras práticas:

- Com **R2DBC** (ou outro *driver* reativo), `@Transactional` em `suspend` funciona, e
  `TransactionalOperator.executeAndAwait { }` é a forma programática.
- Com **JDBC/JPA**, a função transacional **não** é `suspend`. A coroutine chama uma função comum, num
  `withContext(Dispatchers.IO)`, e a transação fica inteira nessa função bloqueante.
- Em qualquer caso, **um teste de *rollback*** com uma falha no meio é a única prova aceitável.

## Configuração, *beans* e testes

**`@ConfigurationProperties` imutável.** Uma `data class` com `val` recebe a configuração pelo
construtor, e `@Validated` com `@field:Min(1)` barra o valor inválido no *startup*. Testado: com
`pix-status.webhook.limite-por-recebedor=0`, o contexto não sobe, com
`ConfigurationPropertiesBindException` e `Binding validation errors on pix-status.webhook`, apontando
`limitePorRecebedor`. O `@field:` é necessário: sem ele, a anotação vai para o parâmetro do
construtor, e o validador não a vê.

**Bean DSL.** O Spring 7 trouxe o `BeanRegistrar`, e o `BeanRegistrarDsl` é a versão Kotlin:

```kotlin
class PixStatusBeans : BeanRegistrarDsl({
    registerBean<RelogioDeNegocio>()
})

@SpringBootApplication
@Import(PixStatusBeans::class)
class Aplicacao
```

Diferente de um método `@Bean`, o registro é código comum: um `if` sobre o ambiente ou um `for` sobre
uma lista de recebedores, sem anotação condicional.

**MockK × Mockito.** O MockK foi feito para Kotlin: `coEvery { recebedor.notificar("P1") } returns 202`
simula uma função `suspend`, e `coVerify` confere a chamada. Com o Mockito, é possível usar `suspend`
com o `mockito-kotlin`, mas com mais atrito, e classes `final` exigem o *mock maker inline* (padrão
desde o Mockito 5). O critério: MockK em base Kotlin nova; Mockito quando o time e os testes já são
Java e a migração é gradual.

## O `trace_id` através do `suspend`

O `trace_id` mora no MDC, que é um `ThreadLocal`. Numa coroutine que troca de thread no `delay` ou no
`await`, ele se perderia. No Boot 4, a propriedade `spring.reactor.context-propagation=auto`, com o
`io.micrometer:context-propagation` no *classpath*, liga a propagação automática para coroutines.
Testado com o *starter* de OpenTelemetry: a linha de log escrita **depois** do `delay`, em outra
thread, saiu com `trace_id=f0d7e37b...`, o mesmo de antes da suspensão. Sem a propriedade, o padrão
é `limited`, como no `spring-boot/13`.

## Exemplo numa fintech

Um time migrou um serviço de conciliação para Kotlin, com Spring MVC e JPA, e marcou o método do
serviço como `@Transactional suspend fun conciliar(...)`, "para ficar assíncrono". Os testes de
unidade passavam, e os de integração também, porque nenhum deles falhava no meio. Em produção, um
*timeout* no segundo `save` deixou o primeiro gravado: o lote ficou meio conciliado, e o reprocessamento
duplicou lançamentos. A transação nunca tinha envolvido o corpo da função. A correção foi tirar o
`suspend` da função transacional e chamá-la com `withContext(Dispatchers.IO)`, com um teste de
*rollback* que falha no meio.

## Hands-on

**Tutorial.** Crie o `pix-status` com Spring Boot 4.1.2, `spring-boot-starter-webflux`,
`spring-boot-starter-data-r2dbc` com H2, `spring-boot-starter-validation`,
`spring-boot-starter-opentelemetry`, o módulo Kotlin do Jackson e o `kotlinx-coroutines-reactor`, com
`spring.reactor.context-propagation=auto`.

**Desafio.** O serviço em Spring Boot. Ele tem:

- o *controller* `GET /payments/{id}/status` como função `suspend`;
- o `StatusService` com `@Transactional suspend fun registrar(...)`, que aplica a máquina de estados do
  marco 03 e grava o evento e o estado juntos;
- a configuração `pix-status.webhook` imutável e validada;
- um *bean* registrado pelo `BeanRegistrarDsl`.

**Invariantes testáveis**

1. **O estado certo para toda a tabela.** O teste de integração aplica as 5 transições válidas pelo
   serviço e confere, com o `WebTestClient`, o estado devolvido pelo `GET` depois de cada uma. Um
   pagamento inexistente dá 404. Uma falha entre as duas gravações deixa **zero** eventos gravados.
2. **Nada bloqueia no caminho reativo.** Com o BlockHound instalado (como em `spring-boot/13`), 20
   consultas de status passam sem `BlockingOperationError`.
3. **Configuração inválida impede o *startup*.** Com o limite em 0, o contexto não sobe, e a mensagem
   aponta `limitePorRecebedor`.
4. **O `trace_id` chega ao log.** A linha escrita depois do `delay`, em outra thread, tem um
   `trace_id` de 32 dígitos hexadecimais, capturado com o `OutputCaptureExtension`.

**Complemento.** Monte o mesmo `@Transactional suspend` com Spring MVC e JDBC, faça-o falhar entre as
duas gravações e veja a linha ficar no banco. Ligue o `TRACE` de `org.springframework.transaction`
e leia a ordem: a transação é concluída antes do `insert`. Depois tire o `suspend` e prove o
*rollback*.

**Checagem**

1. O que o `kotlin-spring` e o `kotlin-jpa` fazem, e o que cada um **não** faz?
2. Por que o `@Transactional` em `suspend` funciona com R2DBC e não com JDBC, e como escrever a
   transação JDBC num serviço com coroutines?
3. Por que uma `data class` não serve como entidade JPA, mas serve como `@ConfigurationProperties`?
4. O que faz o `trace_id` sobreviver à troca de thread de uma coroutine no Boot 4?

## Principais aprendizados

- O Spring 7 tem nulidade JSpecify, extensões Kotlin, `suspend` e `Flow` nos *controllers* e DSLs; as
  fronteiras são proxy, transação, JPA e contexto.
- `kotlin-spring` abre o que o Spring gerencia; `kotlin-jpa` dá o construtor vazio à entidade, que não
  é DTO nem `data class`.
- `suspend` funciona no WebFlux e no MVC (com a ponte pelo Reactor).
- `@Transactional suspend` só transaciona com gerenciador reativo; com JDBC, a transação fecha antes do
  corpo, em silêncio. Prove com um teste de *rollback*.
- Configuração é `data class` imutável validada com `@field:`; inválida, o *startup* falha.
- `spring.reactor.context-propagation=auto` leva o `trace_id` através do `suspend`.
