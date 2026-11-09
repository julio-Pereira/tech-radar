---
id: ktor-interop-e-capstone
title: "Ktor, interoperabilidade e capstone do pix-status"
summary: "Ktor mostra o servidor sem mágica, e todo serviço Kotlin real convive com código Java. Ktor em uma página e o critério Ktor × Spring, o mesmo contrato HTTP passando byte a byte nos dois, Java chamando Kotlin (@JvmStatic, @JvmOverloads, @Throws, o null que falha na entrada e a List que o Java tenta alterar), migração gradual com teste de caracterização, o que levar para a entrevista, e o capstone."
estimatedMinutes: 60
reviewedAt: 2026-11-09
reviewEvery: 6m
competencies: [arquitetura]
references:
  - title: "Ktor documentation"
    url: https://ktor.io/docs/
  - title: "Kotlin: Calling Kotlin from Java"
    url: https://kotlinlang.org/docs/java-to-kotlin-interop.html
  - title: "Kotlin: Calling Java from Kotlin"
    url: https://kotlinlang.org/docs/java-interop.html
---

## Ktor em uma página

O Ktor é o *framework* de servidor da JetBrains, escrito em Kotlin e com coroutines desde a base. Não
tem container de injeção, *classpath scanning* nem proxy: a aplicação é uma função de extensão de
`Application`, e tudo o que ela faz está escrito nela.

```kotlin
fun Application.pixStatus(consulta: ConsultaStatus) {
    install(ContentNegotiation) { jackson() }
    install(StatusPages) {
        exception<PagamentoNaoEncontrado> { call, e -> call.respond(HttpStatusCode.NotFound, mapOf("erro" to e.message)) }
    }
    routing {
        get("/payments/{id}/status") { call.respond(consulta.exigir(call.parameters.getOrFail("id"))) }
    }
}

embeddedServer(Netty, port = 8080) { pixStatus(ConsultaStatus.emMemoria()) }.start(wait = true)
```

Três conceitos cobrem quase tudo:

- ***plugins*** (`install(...)`): serialização, tratamento de erro, autenticação, métricas;
- **rotas** (`routing { get(...) { } }`): o corpo de cada rota já é uma função `suspend`;
- ***engine***: Netty, CIO (em Kotlin puro) ou Jetty.

O teste usa o `testApplication { }` do `ktor-server-test-host`, ou o servidor de verdade numa porta
aleatória.

**Ktor × Spring, o critério.**

- **Ktor:** serviço pequeno, de I/O, com poucas integrações, num time que quer tudo explícito e
  *startup* curto.
- **Spring:** o resto, que é a maioria num banco. Transação declarativa, segurança, Actuator, mensageria
  e o ecossistema que o time já opera (`spring-boot`).

Um detalhe de versão: o Ktor 3.6.1 depende do `kotlinx.coroutines` 1.11.0, e o Boot 4.1.2 gerencia a
1.10.2. Num projeto Spring, o BOM do Boot vence. Num projeto Ktor puro, quem decide é o Ktor.

## O mesmo contrato, nas duas implementações

O `pix-status` existe em Spring (marco 08) e em Ktor. O que prova que os dois são o mesmo serviço é um
**teste de contrato** comum: um único arquivo, copiado nos dois projetos. Ele leva quatro pagamentos a
quatro estados, faz o `GET` e compara o corpo **byte a byte** com o esperado:

```text
200 {"pagamentoId":"A","estado":"AUTORIZADO","e2eId":"E1","motivo":null}
200 {"pagamentoId":"L","estado":"LIQUIDADO","e2eId":"E2","motivo":null}
200 {"pagamentoId":"R","estado":"REJEITADO","e2eId":null,"motivo":"saldo"}
200 {"pagamentoId":"E","estado":"ESTORNADO","e2eId":null,"motivo":null}
404
```

A saída foi a mesma no Spring 4.1.2 (Jackson 3) e no Ktor 3.6.1 (Jackson 2): ordem dos campos,
`null` explícito e `Content-Type: application/json`. O contrato pegaria qualquer diferença de
serialização entre as duas pilhas, que é onde a migração costuma quebrar o cliente.

## Java chamando Kotlin

Todo serviço Kotlin real convive com Java: uma biblioteca interna, um módulo legado, um teste antigo.
O marco 01 listou as anotações; aqui elas são provadas por um teste escrito em Java:

