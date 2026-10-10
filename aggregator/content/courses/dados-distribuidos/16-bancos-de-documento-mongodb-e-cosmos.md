---
id: bancos-de-documento
title: "Bancos de documento na prática: MongoDB e Cosmos DB"
summary: "Modelar o agregado, escolher a chave de partição, e o Capstone — o payload do PSP em três stores, com transação, unicidade e CDC medidos, não presumidos."
estimatedMinutes: 55
references:
  - title: "MongoDB — Data Modeling Introduction"
    url: https://www.mongodb.com/docs/manual/core/data-modeling-introduction/
  - title: "Azure Cosmos DB — Partitioning and horizontal scaling"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
  - title: "MongoDB — Change Streams"
    url: https://www.mongodb.com/docs/manual/changeStreams/
  - title: "Azure Cosmos DB — Change feed"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/change-feed
---

## Quando documento é a resposta

O marco 06 já respondeu isto por família: documento responde barato a **ler um agregado inteiro
por id**. No `fin-platform` isso é o payload bruto do PSP e o dossiê de KYC — nunca o ledger, que
precisa de invariante entre linhas e fica em relacional.

O teste continua sendo o mesmo do marco 06: se a pergunta é "me dê o objeto inteiro pela chave",
documento serve; se a pergunta atravessa objetos ou soma sobre eles, não serve.

## Modelar o agregado

**Embutir × referenciar** é uma escolha pela **taxa de crescimento**, não por preferência. Um
array que cresce sem limite é o antipadrão nº 1 de modelagem de documento: no MongoDB, o
documento inteiro tem teto de 16 MiB de BSON; no Cosmos, cada item tem um limite de 2 MB. Um
dossiê de KYC que acumula evento por evento estoura os dois — a saída é referenciar (uma coleção
de eventos, o dossiê guardando o resumo) ou paginar o array por período.

`schemaVersion` dentro do documento, com migração preguiçosa na leitura — o cliente lê a versão
antiga, aplica a transformação em memória e grava a nova na próxima escrita — é o expand/contract
do `dados-distribuidos/11` sem DDL: não existe coluna para adicionar, então a migração vive no
código de leitura até o último documento antigo ser reescrito.

## Índices

**MongoDB** segue a regra **ESR** (*Equality, Sort, Range*) para índice composto: campos de
igualdade primeiro, depois os do `sort()`, depois os de range — nessa ordem o índice atende
igualdade, evita ordenação em memória e só então filtra o range. Inverter a ordem é a causa mais
comum de `COLLSCAN` inesperado num índice que "deveria" cobrir a query.

**Cosmos** indexa **todas as propriedades por padrão** — ao contrário do índice que o marco 05
mostrou ser imposto cobrado por `INSERT`, aqui o imposto já vem ligado. Excluir caminhos que nunca
são filtrados (o payload bruto do PSP tem campos que ninguém consulta) reduz o RU de escrita,
porque cada propriedade indexada é uma escrita a mais no índice invertido.

## A chave de partição é a decisão cara

O mesmo raciocínio do `dados-distribuidos/03`, com nomes de produto diferentes.

**Cosmos.** A partição lógica tem teto de **20 GB** por valor de chave. Passar disso trava
escrita naquele valor — não existe "encher e continuar". *Hot partition* é o celebrity problem do
marco 03 com outro nome, e consulta cross-partition é fan-out cobrado em RU por partição
visitada.

**MongoDB.** Chave **hashed** distribui bem e sacrifica operações direcionadas (a mesma troca do
consistent hashing do marco 03); chave **ranged** favorece range scan e concentra escrita se a
chave crescer monotonicamente. **Resharding** existe desde a versão 5.0 (`reshardCollection`) e é
bem mais barato do que trocar de chave era antes — mas ainda consome CPU e I/O do cluster inteiro
enquanto migra, então continua sendo decisão de projeto, não de correção tardia.

