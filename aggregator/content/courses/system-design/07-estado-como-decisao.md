---
id: estado-como-decisao
title: "Estado como decisão"
summary: "Todo dado tem um dono, uma fonte da verdade e uma consistência escolhida por operação — e essa escolha é de produto, não de infraestrutura. Sharding como decisão por número."
estimatedMinutes: 60
references:
  - title: "Designing Data-Intensive Applications"
    url: https://dataintensive.net/
---

## Classificar o estado antes de armazená-lo

Nem todo dado é igual, e tratá-los como se fossem produz desenho ruim: **fonte da verdade** (o
lugar onde o fato nasce — o lançamento no ledger), **derivado** (calculado a partir da fonte — o
extrato, a posição consolidada), **cache** (cópia descartável com TTL, nunca fonte de nada), **de
sessão** (vive enquanto a interação dura) e **efêmero** (existe só durante o processamento de uma
requisição, nunca persistido). Confundir derivado com fonte é o erro mais caro: se o extrato é
tratado como se fosse a verdade, uma divergência entre ele e o ledger vira incidente de "qual está
certo" em vez de "a projeção está atrasada, como esperado".

## Razão leitura/escrita, chave quente, CQRS como decisão

A **razão leitura/escrita** de um dado decide muita coisa: saldo é lido centenas de vezes para cada
vez que é escrito — isso favorece cache agressivo na leitura e escrita cuidadosa (`CHECK`,
`FOR UPDATE`) na fonte. **Chave quente**: uma conta, um merchant, um tenant que concentra
desproporcionalmente o tráfego — o mesmo *celebrity problem* que aparece em sharding de banco e em
particionamento de fila, e a saída é sempre a mesma família de técnicas (chave composta, réplica
dedicada, tratamento como caso especial declarado).

**CQRS** não é "sempre separe leitura de escrita" — é uma decisão: quando o modelo de leitura
precisa ser otimizado de um jeito que o modelo de escrita não suporta bem (um extrato que agrega
e ordena de forma diferente do lançamento individual), uma projeção separada ganha. Quando os dois
modelos são parecidos, CQRS só adiciona complexidade sem ganho.

## Localidade de dado e multi-tenant

**Localidade**: onde o dado fisicamente mora decide latência e, em fintech, residência regulatória
— alguns dados precisam ficar numa jurisdição específica, o que é uma restrição (marco 01), não uma
preferência de performance. **Multi-tenant**: schema compartilhado com coluna `tenant_id` (barato,
isolamento fraco), schema por tenant (isolamento melhor, mais operação), ou base por tenant
(isolamento forte, caro de operar em escala) — a escolha depende de quantos tenants, quão
sensível o dado de cada um é, e se existe requisito de isolamento regulatório por tenant.

## Sharding como decisão por número, não por medo

`dados-distribuidos/03` já ensinou o mecanismo — chave de shard, hash consistente, os dois problemas
difíceis (índice secundário, transação cross-shard). O que esta trilha acrescenta é a **decisão**:
shardar quando a taxa de escrita sustentável **medida** do store atual, com margem de segurança,
está abaixo da taxa de crescimento projetada — não antes, por medo hipotético, e não depois, quando
o sistema já está saturado em produção. A resposta "precisa shardar?" é literalmente uma função do
limiar medido e do número atual: abaixo do limiar, não; acima, sim — e a decisão muda exatamente no
ponto de cruzamento, não é uma zona cinzenta de opinião.

> **Reencontro — `dados-distribuidos/03` e `dados-distribuidos/06`.** O mecanismo de
> particionamento e os dois problemas difíceis são daquele marco; aqui é só o **quando**, guiado
> por número. `/06` já tratou "qual store serve a forma da query" — aqui o critério extra é a
> consistência que a operação exige, a mesma régua de `arquitetura-eventos/06` para CQRS.

## Exemplo numa fintech

"Saldo disponível" é fonte, derivado ou cache? A resposta honesta: **depende da operação**. Para a
decisão de autorizar um débito, o saldo disponível precisa ser lido com garantia de recência — ali
ele se comporta como fonte da verdade (ou algo com a mesma garantia). Para exibir no app numa tela
de "meus cartões" junto com outras informações, um valor com alguns segundos de atraso é aceitável
— ali ele pode vir de cache. É o **mesmo dado**, duas classificações diferentes, conforme a
operação que o consome — exatamente o motivo pelo qual "qual é a consistência do nosso saldo" é a
pergunta errada, e "qual é a consistência que **esta** leitura de saldo precisa" é a certa.

## Hands-on

**Tutorial.** Produza `STATE-MAP.md` do `fin-platform`: para cada dado relevante, dono, fonte da
verdade, classificação de consistência por operação que o consome, e RPO. Escreva um validador que
lê o mapa como dado estruturado e falha se qualquer linha estiver incompleta.

**Desafio.** Use `capacity.yaml` (marco 02) e a taxa de escrita sustentável medida do `fin-store`
(se você fez `dados-distribuidos`) ou um número hipotético declarado como premissa, para responder
por escrito: "este dado precisa shardar?" — com o limiar explícito que decide a resposta.

**Invariantes testáveis**

1. Todo dado do `STATE-MAP.md` tem dono, consistência e RPO preenchidos, ou o validador falha.
2. A resposta de "precisa shardar?" inverte **exatamente** no limiar declarado — um teste de
   fronteira confirma que um valor logo abaixo do limiar responde "não" e logo acima responde "sim".
3. Nenhum dado do mapa tem dois donos simultâneos — verificado pelo validador.
4. Pelo menos uma linha do mapa documenta explicitamente um dado que é "derivado" e nomeia sua
   fonte da verdade.

**Complemento.** Projete o que muda no `STATE-MAP.md` se o fator de pico do `capacity.yaml`
dobrar: quais dados cruzam o limiar de sharding que antes não cruzavam?

**Checagem**

1. Por que confundir dado derivado com fonte da verdade é o erro mais caro de classificação de
   estado?
2. Por que "saldo disponível" pode ser fonte, derivado ou cache a depender da operação que o
   consome?
3. O que decide se vale a pena introduzir CQRS para um dado específico?
4. Qual é o critério numérico que decide "precisa shardar agora?"

## Principais aprendizados

- Todo dado tem um dono, uma fonte da verdade e uma consistência escolhida **por operação** — a
  classificação não é uma propriedade fixa do dado, é uma decisão de produto por uso.
- Confundir derivado com fonte transforma "a projeção está atrasada, como esperado" em incidente
  de "qual versão está certa".
- CQRS vale quando o modelo de leitura precisa de otimização que o de escrita não suporta bem —
  não é padrão a aplicar por default.
- Sharding é decisão por número: taxa de escrita sustentável medida, com margem, contra a taxa de
  crescimento projetada — a resposta muda exatamente no limiar, não numa zona de opinião.
- Chave quente (celebrity problem) aparece em banco, fila e qualquer particionamento — a família de
  soluções é sempre a mesma: chave composta, réplica dedicada, ou caso especial declarado.
