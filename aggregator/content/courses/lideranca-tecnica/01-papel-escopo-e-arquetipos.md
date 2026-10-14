---
id: papel-escopo-e-arquetipos
title: "Papel, escopo e arquétipos"
summary: "\"Staff\" não é um tamanho de código, é um tamanho de problema — e o papel só funciona quando está escrito o que você faz, o que não faz e quem decide."
estimatedMinutes: 60
competencies: [estrategia, execucao]
references:
  - title: "StaffEng — Staff archetypes (Will Larson)"
    url: https://staffeng.com/guides/staff-archetypes/
---

## Tech Lead, arquiteto, Staff, Principal: o que muda

Os títulos variam por empresa, mas o que distingue os papéis não é o título — é **escopo,
ambiguidade e horizonte**. Um Tech Lead decide dentro de um time, com problemas razoavelmente bem
definidos e horizonte de semanas. Um Staff decide entre times ou entre um time e a organização, com
problemas que chegam **sem forma definida** ("o checkout está lento" não é um problema, é um
sintoma) e horizonte de trimestres. Um arquiteto, dependendo da empresa, é um Staff focado em
decisão estrutural; um Principal normalmente opera no escopo de uma organização inteira, com
horizonte de ano. "Staff" não é um tamanho de código — é um **tamanho de problema**: a pessoa que
recebe a ambiguidade e devolve um escopo, não a pessoa que recebe um escopo e devolve código.

## Os arquétipos de Staff

Nem todo Staff faz o mesmo trabalho. Quatro arquétipos aparecem com frequência: o **líder técnico**
(dono de um domínio ou iniciativa grande, muito próximo da execução), o **arquiteto** (dono da
coerência estrutural entre sistemas, menos próximo do dia a dia de um time só), o **resolvedor**
(entra em problemas críticos e ambíguos, sem domínio fixo — o "bombeiro" bom, não o apagador de
incêndio crônico) e o **braço direito** (opera como extensão de confiança de um diretor ou VP de
engenharia, cobrindo o que a agenda da liderança não alcança). Os quatro são legítimos; o erro comum
é tentar ser os quatro ao mesmo tempo. Qual arquétipo serve depende do que a organização **precisa
agora** — não do que parece mais prestigioso.

## Escopo por sistema, equipe e tempo

Escopo tem três eixos independentes. **Sistema**: quais partes da arquitetura você é dono de decidir
(o gateway de pagamento, o ledger, a plataforma de dados). **Equipe**: sobre quais pessoas e times
sua palavra pesa mais (o seu time, um grupo de times, a engenharia inteira). **Tempo**: em que
horizonte você decide (o próximo sprint, o próximo ano). Um escopo bem escrito declara os três — e a
falta mais comum não é escopo pequeno demais, é escopo **implícito**: todo mundo assume que você
cobre uma área, mas ninguém escreveu isso, e a primeira vez que fica claro é quando algo falha e a
pergunta "de quem era isso?" não tem resposta.

## Trabalho de cola e seu custo de carreira

*Glue work* — coordenar, documentar o que ninguém documentou, resolver o atrito entre dois times,
preparar a reunião que ninguém quer preparar — é trabalho real e necessário, e seniores (em
particular mulheres seniores, segundo relatos consistentes de praticantes) acabam absorvendo
desproporcionalmente dele. O problema não é fazer *glue work* — é fazer **só** isso, porque ele é
invisível em processos de promoção que recompensam entrega visível. A prática saudável é fazer
*glue work* deliberadamente, por um tempo limitado, declarado, e alternar — não deixá-lo virar o
emprego inteiro por omissão.

## Modos de operação

