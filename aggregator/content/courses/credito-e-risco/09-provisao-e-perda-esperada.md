---
id: provisao-e-perda-esperada
title: "Provisão e perda esperada"
summary: "Provisão é o reconhecimento antecipado de perda que ainda não aconteceu — e a mudança do modelo de perda incorrida para o de perda esperada muda quando e quanto o banco reserva."
estimatedMinutes: 70
---

## Para que serve a provisão

Quando a instituição empresta, ela sabe que parte não vai voltar — só não sabe **qual** parte. A
**provisão** reconhece **antes** essa perda provável no resultado: é uma despesa do período e uma
conta **redutora** do ativo de crédito. Sem provisão, o lucro dos meses bons é inflado e a perda
aparece de uma vez, quando o calote se confirma. Com provisão, a perda é reconhecida aos poucos,
conforme o risco aparece.

## Perda incorrida × perda esperada

O modelo histórico no Brasil foi o de **perda incorrida**: a provisão é uma porcentagem do saldo
definida pela **faixa de atraso** (quanto mais atrasado, maior a porcentagem — **conferir** a norma
e a tabela vigentes). Ele reage ao atraso que já aconteceu.

O modelo de **perda esperada** olha para a frente, em três **estágios**:

- **Estágio 1** — sem aumento significativo de risco desde a originação: provisão da perda esperada
  em **12 meses**.
- **Estágio 2** — com **aumento significativo de risco de crédito** (**SICR**): provisão da perda
  esperada pela **vida inteira** do contrato.
- **Estágio 3** — **ativo problemático** (em default, ou com sinais equivalentes): vida inteira,
  sobre um ativo já problemático.

**Conferir** a norma brasileira vigente sobre perda esperada, seu cronograma de aplicação e como ela
define estágios e gatilhos para a sua instituição.

```diagrama
cr-estagios
```

## Gatilhos, migração e cura

Os **gatilhos** de estágio são regras declaradas: atraso acima de um número de dias, queda
relevante de score desde a originação, renegociação por dificuldade financeira, setor em crise.
Quando um gatilho dispara, o contrato **migra** para um estágio pior — e a provisão sobe, porque o
horizonte passa de 12 meses para a vida inteira. A **cura** é o caminho de volta, e é mais lenta de
propósito: o contrato só volta a um estágio melhor depois de um **período de observação** declarado
sem o gatilho, para que um único pagamento em dia não desfaça um aumento de risco real.

## O cálculo da ECL

A **ECL** (*expected credit loss*) de cada contrato é PD × LGD × EAD (marco 06), com a PD do
**horizonte do estágio** e cada fluxo **descontado** a valor presente. Os parâmetros dependem de
**cenários macroeconômicos** — otimista, base, pessimista —, e a ECL final é a média ponderada pela
probabilidade de cada cenário. Os parâmetros de cada cenário são declarados de forma que a PD e a
LGD do pessimista nunca fiquem abaixo das do base; é isso, e não o nome do cenário, que garante
que o pessimista nunca dá provisão menor que o base — e é por isso que essa ordem vira teste.

## O lançamento e o fechamento

A provisão vira **lançamento** no razão: a variação da provisão do período entre a **despesa de
provisão** e a **conta redutora** do ativo — balanceado como todo lançamento. No **fechamento de
período** (`ledger-e-contabilidade/07`), o valor é calculado, lançado e o período fecha: uma
correção posterior **não edita** o período fechado; entra como lançamento no período seguinte. A
**baixa** (marco 08) consome a provisão já constituída.

```diagrama
cr-provisao-fechamento
```

## Explicar para a auditoria

O auditor pergunta "de onde vem esse número?". A resposta é um **relatório por contrato**: estágio,
gatilho que o pôs ali, PD, LGD, EAD, cenários e o valor — e a **soma do relatório é igual ao
lançamento**, ao centavo. Tudo o que é parâmetro (gatilhos, períodos de observação, ponderação de
cenários) vem de `regras.yaml`, com a fonte a conferir.

## Exemplo numa fintech

O contrato do marco 06 (EAD R$ 10.000, PD de 12 meses de 4%, LGD de 45%) está no **estágio 1**, com
provisão de **R$ 180,00**. Ele atrasa 35 dias e dispara o gatilho de SICR declarado (atraso acima
de 30 dias, valor ilustrativo): migra para o **estágio 2**, e a PD passa a ser a de vida inteira,
15% no exemplo. Sem desconto, para simplificar, a provisão vai para 0,15 × 0,45 × 10.000 =
**R$ 675,00**. No fechamento do mês, o lançamento da diferença — **R$ 495,00** de despesa de
provisão contra a redutora — aparece no razão, e o relatório de auditoria mostra o gatilho que
causou a migração.

## Hands-on

**Tutorial.** Implemente `provisao/` com estágios, gatilhos e ECL por contrato, parametrizado em
`regras.yaml`.

**Desafio.** Calibre os gatilhos de estágio sobre a carteira sintética e feche o período com o
lançamento e o relatório de auditoria.

**Invariantes testáveis**

1. A provisão de cada contrato bate com a **tabela à mão** (estágio, PD, LGD, EAD → valor).
2. A **provisão total** é a soma das provisões dos contratos.
3. **Migrar para um estágio pior nunca reduz** a provisão do contrato, com PD, LGD e EAD constantes
   (propriedade).
4. A **cura** só melhora o estágio depois do período de observação declarado.
5. O lançamento de provisão é **balanceado** e, depois do **fechamento**, não aceita edição
   retroativa — só lançamento no período seguinte.
6. Com o **cenário pessimista**, a provisão total é **≥** a do cenário base (monotonicidade).
7. O **relatório de auditoria** explica 100% do valor: a soma do relatório é igual ao lançamento.

**Complemento.** Descreva como a sua instituição define SICR, quais gatilhos usa e quem aprova a
mudança de um gatilho.

**Checagem**

1. Por que a provisão reconhece a perda antes de ela acontecer?
2. O que muda entre o estágio 1 e o estágio 2, e por que a provisão sobe?
3. Por que a cura é mais lenta que a migração?
4. Por que o cenário pessimista nunca dá provisão menor que o base?
5. O que acontece com uma correção depois do fechamento do período?
6. O que o relatório de auditoria precisa provar?

> **Reencontro — `ledger-e-contabilidade/07`.** O fechamento de período e a regra de não editar um
> período fechado estão lá; a provisão é o lançamento mais importante desse fechamento numa
> carteira de crédito.

A governança de dados sensíveis de `dados-distribuidos/13` define o que o relatório de auditoria
pode expor sobre cada contrato; os eventos imutáveis de `arquitetura-eventos/07` são o que permite
reconstruir por que um contrato estava num estágio numa data; e a governança de exceção de
`arquitetura-de-solucoes/06` é o molde para a mudança de gatilho com dono e aprovação.

## Principais aprendizados

- Provisão reconhece antes a perda provável: despesa do período e redutora do ativo.
- Perda incorrida reage ao atraso; perda esperada olha para a frente, em três estágios.
- Gatilhos migram para estágios piores; a cura só volta após o período de observação.
- ECL = PD × LGD × EAD no horizonte do estágio, descontada e ponderada por cenários.
- O lançamento fecha com o período, e o relatório de auditoria soma exatamente o lançamento.
