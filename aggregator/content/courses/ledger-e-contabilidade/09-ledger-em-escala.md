---
id: ledger-em-escala
title: "Ledger em escala"
summary: "A contenção de um ledger não está na média, está na conta mais quente — e escalar significa decidir o que fica serializado e o que não precisa ficar."
estimatedMinutes: 65
references:
  - title: "Jepsen — Consistency Models"
    url: https://jepsen.io/consistency
---

## Contas quentes: o gargalo real

Uma **conta quente** (a conta de tarifas, recebendo um lançamento por transação de todo o banco; a
conta de liquidação, concentrando o fluxo de um trilho inteiro) não tem o mesmo perfil de carga de
uma conta de cliente comum — ela recebe ordens de magnitude mais lançamentos por segundo, e a
contenção de escrita nessa única conta vira o limite de vazão de todo o sistema, independente de
quão bem o resto do ledger escale. Medir a **média** de carga por conta esconde completamente esse
problema — o que importa é a distribuição, e especificamente a cauda.

## Fragmentação do saldo

A técnica central para destravar uma conta quente: **fragmentar** o saldo lógico em múltiplas
sub-contas internas, cada uma absorvendo uma fração do tráfego, com o saldo lógico da conta sendo,
ele mesmo, a soma dos fragmentos. Essa fragmentação precisa ser **transparente** para qualquer
consulta de saldo externa (que vê só a conta lógica) e **consistente** com a invariante de
balanceamento (cada fragmento, individualmente, ainda participa normalmente da partida dobrada).

## Lançamento diferido e agregação em lote

Uma alternativa (ou complemento) à fragmentação: em vez de postar cada lançamento individual
imediatamente na conta quente, **agregar** um lote de lançamentos relacionados e postar um único
lançamento consolidado periodicamente — reduzindo drasticamente o número de escritas na conta
quente, ao custo de um saldo que reflete o estado "até o último lote agregado", não em tempo real
estrito.

## Particionamento e o custo de atravessar partições

Quando contas são distribuídas por **partição** (`dados-distribuidos/03` já formalizou o
particionamento em geral), um lançamento cujas pernas estão em contas de partições diferentes
custa mais — exige coordenação entre partições, não uma escrita local simples. Minimizar lançamentos
que atravessam partições, ou aceitar explicitamente o custo quando é inevitável, é uma decisão de
desenho que afeta diretamente a vazão alcançável.

## Ordem de bloqueios e impasse

Quando múltiplas contas de um mesmo lançamento precisam ser bloqueadas para escrita (a disciplina
de concorrência já detalhada em `concorrencia-e-recursos/10`), a **ordem** em que os bloqueios são
adquiridos precisa ser consistente entre todas as operações concorrentes — adquirir bloqueios em
ordens diferentes é a receita clássica para **impasse** (*deadlock*), já catalogado em
`concorrencia-e-recursos/04`. Uma convenção simples (sempre bloquear contas em ordem crescente de
identificador, por exemplo) elimina essa classe de impasse por construção.

## *Event sourcing* do ledger e reconstrução

O journal já é, estruturalmente, um event store (marco 03); em escala, isso significa que o
estado atual do ledger pode sempre ser **reconstruído** (*replay*) a partir do journal completo —
uma capacidade que serve tanto como verificação de integridade (o estado reconstruído bate com o
estado atual?) quanto como mecanismo de recuperação depois de uma falha séria. `arquitetura-eventos/07`
já tratou essa técnica em geral; aqui ela ganha uma invariante de verificação concreta: o **hash**
do estado reconstruído precisa bater com o hash do estado corrente.

## CQRS para o extrato em escala

Separar o caminho de **escrita** (postar lançamentos, que precisa de forte consistência e
atomicidade) do caminho de **leitura** (gerar extratos, que pode tolerar alguma defasagem em troca
de throughput de consulta muito maior) — o padrão CQRS já visto de forma geral em
`arquitetura-eventos/06` — é o que permite que consultas de extrato em volume não compitam
diretamente pelos mesmos recursos que o caminho crítico de postagem de lançamentos.

## Migração de schema e backup sob carga

Uma tabela de lançamentos **imutável** e sempre crescendo tem necessidades específicas de migração
de schema (`dados-distribuidos/11` já formalizou migração sem downtime em geral) — adicionar uma
coluna não é o mesmo problema que numa tabela mutável comum, porque o volume de dados nunca
diminui. E o backup e a recuperação de um ponto no tempo (`dados-distribuidos/12`) de um ledger
têm uma consideração extra: o que exatamente se perde entre o último backup e o momento da falha
precisa ser detectável pela conciliação (marco 08), não apenas assumido como "aceitável".

