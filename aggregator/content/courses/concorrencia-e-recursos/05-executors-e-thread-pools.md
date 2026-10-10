---
id: executors-e-thread-pools
title: "Executors e thread pools"
summary: "Um pool de threads é uma fila com servidores: dimensionar é aplicar a lei de Little, e deixar a fila ilimitada é escolher consumir memória até cair. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "Spring Boot — Task Execution and Scheduling"
    url: https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
completion: quiz
---

## Dimensionar é um cálculo, não um palpite

A primeira pergunta é se a carga é **CPU-bound** ou **I/O-bound**. Para trabalho de CPU, mais
threads que núcleos não ajudam — elas só disputam o mesmo processador. Para trabalho que espera
I/O (rede, disco, banco), a thread fica ociosa enquanto espera, e o tamanho útil do pool cresce
com a proporção de espera:

```
tamanho ≈ núcleos × (1 + tempo de espera / tempo de computação)
```

Um pool que chama um serviço externo com 80 ms de espera de rede para 5 ms de processamento local
tem uma razão de 16:1 — em 8 núcleos, isso sugere algo perto de 136 threads úteis, não 8. A fórmula
é um ponto de partida, não uma verdade absoluta: ela assume que a espera é puramente de I/O, sem
nenhuma contenção adicional entre as threads.

A segunda ferramenta é a **lei de Little**: `concorrência = taxa de chegada × tempo de
permanência`. Se chegam 200 requisições por segundo e cada uma fica 50 ms no sistema (fila +
processamento), a concorrência média é de 10 — esse é o número de "coisas em andamento" ao mesmo
tempo, e ele conecta diretamente ao tamanho do pool necessário para não acumular fila.

## Fila ilimitada é uma escolha, não um padrão seguro

O `ThreadPoolExecutor` de Java, se você não limitar a fila, aceita tarefas indefinidamente —
mesmo que todas as threads estejam ocupadas, a fila cresce sem teto até a memória acabar. É
exatamente o comportamento de `newFixedThreadPool`, um dos construtores mais citados em tutoriais,
justamente o que não trava a fila. **Fila limitada com política de rejeição** é a alternativa que
transforma "o sistema morre de memória em silêncio" em "o sistema rejeita trabalho explicitamente,
com um sinal que a aplicação pode tratar": `AbortPolicy` (lança exceção), `CallerRunsPolicy` (a
própria thread que tentou submeter executa a tarefa, criando contrapressão natural — quem está
sobrecarregando o pool sente o custo de produzir mais trabalho).

O `ForkJoinPool.commonPool()` por trás de `parallelStream()` tem seu próprio risco: é um pool
**compartilhado** por toda a JVM, dimensionado por padrão para `núcleos - 1`. Uma tarefa
bloqueante (um `parallelStream` que faz I/O, por exemplo) dentro dele rouba capacidade de
**qualquer outro** `parallelStream` rodando ao mesmo tempo em qualquer outra parte do programa —
inclusive em bibliotecas que você nem sabe que usam `parallelStream` internamente. Isso é
*starvation* compartilhada entre componentes que não têm nenhuma relação lógica entre si.

Na própria configuração padrão do Spring Boot, o executor auto-configurado para `@Async` usa 8
threads de núcleo **e fila sem limite** a menos que `spring.task.execution.pool.queue-capacity`
seja explicitamente definido — o antipadrão descrito acima é literalmente o comportamento de
fábrica, em produção, até alguém configurar o contrário.

## Isolar, limitar, e o que é mecanismo versus dimensionamento

Isolar o pool de uma dependência lenta do resto do sistema — para que um PSP degradado não
consuma todas as threads disponíveis e trave requisições que nada têm a ver com ele — é o padrão
**bulkhead**. O mecanismo de criar esse pool isolado é assunto de `spring-boot/08`; o que entra
aqui é a conta de **quanto tamanho** dar a cada pool isolado, usando a mesma fórmula de
CPU-bound/I/O-bound e a lei de Little.

**Em Go**, raramente se fala em "dimensionar um pool de goroutines" porque criar uma goroutine é
barato — o problema vira **limitar concorrência**, não alocar um número fixo de workers.
`errgroup.SetLimit(n)` e um semáforo implementado com channel bufferizado (`make(chan struct{}, n)`)
cumprem o mesmo papel que um `ThreadPoolExecutor` dimensionado: evitar que concorrência
descontrolada sature um recurso finito a jusante (um banco, uma API externa). `GOMAXPROCS`
continua controlando quantas goroutines rodam **em paralelo** na CPU, mas não limita quantas
existem esperando I/O — por isso o limite de concorrência é, em Go, quase sempre sobre o recurso
de destino, não sobre o número de goroutines em si.

