---
id: conformidade-e-evolucao-de-versoes
title: "Conformidade e evolução de versões"
summary: "Conformidade não é um estado, é uma prática contínua: toda mudança de código e toda nova versão da especificação passam pelo mesmo harness."
estimatedMinutes: 65
references:
  - title: "Open Finance Brasil — Portal de especificações (Confluence)"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## O que a certificação faz, e o que você roda antes

O processo formal de certificação do ecossistema (**conferir** o processo vigente) valida, numa
instância controlada, que uma implementação atende aos requisitos — mas esperar até esse momento
para descobrir uma violação é tarde demais no ciclo de desenvolvimento. O que esta trilha ensina a
construir é o que **antecede** a certificação: um conjunto de testes que você roda a cada mudança,
antes de qualquer submissão formal, capaz de pegar a mesma classe de problema que a certificação
pegaria — só muito mais cedo.

## O *harness* de conformidade

O **harness** de conformidade reúne três tipos de teste num só lugar: **testes de contrato**
(toda resposta valida contra o OpenAPI, já visto no marco 05), **testes negativos** (um por
requisito, já praticado desde o marco 03), e **testes de fluxo** (consentimento → token → chamada
→ revogação, a jornada completa ponta a ponta do marco 01 verificada de fato). Rodar os três
juntos, de forma automatizada, é o que transforma "achamos que estamos conformes" em "provamos que
estamos conformes, e temos a evidência".

## Evidência: o relatório assinado e versionado

Cada execução do harness produz um relatório de **evidência** — versionado, com timestamp, e
idealmente assinado — que documenta exatamente quais requisitos foram verificados e com qual
resultado. Esse relatório não é burocracia decorativa: é o artefato que, meses depois, responde
"nós sabíamos que estávamos conformes nesta data, e aqui está a prova".

## Matriz de versões

Em qualquer momento, o transmissor provavelmente serve **mais de uma versão** simultaneamente —
TPPs migram em ritmos diferentes, e forçar todos a migrar no mesmo instante que uma nova versão é
publicada não é realista. A **matriz de versões** declara explicitamente quais versões estão
ativas, por quanto tempo cada uma continua sendo servida, e qual é o prazo de convivência
(**conferir** os valores vigentes) — sem essa matriz como dado explícito, "quais versões ainda
precisamos suportar" se torna uma pergunta sem resposta confiável.

## Evolução controlada: *feature flags*, roteamento, *sunset*

Introduzir uma nova versão sem quebrar quem ainda depende da antiga exige mecânica deliberada:
*feature flags* por versão, roteamento que direciona cada TPP para a versão que ele de fato usa, e
um processo de ***sunset*** (já visto no marco 05) que desativa a versão antiga só depois do prazo
de convivência declarado se esgotar — nunca antes, e nunca sem aviso.

## Teste de compatibilidade retroativa

Toda mudança de código — mesmo uma que parece não afetar nenhuma versão específica — merece um
**teste de compatibilidade retroativa**: confirmar que servir duas (ou mais) versões
simultaneamente não altera, de forma alguma, as respostas de nenhuma delas. Esse teste é o que
pega o caso sutil em que uma "pequena limpeza de código" interno acidentalmente altera o
comportamento observável de uma versão que deveria ter ficado intocada.

## Mudança regulada e trilha de evidência

Toda mudança neste domínio é, por natureza, uma **mudança regulada** (`entrega-continua-e-devops/09`
já formalizou esse conceito em geral) — o que implica trilha de evidência, segregação de funções,
e aprovação formal antes de produção. O `make conformance` (ou equivalente) funciona como **gate**
de pipeline (`entrega-continua-e-devops/04`): uma mudança que falha no harness nunca chega a
produção, independente de quão urgente pareça.

## Cobertura: todo requisito precisa de teste positivo e negativo

A prática central deste marco, formalizada: cada requisito listado em `spec-versions.yaml` precisa
ter, no mínimo, **um teste positivo** (confirma que o comportamento esperado funciona) **e um teste
negativo** (confirma que a violação correspondente é recusada). Um requisito sem nenhum teste
associado — de qualquer um dos dois tipos — é uma lacuna de cobertura que o próprio harness
deveria detectar e reportar, não algo descoberto manualmente por inspeção de código.

