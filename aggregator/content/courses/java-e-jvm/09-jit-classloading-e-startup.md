---
id: jit-classloading-e-startup
title: "JIT, class loading e startup"
summary: "A JVM fica rápida depois de aquecer; startup e warmup são problemas diferentes. Compilação em camadas e desotimização vistas no log, o benchmark ingênuo que mede 0 ns, o deadlock de inicialização de classe que o jstack não acusa, e o cache AOT do Java 25 medido: de 270 para 130 ms até o primeiro 200."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [performance]
references:
  - title: "JEP 483: Ahead-of-Time Class Loading & Linking"
    url: https://openjdk.org/jeps/483
  - title: "JEP 514: Ahead-of-Time Command-Line Ergonomics"
    url: https://openjdk.org/jeps/514
  - title: "JEP 515: Ahead-of-Time Method Profiling"
    url: https://openjdk.org/jeps/515
  - title: "JLS 12.4: Initialization of Classes and Interfaces"
    url: https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4
  - title: "JMH — Java Microbenchmark Harness"
    url: https://github.com/openjdk/jmh
---

## Do bytecode ao código de máquina

A JVM começa **interpretando** o bytecode. Os métodos que rodam muito são compilados em segundo plano,
em camadas (*tiered compilation*):

- **nível 0:** interpretador;
- **níveis 1 a 3:** **C1**, um compilador rápido. O nível 3 instrumenta o código para coletar
  perfil: quais tipos chegam em cada chamada, quais ramos são tomados;
- **nível 4:** **C2**, que gasta mais tempo e usa o perfil para otimizar agressivamente.

Com `-XX:+PrintCompilation`, um método quente aparece duas vezes: `Tier::total` no nível 3 e logo
depois no 4. O que o C2 faz com o perfil:

- **inlining:** a chamada a `tarifa.calcular(v)`, que só viu um tipo, vira o corpo do método no lugar
  da chamada;
- **escape analysis:** um objeto que não sai do método não é alocado no heap (marco 08);
- **eliminação de código morto:** o que não afeta o resultado é apagado.

O perfil é uma **aposta**. Quando chega um tipo que o código compilado não esperava, a aposta falha e
a JVM **desotimiza**: o código compilado é descartado (`made not entrant: uncommon trap` no log),
volta-se a interpretar, e o método é recompilado com o perfil novo. Um laço longo que já está rodando
é trocado por código compilado no meio da execução: é o **OSR** (*on-stack replacement*), marcado com
`%` no log.

## Por que o *benchmark* ingênuo mente

```java
for (int r = 0; r < 5; r++) {
    long t0 = System.nanoTime();
    for (int i = 0; i < 100_000_000; i++) tarifa(i);   // resultado descartado
    System.out.printf("rodada %d: %.3f ns por chamada%n", r, (System.nanoTime() - t0) / 1e8);
}
```

No JDK 25, as rodadas 2 a 4 deram **0,000 ns por chamada**. O resultado de `tarifa` não é usado, e
o C2 eliminou a chamada inteira (*dead code elimination*). As primeiras rodadas medem o interpretador
e o C1; as últimas medem nada. Um *benchmark* à mão erra sem avisar.

O **JMH** existe para isso: faz o aquecimento separado da medição, roda *forks* da JVM, consome os
resultados e dá o intervalo de confiança. Mesmo assim, ele mostra o efeito: um método `@Benchmark` que
descarta o resultado mediu 0,42 ns, contra 1,04 ns do que devolve o resultado, e 2,0 ns do que consome
dois resultados num `Blackhole`. A regra é sempre devolver o resultado ou passá-lo ao `Blackhole`.

## *Class loading* e inicialização

Uma classe passa por **carga** (o *classloader* encontra o `.class`), **ligação** (verificação,
preparação, resolução) e **inicialização** (o bloco `static` e os campos `static`). A inicialização é
**preguiçosa**: acontece no primeiro uso real, uma vez só, sob uma trava da própria classe. O
*holder idiom* (`private static class Holder { static final X INSTANCIA = ... }`) usa isso para um
*singleton* preguiçoso e seguro entre threads, sem `synchronized`.

Os *classloaders* trabalham por **delegação**: cada um pergunta primeiro ao pai (aplicação → plataforma
→ *bootstrap*), e só procura sozinho se o pai não achar. É o que impede uma aplicação de substituir
`java.lang.String`.

A trava da inicialização tem uma armadilha. Duas classes cujos blocos `static` dependem uma da outra,
inicializadas por duas threads ao mesmo tempo, travam para sempre: `t1` inicializa `Tarifas`, que
precisa de `Limites`; `t2` inicializa `Limites`, que precisa de `Tarifas`. No JDK 25, o `jstack`
mostra as duas threads em `RUNNABLE`, cada uma `waiting on the Class initialization monitor` da
outra, **e não reporta *deadlock***: a detecção de *deadlock* olha monitores e travas, não a
inicialização de classe. Sintoma em produção: o serviço sobe, as primeiras requisições travam, e
nada aparece no *thread dump* como *deadlock*. A prevenção é não fazer trabalho de verdade em bloco
`static`, e nunca ter dependência circular entre inicializações. O diagnóstico de *thread dump* está
em `concorrencia-e-recursos/09`.

## *Startup* × *warmup*

São dois problemas diferentes:

- ***Startup*:** o tempo até o processo atender a primeira requisição. Carregar, ligar e inicializar
  milhares de classes, ler configuração, abrir portas.
