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

O Spring WebFlux inverte o modelo: um punhado de *event-loop threads* nunca bloqueia;
o I/O é assíncrono e o resultado chega via `Mono`/`Flux`. Com poucas threads você
sustenta dezenas de milhares de conexões — ideal para *streaming*, muitas conexões
lentas, ou back-pressure real.

O custo é alto e honesto: **todo o stack precisa ser reativo** (driver R2DBC no lugar
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

No Boot, é uma linha:

```properties
spring.threads.virtual.enabled=true
```

O Tomcat passa a servir cada request numa virtual thread. Nenhuma reescrita, nenhum
`Mono`. Para o pix-gateway — I/O-bound (PSP, banco), lógica transacional — este é
quase sempre o caminho certo em Java 21.

Mas há armadilhas que separam quem leu a doc de quem só ligou a flag:

- **Pinning** — se a virtual thread bloqueia dentro de um bloco `synchronized` (ou de
  código nativo), ela **não desmonta** e prende a carrier, matando o ganho. O JDK
  moderno reduziu muito isso, mas bibliotecas antigas com `synchronized` em I/O ainda
  mordem. Prefira `ReentrantLock`.
- **O pool de JDBC vira o novo gargalo.** Virtual threads removem o limite de *threads*,
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

Reflita e responda por que, no cenário de *fan-out* acima, ligar virtual threads sem
aumentar o `maximum-pool-size` do HikariCP pode **não** melhorar a latência de uma
requisição que também grava no banco — e onde exatamente a fila se formou.

## Principais aprendizados

- MVC/Tomcat é **thread-per-request**: simples de depurar, mas uma thread bloqueada por
  request limita a escala em cargas I/O-bound.
- **WebFlux** escala com poucas threads, mas exige stack reativo inteiro e paga em
  complexidade — justifique-o por requisito, não por moda.
- **Virtual threads (Java 21)** dão o modelo simples do MVC com escala de assíncrono;
  `spring.threads.virtual.enabled=true`, sem reescrever.
- Cuidado com **pinning** (`synchronized`) e lembre que o **pool JDBC** passa a ser o
  novo gargalo.
