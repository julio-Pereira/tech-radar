---
id: armazenamento-colunar
title: "Armazenamento colunar e o store analítico"
summary: "Colunar paga a escrita e o acesso pontual para ganhar a varredura: entender por que é o que permite decidir quando — e o que custa apagar dado num arquivo imutável."
estimatedMinutes: 60
references:
  - title: "Apache Parquet — format specification"
    url: https://parquet.apache.org/docs/
  - title: "DuckDB — documentation"
    url: https://duckdb.org/docs/
  - title: "ClickHouse — MergeTree engine"
    url: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree
---

## Layout por linha, layout por coluna

Um banco por linha (Postgres, o marco 05 já mostrou) guarda todos os valores de uma linha
próximos no disco — ótimo para pegar a linha inteira, caro para somar uma única coluna sobre um
bilhão de linhas, porque o motor lê byte de todas as outras colunas pelo caminho. Um banco
**colunar** inverte: guarda todos os valores de uma coluna próximos — ler só `valor` e `data` de
um bilhão de lançamentos custa o tamanho dessas duas colunas, não da linha inteira.

A troca é exatamente essa, nos dois sentidos. Colunar ganha varredura de poucas colunas sobre
muitas linhas; perde acesso pontual (uma linha inteira por id exige remontar de várias colunas) e
perde update/delete (voltam mais abaixo). Não é "banco mais rápido" — é um formato desenhado para
uma pergunta diferente da pergunta do OLTP.

## Por que colunas homogêneas comprimem bem

Uma coluna de `status` com 4 valores distintos, repetidos um bilhão de vezes, comprime
brutalmente: **compressão por dicionário** (cada valor distinto ganha um código curto),
**RLE** (*run-length encoding*, uma repetição vira contagem + valor) e **empacotamento de bits**
(usar só os bits necessários para o intervalo de valores) todos exploram a mesma propriedade —
valores vizinhos na mesma coluna tendem a se repetir ou variar pouco. Uma linha inteira,
misturando tipos e cardinalidades diferentes, não tem essa regularidade — por isso o ganho de
compressão colunar costuma superar o de um `gzip` genérico sobre a mesma linha.

## Execução vetorizada, e materialização tardia

Um motor colunar processa **lotes de valores de uma coluna** por instrução (execução
vetorizada), em vez de uma linha por vez — a mesma ideia de SIMD aplicada a consulta, não só a
cálculo numérico. **Materialização tardia**: filtrar primeiro pelas colunas baratas (as usadas no
`WHERE`) e só remontar a linha completa, juntando as outras colunas, para as linhas que
sobreviveram ao filtro — evita pagar o custo de montar uma linha que vai ser descartada.

## Estatísticas min/max, e a poda

Cada **row group** do Parquet (um bloco de linhas, tipicamente de centenas de milhares) guarda,
por coluna, o valor mínimo e máximo daquele bloco. Uma consulta com filtro de data pode **pular o
row group inteiro** sem ler uma linha, só olhando o metadado — essa é a **poda** (*pruning*), e
ela só funciona bem se os dados estiverem **ordenados ou particionados** pela coluna do filtro. A
mesma estatística existe por partição, quando o dado é organizado em diretórios por data.

## O caminho de escrita: lotes imutáveis, merge em segundo plano

Um arquivo colunar, uma vez escrito, é **imutável** — a mesma disciplina do `dados-distribuidos/05`
para SSTables de uma LSM-tree: a escrita acumula um lote em memória e despeja um arquivo novo,
nunca modifica um existente. Um processo de **merge em segundo plano** (compactação) combina
arquivos pequenos em maiores, a mesma função da compactação de LSM — e paga o mesmo tipo de
custo: I/O que concorre com a carga normal e pode produzir pico de latência.

## O custo de update e delete

