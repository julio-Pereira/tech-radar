---
id: ciclo-de-vida-do-credito-e-papeis
title: "Ciclo de vida do crédito e papéis"
summary: "Um empréstimo não é uma linha numa tabela: é uma máquina de estados com dinheiro, prazo e obrigações — e quase todo bug de crédito é uma transição que ninguém pensou."
estimatedMinutes: 50
references:
  - title: "Basel Committee — Principles for the management of credit risk"
    url: https://www.bis.org/publ/bcbs75.htm
---

## O ciclo completo

Um contrato de crédito percorre: **proposta** → **análise** → **decisão** → **formalização**
(assinatura do contrato, CCB) → **desembolso** → **vigência** (parcelas sendo pagas) →
**liquidação**, **ou** — num ramo alternativo — **atraso** → **cobrança** → **renegociação** →
**baixa**/**recuperação**. Cada seta desse diagrama é uma transição que precisa estar explicitamente
prevista; um contrato que entra num estado sem transição de saída definida é, estruturalmente, um
bug esperando para acontecer.

## Produtos e suas diferenças estruturais

Crédito pessoal, consignado, financiamento, capital de giro, cartão **rotativo**, cheque especial,
antecipação, *BNPL* (*buy now, pay later*) — cada produto tem seu próprio perfil de **garantia**,
**taxa**, **prazo** e **estrutura**. A diferença mais relevante para o desenho do sistema: **limite
rotativo** (o cliente usa e paga repetidamente, sem um cronograma fixo de parcelas) × **contrato
fechado** (valor, prazo e cronograma definidos no momento da concessão, sem variação posterior) —
os dois exigem modelos de dados e de estado estruturalmente diferentes.

## Participantes do ecossistema

Além do cliente, o crédito envolve a **instituição financeira** (quem efetivamente concede e
assume o risco), possivelmente um **correspondente** (origina em nome da instituição, sem assumir
risco), uma **sociedade de crédito** (um tipo específico de instituição com permissões próprias), e
**parceiros de dados** (fontes de informação para a decisão, marco 04) — **conferir** os tipos
exatos de instituição e o que cada um pode fazer, já que essas categorias são definidas
regulatoriamente e têm fronteiras específicas.

## Os tipos de risco presentes no ciclo

Mesmo antes de qualquer medida quantitativa (Bloco C), vale mapear onde cada tipo de risco aparece
no ciclo: **risco de crédito** (o cliente não paga — a maior parte desta trilha), **risco de
liquidez** (o banco não tem caixa na data certa — marco 10), **risco operacional** (um processo
falha — marco 10), **risco de conformidade** (uma regra não é seguida), e **risco de modelo** (o
modelo de decisão está desatualizado — marco 06). Um incidente de crédito raramente é puramente um
desses tipos isolado — geralmente é uma combinação.

## O contrato como fonte da verdade

O contrato (e sua sequência de eventos) é a **fonte da verdade** — saldo devedor, parcela atual e
qualquer outro número derivado são **consequências calculadas** a partir dele, nunca campos
independentes mantidos em paralelo. Essa disciplina é a mesma já formalizada, de forma geral, em
`arquitetura-eventos/07`: eventos são fatos imutáveis; o estado atual é sempre uma função desses
fatos, nunca uma verdade separada e potencialmente divergente.

## Estados terminais e idempotência de comando

Um contrato **liquidado** ou **baixado** é um **estado terminal** — não existe transição de saída
válida a partir dele (um evento que tentasse reabri-lo precisa ser recusado ou tratado por um
mecanismo explícito e auditado, nunca uma simples reversão silenciosa). E repetir o mesmo
**comando** (identificado pela mesma chave de idempotência) não deveria mudar o estado do contrato
mais de uma vez — a mesma disciplina de idempotência de comando já formalizada para processos de
longa duração em geral.

```diagrama
cr-ciclo
```

## Exemplo numa fintech

Um cliente decide quitar seu empréstimo antecipadamente no mesmo exato dia em que uma parcela
vence — e, por coincidência de horário, o sistema de cobrança já havia disparado o aviso de
vencimento daquela parcela antes da liquidação antecipada ser processada. O contrato, como máquina
de estados bem definida, precisa decidir qual evento prevalece (a liquidação antecipada encerra o
contrato; o aviso de cobrança, já em trânsito, não deveria gerar uma cobrança indevida depois do
encerramento).

## Hands-on

**Tutorial.** Implemente `contrato/` com estados e transições declaradas explicitamente numa
tabela.

**Desafio.** Adicione os estados de renegociação e de baixa sem quebrar nenhuma das transições já
existentes.

**Invariantes testáveis**

1. Apenas as transições **declaradas na tabela** são aceitas — verificado por propriedade sobre
   sequências de eventos geradas aleatoriamente com semente fixa.
2. Estados **terminais** (`liquidado`, `baixado`) **não têm nenhuma transição de saída** — testado
   tentando, deliberadamente, cada transição possível a partir deles.
3. Repetir o mesmo comando (mesma chave de idempotência) **não muda** o estado do contrato na
   segunda vez — verificado comparando o estado antes e depois da repetição.
4. Um evento com data **anterior** ao último evento já aplicado é **recusado** ou **reordenado**,
   conforme a regra declarada — nunca aplicado silenciosamente fora de ordem sem tratamento.
5. **Replay** de todos os eventos de um contrato, do início, reconstrói **exatamente** o mesmo
   estado atual — propriedade verificada comparando o estado reconstruído com o estado corrente.

**Complemento.** Desenhe, por escrito, o ciclo de vida do produto de crédito da sua própria
instituição (ou de um produto que você conhece bem) e marque onde ele difere deste modelo geral.

**Checagem**

1. Por que um contrato que entra num estado sem transição de saída definida é, estruturalmente, um
   bug esperando para acontecer?
2. Qual é a diferença estrutural central entre limite rotativo e contrato fechado, em termos de
   modelo de dados e de estado?
3. Por que o contrato (e sua sequência de eventos) precisa ser a única fonte da verdade, com saldo
   e parcela sempre calculados a partir dele?
4. Por que repetir o mesmo comando de contrato, identificado pela mesma chave de idempotência, não
   deveria mudar o estado mais de uma vez?

> **Reencontro — `arquitetura-eventos/07`.** O event sourcing geral daquele marco é exatamente a
> disciplina que este marco aplica ao contrato de crédito: eventos são fatos imutáveis, e o estado
> atual é sempre uma função calculada deles, nunca uma verdade mantida em paralelo.

O outbox/inbox de `arquitetura-eventos/08` é o mecanismo que, na prática, garante a idempotência de
comando exigida aqui; o desenho de estado como decisão de `system-design/07` é o mesmo raciocínio
de modelar estados e transições explicitamente, aplicado a um domínio diferente; e o mapeamento de
core bancário legado de `arquitetura-de-solucoes/03` é relevante sempre que um contrato de crédito
precisa conviver com um sistema legado que já tinha sua própria noção (possivelmente incompatível)
de "estado do contrato".

## Principais aprendizados

- Um contrato de crédito é uma máquina de estados — quase todo bug de crédito é uma transição que
  ninguém previu.
- Limite rotativo e contrato fechado exigem modelos de dados e de estado estruturalmente
  diferentes.
- O contrato é a fonte da verdade; saldo devedor e parcela são sempre consequências calculadas
  dele, nunca campos independentes.
- Estados terminais não têm transição de saída — reabrir um contrato liquidado ou baixado exige um
  mecanismo explícito e auditado, nunca uma reversão silenciosa.
- Repetir o mesmo comando, pela mesma chave de idempotência, nunca deveria mudar o estado do
  contrato mais de uma vez.
