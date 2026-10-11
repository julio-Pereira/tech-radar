---
id: servir-o-modelo
title: "Servir o modelo"
summary: "Servir é decidir dentro de um orçamento, com fallback, e deixar um registro que permita refazer a decisão."
estimatedMinutes: 60
completion: quiz
references:
  - title: "ONNX Runtime"
    url: https://onnxruntime.ai/docs/
---

## Batch, online, e híbrido

**Batch**: pré-calcular a decisão para todos os clientes de uma vez, periodicamente — barato, mas a decisão
pode estar desatualizada quando usada. **Online**: calcular no instante da consulta — atual, mas custa
latência e exige que tudo (features, modelo) esteja disponível ali, naquele orçamento de tempo. **Híbrido**:
pré-calcular o que é estável, calcular na hora só o que muda rápido. A escolha é uma decisão de arquitetura
com o mesmo vocabulário de orçamento de latência de `system-design/02` e `/12`, não uma preferência de
estilo.

## Orçamento de latência, e o *fallback*

Todo serviço síncrono declara um **orçamento de latência** — e servir uma oferta não é exceção. Quando o
modelo ou uma feature não respondem dentro do orçamento (feature store fora do ar, por exemplo), o serviço
precisa de um **fallback** definido de antemão: usar a última decisão boa conhecida, cair para o baseline
por regras, ou simplesmente não mostrar oferta alguma. **Quem decide o padrão** (qual fallback usar, para
qual tipo de oferta) é uma decisão de produto registrada antes do incidente, não inventada durante ele.

## *Policy gate* também no *serving*

O marco 01 já aplicou o *policy gate* na construção do conjunto de candidatos; no *serving*, ele precisa
rodar **de novo**, porque o tempo passou entre o cálculo e a exibição. Um consentimento pode ter sido
revogado nos segundos entre o modelo decidir a oferta e a tela do cliente renderizá-la — se isso acontecer,
a oferta **não pode ser mostrada**, mesmo que já tenha sido calculada e esteja pronta para exibir.

## O log de decisão

Cada decisão de oferta gera um registro: as entradas (ou um hash delas, por minimização), a versão do
modelo, as versões das features usadas, a versão da política aplicada, o resultado, e um `decisionId`
único. Esse log é o que torna uma decisão **reproduzível depois** (marco 09), e precisa equilibrar
retenção (para auditoria) com minimização (não guardar PII que não precisa).

## Cache, concorrência, e pools no serviço

O serviço de ofertas enfrenta os mesmos problemas de qualquer serviço síncrono de alto tráfego: cache de
features com TTL (marco 03), pools de conexão com a feature store e o modelo (`concorrencia-e-recursos/05`
e `/07`), e concorrência seguro sob carga. Nenhum desses problemas é específico de ML — são os mesmos
problemas de engenharia de serviços, aplicados aqui.

## Exemplo numa fintech

O app pede a lista de ofertas no momento do login: o orçamento de latência é de 80ms, e a feature store
está lenta nesse exato instante. O fallback definido (usar a última oferta calculada em batch, se existir;
senão, nenhuma oferta) entra em ação, e o serviço responde dentro do orçamento mesmo sem conseguir calcular
a decisão "fresca" — o cliente não percebe um erro, só uma oferta eventualmente menos otimizada.

## Hands-on

**Tutorial.** Implemente o serviço de ofertas com *policy gate*, fallback e log de decisão completo.

**Desafio.** Implemente o *replay* de uma decisão a partir do log.

**Invariantes testáveis**

1. Com a feature store simulada fora do ar, a resposta do serviço sai **dentro do orçamento de latência**
   declarado, usando o fallback definido.
2. Toda decisão tem registro completo no log, e o ***replay*** com as mesmas entradas e as mesmas versões
   (modelo, features, política) produz **a mesma saída**.
3. Um consentimento revogado **entre** o cálculo da oferta e sua exibição faz a oferta **não ser mostrada**
   — verificado simulando a revogação nesse intervalo exato.
4. A matriz de fallback (qual ação tomar, para cada tipo de oferta, quando cada componente falha) está
   testada caso a caso, não só no caso mais comum.

**Complemento.** Sirva o mesmo modelo em JVM via ONNX Runtime e compare a saída com a versão Python
(teste de paridade) — **sujeito à Fase 0**: suporte e licença do ONNX Runtime para este caso de uso ainda
não foram verificados.

**Checagem**

1. Quando a escolha entre batch, online e híbrido é uma decisão de arquitetura, e não de estilo?
2. O que um fallback de serving precisa ter definido **antes** do incidente, e por quê?
3. Por que o *policy gate* precisa rodar de novo no serving, mesmo já tendo rodado na construção dos
   candidatos?
4. O que o log de decisão precisa conter para que uma decisão seja reproduzível depois, por *replay*?
5. Como o serviço de ofertas reusa problemas (cache, pools, concorrência) que não são específicos de ML?
6. Por que servir em JVM via ONNX é tratado como complemento "sujeito à Fase 0", e não como parte do
   escopo garantido desta trilha?

> **Reencontro — `system-design/02`, `/12`; `concorrencia-e-recursos/05`, `/07`; `spring-boot/08`;
> `arquitetura-eventos/08`.** O orçamento de latência e o fallback retomam diretamente o vocabulário de
> `system-design/02` e o caso de antifraude síncrono de `/12`. Pools e concorrência sob carga são a mesma
> disciplina de `concorrencia-e-recursos/05` e `/07`. A resiliência do serviço (circuito, timeout) usa o
> mesmo vocabulário de `spring-boot/08`. E o `decisionId` único no log de decisão é a mesma garantia de
> idempotência que `arquitetura-eventos/08` ensina para eventos.

## Principais aprendizados

- Batch, online e híbrido são decisões de arquitetura com o mesmo vocabulário de orçamento de latência de
  qualquer serviço síncrono — não uma preferência de estilo.
- Um fallback de serving precisa estar definido antes do incidente: quem decide o padrão é uma decisão de
  produto, não uma improvisação sob pressão.
- O *policy gate* roda de novo no serving porque o consentimento pode mudar no intervalo entre o cálculo e
  a exibição da oferta.
- O log de decisão (entradas, versões de modelo/feature/política, `decisionId`) é o que torna uma decisão
  reproduzível por *replay* depois.
- Os problemas de cache, pool e concorrência do serviço de ofertas não são específicos de ML — são os
  mesmos problemas de qualquer serviço síncrono de alto tráfego.