Atualizar ou apagar uma linha num arquivo imutável não existe como operação direta — as opções
são: **reescrever** o arquivo (ou o row group) inteiro sem a linha afetada, ou marcar a linha com
uma **máscara de deleção** (um bitmap separado que diz "ignore esta linha na leitura", sem tocar
o arquivo original) ou um ***delete file*** (um arquivo auxiliar que lista o que foi removido,
aplicado na leitura). A segunda opção é mais rápida de escrever, mas acumula: sem compactação
periódica, a leitura paga para filtrar cada vez mais linhas marcadas.

## Parquet por dentro

Um arquivo Parquet é: **row groups** (blocos de linhas), dentro de cada um **column chunks** (os
valores de uma coluna, comprimidos), e um **rodapé** (*footer*) com o schema e as estatísticas de
cada row group — é o rodapé que um motor lê primeiro, antes de decidir quais blocos tocar.

## Engines: embutido, servidor, warehouse gerenciado

**DuckDB**: motor colunar embutido, sem servidor, sem conta — roda no processo da aplicação ou da
análise, lê Parquet diretamente. **ClickHouse**: motor colunar com servidor (*MergeTree* como
engine de tabela — o nome já denuncia o parentesco com LSM), pensado para ingestão contínua e
consulta concorrente. **BigQuery/Snowflake/Redshift**: warehouses gerenciados, citados aqui só
por comparação — a trilha não exige conta nem uso real deles.

## Formatos de tabela de lakehouse (nível conceitual)

**Iceberg** e **Delta Lake** adicionam, sobre arquivos Parquet, uma camada de metadados que
resolve três problemas que o Parquet puro não resolve: **snapshots** (cada escrita produz uma
versão nova e consultável do estado da tabela), ***time travel*** (consultar um snapshot
anterior), **evolução de schema** sem reescrever dados antigos, e **compactação** coordenada por
metadado em vez de convenção de diretório. A trilha trata esses formatos em nível conceitual —
saber que existem e o que resolvem, sem exigir uso real.

## Modelo de custo: bytes lidos

Em qualquer engine colunar, o custo (de tempo e, em warehouse gerenciado, de dinheiro) é
proporcional a **bytes lidos**, não a linhas retornadas. Uma consulta que pula 95% dos row
groups por poda lê uma fração do volume total — e é exatamente isso que a tabela otimiza:
particionamento e ordenação que concentram o filtro em poucos blocos.

## Quando não usar

Acesso pontual por id em alta frequência, update/delete frequente, ou qualquer invariante
transacional entre linhas — todos pertencem ao OLTP (`dados-distribuidos/04`, `/06`), nunca ao
colunar. O erro clássico citado no marco 06 — pôr o relatório de diretoria no caminho
transacional, ou o ledger no colunar — é o mesmo erro, nas duas direções.

## Apagar dado em arquivo imutável

O direito de exclusão da LGPD (`dados-distribuidos/13`) encontra, no colunar, o mesmo problema
que o marco 13 já tratou para o transacional, elevado de escala: apagar os lançamentos de **um**
titular num arquivo com bilhões de linhas de **todos** os titulares exige reescrever o arquivo
inteiro para remover uma fração minúscula dele — amplificação de apagar em estado puro. Três
saídas, com custo diferente: **reescrita por partição** (se o dado já está particionado por
titular ou por uma coluna correlata, reescreve-se só a partição afetada); **particionar por
titular** desde o desenho (cada titular isolado num conjunto de arquivos próprio, ao custo de
mais arquivos pequenos); e ***crypto-shredding*** — a mesma técnica do marco 13 (uma chave por
titular, cifrando a coluna sensível), aqui aplicada ao arquivo colunar: apagar a chave torna o
conteúdo daquele titular irrecuperável sem precisar tocar um único byte do arquivo.

## Exemplo numa fintech

O relatório regulatório mensal de TPV por instituição roda sobre 10 milhões de lançamentos. No
Postgres, a varredura lê a tabela inteira, linha por linha, com todas as colunas que o ledger
guarda — a maioria irrelevante para a soma. No Parquet, ordenado por data e com row groups
podados pelo filtro do período, a mesma consulta lê uma fração do volume e termina em uma fração
do tempo, sem disputar cache ou conexão com a autorização de pagamento que está rodando no
mesmo instante.