## SLOs do ledger: latência e exatidão

Um ledger em produção precisa de **SLOs** próprios: latência de postagem (quanto tempo um
lançamento leva para ser confirmado) e, mais importante, **exatidão** (a taxa de violação de
invariantes detectada, que deveria ser, estruturalmente, zero sempre). Um orçamento de contenção —
quanto de vazão numa conta quente específica o sistema consegue sustentar antes de degradar — é o
número que efetivamente diz se o sistema está pronto para o volume esperado.

## Exemplo numa fintech

A conta de tarifas recebe um lançamento por transação de um banco inteiro — rapidamente se torna o
limite de vazão de todo o ledger, mesmo que todas as outras contas tenham capacidade de sobra.
Fragmentar essa conta em dez sub-contas internas, cada uma absorvendo um décimo do tráfego, mais
que decuplica a vazão sustentável sem alterar nenhuma regra contábil.

## Hands-on

**Tutorial.** Implemente uma carga sintética com contas quentes e a reconstrução do estado a
partir do journal.

**Desafio.** Fragmente o saldo de uma conta quente e compare a vazão resultante contra a
abordagem ingênua (sem fragmentação).

**Invariantes testáveis**

1. Sob a carga concorrente completa, **zero violações** de qualquer invariante dos marcos 01-08
   — a suíte de invariantes inteira roda ao final da carga e precisa passar integralmente.
2. A **reconstrução** do estado a partir do journal completo reproduz **exatamente** o estado
   atual — verificado por comparação de hash entre o estado reconstruído e o corrente.
3. A estratégia de **fragmentar** a conta quente produz uma **vazão maior** que a abordagem
   ingênua, verificada como uma **razão** (vazão fragmentada dividida pela ingênua, maior que 1,
   com margem), sob a mesma semente e carga.
4. A **soma dos fragmentos** de uma conta quente é sempre igual ao saldo lógico da conta —
   verificado em todo instante da carga.
5. Uma **migração de schema** aplicada em paralelo à carga de lançamentos **não perde nem
   duplica** nenhum lançamento, verificado por contagem antes e depois da migração.

**Complemento.** Defina, por escrito, o SLO de exatidão do seu próprio ledger e como você o
mediria continuamente em produção.

**Checagem**

1. Por que medir a média de carga por conta esconde o problema real de uma conta quente?
2. Qual é a diferença entre fragmentar o saldo de uma conta e agregar lançamentos em lote como
   estratégias de destravar uma conta quente?
3. Por que uma ordem consistente de aquisição de bloqueios elimina uma classe inteira de impasse?
4. Por que a reconstrução do estado a partir do journal é tanto uma verificação de integridade
   quanto um mecanismo de recuperação?

> **Reencontro — `concorrencia-e-recursos/10`, `/04`.** A matriz de mecanismos de concorrência
> daquele primeiro marco continua sendo a base para decidir como proteger a escrita concorrente
> numa conta quente; e a classificação de impasse do segundo é exatamente o que uma ordem
> consistente de bloqueios, aplicada aqui às contas de um lançamento, elimina por construção.

O particionamento de `dados-distribuidos/03` é o que determina o custo real de um lançamento que
atravessa fronteiras de partição, e o event sourcing de `arquitetura-eventos/07` é a técnica geral
que a reconstrução a partir do journal, aqui, aplica especificamente a um ledger contábil. O backup,
PITR e DR de `dados-distribuidos/12` segue sendo a referência de o que exatamente se perde numa
restauração — e de como a conciliação do marco 08 é o que revela esse buraco depois do fato.

## Principais aprendizados

- A contenção real de um ledger está na conta mais quente, não na média — medir só a média
  esconde o gargalo verdadeiro.
- Fragmentar o saldo de uma conta quente em sub-contas internas, transparente para consultas
  externas, é a técnica central para destravar vazão.
- Uma ordem consistente de aquisição de bloqueios entre contas elimina uma classe inteira de
  impasse por construção.
- O journal, sendo um event store, permite reconstruir o estado atual do ledger inteiro a partir
  do histórico completo — tanto para verificação quanto para recuperação.
- SLOs de latência e, especialmente, de exatidão (que deveria ser estruturalmente zero violações)
  são o que realmente diz se um ledger está pronto para o volume esperado.
