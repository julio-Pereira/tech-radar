---
id: runtime-web-e-virtual-threads
title: "Runtime web: MVC, WebFlux e virtual threads"
summary: "O modelo de thread do Tomcat, quando WebFlux compensa (e quando é complexidade gratuita) e virtual threads como o terceiro caminho em Java 25 — com seus novos gargalos."
estimatedMinutes: 35
references:
  - title: "Spring Boot Reference — Virtual Threads"
    url: https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html
  - title: "Spring Framework — Web MVC vs WebFlux"
    url: https://docs.spring.io/spring-framework/reference/web-reactive.html
  - title: "JEP 444 — Virtual Threads"
    url: https://openjdk.org/jeps/444
  - title: "JEP 491 — Synchronize Virtual Threads without Pinning"
    url: https://openjdk.org/jeps/491
  - title: "JEP 506 — Scoped Values"
    url: https://openjdk.org/jeps/506
---

## O modelo tradicional: thread-per-request no Tomcat

No Spring MVC sobre Tomcat, cada requisição ocupa **uma thread de plataforma** (um
thread do SO) do início ao fim. O pool padrão tem ~200 threads. Enquanto o handler
espera I/O — uma chamada HTTP ao PSP, uma query — **a thread fica bloqueada, parada,
consumindo memória de stack sem fazer nada**. Sob um endpoint que faz muito I/O, você
esgota as 200 threads e as requisições novas enfileiram, mesmo com CPU ociosa. O modelo
é simples de programar e depurar (stack traces lineares, `ThreadLocal` funciona), mas
escala mal quando o trabalho é dominado por espera.

## WebFlux: reativo, poderoso e caro

O Spring WebFlux inverte o modelo: um punhado de threads de *event loop* — cada uma num
laço que pega o próximo evento pronto (dados chegaram, conexão abriu) e processa sem
nunca esperar — atende todas as conexões. O I/O é assíncrono e o resultado chega via
`Mono`/`Flux`. Com poucas threads você sustenta dezenas de milhares de conexões — ideal
para *streaming*, muitas conexões lentas, ou *back-pressure* real (o consumidor lento
consegue dizer ao produtor "mande menos", em vez de ser soterrado).

O custo é alto e honesto: **todo o stack precisa ser reativo** (driver R2DBC, a versão não bloqueante do acesso a
banco, no lugar
do JDBC, clients não-bloqueantes), stack traces viram um quebra-cabeça, `ThreadLocal`
para de funcionar (contexto anda no `Context` do Reactor), e a curva de aprendizado do
time é real. Para o CRUD transacional típico de uma fintech — request entra, fala com
banco, responde — **WebFlux costuma ser complexidade gratuita**. Escolha-o por um
requisito concreto (streaming, milhares de conexões idle), não por modismo.

## Virtual threads: o terceiro caminho

*Virtual threads* (Project Loom, finais desde o Java 21) dão o **modelo de programação
simples do MVC com a escalabilidade do assíncrono**. São threads leves gerenciadas pela
JVM: milhões cabem na memória. Quando uma virtual thread bloqueia em I/O, a JVM a
**desmonta** da thread de plataforma (a *carrier*), que fica livre para outra virtual
thread. Você escreve código bloqueante, linear, com `try/catch` e `ThreadLocal`
normais — e ele escala como reativo.

```
  █ = usando CPU     ░ = parada no I/O, segurando a thread

  uma thread de plataforma por requisição (Tomcat, 200 threads)
  T1  ██ espera PSP ░░░░░░░░░░░░░░ ██
  T2  ██ espera PSP ░░░░░░░░░░░░░░ ██
  ... a requisição 201 espera uma thread livre

  virtual threads (milhares) sobre poucas carriers
  carrier 1  [VT1 ██][VT2 ██][VT3 ██][VT1 ██][VT4 ██] ...
  carrier 2  [VT5 ██][VT6 ██][VT2 ██][VT7 ██] ...
  VT1 bloqueou no I/O → desmontou; a carrier 1 pegou a VT2.
  O I/O de VT1 voltou → ela é montada de novo, em qualquer carrier.
```