**Fintech.** `pspId` como chave esquenta — poucos parceiros concentram quase todo o volume, o
celebrity problem em estado puro. `paymentId` distribui bem e faz **fan-out** em qualquer consulta
"todos os pagamentos deste cliente". Uma chave composta (`accountId` como partição, `paymentId` na
ordenação) resolve as duas pontas, com o custo declarado de reprocessar o histórico se a decisão
mudar depois.

## Transações e invariantes

O **transactional batch** do Cosmos só opera dentro de **uma única chave de partição lógica** —
até 100 operações ou 2 MB por lote. A invariante que ele protege precisa **caber numa partição**,
o mesmo princípio do agregado bem desenhado (`arquitetura-eventos/04`): se a invariante atravessa
partições, o batch não ajuda, e a resposta é redesenhar a chave, não forçar transação cross-shard.

**MongoDB** tem transação multi-documento desde a 4.0, com custo real: o limite padrão de
execução é `transactionLifetimeLimitSeconds = 60`, transações que pressionam demais o cache do
WiredTiger abortam com erro de conflito de escrita, e cada operação dentro da transação ainda
respeita o limite de 16 MiB por documento. Modele para **não precisar** dela no caminho quente —
transação multi-documento é o recurso de exceção, não o padrão de escrita.

**Idempotência.** Índice único em `idempotencyKey` (`spring-boot/06`) resolve no relacional. No
Cosmos, a **unicidade só vale dentro da partição lógica** — o valor da chave de partição entra
implicitamente na chave única. É o mesmo problema de unicidade em ambiente shardado do
`dados-distribuidos/10`, em outro sotaque: se o mesmo `idempotencyKey` pode chegar em duas
partições diferentes, a constraint não vê nada, e a saída é a mesma do marco 10 — incluir a chave
de partição na definição do que precisa ser único.

## Consistência

Ponte direta para o `dados-distribuidos/15`: o MongoDB expõe `writeConcern`/`readConcern` por
operação; o Cosmos expõe nível por conta, enfraquecível por requisição, com o escopo sempre restrito
a **uma leitura, dentro de uma partição lógica**. Nenhuma das duas tabelas se repete aqui —
consulte o marco 15 para os botões.

## CDC e outbox em documento

**MongoDB change streams** entregam o fluxo de mudanças com um **resume token**: guarde-o depois
de cada lote processado, e um consumidor que morre retoma exatamente dali, sem reler o que já
processou.

**Cosmos change feed** tem dois modos: o padrão (*Latest Version*) só mostra o estado mais recente
de cada item e **não captura deleções**; o modo **All versions and deletes** — que exige *backup
contínuo* habilitado na conta — captura toda mudança, inclusive exclusões, na ordem em que
aconteceram. Se o outbox do seu `fin-store` precisa saber quando um documento foi apagado, o modo
padrão simplesmente não avisa.

*Outbox* atômico funciona por **documento único** (o evento embutido no próprio documento que
mudou, lido pelo change stream/feed) ou por transação/partição (o evento como documento irmão,
escrito no mesmo transactional batch ou na mesma transação multi-documento) — a mesma garantia do
`arquitetura-eventos/08`, escrita na mesma operação atômica do efeito de negócio.

## Custo e operação

**RU/s** é a moeda do Cosmos: provisionado (capacidade reservada), autoscale (paga a faixa
configurada, escala sozinho) ou serverless (paga por RU consumida, sem mínimo). Consistência mais
forte cobra RU de leitura em dobro — a tabela do marco 15 já mostrou o número.

**Backup e restore.** Cosmos com *backup contínuo* restaura para qualquer instante dentro de
7 ou 30 dias, em modo self-service — diferente do *backup periódico* (o default de contas
existentes), que exige chamado de suporte para restaurar. Não é `mongodump`: é um produto de PITR
próprio, e a escolha entre os dois modos é feita na criação da conta.

