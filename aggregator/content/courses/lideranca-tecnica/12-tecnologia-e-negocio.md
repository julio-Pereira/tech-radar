---
id: tecnologia-e-negocio
title: "Tecnologia e negócio"
summary: "Falar a língua do negócio: custo de atraso e WSJF para priorizar, ROI em faixas em vez de números inventados, e como negociar roadmap e dívida técnica com produto."
estimatedMinutes: 55
competencies: [negocio]
references:
  - title: "Black Swan Farming — Cost of Delay and WSJF"
    url: https://blackswanfarming.com/cost-of-delay/
  - title: "Martin Fowler — Technical Debt"
    url: https://martinfowler.com/bliki/TechnicalDebt.html
---

## Como uma fintech ganha dinheiro

Entender, em nível de leitor de engenharia, de onde vem a receita — tarifa por transação, *spread*
entre taxas, custo de capital, assinatura — muda a conversa com o negócio de "a arquitetura é
elegante" para "esta decisão afeta a margem desta forma". Não é preciso ser analista financeiro;
é preciso saber **a qual dessas alavancas** uma iniciativa técnica se conecta, porque o negócio já
pensa em alavancas, não em sistemas.

## Custo por transação e margem

Se a fintech ganha uma fração de cada transação processada, o **custo por transação** (infraestrutura,
licenças, suporte, dividido pelo volume) é a métrica que liga arquitetura a margem diretamente —
reduzir esse custo em escala tem efeito multiplicado pelo volume, o que `engenharia-de-plataforma/08`
já trata do lado da plataforma e `observabilidade/16` do lado do custo observado em produção. Uma
decisão que parece puramente técnica (trocar um banco gerenciado por um auto-hospedado) é, também,
uma decisão de margem.

## Custo de atraso

O **custo de atraso** traduz "quando entregamos" em dinheiro ou risco perdido por unidade de tempo —
uma iniciativa de conformidade com multa regulatória tem custo de atraso diferente de uma
funcionalidade que só aumenta conversão marginalmente. Calcular (mesmo que aproximado, em faixa) o
custo de atraso de cada iniciativa candidata é a tradução mais direta entre a linguagem técnica e
a linguagem de priorização do negócio — "isso é importante" não compete bem com "isso custa R$X por
semana de atraso".

## WSJF como ordem de trabalho

O **WSJF** (*Weighted Shortest Job First*) ordena o backlog dividindo o custo de atraso (mais o
valor do negócio, o risco e a oportunidade habilitada) pelo **tamanho do trabalho** — a lógica é que
duas iniciativas com o mesmo custo de atraso não têm a mesma prioridade se uma leva uma semana e a
outra leva seis meses: fazer a mais rápida primeiro libera o valor mais cedo. WSJF não substitui
julgamento, mas dá uma ordem defensável e reproduzível a partir de números declarados, em vez de
"a que o diretor pediu por último".

## ROI de iniciativas técnicas, honesto sobre a incerteza