```java
ConsultaStatus consulta = ConsultaStatus.emMemoria();     // @JvmStatic no companion
StatusResposta s = consulta.consultar("P1");              // @JvmOverloads: sem o 2º argumento
try {
    consulta.exigir("nao-existe");
} catch (PagamentoNaoEncontrado e) { ... }                 // só compila por causa do @Throws
```

- **Exceção verificada invisível.** Kotlin não tem exceção verificada, e sem `@Throws` a assinatura
  não declara nada. Testado: o `javac` recusa o `catch` com
  `exception NaoAchou is never thrown in body of corresponding try statement`. Com
  `@Throws(NaoAchou::class)`, compila.
- **Nulidade na fronteira, na outra direção.** O compilador Kotlin põe uma checagem na entrada de
  cada parâmetro não-nulo de uma função pública. Testado: o Java chamando `consultar(null)` recebe
  `NullPointerException: Parameter specified as non-null is null: method ...consultar, parameter id`
  na hora, não três camadas depois. O Kotlin também anota a assinatura (`@NotNull`, `@Nullable`), e
  uma IDE avisa o Java.
- **Coleções.** Uma `List<String>` do Kotlin é um `java.util.List` para o Java, que vê o `add`.
  Testado: com uma lista de `listOf`, o `add` lança `UnsupportedOperationException` em tempo de
  execução. Se a lista por trás for uma `MutableList`, o Java a altera sem erro nenhum (marco 04).
  Na fronteira com Java, entregue cópias.

## Migração gradual

Kotlin e Java compilam no mesmo módulo: o Gradle compila o Kotlin primeiro, e as duas linguagens se
enxergam. Isso permite migrar classe a classe, numa ordem segura:

1. **Teste de caracterização primeiro.** Antes de tocar na classe Java, escreva testes que fixam o
   comportamento atual, inclusive o estranho. São eles que dizem se a versão Kotlin mudou alguma coisa.
2. **Das folhas para o centro.** Comece pelos tipos de valor e pelas classes sem dependentes (o
   `Money`, a `PixKey`), e deixe para o fim as classes que muitos chamam.
3. **A fronteira explícita.** Cada classe migrada que o Java ainda chama recebe as anotações de
   interop e o teste em Java que as prova.
4. **Nada de `!!` para calar o conversor.** O conversor automático da IDE produz `!!` e tipos de
   plataforma em quantidade. A regra de *build* do marco 02 obriga a decidir cada um.

## O que levar para a entrevista

- **"Por que Kotlin?"** O que a linguagem resolve (NPE como classe de bug, modelagem fechada, concorrência
  estruturada), o que ela não muda (JVM, GC, Spring) e o que custa (cor do `suspend`, compilação, a
  fronteira com Java). Marco 01.
- **"Coroutines ou *virtual threads*?"** *Virtual threads* barateiam o código bloqueante existente sem
  mudar uma linha; coroutines cobram `suspend` e dão cancelamento estruturado e `Flow`. A tabela do
  marco 05, com os números medidos.
- **"Onde o `null` ainda te pega?"** Na fronteira com Java: tipo de plataforma, JSON sem o módulo
  Kotlin, entidade com o `noarg`. Marco 02.
- **"O que quebra quando você junta Spring e Kotlin?"** Proxy em classe `final`, `@Transactional
  suspend` com JDBC, `trace_id` sem propagação. Marcos 01 e 08.

A mesma pergunta sobre Java (`java-e-jvm/11`) e sobre Go (`go-fintech/16`) tem a mesma forma de
resposta: critério, medição e custo.

## Exemplo numa fintech

Um banco migrou para Kotlin a biblioteca de consulta de status, usada por cinco serviços Java. A
primeira versão publicada removeu, sem querer, a sobrecarga de um argumento: o método Kotlin tinha um
parâmetro com valor padrão, mas sem `@JvmOverloads`. Para o Java, só existia a assinatura completa, e
três dos cinco serviços pararam de compilar ao atualizar a dependência. O teste de interop em Java,
que chama a API como os clientes chamam, entrou no *build* da biblioteca depois disso.

## Hands-on

**Tutorial.** Crie o `pix-status-ktor` com o Ktor 3.6.1 (`ktor-server-netty`,
`ktor-server-content-negotiation`, `ktor-serialization-jackson`, `ktor-server-status-pages`) e a
mesma rota de status, com a API `ConsultaStatus` pensada para ser chamada de Java.

**Desafio.** O mesmo endpoint de status em Ktor, o teste de contrato comum aos dois projetos e um
teste em Java (`src/test/java`) que usa a API Kotlin.

**Invariantes testáveis**

