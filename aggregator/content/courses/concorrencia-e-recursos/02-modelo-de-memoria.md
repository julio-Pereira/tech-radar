---
id: modelo-de-memoria
title: "Modelo de memória: visibilidade, ordenação e happens-before"
summary: "Sem uma relação happens-before, nada garante que uma thread veja o que outra escreveu — nem a ordem em que escreveu. O bug não é raro: é silencioso. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "Java Language Specification — Chapter 17: Threads and Locks (memory model)"
    url: https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html
  - title: "The Go Memory Model"
    url: https://go.dev/ref/mem
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
completion: quiz
---

## Por que existe um modelo de memória

O que o código fonte diz e o que a máquina de fato faz divergem em três pontos: o **compilador**
reordena instruções que não têm dependência aparente entre si; a **CPU** reordena a execução fora
de ordem e devolve o resultado como se fosse em ordem, mas só para a própria thread; e cada núcleo
tem seu **cache** e buffers de escrita, de modo que uma escrita pode demorar para ficar visível a
outro núcleo. Nenhuma dessas três otimizações quebra um programa de uma thread só. Todas elas
podem quebrar um programa de várias threads que compartilham memória sem dizer isso ao compilador
e à CPU — e é para isso que existe um modelo de memória: a promessa precisa, e não a intuição, do
que uma thread garante que a outra vai ver.

## Happens-before é a única garantia que importa

Sem uma relação de **happens-before** entre uma escrita e uma leitura, não existe garantia de que
a leitura veja a escrita — nem de que veja qualquer escrita anterior na mesma ordem em que
aconteceram. Isso vale tanto para o **Java Memory Model** (JLS cap. 17) quanto para o **modelo de
memória de Go**: os dois são formulados em cima da mesma ideia, com vocabulário e mecanismos de
sincronização diferentes.

**No Java**: `synchronized` (entrar e sair do mesmo monitor estabelece happens-before entre quem
saiu e quem entrou depois), `volatile` (uma escrita happens-before qualquer leitura subsequente do
mesmo campo), e a inicialização de um campo `final` dentro do construtor happens-before qualquer
thread que veja a referência ao objeto já construído — a base da **publicação segura**.

**Em Go**: não existe `volatile`. A sincronização acontece por **channel** (um envio
happens-before o recebimento correspondente; o fechamento de um channel happens-before qualquer
recebimento que veja o fechamento), pelo pacote `sync` (`Mutex.Unlock` happens-before o próximo
`Lock` do mesmo mutex), e por `sync/atomic`. `go func()` happens-before o início da goroutine que
ele cria — mas o fim de uma goroutine **não** happens-before nada, a menos que seja comunicado
explicitamente (um `WaitGroup`, um channel).

> **Reencontro — `go-fintech/03`.** O roteamento por channel do sharding por conta daquele marco
> é happens-before em ação: a mensagem que chega ao worker correto happens-before o processamento
> — é por isso que a mesma conta, sempre na mesma goroutine, não precisa de `Mutex` nenhum para
> ficar correta.

## `volatile`, publicação segura e *double-checked locking*

`volatile` garante visibilidade e ordenação — não atomicidade de operações compostas.
`contador++` sobre um campo `volatile` continua sendo ler-incrementar-escrever em três passos, e
duas threads ainda podem perder um incremento. `volatile` resolve "a outra thread vê a mudança de
uma flag", não "duas threads competindo por uma operação".

O exemplo clássico onde isso vira bug sutil é o ***double-checked locking***: verificar se um
singleton já existe, sem lock; se não existe, pegar o lock e verificar de novo antes de criar.
Sem `volatile` no campo, uma thread pode ver a referência não-nula **antes** de o construtor ter
terminado de rodar — porque a escrita da referência e a escrita dos campos do objeto podem ser
reordenadas pelo compilador ou pela CPU. O objeto "existe" e está **parcialmente construído**. A
correção depende inteiramente de declarar o campo `volatile`: isso impede exatamente essa
reordenação.

## O que x86 esconde e ARM revela

Processadores x86 seguem um modelo chamado **TSO** (*Total Store Order*), que é relativamente
forte: ele não reordena a maioria dos pares escrita-leitura que quebrariam código ingênuo. Um bug
de sincronização ausente frequentemente **não aparece** rodando em x86 — a CPU "faz a coisa certa"
por acaso, na maioria das execuções. ARM tem um modelo mais fraco, com mais reordenações
permitidas, e o mesmo bug de memória que nunca se manifestou no laptop x86 do desenvolvedor pode
aparecer no primeiro dia em produção num servidor ARM. "Rodei mil vezes e nunca falhou" não prova
ausência de bug de memória — prova, na melhor das hipóteses, que o hardware de teste tolera o bug.

