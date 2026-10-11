---
id: atributos-de-qualidade
title: "Atributos de qualidade e trade-offs"
summary: "\"Escalável, seguro e manutenível\" não é requisito, é desejo. Atributo de qualidade só vira decisão quando tem cenário com medida."
estimatedMinutes: 60
completion: quiz
references:
  - title: "Software Architecture in Practice (Bass, Clements, Kazman)"
    url: https://www.sei.cmu.edu/library/software-architecture-in-practice-fourth-edition/
---

## Por que listas genéricas não decidem nada

ISO/IEC 25010 (**conferir** a lista vigente) lista atributos de qualidade — desempenho,
disponibilidade, manutenibilidade, segurança, e outros. Mas dizer "o sistema precisa ser
manutenível" não decide nenhuma arquitetura concreta: toda arquitetura pode alegar que é
manutenível, em algum sentido vago. O que decide é transformar o desejo genérico num **cenário**
específico, com uma medida que ou passa ou não passa.

## O cenário de atributo de qualidade: seis campos

Um cenário útil tem: **fonte** (quem ou o que gera o estímulo), **estímulo** (o evento — um pico de
tráfego, uma mudança de requisito, uma tentativa de ataque), **ambiente** (condição do sistema no
momento — produção sob carga normal, modo degradado), **artefato** (a parte do sistema afetada),
**resposta** (o que o sistema faz) e, o campo que faz a diferença entre desejo e decisão, a **medida
de resposta** — um número ou uma relação verificável. "O sistema deve ser escalável" não é um
cenário. "Sob um aumento de 3× no tráfego normal, o serviço de autorização mantém p99 abaixo de 200ms
sem intervenção manual" é.

## A árvore de utilidade: priorizar por importância e dificuldade

Com uma dúzia de cenários levantados, não dá para tratar todos com o mesmo rigor. A **árvore de
utilidade** organiza os cenários numa matriz de importância para o negócio × dificuldade de atingir
— os cenários de alta importância e alta dificuldade são os que merecem a atenção arquitetural
cuidadosa; os de baixa importância ou baixa dificuldade podem ser resolvidos com uma decisão simples
ou nem precisam de decisão alguma.

## Táticas por atributo

Para cada atributo de qualidade existe um catálogo de **táticas** — meios conhecidos de atingi-lo.
Desempenho: cache, particionamento de carga, redução de contenção. Disponibilidade: redundância,
detecção de falha, recuperação ativa-passiva ou ativa-ativa. Modificabilidade: encapsular variação,
usar interfaces estáveis, reduzir acoplamento (os marcos 04 e 05 aprofundam). Segurança: autenticar,
autorizar, auditar, limitar exposição. Testabilidade: injetar dependência, isolar o relógio e outras
fontes de não-determinismo. Observabilidade: emitir sinais, correlacionar eventos. Nenhuma tática é
gratuita — a próxima seção explica o preço.

## Pontos de sensibilidade e de trade-off

Um **ponto de sensibilidade** é um parâmetro arquitetural ao qual uma medida de resposta é
particularmente sensível — mudar o tamanho do *connection pool* muda a latência sob carga de forma
desproporcional, por exemplo. Um **ponto de trade-off** é mais interessante ainda: é um parâmetro
que afeta **mais de um** atributo, em direções opostas. A mesma tática que melhora auditabilidade
(publicar um evento de domínio para cada mudança de estado) complica modificabilidade (agora toda
mudança de estrutura do agregado precisa considerar o consumidor do evento) e pode complicar
desempenho (mais um passo de serialização e publicação por operação). Identificar o ponto de
trade-off explicitamente — nomear os dois atributos em tensão — é o que distingue uma decisão
arquitetural informada de uma escolhida sem entender o que está sendo sacrificado.

## Uma avaliação de arquitetura que funciona sozinha

Um ritual de avaliação de arquitetura de uma semana (como ATAM, por exemplo) tem valor, mas poucas
equipes de fintech vão rodar isso regularmente. Uma versão enxuta que **funciona sozinha**: uma
lista de cenários priorizados pela árvore de utilidade, os riscos identificados, e os **não-riscos**
(decisões que parecem arriscadas mas, examinadas, não são) — produzida em horas, não em dias, e
repetível a cada mudança estrutural relevante.

## Modificabilidade medida: quantos arquivos uma mudança toca

