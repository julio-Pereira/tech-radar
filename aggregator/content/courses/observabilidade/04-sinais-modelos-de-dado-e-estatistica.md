---
id: modelos-de-dado-e-estatistica
title: "Os sinais, seus modelos de dado e a estatística mínima"
summary: "Por que cada sinal custa o que custa, o debate dos três pilares contra os eventos largos, e as cinco armadilhas estatísticas que produzem relatório errado com número certo."
estimatedMinutes: 50
references:
  - title: "OpenTelemetry — Observability Primer"
    url: https://opentelemetry.io/docs/concepts/observability-primer/
  - title: "Prometheus — Histograms and Summaries"
    url: https://prometheus.io/docs/practices/histograms/
  - title: "Gil Tene — How NOT to Measure Latency"
    url: https://www.infoq.com/presentations/latency-response-time/
---

## Um modelo de dado por sinal

Os quatro sinais não são quatro formatos do mesmo dado. São estruturas diferentes, com
custos diferentes, respondendo a perguntas diferentes:

| Sinal | Unidade | Cardinalidade | Custo | Responde |
| --- | --- | --- | --- | --- |
| **Métrica** | agregado numérico no tempo | **baixa** (obrigatoriamente) | barato | tem problema? |
| **Log** | evento textual/estruturado | alta | caro | o que aconteceu? |
| **Trace** | evento com relação causal | alta, amostrada | médio | onde, na cadeia? |
| **Profile** | amostra de stack | agregada | baixo (contínuo) | por quê, na linha? |

A coluna que explica todo o resto é a **cardinalidade**.

Uma métrica é uma série temporal identificada pelo conjunto de labels. **Cada
combinação distinta de labels é uma série guardada em memória.** Adicionar `psp` (5
valores) × `status` (4) × `metodo` (3) dá 60 séries — barato. Adicionar `payment_id` dá
uma série por pagamento, e o Prometheus cai. Métrica tem cardinalidade baixa **por
construção**, não por disciplina: é a agregação que a torna barata.

Log é o oposto: cada evento é um registro independente, e `payment_id` ali é natural e
esperado. O custo migra de memória para armazenamento e para o índice. É por isso que o
Loki (marco 09) indexa **só labels** e mantém o conteúdo comprimido sem índice — ele
importou a lição da cardinalidade das métricas.

Trace resolve o custo por **amostragem**: você não guarda todos, guarda uma fração — e
a decisão de qual fração, e quando tomá-la (head ou tail), é uma decisão de custo tanto
quanto de utilidade (marcos 06 e 10).

Profile é o mais barato dos "caros": amostrar a stack a 100Hz e agregar produz pouco
dado e responde a pergunta que nenhum dos outros responde — *qual linha de código está
consumindo o tempo*.

**Regra de bolso:** métrica para saber que existe problema, trace para saber onde, log
para saber o quê, profile para saber por quê. Quem tenta responder "onde" com métrica
acaba criando a label de alta cardinalidade que derruba o Prometheus.

## O debate dos três pilares

A divisão "métricas, logs, traces" é útil para aprender e questionável como
arquitetura. A crítica: tratá-los como **silos separados** é o problema — três
pipelines, três ferramentas, três buscas, e o trabalho de correlacionar sobra para o
humano às 3h da manhã.

A proposta alternativa são os **eventos largos** (*wide events*): um evento canônico por
unidade de trabalho, com dezenas ou centenas de atributos (`payment_id`, `psp`,
`account_type`, `duração`, `versão`, `resultado`, `feature_flags`…), do qual os demais
sinais são **derivados** por agregação. Uma fonte, muitas visões, correlação de graça.

O argumento a favor: responde a unknown-unknowns (marco 01) sem ter previsto a
dimensão, porque tudo está no mesmo evento.

O argumento contra, que é prático e sério: **custo e maturidade**. Eventos largos são
caros por natureza — você guarda cada evento, não o agregado — e a maioria das
ferramentas open source é construída sobre o modelo de pilares. Prometheus, Loki e Tempo
não são um armazém de eventos largos, e a stack que faz isso bem tende a ser SaaS.

