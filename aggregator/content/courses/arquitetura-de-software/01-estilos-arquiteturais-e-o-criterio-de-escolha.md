---
id: estilos-arquiteturais
title: "Estilos arquiteturais e o critério de escolha"
summary: "Um estilo arquitetural é um conjunto de regras sobre quem pode depender de quem — e a escolha certa protege um atributo, não uma moda."
estimatedMinutes: 55
references:
  - title: "Hexagonal Architecture (Alistair Cockburn)"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Vertical Slice Architecture (Jimmy Bogard)"
    url: https://www.jimmybogard.com/vertical-slice-architecture/
---

## Arquitetura é decisão difícil de reverter; design é o resto

Arquitetura e design não são níveis de abstração diferentes — são **custo de reversão** diferente.
Escolher o formato de uma função é design: muda numa tarde. Escolher que o domínio nunca importa um
driver de banco é arquitetura: reverter isso depois que cem arquivos já dependem da decisão é caro.
Esta trilha trata do segundo tipo de decisão, e cada marco termina numa regra que o CI verifica —
porque uma decisão difícil de reverter que **não é verificada** erode sem ningém perceber até o dia
em que reverter já não é mais opcional.

## Em camadas: o estilo default, e seus três vícios

A arquitetura em camadas (apresentação → aplicação → domínio → dados) é o default que a maioria dos
times já conhece. Três vícios recorrentes: o **sinkhole** (uma chamada atravessa camada após camada
sem fazer nada além de repassar o parâmetro — cerimônia sem função); a **camada de passagem**
(existe no diagrama, mas na prática todo mundo pula direto para a camada de dados "só esta vez", até
a camada parar de significar algo); e o **modelo anêmico** (objetos que só têm getters/setters, e
toda regra de negócio mora em serviços de fora — o agregado do marco 03 existe para corrigir
exatamente isso).

## Hexagonal, *onion*, *clean*: a mesma ideia, nomes diferentes

As três variações compartilham uma regra única: **a dependência aponta para o domínio**, nunca o
contrário. O domínio define **portas** (interfaces que ele precisa ou oferece); **adaptadores** —
banco, fila, HTTP — implementam essas portas de fora para dentro. Chamar isso de hexagonal, onion ou
clean architecture é escolha de vocabulário; a regra de dependência testável é a mesma nos três, e é
ela que o marco 04 aprofunda.

```diagrama
as-camadas
as-hexagonal
```

## *Vertical slice*: organizar por funcionalidade, não por camada técnica

Em vez de uma pasta `controllers/`, uma `services/` e uma `repositories/` cada uma com um arquivo por
funcionalidade espalhado entre as três, o *vertical slice* agrupa tudo que uma funcionalidade
precisa (entrada, regra, saída) numa única pasta. O ganho: para entender ou mudar uma
funcionalidade, você abre uma pasta, não quatro. O custo: funcionalidades relacionadas podem
duplicar código que, em camadas, estaria centralizado num serviço compartilhado — uma troca, não uma
vitória incondicional.

## Monolito modular, microkernel, *pipes and filters*, orientado a eventos — por referência

