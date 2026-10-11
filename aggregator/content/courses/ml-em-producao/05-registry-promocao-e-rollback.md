---
id: registry-e-promocao
title: "Registry, promoção e rollback"
summary: "Promover um modelo é um deploy; precisa de contrato, gate, observação e volta."
estimatedMinutes: 55
references:
  - title: "MLflow — documentation"
    url: https://mlflow.org/docs/latest/
---

## O registry e os estágios de um modelo

Um **registry** guarda cada versão treinada de um modelo com seus metadados (métricas, hash do dado e
código, *model card*) e a move por **estágios** (candidato, *shadow*, canário, produção, arquivado) — a
mesma ideia de pipeline de deploy de software, aplicada a um artefato de modelo em vez de um binário.

## O contrato do modelo

Assim como uma API tem contrato, um modelo tem **contrato de entrada e saída**: quais features recebe, em
que versão, e que formato de saída produz. Uma mudança de modelo que exige uma feature nova ou muda o
formato da saída sem compatibilidade quebra o contrato — e precisa ser rejeitada automaticamente no CI, não
descoberta em produção pelo serviço que o consome.

## Gates de promoção

Nenhum modelo avança de estágio sem passar pelos gates: superar o baseline (marco 04), ter contrato
compatível, ter artefato com proveniência verificável (hash, assinatura — a mesma disciplina de cadeia de
suprimentos de software). Um modelo que falha qualquer gate fica parado naquele estágio, não avança por
urgência de negócio.

## *Shadow*, canário, e a diferença entre eles

**Shadow**: o modelo novo recebe as mesmas entradas que o modelo em produção, calcula sua decisão, mas
**nunca a usa** — só registra, para comparação. **Canário**: uma fração pequena do tráfego real recebe a
decisão do modelo novo de fato. Shadow mede sem risco; canário mede com risco controlado e limitado. Os
dois são etapas diferentes, não alternativas — o fluxo normal é shadow primeiro, canário depois.

## Rollback, e por que ele exige guardar a versão das features

Reverter para o modelo anterior não basta sozinho: se as features usadas por aquele modelo já evoluíram de
versão, o modelo antigo recebendo features na versão nova pode produzir uma decisão diferente da que
produzia antes. Um rollback correto restaura **modelo e versão de features juntos** — só assim a mesma
entrada produz exatamente a mesma saída que produzia antes da promoção.

## Segurança do artefato, e *feature flags*

Um artefato de modelo sem proveniência verificável (de onde veio, quem o gerou, se foi alterado depois de
treinado) é um vetor de ataque de cadeia de suprimentos como qualquer outro binário — a mesma disciplina de
`seguranca-aplicacao/12` se aplica. *Feature flags* permitem ligar e desligar um modelo promovido sem um
novo deploy, o mesmo mecanismo usado para desligar qualquer funcionalidade de risco rapidamente.

## Exemplo numa fintech

Um modelo novo é promovido a candidato, mas sua definição exige uma feature (`score_engajamento_90d`) que o
serviço de ofertas ainda não calcula em produção. Sem o gate de contrato, essa lacuna só seria descoberta
quando o serviço tentasse servir o modelo e falhasse em tempo real — com o gate, a promoção é rejeitada
antes, com uma mensagem clara sobre a feature faltante.

## Hands-on

**Tutorial.** Implemente o registry com estágios e os gates de promoção (baseline, contrato, proveniência).

**Desafio.** Implemente *shadow* e rollback sobre o serviço de ofertas.

**Invariantes testáveis**

1. Um modelo com **assinatura de contrato incompatível** (feature faltante ou formato de saída mudado) é
   **rejeitado no CI**, antes de qualquer tentativa de servir.
2. O modo *shadow* produz respostas **idênticas** às que o serviço daria sem ele (o cliente nunca vê a
   decisão do modelo em shadow), enquanto emite métricas de comparação em paralelo.
3. O rollback restaura a decisão anterior: as mesmas entradas, depois do rollback, produzem **a mesma
   saída** que produziam antes da promoção.
4. Um artefato de modelo sem proveniência (hash ou assinatura ausente) **não é promovido** a nenhum
   estágio além de candidato.

**Complemento.** Automatize o gatilho de rollback por métrica (reversão automática se uma métrica de
produção cruzar um limite declarado).

**Checagem**

1. O que o contrato de um modelo declara, e por que uma mudança incompatível precisa ser rejeitada no CI?
2. Qual é a diferença entre *shadow* e canário, e por que a ordem entre eles importa?
3. Por que um rollback de modelo precisa restaurar a versão das features junto com o modelo?
4. Por que um artefato de modelo sem proveniência verificável é tratado como risco de segurança?

> **Reencontro — `kubernetes/13`; `system-design/14`; `seguranca-aplicacao/12`.** O registry com estágios e
> rollback retoma diretamente GitOps e entrega progressiva de `kubernetes/13`, aplicados a um artefato de
> modelo em vez de um manifesto. *Feature flags* para ligar/desligar um modelo reusam o mecanismo de
> `system-design/14`. E a exigência de proveniência verificável do artefato é a mesma disciplina de cadeia
> de suprimentos de `seguranca-aplicacao/12`.

## Principais aprendizados

- O registry move um modelo por estágios com gates — a mesma disciplina de deploy de software aplicada a
  um artefato de modelo.
- O contrato de um modelo (features de entrada, formato de saída) precisa ser verificado no CI; uma
  incompatibilidade descoberta em produção é tarde demais.
- Shadow mede sem risco (nunca altera a resposta); canário mede com risco controlado sobre uma fração do
  tráfego — etapas em sequência, não alternativas.
- Rollback de modelo exige restaurar a versão das features junto, ou a mesma entrada pode produzir uma
  saída diferente da que produzia antes.
- Um artefato de modelo sem proveniência verificável é um vetor de ataque de cadeia de suprimentos, e não
  deveria avançar além do estágio de candidato.