Pedir ROI de uma iniciativa de confiabilidade, plataforma ou pagamento de dívida técnica tentando um
número de ponto único ("isso vai economizar R$340.000") é, quase sempre, inventar precisão que não
existe. A alternativa honesta é uma **faixa** com premissas explícitas ("entre R$150.000 e
R$400.000/ano, assumindo que o volume de incidentes relacionados se mantém no padrão dos últimos 12
meses") — a faixa comunica incerteza real sem abandonar o exercício de estimar.

## OKRs e seus abusos

OKRs (*Objectives and Key Results*) funcionam quando o resultado-chave é algo que o time pode
efetivamente influenciar e medir — e falham de forma previsível quando viram uma lista de tarefas
disfarçada de objetivo, ou quando o resultado-chave de uma pessoa é usado para avaliar a pessoa
individualmente (o mesmo problema de Goodhart do marco 02, aplicado a metas de negócio). Um OKR que
ninguém consegue explicar por que importa para o negócio não está cumprindo a função de OKR.

## Negociar o roadmap: dívida técnica como investimento, não como "tempo livre"

Pedir "20% do tempo para dívida técnica" perde a negociação antes de começar, porque trata dívida
como um imposto genérico em vez de um investimento específico com retorno. Apresentar um item de
dívida com **custo de atraso de não pagá-la** (`arquitetura-de-software/06` já trata dívida como
decisão financeira) — "esta dívida específica está custando duas semanas extras por trimestre em
cada nova funcionalidade da área X" — compete pela mesma prioridade que qualquer outra iniciativa,
em vez de pedir um desconto fixo sobre a capacidade do time.

## *Build × buy* em linguagem de negócio

A decisão de construir ou comprar (`arquitetura-de-solucoes/04`) muda de "qual é tecnicamente mais
interessante" para "qual o custo total de propriedade, o tempo até o valor, o risco de ficar
preso a um fornecedor, e o custo de saída" quando apresentada ao negócio — a mesma decisão, duas
linguagens, e só a segunda compete de igual para igual com outras prioridades de investimento.

## Fornecedores e contratos

SLA, custo de saída e penalidade por indisponibilidade são cláusulas que o time técnico deveria
revisar antes da assinatura, não descobrir durante um incidente — um fornecedor crítico sem plano de
saída contratual (já visto em `11`) é um risco de negócio, não só técnico, e vale a mesma disciplina
de risco aceito com dono e prazo de revisão quando a dependência não pode ser eliminada de imediato.

## Falar com executivos

Um executivo, numa conversa de minutos, precisa do resultado ou do pedido primeiro, depois o
porquê, depois a evidência — a estrutura inversa da narrativa técnica (contexto, análise, conclusão)
atrapalha mais do que ajuda nesse formato. `08` já introduziu o *one-pager* com essa estrutura; aqui
o conteúdo é especificamente a tradução de uma decisão técnica para risco, custo e prazo de negócio.

## Goodhart em métricas de negócio e ética de incentivos

Uma métrica de negócio que vira meta isolada ("reduzir o tempo médio de aprovação de crédito")
pode melhorar o número e piorar o resultado real (aprovação mais rápida e mais arriscada, por
exemplo) exatamente como o efeito Goodhart do marco 02 previa — e a responsabilidade do líder
técnico inclui perguntar, antes de otimizar uma métrica de negócio, o que ela deixa de capturar e
quem é afetado quando o número "melhora" da forma errada.

*Evidência.* [P] custo de atraso e WSJF vêm de prática consolidada (SAFe e a literatura de Donald
Reinertsen sobre fluxo de valor econômico). [O] modelos de ROI de produtividade de engenharia são
reconhecidamente frágeis — esta trilha ensina a **expressar a incerteza em faixas**, não a escondê-la
atrás de um número único.

## Exemplo numa fintech

O banco avalia três iniciativas candidatas para o próximo trimestre: uma funcionalidade nova, uma
melhoria de conversão e uma correção de conformidade com prazo regulatório. Calculando o custo de
atraso de cada uma — a de conformidade tem custo de atraso muito mais alto por envolver risco de
multa e de suspensão de operação — o WSJF reordena o backlog e coloca a menor das três iniciativas
em tamanho, mas a de maior custo de atraso, em primeiro lugar.

## Hands-on

**Tutorial.** Rode `modelos/wsjf` do `fin-leadkit` sobre o backlog sintético do Time Pix e escreva o
caso de negócio de uma página de uma das iniciativas.

**Desafio.** Ordene o backlog completo do Time Pix por custo de atraso e WSJF, e defenda por escrito
o corte de uma iniciativa de baixa prioridade resultante.

**Invariantes testáveis**

1. A ordenação WSJF do conjunto-gabarito do Time Pix é a esperada, reproduzida a partir dos
   componentes declarados (custo de atraso, tamanho do trabalho).
2. **Aumentar o custo de atraso** de um item, mantendo os demais fixos, nunca o rebaixa na ordem
   resultante (propriedade verificável comparando duas rodadas sobre o mesmo backlog).
3. O `lint` do caso de negócio **reprova** um documento sem **premissas explícitas**, sem **faixa
   (mínimo–máximo)**, sem **custo da alternativa de não fazer** e sem **métrica de acompanhamento**.
4. O cálculo de **custo por transação** do `fin-platform` fictício, a partir dos dados sintéticos de
   volume e custo de infraestrutura, reproduz o valor do gabarito.
5. O `lint` **reprova** um ROI apresentado como número de ponto único, sem faixa — mesmo que o
   número esteja correto, a ausência de faixa é, por si, motivo de reprovação.
6. **Demonstração do limite:** uma métrica de negócio "otimizada" no histórico sintético que, ao
   mesmo tempo, piora um resultado de negócio relacionado (efeito Goodhart simulado) — a estrutura
   do relatório não detecta isso automaticamente; a rubrica humana identifica o problema.

**Complemento.** Traduza uma iniciativa técnica real sua para custo de atraso, em uma página,
mantendo o conteúdo privado.

**Checagem**

1. Por que o WSJF divide o custo de atraso pelo tamanho do trabalho, em vez de ordenar só pelo
   custo de atraso absoluto?
2. Por que um ROI apresentado como faixa, com premissas explícitas, é preferível a um número único
   — mesmo quando o número único "parece" mais convincente para o negócio?
3. Por que pedir "20% do tempo para dívida técnica" tende a perder a negociação, comparado a
   apresentar o custo de atraso de uma dívida específica?
4. Dê um exemplo de métrica de negócio que, ao virar meta isolada, pode melhorar no papel e piorar
   o resultado real — e explique o mecanismo.

> **Pontes — `arquitetura-de-solucoes/04`; `arquitetura-de-solucoes/07`; `engenharia-de-plataforma/08`;
> `observabilidade/16`.**
> A decisão de comprar ou construir de `arquitetura-de-solucoes/04` é exatamente o caso que este
> marco traduz para linguagem de negócio. A estratégia técnica de `arquitetura-de-solucoes/07`
> ganha, aqui, a camada de custo e retorno que a torna defensável para quem aloca orçamento. E o
> custo por transação se apoia diretamente nos dados de custo de plataforma
> (`engenharia-de-plataforma/08`) e de observabilidade (`observabilidade/16`) já produzidos em
> trilhas anteriores.

## Principais aprendizados

- Custo de atraso é a tradução mais direta entre prioridade técnica e prioridade de negócio.
- WSJF ordena por custo de atraso dividido pelo tamanho do trabalho — não só pelo valor absoluto.
- ROI de iniciativa técnica deveria ser uma faixa com premissas explícitas, nunca um número único
  inventado.
- Dívida técnica apresentada como investimento específico, com custo de atraso de não pagá-la,
  compete melhor por prioridade do que um pedido genérico de "tempo para dívida".
- Uma métrica de negócio que vira meta isolada está sujeita ao mesmo efeito Goodhart de qualquer
  outra métrica.
