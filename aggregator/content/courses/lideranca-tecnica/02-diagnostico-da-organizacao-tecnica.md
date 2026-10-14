---
id: diagnostico-da-organizacao-tecnica
title: "Diagnóstico da organização técnica"
summary: "Antes de propor qualquer coisa, meça onde o trabalho espera — porque a causa do atraso quase nunca é onde o time acha."
estimatedMinutes: 55
competencies: [estrategia, dados]
references:
  - title: "DORA — Research and metrics"
    url: https://dora.dev/
---

## Sistema sociotécnico e a Lei de Conway

Uma organização técnica não é só pessoas e não é só código — é um **sistema sociotécnico**: a
estrutura da organização e a arquitetura do software se moldam mutuamente. A Lei de Conway observa
que sistemas tendem a espelhar a estrutura de comunicação de quem os constrói: três times que não se
falam produzem três módulos com uma integração frágil entre eles, não por acidente técnico, mas
porque a fronteira de comunicação virou fronteira de código. Diagnosticar uma organização técnica
começa por olhar para o organograma **como hipótese de arquitetura**, antes de olhar para a
arquitetura em si.

## Mapa de fluxo de valor

Um mapa de fluxo de valor traça o caminho completo de uma unidade de trabalho — da ideia ao
produção — por **todas** as etapas que ela atravessa: especificação, implementação, revisão,
teste, aprovação de mudança, implantação. A maioria dos times conhece bem a etapa onde trabalha e
mal conhece o resto; o mapa de fluxo força a visão completa, e é nela que o verdadeiro gargalo
geralmente aparece — frequentemente numa etapa que ninguém pensava em medir porque não é "trabalho
de engenharia" no sentido estrito (aprovação, por exemplo).

## Métricas de fluxo: tempo de ciclo, WIP, *throughput*, idade

Quatro métricas bastam para descrever a saúde de um fluxo: o **tempo de ciclo** (quanto tempo um
item leva do início ao fim), o **WIP** — *work in progress* (quantos itens estão em andamento ao
mesmo tempo), o ***throughput*** (quantos itens terminam por unidade de tempo) e a **idade** do
trabalho em progresso (há quanto tempo cada item em andamento está parado nessa etapa). A **Lei de
Little** (L = λ·W) relaciona as três primeiras e serve como verificação de sanidade: se o tempo de
ciclo medido diretamente não bate, aproximadamente, com o que a lei prevê a partir do WIP e do
*throughput*, alguma das medições está errada — o que costuma significar que os dados de entrada e
saída (quando um item "começou" e "terminou") estão definidos de forma inconsistente.

## DORA e SPACE

As quatro métricas DORA — frequência de implantação, *lead time* para mudança, taxa de falha de
mudança e tempo de recuperação — descrevem a saúde de entrega de um time com base em dados
objetivos de *deploy* e incidente, não em opinião (**conferir** a edição mais recente do relatório
DORA e as definições exatas vigentes, que mudam entre edições). O *framework* SPACE argumenta que
nenhuma métrica isolada — nem mesmo DORA — captura produtividade sozinha: satisfação, atividade,
colaboração, eficiência e desempenho precisam ser vistos juntos, porque otimizar uma dimensão
isolada (por exemplo, número de *commits*) tipicamente piora as outras.

## Efeito Goodhart e métricas por pessoa

"Quando uma medida vira meta, ela deixa de ser uma boa medida" — o efeito Goodhart explica por que
métricas de produtividade **por pessoa** (linhas de código, número de *commits*, tickets fechados)
são perigosas: no momento em que alguém sabe que está sendo medido por *commits*, o número de
*commits* sobe sem que a produtividade real mude — as pessoas simplesmente fatiam o trabalho de
forma diferente. Esta trilha, e o `fin-leadkit` em particular, **nunca** calcula métrica por pessoa
nomeada — todo modelo de fluxo opera sobre o time ou a área do código, nunca sobre um indivíduo.

## Diagnóstico qualitativo: ronda de escuta

