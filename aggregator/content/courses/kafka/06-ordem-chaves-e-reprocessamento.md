---
id: ordem-e-reprocessamento
title: "Ordem, chaves e reprocessamento"
summary: "Ordem existe só por partição; partição quente; e como reler um dia inteiro de eventos sem movimentar dinheiro duas vezes."
estimatedMinutes: 55
references:
  - title: "Apache Kafka — kafka-consumer-groups tool"
    url: https://kafka.apache.org/documentation/#basic_ops_consumer_group
  - title: "Martin Kleppmann — Designing Data-Intensive Applications"
    url: https://dataintensive.net/
  - title: "Apache Kafka — Message Delivery Semantics"
    url: https://kafka.apache.org/documentation/#semantics
---

## Ordem é por partição, e só

Não existe ordem global em Kafka. Existe ordem **dentro de uma partição** — e ordem
global significaria uma partição, o que significa um consumidor, o que significa
nenhuma escala.

A boa notícia é que **ordem global quase nunca é o requisito**. Ninguém precisa que o
pagamento do cliente A seja processado antes do pagamento do cliente B. O que precisa
ser ordenado é o que se refere à **mesma entidade**: o débito antes do estorno, o
lançamento antes do saldo.

Então a pergunta de projeto não é "como garanto ordem?", é: **qual é a menor unidade
que precisa de ordem?** Essa unidade é a chave.

| Chave | Ordem que você ganha | Distribuição | Serve? |
| --- | --- | --- | --- |
| `paymentId` | nenhuma útil | perfeita | não — estorno e débito se cruzam |
| `accountId` | por conta | boa, com risco de conta quente | **sim**, o padrão |
| `agencia` | por agência | ruim, poucas chaves | não — paralelismo baixo |
| nenhuma | nenhuma | perfeita | só para evento sem relação entre si |

E a armadilha estrutural: `partição = hash(chave) % nº de partições`. **Aumentar o
número de partições muda o resultado do módulo** — a conta 4711 que ia para a partição
2 passa a ir para a 5, e por um período existem eventos da mesma conta em duas
partições, sem ordem entre si. Aumentar partição de tópico com ordem por chave não é
uma operação de escala, é uma migração. É por isso que o dimensionamento do marco 02
pede folga de crescimento desde o começo.

## Partição quente

Se um cliente é 30% do volume, uma partição carrega 30% da carga e nenhuma quantidade
de consumidores conserta: aquela partição tem **um** consumidor, por definição.

O sintoma é característico e fácil de ler quando você sabe: lag alto **numa** partição
e zero nas outras. Por isso o marco 04 insiste em observar lag por partição, não o
total — a média esconde exatamente o caso que interessa (a mesma lição estatística da
trilha de observabilidade).

As saídas, todas com custo em ordem:

- **Chave composta** (`accountId:hash(paymentId)%4`) — espalha a conta gigante por 4
  partições e **perde a ordem por conta**. Só serve se aquela conta específica não
  precisar de ordem, ou se a ordem for reestabelecida a jusante.
- **Tópico dedicado** para os poucos clientes gigantes, com consumidor próprio e
  dimensionamento próprio. Mantém ordem, custa complexidade de roteamento.
- **Aceitar e dimensionar** para o pior caso: se a partição mais quente aguenta o
  cliente maior, está resolvido. Frequentemente é a resposta certa e a menos glamourosa.
- **Reduzir o trabalho por mensagem** naquele caminho (batch de escrita, cache) —
  atacar o consumo em vez da distribuição.

Não existe solução sem trade-off aqui. O trabalho de techlead é escolher qual perder e
escrever por quê.

## Event time vs processing time

Duas linhas do tempo, e confundi-las produz relatório errado:

- **Event time** — quando o fato aconteceu (o cliente apertou "pagar").
- **Processing time** — quando o seu código viu o fato.

Elas divergem por rede, por retry, por consumidor atrasado e — o caso que mais dói —
por **parceiro que envia em lote com atraso**. O PSP que manda as confirmações da noite
às 6h da manhã produz eventos com event time de ontem chegando hoje.

Consequências que não são teóricas:

- **Evento fora de ordem** é normal, não é bug. Se o estorno chega antes do débito, o
  processador precisa lidar com isso — tipicamente aceitando o estorno em estado
  pendente até o débito aparecer, e não rejeitando.
- **Fechamento por janela** (o TPV do dia) precisa decidir até quando espera por
  retardatários, e o que faz com quem chega depois. Essa decisão é de negócio, não de
  engenharia, e precisa estar escrita.
- **Timestamp do evento é do produtor**, e o relógio do produtor pode estar errado.
  Kafka guarda os dois (`CreateTime` e `LogAppendTime`, configurável por tópico);
  relatório financeiro que usa o timestamp errado não fecha com a contabilidade.

## Reprocessar sem duplicar dinheiro

Você vai precisar reprocessar: bug no cálculo de tarifa, campo que faltou na projeção,
consumidor que ficou parado. E reprocessamento é a operação mais perigosa da trilha,
porque ela é um replay **intencional** de tudo aquilo contra o que o marco 05 defendeu.

