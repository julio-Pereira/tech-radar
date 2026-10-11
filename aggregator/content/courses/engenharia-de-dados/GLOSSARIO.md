Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Receptor

### Instituição receptora
**Em uma frase:** a instituição que consome dado de outra, mediante consentimento do titular.
**No fin-platform:** o `fin-insight` é a plataforma de dados do receptor.
**Erro comum:** confundir o papel do receptor com o do transmissor — são responsabilidades opostas.
**Onde na prática:** marco 01.

### Instituição transmissora
**Em uma frase:** a instituição que detém o dado do cliente e o expõe mediante consentimento.
**No fin-platform:** o `fake-transmissor` simula esse papel para os testes da trilha.
**Erro comum:** assumir que a transmissora se comporta melhor do que uma instituição real se comportaria.
**Onde na prática:** marcos 01 e 02.

### Consentimento
**Em uma frase:** dado de primeira classe — identificador, titular, grupos de dados, finalidade, validade, estado.
**No fin-platform:** governa todo o uso de todos os outros dados recebidos.
**Erro comum:** tratá-lo como uma flag booleana de cadastro.
**Onde na prática:** marco 03.

### Finalidade
**Em uma frase:** o propósito declarado para o qual um consentimento autoriza o uso do dado.
**No fin-platform:** "oferta de crédito pessoal" não autoriza uso para "pesquisa de mercado".
**Erro comum:** reutilizar dado coletado para uma finalidade em outro contexto não autorizado.
**Onde na prática:** marcos 03 e 10.

### Validade
**Em uma frase:** o prazo pelo qual um consentimento vale, compatível com a finalidade.
**No fin-platform:** parâmetro configurável — a regulação já mudou esse número uma vez.
**Erro comum:** hardcodar um prazo fixo no código, em vez de arquivo de configuração.
**Onde na prática:** marco 03.

### Revogação
**Em uma frase:** o encerramento explícito de um consentimento, a qualquer momento, por qualquer canal autorizado.
**No fin-platform:** precisa propagar a todas as camadas do `fin-insight` dentro de um SLO declarado.
**Erro comum:** esquecer cache ou cópia de homologação na propagação.
**Onde na prática:** marcos 03 e 10.

### `consentId`
**Em uma frase:** o identificador do consentimento, presente em todo registro de dado derivado dele.
**No fin-platform:** a linhagem que permite responder "quais dados entraram sob este consentimento".
**Erro comum:** ter registros sem `consentId` válido entrando silenciosamente no bruto.
**Onde na prática:** marcos 03 e 10.

### Permissões / grupos de dados
**Em uma frase:** as categorias específicas de dado (conta, cartão, crédito) que um consentimento autoriza, separadamente.
**No fin-platform:** um consentimento pode autorizar conta sem autorizar operação de crédito.
**Erro comum:** tratar consentimento como pacote tudo-ou-nada, em vez de permissões granulares.
**Onde na prática:** marco 03.

## Ingestão

### Marca d'água
**Em uma frase:** o instante da última coleta bem-sucedida, usado para buscar "o que mudou desde então".
**No fin-platform:** cada consentimento tem sua própria marca d'água, não uma global por pipeline.
**Erro comum:** usar uma marca d'água única para todos os consentimentos coletados.
**Onde na prática:** marco 02.

### Janela sobreposta
**Em uma frase:** margem de segurança antes do corte da marca d'água, para não perder registro visível com atraso.
**No fin-platform:** evita perder uma transação criada antes do corte mas visível só depois.
**Erro comum:** buscar "a partir de" exatamente a marca d'água anterior, sem nenhuma margem.
**Onde na prática:** marco 02.

### Paginação por cursor
**Em uma frase:** token opaco que aponta "a partir daqui", preferível a página numérica sob coleção mutável.
**No fin-platform:** evita pular ou repetir itens quando a transmissora insere dado durante a paginação.
**Erro comum:** usar `OFFSET`/página numérica numa coleção que muda enquanto é paginada.
**Onde na prática:** marco 02.

### `Retry-After`
**Em uma frase:** o cabeçalho que sinaliza quanto tempo esperar antes de tentar de novo após limite de taxa.
**No fin-platform:** respeitado literalmente, nunca substituído por um valor arbitrário do ingestor.
**Erro comum:** ignorar o cabeçalho e usar um tempo de espera fixo próprio.
**Onde na prática:** marco 02.

