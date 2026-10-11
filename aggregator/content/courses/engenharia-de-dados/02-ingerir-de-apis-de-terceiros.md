---
id: ingerir-de-apis-de-terceiros
title: "Ingerir de APIs de terceiros"
summary: "Quem consome API de terceiro herda os modos de falha de um sistema que não controla. Paginação, limite de taxa, mudança de schema sem aviso, e marca d'água por consentimento. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
  - title: "Banco Central do Brasil — Open Finance"
    url: https://www.bcb.gov.br/estabilidadefinanceira/openfinance
completion: quiz
---

## O receptor é um cliente, com tudo que isso implica

O receptor de Open Finance é, tecnicamente, um **cliente OAuth2/FAPI** chamando a API de uma
transmissora — autenticação forte, mTLS, registro dinâmico de cliente (DCR). Esse mecanismo já foi
ensinado em `seguranca-aplicacao/05` e `/07`; este marco não o repete. O que entra aqui é o que
acontece **depois** de autenticado: você está chamando um sistema que não controla, que pode estar
lento, fora do ar, ou ter mudado de formato sem avisar — e herdar esses modos de falha com
elegância é o trabalho de um ingestor.

## Paginação, incremental × completo

**Paginação por cursor** (um token opaco apontando "a partir daqui") é preferível a paginação por
página numérica para qualquer coleção que muda enquanto é paginada — a mesma razão do marco de
contrato de API em `system-design/05`. **Coleta incremental** busca só o que mudou desde a última
execução, usando uma **marca d'água** (o instante da última coleta bem-sucedida); **coleta
completa** rebusca tudo, mais simples e mais cara. A marca d'água precisa de uma **janela de
sobreposição**: se a última coleta terminou às 10h00, a próxima não começa exatamente em 10h00 —
começa um pouco antes (10h, menos uma margem de segurança), porque um registro pode ter sido
criado na transmissora com timestamp 9h58 mas só ter ficado visível para consulta às 10h01, e sem
sobreposição esse registro nunca seria coletado.

## Limite de taxa, `Retry-After`, e *backoff* com *jitter*

Toda transmissora declara um limite de chamadas por janela de tempo. Estourar esse limite não é
"tentar de novo até passar" — é respeitar o sinal explícito: um código de status 429 (ou
equivalente) normalmente vem com um cabeçalho `Retry-After`, e o ingestor precisa **esperar
exatamente isso**, não um valor arbitrário próprio. Quando não há `Retry-After`, o *backoff*
exponencial com *jitter* (um atraso crescente mais uma variação aleatória) evita que múltiplas
instâncias do ingestor, todas reagindo ao mesmo erro, tentem de novo no mesmo instante — a mesma
disciplina de retry de `system-design/04`, aplicada do lado de quem consome, não de quem balanceia.

## Mudança de schema sem aviso, e a desduplicação por chave de negócio

Uma transmissora pode renomear um campo, mudar um tipo, ou passar a devolver um valor em unidade
diferente — sem aviso prévio, porque o contrato formal é entre instituições regulamentadas, mas o
**detalhe de implementação** de cada API pode variar entre versões sem que o consumidor saiba
antecipadamente. O ingestor precisa **detectar** isso (um campo esperado ausente, um tipo que não
bate com o declarado) e reagir — falhar ruidosamente ou colocar em quarentena (marco 08), nunca
seguir em frente com um valor que pode estar errado.

**Desduplicação por chave de negócio**: o identificador que a transmissora usa para uma transação é
único **dentro daquela transmissora**, mas o receptor agrega dados de várias — a chave de
deduplicação real é o par (transmissora, id da transação dela), nunca o id sozinho. Ignorar isso
produz colisões silenciosas quando duas transmissoras, por coincidência, usam o mesmo formato de
id.

## Agendamento por consentimento

Cada consentimento tem sua própria cadência de coleta e sua própria marca d'água — não existe "a
marca d'água do pipeline", existe a marca d'água de **cada** consentimento, porque consentimentos
diferentes podem ter sido autorizados em momentos diferentes, para finalidades diferentes, com
prazos diferentes (marco 03). Tratar a coleta como um processo único e global, em vez de um
processo por consentimento, é a raiz de bugs sutis de coleta parcial.

