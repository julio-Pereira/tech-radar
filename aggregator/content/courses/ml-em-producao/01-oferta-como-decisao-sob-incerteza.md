---
id: oferta-como-decisao
title: "Oferta como decisão sob incerteza"
summary: "Antes de treinar, defina a decisão, a métrica de negócio e o baseline sem ML que o modelo precisa superar."
estimatedMinutes: 60
references:
  - title: "Rules of Machine Learning (Google)"
    url: https://developers.google.com/machine-learning/guides/rules-of-ml
---

## A decisão vem antes do modelo

"Vamos usar ML para melhorar as ofertas" não é uma decisão — é uma intenção. A decisão real tem forma
precisa: *dado um cliente, num instante, escolher qual oferta apresentar (ou nenhuma), dentre um conjunto
de candidatas elegíveis*. Só depois de escrever essa frase com precisão é possível perguntar o que um
modelo precisaria prever para apoiá-la, e só então vale a pena perguntar se vale a pena treinar um modelo.

## Métrica de negócio × métrica de modelo

A métrica de negócio é o que a empresa quer ("receita incremental de ofertas contratadas", "clientes
engajados sem aumentar reclamação"). A métrica de modelo (AUC, precisão no topo-k, calibração) é um proxy
— útil porque é mensurável offline antes de qualquer oferta real ser mostrada, mas um proxy continua sendo
um proxy: um modelo pode melhorar a métrica de modelo e não mover a métrica de negócio nem um pouco, se o
proxy estiver mal escolhido ou se o efeito já estivesse saturado pelo baseline.

## Custo de erro assimétrico

Mostrar a oferta errada custa diferente de deixar de mostrar a certa. Incomodar um cliente com uma oferta
irrelevante tem um custo (atrito, descrédito, eventualmente *opt-out* de comunicação); deixar de oferecer
algo que o cliente contrataria tem outro custo (receita perdida). Esses custos raramente são iguais, e a
matriz de custo — não a acurácia genérica — é o que deveria guiar onde colocar o limiar de decisão.

## O baseline por regras: a barra que precisa ser superada

Antes de qualquer modelo, existe (ou deveria existir) uma política simples: regras de negócio óbvias
("quem já tem o produto não recebe a oferta dele de novo", "ordenar por tempo desde a última oferta
recusada"). Esse baseline frequentemente já captura a maior parte do valor disponível — e é a régua contra
a qual todo modelo subsequente desta trilha vai ser comparado. Um modelo que não supera o baseline por uma
margem declarada não é promovido (marco 04); isso não é pessimismo, é a pergunta que evita o antipadrão
mais caro da trilha: "ML porque sim" (marco 10).

## Quando ML não vale

Volume baixo demais para treinar e validar com confiança estatística, custo de manter o sistema de ML maior
que o ganho esperado sobre o baseline, ou um problema onde a regra simples já captura o essencial — em
qualquer um desses casos, a resposta correta de engenharia é não construir o sistema de ML. Essa pergunta
não se faz uma vez; ela se repete sempre que o baseline muda ou o contexto de negócio muda.

## O ciclo de vida do sistema, e o *policy gate* antes do modelo

O sistema completo desta trilha percorre: dados → features → treino → registry → serving →
monitoramento → feedback — cada bloco desta trilha cobre um trecho desse ciclo. Mas antes de qualquer
modelo ranquear qualquer coisa, todo candidato passa por um **policy gate**: consentimento válido para a
finalidade de oferta, elegibilidade (vinda de um motor de risco/política que já existe, fora do escopo
desta trilha) e respeito a um limite de frequência de contato. O modelo nunca vê, e nunca pode promover,
um candidato que o *policy gate* já rejeitou.

## Restrições regulatórias em visão geral (conferir o texto vigente)

Finalidade do consentimento, direito a revisão de decisão automatizada e normas de defesa do consumidor
todas tocam esta trilha — cada uma é tratada com profundidade no marco correspondente (03, 09, 10). Aqui
cabe apenas o aviso: nenhuma afirmação normativa nesta trilha deve ser tratada como texto definitivo;
confira a fonte vigente antes de implementar qualquer decisão real sobre ela.

> **Reencontro — `system-design/12`, `go-fintech/05` e `engenharia-de-dados/03` (trilha planejada).**
> A arquitetura de decisão síncrona com orçamento e fallback (marco 06 desta trilha) retoma o mesmo
> vocabulário do caso de antifraude em tempo real. O baseline por regras compartilha a ideia de
> `go-fintech/05` (decisão síncrona simples antes de qualquer modelo). E o *policy gate* aplicado aqui é a
> mesma disciplina de consentimento como dado que `engenharia-de-dados/03` ensina — referenciada aqui como
> trilha planejada até sua publicação.

## Exemplo numa fintech

"Oferecer antecipação de recebíveis a quem recebe salário de forma irregular" parece um problema de ML
interessante — mas uma regra simples ("renda mensal com desvio acima de X nos últimos 3 meses, mais
elegibilidade aprovada") já resolve uma fração considerável do valor disponível, de forma ilustrativa.
O `fin-offers` registra esse baseline antes de treinar qualquer modelo, exatamente para medir se o ganho
do modelo justifica o custo de operá-lo.

## Hands-on

**Tutorial.** Implemente o baseline por regras e um *harness* de avaliação offline sobre o `sim-clientes`
(o simulador com verdade-base desta trilha, detalhado no marco 02).

**Desafio.** Construa a matriz de custo (oferta errada × oferta perdida) e derive o limiar de decisão que
ela implica.

**Invariantes testáveis**

1. **Determinismo**: a mesma seed do `sim-clientes` produz exatamente a mesma métrica do baseline em
   execuções repetidas.
2. O baseline registra **a barra a superar** — persistida de forma que o marco 04 possa comparar contra
   ela automaticamente, não de memória.
3. Mudar a matriz de custo move o limiar ótimo **na direção esperada** (teste de sensibilidade: mais custo
   em deixar passar a oferta certa move o limiar para baixo, e vice-versa).
4. Uma oferta fora da finalidade do consentimento do candidato **nunca** aparece na lista de candidatas —
   verificado por um teste exaustivo do *policy gate* sobre todas as combinações de finalidade simuladas.

**Complemento.** Estime, com os dados do `sim-clientes` (que conhece o efeito real da oferta), o valor
máximo que um modelo perfeito agregaria sobre o baseline — o teto teórico que nenhum modelo real vai
alcançar, mas que ajuda a calibrar expectativa.

**Checagem**

1. Por que uma métrica de modelo (AUC) pode melhorar sem que a métrica de negócio se mova?
2. O que faz o custo de mostrar a oferta errada ser assimétrico ao custo de deixar de mostrar a certa?
3. Em que condições a resposta correta é não construir o sistema de ML?
4. O que o *policy gate* garante que o modelo, por construção, nunca pode violar?

## Principais aprendizados

- A decisão precisa ser definida com precisão antes do modelo — "melhorar ofertas com ML" não é uma
  decisão, é uma intenção.
- Métrica de modelo é proxy de métrica de negócio; um ganho no proxy não garante ganho no negócio.
- O custo de erro é assimétrico entre os dois tipos de erro possíveis, e a matriz de custo deveria guiar o
  limiar de decisão, não uma acurácia genérica.
- O baseline por regras é a barra que todo modelo subsequente precisa superar — e às vezes a resposta
  correta é não superar baseline algum, porque ML não vale para aquele problema.
- O *policy gate* (consentimento, finalidade, elegibilidade, frequência) roda antes do modelo e é
  inviolável por construção, não por convenção.
