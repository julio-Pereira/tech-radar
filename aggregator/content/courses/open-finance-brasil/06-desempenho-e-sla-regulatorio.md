---
id: desempenho-e-sla-regulatorio
title: "Desempenho e SLA regulatório"
summary: "Um requisito de desempenho regulado só existe se for medido do jeito que o regulador mede — e a medição também é um sistema que pode errar."
estimatedMinutes: 55
references:
  - title: "Open Finance Brasil — Portal de especificações (Confluence)"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## Requisitos regulados como SLI/SLO

O ecossistema impõe requisitos de **disponibilidade** e **desempenho** (percentis de latência,
janelas de medição, por endpoint e por TPP — **conferir** os valores e fórmulas vigentes) — a
tradução natural desses requisitos para a prática de engenharia já estabelecida em
`observabilidade/12` é tratá-los como **SLI/SLO**: um indicador medido, um objetivo declarado, e
uma forma explícita de saber quando o objetivo está sendo violado.

## Onde medir: servidor, borda, ou cliente?

A mesma chamada medida no **servidor** (tempo de processamento interno), na **borda** (incluindo
rede e *proxy*), ou do ponto de vista do **cliente** (incluindo tudo, inclusive a própria
latência de rede do TPP) produz três números diferentes para "a mesma" requisição. Escolher onde
medir — e declarar explicitamente essa escolha — é necessário porque o requisito regulado
provavelmente especifica (ou pressupõe) um ponto de medição específico, e comparar o número errado
contra o limite certo é um erro sutil de conformidade.

## O que conta como indisponibilidade

Um erro do **cliente** (um TPP envia uma requisição malformada, um parâmetro inválido — um 4xx por
culpa do próprio TPP) **não** deveria contar como indisponibilidade do serviço — misturar as duas
categorias faz o transmissor parecer menos disponível do que realmente está, por culpa de
chamadas que nunca eram válidas. Definir, com precisão, quais códigos e cenários contam contra a
disponibilidade medida é tão parte do requisito quanto o próprio número de percentual exigido.

## Cota por TPP e *noisy neighbor*

Sem isolamento, um TPP com tráfego anormal (um bug que gera chamadas em excesso, por exemplo)
degrada a experiência de **todos os outros** TPPs que compartilham a mesma infraestrutura — o
problema clássico de **vizinho ruidoso** (*noisy neighbor*), já tratado em `system-design/10` para
consentimento e aqui aplicado a tráfego de API. Uma **cota por TPP**, com isolamento efetivo
(filas, limites de concorrência separados), é o que impede que o comportamento de um participante
vire o problema de desempenho de outro.

## *Rate limit* e `Retry-After`

Quando um TPP excede sua cota, a resposta correta não é simplesmente falhar sem explicação — é um
**rate limit** explícito, com um cabeçalho **`Retry-After`** informando quando a próxima tentativa
tem chance razoável de sucesso. Essa comunicação explícita é o que permite que um TPP bem
comportado recue e tente de novo no momento certo, em vez de martelar o serviço repetidamente
logo após ser recusado.

## Cache de resposta e o risco de vazamento entre consentimentos

Cachear a resposta de uma API de dados pode parecer uma otimização óbvia de desempenho — mas um
cache que não particiona corretamente por consentimento corre o risco real de servir, para um
consentimento diferente do que gerou a resposta original, dados que esse segundo consentimento
nunca autorizou. Qualquer estratégia de cache neste domínio precisa tratar o **consentimento** como
parte da chave de cache, nunca como um detalhe irrelevante para a decisão de reaproveitar uma
resposta.

## Degradação controlada quando o core está lento

Quando o sistema legado por trás do transmissor está respondendo lentamente, a escolha entre
devolver uma **resposta parcial** (o que já está disponível, sinalizando o que falta) ou um
**erro explícito** é uma política deliberada, não um acidente de timeout. Qual das duas opções o
perfil de desempenho regulado favorece — **conferir** — determina a resposta certa; a pior opção
possível é um comportamento inconsistente, que varia conforme a sorte do timing.

## Reporte periódico e orçamento de erro regulatório

