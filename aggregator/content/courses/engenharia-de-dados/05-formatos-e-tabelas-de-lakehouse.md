---
id: formatos-e-tabelas
title: "Formatos e tabelas de lakehouse"
summary: "Arquivos imutáveis são ótimos até o dia em que alguém precisa mudar ou apagar um deles. Parquet em uso, formatos de tabela (Iceberg), e apagar em armazenamento imutável."
estimatedMinutes: 55
references:
  - title: "Apache Parquet — format specification"
    url: https://parquet.apache.org/docs/
  - title: "Apache Iceberg — table spec"
    url: https://iceberg.apache.org/spec/
---

## Parquet em uso: tamanho, *small files*, particionamento

Arquivo **pequeno demais** (muitos arquivos de poucos KB) é tão ruim quanto arquivo **grande
demais**: cada arquivo pequeno cobra um custo fixo de abertura e leitura de metadado,
independentemente de quantas linhas carrega — um milhão de arquivos de 40 KB custa muito mais para
ler que a mesma quantidade de dado em mil arquivos de 40 MB. **Compactação** periódica mescla
arquivos pequenos em maiores. **Particionamento** por data (e, quando faz sentido, por titular ou
instituição) organiza fisicamente os dados para que uma consulta filtrada por esses critérios
precise ler só a fração relevante — o mesmo princípio de *partition pruning* de
`dados-distribuidos/07`, aqui aplicado a arquivos em vez de partições de tabela relacional.

## Formato de tabela: o que o Parquet sozinho não resolve

Um conjunto de arquivos Parquet, sem mais nada, não sabe responder "qual é o estado atual da
tabela?" de forma consistente sob escrita concorrente, não suporta **time travel** (consultar como
a tabela estava ontem), e não tem um jeito nativo de **evoluir o schema** sem quebrar leitores
antigos. **Formatos de tabela** (Iceberg é o tratado aqui, em nível conceitual — Delta Lake resolve
problemas semelhantes com um desenho diferente) resolvem isso com uma camada de metadado sobre os
arquivos: **snapshots** (cada mudança na tabela gera um novo snapshot, imutável, apontando para o
conjunto de arquivos válido naquele momento — o que viabiliza time travel de verdade, não só
"guardei backups"), evolução de schema sem reescrever dado existente, e **transações** sobre o
lake (múltiplas escritas concorrentes não corrompem o estado).

**Como apagar num formato imutável**: historicamente, a estratégia era *copy-on-write* (reescrever
o arquivo inteiro sem as linhas apagadas — simples de ler, caro de escrever) ou *merge-on-read*
(marcar as linhas como apagadas num arquivo de delete separado, mesclando na leitura — escrita
barata, leitura mais cara). A evolução mais recente da especificação do Iceberg substitui o
delete file "clássico" por **vetores de deleção** (um bitmap binário, mais eficiente de aplicar na
leitura que o delete file anterior) — confira a versão da especificação em uso antes de assumir
qual das duas existe no seu ambiente.

## Engines: embutido, servidor, warehouse gerenciado

**DuckDB** roda embutido no processo que o chama, sem servidor para administrar, sem conta —
excelente para desenvolvimento, testes, e cargas que cabem numa máquina. **ClickHouse** é um
servidor dedicado, com seu próprio formato de armazenamento colunar (*MergeTree*) e *merge* em
segundo plano — mostra o lado "banco colunar operado como serviço". **Warehouses gerenciados**
(BigQuery, Snowflake, Redshift) entram só por comparação, nunca como dependência desta trilha —
nenhum hands-on exige conta paga.

## Quando um warehouse gerenciado já basta, e quando lakehouse vale o investimento

Lakehouse (Parquet + formato de tabela, operado por você) ganha quando o volume e a diversidade de
consumidores (SQL, ferramentas de ML, processamento customizado) justificam possuir o formato de
armazenamento; um warehouse gerenciado ganha quando a equipe prefere pagar por operação em troca de
não administrar compactação, estatísticas e *garbage collection* de snapshot — a mesma pergunta de
"construir ou comprar" aplicada a uma camada a mais do stack.

> **Reencontro — `dados-distribuidos/05` e `/14`; Bloco F (colunar), se publicado.** O Bloco F
> de `dados-distribuidos` aprofunda o **motor** de armazenamento colunar — compressão, execução
> vetorizada, estatísticas de poda — por dentro, com Parquet e DuckDB como base; este marco trata
> das **tabelas** que vivem sobre esse formato: como elas evoluem, apagam e sobrevivem a escrita
> concorrente. `dados-distribuidos/05` já ensinou LSM-tree e *merge* em segundo plano — o
> caminho de escrita do Parquet com formato de tabela é parente direto dessa ideia.

## Exemplo numa fintech

O relatório de fechamento mensal precisa ler o TPV de um dia específico, há três meses, sobre uma
tabela de 2 bilhões de linhas acumuladas. Sem particionamento nem formato de tabela, isso é uma
varredura completa. Com particionamento por data e estatísticas de poda, a consulta toca só os
arquivos daquele dia — e, se um cliente pedir exclusão de seus dados no meio do período, o formato
de tabela permite localizar e remover exatamente as linhas dele sem reescrever os dois bilhões.

## Hands-on

**Tutorial.** Construa o `lake/` em Parquet particionado por data a partir de dados simulados, e
consulte com DuckDB.

**Desafio.** Compacte arquivos pequenos e corrija (apague/atualize) um registro específico.

**Invariantes testáveis**

1. Uma consulta filtrada por um dia específico **poda pelo menos 80%** dos arquivos, comparado a
   uma varredura completa do período total — medido pelo metadado de Parquet ou pelo
   `EXPLAIN ANALYZE` do mecanismo de consulta.
2. Após a compactação, o número de arquivos **cai**, e o resultado de uma consulta de referência é
   **idêntico** ao resultado antes da compactação.
3. Corrigir ou apagar um registro específico é refletido numa leitura subsequente, e deixa uma
   trilha de auditoria (o que mudou, quando, por quem/qual processo).
4. O schema evolui (uma coluna nova é adicionada) sem quebrar uma consulta que não referencia a
   coluna nova.

**Complemento.** Se a ferramenta disponível permitir, reproduza o mesmo cenário com um formato de
tabela real (Iceberg) e compare o comportamento de apagar com a versão só-Parquet.

**Checagem**

1. Por que *small files* custam caro de ler, mesmo contendo pouco dado no total?
2. O que um formato de tabela resolve que um conjunto de arquivos Parquet sozinho não resolve?
3. Qual é a troca entre *copy-on-write* e *merge-on-read* para apagar num formato imutável?
4. Quando um warehouse gerenciado é preferível a operar seu próprio lakehouse?

## Principais aprendizados

- *Small files* custam pelo overhead de abertura e metadado por arquivo, não pelo volume de dado —
  compactação periódica é o que mantém esse custo sob controle.
- Formato de tabela (Iceberg/Delta) acrescenta ao Parquet o que ele sozinho não tem: snapshot
  consistente sob escrita concorrente, time travel real, e evolução de schema sem quebrar leitores.
- Apagar em armazenamento imutável tem duas estratégias com troca clara: *copy-on-write* (leitura
  barata, escrita cara) e *merge-on-read*/vetores de deleção (escrita barata, leitura mais cara).
- Particionamento por data, com estatísticas de poda, é o que transforma uma consulta de um dia
  numa leitura de fração do dado, em vez de uma varredura completa.
- A escolha entre lakehouse próprio e warehouse gerenciado é "construir ou comprar" — depende de
  volume, diversidade de consumidores, e apetite da equipe por operar a camada de armazenamento.
