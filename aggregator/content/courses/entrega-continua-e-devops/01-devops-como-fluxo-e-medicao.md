---
id: devops-como-fluxo
title: "DevOps como fluxo e medição"
summary: "DevOps não é um cargo nem uma ferramenta: é encurtar o caminho entre uma ideia e o cliente sem perder estabilidade — e o que não se mede vira opinião."
estimatedMinutes: 55
references:
  - title: "Accelerate (Forsgren, Humble, Kim)"
    url: https://itrevolution.com/product/accelerate/
  - title: "DORA — pesquisa e as métricas de entrega"
    url: https://dora.dev/
---

## Cultura, prática, e medição — as três pernas

DevOps como **cultura**: colaboração entre quem escreve código e quem o opera, responsabilidade
compartilhada pelo que roda em produção. DevOps como **prática**: integração contínua, entrega
contínua, infraestrutura como código — os marcos seguintes desta trilha. DevOps como **medição**: sem
números, qualquer afirmação sobre "estamos entregando melhor" é opinião. As três pernas sustentam
uma à outra; praticar sem medir é não saber se funcionou, e medir sem a cultura certa produz
métricas que ninguém usa para decidir nada.

## Mapa do fluxo de valor: trabalho × espera

Um **mapa do fluxo de valor** desenha, para uma mudança típica, cada passo desde a ideia até estar em
produção — e para cada passo, dois números: tempo de **trabalho** (alguém ativamente fazendo algo) e
tempo de **espera** (a mudança parada, esperando revisão, aprovação, uma janela de deploy). A
**eficiência de fluxo** é `trabalho / (trabalho + espera)` — e em quase todo processo real, antes de
medir, a intuição subestima drasticamente quanto do tempo total é espera, não trabalho.

## Lote pequeno: por que ele reduz risco e espera

Um lote pequeno de mudança (poucos arquivos, uma intenção clara) é mais fácil de revisar rápido,
mais fácil de testar isoladamente, e, se algo der errado, mais fácil de identificar a causa — menos
coisas mudaram ao mesmo tempo. Lotes grandes acumulam risco silenciosamente: quando finalmente vão
para produção, qualquer problema tem muito mais candidatos a causa. O limite de trabalho em
progresso (WIP) é o mecanismo que força lotes pequenos: menos itens abertos simultaneamente significa
que cada um termina mais rápido, em vez de todos avançarem devagar em paralelo.

## As quatro métricas DORA (conferir nomes e edição vigente)

A pesquisa DORA identifica quatro métricas associadas a alto desempenho de entrega: **frequência de
implantação**, **tempo de entrega de mudança** (*lead time*, do commit à produção), **taxa de falha
de mudança**, e **tempo de recuperação** (de um incidente). A composição exata e a inclusão de
métricas adicionais mudam entre edições da pesquisa — **confira** a edição vigente antes de citar um
nome ou um valor específico como referência absoluta.

## Velocidade e estabilidade vão juntas — não são opostos

A descoberta central da pesquisa DORA é contraintuitiva para quem já ouviu "rápido e com qualidade
são trade-off": equipes de alto desempenho são **boas nas duas** ao mesmo tempo — entregam com mais
frequência **e** têm menos falha de mudança. Tratar velocidade e estabilidade como opostos que se
trocam é o erro de modelo mental mais caro desta trilha inteira, porque justifica otimizar uma
métrica ignorando a outra.

## A lei de Goodhart: a métrica vira alvo, e é manipulada

"Quando uma medida se torna o alvo, ela deixa de ser uma boa medida." Uma equipe pressionada a
aumentar frequência de implantação pode dividir um commit significativo em vários commits triviais
— a métrica sobe, o valor entregue não muda, e a taxa de falha pode até subir, porque os commits
fatiados não foram pensados como unidades de mudança seguras. A defesa é nunca olhar uma métrica de
velocidade isolada — sempre ao lado da métrica de estabilidade correspondente.

## O que as métricas não dizem

