---
id: transformacao-como-codigo
title: "Transformação como código"
summary: "SQL de transformação é código: versionado, revisado, testado e reexecutável. Modelos incrementais e o risco de perder dado atrasado."
estimatedMinutes: 60
references:
  - title: "dbt — documentation"
    url: https://docs.getdbt.com/
---

## ELT, modelos declarativos, e o que "declarativo" realmente compra

**ELT** (extrair, carregar, e só então transformar) é o padrão desta trilha, consistente com
`dados-distribuidos/14`: o dado bruto chega sem transformação, e cada modelo SQL declara **o que**
a tabela resultante deve conter, não **como** chegar lá passo a passo imperativamente. A vantagem
prática: um motor de transformação (dbt é o exemplo usado aqui) resolve a **ordem** de execução a
partir das dependências entre modelos — você declara "este modelo lê daquele", e a ferramenta monta
o grafo, em vez de você escrever e manter um script procedural que orquestra isso manualmente.

## Incremental: o ganho e o risco que ele introduz

Um modelo **completo** reprocessa todos os dados de origem toda vez — simples, correto por
construção, caro em volume alto. Um modelo **incremental** processa só o que é novo desde a última
execução — barato, mas introduz um risco real: se a lógica de "o que é novo" não considerar dado
que chega **atrasado** (uma transação que só aparece na origem dias depois do fato, por reemissão
da transmissora), o modelo incremental **nunca a processa**, e o resultado diverge silenciosamente
do que o modelo completo produziria sobre o mesmo dado-fonte. A correção é desenhar a janela
incremental com margem (reprocessar os últimos N dias a cada execução, não só "desde o último
ponto"), aceitando processar alguma coisa de novo para não perder o que chega fora de ordem.

## Determinismo, idempotência, e testes de dados

Um modelo de transformação precisa ser **determinístico** (a mesma entrada sempre produz a mesma
saída) e **idempotente** (rodar de novo não duplica nem corrompe) — as mesmas propriedades do
marco 01, agora aplicadas à camada SQL. **Testes de dados** são afirmações executáveis sobre o
resultado: unicidade de uma chave, não-nulo numa coluna obrigatória, integridade referencial (toda
`conta_id` na tabela de fato existe na dimensão de conta), e regras de negócio específicas (o valor
nunca é negativo numa coluna que deveria ser sempre positiva). Um teste de dados que falha
**quebra o build** — o modelo não é promovido se um teste falhar, a mesma disciplina de gate que
`ml-em-producao` aplica a modelos de machine learning, aqui aplicada a tabelas.

## Ambientes, *slim CI*, e documentação gerada

Rodar a suíte de testes completa, sobre todo o histórico, a cada mudança de uma linha de SQL é
caro e lento. ***Slim CI***: rodar só os modelos afetados pela mudança (calculado a partir do grafo
de dependências) e seus testes, sobre uma amostra ou um ambiente reduzido — o paralelo de testes
de mutação **direcionados** em vez de rodar a suíte inteira sempre. **Documentação gerada**: a
definição de cada modelo, suas colunas e seus testes viram documentação navegável automaticamente a
partir do próprio código — a alternativa (documentação escrita à parte, manualmente) desatualiza no
primeiro dia.

## Backfill seguro, e quando SQL não basta

**Backfill**: reprocessar um intervalo de tempo já processado (para corrigir um bug, ou para
aplicar uma mudança de modelo retroativamente). Seguro significa: rodá-lo **duas vezes** produz o
mesmo resultado (idempotência), e ele não interfere com execuções incrementais correntes rodando em
paralelo. **Quando SQL não basta**: transformações que exigem estado complexo entre linhas de
formas que SQL declarativo não expressa bem, ou processamento que precisa de uma linguagem de
programação completa (parsing de um formato não tabular, por exemplo) — nesses casos, um passo de
código imperativo dentro do pipeline é legítimo, não uma rendição.

> **Reencontro — `dados-distribuidos/11`.** O *expand/contract* daquele marco — migrar schema sem
> parar o serviço — tem o equivalente aqui: evoluir um modelo SQL (adicionar uma coluna, mudar uma
> definição) sem quebrar os consumidores que já dependem da versão antiga, usando o mesmo princípio
> de transição em fases em vez de troca abrupta.

## Exemplo numa fintech

Um modelo incremental de saldo diário processa só as transações "desde a última execução, pelo
timestamp de chegada ao bruto". Uma transmissora reemite transações de 5 dias atrás (uma
particularidade de implementação dela, vista no marco 02) — o modelo incremental, sem janela de
reprocessamento, nunca as vê, e o saldo diário subestima sistematicamente as contas afetadas, sem
nenhum erro visível até alguém comparar com o extrato oficial da transmissora.

## Hands-on

**Tutorial.** Construa modelos SQL incrementais para prata e ouro, com testes de dados (unicidade,
não-nulo, integridade referencial).

**Desafio.** Reproduza o bug do exemplo (modelo incremental ingênuo que perde dado atrasado) e
corrija-o com uma janela de reprocessamento.

**Invariantes testáveis**

1. **Backfill rodado duas vezes** sobre o mesmo intervalo produz exatamente o mesmo resultado.
2. Um teste de dados que falha **quebra o build** — o pipeline de CI falha, e o modelo não é
   promovido para a próxima camada.
3. O modelo incremental **ingênuo** falha em capturar uma transação reemitida tardiamente
   (demonstração: o resultado diverge do completo); o modelo com **janela de reprocessamento**
   captura (asserção rígida: os dois resultados convergem).
4. O resultado do modelo **completo** é idêntico ao do **incremental** rodado sobre o mesmo dado
   de origem, quando a janela de reprocessamento é suficiente.

**Complemento.** Meça o custo (tempo, bytes processados) do modelo completo comparado ao
incremental, sobre o mesmo volume de dados.

**Checagem**

1. O que "declarativo" compra numa ferramenta de transformação como dbt, comparado a um script
   procedural?
2. Por que um modelo incremental ingênuo pode perder dado que chega atrasado, e como se corrige
   isso?
3. O que *slim CI* otimiza, e como ele decide quais modelos testar?
4. Em que situação um passo de código imperativo dentro do pipeline é legítimo, mesmo numa
   trilha SQL-first?

## Principais aprendizados

- Transformação declarativa delega a ordem de execução à ferramenta, a partir das dependências
  declaradas entre modelos — o que elimina a manutenção manual de um script orquestrador.
- Modelo incremental economiza processamento, mas só é seguro com uma janela de reprocessamento que
  absorve dado atrasado — sem ela, a divergência do modelo completo é silenciosa.
- Teste de dados que falha quebra o build, a mesma disciplina de gate que `ml-em-producao` aplica a
  modelo de ML, aqui aplicada a tabela.
- Backfill seguro significa idempotente: rodar duas vezes sobre o mesmo intervalo produz o mesmo
  resultado, sem duplicar nem corromper o que já foi processado.
- SQL declarativo não é dogma — quando a transformação exige estado complexo entre linhas ou
  parsing não tabular, um passo imperativo dentro do pipeline é legítimo.
