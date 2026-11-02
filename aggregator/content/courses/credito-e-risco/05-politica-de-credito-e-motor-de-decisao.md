---
id: politica-de-credito-e-motor-de-decisao
title: "Política de crédito e motor de decisão"
summary: "Uma decisão que você não consegue repetir e explicar é uma decisão que você não consegue defender — para o cliente, para o auditor e para si mesmo."
estimatedMinutes: 65
---

## Política em camadas

Uma política de crédito se lê em camadas, sempre na mesma ordem:

1. **Regras de corte** (*knock-outs*) — condições que recusam sem olhar mais nada: documento
   inválido, idade fora da faixa do produto, restrição grave. Baratas e explicáveis.
2. **Capacidade de pagamento** — o **comprometimento de renda** (quanto da renda já vai para
   dívidas) e a **relação parcela/renda** da nova operação, contra limites declarados.
3. **Score** — uma nota de risco, com **faixas** e ***cutoffs*** (abaixo de X, recusa).
4. **Tabela de estratégia** — o cruzamento de faixa de score com renda (ou outra dimensão) que
   devolve **limite, taxa, prazo** ou **recusa**.

A ordem importa por custo e por explicação: o *knock-out* recusa antes de qualquer consulta cara
(marco 04), e cada camada que recusa deixa um **motivo** próprio.

```diagrama
cr-politica
```

## A decisão como função pura

A decisão é uma **função pura**: recebe **(proposta, instantâneo de dados, versão da política,
data)** e devolve **(decisão, códigos de motivo)**. Nada mais entra: nem relógio do sistema, nem
"o que o *bureau* responde agora", nem configuração lida no meio do caminho. É isso que torna a
decisão **reproduzível** — a mesma entrada dá a mesma saída hoje e daqui a seis meses — e
**testável** por propriedade.

## Versão da política e o log de decisão

A política é publicada como **versão imutável** com **vigência** (`v1` vale de tal data a tal
data). Mudar um *cutoff* não é editar a `v1`: é publicar a `v2`. Cada decisão grava no **log de
decisão**, imutável: o instantâneo de entrada, a **versão** usada, a decisão e os **motivos**. Com
isso, um ***replay*** de qualquer decisão do log, com a versão registrada, reproduz decisão e
motivos — e rodar a mesma proposta com a versão nova mostra exatamente o que mudaria.

```diagrama
cr-funcao-pura
```

## Códigos de motivo e a explicação da recusa

Toda recusa traz **ao menos um código de motivo**, mapeado para um texto que o cliente entende
("comprometimento de renda acima do limite do produto"), não para uma regra interna. A explicação
de decisão automatizada é tratada em profundidade em `ml-em-producao/09`; o que este marco
acrescenta é que o código de motivo nasce **na camada que recusou**, e a decisão automatizada tem
regras próprias de revisão e explicação na LGPD (**conferir**).

## *Override* manual

Às vezes uma pessoa precisa decidir contra a política — um cliente estratégico, um erro de
cadastro evidente. O ***override*** é permitido, mas com **dupla aprovação** (quem pede não é quem
aprova) e **registro** no mesmo log, com o motivo. Um *override* sem segunda aprovação é recusado
pelo sistema, não por convenção.

## Campeã e desafiante

Para trocar de política sem apostar a carteira inteira, a política nova (**desafiante**) roda
primeiro em **modo sombra**: decide toda proposta, grava a decisão, mas **não a aplica**; a
**campeã** continua decidindo de fato. Comparar as duas sobre o mesmo fluxo mostra quantas
decisões mudariam e em que direção — a mesma disciplina de experimentação de `ml-em-producao/08`.

## Atributos proibidos e *proxies*

A política declara uma lista de **atributos proibidos** (configurável, conforme a legislação
aplicável — **conferir**). Proibir não é só "não ler o campo": uma variável fortemente
correlacionada com o atributo proibido funciona como **proxy** e reintroduz o mesmo efeito. Os dois
testes são diferentes: um de **acesso** (a função não lê o campo) e um **estatístico** (nenhuma
variável usada tem correlação acima de um limite com o atributo proibido no conjunto sintético).
A correlação é um **piso**, não uma prova: ela não pega um *proxy* não linear, nem a combinação de
duas variáveis que, juntas, revelam o atributo. Um teste mais forte treina um modelo simples que
tenta **prever o atributo proibido** a partir das variáveis que a política usa; se ele acerta bem
acima do acaso, há *proxy*, mesmo sem nenhuma correlação individual alta.