1. **Paridade.** O mesmo arquivo de contrato passa contra o Spring e contra o Ktor, com os quatro
   corpos iguais byte a byte e o 404.
2. **Interop limpa.** O teste em Java chama `emMemoria()`, `consultar(id)` sem o segundo argumento e
   `exigir(id)`, sem *cast*, sem `Companion`, sem `!!` (que o Java nem tem) e sem `@SuppressWarnings`.
   Um `null` passado pelo Java falha na entrada, com o nome do parâmetro.
3. **A exceção é declarada para o Java.** Compilando em memória a mesma API com e sem
   `@Throws` (`K2JVMCompiler`) e um uso Java com `catch` (`javax.tools`), a versão sem `@Throws` não
   compila (`never thrown in body of corresponding try statement`), e a versão com compila.

**Complemento.** Tire o `@JvmOverloads` de `consultar` e rode o teste em Java: ele para de compilar.
Depois troque o Jackson do Ktor pelo `kotlinx.serialization` e rode o contrato: anote o que muda no
JSON e quais opções do `Json { }` (`explicitNulls`, `encodeDefaults`) mantêm o contrato igual.

**Checagem**

1. Em que situação você escolheria Ktor em vez de Spring num banco, e o que perderia?
2. Como provar que duas implementações do mesmo serviço respondem igual?
3. O que acontece quando o Java chama uma função Kotlin com `null` num parâmetro não-nulo, e quando
   tenta capturar uma exceção que a função não declara?
4. Em que ordem você migraria um módulo Java para Kotlin, e o que vem antes de qualquer conversão?

## Principais aprendizados

- Ktor: *plugins*, rotas `suspend` e *engine*, tudo explícito. Spring quando o ecossistema importa.
- Um teste de contrato comum, com o corpo comparado byte a byte, prova a paridade entre
  implementações.
- Para o Java: `@JvmStatic`, `@JvmOverloads` e `@Throws`. A nulidade é checada na entrada, e a `List`
  do Kotlin é mutável para o Java.
- Migração: caracterização primeiro, das folhas para o centro, e a fronteira testada em Java.
- Na entrevista: critério, medição e custo, para Kotlin, coroutines e a fronteira.

## Capstone

O `pix-status` é o seu componente do `fin-platform`: o serviço de consulta de status e notificação de
pagamentos Pix, especificado no `PROJETO.md` desta trilha. Aqui ele fica pronto.

**Entrega**

- [ ] O `Money` portado do `pix-core`, com o rateio e o teste de reflexão do `kotlin-spring`
      (marco 01)
- [ ] A fronteira de entrada do evento com o módulo Kotlin do Jackson, o adaptador da biblioteca Java
      e a regra de *build* contra `!!` (marco 02)
- [ ] A máquina de estados com `sealed interface` e `PixKey`/`PaymentId` como `value class`
      (marco 03)
- [ ] A DSL de regras de notificação com `@DslMarker` (marco 04)
- [ ] O cliente de *webhook* suspenso, com prazo e limite por recebedor (marco 05)
- [ ] O agregador de status com concorrência estruturada e a regra contra o `catch` que engole
      cancelamento (marco 06)
- [ ] O pipeline de eventos com ordem por pagamento, *retry* e DLQ (marco 07)
- [ ] O serviço em Spring Boot com *controller* `suspend`, transação provada, configuração validada e
      `trace_id` (marco 08)
- [ ] A versão Ktor e o teste de interop em Java (marco 09)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] Paridade de domínio com o `pix-core`: a tabela de rateio e os 20 pares estado × evento passam
      com as mesmas tabelas do Java
- [ ] Nenhum `!!` e nenhum `catch` genérico que engula cancelamento em `src/main/kotlin`: as duas regras
      de PSI passam e reprovam as *fixtures*
- [ ] Cancelamento sem vazamento: 10 mil consultas canceladas deixam zero coroutines vivas
      (`DebugProbes`), e as três fontes cancelam no mesmo instante virtual
- [ ] *Backpressure* medido: com consumidor lento, o produtor fica no limite do *buffer*, e o `request(n)`
      do Reactor produz exatamente `n`
- [ ] Contrato HTTP idêntico em Spring e Ktor: o mesmo arquivo de contrato passa nos dois, byte a byte
- [ ] Transação provada: uma falha entre as duas gravações deixa zero linhas
- [ ] `./gradlew test` verde nos projetos Spring e Ktor, no JDK 25

**A pergunta final.** Em que ponto do seu serviço um `catch (e: Exception)` transformaria um
cancelamento em sucesso, e qual teste mostraria isso?
