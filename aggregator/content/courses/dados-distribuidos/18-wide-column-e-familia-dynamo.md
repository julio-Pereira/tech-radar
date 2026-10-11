---
id: wide-column-e-dynamo
title: "Wide-column e a família Dynamo: modelar pelo acesso"
summary: "Em Dynamo/Cassandra a query vem primeiro: a chave é o contrato de acesso, e o erro de modelagem só aparece com volume. Marco crítico — quiz estendido, Capstone da trilha."
estimatedMinutes: 55
completion: quiz
references:
  - title: "Amazon DynamoDB Developer Guide"
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/
  - title: "Apache Cassandra — documentation"
    url: https://cassandra.apache.org/doc/latest/
  - title: "Dynamo: Amazon's Highly Available Key-value Store"
    url: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
---

## A query vem primeiro

Em relacional, modela-se a entidade e a query se adapta com `JOIN`. Em Dynamo e Cassandra, a
ordem se inverte: **lista-se a query primeiro**, e a chave é desenhada para que ela não precise
de *scan* nenhum. Quem modela como em relacional — entidades normalizadas, pensando em juntar
depois — descobre o erro só em produção, quando o volume expõe a partição quente ou o *scan* que
devia ser leitura por chave.

## Linhagem Dynamo: anel, vnodes, replicação sem líder

Cassandra e DynamoDB descendem do paper *Dynamo* (Amazon, 2007): dados distribuídos num **anel**
de hash consistente (`dados-distribuidos/03`), cada nó responsável por uma faixa — ou, na
prática, por muitos **vnodes** (faixas pequenas), o que distribui melhor a carga de rebalanceamento
quando um nó entra ou sai. A replicação é **sem líder** (`dados-distribuidos/02`): qualquer réplica
aceita leitura e escrita, sem eleição de um nó privilegiado por partição.

## Quórum: `R + W > N`, e o que ele não garante

A mesma aritmética do `dados-distribuidos/02`: com fator de replicação `N`, uma escrita confirmada
por `W` réplicas e uma leitura consultando `R` réplicas garantem sobreposição — a leitura vê a
escrita mais recente — sempre que `R + W > N`. O que essa fórmula **não garante**: **sloppy
quorum** (quando os donos corretos da chave estão fora, outros nós aceitam a escrita via
**hinted handoff** para manter disponibilidade, quebrando a premissa de que `W` veio dos nós
certos); **escrita concorrente** em duas réplicas diferentes na mesma janela, sem coordenação
alguma entre si; e o **relógio** (`dados-distribuidos/01`) decidindo qual escrita concorrente
"vence" — o próximo problema.

## *Read repair*, *anti-entropy*, *last-write-wins*

**Read repair**: ao servir uma leitura, o coordenador nota réplicas desatualizadas e as corrige em
segundo plano. **Anti-entropy** (Merkle trees): processo periódico que compara árvores de hash
entre réplicas e corrige divergências sem esperar uma leitura passar por ali. Os dois mantêm as
réplicas convergindo com o tempo — nunca instantaneamente.

**Last-write-wins (LWW)**: a resolução default de conflito, decidindo por timestamp qual escrita
concorrente sobrevive — e o `dados-distribuidos/02` já mostrou que isso é **perda de dado
silenciosa**, sujeita ao mesmo **clock skew** que torna relógio de parede não confiável para
ordenar dinheiro. Para saldo, LWW é inaceitável; para um histórico de eventos imutável (nunca
atualizado, só inserido), o problema não se aplica, porque não há conflito de concorrência sobre
o mesmo valor. CRDTs entram, em nível conceitual, como alternativa para os tipos que eles cobrem
(contadores, conjuntos) — mas não resolvem uma invariante de saldo.

## Modelagem *query-first*

Cada tabela existe **para uma query**, não para uma entidade — a mesma disciplina de
`arquitetura-eventos/06` aplicada a uma chave em vez de uma projeção de evento. A chave tem duas
partes: **chave de partição** (decide em qual nó o item mora — a mesma decisão cara do marco 03,
com o mesmo risco de partição quente) e **chave de ordenação/clustering** (decide a ordem dos
itens dentro da mesma partição, o que permite range query eficiente sobre um intervalo). **Tabela
por query** e **desnormalização** (duplicar o mesmo dado em formatos diferentes, um por padrão de
acesso) substituem o `JOIN`; o extremo disso é o ***single-table design*** — modelar o sistema
inteiro numa única tabela física, com prefixos de chave distinguindo tipos de item — uma técnica
**controversa**: ganha em operação (uma tabela para gerenciar) e perde em legibilidade e
flexibilidade de query nova.