Uma medida concreta e barata de modificabilidade: para uma mudança típica e representativa (como
"adicionar um novo meio de pagamento"), quantos arquivos e módulos precisam ser tocados? Esse número
não é absoluto — compara-se entre estilos arquiteturais (marco 01) ou entre versões do mesmo sistema
ao longo do tempo, nunca como "nota" isolada. Um número que sobe ao longo do tempo, sem que o
domínio tenha crescido na mesma proporção, é o primeiro sinal mensurável de erosão arquitetural.

## Exemplo numa fintech

Dois cenários concorrem por atenção: "adicionar um novo meio de pagamento deve tocar no máximo N
arquivos" (modificabilidade) e "toda transferência deve ser auditável, com rastro completo de quem
mudou o quê e quando" (auditabilidade/segurança). A tática óbvia para o segundo — publicar um evento
de domínio a cada mudança de estado — ajuda diretamente o cenário de auditabilidade e, ao mesmo
tempo, aumenta o número de arquivos tocados por uma mudança típica, pressionando o primeiro cenário
na direção errada. Isso é um ponto de trade-off real, não uma falha de projeto.

## Hands-on

**Tutorial.** Produza `qualidade/cenarios.yaml` com 6 cenários de atributo de qualidade e a árvore
de utilidade correspondente.

**Desafio.** Meça a modificabilidade do `transferir` (marco 01) em cada um dos três estilos,
adicionando um novo meio de pagamento e contando o que foi tocado.

**Invariantes testáveis**

1. Todo cenário em `cenarios.yaml` tem os **seis campos** e uma **medida de resposta numérica** —
   verificado por *lint* do arquivo, não por revisão manual.
2. A medição de arquivos/módulos tocados por uma mudança é **reproduzível**: um script aplica o
   patch da mudança e conta, sem depender de contagem manual.
3. A ordem de custo de modificabilidade entre os três estilos do marco 01 é **asserida como
   relação** (estilo A toca mais arquivos que estilo B), nunca como número absoluto fixo.
4. Cada tática registrada no catálogo nomeia **explicitamente** o atributo que ela piora, não só o
   que ela melhora.

**Complemento.** Reescreva três requisitos vagos do seu próprio trabalho ("deve ser escalável",
"deve ser seguro", "deve ser fácil de manter") como cenários completos de atributo de qualidade.

**Checagem**

1. Por que "o sistema deve ser escalável" não é um cenário de atributo de qualidade?
2. Quais são os seis campos de um cenário completo?
3. O que distingue um ponto de sensibilidade de um ponto de trade-off?
4. Por que uma avaliação de arquitetura "de uma semana" costuma falhar em ser adotada, e o que a
   versão enxuta deste marco propõe no lugar?
5. Por que a medida de modificabilidade (arquivos tocados) é comparada como relação, nunca como
   número absoluto?
6. No exemplo da fintech, por que publicar um evento de domínio a cada mudança é descrito como
   ponto de trade-off, e não como melhoria sem custo?

> **Reencontro — `system-design/02`; `observabilidade/12`; `seguranca-aplicacao/01`;
> `concorrencia-e-recursos/10`.** Requisitos e números de `system-design/02` são o mesmo exercício
> de transformar desejo vago em medida, aqui aplicado a atributo de qualidade arquitetural em vez de
> requisito de capacidade. SLO e *error budget* de `observabilidade/12` são cenários de
> disponibilidade com medida de resposta já formalizados. A modelagem de ameaça de
> `seguranca-aplicacao/01` é o mesmo raciocínio de cenário aplicado a segurança. E a concorrência no
> ledger de `concorrencia-e-recursos/10` é um ponto de trade-off real entre desempenho e
> consistência, do tipo que este marco ensina a nomear.

## Principais aprendizados

- Um desejo genérico ("escalável", "seguro") não decide arquitetura; um cenário com os seis campos
  — incluindo a medida de resposta — decide.
- A árvore de utilidade prioriza cenários por importância × dificuldade, concentrando rigor onde ele
  compensa.
- Toda tática tem preço: um ponto de trade-off afeta mais de um atributo em direções opostas, e
  nomear os dois atributos em tensão é o que distingue decisão informada de escolha por acaso.
- Uma avaliação de arquitetura enxuta (cenários + riscos + não-riscos) funciona sozinha, sem o
  ritual de uma semana que a maioria das equipes nunca repete.
- Modificabilidade medida como arquivos tocados por uma mudança típica é comparada como relação
  entre estilos ou ao longo do tempo — nunca como nota absoluta.