No Boot, é uma linha:

```properties
spring.threads.virtual.enabled=true
```

O Tomcat passa a servir cada request numa virtual thread. Nenhuma reescrita, nenhum
`Mono`. Para o pix-gateway — I/O-bound (PSP, banco), lógica transacional — este é
quase sempre o caminho certo em Java 25, a baseline deste curso.

Mas há armadilhas que separam quem leu a doc de quem só ligou a flag:

- O **pinning** acontece quando a virtual thread bloqueia sem conseguir desmontar e
  prende a carrier até o bloqueio acabar, matando o ganho. Por anos o caso clássico foi
  o bloqueio dentro de `synchronized`, mas no **Java 25 ele não prende mais**: o Java 24
  (JEP 491) passou a desmontar a virtual thread dentro de `synchronized` e em
  `Object.wait()`. O conselho "troque todo `synchronized` por `ReentrantLock`" deixou de
  ser regra geral. O que **ainda** prende é a chamada a código nativo (JNI ou FFM) que
  volta para Java e bloqueia — raro em código de aplicação, possível em drivers e
  bibliotecas com partes nativas. Para achar esses casos, o JFR registra o evento
  `jdk.VirtualThreadPinned` com a pilha de quem prendeu a carrier. O limiar padrão do
  evento é 20 ms, e um bloqueio curto passa despercebido; para investigar, zere-o:

  ```bash
  java "-XX:StartFlightRecording=filename=pin.jfr,jdk.VirtualThreadPinned#threshold=0ms" -jar app.jar
  jfr print --events jdk.VirtualThreadPinned pin.jfr
  ```

  > **Se você está no Java 21:** `synchronized` em volta de I/O ainda prende a carrier.
  > Prefira `ReentrantLock` nos caminhos quentes e monitore `jdk.VirtualThreadPinned`.
- O **pool de JDBC vira o novo gargalo.** Virtual threads removem o limite de *threads*,
  mas o HikariCP continua com N conexões. Se 10 mil virtual threads correrem para um
  pool de 20 conexões, 9.980 esperam. O ponto de contenção só **mudou de lugar** — de
  threads para conexões. Dimensione o pool conscientemente.

## Contexto por requisição: `ScopedValue` em vez de `ThreadLocal`

`ThreadLocal` continua funcionando em virtual threads, mas foi desenhado para poucas
threads de vida longa. Com uma virtual thread por requisição, usá-lo como *cache* de um
objeto caro (um formatter, um buffer) cria uma cópia por thread — multiplicada por
milhares. E um `ThreadLocal` que guarda contexto precisa de um `remove()` no `finally`,
sem o qual o valor vaza para quem reusar a thread.

O `ScopedValue` (final no Java 25, JEP 506) resolve o caso do contexto: o valor é
**imutável** e vale **durante uma chamada** — terminado o bloco, ele some sozinho, sem
`remove()` esquecido e sem vazamento entre requisições:

```java
static final ScopedValue<String> TENANT = ScopedValue.newInstance();

// no controller, na entrada da requisição: o valor vale só durante esta chamada
return ScopedValue.where(TENANT, instituicao).call(() -> service.initiate(idemKey, req));

// em qualquer ponto abaixo dela, sem passar parâmetro
String tenantId = TENANT.get();
```

O `call` propaga um único tipo de exceção checada. Num filtro de servlet, cujo
`doFilter` lança `IOException` e `ServletException`, o compilador junta as duas em
`Exception` — por isso o ponto natural de entrada é o controller ou o service, não o
filtro.

Uma honestidade obrigatória: o próprio Spring ainda guarda **o contexto dele** em
`ThreadLocal` — a transação (`TransactionSynchronizationManager`, o mesmo mecanismo do
marco 05), a autenticação (`SecurityContextHolder`) e o MDC dos logs. `ScopedValue` é para o
**seu** contexto, como o `tenantId` da instituição participante no pix-gateway; ele não
substitui o do framework.

