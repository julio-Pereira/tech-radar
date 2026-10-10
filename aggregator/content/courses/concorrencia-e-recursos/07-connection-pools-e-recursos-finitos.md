---
id: connection-pools-e-recursos-finitos
title: "Connection pools e recursos finitos"
summary: "Todo pool tem um tempo de retenção, e o tamanho certo é consequência dele — não uma constante copiada de um tutorial. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "HikariCP — About Pool Sizing"
    url: https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing
  - title: "Go — Managing connections (database/sql)"
    url: https://go.dev/doc/database/manage-connections
completion: quiz
---

## Um pool é um recurso caro e finito, emprestado

Uma conexão de banco não é "um objeto": é um canal TCP, um processo (ou worker) do lado do
servidor, memória reservada e, no Postgres, literalmente um processo do sistema operacional por
conexão (`dados-distribuidos/07`). O pool existe para reusar esse custo caro em vez de pagá-lo a
cada requisição — e o tamanho certo é derivado, não escolhido: **tamanho ≈ TPS × tempo de
retenção**, a mesma lei de Little do marco 05, aplicada ao recurso "conexão" em vez de "thread".

A régua "o pool é pequeno" de `dados-distribuidos/07` continua valendo aqui com um acréscimo: o
que esta trilha adiciona é o **lado da aplicação** — como medir o tempo de retenção de verdade, o
que vaza, e como reagir quando o pool esgota.

## HikariCP, com os defaults conferidos

`maximumPoolSize` tem **default 10** — um número pequeno de propósito, que funciona bem quando a
retenção por conexão é curta, e precisa de conta explícita quando não é. `connectionTimeout` é
quanto tempo uma requisição espera por uma conexão livre antes de falhar. `maxLifetime` recicla
conexões periodicamente (relevante atrás de um balanceador ou proxy que também tem seu próprio
timeout de conexão ociosa). `leakDetectionThreshold` tem **default 0 (desligado)**: o menor valor
aceito para ligar é **2000 ms** — abaixo disso, o Hikari considera que não vale o custo de
monitorar. Ligar o `leakDetectionThreshold` em desenvolvimento e staging é uma das formas mais
baratas de achar vazamento antes de produção.

## `database/sql`, com o default oposto

`db.SetMaxOpenConns(n)`: o **default é 0, que significa ilimitado** — a aplicação Go, ao contrário
da aplicação Java com Hikari, está livre por padrão para abrir quantas conexões o banco permitir,
sem nenhum limite imposto pelo lado do cliente. `SetMaxIdleConns` e `SetConnMaxIdleTime` controlam
quantas conexões ociosas ficam reservadas; `SetConnMaxLifetime` tem **default 0 (sem limite)**,
ou seja: sem configuração explícita, Go reusa a mesma conexão para sempre. `db.Stats()` expõe
`InUse`, `Idle`, `WaitCount` e `WaitDuration` — o painel mínimo para saber se o pool está
saudável. A mesma aplicação, com os dois drivers em dois serviços diferentes do mesmo sistema, se
comporta de modo **oposto** sob carga: um protegido por limite, o outro aberto até o banco recusar
conexão.

## Tempo de retenção é tempo de transação

O tempo que uma conexão fica emprestada de um pool é, quase sempre, o tempo de uma transação —
e é aqui que a disciplina de `spring-boot/05` sobre transação curta vira número de dimensionamento
direto: uma transação que faz uma chamada HTTP no meio (*open-in-view*, ou qualquer I/O externo
dentro de `@Transactional`) multiplica o tempo de retenção pela latência dessa chamada,
multiplicando por consequência o tamanho de pool necessário para o mesmo TPS.

A **hierarquia de timeouts** precisa estar em ordem, de fora para dentro: o *deadline* da
requisição do cliente é o maior; o timeout da transação é menor que isso; `connectionTimeout` do
pool é menor ainda (esperar uma conexão não pode consumir todo o orçamento); e `statement_timeout`
no banco é a última rede de segurança, para uma query individual que trava. Quando a ordem está
invertida — por exemplo, `connectionTimeout` maior que o timeout da transação — uma requisição
pode ficar esperando conexão por mais tempo do que o cliente já desistiu de esperar resposta.

## Réplicas × pool × `max_connections`

O HPA sobe de 3 para 20 pods, cada um com pool de 20 conexões: **400 conexões** batendo num banco
com `max_connections = 100`. Nenhuma réplica individual fez nada de errado — o problema é
estrutural, e `maxReplicas × pool` precisa ficar dentro de uma margem do limite do banco (a trilha
usa 80% como referência), verificado antes do deploy, não descoberto em produção. **PgBouncer**
em modo transação resolve isso multiplexando muitas conexões lógicas sobre poucas conexões reais
no Postgres — ao custo de restrições conhecidas (prepared statements por sessão deixam de
funcionar do jeito usual, porque a conexão física muda entre transações).

