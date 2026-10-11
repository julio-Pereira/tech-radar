---
id: influencia-e-comunicacao
title: "Influência e comunicação"
summary: "Uma decisão correta que ninguém entende ou aceita não acontece; comunicar trade-off sem esconder dúvida é parte do trabalho, não um extra."
estimatedMinutes: 50
references:
  - title: "Documenting Architecture Decisions (Michael Nygard)"
    url: https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
---

## RFC: problema, opções, trade-off, recomendação, riscos

Um RFC (documento de decisão) bem formado tem uma estrutura mínima e verificável: o **problema**
(não a solução já decidida, o problema que motiva a necessidade de decidir), **ao menos duas
opções** reais consideradas (um RFC com uma única opção "analisada" não é uma decisão, é uma
justificativa retroativa), **trade-off** entre elas, uma **recomendação**, **riscos** identificados,
**partes consultadas**, e — de novo, em toda trilha desta série — **gatilho de reversão**.

## Mapa de partes interessadas

Quem **decide**, quem é **afetado**, e quem **bloqueia** (tem poder de impedir, mesmo sem
autoridade formal de decisão) são três papéis diferentes que frequentemente se sobrepõem de forma
não óbvia. Mapear isso explicitamente antes de propor uma mudança evita a surpresa de descobrir,
tarde no processo, que alguém com poder de bloqueio nunca foi consultado.

## Um conteúdo, públicos diferentes

O mesmo conteúdo de uma decisão precisa de **apresentações diferentes** por público: para o nível
executivo, risco, custo e prazo são o que importa; para engenheiros, contrato técnico e prova (como
verificar que a decisão funciona) são o que importa. Escrever um único documento que tenta servir
aos dois públicos igualmente bem geralmente serve mal a ambos — o executivo se perde em detalhe
técnico, o engenheiro não encontra o detalhe técnico que precisa porque está diluído em contexto de
negócio.

## Dissensão, e como registrar discordância

Quando uma decisão é tomada sem consenso unânime, registrar a **discordância explicitamente** (quem
discordou, e por quê) é mais honesto e mais útil do que fingir unanimidade — porque, se a decisão se
mostrar errada depois, a discordância registrada é informação valiosa sobre o que foi considerado e
rejeitado, não descoberta tarde como "ninguém tinha pensado nisso".

## Dizer "não" com alternativa

Recusar uma proposta sem oferecer nada no lugar é o tipo de resposta que gera ressentimento e não
resolve o problema que motivou a proposta em primeiro lugar. Dizer "não, porque X, e a alternativa
que resolve o mesmo problema sem o risco X é Y" é mais construtivo e mais provável de ser aceito do
que uma negativa sem caminho.

## Estimar sob incerteza, em faixas