**PII.** Criptografia em nível de campo, e o mesmo pipeline de anonimização do `dados-distribuidos/13`
antes de qualquer cópia de homologação. **NoSQL injection** — o operador (`$where`, `$ne`) injetado
num filtro montado por concatenação de string — está descrita em `seguranca-aplicacao/03`; a defesa
é filtro por objeto tipado, não escapamento de string.

## Exemplo numa fintech

O payload do PSP é o mesmo do **Complemento do marco 06** (`jsonb` + GIN × documento) — lá era
sugestão de comparação; aqui vira tutorial com número.

## Hands-on

**Tutorial — o payload do PSP em três stores.**

1. Suba um **replica set MongoDB local de 3 membros**, um deles com `priority: 0` e
   `secondaryDelaySecs` configurado para simular lag deliberado. Modele o payload com índice
   único composto (`accountId`, `idempotencyKey`).
2. Reproduza a leitura obsoleta lendo com `readPreference: secondary` contra o membro atrasado; em
   seguida corrija com sessão causal (`readConcern: majority` + `causalConsistency: true` na
   sessão) ou lendo do primário — **meça a diferença de latência** entre as duas versões (o
   "else" do marco 15) e preencha as linhas de MongoDB da `MATRIZ.md`.
3. No **emulador vNext do Cosmos** (Docker, Linux): antes de medir qualquer coisa, audite o
   *feature support* publicado pela Microsoft para essa versão do emulador. Duas
   limitações mudam o que dá para medir localmente: **Request Units aparecem como "não
   implementado ainda"** e **política de indexação customizada é no-op** nessa versão do
   emulador. Na prática:
   - Modele o container com `/pspId` como chave de partição, rode as mesmas três consultas do
     passo 2 e **observe** o comportamento (fan-out cross-partition, latência qualitativa) — isso
     o emulador suporta.
   - Repita com `/paymentId` e compare.
   - O **custo em RU de cada consulta** não sai do emulador: cite os valores da tabela de
     `optimize-cost-reads-writes` da documentação (ex.: leitura por id ≈ 1 RU por item de 1 KB em
     Session) e marque a linha como `estimado por doc, não medido`.
4. Compare os três: latência de leitura por id, tamanho em disco, esforço de operação — contra o
   `jsonb` + GIN do marco 06.

**Desafio — modelo do dossiê de KYC e do payload do PSP.** Escolha embutir × referenciar, chave de
partição e política de índice, **defendidos por número** (taxa de crescimento do array, volume por
partição); declare por escrito onde a unicidade vale e onde não vale em cada store.

**Invariantes testáveis**

1. 100 entregas concorrentes do mesmo webhook do PSP → **exatamente 1** documento persistido, em
   qualquer um dos três stores.
2. A leitura obsoleta do passo 2 é reproduzida e corrigida, com a diferença de latência registrada
   em número.
3. 10.000 eventos inseridos no dossiê de KYC não estouram o limite do documento — ou o modelo usa
   referência antes de chegar perto do teto.
4. Simulando a distribuição real de `pspId`, nenhum valor de chave de partição recebe mais de X%
   das escritas (X declarado no desafio).
5. *Outbox*: o evento é emitido **se e somente se** o documento foi confirmado — teste que mata o
   processo consumidor no meio do lote e confirma que o resume token evita reprocesso e perda.

**Complemento.** *Change stream* do MongoDB publicando num tópico Kafka, com o resume token
persistido a cada lote; mate o consumidor no meio e prove *at-least-once* sem perda, contando
eventos antes e depois.

**Checagem**

1. Por que array sem limite é o antipadrão nº 1 de modelagem de documento?
2. Onde exatamente a unicidade do Cosmos para de valer?
3. O que a chave de partição decide além de distribuir dados — e o que isso custa para corrigir
   depois?
4. Por que o ledger não mora num banco de documento?

## Principais aprendizados