- ***Warmup*:** o tempo até o código atingir o desempenho de regime, depois que o JIT compilou os
  caminhos quentes com bom perfil.

Medido com um *driver* HTTP mínimo sobre o `pix-core` (`HttpServer` da JDK, uma rota que rateia uma
tarifa), as latências vistas pelo `curl` foram ~1,4 ms nas primeiras requisições, ~0,85 ms na
centésima e ~0,4 ms depois de 2.000. Num *rollout*, uma réplica nova recebendo tráfego cheio de
imediato atende devagar justamente quando entra. Daí a **entrada gradual de tráfego**: *readiness*
depois de um aquecimento, *slow start* no balanceador (`kubernetes/06`).

## CDS e o cache AOT

O **CDS** (*Class Data Sharing*) guarda as classes do JDK já carregadas e ligadas num arquivo mapeado
em memória, e vem ligado por padrão. O **cache AOT** do projeto Leyden estende isso às classes da
**aplicação**. Ele chegou em três JEPs:
- **JEP 483** (Java 24): carga e ligação antecipadas das classes;
- **JEP 514** (Java 25): cria o cache numa linha só, `-XX:AOTCacheOutput=app.aot` num treino;
- **JEP 515** (Java 25): guarda também o perfil de métodos, que encurta o *warmup*.

Medido no mesmo *driver*, tempo do início do processo até o primeiro 200, 7 execuções no JDK 25:

| Modo | Tempo até o primeiro 200 |
| --- | ---: |
| sem CDS (`-Xshare:off`) | 234 a 295 ms |
| CDS padrão | 165 a 200 ms |
| cache AOT (`-XX:AOTCache=driver.aot`, treinado com 2.000 requisições) | 122 a 143 ms |

A resposta funcional é a mesma nos três modos (`[33.34,33.33,33.33]`). Dois cuidados práticos. O
cache AOT exige o *classpath* em **JARs**: com diretórios de classes, a criação falha com
`non-empty directory`. E ele vale para a mesma JVM e o mesmo *classpath* do treino, então é gerado no
*build* da imagem. A alternativa radical é a **GraalVM *native image***, que compila tudo antes e sobe
em milissegundos, ao custo de um *build* longo, restrições de reflexão e um JIT ausente em regime
(`spring-boot/12`).

## Exemplo numa fintech

O `pix-gateway` sobe 20 réplicas novas no horário de pico, e cada uma entrava no balanceador assim que
a porta abria. As primeiras requisições de cada réplica estouravam o *timeout* de 1 s do cliente,
porque caíam no interpretador e em classes ainda não inicializadas. O alarme de erro disparava a cada
*deploy*. A correção teve três partes: *readiness* só depois de um aquecimento com requisições
sintéticas, cache AOT gerado no *build* para encurtar a subida, e entrada gradual de tráfego.

## Hands-on

**Tutorial.** Rode o `Tier` com `-XX:+PrintCompilation` e encontre os níveis 3 e 4, o
`made not entrant: uncommon trap` depois da troca de tipo e o OSR. Depois reproduza o *deadlock* de
inicialização com duas threads, e leia o `jstack`.

**Desafio.** Meça *startup* e *warmup* do `pix-core` com um *driver* HTTP mínimo. O tempo até o
primeiro 200 vem de um laço de `curl` disparado junto com o processo. A latência das requisições 1,
10, 100, 1.000 e 2.000 vem do `curl -w '%{time_total}'`. Meça sem CDS, com o CDS padrão e com cache
AOT.

**Invariantes testáveis**

1. O JMH reporta a mesma ordem de grandeza em três execuções do mesmo *benchmark*, com 2 *forks*
   cada; a variação entre execuções fica registrada.
2. O *benchmark* ingênuo com `System.nanoTime` é mostrado errado: a *fixture* de DCE mede ~0 ns no
   laço à mão, e o JMH mede o mesmo método devolvendo o resultado, com valor maior que zero e
   intervalo de confiança.
3. Com o cache AOT, o tempo até o primeiro 200 cai em relação ao CDS padrão, nas 7 execuções, e a
   resposta funcional é idêntica byte a byte (tabela com os três modos).

**Complemento.** Gere o cache AOT com um treino de 10 requisições e com outro de 2.000, e compare a
latência da centésima requisição. É o efeito do perfil de métodos (JEP 515).

**Checagem**

1. O que acontece com um método compilado pelo C2 quando chega um tipo que o perfil não viu?
2. Por que o laço com `System.nanoTime` mediu 0 ns, e o que o JMH faz diferente?
3. Por que o *deadlock* de inicialização de classe não aparece como *deadlock* no `jstack`?
4. Qual a diferença entre *startup* e *warmup*, e qual dos dois o cache AOT ataca?

## Principais aprendizados

- Interpretador, C1 com perfil, C2 otimizando sobre o perfil; desotimização quando a aposta falha.
- *Benchmark* à mão mente (DCE, aquecimento); use JMH, e consuma o resultado.
- Inicialização de classe é preguiçosa e travada; dependência circular entre blocos `static` trava, e
  o `jstack` não acusa.
- *Startup* e *warmup* são problemas diferentes; entrada gradual de tráfego cuida do *warmup*.
- CDS vem ligado; o cache AOT do Java 25 cortou a subida medida de ~180 para ~130 ms, com o
  *classpath* em JARs.