## Pools de saída, e o que fazer quando esgota

O cliente HTTP de saída tem seu próprio pool: `http.Transport` em Go tem
`MaxIdleConnsPerHost` com **default 2** — baixo o bastante para surpreender quem espera reuso de
conexão alto para um host de alto volume, e frequentemente a primeira coisa a ajustar num cliente
HTTP de produção. O cliente HTTP de Java (`HttpClient` ou um pool de Apache/OkHttp por trás de um
SDK) tem seu próprio conjunto de limites equivalentes.

Quando um pool esgota, a resposta correta nunca é um **500 genérico**: é um **503 com
`Retry-After`**, sinalizando explicitamente que o problema é transitório e dando ao chamador um
tempo de espera sugerido — a diferença entre "algo quebrou" e "o sistema está sob pressão, tente
de novo".

## Exemplo numa fintech

HPA passa de 3 para 20 réplicas do `pix-gateway`, cada uma com `maximumPoolSize = 20`: 400
conexões contra um `max_connections = 100` no Postgres. As primeiras réplicas sobem e tomam o
pool inteiro; as últimas a subir nunca conseguem conexão — o sistema fica **mais lento com mais
réplicas**, o oposto do que o HPA deveria entregar.

## Hands-on

**Tutorial.** Uma calculadora de pool: entrada de TPS, tempo de retenção médio, número de
réplicas e limite do banco; saída de tamanho recomendado por réplica e margem restante até o
limite.

**Desafio.** Injetar um vazamento de conexão de propósito (abrir e nunca fechar) e detectá-lo; um
verificador que lê manifestos de deploy, calcula `maxReplicas × pool` e compara com 80% do
`max_connections` configurado.

**Invariantes testáveis**

1. Com o tamanho calculado pela ferramenta, a carga-alvo produz `pending` (requisições esperando
   conexão) próximo de zero, e o p99 do tempo de **aquisição** de conexão fica abaixo de um
   limiar calibrado na máquina de teste.
2. O vazamento injetado é **detectado**: em Java, o log do `leakDetectionThreshold` dispara dentro
   do limiar configurado mais uma margem pequena; em Go, `db.Stats().InUse` não volta a zero depois
   da carga, e o teste acusa isso.
3. O verificador de manifestos **derruba o CI** quando `maxReplicas × pool` excede 80% do
   `max_connections` declarado, e passa quando está dentro do limite.
4. Com o pool esgotado de propósito, a requisição falha em até `connectionTimeout`, e a resposta
   ao cliente é **503 com `Retry-After`** — nunca 500.
5. `WaitCount`/`pending` e `InUse` (ou os equivalentes do Hikari) são exportados como métrica,
   observáveis durante a carga de teste.
6. O deadlock de pool do marco 04 não ocorre nesta configuração: `REQUIRES_NEW` é banido por um
   teste de arquitetura, ou o pool é dimensionado com margem suficiente para o pior caso, com a
   decisão registrada em ADR.

**Complemento.** Avalie o que muda ao colocar PgBouncer em modo transação na frente do banco —
particularmente o que deixa de funcionar com *prepared statements* preparados por sessão.

**Checagem**

1. Qual é a fórmula de dimensionamento de pool, e qual é o "tempo de retenção" que ela usa?
2. Por que o default de `database/sql` em Go (sem limite) é oposto ao default do HikariCP
   (10), e o que isso implica para quem porta um serviço de uma linguagem para a outra?
3. Qual é a ordem correta da hierarquia de timeouts, do mais externo ao mais interno?
4. Por que `maxReplicas × pool` precisa ser verificado antes do deploy, e não apenas monitorado
   depois?

## Principais aprendizados

- O tamanho certo de um pool é `TPS × tempo de retenção` — a mesma lei de Little do marco 05,
  aplicada a conexões em vez de threads.
- HikariCP é limitado por padrão (`maximumPoolSize = 10`); `database/sql` de Go é **ilimitado**
  por padrão — a mesma aplicação se comporta de modo oposto sob carga, dependendo do driver.
- Tempo de retenção é tempo de transação: qualquer I/O externo dentro de `@Transactional`
  multiplica a retenção pela latência dessa chamada, e por consequência o pool necessário.
- `maxReplicas × pool` precisa ficar dentro de uma margem do `max_connections` do banco,
  verificado em CI — o HPA multiplica conexões tanto quanto multiplica capacidade.
- Pool esgotado responde 503 com `Retry-After`, nunca 500 — a diferença entre sinalizar pressão
  transitória e mentir que algo quebrou.
