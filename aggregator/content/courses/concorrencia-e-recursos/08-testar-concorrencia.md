---
id: testar-concorrencia
title: "Testar concorrência"
summary: "O teste de concorrência que importa afirma invariantes sob carga e intercalação variada, não uma sequência esperada de eventos."
estimatedMinutes: 55
references:
  - title: "Go — Data Race Detector"
    url: https://go.dev/doc/articles/race_detector
  - title: "Lincheck — testing concurrent data structures on the JVM"
    url: https://github.com/JetBrains/lincheck
  - title: "OpenJDK jcstress — concurrency stress tests"
    url: https://github.com/openjdk/jcstress
---

## Por que `Thread.sleep` num teste é um cheiro

Um teste que dorme um tempo fixo e depois confere o estado está apostando que a máquina de CI é
rápida o bastante — e lenta o bastante — para que a janela de `sleep` sempre capture o momento
certo. Funciona na máquina do autor, falha de forma intermitente em CI sob carga, e vira o teste
que todo mundo reexecuta sem investigar quando falha. **Awaitility** (Java) substitui isso por uma
espera condicional: poll até a condição ser verdadeira ou um timeout estourar, sem acoplar o teste
a um tempo fixo. O equivalente em Go é um loop de poll curto, ou — melhor ainda — desenhar o
código para ser observável sem espera nenhuma (um channel que sinaliza conclusão).

## As ferramentas de cada lado

O **detector de race do Go** (`-race`) instrumenta todo acesso de memória em tempo de execução e
acusa um data race **que de fato ocorreu** durante aquela execução — ele não prova ausência, só
confirma presença. `-count=N` roda o mesmo teste N vezes (útil porque a intercalação muda a cada
execução); `-shuffle=on` embaralha a ordem dos testes; `-cpu=1,2,4` varia o `GOMAXPROCS` entre
execuções, expondo bugs que só aparecem com mais de um núcleo disponível.

> **Reencontro — `go-fintech/03`.** O teste de corrida de saldo daquele marco já usava
> `go test -race` com 500 goroutines sobre um conjunto pequeno de contas — exatamente a receita
> `-count` + contenção forçada que separa um `-race` decorativo de um que de fato tem chance de
> pegar o bug.

**jcstress** é o equivalente conceitual para a JVM: um harness que roda um par (ou grupo) de
operações concorrentes milhões de vezes, forçando intercalações diferentes a cada rodada, e
classifica os resultados observados contra os esperados — é a ferramenta certa para testar um
teste de litmus de modelo de memória (o que o marco 02 já usou) ou uma estrutura de dados
concorrente pequena.

**Chaos scheduling leve** é uma técnica simples e poderosa: inserir atrasos aleatórios pequenos
(`sleep` de poucos microssegundos, escolhido aleatoriamente) em pontos críticos do código sob
teste — logo antes de um lock, logo depois de uma leitura — para aumentar a chance de expor
intercalações raras sem precisar de um *latch* determinístico em todo lugar.

## Testar por invariante, não por sequência

