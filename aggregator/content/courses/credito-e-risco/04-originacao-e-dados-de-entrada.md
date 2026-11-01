---
id: originacao-e-dados-de-entrada
title: "Originação e dados de entrada"
summary: "A decisão de crédito é tão boa quanto os dados que entram — e dado de entrada tem custo, latência, atraso e falha, todos de decisão de engenharia."
estimatedMinutes: 50
---

## A proposta e o seu contexto

Uma **proposta** não é só "cliente quer R$ 10.000": ela chega com **canal** (aplicativo,
correspondente, parceiro), **valor**, **prazo** e **finalidade** declarada. Cada um desses campos
muda a decisão — o mesmo valor pedido num canal com histórico alto de fraude, ou para uma
finalidade que a política não atende, não é a mesma proposta. A proposta ganha um **identificador
idempotente** desde o primeiro clique: o cliente que aperta "enviar" duas vezes, ou o parceiro que
reenvia por *timeout*, gera **uma** proposta, não duas análises (e duas consultas pagas) para o
mesmo pedido.

## As fontes de dado

A decisão se apoia em várias fontes, com perfis muito diferentes:

- **Cadastro** e **renda declarada** — barato e imediato, mas é o que o cliente diz.
- **Renda comprovada** e **comportamento interno** (movimentação de conta, histórico de pagamento
  na própria instituição) — barato, frequente, mas só existe para quem já é cliente.
- **Dados de Open Finance** — renda e comportamento vindos de outras instituições, **com
  consentimento válido e para a finalidade declarada** (`engenharia-de-dados/03` trata o
  consentimento como dado; aqui ele é condição de entrada). Sem consentimento ativo cobrindo a
  finalidade "análise de crédito", o dado **não entra**, mesmo que já esteja armazenado.
- ***Bureaus*** e **SCR** — histórico de crédito no mercado; a consulta exige autorização do
  cliente e segue regras próprias, assim como o Cadastro Positivo (**conferir** as regras
  vigentes de consulta, autorização e uso).
- **Garantias e documentos** — o que sustenta o contrato se ele falhar.

## Custo por consulta e a consulta em cascata

Consultas externas **custam dinheiro** e **custam tempo**. Consultar tudo para toda proposta é a
forma mais cara e mais lenta de decidir — e, para boa parte das propostas, inútil: um caso
claramente bom ou claramente ruim já está decidido com o dado interno. A **consulta em cascata**
ordena as fontes do mais barato ao mais caro e só desce um degrau quando a **pré-decisão** cai numa
**faixa de dúvida**. O orçamento é duplo: **custo** máximo por proposta e **tempo** máximo até a
resposta.

```diagrama
cr-cascata
```

## Qualidade e frescor do dado

Todo dado de entrada pode chegar **defasado** (a renda de Open Finance é de 40 dias atrás),
**faltando** (o *bureau* não tem registro), ou **divergente** entre fontes (a renda declarada é o
dobro da comprovada). A regra de tratamento é **declarada por campo, antes**: tratar como
ausente, recusar a proposta, pedir um documento, ou usar a fonte mais conservadora. O erro clássico
é a regra implícita no código — um `0` no lugar de "não sei", que o *score* lê como "renda zero" e
recusa um bom cliente, ou o contrário.

## Fraude na originação

Identidade sintética, propostas em massa a partir do mesmo dispositivo e documentos adulterados
aparecem **na originação**. Esta trilha não reensina antifraude (`seguranca-aplicacao/14` é o
dono); o ponto de contato é que a esteira de crédito **chama** a verificação antifraude como uma
etapa com orçamento próprio, e trata a resposta "suspeita" como um motivo de recusa ou de fila
manual, nunca como um erro técnico que derruba a proposta.

## Minimização, finalidade e o instantâneo para a auditoria

Guardar o dado de entrada é necessário para **reproduzir** a decisão depois (marco 05) — mas guarde
o **mínimo** necessário e só para a **finalidade** declarada (`engenharia-de-dados/10`). O que se
guarda é um **instantâneo**: os valores exatos que a função de decisão viu, com a data da consulta.
Guardar só uma **referência** ("consultamos o *bureau* às 14h") não basta — a fonte muda, e seis
meses depois a mesma consulta devolveria outra coisa.

