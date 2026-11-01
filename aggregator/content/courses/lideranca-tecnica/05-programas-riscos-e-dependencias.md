---
id: programas-riscos-e-dependencias
title: "Programas, riscos, dependências e fronteiras de times"
summary: "Em iniciativas entre equipes, o caminho crítico é feito de gente e de dependências — e quem o nomeia cedo ganha as semanas que os outros perdem."
estimatedMinutes: 70
competencies: [execucao, decisao]
references:
  - title: "Team Topologies"
    url: https://teamtopologies.com/
---

## O papel do líder técnico num programa

Um programa — iniciativa que atravessa várias equipes — tem um gerente de projeto (quando existe)
cuidando de cronograma e comunicação, e tem o líder técnico cuidando de algo diferente: **escopo
técnico, interfaces entre sistemas e riscos técnicos**. Os dois papéis se sobrepõem em comunicação
de status, mas o líder técnico é quem efetivamente sabe dizer se uma dependência técnica é real ou
contornável — e isso não é delegável para quem não tem profundidade técnica.

## *Kickoff* e RACI/DACI

No início de um programa, um **RACI** (Responsável, Aprovador, Consultado, Informado) ou **DACI**
(Direcionador, Aprovador, Contribuidor, Informado) explícito evita a situação mais comum de
programas que travam: ninguém sabe quem de fato decide quando duas equipes discordam. A regra
central é simples e rígida — **um único "A" (ou "D") por decisão**. Duas pessoas com poder de
aprovação na mesma linha é a receita para decisão paralisada ou revertida depois.

## Grafo de dependências e caminho crítico

Mapear as dependências entre as partes de um programa como um **grafo** permite calcular o
**caminho crítico** — a sequência de tarefas que, somadas, determinam a duração mínima do programa
inteiro — e a **folga** de cada tarefa fora dele (quanto ela pode atrasar sem afetar a data final).
Tarefas no caminho crítico merecem atenção de gestão de risco desproporcional; tarefas com folga
grande não merecem a mesma urgência, mesmo que pareçam importantes isoladamente.

## O líder fora do caminho crítico

Quanto o Tech Lead deve programar? O suficiente para manter **contexto e credibilidade**: quem para
de tocar o código perde a intuição de quanto custa uma mudança e passa a revisar desenho de longe.
Mas não em tarefa do **caminho crítico**. O tempo do líder é o mais interrompível do time: é ele
quem atende o incidente, a reunião com a outra equipe, a dúvida do diretor e a pessoa travada. Uma
tarefa de três dias no caminho crítico, nas mãos de quem é interrompido o tempo todo, vira uma
tarefa de cinco, e o programa inteiro atrasa junto. O que o líder pega é o que tem **folga** ou
fica fora do grafo: um protótipo que reduz a incerteza de uma decisão, uma ferramenta que poupa
horas do time, uma investigação de desempenho, a correção de um defeito que não bloqueia ninguém.
A regra não é "o líder não programa", é "o atraso do líder não pode virar o atraso do programa".

```diagrama
lt-caminho-critico
```

## Registro de riscos

Um risco tem cinco campos obrigatórios: **probabilidade**, **impacto**, **dono**, **mitigação** e
**gatilho** (o sinal observável de que o risco está se materializando, não só uma descrição vaga).
Risco é diferente de **incerteza** (algo desconhecido, mas não necessariamente ruim) e de
**problema** (algo que já aconteceu). Um registro de riscos sem dono é, na prática, um registro de
coisas que ninguém vai cuidar até que virem problema.

## Relatório de status que não mente

Um status "verde" deveria significar, objetivamente, algo verificável — não "o sentimento geral é
positivo". A prática saudável define o critério **antes**: por exemplo, "vermelho = a data P85 da
previsão (marco 04) já ultrapassou a data comprometida". Com critério objetivo, um status verde com
a previsão estourada é uma **inconsistência detectável**, não uma questão de interpretação — e isso
é exatamente o tipo de otimismo institucional que relatórios de status mal desenhados escondem até
ser tarde demais.

## Escalonamento sem drama

Escalonar um problema não é admitir fracasso — é uma ferramenta normal de programa, usada **cedo**
e com **proposta de solução junto**, não como grito de socorro de última hora. A cultura que trata
escalonamento como vergonha produz o pior resultado possível: problemas que só sobem quando já é
tarde demais para qualquer correção de rota.

