---
id: runtime-web-e-virtual-threads
title: "Runtime web: MVC, WebFlux e virtual threads"
summary: "O modelo de thread do Tomcat, quando WebFlux compensa (e quando é complexidade gratuita) e virtual threads como o terceiro caminho em Java 21 — com seus novos gargalos."
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

## Virtual threads: o terceiro caminho (Java 21)

*Virtual threads* (Project Loom, estável no Java 21) dão o **modelo de programação
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
quase sempre o caminho certo em Java 21.

Mas há armadilhas que separam quem leu a doc de quem só ligou a flag:

- O **pinning** acontece quando a virtual thread bloqueia dentro de um bloco
  `synchronized` (ou de código nativo): ela **não desmonta** e prende a carrier, matando
  o ganho. No **Java
  21, que é a baseline deste curso, isso ainda acontece** com qualquer `synchronized`
  que envolva espera; a correção veio no **Java 24** (JEP 491), que deixa a virtual
  thread desmontar dentro de `synchronized`. Até migrar, prefira `ReentrantLock` no seu
  código e descubra o pinning das bibliotecas com o JFR, que registra o evento
  `jdk.VirtualThreadPinned` com a pilha de quem prendeu a carrier:

  ```bash
  java -XX:StartFlightRecording=filename=pin.jfr,settings=profile -jar app.jar
  jfr print --events jdk.VirtualThreadPinned pin.jfr
  ```
- O **pool de JDBC vira o novo gargalo.** Virtual threads removem o limite de *threads*,
  mas o HikariCP continua com N conexões. Se 10 mil virtual threads correrem para um
  pool de 20 conexões, 9.980 esperam. O ponto de contenção só **mudou de lugar** — de
  threads para conexões. Dimensione o pool conscientemente.

## Exemplo numa fintech

Um endpoint do **pix-gateway** faz *fan-out* para **3 PSPs** para cotar a melhor rota
de liquidação — três chamadas HTTP, majoritariamente espera. No modelo thread-per-
request, cada requisição prende uma thread de plataforma durante as três chamadas; 200
requisições concorrentes saturam o pool. Com `spring.threads.virtual.enabled=true`, as
mesmas requisições rodam em virtual threads que desmontam durante o I/O, e o throughput
sob concorrência salta sem uma única mudança de código — desde que o pool de conexões
para as gravações acompanhe.

## Mão na massa

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

**Invariantes testáveis.** Os números variam com a máquina; a forma, não. Na verificação
deste marco:

| Endpoint | Threads de plataforma (20) | Virtual threads |
| --- | --- | --- |
| `/quotes` (transação só no `INSERT`) | ~3,6 s, pico de *pending* 0 | ~0,6 s, pico 0 |
| `/quotes-tx` (transação em volta do I/O) | ~12,3 s, pico 16 | ~12,3 s, pico 190 |

- Com a transação só na escrita, virtual threads derrubam o tempo total várias vezes e o
  pool nunca enfileira: o gargalo eram as 20 threads do Tomcat.
- Com a transação segurando a conexão durante o I/O, virtual threads **não ganham nada**
  e o pico de `pending` sobe para perto das 200 requisições: a fila saiu das threads e
  foi para as 5 conexões do pool. Aumentar o pool só adia a parede; o conserto é tirar o
  I/O de dentro da transação.

**Checagem.** Por que, no cenário de *fan-out*, ligar virtual threads sem mexer no pool
do HikariCP pode **não** melhorar a latência de uma requisição que também grava no
banco — e em qual das duas linhas da tabela isso acontece?

## Principais aprendizados

- MVC/Tomcat é **thread-per-request**: simples de depurar, mas uma thread bloqueada por
  request limita a escala em cargas I/O-bound.
- **WebFlux** escala com poucas threads, mas exige stack reativo inteiro e paga em
  complexidade — justifique-o por requisito, não por moda.
- **Virtual threads (Java 21)** dão o modelo simples do MVC com escala de assíncrono;
  `spring.threads.virtual.enabled=true`, sem reescrever.
- Cuidado com **pinning** (`synchronized` ainda prende a carrier no Java 21; o JFR mostra
  onde) e lembre que o **pool JDBC** passa a ser o novo gargalo — meça
  `hikaricp.connections.pending`.