### *Schema drift*
**Em uma frase:** a fonte externa muda schema, tipo ou unidade sem aviso prévio ao contrato formal.
**No fin-platform:** a transmissora troca centavos por reais, e o ingestor precisa detectar.
**Erro comum:** seguir processando com um valor que pode estar na unidade errada.
**Onde na prática:** marcos 02 e 08.

### Desduplicação por chave de negócio
**Em uma frase:** deduplicar pelo par (transmissora, id), nunca pelo id isolado.
**No fin-platform:** duas transmissoras podem, por coincidência, usar o mesmo formato de id.
**Erro comum:** deduplicar só pelo id, ignorando a origem.
**Onde na prática:** marco 02.

### Resolução de entidade
**Em uma frase:** reconhecer que registros de fontes diferentes se referem à mesma pessoa.
**No fin-platform:** o mesmo cliente, com contas em várias instituições transmissoras.
**Erro comum:** falso positivo (unificar pessoas diferentes) é tão grave quanto falso negativo.
**Onde na prática:** marco 04.

## Pipeline

### Idempotência
**Em uma frase:** aplicar uma operação uma vez ou várias vezes produz o mesmo resultado.
**No fin-platform:** o alicerce que torna retry e backfill seguros, sem risco de duplicar.
**Erro comum:** confiar que o orquestrador torna uma tarefa idempotente sozinho.
**Onde na prática:** marcos 01, 06 e 07.

### Reexecução
**Em uma frase:** rodar de novo um passo de pipeline, seja por retry ou por decisão deliberada.
**No fin-platform:** reexecutar 3× produz saída byte-a-byte idêntica a uma única execução.
**Erro comum:** medo de reexecutar por não confiar na idempotência do pipeline.
**Onde na prática:** marco 01.

### Backfill
**Em uma frase:** reprocessar um intervalo de tempo já processado, para corrigir ou aplicar mudança retroativa.
**No fin-platform:** rodado 2× precisa dar o mesmo resultado.
**Erro comum:** disparar backfill grande sem limite de paralelismo contra uma API externa.
**Onde na prática:** marcos 06 e 07.

### *Write-audit-publish*
**Em uma frase:** escrever em staging, auditar com testes, e só então publicar ao consumidor.
**No fin-platform:** garante que só dado validado fica visível, nunca dado ainda não testado.
**Erro comum:** escrever direto no destino final e torcer para os testes passarem depois.
**Onde na prática:** marco 01.

### Incremental
**Em uma frase:** processar só o que é novo desde a última execução, em vez de tudo de novo.
**No fin-platform:** barato, mas arriscado sem janela de reprocessamento para dado atrasado.
**Erro comum:** modelo incremental ingênuo que nunca revisita dado reemitido fora de ordem.
**Onde na prática:** marco 06.

### *Catchup*
**Em uma frase:** o orquestrador dispara automaticamente uma execução para cada intervalo perdido ao retomar.
**No fin-platform:** um backfill de 30 dias sem limite de paralelismo pode estourar o limite de taxa da transmissora.
**Erro comum:** deixar catchup sem limite de paralelismo configurado.
**Onde na prática:** marco 07.

### Quarentena
**Em uma frase:** área separada onde dado que falha um teste de qualidade espera decisão, sem poluir a prata.
**No fin-platform:** a *dead-letter queue* de dados — nem descarte silencioso, nem pipeline travado.
**Erro comum:** descartar dado inválido silenciosamente, perdendo o rastro para investigação.
**Onde na prática:** marco 08.

### DAG
**Em uma frase:** grafo acíclico dirigido que declara dependências entre tarefas de um pipeline.
**No fin-platform:** ingestão → bruto → prata → ouro, cada passo depende do anterior.
**Erro comum:** achar que o DAG, sozinho, garante segurança contra duplicação.
**Onde na prática:** marco 07.

## Armazenamento

### Bruto / prata / ouro
**Em uma frase:** as três camadas de maturidade de um pipeline — cru, limpo, modelado para consumo.
**No fin-platform:** ninguém consome bruto para decisão — a mesma disciplina de bronze/prata/ouro.
**Erro comum:** um relatório de diretoria consultando a camada bruta diretamente.
**Onde na prática:** marco 01.