> **Reencontro — `kubernetes/05`.** O `GOMAXPROCS`/número de threads úteis que a fórmula deste
> marco calcula assume os núcleos declarados — mas um `limits.cpu` de container impõe throttling
> que reduz a CPU disponível sem aparecer em nenhum gráfico de uso médio. Dimensionar o pool certo
> e ainda assim ser throttled pelo orquestrador é o motivo mais comum de "o pool está certo e o
> p99 continua ruim".

## Exemplo numa fintech

O pool que chama o PSP: 200 threads, fila ilimitada, PSP respondendo normalmente em 80 ms. No dia
em que o PSP passa a levar 800 ms, a fila que nunca tinha crescido começa a acumular — sem limite,
sem rejeição, sem sinal nenhum até a memória do processo esgotar ou o p99 de tudo (inclusive
requisições que não dependem do PSP, se o pool for compartilhado) disparar.

## Hands-on

**Tutorial.** Experimento de dimensionamento: tarefas simuladas com `sleep` (espera) mais uma
fração de CPU calibrada, variando o tamanho do pool e traçando vazão × tamanho até encontrar o
**joelho** da curva — o ponto em que aumentar o pool deixa de aumentar a vazão proporcionalmente.

**Desafio.** Um executor com fila **limitada** e política de rejeição, sob 3× a carga que ele
suporta de forma sustentável, provando que a fila nunca estoura e que a rejeição acontece de forma
visível.

**Invariantes testáveis**

1. O **joelho** medido fica dentro de ±50% do tamanho previsto pela fórmula `núcleos × (1 +
   espera/computação)` — tolerância larga de propósito, porque a máquina de teste varia.
2. A **lei de Little** confere: o número médio de tarefas em sistema medido bate com
   `λ (taxa de chegada) × W (tempo médio de permanência)`, dentro de ±5%.
3. A 300% da capacidade sustentável, a fila **nunca** ultrapassa o limite configurado, o contador
   de `rejected` fica acima de zero, e o **p99 das tarefas aceitas** permanece abaixo do SLO
   declarado — contraste direto: na versão de fila ilimitada, sob a mesma carga, o p99 **cresce
   sem teto**.
4. Uma tarefa bloqueante submetida ao `commonPool` degrada mensuravelmente um `parallelStream`
   independente rodando ao mesmo tempo (latência pelo menos 5× maior que a de referência sem a
   tarefa bloqueante) — prova de que o pool compartilhado propaga contenção entre componentes
   não relacionados.
5. As métricas `executor.queue.size` e `executor.rejected` são expostas e variam de forma
   consistente com a carga aplicada.

**Complemento.** Recalcule o dimensionamento assumindo que o PSP passa de 80 ms para 800 ms de
latência média, e descreva o que muda no tamanho do pool e no comportamento da fila limitada.

**Checagem**

1. Qual é a fórmula de dimensionamento por proporção de espera, e em que ela erra quando a
   suposição de "espera pura de I/O" não vale?
2. Por que `newFixedThreadPool` com fila ilimitada é um antipadrão, mesmo sendo um dos construtores
   mais citados em tutoriais?
3. O que `CallerRunsPolicy` faz, e por que isso cria contrapressão natural em vez de apenas
   descartar trabalho?
4. Por que, em Go, raramente se fala em "dimensionar o pool de goroutines", e o que se limita no
   lugar disso?

## Principais aprendizados

- Dimensionar um pool é um cálculo sobre a proporção entre espera e computação, cruzado com a lei
  de Little — não um número copiado de um tutorial.
- Fila ilimitada é a escolha padrão de `newFixedThreadPool` e do executor auto-configurado do
  Spring Boot — e ela transforma sobrecarga em consumo de memória silencioso em vez de rejeição
  visível.
- `CallerRunsPolicy` cria contrapressão real: quem submete demais sente o custo de executar a
  própria tarefa, em vez de empurrar o problema para a fila.
- O `commonPool` por trás de `parallelStream` é compartilhado pela JVM inteira — uma tarefa
  bloqueante nele rouba capacidade de componentes sem relação lógica nenhuma entre si.
- Em Go, o recurso a dimensionar raramente é "o pool de goroutines" — é a concorrência permitida
  contra o recurso de destino, via `errgroup.SetLimit` ou um semáforo por channel.
