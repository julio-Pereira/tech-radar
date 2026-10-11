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

> **Reencontro — `18`.** O botão de consistência por operação visto aqui (write/read concern,
> nível do Cosmos) é o mesmo modelo do `dados-distribuidos/15`, com um produto a mais tratado de
> verdade no `dados-distribuidos/18`: a família Dynamo/Cassandra, que até este ponto da trilha só
> existia como linha de tabela. O checklist de uma página e o Capstone da trilha estão lá, depois
> de o Bloco F fechar o que falta em armazenamento especializado.