**Índices secundários**: GSI (*global secondary index*, DynamoDB) permite consultar por um
atributo que não é a chave primária, mas sua leitura é **eventualmente consistente** por padrão —
uma escrita pode não aparecer no GSI imediatamente. LSI (*local secondary index*) vive dentro da
mesma partição da tabela base, com consistência mais forte, mas limitado ao escopo da partição.
Os dois custam: cada índice secundário é uma escrita adicional, o mesmo imposto do
`dados-distribuidos/05` aplicado aqui.

## Partição quente, e partição ilimitada

**Partição quente**: o mesmo *celebrity problem* do `dados-distribuidos/03` — uma chave de
partição concentra desproporcionalmente o tráfego, e o nó responsável por ela sofre sozinho
enquanto o resto do cluster está ocioso. **Partição ilimitada**: uma partição que cresce sem
teto (por exemplo, "todos os eventos desta conta", sem corte temporal) eventualmente bate em
limites práticos de tamanho e de latência de leitura. **Bucketing por tempo** — quebrar a chave
de partição incluindo um recorte temporal (`conta#2026-10`) — é a mitigação comum para as duas
situações: distribui melhor e mantém cada partição com tamanho previsível.

## *Tombstones* e compactação

Um `DELETE` em Cassandra não remove o dado na hora — grava um **tombstone** (um marcador "isto foi
apagado"), que só é removido de verdade na próxima compactação, depois de um período de graça
(`gc_grace_seconds`). Até lá, toda leitura daquela chave precisa **filtrar o tombstone**, o que
custa cada vez mais conforme tombstones se acumulam sem compactação — uma partição com muitos
`DELETE` (por exemplo, um padrão de fila que insere e remove repetidamente na mesma partição) pode
degradar a leitura antes mesmo de ficar grande em volume de dados vivos. A mesma família de
problema do marco 17 (apagar em arquivo imutável), num sabor diferente.

## Escrita condicional, transações limitadas, TTL

**Escrita condicional** (`PutItem` com `ConditionExpression` no DynamoDB, *lightweight
transactions* — LWT — no Cassandra) é concorrência otimista (`dados-distribuidos/10`) sem lock: a
escrita só se aplica se uma condição sobre o estado atual for verdadeira, o que resolve
diretamente o problema de idempotência — a mesma chave de idempotência só é gravada uma vez,
porque a segunda tentativa de escrita condicional falha. **Transações** existem, mas são
**limitadas**: `TransactWriteItems` no DynamoDB e LWT no Cassandra custam mais (um round-trip de
consenso, não uma escrita simples) e têm escopo restrito — não são a ferramenta para uma invariante
ampla entre muitos itens. **TTL**: expiração automática de item, útil para dado com vida curta por
natureza (sessão, cache), não para dado que precisa de retenção auditável.

## Capacidade, gerenciado × autogerido

**RCU/WCU** (*read/write capacity units*) são a moeda do DynamoDB — paralela ao **RU** do Cosmos DB
(`dados-distribuidos/16`), cada uma com sua própria unidade e sua própria tabela de custo por tipo
de operação. **On-demand** paga por uso sem provisionar capacidade; **provisionado** reserva
capacidade fixa, mais barato em carga previsível. Cassandra **autogerido** não tem essa moeda —
o custo é a infraestrutura e a operação do próprio cluster, incluindo compactação e reparo, que em
DynamoDB gerenciado ficam invisíveis ao operador.

## Quando escolher, e quando é erro

**Quando escolher**: escrita altíssima e previsível, acesso por chave conhecida de antemão,
multi-região ativo-ativo sem necessidade de coordenação forte. **Quando é erro**: qualquer
invariante **entre itens** (o ledger, de novo — saldo não é um item isolado), consulta ad-hoc que
muda com frequência (cada query nova pode exigir uma tabela nova ou um GSI novo), ou qualquer
cenário em que o "não existe deadlock aqui" não é vantagem, mas sintoma — sem lock multi-chave,
não existe operação atômica que precise travar duas chaves ao mesmo tempo; se o seu problema
precisa disso, wide-column está resolvendo a pergunta errada.

## Exemplo numa fintech

O **store de chaves de idempotência** (uma escrita condicional por chave, TTL curto, sem nenhuma
invariante entre chaves diferentes) e o **histórico de eventos por conta** (bucketing por mês,
append-only, nunca atualizado) são encaixes quase perfeitos. O **saldo do ledger** — que precisa
de uma invariante lida e escrita atomicamente contra outro valor, e nunca tolera LWW — é o erro
clássico, o mesmo motivo que mantém o ledger em relacional desde o marco 04.

## Hands-on

**Tutorial — simulador de quórum em Go.** Construa um anel simulado com `RF=3` (fator de
replicação), `R` e `W` configuráveis por operação, falha de nó injetável e *hinted handoff*
determinístico — sem rede real, sem não-determinismo, para que as invariantes 1 e 3 abaixo sejam
verificáveis com asserção rígida.

**Desafio.** Modele o "extrato por conta" em Cassandra (contêiner de 1 nó) em duas versões —
partição por conta (ilimitada) e por (conta, mês) — e observe o efeito do *tombstone*; implemente
o store de idempotência com escrita condicional (DynamoDB Local).

**Invariantes testáveis**

1. No simulador, com `RF=3` e `R=W=QUORUM`, matar 1 nó **nunca** perde uma escrita confirmada nem
   devolve leitura obsoleta, em N operações simuladas (asserção rígida); com `R=W=ONE`, a
   contagem de leituras obsoletas é **reportada**, não suprimida (demonstração).
2. A versão "conta" produz ao menos uma partição que cresce sem teto declarado; a versão
   "(conta, mês)" mantém o **maior número de linhas por partição abaixo do limite declarado**
   (verificado sobre os dados gerados).
3. 100 escritas condicionais concorrentes com a **mesma** chave de idempotência geram
   **exatamente 1** sucesso (asserção rígida) — as outras 99 falham pela condição, não por erro
   de rede.
4. A **matriz de acessos** (query → chave) está completa, e nenhuma query do caminho quente exige
   *scan*.
5. A leitura via GSI imediatamente após a escrita **pode** estar obsoleta (demonstração com
   contagem de ocorrências, não asserção de falha — é comportamento esperado, não bug).

**Complemento.** Reproduza a invariante 1 em 3 nós reais de Cassandra, se a máquina permitir, e
compare com o resultado do simulador.

**Checagem**

1. O que `R + W > N` garante, e quais dois fatores (sloppy quorum, escrita concorrente) o fazem
   não garantir sobreposição mesmo quando a aritmética bate?
2. Por que LWW é aceitável para um histórico de eventos append-only e inaceitável para saldo?
3. O que distingue partição quente de partição ilimitada, e qual é a mitigação comum para as duas?
4. Por que uma escrita condicional resolve idempotência sem lock, e o que a diferencia de uma
   transação (`TransactWriteItems`/LWT)?
5. O que um GSI do DynamoDB sacrifica para existir, e por que isso é esperado, não um defeito?
6. Cite dois cenários em que wide-column é a escolha certa e dois em que é erro, segundo este
   marco.

> **Reencontro — `01`, `02`, `03`, `05`, `10`, `15`, `16`; `concorrencia-e-recursos/04`.** O relógio
> e o clock skew do `01` explicam por que LWW falha; o quórum e o sloppy quorum retomam
> diretamente o `02`; o anel, os vnodes e a partição quente são a mesma decisão do `03`; o
> tombstone e a compactação são LSM (`05`) num sabor de apagar; a escrita condicional é a mesma
> concorrência otimista do `10`; o botão de consistência por operação do `15` ganha aqui a linha
> que antes era "uma linha, sem hands-on"; e o contraste RU×RCU/WCU retoma o `16`. Em
> `concorrencia-e-recursos/04`, deadlock exige lock sobre múltiplos recursos simultaneamente — e é
> exatamente **por isso** que deadlock não existe em wide-column: sem operação atômica entre
> chaves diferentes, não há como travar duas ao mesmo tempo. A ausência não é uma vantagem de
> design; é o sintoma direto de não haver invariante entre itens — o mesmo motivo que torna
> wide-column errado para o ledger.

## Principais aprendizados

- Em Dynamo/Cassandra a query vem primeiro: a chave (partição + ordenação) é desenhada para a
  query, e desnormalização/tabela-por-query substituem o `JOIN`.
- `R + W > N` garante sobreposição só enquanto o quórum não é sloppy e não há escrita concorrente
  não resolvida — a aritmética sozinha não é a garantia completa.
- LWW é perda de dado silenciosa, decidida por relógio não confiável — aceitável só quando não há
  conflito real de concorrência sobre o mesmo valor (append-only), nunca para saldo.
- Partição quente e partição ilimitada são dois problemas distintos com a mesma mitigação comum:
  bucketing por tempo na chave de partição.
- Escrita condicional resolve idempotência sem lock e sem transação; GSI troca consistência
  imediata por flexibilidade de consulta — e a ausência de deadlock em wide-column é sintoma de
  não haver invariante entre itens, não uma vantagem gratuita.

## Capstone

O `fin-store` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] Os três documentos do bloco de teoria: `ORDEM.md`, `REPLICACAO.md` e `SHARDING.md`
- [ ] Schema do ledger com a invariante de saldo garantida por constraint, lock ou isolamento
- [ ] Tabela de lançamentos particionada por mês, com pruning provado no `EXPLAIN`
- [ ] `STORES.md` com as queries mapeadas e a defesa do menor número de stores, incluindo a coluna
      "alternativa dentro do Postgres"
