---
id: escrita-rituais-e-reunioes
title: "Escrita, rituais e reuniões"
summary: "Comunicação escrita, rituais de time e reuniões como ferramentas de liderança — o que documentar, como conduzir e quando uma reunião é a ferramenta errada."
estimatedMinutes: 50
competencies: [execucao]
references:
  - title: "Will Larson — Irrational Exuberance"
    url: https://lethain.com/
---

## Escrita como alavanca

Escrita escala de um jeito que conversa não escala: um documento de decisão lido por vinte pessoas
custa o mesmo tempo de escrever que um lido por duas. **Documento de decisão**, *one-pager*, RFC
(`arquitetura-de-solucoes/08`), relatório para executivos e *post-mortem* são formatos diferentes
para públicos e propósitos diferentes — e a escolha errada de formato é uma causa comum de
comunicação que tecnicamente aconteceu, mas não teve efeito nenhum.

## Escrita narrativa × *slides*

*Slides* favorecem tópicos soltos e permitem que lacunas de raciocínio passem despercebidas; um
documento **narrativo** (texto corrido, com começo, meio e fim) obriga quem escreve a articular a
lógica completa — e expõe, na escrita, falhas de raciocínio que um *slide* com bullets esconderia.
Isso não significa que *slides* nunca servem (apresentações ao vivo têm seu lugar), mas decisões
complexas se beneficiam de passar primeiro pelo teste da escrita narrativa.

## Clareza: uma ideia por parágrafo