### Granularidade
**Em uma frase:** o que uma linha de uma tabela de fato representa, exatamente — declarada antes de modelar.
**No fin-platform:** vira um teste de unicidade executável sobre a chave declarada.
**Erro comum:** misturar granularidades (linhas individuais e agregadas) na mesma tabela.
**Onde na prática:** marco 04.

### SCD2 (*slowly changing dimension*, tipo 2)
**Em uma frase:** mudança de dimensão registrada como linha nova com vigência, nunca como `UPDATE`.
**No fin-platform:** as vigências de uma entidade nunca se sobrepõem nem deixam lacuna.
**Erro comum:** sobrescrever a linha antiga, perdendo o histórico de versões anteriores.
**Onde na prática:** marco 04.

### Formato de tabela (lakehouse)
**Em uma frase:** camada de metadado sobre arquivos imutáveis — snapshot consistente, time travel, evolução de schema.
**No fin-platform:** Iceberg resolve o que Parquet sozinho não resolve sob escrita concorrente.
**Erro comum:** tratar um conjunto de arquivos Parquet como se já tivesse as garantias de uma tabela.
**Onde na prática:** marco 05.

### *Small files*
**Em uma frase:** muitos arquivos pequenos custando mais para ler que o mesmo volume em poucos arquivos grandes.
**No fin-platform:** um milhão de arquivos de 40 KB trava a consulta de fechamento.
**Erro comum:** não compactar periodicamente, deixando o número de arquivos crescer sem controle.
**Onde na prática:** marco 05.

### Compactação
**Em uma frase:** mesclar arquivos pequenos em arquivos maiores, periodicamente.
**No fin-platform:** reduz o número de arquivos sem mudar o resultado de nenhuma consulta.
**Erro comum:** compactar com frequência que não acompanha a taxa de chegada de arquivos pequenos.
**Onde na prática:** marco 05.

### *Delete file* / vetor de deleção
**Em uma frase:** o mecanismo de marcar linhas como apagadas num formato de tabela imutável.
**No fin-platform:** a evolução recente da especificação substitui delete file por vetor de deleção, mais eficiente.
**Erro comum:** assumir qual dos dois existe sem conferir a versão da especificação em uso.
**Onde na prática:** marco 05.

### *Time travel*
**Em uma frase:** consultar o estado de uma tabela como ela era num instante passado, via snapshots.
**No fin-platform:** viabilizado pelos snapshots imutáveis de um formato de tabela.
**Erro comum:** confundir time travel com "temos backups" — são mecanismos diferentes.
**Onde na prática:** marco 05.

## Confiança

### Reconciliação
**Em uma frase:** comparar totais e contagens entre o pipeline e a fonte externa, classificando divergência.
**No fin-platform:** as quatro classes — faltando, a mais, valor diferente, atrasado.
**Erro comum:** misturar as quatro classes numa métrica única, escondendo qual precisa de atenção.
**Onde na prática:** marco 08.

### Contrato de dados (*data contract*)
**Em uma frase:** o que se espera formalmente de uma fonte — schema, tipos, semântica, SLA.
**No fin-platform:** detecta *schema drift* antes que o dado chegue à prata.
**Erro comum:** não ter contrato formal com uma fonte externa, descobrindo mudança só pelo sintoma.
**Onde na prática:** marco 08.

### Linhagem
**Em uma frase:** o rastro de origem de um dado — de tabela, ou com mais precisão, de coluna.
**No fin-platform:** responde "de onde vem esse número" com a granularidade que de fato importa.
**Erro comum:** ter só linhagem de tabela quando a pergunta real é sobre uma coluna específica.
**Onde na prática:** marco 09.

### Freshness
**Em uma frase:** há quanto tempo o dado mais recente chegou, com SLO e dono declarados.
**No fin-platform:** medido na fronteira com uma fonte externa que você não controla.
**Erro comum:** declarar freshness sem dono — vira reclamação sem destinatário.
**Onde na prática:** marco 09.

### Análise de impacto
**Em uma frase:** a lista de consumidores afetados por uma mudança, derivada do grafo de linhagem.
**No fin-platform:** evita que três consumidores descubram uma mudança de coluna pelo sintoma.
**Erro comum:** perguntar "alguém usa isso?" no chat em vez de consultar a linhagem real.
**Onde na prática:** marco 09.