Não é consenso, e esta trilha não finge que é. O que ela faz é te dar o vocabulário para
participar da discussão — e observar que o meio-termo pragmático já existe: **exemplars**
(um trace ID anexado a um bucket de histograma) e a correlação por `trace_id` entre log,
métrica e trace, que é o que os marcos 09, 10 e 14 constroem. É correlação sem o custo
do modelo puro.

## A estatística mínima

Cinco armadilhas. Todas produzem relatório errado com número tecnicamente correto.

### 1. A média mente

A latência média de um serviço saudável e de um serviço com 5% dos usuários em 8
segundos pode ser a mesma. Média é uma medida de tendência central, e a experiência de
quem sofre está na **cauda**.

O ponto não é "use p99 em vez de média" — é **use a distribuição**. Reporte p50, p95,
p99 juntos: a distância entre eles é a informação. p50 de 80ms com p99 de 90ms é um
sistema previsível; p50 de 80ms com p99 de 4s é um sistema com um modo de falha
escondido.

### 2. Percentil não soma nem tira média

**A média dos p99 de 10 pods não é o p99 do serviço.** Nem a soma, nem o máximo.
Percentil não é uma operação linear — não existe forma de recuperar o percentil do todo
a partir dos percentis das partes.

Exemplo mínimo: um pod com 9 requisições de 10ms e 1 de 1000ms; outro com 10 de 20ms. O
p99 do primeiro é ~1000ms, do segundo é 20ms; a média dos p99 dá ~510ms. O p99 real dos
20 valores juntos é ~1000ms. O erro não é pequeno, e ele sempre subestima.

A saída é agregar **histogramas**: cada instância exporta contagens por bucket, os
buckets somam (isso sim é linear), e o percentil é calculado no fim. É exatamente por
isso que `histogram_quantile` existe no PromQL — e é o reencontro explícito deste
conceito no marco 07. Guarde a frase: *some buckets, nunca percentis*.

### 3. Coordinated omission

O erro clássico de benchmark, e ele também acontece em produção.

Seu load generator quer mandar 100 req/s. Uma requisição trava por 10 segundos. Nesse
período, ele deveria ter enviado 1.000 requisições — e não enviou nenhuma. Quando
retoma, registra 1 requisição de 10s e depois centenas rápidas. As 1.000 requisições
que **teriam sido lentas** simplesmente não existem na amostra.

Resultado: o p99 fica ótimo justamente porque o sistema travou. Quanto pior o
travamento, melhor o relatório.

Onde isso aparece fora de benchmark: qualquer medição feita **depois** de uma fila
(cliente com pool de conexões esgotado nem chega a medir a requisição que não conseguiu
enviar) e qualquer sistema que descarta carga sob pressão. A correção nas ferramentas é
corrigir pela taxa esperada; a correção conceitual é medir do ponto de vista de **quem
esperava**, não de quem foi atendido — o que é mais um argumento para o black-box
sintético do marco 01.

### 4. Little's Law

`L = λ × W` — concorrência = taxa de chegada × tempo de serviço.

Um serviço a 100 req/s com 50ms de latência tem, em média, 5 requisições em voo. Se a
latência dobra para 100ms e a chegada não muda, são 10 em voo. Se o pool tem 8
conexões, você acabou de descobrir onde a fila começa — e ela cresce sem limite
enquanto λ × W passar da capacidade.

É a lei que dá sentido ao *saturation* do USE (marco 03): a fila não é um efeito
misterioso, é aritmética. E é a conta que explica por que um pequeno aumento de latência
numa dependência vira colapso completo lá na frente: a fila cresce, o tempo de espera
cresce, os timeouts começam, os retries dobram λ, e o sistema entra em colapso
congestivo. Um retry mal configurado é a diferença entre uma lentidão e uma queda.

### 5. Quantos noves seu p99 realmente cobre?

p99 de 200ms soa excelente. A 10.000 requisições por minuto, 1% são **100 requisições
por minuto** acima de 200ms — 144 mil clientes insatisfeitos por dia.

E é pior do que parece, porque as caudas não são independentes: uma sessão com 20
chamadas tem ~18% de chance de encontrar pelo menos uma no p99. O usuário não
experimenta uma requisição, ele experimenta uma jornada — o p99 por requisição vira
quase p80 por sessão.

