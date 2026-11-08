---
id: java-em-entrevista-e-capstone
title: "Java em entrevista e capstone do pix-core"
summary: "Entrevista técnica de Java sênior testa raciocínio sobre o que você já sabe, sob tempo. As quatro famílias de pergunta e como responder cada uma, o live coding com o invariante dito em voz alta, o \"por que Java e não Go\" com números, os erros comuns de candidato sênior, e o capstone do pix-core."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura, performance, carreira]
references:
  - title: "JMH — Java Microbenchmark Harness"
    url: https://github.com/openjdk/jmh
  - title: "JDK Flight Recorder / JDK Mission Control"
    url: https://docs.oracle.com/en/java/java-components/jdk-mission-control/
  - title: "JEP 0: JEP Index (OpenJDK)"
    url: https://openjdk.org/jeps/0
---

## O que a banca está medindo

Uma entrevista técnica de Java sênior raramente pergunta o que você nunca viu. Ela pergunta o que
todo mundo já viu (um `HashMap`, um `equals`, um `OutOfMemoryError`) e mede **como você raciocina**
sobre isso: se separa o que sabe do que supõe, se propõe uma medida antes de concluir, e se nomeia o
custo da escolha. Os 10 marcos anteriores são o conteúdo; este é o método de usá-lo sob tempo.

## As quatro famílias de pergunta

**"O que este código faz?"** Um trecho curto com uma armadilha: `Integer` com `==`, `BigDecimal` com
`equals`, remoção num `for-each`, `return` no `finally`. A resposta boa vem em três passos:

1. diga o que o código **parece** fazer;
2. diga o que ele **faz**, e o mecanismo (o cache de `Integer` de −128 a 127, a escala no `equals`);
3. diga como você **provaria**: rodando, ou com o teste que escreveria.

Errar o resultado e acertar o mecanismo vale mais do que acertar por sorte.