- [ ] Job de reconciliação D+1, com classificação e ação por classe de divergência
- [ ] Cache-aside do limite com jitter, single-flight e plano de degradação
- [ ] Expand/contract completo executado com o serviço no ar, com backfill retomável
- [ ] Runbook de DR, com RPO/RTO declarados e o resultado do ensaio cronometrado
- [ ] Pipeline de anonimização com teste de injeção de PII
- [ ] CDC para o analítico, com data contract e SLO de freshness
- [ ] `MATRIZ.md` com o perfil de consistência por operação, número medido onde possível
- [ ] O payload do PSP modelado em documento (MongoDB ou Cosmos), com chave de partição defendida
      por número e unicidade declarada
- [ ] `COLUNAR.md` com o export Parquet e as três consultas comparadas, poda medida e custo do
      apagar reportado
- [ ] `ACESSOS.md` (query → chave) e o simulador de quórum, com o store de idempotência por
      escrita condicional

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] 50 threads concorrentes: o saldo nunca fica negativo e nenhum débito se perde ou duplica
- [ ] Matar o leader sob carga perde no máximo o RPO declarado — medido, não estimado
- [ ] A consulta de extrato toca uma partição, e o `EXPLAIN` está registrado
- [ ] O job de reconciliação detecta as quatro classes de divergência injetadas
- [ ] 200 requisições concorrentes em miss geram uma query ao banco, não duzentas
- [ ] Com o cache fora, o sistema responde de forma degradada definida
- [ ] O backfill rodado duas vezes dá o mesmo resultado, e retoma depois de morto no meio
- [ ] A soma de controle bate por partição antes e depois da migração de coluna monetária
- [ ] O PITR restaura para o instante anterior ao `DELETE`, dentro do RTO declarado
- [ ] O teste de injeção de PII falha se um CPF real atravessar o pipeline
- [ ] Uma mudança incompatível de schema quebra o pipeline analítico no CI
- [ ] Os invariantes 1–3 do marco 15 passam, e nenhuma linha da `MATRIZ.md` diz "forte" sem custo
- [ ] 100 entregas concorrentes do webhook do PSP geram exatamente 1 documento persistido
- [ ] A consulta analítica pesada roda **apenas** no colunar, nunca no OLTP, e o apagar de um
      titular no colunar tem custo medido
- [ ] Todo uso de wide-column tem matriz de acessos sem *scan* no caminho quente e limite
      declarado de tamanho de partição
- [ ] 100 escritas condicionais concorrentes com a mesma chave de idempotência geram exatamente 1
      sucesso
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: das
**dezoito** decisões que você tomou aqui, qual é a mais cara de reverter, e o que você faria
diferente sabendo o que sabe agora?