## Hands-on

**Tutorial — o `fin-store` em dois formatos.** Gere (ou reaproveite) o dataset sintético de
lançamentos do `fin-store` com **ao menos 10 milhões de linhas** (calibrar o tamanho exato na Fase
0, conforme a máquina disponível). Carregue no Postgres (já deve existir da trilha) e exporte para
Parquet, ordenado por data. Rode três consultas nos dois: agregação por dia, top-N por conta,
filtro de um único dia — meça tempo e, no Parquet, bytes/row groups lidos.

**Desafio.** Prove a poda com número, e meça o custo real de apagar os dados de um titular no
arquivo colunar.

**Invariantes testáveis**

1. As três agregações dão **resultado idêntico** nos dois stores — valores em centavos inteiros,
   sem float, comparados exatamente.
2. O arquivo Parquet ocupa **menos espaço** que o CSV equivalente e que a tabela do Postgres (a
   razão varia com a ordenação, não é um número fixo a assumir).
3. A consulta de um único dia lê **menos row groups** que a varredura completa (visível no
   metadado do Parquet ou no plano do motor) e pula **ao menos 80%** dos row groups quando os
   dados estão ordenados pela coluna do filtro.
4. A busca pontual por `id` é **mais lenta** no colunar do que no Postgres indexado — medida, não
   assumida (asserção `tempo_colunar > tempo_postgres`).
5. Apagar todos os lançamentos de um titular exige **reescrever muito mais bytes do que os bytes
   apagados** (a amplificação é medida e reportada) — e a variante particionada por titular, ou
   com *crypto-shredding*, reduz esse custo de forma mensurável.

**Complemento.** Repita o experimento com ClickHouse em contêiner e observe o comportamento do
*merge* em segundo plano (MergeTree) durante a carga.

**Checagem**

1. Por que colunas homogêneas comprimem melhor que uma linha inteira mista?
2. Em que condição a poda **não ajuda**, mesmo com estatísticas min/max presentes?
3. Por que `UPDATE`/`DELETE` são caros num arquivo colunar, e quais são as duas formas de mitigar
   esse custo sem reescrever tudo a cada operação?
4. Por que um relatório de diretoria rodando direto no OLTP e o ledger rodando no colunar são o
   mesmo erro, em direções opostas?

> **Reencontro — `05`, `06`, `13`, `14`; `observabilidade/04`; `kafka/11`.** O caminho de escrita
> por lotes imutáveis com merge em segundo plano é o parentesco direto com LSM-tree de `05`. A
> escolha entre colunar e OLTP é a mesma pergunta por tipo de query do marco `06`, agora com o
> store do lado analítico explicado por dentro. O apagar dado em arquivo imutável retoma
> diretamente o *crypto-shredding* de `13`. O marco `14` ensina o caminho (CDC) até este store —
> aqui está o destino. O pico de latência de p99 durante o merge em segundo plano é o mesmo
> cuidado com *coordinated omission* de `observabilidade/04`. E a ingestão em lote até o Parquet
> pode reusar o mesmo Kafka Connect de `kafka/11`.

## Principais aprendizados

- Colunar não é "banco mais rápido": ganha em varredura de poucas colunas sobre muitas linhas,
  perde em acesso pontual e em update/delete — a troca, não a magia.
- Compressão por dicionário, RLE e empacotamento de bits exploram a homogeneidade de uma coluna —
  o motivo pelo qual colunar comprime melhor que linha.
- Estatísticas min/max por row group permitem poda, mas só funcionam bem com dados ordenados ou
  particionados pela coluna do filtro — sem isso, a poda não ajuda.
- O caminho de escrita é lotes imutáveis com merge em segundo plano, o mesmo parentesco de LSM; e
  update/delete são caros porque não existe modificação direta num arquivo imutável.
- Apagar dado de um titular num arquivo colunar é amplificação de apagar em estado puro —
  reescrita por partição, particionamento por titular, ou *crypto-shredding* são as três saídas, com
  custo diferente entre elas.
