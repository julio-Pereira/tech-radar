---
id: custo-da-plataforma
title: "Custo e FinOps da plataforma"
summary: "Se o custo não tem dono, ninguém o reduz — e se a plataforma não mostra o custo de cada decisão, ela empurra a conta para quem não escolheu."
estimatedMinutes: 55
references:
  - title: "FinOps Foundation — framework"
    url: https://www.finops.org/framework/
---

## Custo unitário

Custo **por ambiente**, **por serviço**, **por minuto de build**, **por pedido atendido** — um
custo unitário claro é o que permite comparar, de forma significativa, o custo de operar algo
pequeno contra algo grande, em vez de só olhar o total absoluto, que não diz nada sobre eficiência.

## *Showback* × *chargeback*, e o efeito comportamental

***Showback***: mostrar o custo a cada equipe, sem cobrar de fato (o orçamento continua
centralizado). ***Chargeback***: cobrar de fato, do orçamento da equipe que consumiu. O efeito
comportamental é diferente: *showback* educa, sem forçar mudança imediata de comportamento;
*chargeback* cria incentivo financeiro direto, mas exige maturidade organizacional (processos de
orçamento por equipe) que nem toda empresa tem pronta.

## Alocação por dono e por etiqueta

Usando o catálogo (marco 03) e as etiquetas obrigatórias (marco 05), o custo de cada recurso é
**alocado** ao dono real — não a uma categoria genérica de "infraestrutura", que esconde quem
efetivamente está consumindo o quê.

## Custo compartilhado, e regras de rateio

Recursos usados por múltiplas equipes (um cluster compartilhado, uma ferramenta de observabilidade
central) precisam de **regras de rateio** explícitas — proporcional a uso medido, dividido
igualmente, ou outro critério — declaradas antes da disputa sobre "por que estou pagando tanto por
algo que uso pouco" acontecer.

## Custo sem dono como indicador

Custo que não pode ser atribuído a nenhum dono específico (porque a etiqueta está ausente, ou
porque o recurso é genuinamente compartilhado sem regra de rateio definida) deveria aparecer como
um **balde próprio**, visível — não diluído silenciosamente dentro do custo total, onde ninguém o
nota nem o investiga.

```diagrama
ep-custo
```

## Cotas e orçamentos como freio

Um orçamento com alerta (não só um limite rígido que bloqueia sem aviso) é o freio prático mais
comum: avisar **antes** do limite ser excedido dá tempo para uma equipe ajustar o próprio
consumo, em vez de descobrir o problema só quando já é tarde.

## Recursos ociosos/zumbis

A mesma ideia de **recurso zumbi** do marco 05, aqui no contexto específico de custo: um recurso
pago e ocioso é dinheiro literalmente desperdiçado, e detectar isso ativamente (não esperar a
fatura mensal revelar) é parte da disciplina de FinOps.

## Anomalias de custo

Um aumento súbito de custo, fora do padrão histórico, merece investigação **automática** — a mesma
disciplina de detecção de anomalia usada em qualquer métrica de produção, aplicada a gasto.

## O custo e o retorno da própria equipe de plataforma

Honestidade sobre o que se mede e o que não: o **custo** da equipe de plataforma em si (salários,
ferramentas) é geralmente fácil de medir; o **retorno** (tempo economizado, risco evitado) é mais
difícil de quantificar com precisão — este marco não finge que essa dificuldade não existe.

## FinOps em uma página (**confira** a estrutura vigente)

O ciclo informar → otimizar → operar resume a disciplina de FinOps — **confira** a estrutura
exata vigente antes de citar como referência fixa, porque o framework evolui.

## Exemplo numa fintech

Um ambiente de teste de carga, criado para um teste pontual, fica **ligado o fim de semana inteiro**
sem que ninguém desligue — e termina custando mais naquele período do que a produção real do
serviço que estava sendo testado. O *showback* mostra isso ao dono do ambiente na segunda-feira; se
o ambiente tivesse um TTL configurado (marco 05), o problema simplesmente não teria ocorrido.

## Hands-on

**Tutorial.** Construa `custo/` com uma fatura **sintética** e a alocação por dono.

**Desafio.** Implemente o rateio do custo compartilhado e a detecção de zumbis.

**Invariantes testáveis**

1. O **custo alocado soma o custo total** — conservação exata, sem arredondamento perdido ou
   dinheiro "desaparecido" na soma.
2. As proporções de rateio **somam exatamente 1**, e o resultado da alocação é **determinístico**
   para a mesma entrada.
3. Custo sem etiqueta ou sem dono aparece como **balde próprio** no relatório, destacado
   explicitamente, não misturado ao total.
4. Um **recurso zumbi plantado** deliberadamente (ocioso, sem uso recente) é **encontrado** pela
   detecção.
5. O alerta de orçamento **dispara** com os dados sintéticos de teste acima do limite, e **não
   dispara** com dados abaixo do limite — os dois casos testados.

**Complemento.** Estime o custo mensal por serviço, num desenho típico do `fin-platform`, usando o
modelo de custo unitário deste marco.

**Checagem**

1. Qual é a diferença comportamental entre *showback* e *chargeback*?
2. Por que custo sem dono deveria aparecer como um balde próprio visível, em vez de diluído no
   total?
3. Por que um orçamento com alerta é preferível a um limite rígido sem aviso prévio?
4. Por que este marco é honesto sobre a dificuldade de medir o retorno da equipe de plataforma,
   mesmo sendo fácil medir o custo dela?

> **Reencontro — `kubernetes/14`; `observabilidade/16`; `kubernetes/05`; `system-design/02`.** A
> decisão de custo e multi-tenancy de `kubernetes/14` ("medir por dono") é o fundamento direto da
> alocação deste marco. Custo e cardinalidade de `observabilidade/16` é a mesma disciplina de
> tornar custo visível, aqui aplicada a infraestrutura em vez de telemetria. Cotas e limites de
> `kubernetes/05` são o mecanismo técnico que um orçamento de plataforma, no nível financeiro,
> espelha. E requisitos e números de `system-design/02` é o mesmo exercício de transformar
> intuição ("acho que está caro") em modelo verificável com número real.

## Principais aprendizados

- Custo unitário (por ambiente, por serviço, por pedido) permite comparar eficiência, diferente de
  só olhar o total absoluto.
- *Showback* educa sem forçar mudança imediata; *chargeback* cria incentivo financeiro direto, mas
  exige maturidade organizacional de orçamento por equipe.
- Custo sem dono deveria ser visível como balde próprio — diluído no total, ninguém o nota nem o
  investiga.
- Um orçamento com alerta (não só limite rígido) dá tempo para ajustar o consumo antes do problema
  se tornar urgente.
- Este marco é honesto sobre medir custo (fácil) versus retorno (difícil) da própria equipe de
  plataforma — não finge que essa assimetria não existe.