**Monolito modular**: fronteiras internas fortes dentro de um único processo de deploy — a trilha
`system-design/03` já tratou quando esse estilo faz sentido no nível de sistema; aqui o interesse é
a fronteira **de módulo**, que o marco 05 mede. **Microkernel/*plugin***: um núcleo pequeno e
extensões carregadas — raro em fintech, citado por completude. ***Pipes and filters***: uma cadeia
de transformações, mais comum em engenharia de dados do que em serviço transacional. **Orientado a
eventos, CQRS, *event sourcing***: a trilha `arquitetura-eventos` já cobre esses em profundidade;
aqui eles entram só como referência, não como conteúdo novo.

## A pergunta que decide: o que este estilo torna fácil, e o que torna caro?

Todo estilo tem um preço. Hexagonal torna fácil trocar um adaptador (banco, fila) sem tocar o
domínio — e torna caro escrever um CRUD simples, pela indireção extra. *Vertical slice* torna fácil
entender uma funcionalidade isolada — e torna caro reusar lógica entre funcionalidades parecidas. A
escolha de estilo é sempre: qual mudança futura eu quero tornar fácil, sabendo que vou pagar por isso
em outra mudança que fica mais cara? O critério inclui o tamanho do domínio, sua volatilidade, o
tamanho da equipe e qual atributo de qualidade (marco 02) a decisão precisa proteger — nunca "o que
está na moda" ou "o que o time já usou antes" como justificativa isolada.

## Exemplo numa fintech

A mesma funcionalidade `transferir` — debitar uma conta, creditar outra, registrar o lançamento — é
escrita do jeito que o time já conhece (em camadas) e depois reescrita em hexagonal e em *vertical
slice*. O comportamento observável não muda: as três passam na mesma suíte de testes. O que muda é
só o grafo de dependências entre arquivos — e é esse grafo, não uma impressão subjetiva, que permite
comparar os três de forma honesta.

## Hands-on

**Tutorial.** Implemente `transferir` nos três estilos (camadas, hexagonal, *vertical slice*) a
partir de uma suíte de comportamento única, compartilhada entre os três.

**Desafio.** Para cada estilo, escreva a regra de dependência numa frase e como teste de arquitetura
que a verifica.

**Invariantes testáveis**

1. A **mesma suíte de comportamento** passa, sem alteração, nos três estilos implementados.
2. Cada estilo tem um teste de arquitetura que **falha** quando a regra de dependência é violada de
   propósito — o teste da violação também está incluído, não só o teste que passa.
3. O grafo de dependências de cada estilo é extraído do código (não desenhado à mão) e salvo como
   artefato comparável.
4. Um relatório compara arquivos e pacotes tocados por estilo (o custo de cerimônia) sem concluir
   "o melhor" — a comparação é de custo, não de ranking.

**Complemento.** Em qual dos três estilos uma violação da regra de dependência seria encontrada mais
cedo numa revisão de código humana, antes mesmo do teste de arquitetura rodar?

**Checagem**

1. Por que arquitetura se distingue de design pelo custo de reverter, não pelo tamanho da decisão?
2. Quais são os três vícios clássicos da arquitetura em camadas?
3. O que significa "a dependência aponta para o domínio", e por que hexagonal, onion e clean
   compartilham essa mesma regra?
4. Qual pergunta decide o estilo certo para um contexto específico?

> **Reencontro — `spring-boot/13`; `system-design/03`; `arquitetura-eventos/06`; `go-fintech/02`.**
> O Spring Modulith "sem cerimônia" de `spring-boot/13` é hexagonal aplicado com pragmatismo — aqui
> o critério por trás dessa escolha fica explícito. Monolito modular como estilo de sistema já foi
> tratado em `system-design/03`; este marco foca na fronteira de módulo, não na fronteira de
> serviço. `arquitetura-eventos/06` trata a projeção como resposta a uma pergunta específica — a
> mesma lógica por trás do *vertical slice*. E a estrutura de pacotes Go de `go-fintech/02` ganha
> aqui o critério que lá era apenas convenção.

## Principais aprendizados

- Arquitetura se distingue de design pelo custo de reverter a decisão, não pela escala ou
  complexidade aparente.
- Em camadas tem três vícios recorrentes: *sinkhole*, camada de passagem, e modelo anêmico.
- Hexagonal, *onion* e *clean* compartilham a mesma regra testável — a dependência aponta para o
  domínio — sob nomes diferentes.
- *Vertical slice* organiza por funcionalidade, trocando reúso centralizado por isolamento de
  mudança.
- A escolha de estilo é sempre uma troca: o que ele torna fácil, versus o que ele torna caro —
  decidida pelo atributo de qualidade que a mudança futura mais provável precisa proteger.