## Degradação: uma decisão de risco

Quando uma fonte cai (o *bureau* fora do ar), o motor tem três opções: **recusar**, **aprovar com
limite menor** ou **mandar para fila manual**. Essa escolha **é de risco**, não de infraestrutura
— quem a define é a área de crédito, por escrito, como parte da política versionada; o time
implementa e testa. O que nunca pode acontecer é a degradação decidida implicitamente pelo *timeout*
de uma biblioteca.

## Exemplo numa fintech

A mesma proposta, reprocessada seis meses depois com o instantâneo do log e a `v1` da política,
devolve a mesma decisão (aprovada, R$ 8.000 em 18 meses) e os mesmos motivos. Com a `v2`, mais
restritiva em comprometimento de renda, ela seria recusada com o motivo `CAP-02` — e o log mostra
as duas, lado a lado, sem que nenhuma decisão passada tenha sido alterada.

## Hands-on

**Tutorial.** Implemente `politica/` com *knock-outs*, capacidade, faixas de score e tabela de
estratégia, carregando a versão 1 de `politica/v1.yaml`, e o log de decisão.

**Desafio.** Publique a versão 2 (mais restritiva em renda) e rode campeã/desafiante em sombra
sobre a carteira sintética, com um relatório de decisões divergentes.

**Invariantes testáveis**

1. A decisão é **determinística**: a mesma entrada produz a mesma saída em N execuções.
2. **Monotonicidade**: aumentar renda ou score, com o resto igual, **nunca** piora a decisão
   (propriedade sobre propostas geradas).
3. ***Replay*** de qualquer decisão do log, com a versão registrada, reproduz decisão e motivos.
4. Toda recusa traz **≥ 1 código de motivo**, mapeado a um texto legível.
5. Nenhum **atributo proibido** é lido pela função (teste de acesso); nenhuma variável usada tem
   correlação acima do limite declarado com ele no conjunto sintético; e um modelo que tenta prever
   o atributo a partir das variáveis usadas não passa de um limite declarado acima do acaso (testes
   estatísticos).
6. Um ***override*** sem segunda aprovação é **recusado**.
7. Uma versão de política publicada é **imutável**: alterar exige publicar outra versão.
8. Com a consulta externa indisponível, a decisão segue a **regra de degradação declarada** —
   verificado por uma tabela de casos.

**Complemento.** Descreva a regra de degradação do crédito da sua instituição, quem a aprovou e
onde ela está escrita.

**Checagem**

1. Por que a decisão de crédito precisa ser uma função pura das suas entradas?
2. O que a monotonicidade protege, e por que ela é testada por propriedade?
3. Por que proibir a leitura de um atributo não basta?
4. Por que a regra de degradação é uma decisão de risco, e não de infraestrutura?
5. O que o modo sombra mostra que um teste A/B com tráfego real não mostraria sem risco?
6. Por que mudar um *cutoff* exige uma nova versão da política?

> **Reencontro — `ml-em-producao/09` e `/08`.** A explicação de decisão automatizada e a
> experimentação com campeã e desafiante estão lá; aqui elas se aplicam à política de crédito,
> com o código de motivo nascendo na camada que recusou.

A governança de exceções com prazo e dono de `arquitetura-de-solucoes/06` é o molde do *override*
com dupla aprovação; e o antifraude em tempo real de `system-design/12` usa a mesma arquitetura de
decisão síncrona com orçamento e degradação declarada que o motor de crédito segue.

## Principais aprendizados

- A política se lê em camadas — *knock-outs*, capacidade, score, tabela de estratégia — e cada
  camada que recusa deixa seu motivo.
- A decisão é uma função pura de (proposta, instantâneo, versão, data): reproduzível e testável.
- A política é versionada e imutável; o log guarda entrada, versão, decisão e motivos.
- *Override* exige dupla aprovação; política nova roda em sombra antes de decidir.
- Atributo proibido se testa por acesso e por correlação; degradação é decisão de risco, escrita.