Três abordagens, em ordem de segurança:

**1. Tópico sombra (o padrão seguro).** Suba um consumidor novo, com `group.id` novo,
escrevendo em tabelas/tópicos **paralelos**. Compare o resultado com o atual. Só
promova depois de bater. Nenhum efeito externo é reexecutado porque o processador
sombra não chama o PSP — ele só recalcula. É mais trabalho e é o que você faz quando o
dado é dinheiro.

**2. Reset de offset do grupo existente.** Cirúrgico e perigoso:

```bash
kafka-consumer-groups.sh --bootstrap-server ... \
  --group ledger-projector --topic payments.authorized:3 \
  --reset-offsets --to-datetime 2026-08-08T00:00:00.000 --execute
```

Requisitos inegociáveis antes de apertar: o **grupo precisa estar parado** (o comando
falha se houver membro ativo — e isso é uma proteção, não um obstáculo), o consumidor
precisa ser idempotente, e você precisa ter anotado o offset atual para poder voltar
(`--dry-run` primeiro, sempre).

**3. Versionamento do processador.** Quando a lógica mudou, rode a versão nova em
paralelo com a antiga, cada uma com seu grupo, escrevendo em destinos separados, e
compare antes de desligar a antiga. É o mesmo espírito do canary da trilha Kubernetes,
aplicado a processamento.

O que **nunca** funciona: resetar o offset de um consumidor que tem efeito externo não
idempotente e torcer. O marco 05 existe para que esta frase seja óbvia.

## Exemplo numa fintech

**Reconciliação D+1** relendo o dia inteiro é operação de rotina, não incidente: às 2h,
um job relê `payments.authorized` do dia anterior e confere contra o extrato do PSP. Ele
é, por construção, um reprocessamento — e por isso o projeto do consumidor precisa
tolerar replay desde o dia 1, não como reforma depois.

**Estorno que chega antes do débito** é o caso concreto de evento fora de ordem. Se a
chave é `accountId`, os dois estão na mesma partição e vêm em ordem de produção — mas
"ordem de produção" é a ordem em que o **seu** sistema os publicou, e o estorno pode ter
vindo de um canal diferente, com atraso diferente. O ledger precisa aceitar o estorno de
um lançamento que ainda não existe, em estado pendente, e resolver quando o par chegar.
Rejeitar é perder dinheiro do cliente.

## Hands-on

**Desafio — reprocessar um dia e provar que o saldo bate.** Este é o desafio central do
bloco de corretude, no espírito do desafio `Allocate` da trilha Go: o critério é uma
**invariante**, não uma opinião.

1. Produza **1 dia** de eventos sintéticos em `payments.authorized` — pelo menos 20.000
   eventos, 500 contas, misturando créditos, débitos e estornos, com alguns estornos
   propositalmente **antes** do seu débito.
2. Consuma com o projetor de saldo e registre o saldo final de cada conta:
   `saldo_v1`.
3. Some tudo: `SELECT sum(saldo) FROM contas`. **Guarde esse número.**
4. Reprocesse do offset zero com um grupo novo, escrevendo em `contas_sombra`.
5. **Invariantes que precisam valer, todas as três:**
   - `saldo_v1 = saldo_v2` para **cada** conta, não só no total;
   - `sum(saldo) = sum(créditos) - sum(débitos)` — a soma das partes é o todo;
   - o número de lançamentos em `contas_sombra` é igual ao de `contas`, provando que a
     idempotência não engoliu eventos legítimos.

O passo 5 é onde as implementações erram: é fácil passar no total e falhar por conta
(sinal de que o estorno fora de ordem foi tratado errado), e é fácil passar nos dois
primeiros e falhar no terceiro (sinal de que o dedupe está descartando eventos distintos
com a mesma chave).

**Complemento — a partição quente.** Faça 30% dos eventos irem para uma única conta.
Observe o lag **por partição** durante o consumo. Depois implemente **uma** das
mitigações da seção e meça de novo; escreva 5 linhas sobre o que você perdeu ao aplicá-la.

**Checagem.** (a) Por que aumentar de 6 para 12 partições quebra a ordem por conta?
(b) Lag alto numa partição e zero nas outras — diagnóstico? (c) O estorno chegou antes
do débito: rejeitar ou aceitar pendente, e por quê? (d) Qual a primeira coisa que você
confere antes de rodar `--reset-offsets --execute`?

## Principais aprendizados

- Ordem existe por partição; projete a chave para a **menor unidade que precisa de
  ordem** — quase sempre a conta, nunca a transação.
- Aumentar partições remapeia o hash e quebra a ordem por chave: é migração, não escala.
- Partição quente não tem solução sem trade-off; todas as mitigações custam ordem,
  complexidade ou dinheiro.
- Reprocessamento seguro é tópico sombra + comparação; reset de offset exige grupo
  parado, `--dry-run` e consumidor idempotente.