## Cortar escopo e critérios de *go/no-go*

Assim como no marco 04, cortar escopo é a alavanca mais confiável para proteger uma data. Um
critério de **go/no-go** de lançamento — definido com antecedência, não inventado sob pressão no dia
— torna a decisão de lançar ou adiar uma checagem objetiva contra critérios já acordados, não uma
negociação de última hora.

## Acordos entre equipes

Interfaces entre times — contratos de API, formatos de evento, SLAs internos — precisam estar
**explícitos e versionados**, do mesmo jeito que `system-design/05` trata contratos entre sistemas.
A causa mais comum de atraso num programa entre equipes não é falta de capacidade técnica — é
dependência não combinada explicitamente, descoberta tarde.

## Lançamentos regulados e janelas

Em fintech, alguns lançamentos têm **janelas regulatórias** (horários ou períodos permitidos para
mudança em sistemas críticos — **conferir** a política vigente da instituição) que um cronograma de
programa precisa respeitar desde o início, não descobrir no fim. Ignorar isso no planejamento inicial
é uma das causas mais comuns de atraso evitável em fintech regulada.

## Retrospectiva de programa

Ao final (ou em marcos intermediários, para programas longos), uma retrospectiva específica de
programa — não só de time — pergunta: o caminho crítico previsto bateu com o real? Quais riscos se
materializaram e quais não? Essa disciplina melhora a qualidade das previsões do **próximo**
programa, não só documenta o passado.

## Desenho de times: Conway reverso e topologias

Se a Lei de Conway (marco 02) diz que a arquitetura espelha a comunicação, o **Conway reverso**
propõe o oposto deliberadamente: desenhar a estrutura de equipes **para produzir** a arquitetura
desejada. **Team Topologies** descreve quatro tipos de equipe — **alinhada ao fluxo** (entrega de
ponta a ponta de um domínio), **plataforma** (serve outras equipes com capacidades reutilizáveis),
**habilitadora** (ajuda outras equipes a adotar práticas novas, temporariamente) e **subsistema
complicado** (isola uma complexidade genuína que exige especialização profunda). Cada tipo tem um
modo de interação diferente com as demais, e confundir os tipos é uma causa comum de equipes mal
desenhadas.

## Carga cognitiva, fronteiras de propriedade e reorganização

O tamanho certo de uma equipe é limitado pela **carga cognitiva** que ela consegue sustentar — o
quanto de domínio, complexidade técnica e operacional uma equipe consegue manter na cabeça sem
degradar decisão e qualidade. Uma **fronteira de propriedade** clara (que sistema, que decisão, que
interface pertence a qual equipe) é o que torna a divisão sustentável. **Reorganização** tem custos
escondidos reais (perda de contexto, relacionamentos desfeitos, meses de produtividade reduzida) —
decidir dividir um time exige pesar esse custo contra o ganho esperado, não assumir que reorganizar
é sempre de graça.

*Evidência.* [P] caminho crítico, registro de riscos e as topologias de equipe de Team Topologies
vêm de prática consolidada de gestão de programas e de desenho organizacional, não de estudo
controlado. [P] manter o líder programando,
mas fora do caminho crítico, vem de relatos de praticantes, entre eles *The Manager's Path*, de
Camille Fournier. [O] o formato exato de relatório de status, os critérios de escalonamento, o
tamanho ideal de uma equipe e a proporção de código que cabe ao líder (que diminui conforme o time
cresce) dependem fortemente da cultura e do domínio da organização.

## Exemplo numa fintech

A funcionalidade de iniciação de pagamento depende de três equipes: a do gateway Pix, a do time de
risco (validação de limite) e a de segurança (certificado mTLS). O caminho crítico, quando mapeado,
passa pela adequação de certificado da equipe de segurança — uma dependência que ninguém tinha
colocado no cronograma inicial, porque "certificado" parecia um detalhe, não um item de caminho
crítico. No mesmo grafo, a integração com o ledger estava com `papel: lider`: o Tech Lead tinha
reservado a tarefa para si. Numa semana com dois incidentes e a revisão trimestral, a tarefa
andou um dia em cinco. Ela passou para o time, e o líder ficou com o protótipo do relatório de
conciliação, que tinha três semanas de folga.

## Hands-on

