---
id: traces-e-tempo
title: "Traces e Tempo"
summary: "A árvore causal que responde 'onde', span metrics que dão RED de graça, e a propagação através do Kafka que liga o síncrono ao assíncrono."
estimatedMinutes: 50
references:
  - title: "Grafana Tempo — Documentation"
    url: https://grafana.com/docs/tempo/latest/
  - title: "Grafana Tempo — TraceQL"
    url: https://grafana.com/docs/tempo/latest/traceql/
  - title: "OpenTelemetry — Traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
---

## O sinal que responde "onde"

Métrica diz que existe problema. Log diz o que aconteceu num ponto. **Trace diz onde, na
cadeia, o tempo foi gasto** — e essa é a pergunta que domina o diagnóstico em sistema
distribuído.

Um **span** é uma unidade de trabalho com início, fim, atributos, status e um pai. O
conjunto de spans com o mesmo `trace_id` forma uma árvore causal, que a UI mostra como
*waterfall*.

Ler um waterfall é a habilidade prática deste marco, e três padrões cobrem a maioria dos
casos:

- **Um span domina** o tempo total → o gargalo é ele. Caso feliz.
- **Muitos spans curtos em sequência** → N+1. Vinte consultas de 5ms que deveriam ser
  uma; o total é 100ms e nenhum span individual parece ruim.
- **Um buraco entre o fim de um span e o começo do próximo** → o tempo foi gasto **fora**
  do que está instrumentado: espera por conexão do pool, fila do executor, GC. O buraco é
  informação, e é a leitura menos óbvia — é frequentemente onde está o problema real.

## Sampling: onde a decisão mora

Guardar todo trace é caro. A decisão de head vs tail sampling foi tomada no marco 06 e o
resumo é: **head sampling é aleatório em relação ao que interessa; tail sampling guarda
100% dos erros e dos lentos.**

O que importa aqui é uma consequência que confunde: com sampling, **o trace de uma
requisição específica pode não existir**. Se o cliente reclama de uma transação e você
amostra 5% do tráfego saudável, aquele trace provavelmente não foi guardado — a não ser
que ela tenha sido lenta ou tenha falhado, que é justamente o critério das políticas de
tail sampling.

É por isso que as políticas do marco 06 incluem `fin.amount_cents > 5000000`: transação de
valor alto é sempre investigável, independentemente de ter dado certo.

## TraceQL

A consulta é estrutural, sobre spans e suas relações:

```traceql
{ resource.service.name = "pix-gateway" && duration > 1s }

{ span.fin.psp = "itau" && status = error }

{ span.db.system = "postgresql" && duration > 500ms } >> { span.http.route = "/payments" }
```

O operador `>>` (descendente) é o que diferencia TraceQL de uma busca por atributo:
"traces em que uma consulta lenta ao Postgres aconteceu **dentro** de uma requisição a
`/payments`". Perguntas estruturais como essa não são expressáveis em log nem em métrica.

E é aqui que as **semantic conventions** do marco 05 pagam: `db.system`, `http.route`,
`messaging.destination.name` são os mesmos em Java e em Go, então a consulta atravessa as
duas stacks sem tradução.

## Span metrics e service graph

O Tempo (ou o Collector, via `spanmetrics` connector) deriva **métricas a partir dos
spans**: taxa, erro e duração por serviço e operação. Ou seja, **RED de graça** (marco 03)
para tudo que estiver instrumentado com traces, sem instrumentar métrica separadamente.

Duas ressalvas honestas: as métricas derivadas herdam o viés da amostragem (se você
amostra por tail, o span metrics precisa ser calculado **antes** da amostragem, senão a
taxa de erro fica em 100%), e não substituem métricas de negócio (marco 08).

O **service graph** deriva da mesma fonte: quem chama quem, com latência e taxa de erro por
aresta. É o mapa de dependências que ninguém mantém à mão e que sempre está desatualizado
no wiki — aqui ele é gerado do tráfego real. Na conversa sobre disponibilidade composta
(marco 02), ele é o insumo: o caminho crítico é visível.

## O trace através do Kafka

O ponto mais valioso do marco, e o que mais falta em sistemas reais.