No dia a dia, um Staff alterna entre cinco modos: **construir** (escrever o código ou o documento
que só você consegue fazer agora), **revisar** (multiplicar qualidade através do trabalho de
outros), **desbloquear** (remover o obstáculo que está parando um time), **ensinar** (transferir
conhecimento que não escala se ficar só com você) e **decidir** (usar autoridade de decisão quando
ninguém mais pode). Declarar em que modo você está numa semana — não implicitamente, mas em voz alta
— ajuda o time a calibrar o que esperar de você, e ajuda você a perceber quando está preso num modo
só (geralmente "construir", porque é o mais confortável) quando a organização precisa de outro.

## Alocação de tempo: agenda de criador × agenda de gestor

Uma agenda de **criador** precisa de blocos longos sem interrupção (meio dia, no mínimo) para
produzir algo que exige atenção sustentada: código, documento de estratégia, desenho de sistema. Uma
agenda de **gestor** é fragmentada em reuniões de 30–60 minutos por design. O problema é que a
maioria dos Staffs vive nas duas ao mesmo tempo, e reuniões espalhadas ao longo do dia destroem os
blocos de criador sem que ninguém perceba o custo — porque o custo não aparece como "zero horas
produtivas", aparece como "nunca sobra um bloco de meio dia inteiro". Proteger blocos de criador
explicitamente na agenda (não "se sobrar tempo") é uma decisão de escopo, não um luxo.

## A escada de carreira da sua organização

Toda empresa de porte razoável tem uma escada de carreira escrita — e a maioria das pessoas nunca a
leu com atenção. Ler a escada revela o que a organização **espera implicitamente** no seu nível
atual e no próximo: não só "o que fazer mais", mas "o que já deveria estar automático e deixou de
contar como mérito". Uma escada bem lida também revela as palavras que o comitê de promoção usa
(influência, ambiguidade, escopo) — que são exatamente o vocabulário que a narrativa de impacto do
marco 13 precisa usar de volta.

## Expectativas por nível em fintech

Em fintech regulada, o nível de um Staff carrega expectativas que não aparecem em escadas genéricas
de carreira de tecnologia: tolerância a risco mais baixa (uma decisão errada pode custar dinheiro de
terceiros, não só tempo de engenharia), exposição a auditoria e regulação (a decisão pode ter que ser
explicada a alguém de fora da engenharia, meses depois), e expectativa de disponibilidade em operação
24x7 mesmo sem estar de plantão formalmente (o Pix não para às 18h). Isso não significa trabalhar
mais horas — significa que o **padrão de evidência** para uma decisão de Staff em fintech é mais alto
do que em um produto sem essas restrições.

## O que o papel não é

Staff não é "gerente sem o título" — gestão de pessoas é uma disciplina própria (que esta trilha
também cobre, a partir do marco 07, para quem a exerce formalmente ou não), não um prêmio de
consolação por não ter virado gestor. Staff também não é "a pessoa que apaga o incêndio crônico": se
o seu trabalho é inteiro reativo, o problema não é você, é a ausência de um dono sistemático da área
que pega fogo — e parte do seu trabalho de Staff é tornar esse dono explícito, não absorver o
incêndio indefinidamente.

## Contratos de papel

Um **contrato de papel** é um acordo curto, explícito, com quem avalia você (gerente, em geral):
o que é seu para decidir sozinho, o que exige consulta, o que não é seu de forma alguma. Sem isso
por escrito, o escopo vira o que a última pessoa que pediu alguma coisa decidiu que era seu — e o
primeiro sinal de que o contrato está errado é sempre "por que ninguém me falou que eu tinha que
decidir isso", depois do fato, nunca antes.

*Evidência.* [P] os quatro arquétipos de Staff e o fenômeno de *glue work* vêm de relatos
consolidados de praticantes (StaffEng e equivalentes), não de um estudo controlado. [O] a divisão
ideal de tempo entre os cinco modos de operação depende da organização e do momento — não existe
proporção universal correta.

## Exemplo numa fintech

