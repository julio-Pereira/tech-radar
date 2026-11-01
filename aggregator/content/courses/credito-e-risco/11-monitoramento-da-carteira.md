---
id: monitoramento-da-carteira
title: "Monitoramento da carteira"
summary: "A carteira não quebra de uma vez: ela envelhece, e quem lê vintages e migrações vê o problema meses antes do balanço."
estimatedMinutes: 50
---

## *Vintage*: a curva de cada safra

Uma **safra** (*vintage*) é o conjunto de contratos originados num mesmo mês. A **curva de vintage**
mostra a inadimplência acumulada de cada safra em função da **idade** — aos 1, 2, 3 meses de vida.
Comparar safras **na mesma idade** separa o efeito da população que entrou do efeito do tempo: se a
safra de março, aos 3 meses, tem inadimplência muito acima da de dezembro aos 3 meses, algo mudou
na **originação** — muito antes de o total da carteira mostrar qualquer coisa.

```diagrama
cr-vintage
```

## *Roll rate*: a matriz de migração

A **matriz de migração** (*roll rate*) mostra, de um mês para o outro, que fração dos contratos de
cada faixa de atraso foi para cada faixa. Cada **linha soma 1** — todo contrato está em alguma faixa
no mês seguinte:

| De \ Para | em dia | 1–30 | 31–60 | 61–90 | > 90 |
| --- | ---: | ---: | ---: | ---: | ---: |
| em dia | 0,95 | 0,05 | — | — | — |
| 1–30 | 0,40 | 0,35 | 0,25 | — | — |
| 31–60 | 0,15 | 0,10 | 0,35 | 0,40 | — |
| 61–90 | 0,05 | 0,05 | 0,10 | — | 0,80 |

*(dados ilustrativos)* A leitura útil é a diagonal para a direita: de 31–60, 40% rolam para 61–90 no
mês seguinte. Quando essa fração sobe, a provisão (marco 09) e a cobrança (marco 08) vão sentir
semanas depois.

## Sinais de alerta antecipado

Antes do atraso, há sinais: **queda de renda** nos dados de entrada atualizados, **aumento do uso do
limite** (quem vai inadimplir usa o limite antes — marco 07), mudança de comportamento de pagamento
(passar a pagar o mínimo), **concentração** crescente. Cada sinal é uma métrica com **limiar** e
**dono**, ligada ao *drift* que `ml-em-producao/07` monitora no modelo.

## Apetite a risco

O **apetite a risco** é a lista de limites que a instituição aceita — inadimplência máxima por
safra, concentração máxima por setor, PSI máximo da população — com **gatilhos** e **quem escala**.
Um limite estourado gera um **alerta com dono e prazo**, o mesmo padrão de exceção com dono e prazo
de `lideranca-tecnica/11`: não é um número vermelho num painel, é uma tarefa com responsável.

## O relatório *as-of*

Relatório de risco é um **pipeline de dados** (`engenharia-de-dados/08`): ele lê a carteira **numa
data de corte** (*as-of*) e precisa ser **reproduzível** — rodar o relatório de 31 de março hoje, ou
daqui a um ano, dá o mesmo resultado, porque lê o estado da carteira **naquela data**, não o de
agora. O relatório só muda quando o **dado** daquela data muda (uma correção lançada), e a soma do
saldo por faixa precisa bater com o **saldo total** da carteira e com o **razão**.

## Relatório regulatório e leitura de ruído

Parte do monitoramento vira relatório regulatório, como o envio ao **SCR** (**conferir** formato,
prazos e responsabilidades vigentes). E toda curva precisa de cuidado com **ruído**: uma safra
pequena (um canal novo com 80 contratos) produz uma curva que oscila muito; ela é **marcada como não
conclusiva** abaixo de um tamanho mínimo declarado, em vez de exibida como se fosse sinal.

## Exemplo numa fintech

A safra de março do `fin-lend` tem, aos 3 meses, inadimplência de **2,8%**; a de dezembro, na mesma
idade, tinha **2,0%** — **40% acima**. O total da carteira mal se moveu, porque as safras antigas
continuam boas. O relatório *as-of* mostra que o score médio na originação de março caiu e que um
canal parceiro novo trouxe 30% das propostas. A política `v2`, mais restritiva nesse canal, entra
em sombra (marco 05) e o alerta de apetite abre uma tarefa com dono e prazo.

## Hands-on

**Tutorial.** Em `carteira/`, calcule a curva de vintage e a matriz de migração sobre os 36 meses
sintéticos.

**Desafio.** Construa o painel de alerta antecipado e a política de gatilhos do apetite a risco.

**Invariantes testáveis**

1. Vintage e matriz de migração batem com a **tabela à mão** de um recorte da carteira.
2. Cada **linha** da matriz de migração **soma 1** (propriedade).
3. O relatório *as-of* é **idêntico** em duas execuções e muda **só** quando o dado daquela data
   muda.
4. A soma do saldo por faixa é igual ao saldo total da carteira, que é igual ao saldo no razão
   (reconciliação).
5. Um limite de apetite estourado gera um alerta com **dono e prazo**.
6. Uma safra com amostra abaixo do mínimo é **marcada como não conclusiva** em vez de mostrar uma
   curva enganosa.

**Complemento.** Descreva os relatórios de carteira que o comitê de crédito da sua instituição lê, e
com que antecedência eles mostram um problema.

**Checagem**

1. Por que comparar safras na mesma idade, e não no mesmo mês do calendário?
2. O que significa uma linha da matriz de migração somar 1?
3. Por que o relatório *as-of* precisa ser reproduzível?
4. O que fazer com a curva de uma safra pequena?

> **Reencontro — `ml-em-producao/07`.** O drift do modelo e os sinais de alerta da carteira olham o
> mesmo fenômeno de dois lados: lá, a entrada do modelo mudou; aqui, a safra que entrou se comporta
> diferente.

A qualidade de dados de `engenharia-de-dados/08` e a linhagem de `engenharia-de-dados/09` são o que
torna o relatório *as-of* confiável e explicável; o orçamento de erro de `observabilidade/12` é o
molde dos limites do apetite com gatilho; e a exceção com dono e prazo de `lideranca-tecnica/11` é o
formato do alerta de apetite estourado.

## Principais aprendizados

- Vintage compara safras na mesma idade e mostra problemas de originação meses antes do total.
- A matriz de migração mostra quanto rola de faixa em faixa; cada linha soma 1.
- Sinais antecipados (renda, uso do limite, pagamento mínimo) têm limiar e dono.
- O apetite a risco é uma lista de limites com gatilho e quem escala.
- O relatório *as-of* é reproduzível, reconcilia com o razão e marca safra pequena como não
  conclusiva.