Outro detalhe que o x86 também esconde: **word tearing** em leituras não atômicas de valores de 64
bits em plataformas de 32 bits (histórico, mas didático) — uma leitura pode ver metade de uma
escrita antiga e metade de uma nova. Em JVMs e runtimes modernos de 64 bits isso deixou de ser
risco prático para `long`/`double`, mas o princípio continua valendo: "parece uma operação, é na
verdade duas" é a origem de boa parte dos bugs desta família.

E o corolário que fecha o marco: **não troque lock por atomics sem medir**. `AtomicLong` e
`VarHandle` resolvem problemas pontuais de visibilidade e CAS; eles não são "lock, só mais rápido"
em todo caso, e um código que troca um `synchronized` simples por uma sequência de operações
atômicas mal compostas frequentemente introduz a mesma race condition lógica do marco 01, só que
com uma API que parece mais sofisticada.

## Exemplo numa fintech

A *flag* `ativo` de um processo de conciliação, lida num loop por uma thread de trabalho e escrita
por uma thread de controle sem `volatile` nem canal nenhum: o compilador, vendo que a thread de
trabalho nunca escreve a flag, pode legalmente içar a leitura para fora do loop e nunca mais
reler o valor — a thread de trabalho roda para sempre, e nenhuma exceção avisa.

O segundo caso é o objeto de configuração publicado sem `final`/`volatile`: uma thread de inicialização
monta um objeto com três campos e publica a referência numa variável comum; uma thread leitora
pode observar a referência não-nula com um dos três campos ainda no valor-padrão, porque a ordem
de escrita dos campos não tinha nenhuma garantia de ficar visível antes da referência.

> **Reencontro — `spring-boot/04`.** Todo bean `singleton` com campo mutável é exatamente este
> problema, hospedado pelo container: múltiplas requisições, em threads diferentes, lendo e
> escrevendo o mesmo campo sem `volatile` nem lock. O container não protege isso sozinho — a
> publicação segura continua sendo responsabilidade de quem escreve a classe.

## Hands-on

**Tutorial.** Rode um teste de litmus clássico de **store-buffering** — duas threads, cada uma
escreve uma variável e lê a outra (`x=1; r1=y` numa thread, `y=1; r2=x` na outra) — no **jcstress**
(Java) e em Go (milhões de iterações, com o detector de race ligado). O resultado proibido
(`r1 = r2 = 0`) é possível sem sincronização e impossível com ela.

**Desafio.** Reproduza e conserte a publicação insegura de um objeto de configuração, em Java e em
Go.

**Invariantes testáveis**

1. A versão do litmus **com** `volatile`/atomic tem **0** ocorrências do resultado proibido
   (`r1 = r2 = 0`) em jcstress — asserção rígida, porque o jcstress força a intercalação.
2. A versão com campos simples **reporta** a contagem de ocorrências do resultado proibido (ou "não
   reproduziu nesta arquitetura") sem falhar o build — é demonstração, não prova de ausência.
3. A configuração publicada com `final` e construtor completo nunca é observada parcialmente em
   jcstress: 0 ocorrências.
4. O *double-checked locking* sem `volatile` é sinalizado pelo jcstress (demonstração de que o
   resultado proibido ocorre) e a versão corrigida tem 0 ocorrências.

**Complemento.** Se tiver acesso a uma máquina ARM, rode o mesmo teste de litmus e compare a taxa
de ocorrência do resultado proibido com a mesma execução em x86.

**Checagem**

1. O que exatamente `happens-before` garante, e o que acontece na ausência dessa relação?
2. `volatile` garante o quê e não garante o quê? Dê um exemplo de cada.
3. Por que o *double-checked locking* sem `volatile` pode publicar um objeto parcialmente
   construído?
4. Por que um bug de memória pode nunca aparecer em x86 e aparecer em ARM?

## Principais aprendizados

- Sem `happens-before`, nada garante que uma thread veja a escrita de outra, nem a ordem em que
  ela aconteceu — o modelo de memória existe porque compilador, CPU e cache reordenam por padrão.
- Java estabelece `happens-before` por `synchronized`, `volatile` e publicação via `final`; Go
  estabelece por channel, `sync` e `sync/atomic` — vocabulário diferente, mesma ideia.
- `volatile` garante visibilidade e ordenação, não atomicidade de operações compostas —
  `contador++` sobre `volatile` ainda perde incremento.
- x86 (TSO) esconde boa parte dos bugs de memória que ARM revela; "nunca falhou no meu laptop" não
  é evidência de ausência de bug.
- Trocar lock por atomics sem medir recria a race condition lógica do marco 01 com uma API mais
  sofisticada — atomics resolvem visibilidade e CAS pontuais, não substituem seção crítica.
