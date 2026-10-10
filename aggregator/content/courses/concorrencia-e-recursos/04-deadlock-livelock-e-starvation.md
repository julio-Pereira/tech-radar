---
id: deadlock-livelock-e-starvation
title: "Deadlock, livelock e starvation"
summary: "Deadlock não é raro nem exótico: toda transferência entre duas contas é um candidato a deadlock, na memória, no banco e no pool de conexões. Marco crítico — quiz estendido."
estimatedMinutes: 70
references:
  - title: "PostgreSQL — Explicit Locking (deadlocks)"
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
completion: quiz
---

## As quatro condições, e a menor que se quebra

Um deadlock exige as quatro **condições de Coffman** simultaneamente: exclusão mútua (o recurso
não pode ser compartilhado), posse e espera (uma thread segura um recurso enquanto pede outro),
não-preempção (ninguém pode tirar o recurso à força) e espera circular (A espera B que espera A).
Quebrar qualquer uma delas elimina o deadlock — e a mais barata de quebrar, na prática, é a espera
circular: impor uma **ordem total de aquisição** de locks (por exemplo, sempre pelo `accountId`
menor primeiro) faz com que nunca exista um ciclo, porque todo mundo converge para a mesma ordem.

**`tryLock` com timeout e recuo com jitter** é a segunda defesa, útil quando a ordem total não é
viável: em vez de esperar um lock indefinidamente, desistir depois de um tempo, liberar o que já
foi adquirido, esperar um intervalo aleatório (o *jitter* evita que todas as threads tentem de
novo no mesmo instante) e tentar outra vez.

**Livelock** é diferente: duas threads reagem uma à outra de forma tão educada que nenhuma
progride — cada uma recua para deixar a outra passar, e as duas recuam ao mesmo tempo, para
sempre. **Starvation** é quando uma thread específica nunca consegue o recurso porque outras
sempre chegam primeiro — o caso canônico é o **writer starvation** num `RWMutex`/`ReadWriteLock`:
um fluxo constante de leitores nunca deixa espaço para um escritor entrar, mesmo que cada leitura
individual seja rápida.

## Deadlock por dentro, em cada camada

**Em Go**, o runtime só detecta um caso específico: "*all goroutines are asleep — deadlock*",
quando **todas** as goroutines do programa estão bloqueadas ao mesmo tempo. Um deadlock
**parcial** — duas goroutines travadas entre si enquanto o resto do programa segue funcionando —
passa completamente despercebido pelo runtime. Deadlock por channel é comum: enviar para um
channel sem nenhum receptor do outro lado, ou um `WaitGroup` cujo contador nunca chega a zero
porque um `Done()` foi esquecido ou chamado a mais.

**Em Java**, não há detecção automática: a ferramenta é o diagnóstico manual —
`jstack`/`jcmd Thread.print` para um dump de threads, e
`ThreadMXBean.findDeadlockedThreads()` para detectar programaticamente um ciclo de monitores.

**No banco**, o Postgres detecta deadlock entre transações e aborta uma delas com o erro
**`40P01`**, depois de esperar `deadlock_timeout` (o tempo que o Postgres espera antes de rodar o
algoritmo de detecção de ciclo, porque esse algoritmo tem custo e não vale a pena rodá-lo a cada
espera de lock). A correção é a mesma do caso em memória: ordem total de aquisição — tipicamente
`SELECT ... FOR UPDATE` ordenado por chave primária — e **retry da transação abortada**, porque
`40P01` é um erro esperado, não excepcional, em qualquer sistema com transferência entre duas
linhas quaisquer.

**No pool de conexões**, o deadlock aparece quando uma unidade de trabalho segura uma conexão e
pede uma segunda **do mesmo pool** antes de devolver a primeira — o cenário clássico é
`@Transactional(propagation = REQUIRES_NEW)` chamado de dentro de uma transação já em andamento,
com um pool pequeno demais para as duas conexões simultâneas. Com um pool de duas conexões e duas
threads cada uma precisando de duas, as quatro conexões ficam presas e ninguém progride — sem
nenhum deadlock de memória envolvido, só contenção por um recurso finito.

> **Reencontro — `spring-boot/05`.** É exatamente esse risco: `REQUIRES_NEW` suspende a transação
> corrente sem devolver sua conexão, e a nova transação pede outra do mesmo pool. Sob carga, com
> `maximumPoolSize` pequeno, isso trava o serviço inteiro — o marco 07 ensina a dimensionar o pool
> para não depender de sorte aqui.

Um deadlock que trava indefinidamente, sem detecção nem timeout, não se resolve sozinho — alguém
de fora precisa perceber e agir. Um `livenessProbe` do Kubernetes, configurado com cuidado
(`kubernetes/06`), é a última rede: se o processo para de responder porque está preso num
deadlock irrecuperável, o orquestrador reinicia o pod, trocando um incidente silencioso por uma
indisponibilidade curta e visível.