> **Se você está no Java 21:** `ScopedValue` é preview e exige `--enable-preview`.
> Continue com `ThreadLocal` e garanta o `remove()` num `finally`.

## Paralelizar o fan-out

Virtual threads escalam **requisições**; a latência de **uma** requisição que chama três
PSPs em sequência continua sendo a soma das três. Para paralelizar as chamadas dentro da
requisição, abra um executor de virtual threads só para elas:

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var a = executor.submit(() -> cotar("psp-a"));
    var b = executor.submit(() -> cotar("psp-b"));
    var c = executor.submit(() -> cotar("psp-c"));
    return melhor(a.get(), b.get(), c.get());   // latência ≈ a da chamada mais lenta
}   // o close() espera as três: nenhuma thread vaza da requisição
```

O `StructuredTaskScope` (JEP 505) foi feito exatamente para esse fan-out: cancela as
outras chamadas quando uma falha e amarra o tempo de vida das subtarefas ao bloco. Mas
ele segue em **preview** no Java 25 (e no 27), e esta trilha não usa `--enable-preview`:
um artefato regulado não deve depender de uma API que muda entre versões. O executor acima
é final, estável e já entrega a maior parte do benefício.

> **Reencontro adiante — `concorrencia-e-recursos/06`.** Quando a thread fica barata, o que
> sobra é limitar a concorrência por recurso e cancelar a tempo: interrupção cooperativa,
> *structured concurrency* a fundo (lá, sim, num Complemento com preview) e a comparação
> com o `context` do Go.

## Exemplo numa fintech

Um endpoint do **pix-gateway** faz *fan-out* para **3 PSPs** para cotar a melhor rota
de liquidação — três chamadas HTTP, majoritariamente espera. No modelo thread-per-
request, cada requisição prende uma thread de plataforma durante as três chamadas; 200
requisições concorrentes saturam o pool. Com `spring.threads.virtual.enabled=true`, as
mesmas requisições rodam em virtual threads que desmontam durante o I/O, e o throughput
sob concorrência salta sem uma única mudança de código — desde que o pool de conexões
para as gravações acompanhe.

## Mão na massa

**Pré-requisito do estado do pix-gateway:** o do marco 06: `V2__idempotency_and_outbox.sql`, serviço de idempotência insert-first, relay do outbox e Kafka na `TestcontainersConfiguration`.

**Desafio — achar onde a fila se forma.** Monte o *fan-out* do exemplo e meça, com e
sem virtual threads, onde as requisições esperam.

1. Crie `POST /quotes`: três chamadas `GET /quote/{psp}` via `RestClient` (uma por PSP)
   e, no fim, um `INSERT` da rota escolhida. Crie também `POST /quotes-tx`, idêntico,
   mas anotado com `@Transactional` e com uma consulta qualquer (`select 1`) **antes** das
   chamadas — o antipadrão do marco 05: a conexão fica presa durante o I/O. O
   `RestClient.Builder` vem de um starter próprio no Boot 4, e o WireMock entra como
   dependência de teste (o mesmo do marco 08):

   ```xml
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-restclient</artifactId>
   </dependency>
   <dependency>
     <groupId>org.wiremock</groupId>
     <artifactId>wiremock-standalone</artifactId>
     <version>3.13.1</version>
     <scope>test</scope>
   </dependency>
   ```

   Construa o client com `.requestFactory(new SimpleClientHttpRequestFactory())`: o
   client padrão pode negociar HTTP/2 com o WireMock e, sob 200 requisições
   simultâneas, falhar com `too many concurrent streams` — ruído que não é o que você
   quer medir.
2. Num teste `@SpringBootTest(webEnvironment = RANDOM_PORT)`, faça o WireMock responder
   cada PSP com `withFixedDelay(100)` e aperte os recursos para a fila aparecer rápido:

   ```properties
   spring.datasource.hikari.maximum-pool-size=5
   server.tomcat.threads.max=20
   ```

3. Dispare **200 requisições simultâneas** em cada endpoint, com
   `spring.threads.virtual.enabled=false` e depois `=true`. Durante a carga, amostre a
   cada 10 ms o gauge `hikaricp.connections.pending` (as threads esperando conexão) pelo
   `MeterRegistry` injetado no teste, e guarde o pico e o tempo total.
4. Por último, o pinning: dentro de uma virtual thread, envolva uma chamada ao PSP lento
   do WireMock num bloco `synchronized` e rode 50 delas com o JFR ligado e o limiar de
   `jdk.VirtualThreadPinned` zerado, como na seção de pinning.

**Invariantes testáveis.** Os números variam com a máquina; a forma, não. Na verificação
deste marco, em Java 25:

| Endpoint | Threads de plataforma (20) | Virtual threads |
| --- | --- | --- |
| `/quotes` (transação só no `INSERT`) | ~3,4 s, pico de *pending* 0 | ~0,5–1,3 s, pico 0 |
| `/quotes-tx` (transação em volta do I/O) | ~12,3 s, pico 16 | ~12,3 s, pico ~180 |

- Com a transação só na escrita, virtual threads derrubam o tempo total várias vezes e o
  pool nunca enfileira: o gargalo eram as 20 threads do Tomcat.
- Com a transação segurando a conexão durante o I/O, virtual threads **não ganham nada**
  e o pico de `pending` sobe para perto das 200 requisições: a fila saiu das threads e
  foi para as 5 conexões do pool. Aumentar o pool só adia a parede; o conserto é tirar o
  I/O de dentro da transação.
- No Java 25, o passo 4 registra **zero** eventos `jdk.VirtualThreadPinned`: o
  `synchronized` deixou de prender a carrier. Rodando o mesmo passo num Java 21, cada
  chamada gera um evento — o JEP 491 acontecendo diante de você.

**Checagem.** Por que, no cenário de *fan-out*, ligar virtual threads sem mexer no pool
do HikariCP pode **não** melhorar a latência de uma requisição que também grava no
banco — e em qual das duas linhas da tabela isso acontece?

**Gabarito.** Virtual threads removem o limite de *threads*, não o de *conexões*. Se a
transação abre antes das chamadas ao PSP, cada requisição segura uma das 5 conexões
durante todo o I/O, e as outras esperam na fila do Hikari — com threads de plataforma ou
virtuais, a vazão é a mesma: 5 requisições por vez. É a linha `/quotes-tx`: o tempo total
não muda e o pico de `hikaricp.connections.pending` salta de 16 para perto de 180, porque agora há
threads de sobra para chegar à fila. Na linha `/quotes`, a conexão só é usada no `INSERT`,
por milissegundos, e o ganho das virtual threads aparece inteiro.

## Principais aprendizados

- MVC/Tomcat é **thread-per-request**: simples de depurar, mas uma thread bloqueada por
  request limita a escala em cargas I/O-bound.
- **WebFlux** escala com poucas threads, mas exige stack reativo inteiro e paga em
  complexidade — justifique-o por requisito, não por moda.
- **Virtual threads** (finais desde o Java 21) dão o modelo simples do MVC com escala de assíncrono;
  `spring.threads.virtual.enabled=true`, sem reescrever.
- No Java 25, `synchronized` não prende mais a carrier (JEP 491); o pinning que resta vem
  de código nativo, e o JFR (`jdk.VirtualThreadPinned`) mostra onde. O **pool JDBC**
  passa a ser o novo gargalo — meça `hikaricp.connections.pending`.
- `ScopedValue` (final no 25) carrega o **seu** contexto pela chamada sem `remove()`; o
  Spring continua usando `ThreadLocal` para o dele. Paralelize o fan-out com um executor
  de virtual threads; `StructuredTaskScope` ainda é preview.