**"Desenhe esta classe."** Um `Money`, uma chave de idempotência, um resultado de autorização. A banca
quer ver:
- o **invariante** antes do código ("um `Money` nunca tem mais de duas casas", "uma `PixKey` inválida
  não nasce");
- o tipo certo: record para valor, tipo selado para alternativas;
- a igualdade pensada;
- como você testa.

Comece pelo construtor e pela regra que ele protege.

**"Otimize este trecho."** A resposta errada é otimizar. A certa começa por **medir**:
- qual é a métrica (latência p99, *throughput*, alocação);
- como você mediria (JMH, com aquecimento e *forks*; o JFR em produção);
- só então a hipótese: *boxing* (marco 06), hash ruim (marco 03), exceção como fluxo (marco 07),
  *stream* paralelo com I/O.

Uma resposta que diz "eu mediria antes, e o *benchmark* à mão mente por isto" (marco 09) já está
acima da média.

**"Diagnostique este sintoma."** "O pod reinicia com `OOMKilled` e o heap está em 60%", "a latência
sobe a cada 20 minutos". A estrutura é a de um incidente:
- hipóteses em ordem de probabilidade;
- a ferramenta que confirma ou descarta cada uma (NMT, JFR, log de GC, `-Xlog:safepoint`);
- a correção e como provar que ela funcionou.

Os marcos 08 e 10 têm os dois casos inteiros.

## *Live coding*: ritmo e invariante em voz alta

Num exercício de 45 minutos, o roteiro que funciona:

1. **Repita o problema** com as suas palavras, e pergunte o que não está dito (concorrência? limite?
   relógio?).
2. **Diga os invariantes** antes de escrever: "o tamanho nunca passa da capacidade", "uma entrada
   vencida nunca volta".
3. **Escreva o teste do caso simples primeiro**, e depois o código que o faz passar.
4. **Fale enquanto escreve**: a banca avalia o raciocínio, e o silêncio esconde o raciocínio.
5. **Deixe tempo para a concorrência e para os casos de borda**, e diga o que faria com mais tempo
   (jcstress, JMH).

Um código incompleto com os invariantes ditos e testados vale mais que um código completo que
ninguém sabe se está certo.

## "Por que Java e não Go (ou Kotlin)?"

A pergunta aparece em toda vaga que tem mais de uma linguagem no *stack*. A resposta ruim é de
torcida ("Java é mais maduro", "Go é mais rápido"). A boa nomeia **critérios** e traz **números**:
- **ecossistema do domínio:** bibliotecas maduras para ISO 20022, *batch*, integração;
- **time:** quem mantém, quem contrata;
- **custo de operação:** memória e *startup* por réplica (marcos 08 e 09);
- **latência de cauda** sob a carga real.

O marco `go-fintech/16` tem a mesma medição do lado do Go, inclusive o p99 que quase culpou a
linguagem por uma opção de *socket*. O lado do Kotlin, que roda na mesma JVM, está em
`kotlin-backend/01`.

## Erros comuns de candidato sênior

- **Responder com o *framework* quando a pergunta é de linguagem.** "O Spring cuida disso" não
  responde por que o `HashMap` perdeu a chave.
- **Afirmar custo sem ter medido.** "*Stream* é mais lento que laço" é falso para `LongStream` e
  verdadeiro para `reduce` sobre `Long` (marco 06). Diga o que mediu, ou diga que mediria.
- **Citar recurso em *preview* como se fosse padrão.** Padrões primitivos ainda são *preview* no 25.
- **Não perguntar.** O enunciado da entrevista é incompleto de propósito.
- **Esconder o "não sei".** "Não sei de cabeça; eu conferiria assim" é uma resposta sênior.

## Exemplo numa fintech

Numa entrevista para uma vaga de pagamentos, a pergunta foi: "o serviço de limite diário às vezes
deixa passar um Pix acima do limite; o que você investigaria?". Uma resposta fraca propõe trocar o
banco. Uma forte segue a estrutura:
- a hipótese de corrida entre ler o total e gravar, com o padrão `get` + `put` do marco 03;
- como reproduzir: 16 threads num teste;
- a correção: `compute` ou `merge`, ou uma trava por chave;
- e a pergunta que muda tudo: "o serviço roda em quantas réplicas?". Com várias, a corrida não está
  mais no mapa, e sim no banco ou no *cache* distribuído.

## Hands-on

**Tutorial.** Pegue três trechos dos quizzes desta trilha que você errou, ou que acertou sem saber o
mecanismo. Explique cada um em voz alta, em até 2 minutos, com a estrutura "parece, faz, como
provar". Grave a si mesmo.

**Desafio.** Duas rodadas cronometradas de 45 minutos.
1. O desafio `rate-limiter-concorrente` do banco, na versão Java: os testes de referência estão no
   próprio desafio.
2. O `CacheLru` com TTL do marco 03, escrito do zero, sem consultar a sua versão anterior, contra os
   testes do marco 03.

Na segunda, fale os invariantes antes de escrever.

**Invariantes testáveis**

1. Na rodada do `rate-limiter-concorrente`, os 6 testes de referência do banco passam, no JDK 25.
2. Na rodada do `CacheLru`, os testes do marco 03 passam, inclusive o de estresse com 16 threads, em 5
   repetições.
3. O tempo de cada rodada fica registrado, com o ponto em que você travou e o porquê.

**Complemento.** Faça uma rodada com outra pessoa no papel da banca, e peça a ela para interromper
com uma reviravolta ("e se forem 8 réplicas?") aos 30 minutos.

**Checagem**

1. Quais as quatro famílias de pergunta, e qual a estrutura de resposta de cada uma?
2. Por que a resposta certa para "otimize este trecho" começa por uma medida?
3. Qual o roteiro de um *live coding* de 45 minutos?
4. Como responder "por que Java e não Go?" sem torcida?

## Principais aprendizados

- A banca mede raciocínio sobre o conhecido: mecanismo, medida e custo.
- "O que faz": parece, faz, como provar. "Desenhe": invariante primeiro. "Otimize": meça primeiro.
  "Diagnostique": hipótese, ferramenta, prova.
- No *live coding*, diga os invariantes, teste primeiro e fale enquanto escreve.
- Decisão de linguagem é critério e número, não torcida.
- "Não sei; conferiria assim" é resposta sênior.

## Capstone

O `pix-core` é o seu componente do `fin-platform`: o domínio do `pix-gateway`, sem *framework*. A
especificação completa está no `PROJETO.md` desta trilha. Aqui ele fica pronto.

**Entrega**

- [ ] `Money` com `BigDecimal` em escala fixa e rateio exato, e a regra de arquitetura contra
      `double` (marco 01)
- [ ] `PaymentKey`, `PixKey` e `Lote` como records validados, com o contrato de igualdade verificado
      (marco 02)
- [ ] O `CacheLru` com TTL para a consulta DICT, seguro entre threads (marco 03)
- [ ] `Result<T, E>` e o repositório genérico, compilados com `-Xlint:all -Werror` (marco 04)
- [ ] A máquina de estados do pagamento com tipos selados e nenhum `default` (marco 05)
- [ ] O fechamento diário em três implementações e os *benchmarks* de *boxing* (marco 06)
- [ ] A taxonomia de exceções com código estável (marco 07)
- [ ] O dimensionamento de memória no README, conferido pelo NMT (marco 08)
- [ ] *Startup* e *warmup* medidos, com e sem cache AOT (marco 09)
- [ ] Os três incidentes diagnosticados, e o procedimento do *heap dump* (marco 10)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] Dinheiro exato: o rateio soma o total ao centavo, e nenhuma classe de domínio usa ponto
      flutuante (ArchUnit)
- [ ] Contrato de igualdade: o EqualsVerifier passa nos tipos de valor e reprova a *fixture*
- [ ] Tipos fechados: um estado ou evento novo quebra a compilação, e o teste sobre a árvore de
      sintaxe não acha nenhum `default` em `switch` selado
- [ ] Coleções corretas sob estresse: o teste de 16 threads do `CacheLru` passa em 5 repetições e
      reprova a versão sem sincronização
- [ ] Memória dimensionada: a soma configurada fica abaixo do limite do contêiner, com o *committed*
      do NMT anexado
- [ ] *Benchmarks* reproduzíveis: os JMH do projeto rodam com 2 *forks* e dão a mesma ordem de
      grandeza em três execuções
- [ ] `mvn verify` verde no JDK 25, sem nenhum aviso de compilação

**A pergunta final.** Qual afirmação de desempenho no seu código de trabalho você repetiria numa
entrevista sem nunca ter medido? Meça-a com o JMH do `pix-core`, e escreva o resultado.