Números mostram **onde** o trabalho espera; não mostram sempre **por quê**. A ronda de escuta é um
protocolo simples: uma série curta de entrevistas individuais, com perguntas abertas ("o que te
atrasa com mais frequência?", "que decisão você espera há mais tempo?"), seguida de **triangulação**
— cruzar o que as pessoas disseram com o que os números mostram. Quando a percepção e o dado
discordam, isso é informação valiosa por si só: ou o dado está medindo a coisa errada, ou o problema
percebido não é, de fato, o gargalo real.

## Mapa de partes interessadas e mapa de poder

Complementar ao mapa de fluxo, um mapa de partes interessadas (que `arquitetura-de-solucoes/08`
introduz) identifica quem decide, quem é afetado e quem bloqueia. Um mapa de poder vai além:
identifica quem tem influência informal que não aparece no organograma — a pessoa que, sem cargo de
decisão formal, consegue travar ou destravar uma iniciativa porque todo mundo confia na opinião
dela. Ignorar o mapa de poder é uma causa comum de diagnóstico tecnicamente correto que não vira
mudança real.

## Onde está o gargalo

Um gargalo pode estar em seis lugares diferentes: **código** (complexidade que torna mudanças
lentas), **revisão** (fila de *pull requests* esperando atenção), **ambiente** (infraestrutura de
teste ou *deploy* não confiável), **decisão** (trabalho esperando alguém decidir algo), **dependência**
(trabalho esperando outro time) ou **regulação** (trabalho esperando aprovação de compliance ou
auditoria). O diagnóstico de fluxo aponta QUAL dessas seis categorias concentra mais tempo de
espera — e só depois disso faz sentido perguntar "o que fazer a respeito".

## Armadilhas do diagnóstico

Duas armadilhas recorrentes: otimizar o **não-gargalo** (melhorar a velocidade de uma etapa que já
não é o limite do sistema não acelera nada — só desloca a fila para antes dela) e medir o que é
**fácil de medir** em vez do que importa (número de *commits* é fácil de contar e quase irrelevante;
tempo de espera em aprovação é mais difícil de instrumentar e geralmente é onde está o problema).

## Os primeiros 30/60/90 dias de um Staff numa área nova

Ao assumir uma área nova, os primeiros 30 dias são de **escuta e mapeamento** (ronda de escuta, mapa
de fluxo, mapa de poder) sem propor mudança ainda; os 60 dias seguintes são de **diagnóstico escrito**
e validação com o time; só nos 90 dias a proposta de mudança entra — propor antes disso
tipicamente erra o alvo, porque a percepção inicial de um recém-chegado é sistematicamente
incompleta.

*Evidência.* [E] as métricas DORA e o *framework* SPACE vêm de pesquisa publicada sobre
produtividade de engenharia. [P] a ronda de escuta e o roteiro de primeiros 90 dias são prática
consolidada de praticantes, não resultado de estudo controlado. [O] a interpretação do que um
gargalo específico significa, na prática, depende do contexto da organização.

## Exemplo numa fintech

Todo mundo no Time Pix acredita que o gargalo é "falta de gente" — a justificativa recorrente para
pedir mais contratações. O mapa de fluxo de valor mostra outra coisa: o trabalho passa 70% do tempo
de ciclo esperando revisão e aprovação de mudança, não em implementação. Contratar mais pessoas para
escrever código mais rápido não resolve um gargalo que está na aprovação — na verdade, pioraria,
porque geraria mais código competindo pela mesma fila de revisão escassa.

## Hands-on

**Tutorial.** Rode `modelos/fluxo` e `modelos/dora` do `fin-leadkit` sobre os 12 meses de tarefas e
*deploys* sintéticos do Time Pix.

**Desafio.** A partir do fluxo calculado e de um roteiro de entrevistas sintéticas, identifique o
gargalo real do Time Pix e escreva o diagnóstico em uma página.

**Invariantes testáveis**

1. O tempo de ciclo médio, o *throughput* e o WIP médio calculados sobre o histórico do Time Pix
   **reproduzem os valores do gabarito**, dentro da tolerância declarada, com a mesma entrada.
2. A Lei de Little (**L = λ·W**) vale sobre os dados calculados dentro da tolerância declarada —
   verificação de sanidade do próprio modelo de fluxo, não um cálculo independente.
3. As quatro métricas DORA calculadas a partir dos *deploys* e incidentes sintéticos batem com o
   gabarito, e o código **recusa** calcular qualquer métrica agrupada por autor individual — teste
   de ausência do campo "pessoa" em qualquer saída do modelo.
4. A lista de "trabalho envelhecido" (itens com idade acima do percentil 85 do histórico) é
   exatamente a esperada no conjunto sintético.
5. O documento de diagnóstico (artefato) é reprovado pelo `lint diagnostico` quando alguma afirmação
   não tem **evidência numérica ou citação** associada — cada afirmação sem suporte é listada.

**Complemento.** Desenhe o mapa de fluxo de valor de um item de trabalho real do seu contexto, sem
incluir nenhum dado específico da sua instituição no repositório público.

**Checagem**

1. Por que a Lei de Conway sugere olhar o organograma como hipótese de arquitetura, não só a
   arquitetura em si?
2. Por que otimizar uma etapa que não é o gargalo pode não acelerar nada, e às vezes piorar a fila
   em outro ponto?
3. Por que este marco afirma que métricas de produtividade por pessoa tendem a piorar, não
   melhorar, quando viram meta explícita?
4. Por que o diagnóstico deste marco combina números (fluxo, DORA) com entrevistas (ronda de
   escuta), em vez de confiar só em um dos dois?

> **Pontes — `entrega-continua-e-devops/01`; `engenharia-de-plataforma/09`; `observabilidade/12`.**
> Os fundamentos de entrega contínua de `entrega-continua-e-devops/01` sustentam o vocabulário de
> *deploy* e *lead time* que as métricas DORA deste marco usam. A migração de equipes de
> `engenharia-de-plataforma/09` é um caso real de decisão que deveria começar por um diagnóstico
> como o deste marco, não por intuição. E os SLOs de `observabilidade/12` são outra fonte de dado
> objetivo — ao lado do fluxo e do DORA — que um diagnóstico completo cruza antes de propor mudança.

## Principais aprendizados

- A estrutura da organização é hipótese de arquitetura (Lei de Conway), não um detalhe
  administrativo separado do sistema técnico.
- Tempo de ciclo, WIP, *throughput* e idade do trabalho descrevem o fluxo; a Lei de Little verifica
  a consistência das medições.
- DORA e SPACE dão a visão quantitativa; a ronda de escuta dá a visão qualitativa — o diagnóstico
  completo cruza as duas.
- Métricas por pessoa, uma vez viradas meta, se corrompem (Goodhart) — o `fin-leadkit` nunca as
  calcula.
- Otimizar o não-gargalo não acelera o sistema; só desloca a fila.