Nenhuma métrica DORA diz **por que** o tempo de entrega está alto — ela aponta que existe um
problema, não qual é o passo específico que mais atrasa (isso é o mapa do fluxo de valor). Nenhuma
métrica substitui a confiabilidade medida por SLO (`observabilidade/12`) — DORA mede o processo de
entrega; SLO mede o comportamento do sistema em produção, depois de entregue. Confundir os dois leva
a "o SLO está bom, então a esteira está boa" — afirmações que não se seguem uma da outra.

## Exemplo numa fintech

Uma equipe sob pressão para "melhorar a frequência de implantação" passa a dividir commits
significativos em pedaços menores, sem relação com uma unidade de mudança real — a métrica de
frequência sobe visivelmente no painel, enquanto a taxa de falha de mudança sobe também, porque os
pedaços fatiados não foram desenhados como entregas seguras isoladamente. Um relatório que olhasse só
a frequência diria "melhoramos"; um relatório que recusa mostrar velocidade sem estabilidade ao lado
mostraria a verdade.

## Hands-on

**Tutorial.** Implemente `dora/` calculando as quatro métricas a partir de um histórico **sintético**
de eventos (commits, deploys, incidentes).

**Desafio.** Desenhe o mapa do fluxo de valor de uma mudança típica do `fin-platform` e um simulador
de tamanho de lote.

**Invariantes testáveis**

1. As funções de cálculo das métricas DORA devolvem **valores exatos** sobre uma massa de dados
   conhecida (teste de tabela).
2. O relatório **recusa** exibir qualquer métrica de velocidade sem a métrica de estabilidade
   correspondente ao lado — verificado por teste, não por convenção de uso.
3. A eficiência de fluxo calculada do mapa bate exatamente com `trabalho / (trabalho + espera)`,
   recalculada de forma independente a partir dos mesmos dados brutos.
4. No simulador, com **semente fixa**, **lote menor implica *lead time* médio menor** — testado como
   relação entre tamanhos de lote, nunca como um valor absoluto específico.
5. Um cenário de "gaming" da métrica (commits fatiados artificialmente) é **detectado** por um par
   de métricas analisado junto (frequência subindo, estabilidade caindo), não por uma delas isolada.

**Complemento.** Liste três métricas de vaidade do seu próprio contexto de trabalho — métricas que
parecem informar algo, mas na prática não orientam nenhuma decisão real.

**Checagem**

1. Por que velocidade e estabilidade são tratadas como indo juntas, e não como um trade-off, segundo
   a pesquisa DORA?
2. O que o tamanho de lote tem a ver com o risco de uma mudança, além da velocidade de entrega?
3. O que é eficiência de fluxo, e por que a intuição costuma subestimar quanto do tempo total é
   espera?
4. O que a lei de Goodhart prevê sobre uma métrica usada como alvo, e qual defesa este marco propõe?

> **Reencontro — `observabilidade/12`; `observabilidade/13`; `system-design/14`; `kubernetes/13`.**
> SLO e *error budget* de `observabilidade/12` medem o sistema depois de entregue; as métricas DORA
> deste marco medem o processo de entrega — os dois são complementares, nunca substitutos. Alertas e
> on-call de `observabilidade/13` fecham o ciclo que o tempo de recuperação desta trilha mede. O uso
> de *feature flags* para integrar trabalho incompleto, de `system-design/14`, é uma das ferramentas
> que reduz o tamanho efetivo de um lote sem atrasar a integração. E o GitOps de `kubernetes/13` é o
> destino típico de um deploy cuja frequência este marco aprende a medir.

## Principais aprendizados

- DevOps é cultura, prática e medição juntas — praticar sem medir não revela se funcionou, e medir
  sem a cultura certa produz números que ninguém usa.
- Eficiência de fluxo (`trabalho / (trabalho + espera)`) costuma revelar que a maior parte do tempo
  de entrega é espera, não trabalho — a intuição subestima isso sistematicamente.
- Lote pequeno reduz risco (menos candidatos a causa quando algo falha) além de reduzir tempo de
  entrega.
- Velocidade e estabilidade vão juntas em equipes de alto desempenho — tratá-las como trade-off é o
  erro de modelo mental mais caro desta trilha.
- A lei de Goodhart prevê que uma métrica usada como alvo isolado é manipulada; a defesa é nunca
  olhar uma métrica de velocidade sem a de estabilidade correspondente ao lado.