Por isso serviços com fan-out alto olham p99.9, e por isso o SLO precisa dizer sobre
**qual unidade** ele fala: requisição, sessão ou cliente. Três SLOs diferentes com o
mesmo número.

## Push vs pull, e a agregação prematura

**Pull** (Prometheus raspando `/metrics`): o servidor controla a frequência, e a
raspagem falhando já é um sinal de saúde. Ruim para jobs efêmeros, que morrem antes de
serem raspados.

**Push** (OTLP para o Collector): funciona para job curto e serverless, e desacopla a
app de quem coleta — mas você precisa de outro mecanismo para saber que uma app parou de
emitir. Silêncio é ambíguo: "está saudável e quieta" ou "morreu"?

Na prática moderna a app faz push OTLP para o **Collector**, e o Collector expõe pull
para o Prometheus. Você ganha os dois (marco 06).

O **scrape interval** define a menor coisa que você consegue enxergar: com 60s, um pico
de 20 segundos pode não existir no seu gráfico. E **agregar cedo demais é
irreversível** — se o SDK já somou por serviço antes de exportar, a informação por pod
não existe mais em lugar nenhum. Você pode sempre agregar depois; nunca desagregar.

## Exemplo numa fintech

O relatório executivo diz "latência média de 120ms, dentro do acordado". O parceiro
liga reclamando de timeout. Os dois estão certos, e a mesma janela contém as duas
realidades: a média de 120ms convive com um p99 de 4 segundos porque 2% do tráfego —
justamente o do parceiro, cujos payloads são maiores — cai num caminho de código lento.

O que torna essa história completa é que a média **não estava errada**. O número estava
certo; a pergunta é que estava. É por isso que o desafio deste marco é reescrever um
relatório, não calcular um percentil.

## Hands-on

**Tutorial — as duas histórias.** Com um script curto (Python, Go ou até `awk`):

1. Gere 10.000 latências: 95% numa normal de média 80ms, 5% numa normal de média 3.000ms.
2. Calcule média, p50, p95, p99. Note que a média fica perto de 225ms — um valor que
   **nenhuma requisição real teve**.
3. Divida os mesmos dados em 3 "instâncias" de forma desbalanceada (uma delas com quase
   toda a cauda). Calcule o p99 de cada uma, tire a média desses três p99 e compare com
   o p99 do conjunto. Anote a diferença em porcentagem.
4. Agora agrupe em buckets exponenciais (5ms, 10ms, 25ms, 50ms, …, 10s), some os buckets
   das três instâncias e estime o p99 por interpolação. Compare com o p99 real.
   **Este passo é o marco inteiro:** somar buckets funciona, tirar média de percentis
   não. Guarde os três números — eles voltam no marco 07 como `histogram_quantile`.

**Desafio — reescrever o relatório.** Você recebe:

> *"Disponibilidade do mês: 99,92%. Latência média da API de pagamentos: 120ms. MTTR
> médio: 47 minutos. Nenhum SLA descumprido."*

Reescreva em no máximo **cinco linhas**, usando distribuição em vez de médias, e depois
escreva mais cinco linhas defendendo a mudança para um diretor que gostava do relatório
antigo — o argumento tem que ser sobre decisão, não sobre estatística. Quais perguntas
o relatório novo permite responder que o antigo não permitia?

**Checagem.** (a) Por que a média dos p99 de 3 pods subestima o p99 real? (b) Seu
benchmark travou 10s e o p99 melhorou — o que aconteceu? (c) A latência de uma
dependência dobrou e a fila explodiu: qual conta explica isso, e por que o retry piora?
(d) p99 de 200ms com 10k req/min — quantos clientes insatisfeitos por hora?

## Principais aprendizados

- Métrica é barata porque é agregada e de cardinalidade baixa por construção; log e
  trace pagam pela alta cardinalidade em armazenamento e amostragem.
- Wide events vs três pilares é um debate aberto; o meio-termo praticável hoje é
  correlação por `trace_id` e exemplars.
- Some buckets, nunca percentis — a média dos p99 sempre subestima, e é por isso que
  `histogram_quantile` existe.
- Little's Law explica a fila; coordinated omission explica o p99 bom demais; e o p99
  por requisição é muito pior quando lido por sessão.