**Tutorial.** Rode `modelos/caminhocritico` do `fin-leadkit` sobre o grafo do programa fictício de
conciliação, e preencha o `registro-de-riscos.md`. Marque cada tarefa do grafo com o atributo
`papel` (valores fechados: `lider`, `time`, `externo` — **nunca** o nome de uma pessoa).

**Desafio.** Escreva um relatório de status verdadeiro para um programa fictício em atraso —
incluindo a cor correta segundo o critério objetivo, mesmo que seja desconfortável.

**Invariantes testáveis**

1. O cálculo de caminho crítico devolve o **caminho e as folgas** esperados sobre o grafo-gabarito
   do programa de conciliação.
2. Um **ciclo** introduzido no grafo de dependências é recusado, com a lista de nós que formam o
   ciclo — nunca um resultado silenciosamente incorreto.
3. `lint riscos` reprova qualquer risco **sem dono, sem gatilho ou sem mitigação** — cada campo
   ausente listado separadamente.
4. `lint raci` reprova uma linha de decisão com **zero ou mais de um "A"** — a regra de um único
   aprovador é verificada estruturalmente, não por convenção.
5. O relatório de status exige **critério objetivo** para a cor declarada; um status "verde" cuja
   previsão P85 (marco 04) já ultrapassou a data comprometida é **sinalizado como inconsistente**.
6. Adiar uma tarefa **fora** do caminho crítico (dentro da sua folga) não muda a data final do
   programa — propriedade verificada sobre o grafo-gabarito.
7. A proposta de divisão de um time exige **fronteira de propriedade, interface entre os times
   resultantes e carga cognitiva estimada** para cada um; comparando duas propostas sobre o mesmo
   grafo de dependências, a que ignora o fluxo real produz **mais dependências cruzadas** entre os
   times resultantes.
8. `modelos/caminhocritico` **sinaliza** toda tarefa com `papel: lider` que esteja no caminho
   crítico; o atributo `papel` só aceita os três valores fechados, e um nome de pessoa no campo é
   rejeitado.
9. Mover essa tarefa para `papel: time`, com a mesma duração, **não** altera a data; com o
   **fator de interrupção do líder** declarado (ex.: duração × 1,5 quando `papel: lider`), o
   modelo mostra o atraso que a tarefa causa no caminho crítico, e nenhum atraso quando ela está
   dentro da folga — propriedade verificada por uma tabela de casos.

**Desafio adicional.** Proponha a divisão do Time Pix fictício em dois times, com fronteira de
propriedade e interface explícitas.

**Complemento.** Desenhe o grafo de dependências de uma iniciativa real sua, sem incluir dado
específico da sua instituição no repositório.

**Checagem**

1. Por que um RACI com dois "A"s na mesma linha é, na prática, pior do que não ter RACI nenhum?
2. Por que um relatório de status sem critério objetivo para a cor é um risco, mesmo quando
   escrito de boa-fé?
3. O que o Conway reverso propõe fazer de diferente em relação à observação original da Lei de
   Conway?
4. Por que reorganizar um time nunca é, segundo este marco, uma mudança sem custo?

> **Pontes — `arquitetura-de-solucoes/07`; `arquitetura-de-solucoes/09`; `system-design/05`.**
> O portfólio e sequenciamento de `arquitetura-de-solucoes/07` é onde a priorização entre programas
> acontece antes deste marco começar a executá-los. A revisão arquitetural de
> `arquitetura-de-solucoes/09` é insumo direto do registro de riscos de programas que tocam decisão
> estrutural. E os contratos de API entre sistemas de `system-design/05` são o mesmo tipo de acordo
> explícito que este marco exige entre equipes, aplicado à interface organizacional, não só técnica.

## Principais aprendizados

- O líder técnico num programa cuida de escopo, interfaces e riscos técnicos — papel distinto do
  gerente de projeto.
- Caminho crítico e folga dizem onde a atenção de risco deveria se concentrar; nem toda tarefa
  atrasada importa igualmente.
- Um risco sem dono, gatilho e mitigação é, na prática, uma lista de surpresas futuras.
- Status "verde" só significa algo quando tem critério objetivo definido antes, não depois.
- O líder continua programando, mas fora do caminho crítico: o tempo dele é o mais interrompível
  do time.
- Conway reverso desenha a estrutura de equipes deliberadamente para produzir a arquitetura
  desejada; reorganizar sempre tem custo real.