**Deadlock distribuído** — serviço A espera resposta de B que está esperando resposta de A — não
tem detecção de ciclo possível sem um coordenador global, que a maioria dos sistemas não tem. A
única saída real é **timeout**: cada chamada tem um prazo, e o prazo estourado libera o chamador,
mesmo que isso signifique que o par da chamada ainda esteja em andamento. Nem `async`, nem
virtual thread eliminam esse risco — eles tornam **mais barato** manter uma chamada pendente, não
eliminam a possibilidade de duas chamadas pendentes se esperarem mutuamente.

## Exemplo numa fintech

`transfer(A→B)` e `transfer(B→A)` rodando ao mesmo tempo, às 10h, no pico do Pix: se a
implementação pega o lock da conta de origem e depois o lock da conta de destino, na ordem em que
os parâmetros chegaram, a primeira transferência trava com o lock de A e espera B; a segunda trava
com o lock de B e espera A. Nenhum bug de lógica — as duas implementações, isoladamente, estão
corretas. O deadlock é uma propriedade da **combinação**, não de nenhuma delas sozinha.

## Hands-on

**Tutorial.** Reproduzir o deadlock **deterministicamente**: use um *latch*/`sync.WaitGroup` para
forçar as duas transferências a pegarem o primeiro lock cada uma e só então tentarem o segundo,
garantindo o ciclo em vez de torcer para ele acontecer. Detecte com `ThreadMXBean` (Java) ou com um
watchdog que lê o dump de goroutines (Go). Corrija com ordem de aquisição por id de conta. Em
seguida, reproduza o equivalente no Postgres com duas sessões `psql`, cada uma fazendo
`UPDATE` cruzado nas mesmas duas linhas em ordem oposta.

**Desafio.** O deadlock de pool: um pool de 2 conexões, 2 threads que cada uma precisa de 2
conexões simultâneas (via `REQUIRES_NEW` ou equivalente).

**Invariantes testáveis**

1. A transferência ingênua **trava**, e o watchdog (`findDeadlockedThreads` ou dump de goroutines)
   **detecta** o deadlock — asserção rígida, porque o *latch* força a intercalação.
2. A versão com ordem de aquisição por id conclui 100 transferências aleatórias entre 20 contas,
   com 32 threads concorrentes, **dentro do timeout**, e o **dinheiro total é conservado**
   (soma antes = soma depois).
3. No Postgres, 10 mil transferências **com** `ORDER BY id ... FOR UPDATE` geram **0** erros
   `40P01`; a mesma carga **sem** ordem gera **pelo menos 1** `40P01` (demonstração, não exigência
   de um número exato); com o *wrapper* de retry em volta, **todas** as transferências concluem, e
   o número de retries por transferência é exposto como métrica.
4. O deadlock de pool é **detectado por timeout** (`connectionTimeout`) em vez de travar
   indefinidamente, e a versão corrigida (uma única conexão por unidade de trabalho, ou um pool
   dimensionado para o pior caso) conclui sem timeout.
5. A variante que usa `tryLock(timeout)` em vez de ordem total nunca bloqueia por mais que
   `T + ε`, onde `T` é o timeout configurado.

**Complemento.** Projete o timeout de um deadlock distribuído hipotético entre dois serviços,
partindo do orçamento de latência do fluxo (quanto tempo total o cliente tolera esperar, dividido
entre os saltos).

**Checagem**

1. Quais são as quatro condições de Coffman, e qual delas a ordem total de aquisição quebra?
2. Por que o runtime de Go só detecta o deadlock em que **todas** as goroutines estão dormindo, e
   o que isso implica para um deadlock parcial?
3. O que `40P01` significa, e por que a resposta correta é capturar e repetir a transação, não
   tratar como erro fatal?
4. Como um deadlock de pool acontece sem nenhum lock de memória estar envolvido?

## Principais aprendizados

- Deadlock exige as quatro condições de Coffman simultaneamente; quebrar a espera circular com
  ordem total de aquisição costuma ser a correção mais barata.
- O runtime de Go só detecta deadlock total (todas as goroutines dormindo); um deadlock parcial
  entre duas delas passa silencioso, e a defesa é diagnóstico manual (dump) ou watchdog próprio.
- `40P01` no Postgres é esperado em qualquer sistema com transferência entre duas linhas quaisquer
  — a resposta é ordem de aquisição **e** retry da transação abortada, não "evitar que aconteça".
- Deadlock de pool acontece quando uma unidade de trabalho precisa de duas conexões do mesmo pool
  ao mesmo tempo — `REQUIRES_NEW` dentro de uma transação já aberta é o gatilho clássico.
- Deadlock distribuído não tem detecção de ciclo viável; a única defesa real é timeout em toda
  chamada, e nem `async` nem virtual thread eliminam esse risco — só baratam manter a chamada presa.