Um parágrafo que tenta carregar duas ideias deixa as duas mais fracas. Números sem contexto
("reduzimos o tempo em 40%") comunicam menos do que números **com contexto** ("reduzimos de 2s para
1,2s, abaixo do SLO de 1,5s"). E todo documento de decisão se beneficia do teste "e daí?" — depois
de escrever um fato, perguntar se o leitor entende por que aquilo importa; se a resposta não é
óbvia, falta uma frase.

## Assíncrono por padrão

Preferir comunicação assíncrona (documentos, comentários, mensagens com contexto completo) sobre
reuniões síncronas como **padrão**, reservando síncrono para o que realmente precisa de
ida-e-volta em tempo real (negociação, decisão com muita incerteza, construção de relacionamento).
Assíncrono por padrão não significa "nunca ter reunião" — significa que a reunião precisa se
justificar, não o contrário.

## Rituais de engenharia

Revisão de design, guilda ou fórum técnico, demonstração de entregas, retrospectiva e *office
hours* são rituais recorrentes com propósitos distintos — e cada um tem um **modo de falha**
característico quando perde o propósito original: revisão de design vira teatro quando a decisão já
foi tomada antes da reunião; retrospectiva vira reclamação sem ação quando não produz item de
melhoria com dono; *office hours* vira tempo vazio quando ninguém sabe que pode aparecer com
qualquer dúvida.

## Desenho de reunião

Toda reunião recorrente merece ser desenhada deliberadamente: **objetivo** claro, **decisão
esperada** (se houver uma), **quem precisa estar** (e só quem precisa), **pré-leitura** (se a
reunião depende de contexto que pode ser lido antes) e **saída escrita** (o que foi decidido, por
quem, documentado). Reuniões sem esse desenho tendem a crescer organicamente até incluir gente
demais e durar mais do que o necessário, sem que ninguém decida isso deliberadamente.

## Custo de reunião

Uma reunião tem custo real e calculável: número de pessoas × duração × custo por hora — e
visualizar esse número muda a decisão sobre convocar ou não. Uma reunião de uma hora com oito
pessoas custa oito pessoas-hora; perguntar "isso vale oito horas de trabalho combinadas?" antes de
agendar é um filtro simples que a maioria das organizações nunca aplica.

## Três tipos de reunião: decisão, informação, criação

Misturar os três tipos na mesma reunião é uma causa comum de insatisfação: uma reunião de
**decisão** precisa de quem decide presente e de informação prévia; uma reunião de **informação**
(que poderia, com frequência, ser um documento) não precisa de discussão ao vivo; uma reunião de
**criação** (gerar opções novas juntos) precisa de tempo e formato diferentes dos outros dois.
Declarar o tipo no convite ajuda os participantes a se prepararem corretamente.

## Comunicar para cima

Um executivo processa uma atualização técnica de forma diferente de um par de engenharia: o que ele
precisa em três linhas é **resultado, risco e pedido** — não o caminho técnico que levou até ali.
Começar pelo resultado (não pelo processo) é a mudança mais simples e mais frequentemente ignorada
em comunicação para cima.

## Comunicar mudança e *runbooks* de comunicação

Um anúncio técnico (mudança de API, depreciação, janela de manutenção) se beneficia de um
**runbook de comunicação** — modelo pré-definido de quando avisar, por qual canal, com qual
antecedência — em vez de ser improvisado a cada vez. Isso reduz a chance de um time afetado
descobrir a mudança tarde demais para se preparar.

## O vício de "reunião para alinhar"

"Vamos marcar uma reunião para alinhar" é, com frequência, um sintoma de que ninguém escreveu a
proposta ainda — e marcar a reunião adia o trabalho real de articular a ideia por escrito. Quando a
proposta existe por escrito antes, a reunião (se ainda for necessária) é mais curta e mais
produtiva, porque todo mundo já processou o conteúdo individualmente.

*Evidência.* [P] escrita narrativa e desenho deliberado de reunião vêm de prática consolidada de
praticantes (cultura de documentos de empresas como Amazon, entre outras), não de estudo
controlado. [O] o formato certo de documento e a frequência ideal de cada ritual dependem fortemente
da cultura da organização.

## Exemplo numa fintech

Uma discussão sobre trocar o mecanismo de filas se arrasta por duas semanas num canal de chat, sem
nunca chegar a uma decisão. Reescrita como RFC de três páginas (problema, opções, trade-off,
recomendação) e discutida numa única reunião de 30 minutos com pré-leitura obrigatória, termina em
decisão registrada no mesmo dia.

## Hands-on

**Tutorial.** Rode `lint rfc` e `lint onepager` do `fin-leadkit` sobre os modelos, e use a
calculadora de custo de reunião.

**Desafio.** Converta uma discussão sintética de uma *thread* de chat em um RFC completo e na versão
executiva (*one-pager*) do mesmo conteúdo.

**Invariantes testáveis**

1. `lint rfc` reprova um RFC **sem problema, sem ao menos 2 opções, sem trade-offs, sem
   recomendação, sem riscos com dono, ou sem "não-objetivos"** — cada ausência listada
   separadamente.
2. `lint onepager` exige que o **resultado ou pedido apareça na primeira frase**, e que todo número
   citado venha com **período e fonte** — número sem contexto temporal é sinalizado.
3. A calculadora de custo de reunião reproduz o gabarito (pessoas × duração × custo-hora de
   referência declarado) para um conjunto de casos de teste.
4. `lint reuniao` reprova um convite de reunião do tipo "decisão" **sem objetivo, sem decisão
   esperada ou sem pré-leitura declarada**.
5. **Demonstração do limite:** um RFC que passa em todos os campos exigidos pelo *lint*, mas que
   esconde a alternativa que de fato foi descartada por motivos políticos, não técnicos — a
   estrutura não garante honestidade sobre a disputa real.
6. O resumo gerado automaticamente a partir de um RFC completo **preserva a recomendação original**
   — teste de conservação: a recomendação do resumo nunca diverge da recomendação do documento
   fonte.

**Complemento.** Identifique uma reunião recorrente sua e, ou elimine-a, ou transforme-a
explicitamente num dos três tipos (decisão, informação, criação) com o desenho completo.

**Checagem**

1. Por que escrita narrativa tende a expor falhas de raciocínio que *slides* com bullets escondem?
2. O que significa, na prática, tratar "assíncrono" como padrão — isso elimina reuniões
   completamente?
3. Por que calcular o custo de uma reunião (pessoas × duração × custo-hora) muda a decisão de
   convocá-la, mesmo quando ninguém faz essa conta explicitamente de outra forma?
4. Por que "vamos marcar uma reunião para alinhar" é descrito neste marco como, com frequência, um
   sintoma de que a proposta ainda não foi escrita?

> **Pontes — `system-design/15`; `arquitetura-de-solucoes/08`; `entrega-continua-e-devops/09`.**
> A revisão de design de `system-design/15` é um dos rituais de engenharia que este marco ensina a
> desenhar deliberadamente, evitando o modo de falha de virar teatro. O RFC de
> `arquitetura-de-solucoes/08` é o formato que este marco usa como base para a prática de escrita
> narrativa. E o controle de mudança regulado de `entrega-continua-e-devops/09` é um contexto real
> onde um *runbook* de comunicação bem desenhado evita que um time afetado descubra uma mudança
> tarde demais.

## Principais aprendizados

- Escrita escala de um jeito que conversa não escala; o formato certo depende do público e do
  propósito.
- Assíncrono por padrão significa que a reunião precisa se justificar, não o contrário.
- Toda reunião recorrente merece desenho deliberado: objetivo, decisão esperada, participantes,
  pré-leitura, saída escrita.
- Visualizar o custo real de uma reunião (pessoas × duração × custo-hora) muda a decisão de
  convocá-la.
- "Reunião para alinhar" é, com frequência, sintoma de proposta ainda não escrita.