## *Cache* e tempo de vida da consulta

Uma consulta paga, repetida dez minutos depois para a mesma pessoa (o cliente que ajusta o valor
e reenvia), não deveria custar de novo. Um ***cache*** com **TTL** declarado por fonte resolve —
com o cuidado de que o TTL reflita o **frescor** aceitável para aquela fonte, não a conveniência:
renda de Open Finance pode valer dias; uma consulta de restrição cadastral, só horas.

## Exemplo numa fintech

O *bureau* responde em 4 s e custa R$ 0,80 por consulta. A política do `fin-lend` consulta primeiro
o dado interno e o de Open Finance; com eles, uma pré-decisão classifica 70% das propostas como
claramente aprovadas ou claramente recusadas. Só os 30% na **faixa de dúvida** chamam o *bureau* —
o custo médio por proposta cai de R$ 0,80 para R$ 0,24, e o tempo médio cai junto. Quando o
*bureau* passa de 4 s para 9 s, o orçamento de tempo de 6 s cancela a chamada pelo contexto, e a
proposta segue a regra declarada para "*bureau* indisponível" (marco 05).

## Hands-on

**Tutorial.** Use `carteira/` para gerar propostas sintéticas e implemente `entrada/`, que consulta
fontes simuladas (interno, Open Finance, *bureau*) com latência, custo e taxa de falha
configuráveis.

**Desafio.** Implemente a política de consulta em cascata com orçamento de custo e de tempo por
proposta, e meça custo e taxa de decisão correta contra a estratégia "consultar sempre tudo".

**Invariantes testáveis**

1. Um **campo faltante** segue a **regra declarada** para aquele campo — verificado por uma tabela
   de casos (ausente, recusa, pedido de documento, fonte mais conservadora).
2. O **custo médio por proposta** da cascata é **≤** o da consulta sempre-tudo no conjunto
   sintético, sem piorar a taxa de decisão correta além de um limite declarado.
3. Uma consulta repetida **dentro do TTL** usa o *cache* e **não** gera custo.
4. O **instantâneo** de dados guardado junto da decisão é **suficiente para reproduzi-la** — o
   teste de *replay* do marco 05 roda sobre ele, sem chamar nenhuma fonte.
5. Uma fonte lenta **não estoura** o orçamento total de tempo: a chamada é cancelada pelo contexto
   (`concorrencia-e-recursos/06`) e a proposta segue a regra de degradação.
6. Dado de Open Finance **sem consentimento válido** para a finalidade **não entra** na decisão —
   teste de ausência, com o dado presente no armazenamento.

**Complemento.** Liste as fontes de dado do crédito da sua instituição, o custo e a latência de
cada uma, e em que ordem elas são consultadas hoje.

**Checagem**

1. Por que consultar todas as fontes para toda proposta é, em geral, a pior estratégia?
2. Por que a regra para um campo faltante precisa ser declarada antes, e não decidida no código?
3. Por que guardar uma referência à consulta não basta para reproduzir a decisão?
4. O que define o TTL certo do *cache* de uma fonte?

> **Reencontro — `engenharia-de-dados/02` e `/03`.** A ingestão de APIs de terceiros com limite de
> taxa e o consentimento como dado são exatamente a base sobre a qual a entrada do crédito se
> apoia; aqui eles entram como condição para decidir.

A detecção de fraude e abuso de `seguranca-aplicacao/14` é a etapa que a esteira chama, não algo
que este marco reimplementa; a minimização e a finalidade de `engenharia-de-dados/10` definem o
que o instantâneo pode guardar; e o cancelamento por contexto de `concorrencia-e-recursos/06` é o
mecanismo que impede uma fonte lenta de prender a proposta inteira.

## Principais aprendizados

- A proposta tem identificador idempotente desde o primeiro envio: reenvio não gera nova análise
  nem nova consulta paga.
- Fontes de dado diferem em custo, latência, frescor e cobertura; a cascata consulta o caro só na
  faixa de dúvida.
- A regra para dado faltante, defasado ou divergente é declarada por campo, antes.
- Dado sem consentimento válido para a finalidade não entra na decisão, mesmo armazenado.
- A decisão guarda um instantâneo mínimo do que viu, não uma referência à fonte.
