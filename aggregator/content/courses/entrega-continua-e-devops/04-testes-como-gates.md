---
id: testes-como-gates
title: "Testes como gates"
summary: "Um teste que não pode reprovar um build não protege nada, e um gate sem teste que o faça falhar de propósito é decoração."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Continuous Delivery (Humble & Farley)"
    url: https://continuousdelivery.com/
---

## *Gate*: critério objetivo, automático, com dono

Um ***gate*** é um critério que **bloqueia** o avanço de um build se não for satisfeito — objetivo (a
mesma entrada sempre produz o mesmo veredito), automático (ninguém decide manualmente caso a caso), e
com **dono** (alguém responsável por manter o critério atualizado e por investigar quando ele
bloqueia algo que parecia legítimo). Um "critério" que existe só em prosa, verificado manualmente por
alguém olhando o código, não é um *gate* — é uma revisão opcional disfarçada de controle.

## Pirâmide × troféu de testes, com a visão da esteira

A pirâmide de testes (muitos testes unitários rápidos na base, menos testes de integração no meio,
poucos testes de ponta a ponta no topo) já é conhecida de `spring-boot/11`. A visão adicional que
este marco traz: **custo e feedback dentro da esteira**. Testes da base da pirâmide rodam em
segundos e dão feedback quase instantâneo; testes do topo rodam em minutos e dão feedback tarde — por
isso a base roda em **todo** PR, e o topo pode rodar só antes de uma promoção, não a cada commit.

## Cobertura de linhas mente, mutação mede

Cobertura de linhas diz "esta linha foi executada durante o teste" — não diz "se esta linha estivesse
errada, o teste teria pego". **Teste de mutação** introduz um erro deliberado no código (trocar `+`
por `-`, inverter uma condição) e verifica se **algum** teste falha — se nenhum falhar, a cobertura
daquela linha era uma ilusão: ela foi executada, mas nada verificava o resultado. Um módulo com 100%
de cobertura e 0% de pontuação de mutação está completamente desprotegido, apesar do número que
parece ótimo no painel.

## Detector de corrida, e ordem aleatória

Em Go, `-race` detecta acesso concorrente não sincronizado durante a execução dos testes — um
detector que só funciona se o teste realmente exercitar o caminho concorrente. Rodar testes em
**ordem aleatória** (em vez de sempre na mesma ordem) expõe dependências ocultas entre testes (um
teste que só passa porque um teste anterior deixou um estado específico) que ordem fixa esconde
indefinidamente. Em Java, a mesma disciplina aplica-se via isolamento de estado entre testes e
execução não determinística da suíte.

## Teste de contrato em CI

Um teste de contrato (`arquitetura-eventos/12`, `kafka/07`) verifica que uma mudança de schema
**não quebra** quem consome aquele schema — rodando como *gate* em CI significa que a quebra de
compatibilidade é pega **antes** do merge, nunca descoberta em produção quando o consumidor já
começou a falhar silenciosamente ou ruidosamente.

## *Smoke* e *e2e* mínimos

Testes de ponta a ponta (*e2e*) são caros (lentos, frágeis, caros de manter) — a resposta não é
eliminá-los, é **minimizá-los** para os caminhos mais críticos (um *smoke test* que verifica que o
sistema básico responde depois de um deploy, por exemplo), deixando o grosso da verificação para a
base rápida da pirâmide.

## Regressão de desempenho como *gate* por **relação**

Medir desempenho absoluto ("essa operação leva 42ms") é frágil — varia por máquina, por carga do
momento, por ruído. Um *gate* de regressão por **relação com a linha de base** (mediana de N
execuções comparada à mediana histórica, com uma tolerância declarada) é robusto a esse ruído: o que
importa não é o valor absoluto, é se a **mudança relativa** excede o que foi tolerado. A técnica
completa de teste de carga pertence à trilha `performance-resiliencia` (planejada); aqui, o *gate*
usa relação com linha de base como critério de bloqueio, sem ensinar a disciplina completa de teste
de carga.

## Seleção de testes por mudança

Rodar a suíte inteira a cada commit, em um repositório grande, desperdiça tempo de CI em testes que
não têm relação alguma com o que mudou. Selecionar, a partir dos arquivos alterados, **quais** testes
são relevantes (e rodar só esses na verificação rápida, deixando a suíte completa para antes da
promoção) é uma otimização de custo que não compromete a cobertura real, se a seleção for feita
corretamente a partir do grafo de dependências.