### Observabilidade de dados
**Em uma frase:** freshness, volume, schema e distribuição como sinais contínuos sobre a saúde do dado.
**No fin-platform:** muitas vezes a distribuição muda antes de qualquer teste explícito apontar o erro.
**Erro comum:** só ter testes de qualidade pontuais, sem observabilidade contínua entre execuções.
**Onde na prática:** marco 09.

## Privacidade

### Minimização
**Em uma frase:** coletar e reter só o que a finalidade exige, nunca "tudo que a API oferece".
**No fin-platform:** reduz a superfície de exposição em caso de incidente.
**Erro comum:** trazer campos extras "já que estamos buscando mesmo", sem necessidade declarada.
**Onde na prática:** marco 10.

### Retenção
**Em uma frase:** por quanto tempo um dado pode ficar guardado, mesmo com consentimento válido.
**No fin-platform:** parâmetro configurável e testado, nunca hardcoded.
**Erro comum:** guardar indefinidamente "porque pode ser útil depois".
**Onde na prática:** marcos 01 e 10.

### Pseudonimização
**Em uma frase:** substituir um valor real por identificador não trivialmente reversível, preservando capacidade de join.
**No fin-platform:** o CPF vira um identificador que ainda permite juntar registros do mesmo titular.
**Erro comum:** confundir com anonimização irreversível — pseudonimização não é isso.
**Onde na prática:** marco 10.

### *Crypto-shredding*
**Em uma frase:** apagar destruindo a chave de criptografia, sem reescrever nenhum byte do arquivo.
**No fin-platform:** uma chave por consentimento — apagar é destruir a chave correspondente.
**Erro comum:** subestimar o custo de operar uma chave por titular em escala de milhões.
**Onde na prática:** marco 10.

### Trilha de acesso
**Em uma frase:** o registro de quem acessou qual dado pessoal, quando.
**No fin-platform:** todo acesso humano a dado pessoal gera esse registro, sem exceção.
**Erro comum:** ter controle de acesso sem log de auditoria do que de fato foi acessado.
**Onde na prática:** marco 10.

### Política como código
**Em uma frase:** finalidade, validade e retenção como arquivos de configuração versionados e testados.
**No fin-platform:** mudar a norma vira mudar um parâmetro e rodar a suíte, não reinterpretar texto.
**Erro comum:** registrar política como texto em ADR em vez de configuração executável.
**Onde na prática:** marcos 03 e 10.

## Tempo

### Tempo de evento
**Em uma frase:** quando o fato aconteceu de verdade, na origem — não quando o pipeline o processou.
**No fin-platform:** a transação foi efetivada às 14h32, mesmo que processada às 14h40.
**Erro comum:** agregar por tempo de processamento, produzindo resultado errado sob qualquer atraso.
**Onde na prática:** marco 11.

### Tempo de processamento
**Em uma frase:** quando o pipeline de fato viu e processou um evento.
**No fin-platform:** pode divergir do tempo de evento por atraso de rede ou reemissão.
**Erro comum:** tratar os dois tempos como equivalentes, ignorando atraso real.
**Onde na prática:** marco 11.

### *Watermark*
**Em uma frase:** a aposta explícita de até quando esperar por eventos atrasados antes de fechar uma janela.
**No fin-platform:** evento além do watermark vira correção auditável, nunca descarte silencioso.
**Erro comum:** descartar silenciosamente o que chega depois do watermark ter passado.
**Onde na prática:** marco 11.

### Janela (*tumbling*, *sliding*, sessão)
**Em uma frase:** o intervalo de tempo sobre o qual um agregado de streaming é calculado.
**No fin-platform:** a escolha da janela é decisão de negócio tanto quanto técnica.
**Erro comum:** escolher o tipo de janela sem considerar o que "recente" significa para a decisão.
**Onde na prática:** marco 11.

### *Checkpoint*
**Em uma frase:** o ponto de retomada salvo de um processamento de streaming com estado.
**No fin-platform:** reexecutar a partir dele não deve duplicar nenhum valor no destino.
**Erro comum:** um *sink* não idempotente que soma em dobro ao reprocessar a partir do checkpoint.
**Onde na prática:** marco 11.
