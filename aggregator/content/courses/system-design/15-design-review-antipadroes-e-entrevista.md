---
id: design-review-antipadroes-e-entrevista
title: "Design review, antipadrões e a entrevista"
summary: "Um desenho só vale quando alguém consegue defendê-lo, revisá-lo e mudá-lo. A entrevista é a mesma habilidade com um relógio. Capstone da trilha."
estimatedMinutes: 60
references:
  - title: "Architecture Decision Records (ADR)"
    url: https://adr.github.io/
---

## Revisão de design: o que perguntar, o que recusar

Uma revisão de design que só confirma ("parece bom") não é revisão. As perguntas que de fato
testam um desenho: "o que você não sabe ainda, e como vai descobrir?"; "qual é a decisão mais cara
de reverter aqui, e por quê?"; "me mostre a tabela de falhas — o que falta nela?"; "se este número
dobrar amanhã, o que quebra primeiro?". O revisor tem o direito — e a obrigação — de recusar
aprovar um documento sem tabela de falhas, sem "o que não vamos fazer" explícito, ou com número sem
origem rastreável a `capacity.yaml`.

## RFC/ADR como processo, não só como artefato

Um processo de RFC saudável separa **quem decide** de **quem é consultado** de **quem é
informado** — sem essa separação clara, toda decisão vira reunião com todo mundo, ou pior, decisão
tomada por quem grita mais alto. A ADR (marco 01) é o artefato final desse processo; o RFC é o
processo que produz input suficiente para escrevê-la com confiança.

## Comunicar *trade-off* sem esconder a dúvida

A frase mais honesta e mais rara em revisão de arquitetura é "não sei, e aqui está como eu
descobriria" — dita no lugar de inventar uma certeza que não existe. Comunicar *trade-off* bem
significa nomear o que se ganha **e** o que se perde em cada opção, com número quando possível, e
deixar claro qual incerteza ainda não foi resolvida, em vez de apresentar a decisão como se fosse
óbvia depois do fato.

## Antipadrões, nomeados para reconhecer rápido

**Microsserviço prematuro**: cortar antes de qualquer um dos cinco critérios do marco 03 estar
presente, pagando custo de rede e deploy distribuído por nada. **"Escala" sem número**: a palavra
usada como se fosse argumento, sem `capacity.yaml` nenhum por trás. ***Resume-driven design***:
escolher tecnologia pela empregabilidade que ela confere ao currículo de quem decide, não pelo
problema. **Monolito distribuído** (marco 03): parece microsserviços, se comporta como monolito
acoplado. **Ausência de tabela de falhas**: um documento que só descreve o caminho feliz não é um
documento de design de fintech, é uma demonstração. **Tudo no gateway** (marco 06): regra de
negócio empurrada para a borda porque "é mais fácil mudar lá", até ninguém mais entender o sistema
lendo só o código dos serviços.

## O framework de condução com *timebox*, usado nos casos 09-12

Requisitos e perguntas de esclarecimento (os primeiros minutos, sempre) → números
(`capacity.yaml`, rápido, ordem de grandeza) → desenho de alto nível (C4 nível 2, os contêineres e
como se falam) → aprofundar **um** ponto que o entrevistador sinalizar como interessante (nunca
tentar aprofundar tudo no tempo disponível) → tabela de falhas (pelo menos as três mais prováveis)
→ evolução (o que muda se o requisito mudar). Cada etapa tem uma fração aproximada do tempo total —
a disciplina de *timebox* é o que evita gastar quinze minutos no diagrama de contexto e sobrar cinco
para todo o resto.

## O que cada nível é avaliado a mostrar

**Sênior**: profundidade técnica — sabe os números, sabe os *trade-offs*, defende a escolha sob
pergunta difícil. **Tech lead**: as mesmas competências de sênior, mais a capacidade de guiar a
conversa, fazer as perguntas certas antes de desenhar, e lidar com ambiguidade sem travar.
**Staff**: tudo isso, mais visão de como a decisão afeta outras equipes e o roadmap de longo prazo
— o "e daqui a dois anos, o que isso nos custa ou nos permite?". Histórias de liderança técnica
contadas a partir de ADRs reais (não hipotéticas) são o material mais forte para esse nível,
porque provam julgamento aplicado, não só conhecimento teórico.

## Exemplo numa fintech: como o roteiro genérico de entrevista muda

Em qualquer entrevista de system design que envolva dinheiro, as perguntas que um candidato
precisa antecipar, mesmo sem serem feitas explicitamente: onde está a invariante de conservação?
qual é o plano de conciliação? o que o regulador exige deste fluxo especificamente? Um candidato
que desenha um sistema de pagamentos sem mencionar nenhuma dessas três coisas espontaneamente
revela que não pensou em fintech como domínio — pensou em "um sistema distribuído genérico com
dinheiro no nome dos campos".

> **Reencontro — `observabilidade/15` e `seguranca-aplicacao/16`.** O post-mortem que produz
> aprendizado em vez de culpado, daquele marco, é exatamente a disciplina que o game day desta
> trilha cobra antes de fechar o Capstone. E fechar uma trilha inteira revisitando antipadrões é o
> mesmo molde que `seguranca-aplicacao/16` usa — os antipadrões desta seção são o equivalente, em
> arquitetura, aos doze que fecham aquela.