O ecossistema espera, periodicamente, um **reporte de métricas** de desempenho e disponibilidade
(**conferir** o formato e a periodicidade vigentes) — e esse reporte é, ele mesmo, parte do
**orçamento de erro regulatório**: quanto de indisponibilidade ou degradação é tolerável antes de
consequências formais. Alertas (`observabilidade/13`) configurados sobre esse orçamento, não só
sobre métricas técnicas genéricas, são o que permite agir antes que o reporte periódico revele um
problema que já durou demais.

## Exemplo numa fintech

Um TPP com um bug no seu próprio sistema passa a enviar dez vezes o volume normal de chamadas; com
cota e isolamento corretos, ele recebe `429` com `Retry-After`, e o percentil 95 de latência dos
**outros** TPPs permanece dentro do esperado — exatamente o resultado que o isolamento por cota
existe para garantir.

## Hands-on

**Tutorial.** Implemente a medição de latência e disponibilidade por endpoint e por TPP.

**Desafio.** Implemente o isolamento por cota e o relatório periódico correspondente.

**Invariantes testáveis**

1. Com relógio falso e uma carga conhecida, a **disponibilidade e o percentil calculados** batem
   exatamente com o valor esperado, calculado manualmente para a mesma massa de dados.
2. Um erro de **cliente** (4xx por parâmetro inválido do próprio TPP) **não** conta como
   indisponibilidade no cálculo — verificado comparando o resultado com e sem esses erros
   incluídos.
3. Um TPP operando a **10x sua cota** recebe a recusa esperada (com `Retry-After`), e o desempenho
   dos **demais TPPs não degrada** além de uma margem declarada — verificado como uma relação
   medida, não um número absoluto fixo.
4. Nenhuma resposta em **cache** é servida para um **consentimento diferente** do que a gerou —
   verificado tentando reaproveitar uma entrada de cache sob um segundo consentimento sintético.
5. O **relatório periódico** de métricas é **reprodutível**: a mesma massa de entrada produz
   exatamente o mesmo relatório de saída.
6. Com o core simulado respondendo lentamente, o comportamento de degradação (parcial ou erro
   explícito) segue **consistentemente** a política configurada, nunca varia por sorte de timing.

**Complemento.** Escolha, por escrito, onde você mediria desempenho (borda × serviço) para o seu
próprio contexto, e descreva o que essa escolha específica deixaria de capturar.

**Checagem**

1. Por que medir a mesma chamada no servidor, na borda, ou pelo cliente produz três números
   diferentes — e por que essa escolha precisa ser declarada explicitamente?
2. Por que um erro do próprio TPP não deveria contar como indisponibilidade do serviço do
   transmissor?
3. Por que um cache de resposta de dados precisa tratar o consentimento como parte da chave de
   cache?
4. Por que a resposta a um core lento (parcial × erro explícito) precisa ser uma política
   declarada, em vez de um comportamento que varia por timing?

> **Reencontro — `observabilidade/12`, `/13`.** O SLI/SLO e o orçamento de erro do primeiro marco
> são exatamente o vocabulário que este marco aplica aos requisitos de desempenho regulados do
> ecossistema; e os alertas e o plantão do segundo são o mecanismo operacional que precisa reagir
> quando esse orçamento de erro regulatório está perto de se esgotar.

O desenho de cota e isolamento de TPP se apoia na mesma disciplina de *noisy neighbor* já tratada
em `system-design/10`; a resiliência de cliente de `spring-boot/08` (timeout, *circuit breaker*)
se aplica à chamada ao core lento deste marco; e a monetização e *API management* de
`system-design/06` é o contexto mais amplo de cota e limite de uso que este marco aplica
especificamente a um contrato regulado, não comercial.

## Principais aprendizados

- Requisitos de desempenho regulados precisam ser medidos exatamente onde o regulador mede — o
  mesmo requisito, medido em pontos diferentes, produz números diferentes.
- Erro do próprio TPP não deveria contar como indisponibilidade do serviço do transmissor.
- Isolamento por cota, com `Retry-After` explícito, impede que o tráfego de um TPP degrade a
  experiência dos demais.
- Cache de resposta de dados sob consentimento precisa tratar o consentimento como parte da chave
  — nunca servir entre consentimentos diferentes.
- Degradação sob core lento (parcial × erro explícito) precisa ser uma política declarada e
  consistente, nunca um comportamento que varia por sorte de timing.
