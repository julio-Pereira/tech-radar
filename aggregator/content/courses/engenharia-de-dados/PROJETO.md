# Projeto guia — fin-insight

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
> constrói enquanto lê a trilha. O `fin-insight` é a **plataforma de dados da instituição
> receptora**: recebe dados de outras instituições com o consentimento do cliente, guarda,
> transforma, garante qualidade e governança, e serve tabelas confiáveis para análise e para os
> modelos de oferta (`fin-offers`, trilha `ml-em-producao`).

## O que você vai construir

Seis partes: `fake-transmissor/` (servidor de testes com falhas injetáveis), `ingestor/` (cliente
da API, em Go ou Java), `lake/` (Parquet + DuckDB), `transform/` (modelos SQL versionados),
`orquestracao/` (DAGs) e `politica/` (consentimento, finalidade e retenção como código), mais
`qualidade/` e `servico/` (camada de consumo).

**Contratos com os vizinhos** (todos simuláveis com stub):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | APIs de dados de transmissoras **simuladas** (contas, saldos, transações, limites, operações de crédito) | `fake-transmissor` |
| consome | CDC dos lançamentos próprios do cliente | `fin-store`, trilha dados-distribuidos |
| consome | estado do consentimento (autorizado, renovado, revogado, expirado) | API da transmissora simulada |
| consome | eventos de transação como fluxo (opcional, marco 11) | `pix-stream`, trilha kafka |
| serve | tabelas ouro e *features candidatas*, com contrato e SLO | `fin-offers`, trilha ml-em-producao |
| emite | métricas de freshness, volume e qualidade; eventos de linhagem | trilha observabilidade |

**O que este projeto não é.** Não é o lado transmissor (nem a iniciação de pagamento), não treina
modelos, e não mexe em dado real. Também não reimplementa o `fin-store` (usa o CDC).

## Pré-requisitos

- Docker; DuckDB; um runtime de Go **ou** Java; um orquestrador OSS à escolha — esta trilha usa
  **Dagster** como referência (ADR própria: ajuste de dbt à sua modelagem de assets, lineage
  automático), mas o conteúdo vale para Airflow ou Prefect igualmente
- `dbt-core` ou runner SQL equivalente; `promtool`; Kafka local só para o marco 11 (opcional)
- **Não precisa:** conta em nuvem, participante real do Open Finance, certificado ICP-Brasil (o
  `fake-transmissor` dispensa mTLS real; o marco 02 explica a diferença). Confirmar
  licenças/versões das ferramentas antes de fixar a versão usada.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `ARQUITETURA.md` + um pipeline mínimo idempotente | Reexecutar 3× dá o mesmo resultado; falha no meio e retomada não duplica |
| 02 | `ingestor/` contra o `fake-transmissor` com falhas | 0 registros perdidos ou duplicados sob falhas; respeita `Retry-After`/limite; schema novo detectado |
| 03 | `politica/` + tabela de consentimento + visão "dado utilizável" | Nenhuma consulta de consumo retorna dado de consentimento revogado, expirado ou de outra finalidade |
| 04 | Modelo dimensional (fatos de transação, dimensões) com SCD2 | Granularidade única; SCD2 sem sobreposição nem lacuna; somas conservadas |
| 05 | `lake/` em Parquet particionado + políticas de compactação | Tamanho de arquivo dentro da faixa; consulta de 1 dia poda ≥80% |
| 06 | Modelos SQL incrementais com testes | Backfill rodado 2× dá o mesmo resultado; teste de dados quebra o build |
| 07 | DAGs com dependência, retry, backfill e SLA | Backfill de 30 dias idempotente; tarefa que falha 2× e passa na 3ª não duplica |
| 08 | Suíte de qualidade + quarentena + reconciliação com a transmissora | Dado inválido vai à quarentena e não polui a prata; totais batem ou o erro é classificado |
| 09 | Linhagem emitida + painel de freshness/volume/schema + alertas | Regra de alerta passa em `promtool test rules`; toda coluna ouro tem origem rastreável |
| 10 | Revogação propagada + *crypto-shredding* + varredura por `consentId` | Após revogação + SLA, nada do `consentId` é legível em nenhuma camada |
| 11 | Agregação em streaming com dado atrasado + reconciliação com o batch | Stream = batch para o mesmo dia; atrasado além do watermark vira correção |
| 12 | Camada de consumo (tabelas ouro, contrato, quota) | Contrato de consumo quebra o CI se uma coluna ouro muda; consumo não vê dado sem consentimento |
| 13 | Runbook, custo por tabela, DR do lake, ADRs | Restore do lake cronometrado; custo por tabela reportado; ADR por bloco |

### Definição de pronto (capstone)

- [ ] Todo registro bruto tem `consentId`, `finalidade`, `validade` e `origem` — verificado por
      teste de esquema
- [ ] Nenhuma consulta de consumo devolve dado de consentimento revogado, expirado ou de finalidade
      diferente
- [ ] A revogação de um consentimento torna ilegível (ou remove) seus dados em **todas** as
      camadas, caches e extratos dentro do SLO declarado
- [ ] Todo passo do pipeline é idempotente: reexecução e backfill dão o mesmo resultado
- [ ] Toda fonte externa tem contrato; uma mudança de schema da transmissora derruba a execução com
      alerta antes de poluir a prata
- [ ] Existe reconciliação com a transmissora (totais e contagens) com classificação de divergência
- [ ] Toda coluna ouro tem linhagem rastreável até a origem
- [ ] Freshness, volume e schema têm SLO, dono e alerta testado com `promtool`
- [ ] Nenhum PII em log, métrica ou rótulo
- [ ] Política (finalidade, validade, retenção) é código versionado e testado
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **A transmissora muda um campo** (renomeia, troca tipo). Quanto tempo até o alerta? O que
   chegou à prata?
2. **A transmissora fica 3 h fora** e volta com dados atrasados. A reconciliação fecha? Duplicou
   algo?
3. **O cliente revoga o consentimento** no meio de uma execução. Em quanto tempo o dado some de
   cada camada?
4. **Backfill de 30 dias** em cima de dados já processados. O resultado muda?
5. **Perder o bucket do lake.** Quanto tempo para restaurar? Qual o RPO real?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 770 min de leitura viram ~26h porque quase todo
hands-on é provocar uma falha e conferir uma conservação.