Você é Tech Lead do Time Pix, e a organização pede "alguém" para assumir a iniciativa de
conciliação entre o Pix e o ledger interno — um problema que toca três sistemas e duas equipes. Você
aceita sem perguntar o escopo exato, porque recusar parece ruim. Três meses depois, toda decisão
sobre conciliação passa por você — inclusive as que deveriam ser do time de dados — porque ninguém
mais sabe que você **não** é dono disso. Você virou o gargalo de uma área que nunca foi formalmente
sua.

## Hands-on

**Tutorial.** Preencha o `escopo.md` (modelo do `fin-leadkit`) para o seu papel no Time Pix
fictício: sistemas, partes interessadas, decisões que são suas, decisões que não são, e o que você
explicitamente não faz.

**Desafio.** Escreva o "contrato de papel" de um Staff recém-chegado a uma área nova do
`fin-platform` — a área de conciliação do exemplo acima.

**Invariantes testáveis**

1. `leadkit lint escopo` **reprova** um escopo sem os campos **sistemas (≥3)**, **partes
   interessadas (≥3)**, **decisões que são minhas**, **decisões que não são** e **"o que eu não
   faço"** — cada campo ausente é um motivo de reprovação listado separadamente.
2. Um escopo cujo conteúdo é só uma lista de tarefas ("revisar PRs", "responder no canal") é
   **reprovado** com a mensagem "isso é uma lista de tarefas, não um escopo" — o *lint* distingue
   tarefa de decisão pela presença de um verbo de decisão (aprovar, definir, priorizar) versus um
   verbo de execução.
3. A matriz de arquétipos (qual arquétipo serve a qual cenário) tem **uma resposta justificada** por
   cenário do banco de casos do `fin-leadkit`, verificada contra o gabarito por rubrica, não por
   correspondência exata de texto.
4. O *lint* aceita o escopo-gabarito do Time Pix sem reprovação e reprova o escopo espelho (mesmo
   conteúdo, campo "o que eu não faço" vazio) — prova de que o *lint* de fato depende do campo, não
   passa por padrão.
5. Rodar `leadkit lint escopo` duas vezes sobre o mesmo arquivo produz o mesmo resultado
   (determinismo) — nenhuma parte do *lint* depende de hora do sistema ou de ordem de execução.

**Complemento.** Em uma página, descreva o escopo do papel que você quer ocupar daqui a 18 meses —
sistemas, equipes, horizonte. Mantenha no seu dossiê privado, fora do repositório.

**Checagem**

1. Por que "Staff" é descrito neste marco como um tamanho de problema, não um tamanho de código?
2. Qual é o risco de um escopo que existe só implicitamente, sem estar escrito?
3. Por que fazer só *glue work*, de forma permanente e não declarada, é um risco de carreira — mesmo
   sendo trabalho necessário?
4. Por que uma agenda cheia de reuniões curtas destrói especificamente o trabalho que exige blocos
   longos de atenção, mesmo que o número total de horas livres no dia pareça igual?

> **Pontes — `arquitetura-de-solucoes/08`; `system-design/15`; `engenharia-de-plataforma/09`.**
> A trajetória de IC sênior/Staff de `arquitetura-de-solucoes/08` é o ponto de partida deste marco:
> aqui o foco é o **escopo declarado**, não as ferramentas de influência (RFC, *pre-mortem*) que
> aquele marco cobre. A avaliação por níveis de `system-design/15` é o que a escada de carreira
> deste marco usa como vocabulário. E a migração de equipes de `engenharia-de-plataforma/09` é um
> exemplo concreto de decisão que só funciona quando o escopo de quem a lidera está explícito.

## Principais aprendizados

- Papel é definido por escopo, ambiguidade e horizonte — não por título.
- Os quatro arquétipos de Staff servem a necessidades diferentes; tentar ser os quatro ao mesmo
  tempo não funciona.
- Escopo tem três eixos (sistema, equipe, tempo) e precisa estar escrito, não implícito.
- *Glue work* é necessário, mas vira risco de carreira quando é o único trabalho e não é declarado.
- Um contrato de papel explícito evita que o escopo vire "o que a última pessoa pediu".