- Documento responde barato a "leia o agregado inteiro por id" — payload do PSP e dossiê de KYC,
  nunca o ledger.
- Array sem limite é o antipadrão nº 1: 16 MiB por documento no MongoDB, 2 MB por item no Cosmos;
  `schemaVersion` com migração preguiçosa é o expand/contract sem DDL.
- A chave de partição decide distribuição e o custo de mudar de ideia depois: hashed × ranged no
  MongoDB, teto de 20 GB por valor no Cosmos, `pspId` esquenta e `paymentId` faz fan-out.
- Transação e unicidade em documento têm escopo: transactional batch e unicidade do Cosmos não
  saem da partição lógica; MongoDB paga tempo e cache por transação multi-documento.
- Mudanças de versão do emulador têm feature support publicado — auditar antes de prometer
  medição; o que não é medível localmente entra na matriz como `não medido`, nunca estimado por
  blog.

## Checklist: camada de dados pronta para produção regulada

Uma página, verificável, que fecha a trilha:

- [ ] Toda invariante de dinheiro é garantida por constraint, lock ou isolamento — não por `if`
- [ ] O modelo de falha e a fonte de ordem estão escritos; nada ordena por relógio de dois hosts
- [ ] RPO e RTO declarados por sistema, com restore cronometrado no último trimestre
- [ ] Réplicas monitoradas por lag, com limiar igual ao número declarado
- [ ] Nenhuma decisão de autorização lê dado sem garantia de recência
- [ ] Toda query do caminho quente tem `EXPLAIN` registrado e índice que a serve
- [ ] Alertas de transação mais antiga, `n_dead_tup` e `age(datfrozenxid)` ativos
- [ ] Toda migração segue expand/contract, com `lock_timeout` e backfill retomável
- [ ] Reconciliação automatizada, com ação definida por classe de divergência
- [ ] Cache com TTL declarado, plano de degradação, e nenhum dado contábil servido dele
- [ ] Classificação de dado por coluna, versionada; nenhum PII real fora de produção
- [ ] Acesso a dado pessoal auditado, com acesso humano temporário e aprovado
- [ ] Data contract e SLO de freshness para todo consumo analítico
- [ ] Toda operação do caminho quente tem perfil de consistência declarado em `MATRIZ.md`, com
      custo medido ou `não medido` — nenhuma linha diz "somos CP" ou "somos AP"
- [ ] Todo documento tem chave de partição defendida por número, e a unicidade que atravessa
      partições está resolvida ou declarada como risco aceito
- [ ] Uma ADR por decisão estrutural, cada uma com **gatilho de reversão**

## Capstone

O `fin-store` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] Os três documentos do bloco de teoria: `ORDEM.md`, `REPLICACAO.md` e `SHARDING.md`
- [ ] Schema do ledger com a invariante de saldo garantida por constraint, lock ou isolamento
- [ ] Tabela de lançamentos particionada por mês, com pruning provado no `EXPLAIN`
- [ ] `STORES.md` com as queries mapeadas e a defesa do menor número de stores
- [ ] Job de reconciliação D+1, com classificação e ação por classe de divergência
- [ ] Cache-aside do limite com jitter, single-flight e plano de degradação
- [ ] Expand/contract completo executado com o serviço no ar, com backfill retomável
- [ ] Runbook de DR, com RPO/RTO declarados e o resultado do ensaio cronometrado
- [ ] Pipeline de anonimização com teste de injeção de PII
- [ ] CDC para o analítico, com data contract e SLO de freshness
- [ ] `MATRIZ.md` com o perfil de consistência por operação, número medido onde possível
- [ ] O payload do PSP modelado em documento (MongoDB ou Cosmos), com chave de partição defendida
      por número e unicidade declarada

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
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: das
**dezesseis** decisões que você tomou aqui, qual é a mais cara de reverter, e o que você faria
diferente sabendo o que sabe agora?
