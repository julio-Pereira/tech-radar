---
id: goroutines-em-producao
title: "Goroutines em produção: vazamento, cancelamento e limites"
summary: "Toda goroutine precisa de um jeito de terminar que alguém consegue provar. As causas reais de vazamento (e um mito que o Go 1.23 desfez), goleak e o perfil goroutineleak, o pacote sync sem folclore, limitar de fora para dentro e testar tempo com synctest."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, operacao]
references:
  - title: "goleak (Uber)"
    url: https://github.com/uber-go/goleak
  - title: "Testing concurrent code with testing/synctest (Go blog)"
    url: https://go.dev/blog/synctest
  - title: "Go 1.23 Release Notes: Timer changes"
    url: https://go.dev/doc/go1.23#timer-changes
  - title: "Go 1.27 Release Notes: Goroutine leak profile"
    url: https://go.dev/doc/go1.27#goroutineleak-profiles
  - title: "package sync"
    url: https://pkg.go.dev/sync
---

## Uma goroutine que não termina é memória que não volta

Criar uma goroutine custa quase nada, e é por isso que elas vazam: ninguém pensa em como ela
termina. É o **vazamento de goroutine**: uma goroutine bloqueada para sempre segura a sua pilha e tudo o que ela referencia (o
corpo da requisição, a conexão, o buffer). O serviço não cai na hora: o número de goroutines sobe
devagar, a memória acompanha, e depois de três dias um OOM no meio da noite. A regra deste marco:
**toda goroutine precisa de um caminho de término que um teste consegue provar**.

As causas, em ordem de frequência:

1. **Envio sem leitor.** A goroutine manda o resultado num channel sem buffer, mas quem ia ler
   desistiu (timeout, cancelamento, outro resultado chegou antes). Ela fica parada no envio para
   sempre. É o vazamento clássico do padrão "dispara e espera com timeout".
2. **Leitura sem escritor.** Um `for range ch` sobre um channel que ninguém fecha, ou um `<-done` que
   nunca recebe.
3. **`context` ignorado.** A goroutine recebe um `ctx`, mas faz uma chamada bloqueante que não o
   respeita (uma query sem contexto, um `time.Sleep`), e o cancelamento não chega a ela.
4. **Um laço sem saída**: o `for { select { ... } }` que não tem `case <-ctx.Done(): return`.

E um mito que precisa de data: "**`time.After` dentro de laço vaza**". Até o Go 1.22, era verdade:
cada `time.After` criava um timer que só era coletado depois de disparar, e um laço com timeout longo
acumulava milhares deles. **Desde o Go 1.23**, com a linha `go` do módulo em 1.23 ou mais, timers e
tickers sem referência são coletados mesmo sem `Stop`, e o channel do timer passou a ser sem buffer.
O que continua valendo: cada `time.After` aloca um timer por iteração, então num laço quente um
`time.NewTimer` reaproveitado com `Reset` é mais barato. Custo, não vazamento.

## Detectar: no teste e em produção

- **No teste, `goleak`** (Uber): `goleak.VerifyNone(t)` no fim de um teste, ou
  `goleak.VerifyTestMain(m)` para a suíte inteira, falha se sobrou alguma goroutine que não estava lá
  no início, e mostra a pilha dela. É barato o bastante para todo pacote com concorrência.
- **Em produção, a contagem**: exponha `go_goroutines` (o cliente Prometheus já exporta) e alerte
  por **crescimento sustentado**, não por um valor absoluto: 5 mil goroutines pode ser normal; subir
  10% ao dia sem cair nunca é vazamento (`observabilidade/13`).
- **O perfil `goroutineleak`** (experimental no Go 1.26, **estável no 1.27**): o runtime usa o
  coletor de lixo para achar goroutines bloqueadas num channel ou mutex que nenhuma goroutine
  executável consegue mais alcançar, e lista as pilhas em `/debug/pprof/goroutineleak`. É o que
  transforma "a memória sobe" em "esta linha do código".

## O pacote sync sem folclore

- **`Mutex` e `RWMutex`.** `RWMutex` deixa leitores em paralelo, mas custa mais por operação e cria
  disputa entre muitos núcleos no próprio contador de leitores. Ele só ganha quando as leituras são
  longas e muito mais frequentes que as escritas. Com seção crítica curta ou escrita frequente, um
  `Mutex` comum é mais rápido. Meça antes de trocar.
- **Não copie um mutex.** Um `sync.Mutex` copiado é outro mutex. Um método com receiver de valor
  numa struct que contém um mutex trava a cópia, e o estado original fica desprotegido. O `go vet`
  acusa (`passes lock by value`).
- **`Once`**, e desde o Go 1.21 **`OnceFunc`, `OnceValue` e `OnceValues`**: inicialização preguiçosa
  e segura, com o valor e o erro guardados.
- **`WaitGroup`**, com **`wg.Go(f)`** desde o Go 1.25: faz o `Add(1)`, dispara e o `Done` por você, e
  some o bug do `Add` dentro da goroutine.
- **`sync/atomic` tipado** (`atomic.Int64`, `atomic.Pointer[T]`, Go 1.19): contadores e troca de
  ponteiro sem lock, sem o risco de misturar acesso atômico e comum à mesma variável.
- **`sync.Map`** não é "um map concorrente melhor". A documentação diz os dois casos em que ele
  ganha de um `map` com mutex: chave escrita uma vez e lida muitas (um cache que só cresce), e
  goroutines que leem e escrevem conjuntos **disjuntos** de chaves. Fora disso, `map` com `Mutex`.

