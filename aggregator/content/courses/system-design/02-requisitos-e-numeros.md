---
id: requisitos-e-numeros
title: "Requisitos e números: capacidade, latência e o que \"escala\" significa"
summary: "Sem número, \"escala\" não é argumento. Estimar é um método com margem de erro declarada — e por que p99 de uma cadeia nunca é a soma dos p99 de cada salto. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "The Tail at Scale (Dean & Barroso)"
    url: https://research.google/pubs/the-tail-at-scale/
  - title: "Google SRE Book"
    url: https://sre.google/sre-book/table-of-contents/
completion: quiz
---

## Back-of-envelope, com a margem declarada

Estimar não é adivinhar: é um método. QPS médio vem de um total (usuários ativos, transações por
dia) dividido pelo tempo; QPS de **pico** multiplica o médio por um fator — tipicamente 3× a 10×
para tráfego de consumo, mais ainda em eventos sazonais (Black Friday, 13º salário). Armazenamento
por ano é o tamanho médio de um registro vezes o volume anual. Banda é o tamanho médio da resposta
vezes o QPS. Nenhum desses números é exato, e fingir que são é o primeiro erro: toda estimativa
**declara a margem** — "entre 2.000 e 6.000 QPS de pico, premissa: fator de pico de 3× a 10× sobre
a média, a confirmar com o time de produto".

**Premissa não é dado.** "Assumo 3.000 TPS de pico" é uma premissa, rotulada como tal, com dono e
prazo de revisão. "O Pix faz 3.000 TPS" é uma alegação que precisa de fonte — e, nesta trilha,
números que o regulador define (janela de liquidação, limites de desempenho de participante) são
**linkados**, nunca copiados, porque mudam e você não quer que seu documento desatualize a doutrina
regulatória.

## Lei de Little, aplicada à capacidade

A mesma estatística mínima que evita relatório errado com número certo (`observabilidade/04`)
dimensiona qualquer sistema em regime estável pela **lei de Little**: concorrência média = taxa de
chegada × tempo de permanência. Se chegam 500 iniciações de pagamento por segundo e cada uma leva,
em média, 300 ms do início ao fim (incluindo fila), há em média 150 iniciações "em voo" a qualquer
instante — esse é o número que dimensiona quantas réplicas, quantas conexões, quanta memória o
sistema precisa manter viva simultaneamente.

## Por que p99 de uma cadeia não é a soma dos p99

Esta é a armadilha mais cara de um orçamento de latência mal feito. Se um fluxo tem cinco saltos,
cada um com p99 de 50 ms, a intuição diz "o pior caso é 250 ms". Errado: **p99 é sobre uma
distribuição**, e cada salto tem sua própria distribuição independente (ou quase). A chance de
**todos os cinco** saltos estarem simultaneamente no seu próprio p99 é muito menor que a chance de
qualquer um estar — então o p99 da cadeia inteira tende a ficar **abaixo** da soma ingênua, mas
**acima** do p99 de um único salto, porque basta **um** salto ruim para puxar a cadeia inteira.

O fenômeno correlato é a **amplificação de cauda** (*tail at scale*, Dean & Barroso): quanto mais
serviços um fluxo atravessa, maior a chance de que **pelo menos um** esteja no seu p99 naquele
instante — e é por isso que sistemas com muitos saltos (fan-out para quinze microsserviços) sofrem
de p99 agregado desproporcionalmente pior que qualquer serviço individual. A defesa prática —
*hedged requests* (duplicar a chamada para o salto mais lento e aceitar a primeira resposta),
orçamento de latência por salto com folga — é tratada com número no marco 08.

## Orçamento de latência por salto

Um orçamento de latência distribui o budget total entre os saltos de um fluxo, com folga: se o
cliente tolera 1 segundo e o fluxo tem quatro saltos síncronos, não se divide 250 ms
igualitariamente — se divide com folga desigual, dando mais tempo ao salto que historicamente varia
mais, e reservando uma margem que nenhum salto individual consome, para absorver variação
agregada.

> **Reencontro adiante — `spring-boot/08`.** O timeout de cada chamada, primeiro item da
> hierarquia de resiliência daquele marco, só tem um valor defensável quando deriva deste
> orçamento — nunca um número redondo escolhido de cabeça.

## Exemplo numa fintech

"Temos 5 milhões de clientes" vira pico de iniciações por segundo em três passos, cada premissa
nomeada: (1) fração ativa diária — 20% dos clientes fazem pelo menos uma transação no dia, premissa
a validar com dados reais quando existirem; (2) transações por usuário ativo por dia — 2,3, média de
produtos similares no mercado; (3) fator de pico — concentração em três janelas do dia (início da
manhã, almoço, fim de tarde) multiplica a média por 6×. O resultado não é "3.000 TPS": é um
**intervalo** com a conta exposta, pronto para ser substituído por dado real assim que ele existir.

## Hands-on

**Tutorial.** Crie `capacity.yaml` com os parâmetros nomeados (usuários ativos, fração diária,
transações por usuário, fator de pico, tamanho médio de payload) e um programa que calcula QPS
médio, QPS de pico, armazenamento por ano, banda e concorrência média (lei de Little).

**Desafio.** Rode uma medição real: `k6` ou `pgbench` contra um componente simples do seu
`fin-blueprint` (por exemplo, o endpoint de iniciação de pagamento com um fake de downstream), e
compare o resultado medido com a previsão do `capacity.yaml`.

**Invariantes testáveis**

1. Três cenários de entrada batem com o valor calculado à mão (teste tabular comparando a saída do
   programa com valores computados manualmente).
2. Dobrar o fator de pico dobra exatamente o QPS de pico calculado (teste de sensibilidade).
3. A razão `medido / previsto` da medição real fica entre 0,5 e 2 — fora desse intervalo, o teste
   exige que a premissa responsável pelo desvio seja nomeada explicitamente no relatório.
4. Uma simulação de Monte Carlo com 5 saltos de latência lognormal mostra que o p99 da soma é
   **menor** que a soma dos p99 individuais — a propriedade central desta seção, provada por
   simulação, não só afirmada.

**Complemento.** Faça uma análise de sensibilidade: de todas as premissas do `capacity.yaml`, qual
é a que mais move o QPS de pico final quando variada em ±20%? Essa é a premissa que mais vale a
pena validar com dado real primeiro.

**Checagem**

1. O que distingue uma premissa de um dado, e por que a diferença importa num documento de design?
2. Por que p99 de uma cadeia de cinco saltos não é a soma dos cinco p99 individuais?
3. O que é amplificação de cauda, e por que ela piora com mais saltos no fluxo?
4. Dado um orçamento de latência de 1 segundo e quatro saltos, por que não dividir 250 ms
   igualmente entre eles?

## Principais aprendizados

- Estimar é um método com margem declarada — QPS médio, pico, armazenamento e banda saem de
  premissas nomeadas, nunca de um número sem origem.
- A lei de Little dimensiona capacidade em qualquer sistema em regime estável: concorrência média =
  taxa de chegada × tempo de permanência — a mesma conta volta no marco 08, aplicada a filas.
- p99 de uma cadeia não é a soma dos p99 — é maior que o p99 de um salto e menor que a soma
  ingênua, e a amplificação de cauda piora com o número de saltos no fluxo.
- Orçamento de latência distribui com folga desigual, nunca igualitariamente, e reserva margem
  para variação agregada que nenhum salto individual consome sozinho.
- Número do regulador é linkado, nunca copiado — ele muda, e o documento não pode desatualizar
  silenciosamente a fonte da verdade.
