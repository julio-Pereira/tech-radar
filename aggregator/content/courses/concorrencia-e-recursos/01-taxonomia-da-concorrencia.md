---
id: taxonomia-da-concorrencia
title: "Data race, race condition e a lei de Amdahl"
summary: "Três nomes para três problemas diferentes — confundi-los é a causa de \"passou no detector de race, mas o saldo está errado\". E o teto de ganho que mais threads não furam."
estimatedMinutes: 50
references:
  - title: "Go — Data Race Detector"
    url: https://go.dev/doc/articles/race_detector
  - title: "Java Concurrency in Practice"
    url: https://jcip.net/
---

## Três nomes para três problemas

**Data race**: duas ou mais threads acessam a mesma posição de memória, pelo menos uma escreve, e
não existe nenhuma relação de *happens-before* entre os acessos. É uma definição formal, sobre
**memória**, e uma ferramenta pode detectá-la observando a execução.

**Race condition**: o resultado depende de **em que ordem** as operações se intercalam. Pode
existir **sem** data race nenhuma — o clássico *check-then-act*: ler um valor de um
`ConcurrentHashMap`, decidir algo com base nele, e escrever depois. Cada acesso individual é
seguro; a sequência "ler, decidir, escrever" não é atômica, e duas threads podem decidir a partir
do mesmo estado obsoleto. Nenhum detector de data race pega isso, porque nenhuma leitura ou
escrita individual é insegura.

**Anomalia de isolamento no banco**: o mesmo problema, um andar abaixo. `lost update` é
*check-then-act* com `SELECT` e `UPDATE` separados; `write skew` é a versão com uma invariante
sobre um conjunto. `dados-distribuidos/04` já ensinou isso com nome de transação — aqui é o mesmo
fenômeno, sem transação nenhuma por perto, só memória e threads.

Confundir os três produz o bug mais caro desta trilha: um programa que **passa limpo** no
detector de race e **viola a invariante de saldo** mesmo assim, porque o bug nunca foi data race
— sempre foi race condition lógica sobre uma estrutura internamente segura.

## O que cada camada protege

| Nível | O que vive lá | Quem protege |
| --- | --- | --- |
| Uma variável | um `int`, uma referência | atomicidade da operação (`volatile`, `Atomic*`, `sync/atomic`) |
| Um objeto | um agregado em memória | lock do objeto, ou publicação imutável |
| Uma linha de banco | saldo, contador | isolamento da transação (`dados-distribuidos/04`) |
| Um serviço | invariante entre entidades | transação distribuída ou saga (`dados-distribuidos/08`) |

A pergunta que organiza qualquer bug de concorrência é sempre "em qual destas linhas o estado
compartilhado vive, e o que protege exatamente essa linha?" — nunca "coloquei lock, devia estar
seguro".

## Amdahl e por que threads a mais param de ajudar

Todo programa tem uma fração que só roda em série — inicialização, seção crítica, agregação do
resultado. Chamando essa fração de `s`, a lei de **Amdahl** limita o ganho com `n` workers:

```
speedup(n) ≤ 1 / (s + (1 − s) / n)
```

Com `s = 0,1` (10% serial), o teto de speedup é **10×**, não importa quantos núcleos você jogue no
problema. A **USL** (Universal Scalability Law) acrescenta o segundo custo, o de **coerência**
entre workers (cache, lock, barramento), que faz o speedup não só saturar como **cair** depois de
um certo `n` — o caso que Amdahl sozinho não prevê.

A consequência prática: antes de pedir mais threads, meça `s`. Se a seção crítica do débito segura
30% do tempo da operação, 64 threads não vão te dar 64× — vão te dar pouco mais de 3×, e o
restante vira contenção.

## Exemplo numa fintech

O **contador de limite diário por conta**, em três versões, com três bugs diferentes:

1. `limiteUsado += valor` sem sincronização — **data race** clássico, pego pelo `-race` do Go e
   por qualquer ferramenta equivalente.
2. `if (map.get(conta) + valor <= limite) map.put(conta, map.get(conta) + valor)` sobre um
   `ConcurrentHashMap`/`sync.Map` — **zero data race** (cada `get`/`put` é seguro), e **race
   condition** pura: duas threads podem ler o mesmo valor antes de qualquer uma escrever, e as duas
   passam no `if`.
3. `UPDATE conta SET saldo = ?` com o saldo lido antes, em `READ COMMITTED` — **anomalia de
   isolamento**: o mesmo *check-then-act*, um andar abaixo, sem nenhuma linha de aplicação
   envolvida.

## Hands-on

**Tutorial.** Três programas pequenos, em Java e em Go: (a) um contador sem nenhuma sincronização;
(b) o *check-then-act* do exemplo acima sobre `ConcurrentHashMap`/`sync.Map`; (c) o
`UPDATE ... SET saldo = ?` com leitura prévia, contra um Postgres local.

**Desafio.** Uma tabela com 6 trechos de código dada à parte: classifique cada um como data race,
race condition, os dois juntos, ou nenhum — e escreva o conserto de cada um.

**Invariantes testáveis**

1. O programa (b) roda com **zero** relatórios do detector de race **e**, em N execuções
   concorrentes, viola "soma aceita = saldo inicial" (demonstração por contagem de violações, não
   asserção rígida — a intercalação não é forçada).
2. A classificação dos 6 trechos bate exatamente com o gabarito (teste tabular).
3. Com trabalho simulado por `sleep` e fração serial `s` conhecida de antemão, o speedup medido com
   1, 2, 4 e 8 workers é **monotonicamente não-decrescente** e **≤ 1/(s + (1−s)/n) + ε** — ordenação
   e limite superior, nunca um valor absoluto de tempo.
4. O conserto do programa (c) usa `FOR UPDATE` ou `UPDATE conta SET saldo = saldo - ?` (sem leitura
   prévia), e um teste com 50 sessões concorrentes não perde nenhum débito.

**Complemento.** Estime `s` do seu próprio caminho de débito medindo quanto tempo cada operação
passa dentro da seção crítica, e calcule o teto de Amdahl correspondente.

**Checagem**

1. Dê um exemplo de race condition **sem** data race, e explique por que o detector de race não a vê.
2. Por que `lost update` e `write skew` são a mesma classe de bug do item 2 do exemplo, um andar
   abaixo?
3. Com `s = 0,2`, qual é o teto de speedup de Amdahl, e o que a USL acrescenta a essa conta?
4. Para cada um dos quatro níveis da tabela "o que cada camada protege", dê um exemplo do
   `fin-platform`.

## Principais aprendizados

- Data race, race condition e anomalia de isolamento são três problemas distintos; só o primeiro é
  detectável por instrumentação — os outros dois exigem olhar a sequência de operações.
- *Check-then-act* sobre uma coleção concorrente não tem data race nenhum e ainda assim quebra a
  invariante — a estrutura é segura por operação, não pela sequência de operações.
- `lost update` e `write skew` são a mesma classe de bug do *check-then-act*, resolvida com
  isolamento de transação em vez de lock de memória.
- A lei de Amdahl limita o ganho de paralelismo pela fração serial; a USL soma o custo de
  coerência, que pode fazer o speedup **cair** além de um certo número de workers.
- Medir `s` antes de pedir mais threads é o primeiro passo de qualquer dimensionamento — o
  assunto retorna, com números de produto, no marco 05.