## Limitar de fora para dentro

Um serviço que aceita todo trabalho que chega não tem limite: tem fila escondida, no buffer do
socket, nas goroutines paradas e na memória. Sob pico, a latência de todo mundo cresce até o timeout
do cliente, e o serviço processa requisições que o cliente já abandonou. O desenho saudável limita
**na entrada**: uma fila de tamanho fixo (um channel com buffer, um semáforo) e, quando ela está
cheia, **rejeitar rápido** com `429` e `Retry-After`. O cliente tenta de novo; o serviço continua
respondendo dentro do SLO para quem entrou. É o *bulkhead*, aprofundado em
`performance-resiliencia`, trilha planejada.

## Testar tempo sem dormir

Teste de concorrência com `time.Sleep` é lento e intermitente: dorme demais e a suíte demora, dorme
de menos e falha no CI carregado. O **`testing/synctest`** (estável desde o Go 1.25) roda o teste
numa "bolha" com **relógio falso**: o tempo só avança quando todas as goroutines da bolha estão
bloqueadas, e avança direto para o próximo evento. Um timeout de 200 ms termina em exatamente 200
ms no relógio da bolha e em microssegundos no relógio de parede. `synctest.Wait()` espera as
goroutines da bolha pararem, e o Go 1.27 acrescentou `synctest.Sleep`. Bônus: se uma goroutine da
bolha fica bloqueada para sempre, o `synctest` falha o teste. É detecção de vazamento de graça.

## Exemplo numa fintech

O checkout consulta o PSP para autorizar o pagamento. Para cortar a cauda de latência, o time
implementou **hedging**: se o primeiro PSP não responde em 50 ms, uma segunda chamada sai para outro,
e a primeira resposta vence.

```go
res := make(chan resultado) // sem buffer
go chamar(primario)
select {
case r := <-res:
	return r
case <-time.After(delay):
	go chamar(secundario)
}
return <-res // a perdedora fica parada no envio, para sempre
```

Toda requisição em que o hedge dispara deixa **uma goroutine presa**: a perdedora termina, tenta
entregar o resultado, e ninguém mais lê. Pior, quando o cliente cancela, nenhuma das duas chamadas
fica sabendo, porque o `ctx` não chega a elas. Numa reprodução com 100 consultas em que o PSP
respondia depois do timeout, sobraram 100 goroutines paradas. Em produção, o vazamento cresce na
proporção do tráfego: uma goroutine por hedge disparado, até o OOM.

A correção tem três peças: um channel com **buffer do tamanho do número de chamadas** (a perdedora
entrega e termina), um `context.WithCancel` com `defer cancel()` (a perdedora recebe o cancelamento e
para de chamar o PSP), e o próprio PSP respeitando o `ctx`.

## Hands-on

**Tutorial.** Reproduza o vazamento: o `HedgedBuggy` acima com um PSP falso lento e um rápido. Chame
uma vez, espere o lento terminar, e mostre com `goleak.Find()` a goroutine parada em `chan send`.

**Desafio.** Um cliente de PSP com hedging correto: `Hedged(ctx, primario, secundario, delay,
pagamento)`, primeira autorização sem erro vence, secundário entra já se o primário falhar antes do
delay, e cancelamento propagado. O PSP falso conta chamadas e chamadas em voo, e respeita o `ctx`.

**Invariantes testáveis**

1. `goleak.VerifyTestMain` passa depois de 10 mil chamadas, com timeouts variados, várias delas
   canceladas no meio.
2. Com o cliente cancelando, nenhuma chamada ao PSP continua em voo depois que `Hedged` retorna.
   Teste dentro de `synctest.Test`: o `Hedged` com timeout de 200 ms retorna em **exatamente** 200 ms
   no relógio falso, e depois de `synctest.Wait()` não há chamada em voo.
3. Nunca mais de duas chamadas ao PSP por pagamento (contador do PSP falso sobre as 10 mil).
4. A resposta perdedora é descartada sem bloquear ninguém. É o buffer: troque-o por um channel sem
   buffer e o teste das 10 mil chamadas quebra, e quem acusa primeiro é o próprio `synctest`
   (`blocked goroutines remain`), antes mesmo do `goleak`.

**Complemento.** Exponha `go_goroutines` no serviço, rode um teste de carga com a versão com
vazamento e com a corrigida, e escreva a regra de alerta por crescimento sustentado
(`observabilidade/13`). Se estiver no Go 1.27, abra `/debug/pprof/goroutineleak` na versão com
vazamento e encontre a linha.

**Checagem**

1. Por que a goroutine perdedora fica presa com um channel sem buffer, e por que o buffer resolve?
2. "`time.After` em laço vaza memória": em que versão isso deixou de ser verdade, e o que continua
   sendo custo?
3. Quando um `RWMutex` é mais lento que um `Mutex`?
4. Por que aceitar todo trabalho que chega piora a latência de todo mundo?

## Principais aprendizados

- Toda goroutine precisa de um fim provável: envio sem leitor é o vazamento mais comum.
- `goleak` no teste, `go_goroutines` com alerta de crescimento e o perfil `goroutineleak` em produção.
- Desde o Go 1.23, timer sem referência é coletado; `time.After` em laço é custo, não vazamento.
- `sync.Map` tem dois casos de uso; `RWMutex` só ganha com leitura longa e dominante; mutex não se
  copia.
- Limite na entrada e rejeite rápido; teste tempo com `synctest`, nunca com `time.Sleep`.