Uma estimativa como um número único ("vai levar 3 semanas") esconde a incerteza real por trás do
número. Uma **faixa** com premissa explícita ("entre 2 e 5 semanas, assumindo que a integração com o
sistema X não precisa de mudança") comunica honestamente o que é conhecido e o que não é, em vez de
uma falsa precisão.

## *Pre-mortem*

Antes de executar uma decisão significativa, um ***pre-mortem***: imaginar que o projeto **já
falhou**, e listar por quê — um exercício que, por inverter a pergunta de "o que pode dar errado?"
para "assumindo que deu errado, o que foi?", frequentemente descobre riscos que a pergunta direta não
descobre, porque é mais fácil para as pessoas admitirem um risco quando ele já é hipoteticamente real
do que quando ainda é uma possibilidade abstrata.

## Influenciar sem autoridade formal

Grande parte da influência real em arquitetura de soluções acontece **sem** autoridade hierárquica
sobre quem precisa ser convencido — através de dados concretos, de prototipagem que demonstra em vez
de apenas argumentar, e de construir aliados antes de propor formalmente, não depois.

## Trajetória de IC sênior/staff (complementa `system-design/15`)

O que se espera de um engenheiro sênior ou *staff* em termos de influência — decisões que
atravessam equipes, comunicação que chega a públicos diferentes — já foi tratado em
`system-design/15`; este marco acrescenta as ferramentas específicas (RFC, mapa de partes
interessadas, *pre-mortem*) que tornam essa influência concreta e repetível, não apenas uma
qualidade pessoal abstrata.

## O que **não** se resolve com documento

Nenhum RFC, por mais bem escrito, resolve um conflito de **poder** real ou uma diferença genuína de
**valores** entre equipes — isso exige conversa direta, não documentação. As invariantes deste marco
verificam a **forma** de um RFC bem construído; a **forma** não garante persuasão, e este marco é
honesto sobre essa limitação.

## Exemplo numa fintech

A proposta de trocar o mecanismo de filas do `fin-platform` por outro gera dois documentos: o RFC
completo, técnico, para o time de plataforma que vai implementar e operar a mudança; e um resumo
executivo de uma página, sem jargão técnico, para a diretoria, focado em custo, risco e prazo — o
mesmo conteúdo, duas apresentações, porque tentar servir os dois públicos com um documento só
serviria mal aos dois.

## Hands-on

**Tutorial.** Construa `rfc/modelo.md` e o *lint* correspondente.

**Desafio.** Escreva um RFC real de uma decisão do `fin-platform`, e a versão executiva do mesmo
conteúdo.

**Invariantes testáveis**

1. O RFC tem **≥2 opções reais**, tabela de trade-off, riscos, **partes consultadas**, decisão e
   gatilho de reversão — verificado por *lint* sobre o documento, cada campo obrigatório presente.
2. O resumo executivo cabe no **limite de palavras** declarado e **não contém** nenhum termo da
   **lista de jargão proibida** (lista versionada, verificada automaticamente).
3. Toda estimativa no documento tem **faixa** (não número único) e a **premissa** declarada
   explicitamente.
4. O *pre-mortem* lista **ao menos 5** falhas possíveis, cada uma com **mitigação ou aceite**
   explícito — nenhuma falha listada sem uma das duas respostas.

**Complemento.** Reescreva uma decisão passada do seu trabalho que você perdeu (não foi aceita),
pelo ponto de vista de quem discordou de você — o que a discordância via que sua proposta original
não considerava.

**Checagem**

1. Por que um RFC com uma única opção "analisada" não é uma decisão, é justificativa retroativa?
2. Por que o mesmo conteúdo precisa de apresentações diferentes por público, em vez de um documento
   único que serve a todos?
3. O que um *pre-mortem* descobre que a pergunta direta "o que pode dar errado?" frequentemente não
   descobre?
4. Por que este marco afirma explicitamente que a forma de um RFC bem construído não garante
   persuasão?

> **Reencontro — `system-design/15`; `system-design/01`; `observabilidade/15`; `spring-boot/13`.**
> A trajetória de IC sênior/staff de `system-design/15` é o que este marco complementa com
> ferramentas concretas de influência. O método C4/ADR de `system-design/01` é a base documental
> sobre a qual o RFC se apoia. A condução de um incidente até a causa raiz de `observabilidade/15` é
> outro contexto em que comunicar trade-off e incerteza, sem esconder dúvida, é decisivo. E o time
> de plataforma de `spring-boot/13` (Conway) é onde o mapa de partes interessadas frequentemente
> revela quem tem poder de bloqueio, mesmo sem autoridade formal de decisão.

## Principais aprendizados

- Um RFC com uma única opção "analisada" é justificativa retroativa, não uma decisão real — exige
  ao menos duas opções consideradas de verdade.
- O mapa de partes interessadas distingue quem decide, quem é afetado, e quem bloqueia — três
  papéis que se sobrepõem de forma frequentemente não óbvia.
- O mesmo conteúdo de decisão precisa de apresentações diferentes por público — um documento único
  tende a servir mal tanto ao executivo quanto ao engenheiro.
- *Pre-mortem* descobre riscos que a pergunta direta "o que pode dar errado?" frequentemente não
  descobre, porque admitir um risco hipoteticamente já real é mais fácil que admiti-lo como
  possibilidade abstrata.
- Nenhum RFC resolve conflito de poder ou diferença genuína de valores — a forma bem construída
  verifica estrutura, não garante persuasão, e este marco é honesto sobre essa limitação.