> **Reencontro — `concorrencia-e-recursos/07` e `spring-boot/08`.** O pool de conexões do cliente
> HTTP do ingestor segue exatamente a conta de dimensionamento daquele marco — tempo de retenção ×
> TPS. E a hierarquia de timeout, retry só no idempotente, circuit breaker — a base de resiliência
> de `spring-boot/08` — é o que protege o ingestor de uma transmissora degradada, sem reensinar o
> mecanismo aqui.

## Exemplo numa fintech

O `fin-insight` coleta de cinco transmissoras simuladas: uma está lenta (aumenta o tempo de
resposta gradualmente, sem cair); outra reemite os últimos 7 dias de transações a cada chamada
(uma particularidade conhecida de implementação, não um bug); uma terceira, numa atualização,
troca o campo `valor` de centavos inteiros para reais com duas casas decimais, sem aviso. O
ingestor precisa continuar funcionando com a primeira (respeitando o orçamento de tempo), não
duplicar com a segunda (desduplicação por chave de negócio resolve) e **parar e alertar** com a
terceira (detecção de mudança de schema/unidade) — nunca silenciosamente triplicar todos os
valores no ouro.

## Hands-on

**Tutorial.** Construa o `ingestor/` contra o `fake-transmissor` (um servidor de testes com falhas
injetáveis: paginação, 429, 500, timeout, resposta duplicada, campo novo).

**Desafio.** Implemente coleta incremental com janela de sobreposição e desduplicação por chave de
negócio.

**Invariantes testáveis**

1. Sob as falhas injetadas no `fake-transmissor`, o resultado no bruto tem **0 registros perdidos e
   0 duplicados**, comparado à verdade-base que o simulador conhece.
2. O ingestor **nunca** excede o limite de chamadas declarado pelo `fake-transmissor`, e respeita o
   `Retry-After` recebido — testado com um relógio controlável, não com tempo real.
3. Reexecutar a coleta do mesmo intervalo de tempo converge para o mesmo estado final (idempotência
   aplicada à ingestão).
4. Um campo novo ou um tipo alterado no payload do `fake-transmissor` é **detectado**, e a coleta
   falha ou vai para quarentena, conforme a política configurada — nunca segue adiante em silêncio.
5. Cada consentimento simulado mantém sua própria marca d'água, independente das demais.

**Complemento.** Projete o que mudaria na arquitetura se a transmissora oferecesse notificação
*push* (ela avisa quando há dado novo) em vez de só consulta sob demanda.

**Checagem**

1. Por que a chave de deduplicação precisa incluir a transmissora de origem, não só o id da
   transação?
2. O que a janela de sobreposição na marca d'água resolve, e o que acontece sem ela?
3. Por que `Retry-After` deve ser respeitado literalmente, em vez de um valor de espera próprio do
   ingestor?
4. Por que cada consentimento precisa de sua própria marca d'água, em vez de uma global por
   pipeline?

## Principais aprendizados

- O receptor herda os modos de falha de um sistema que não controla: lentidão, limite de taxa,
  mudança de schema sem aviso — o ingestor precisa de uma resposta desenhada para cada um.
- Desduplicação por chave de negócio precisa do par (transmissora, id) — o id sozinho colide entre
  transmissoras diferentes que, por coincidência, usam o mesmo formato.
- `Retry-After` é respeitado literalmente; na ausência dele, *backoff* exponencial com *jitter*
  evita que múltiplas instâncias tentem de novo no mesmo instante.
- Mudança de schema ou de unidade sem aviso é detectada e barrada — nunca seguida adiante em
  silêncio, porque o custo de um valor errado no ouro é maior que o de uma execução interrompida.
- Cada consentimento tem sua própria marca d'água e cadência — tratar a coleta como um processo
  global único é a raiz de bugs sutis de coleta parcial.