## Política de teste instável, e *gates* de segurança na ordem certa

A quarentena do marco 02 (com dono e prazo) é a política de teste instável aplicada especificamente a
*gates* — um teste em quarentena não bloqueia o merge, mas continua visível e cobrado. E os *gates* de
segurança (`seguranca-aplicacao/13`) entram na ordem certa dentro da esteira: os mais baratos e
rápidos (análise estática) antes dos mais caros (varredura dinâmica, se existir) — a mesma regra de
falhar cedo e barato do marco 02, aplicada especificamente a segurança.

## Exemplo numa fintech

O módulo `Money` tem 100% de cobertura de linhas — todo caminho é executado durante os testes. Um
teste de mutação planta a troca de `+` por `-` numa soma de valores, e **nenhum** teste existente
falha: a soma está sendo executada, mas nada verifica se o resultado está correto, só que o código
"rodou sem erro". A cobertura de 100% escondia essa lacuna completamente até o teste de mutação
expô-la.

## Hands-on

**Tutorial.** Implemente *gates* de mutação, corrida e ordem aleatória sobre `Money` e um ledger de
exemplo.

**Desafio.** Implemente um *gate* de regressão de desempenho por relação com a linha de base.

**Invariantes testáveis**

1. Um **mutante plantado** no módulo crítico **derruba** a suíte, e o *gate* de mutação **exige**
   uma pontuação mínima definida em arquivo de configuração — não um número arbitrário escolhido na
   hora.
2. `-race` e execução em ordem aleatória passam **sem falha** no lado correto; no lado deliberadamente
   quebrado, a **corrida é demonstrada** (contada, não só detectada uma vez).
3. Uma regressão injetada (série sintética com mediana +30% sobre a linha de base) **reprova** o
   *gate*; um ruído dentro da tolerância declarada **não reprova**.
4. O *gate* de contrato **reprova** uma mudança incompatível de schema, verificado sobre uma massa de
   dados conhecida que representa a incompatibilidade.
5. **Todo** *gate* implementado neste marco tem um teste que o faz **falhar de propósito** — sem
   esse teste, não há prova de que o *gate* realmente bloqueia alguma coisa.

**Complemento.** Meça quanto da suíte completa você consegue rodar apenas para o código efetivamente
alterado, usando seleção de testes por mudança.

**Checagem**

1. Por que cobertura de linhas não mede a mesma coisa que pontuação de mutação, e por que um módulo
   pode ter 100% da primeira e 0% da segunda?
2. Por que rodar testes em ordem aleatória expõe dependências ocultas que ordem fixa esconde?
3. Por que um *gate* de regressão de desempenho usa relação com a linha de base, em vez de um valor
   absoluto de tempo?
4. Por que todo *gate* precisa de um teste que o faz falhar de propósito?

> **Reencontro — `spring-boot/11`; `arquitetura-eventos/12`; `kafka/07`; `concorrencia-e-recursos/08`;
> `go-fintech/08`.** A pirâmide de testes de `spring-boot/11` ganha aqui a dimensão de custo e
> feedback dentro da esteira. O teste de contrato de `arquitetura-eventos/12` e `kafka/07` é
> incorporado diretamente como *gate* de CI. A disciplina de "lado correto com asserção rígida, lado
> quebrado com demonstração, sob semente fixa" de `concorrencia-e-recursos/08` é exatamente a regra
> usada para o *gate* de corrida deste marco. E a comparação Java × Go de `go-fintech/08` é onde a
> aplicação prática de detector de corrida e ordem aleatória nas duas linguagens já apareceu antes.

## Principais aprendizados

- Um *gate* é objetivo, automático e com dono — um critério verificado manualmente, caso a caso, não
  é um *gate*, é revisão opcional disfarçada.
- Cobertura de linhas mede execução; pontuação de mutação mede verificação — os dois números podem
  divergir completamente, e divergem com frequência maior do que se espera.
- Ordem aleatória de testes expõe dependências ocultas entre testes que ordem fixa esconde
  indefinidamente.
- Um *gate* de regressão de desempenho usa relação com a linha de base, não valor absoluto, porque é
  robusto ao ruído de medição entre execuções.
- Todo *gate* precisa de um teste que o faça falhar de propósito — sem isso, não há prova de que ele
  bloqueia alguma coisa de verdade.