## *Drift* entre contrato e comportamento real

**Drift** é a divergência silenciosa entre o que o contrato declara e o que o serviço de fato
devolve — frequentemente introduzida por uma mudança não intencional que nenhum teste específico
cobria. O harness de conformidade, rodado continuamente (não só antes de uma submissão formal), é
a defesa estrutural contra esse tipo de divergência se acumular sem ser notada.

## Exemplo numa fintech

A especificação publica uma nova versão de uma API de dados; em minutos, o harness de conformidade
mostra exatamente quais testes passam a quebrar contra a nova versão e quais respostas deixam de
validar — informação que, sem o harness, só seria descoberta manualmente, requisito por
requisito, ou (pior) só quando um TPP real reportasse o problema.

## Hands-on

**Tutorial.** Implemente `conformidade/` com testes de contrato e testes negativos sobre os
marcos anteriores.

**Desafio.** Implemente a matriz de versões e o relatório de evidência correspondente.

**Invariantes testáveis**

1. `make conformance` **falha** quando um campo obrigatório é removido de uma resposta (mutação
   plantada deliberadamente para provar que o harness detecta a regressão).
2. Cada requisito listado em `spec-versions.yaml` tem **pelo menos um teste positivo e um teste
   negativo** — verificado por uma varredura de cobertura automatizada sobre o próprio conjunto de
   testes.
3. Servir **duas versões simultaneamente** não altera as respostas de **nenhuma** delas — teste de
   compatibilidade retroativa comparando as respostas da versão antiga antes e depois da nova
   versão ser publicada.
4. O **relatório de evidência** é reprodutível e inclui a versão da especificação e a versão do
   código — duas execuções sobre o mesmo estado produzem o mesmo relatório.
5. Um requisito **sem teste** associado faz o *gate* de conformidade **falhar** — nunca passa
   silenciosamente por omissão.
6. O ***sunset*** de uma versão recusa chamadas **depois** da data configurada — verificado com
   relógio falso avançando além do prazo de convivência declarado.

**Complemento.** Monte, por escrito, um plano de adoção de uma nova versão de API em seis
semanas, incluindo o prazo de convivência com a versão anterior.

**Checagem**

1. Por que rodar o harness de conformidade **antes** da certificação formal é mais valioso do que
   esperar pela certificação para descobrir uma violação?
2. O que a matriz de versões declara explicitamente que, sem ela, se tornaria uma pergunta sem
   resposta confiável?
3. Por que todo requisito precisa de um teste positivo **e** um teste negativo, não só um dos
   dois?
4. O que é *drift* entre contrato e comportamento real, e por que um harness contínuo é a defesa
   estrutural contra ele?

> **Reencontro — `entrega-continua-e-devops/04`, `/09`.** O *gate* de pipeline do primeiro marco é
> exatamente o papel que `make conformance` desempenha aqui; e a mudança regulada do segundo,
> com sua trilha de evidência e segregação de funções, é o processo formal em que este harness de
> conformidade se encaixa como a verificação técnica que o sustenta.

O contrato de API como superfície estável de `system-design/05` é o princípio geral que a matriz
de versões aplica de forma regulada; e evoluir sem quebrar, já formalizado em `system-design/14`,
é exatamente a disciplina de compatibilidade retroativa que este marco exige verificar a cada
mudança, não só confiar por boa intenção.

## Principais aprendizados

- O harness de conformidade antecede a certificação formal — pega a mesma classe de violação,
  muito mais cedo no ciclo de desenvolvimento.
- Um relatório de evidência versionado é o artefato que, meses depois, prova que a conformidade
  foi de fato verificada numa data específica.
- A matriz de versões declara explicitamente quais versões estão ativas e por quanto tempo —
  sem isso, "o que ainda precisamos suportar" não tem resposta confiável.
- Todo requisito precisa de teste positivo e negativo — uma lacuna de cobertura é, ela mesma, uma
  falha que o harness deveria detectar.
- *Drift* entre contrato e comportamento real se acumula silenciosamente sem um harness contínuo
  rodando além do momento de uma submissão formal.