## Hands-on

**Tutorial.** Escreva o `design-lint`: um script que lê um documento de design (markdown
estruturado) e reprova se faltar tabela de falhas, "o que não vamos fazer", ou ADR com gatilho de
reversão. Use-o para revisar (e, se necessário, corrigir) os documentos dos quatro casos anteriores.

**Desafio.** Três ensaios cronometrados de 45 minutos cada, de desenhos que você **não** fez nesta
trilha (escolha um domínio diferente: um sistema de reservas, um feed, um encurtador de URL —
qualquer um serve, desde que novo para você), com autoavaliação pela rubrica do framework de
condução.

**Invariantes testáveis**

1. O `design-lint` reprova um documento de teste sem tabela de falhas (menos de 5 linhas conta
   como ausente).
2. O `design-lint` reprova um documento sem a seção "o que não vamos fazer".
3. Todo número citado num documento aprovado pelo lint aponta para uma chave existente em
   `capacity.yaml` — verificado automaticamente, não por leitura humana.
4. Cada um dos quatro documentos de design dos casos 09-12 passa no `design-lint` depois de
   revisado.

**Complemento.** Peça a um colega (ou, na ausência de um, releia seu próprio documento depois de
alguns dias) para atacar um dos seus desenhos por 15 minutos, e registre as três objeções que você
não tinha previsto.

**Checagem**

1. Qual pergunta de revisão testa de verdade um desenho, em vez de só confirmá-lo?
2. O que diferencia o nível staff do nível sênior na avaliação de uma entrevista de system design?
3. Quais três perguntas um candidato precisa antecipar em qualquer desenho de sistema que envolve
   dinheiro, mesmo sem serem feitas explicitamente?
4. Por que *resume-driven design* é um antipadrão, mesmo quando a tecnologia escolhida é
   tecnicamente competente?

## Principais aprendizados

- Revisão que só confirma não é revisão — as perguntas que testam de verdade miram o que falta,
  o que é mais caro de reverter, e o que quebra se um número dobrar.
- RFC separa quem decide, quem é consultado e quem é informado; sem essa separação, toda decisão
  vira reunião geral ou vitória de quem grita mais alto.
- Os antipadrões desta trilha têm uma raiz comum: decisão de arquitetura tomada sem os números,
  os critérios ou a tabela de falhas que este curso inteiro ensinou a produzir.
- O framework de condução com *timebox* evita gastar o tempo todo numa única etapa — e aprofundar
  **um** ponto, não todos, é o que distingue uma entrevista bem conduzida de uma apressada.
- Em fintech, invariante de conservação, plano de conciliação e exigência do regulador são as três
  perguntas que um desenho de pagamento precisa responder, mesmo sem serem perguntadas.

## Capstone

O `fin-blueprint` é o seu dossiê executável de arquitetura do `fin-platform` — a especificação
completa está em `PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `model/` com o C4 níveis 1-2 do `fin-platform`, e `adr/` com uma ADR por bloco, cada uma com
      gatilho de reversão
- [ ] `capacity/` com `capacity.yaml`, o programa de cálculo, e uma medição real confrontada com a
      previsão
- [ ] Fitness tests de fronteira entre módulos, com papel de banco por módulo
- [ ] `sim/lb` (RR, menos conexões, P2C) e `sim/ring` (hash consistente)
- [ ] `contracts/` com OpenAPI v1→v2 e `.proto`, com `oasdiff`/`spectral`/`buf` no CI
- [ ] `sim/ratelimit` (token bucket, janela deslizante) e o agregador de medição de uso
- [ ] `STATE-MAP.md` validado, com a decisão "precisa shardar?" respondida por número
- [ ] Simulador de fila com admissão limitada e o joelho medido
- [ ] Os quatro documentos de design completos (Pix, Open Finance, extrato/notificações,
      antifraude), cada um aprovado pelo `design-lint`
- [ ] `sim/availability` com roteamento por célula
- [ ] Motor de flags com lint de flags e pelo menos uma migração por execução em paralelo
      documentada

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] O modelo C4 compila/valida em CI, e todo contêiner tem `owner` e `criticidade`
- [ ] Todo número de qualquer documento aponta para uma chave de `capacity.yaml` — nenhum número
      "de cabeça"
- [ ] O modelo de capacidade foi confrontado com uma medição real, e a diferença está escrita
- [ ] Nenhuma mudança incompatível de contrato passa no CI; a política de depreciação está escrita
- [ ] Existe rate limit por plano **e** medição de uso reconciliável com o faturamento
- [ ] Para cada dado do `STATE-MAP.md`: dono, consistência por operação, e RPO
- [ ] Toda decisão de falhar aberto × fechado está escrita como decisão de negócio, com dono
- [ ] A disponibilidade composta do caminho do Pix está calculada **e** simulada, com os grupos
      correlacionados identificados
- [ ] Toda feature flag tem dono e data de expiração, e o CI as faz cumprir
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das quinze
decisões que você tomou aqui, qual depende da premissa que você menos conseguiu medir — e o que
você faria para medi-la?**