Um teste de concorrência frágil afirma "a thread A termina antes da thread B" — uma sequência
específica que a própria natureza de concorrência não garante. Um teste de concorrência robusto
afirma uma **invariante** que precisa valer **independente** da ordem: conservação ("a soma nunca
muda"), monotonicidade ("o contador nunca diminui"), unicidade ("nenhum id aparece duas vezes").
Invariantes sobrevivem a qualquer intercalação possível; sequências específicas não.

A forma mais rigorosa disso é a **verificação de histórico**: registrar, para cada operação
concorrente, quando ela começou, quando terminou e o que retornou — e perguntar se existe **alguma
ordem sequencial legal** que explique todos os resultados observados. Essa é a ideia central por
trás de **linearizabilidade** (Jepsen, Lincheck): não importa a ordem real de execução, desde que
exista uma ordem sequencial possível, respeitando os intervalos de tempo de cada operação, que
produza os mesmos resultados. Para poucas operações (até 8, por exemplo), buscar essa ordem por
força bruta é viável e é exatamente o desafio deste marco.

## Teste de mutação: prova de que o teste testa

Um teste de concorrência pode passar por motivos errados — a invariante nunca é de fato violada
porque a intercalação que a violaria nunca acontece na máquina de CI, não porque o código está
correto. **Teste de mutação** combate isso diretamente: remover deliberadamente uma proteção (um
lock, uma ordem de aquisição) e confirmar que a suíte de testes **falha**. Se a suíte continua
verde com a proteção removida, a suíte não estava testando o que achava que testava.

> **Reencontro — `spring-boot/11`.** Testcontainers com Postgres real, não mockado, é a mesma
> disciplina aplicada a concorrência: um teste de lock pessimista contra um banco fake não prova
> nada sobre deadlock ou contenção real — o teste de concorrência deste marco precisa do mesmo
> compromisso com infraestrutura real que aquele marco já defende para testes de integração.

## Exemplo numa fintech

Como saber que o novo `debit()` é seguro antes de promovê-lo: uma bateria de quatro camadas —
`-race -count=50` (ou jcstress) para pegar data race; o verificador de histórico para confirmar
linearizabilidade das operações observadas; um teste de invariante sob carga real (as 50
threads/500 goroutines dos marcos anteriores); e, no CI, uma mutação plantada que precisa derrubar
a suíte.

## Hands-on

**Tutorial.** Uma suíte `-race -count=50` sobre o `debit()` do marco 03, e um teste jcstress
equivalente para a versão Java.

**Desafio.** Um **verificador de histórico** simples para uma conta: dado um log de operações
`deposit`/`debit` com seus resultados observados, busca (para até 8 operações) uma ordem
sequencial legal que explique todos os resultados.

**Invariantes testáveis**

1. O verificador **aceita** as histórias geradas por 100 rodadas da implementação correta.
2. O verificador **rejeita 100%** de uma história impossível construída à mão (um saldo que nunca
   poderia ter existido dada a sequência de depósitos e débitos).
3. Rodado contra uma implementação com um bug conhecido (plantado de propósito), o verificador
   rejeita pelo menos 1 em cada 100 rodadas — demonstração de que o bug é detectável, não garantia
   de detecção em toda rodada.
4. O CI roda `-race -count` e jcstress, e uma **mutação plantada** (remover o lock de um dos
   caminhos de escrita) derruba a suíte.
5. Nenhum teste desta trilha usa `Thread.sleep`/`time.Sleep` fixo para sincronizar com um evento
   assíncrono — verificado por uma busca textual simples no código de teste.

**Complemento.** Meça o custo em tempo de CI de rodar `-race` sobre toda a suíte, comparado a
rodar sem ele.

**Checagem**

1. Por que um teste que afirma uma sequência específica de eventos é mais frágil que um que afirma
   uma invariante?
2. O que exatamente o detector de race do Go prova, e o que ele **não** prova?
3. O que significa "existe uma ordem sequencial legal que explique os resultados observados", e
   por que isso é diferente de "a ordem real de execução foi esta"?
4. Como um teste de mutação revela que uma suíte de concorrência estava passando pelo motivo
   errado?

## Principais aprendizados

- `Thread.sleep`/`time.Sleep` fixo para sincronizar um teste com um evento assíncrono é a causa
  mais comum de teste intermitente — Awaitility ou poll condicional resolvem isso sem acoplar a um
  tempo fixo.
- O detector de race confirma presença de um data race que ocorreu; ele não prova ausência — por
  isso `-count`, `-shuffle` e `-cpu` variam a execução em vez de confiar numa única rodada.
- Testar por invariante (conservação, monotonicidade, unicidade) sobrevive a qualquer intercalação;
  testar por sequência específica de eventos não.
- Verificação de histórico pergunta se existe uma ordem sequencial legal que explique os
  resultados observados — a ideia central de linearizabilidade, viável por busca para poucas
  operações.
- Teste de mutação prova que a suíte testa o que deveria: remover uma proteção de propósito e
  confirmar que o CI fica vermelho é a única forma de confiar que ele ficaria vermelho de verdade
  se alguém introduzisse o bug sem querer.