Numa cadeia síncrona, o trace flui naturalmente pelos headers HTTP. Quando o fluxo passa
por Kafka, ele **se parte** — a não ser que o contexto viaje nos headers da mensagem
(marco 05).

O detalhe de modelagem: o consumidor pode rodar minutos depois, e um span filho com
duração de 3 minutos de "espera" seria enganoso. A convenção do OTel é usar **span link**:
o span de consumo é raiz de sua própria árvore, mas carrega um link explícito para o span
de produção. A UI mostra a relação sem fingir que é uma chamada síncrona.

Isso torna respondível a pergunta que mais dói numa fintech orientada a eventos:
*"o que aconteceu com este pagamento, do clique do cliente até a liquidação, atravessando
três serviços e dois tópicos?"*.

Sem isso, a investigação é: procurar o log no serviço A, achar o `payment_id`, buscar no
serviço B, torcer para os relógios estarem sincronizados. Com isso, é uma consulta.

## Exemplo numa fintech

O `fin-platform` instrumentado ponta a ponta:

```
POST /payments (pix-gateway)
├── span: validação
├── span: consulta de limite (postgres)
├── span: antifraude (gRPC → ledger-core)
│   └── span: consulta de histórico (postgres)
├── span: chamada ao PSP (http, atributo fin.psp)
└── span: publicação em payments.initiated (kafka)
        ⇢ link ⇢ span: consumo (ledger-core), 40s depois
                 └── span: lançamento no ledger (postgres)
```

Atributos que fazem a diferença na investigação: `fin.psp`, `fin.payment.method`,
`fin.decision` (aprovado/negado/pendente) e `fin.amount_cents` — este último porque é o
que alimenta a política de sampling que garante que transação grande é sempre
investigável.

E o que **não** entra: CPF, PAN, nome. Atributo de span vai para o backend e é lido por
muita gente (marco 17).

## Hands-on

**Desafio — o trace que atravessa tudo.**

1. Com a instrumentação do marco 05 e o Collector do marco 06, garanta que uma requisição
   a `POST /payments` produz a árvore acima, incluindo o **link** através do Kafka.
2. Adicione os atributos `fin.*` nos spans relevantes.

**Invariantes testáveis:**

- Uma requisição gera **um** `trace_id`, e o span de consumo no `ledger-core` está ligado
  a ele por link — mesmo com o consumidor rodando 40 segundos depois.
- Uma consulta TraceQL isola "pagamentos ao PSP itau, acima de R$ 50 mil, que falharam".
- A partir de uma linha de log (marco 09), você abre o trace correspondente pelo
  `trace_id` — e a partir de um span, encontra os logs daquela requisição.
- Com tail sampling ligado, **100%** dos traces com erro estão disponíveis, e um trace de
  sucesso rápido escolhido ao acaso provavelmente **não** está. Prove os dois.

3. **A leitura do waterfall.** Injete, uma de cada vez, três patologias: (a) uma consulta
   lenta, (b) um N+1 de 20 consultas curtas, (c) uma espera por pool de conexões esgotado.
   Para cada uma, capture o waterfall e escreva **uma linha** dizendo como você a
   reconheceu. A terceira é a que aparece como buraco, não como span.

**Complemento — service graph.** Habilite span metrics e o service graph. Compare o grafo
gerado com o diagrama de arquitetura que existe no seu repositório. Anote as diferenças —
elas costumam ser dependências que ninguém documentou.

**Checagem.** (a) O que significa um buraco entre dois spans no waterfall? (b) Por que o
consumidor Kafka usa link em vez de span filho? (c) Por que span metrics precisa ser
calculado antes do tail sampling? (d) O cliente reclama de uma transação e o trace não
existe — por quê, e o que você configura para que transações importantes sempre existam?

## Principais aprendizados

- Trace responde "onde": um span dominante é gargalo, muitos spans curtos são N+1, e o
  buraco entre spans é tempo fora do instrumentado.
- TraceQL faz perguntas estruturais (`>>`) que log e métrica não expressam, e as semantic
  conventions fazem a consulta atravessar stacks.
- Span metrics dão RED de graça e o service graph gera o mapa de dependências real — mas
  precisam ser calculados antes da amostragem.
- O contexto atravessa o Kafka por header e o consumo se liga por **link**, não por span
  filho — é o que torna respondível a jornada ponta a ponta do pagamento.
