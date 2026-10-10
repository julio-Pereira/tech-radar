---
id: locks-atomics-e-cas
title: "Locks, atomics e CAS"
summary: "Escolher o mecanismo é escolher o que fica serial e por quanto tempo: a seção crítica mínima é a que não contém I/O."
estimatedMinutes: 60
references:
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
  - title: "The Go Memory Model"
    url: https://go.dev/ref/mem
---

## O menu de mecanismos

`synchronized` é o lock intrínseco de todo objeto Java: simples, reentrante, sem *timeout*.
`ReentrantLock` acrescenta o que `synchronized` não tem: `tryLock` com tempo limite, modo justo
(*fairness*, à custa de vazão), e `Condition`s múltiplas no mesmo lock. `ReadWriteLock` e
`StampedLock` separam leitores de escritores — ganham quando leitura domina, e o `RWMutex` de Go
tem o mesmo formato, com o mesmo risco: **writer starvation**, quando um fluxo constante de
leitores nunca deixa um escritor entrar.

Em Go, `Mutex` é o equivalente a `synchronized`, com uma diferença que pega quem porta código de
Java: **Go não tem reentrância**. Um `Mutex.Lock()` chamado duas vezes pela mesma goroutine
trava para sempre — não existe contagem de reentrância como no monitor de Java. Código migrado que
assume "a mesma thread pode re-adquirir o lock" trava na primeira chamada recursiva.

`Atomic*` (Java) e `sync/atomic` (Go) oferecem `compareAndSet`/CAS: ler, comparar com o valor
esperado, e só escrever se ainda bate — tudo numa instrução de hardware, sem lock. O padrão de uso
é o **retry loop**: tentar o CAS, e se falhar (porque outra thread mudou o valor entre a leitura e
a tentativa), ler de novo e tentar outra vez. `LongAdder` (Java) é uma estrutura feita para
contenção alta: em vez de um único contador disputado, mantém várias células internas e soma na
leitura — ganha de `AtomicLong` exatamente quando muitas threads incrementam ao mesmo tempo, e
perde (por overhead) em baixa contenção.

O problema **ABA** é o aviso que acompanha todo CAS: o valor lido é `A`, outra thread muda para
`B` e depois volta para `A`, e o CAS da primeira thread sucede achando que nada mudou — quando na
verdade algo mudou e voltou. Para ponteiros e estruturas de dados *lock-free*, isso pode corromper
a estrutura; para um contador simples de inteiro, raramente importa. Saber reconhecer quando o
código está exposto a ABA é mais importante do que decorar a solução (contador de versão
embutido).

## Granularidade: o que fica serial

**Lock global** protege tudo com um único lock — simples de provar correto, serializa tudo que
toca. **Lock por chave** (lock por `accountId`) serializa só o que compartilha a mesma chave —
contas diferentes não competem entre si. **Lock striping** divide um espaço grande de chaves em
`N` locks fixos por hash, um meio-termo entre memória gasta e paralelismo ganho. **Ator /
single-writer**: em vez de várias threads disputando um lock sobre o mesmo estado, uma única
goroutine/thread é a **dona** daquele estado, e todo mundo manda mensagem para ela — não há lock
porque não há acesso concorrente, só serialização pela fila de mensagens.

A régua de granularidade é a mesma do particionamento de banco (`dados-distribuidos/03`): quanto
mais fina, mais paralelismo, mais complexidade de implementar certo. E a mesma régua que separa
**local × distribuído** (`dados-distribuidos/10`): um `Mutex` protege um processo; dinheiro
protegido entre processos exige lock distribuído com fencing token, nunca um mutex em memória.

## A regra que não tem exceção: sem I/O sob lock

Toda chamada de rede, toda query, todo acesso a disco feito **dentro** de uma seção crítica
transforma a duração dessa chamada em tempo que **todo mundo** que disputa o lock fica esperando.
Um PSP lento vira um sistema inteiro lento, porque uma thread segurou o lock do saldo enquanto
esperava a resposta de rede. A seção crítica certa faz só o que precisa de exclusão mútua — ler,
calcular, escrever — e nada que possa bloquear por razões externas ao próprio dado protegido.

## Exemplo numa fintech

O débito em memória de um *cache* de saldo disponível, em cinco implementações: ingênua (sem
nenhuma proteção — quebra sob concorrência), lock global (correta, serializa todas as contas),
lock por conta (correta, só serializa a mesma conta), CAS com retry loop (correta, sem lock, mais
código), e ator/single-writer (correta, uma goroutine dona por conta). As quatro últimas protegem
a mesma invariante por mecanismos diferentes, com custo diferente sob contenção alta e baixa.

## Hands-on

**Tutorial.** As cinco implementações do `debit(accountId, amount)` descritas acima, em Java e em
Go.

**Desafio.** Um *fake* de cliente de rede que **falha o teste** se for chamado com o lock tomado
— em Go, verificando via `TryLock()` se o mutex já está livre a partir de outra goroutine no
momento da chamada; em Java, via `Thread.holdsLock()` ou `isHeldByCurrentThread()` de um
`ReentrantLock` expondo esse estado ao fake.

**Invariantes testáveis**

1. Sob **50 threads** (Java) e **500 goroutines** (Go) debitando a mesma conta com soma total
   maior que o saldo disponível: saldo final ≥ 0 e **soma aceita = saldo inicial**, para as quatro
   implementações corretas.
2. A implementação ingênua **falha** o mesmo teste (demonstração por contagem de violações, já que
   a intercalação não é forçada).
3. Nenhuma chamada ao fake de rede ocorre com o lock tomado — asserção rígida.
4. `go vet` (checagem de `copylocks`) roda limpo; nenhum `Mutex` é copiado por valor em nenhum
   lugar do código.
5. Com uma conta quente (toda a carga numa única conta) e com 64 contas distintas, a vazão segue
   `lock por conta ≥ lock global` em pelo menos 90% das rodadas — é uma razão esperada, não um
   valor absoluto, porque a máquina varia.

**Complemento.** Meça `LongAdder` contra `AtomicLong` sob contenção alta (muitas threads
incrementando o mesmo contador) e sob contenção baixa, e compare.

**Checagem**

1. Quando faz sentido lock por conta em vez de lock global, e quando o inverso é melhor?
2. Por que um *check-then-act* sobre uma coleção concorrente continua sendo um bug mesmo que cada
   operação individual seja thread-safe?
3. Qual é a diferença de reentrância entre `synchronized`/`ReentrantLock` em Java e `Mutex` em Go,
   e que bug ela produz quando código é portado sem ajuste?
4. Por que chamar um cliente de rede dentro de uma seção crítica é sempre um bug, mesmo quando
   "funciona" na maior parte do tempo?

## Principais aprendizados

- `synchronized`/`ReentrantLock`/`Mutex` protegem seção crítica; `Atomic*`/`sync/atomic` com CAS
  evitam lock ao custo de retry loop e do risco conceitual de ABA.
- Go não tem reentrância de mutex — portar um padrão de `synchronized` recursivo de Java para
  `Mutex` em Go trava a goroutine na segunda chamada.
- Granularidade de lock é a mesma régua do particionamento de banco: lock global é simples e
  serializa tudo; lock por chave e *striping* ganham paralelismo ao custo de mais código correto.
- Ator/single-writer troca lock por serialização via fila de mensagens — sem acesso concorrente,
  não há o que proteger.
- A regra sem exceção é "sem I/O sob lock": qualquer chamada bloqueante dentro da seção crítica
  transforma a latência externa em contenção interna para todo mundo que espera o lock.
