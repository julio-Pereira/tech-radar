---
id: operar-open-finance-e-capstone
title: "Operar o Open Finance e capstone"
summary: "Operar um ecossistema regulado é operar com os outros — e o incidente típico não é uma queda, é um acesso indevido ou uma identidade quebrada."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Open Finance"
    url: https://www.bcb.gov.br/estabilidadefinanceira/openfinance
---

## Incidentes típicos deste ecossistema

Diferente de um sistema isolado, os incidentes mais comuns aqui envolvem **outras partes**: uma
**revogação que não propaga** a tempo, um **TPP com token vazado**, um **certificado expirado ou
revogado** no meio de um fluxo, o **diretório indisponível**, um **vazamento entre consentimentos**
(um cache mal particionado servindo dados do consentimento errado), um **pico de tráfego de um
TPP** específico, ou uma **versão quebrada** publicada sem o processo de compatibilidade do marco
09. Nenhum desses é "o serviço caiu" — todos são variações de identidade, autorização ou
consentimento funcionando mal.

## Reporte e comunicação ao ecossistema e ao regulador

Incidentes relevantes podem exigir **reporte formal** — a prazos, formatos e canais específicos
que **conferir** sempre contra a versão vigente — tanto ao ecossistema (outros participantes
afetados) quanto, em casos mais graves, ao próprio regulador. Tratar esse reporte como um passo
opcional ou improvisado, descoberto só quando o incidente já está em curso, é um erro de
preparação que a prática de *runbooks* existe para evitar.

## *Runbooks* específicos deste domínio

Um *runbook* de "certificado a expirar" ou "revogação em massa de um TPP comprometido" precisa
existir **antes** do incidente, com passos concretos e testados — não escrito, do zero, sob
pressão, no meio da primeira ocorrência real. A disciplina geral de *runbooks* operacionais se
aplica aqui com um ingrediente específico: muitos cenários deste domínio envolvem **outra
organização** (uma detentora, um TPP), não apenas sistemas sob seu próprio controle direto.

## Painel por TPP e por *endpoint*

Um painel que mostra saúde **agregada** do sistema esconde exatamente o tipo de problema mais
comum neste ecossistema: um TPP específico se comportando mal, ou um *endpoint* específico
degradando. Visibilidade **por TPP e por endpoint**, não só agregada, é o que permite identificar
rapidamente "é geral, ou é só esse participante específico" — a primeira pergunta que qualquer
runbook deste domínio precisa responder.

## Detecção de uso anômalo por TPP

Um padrão de uso que se desvia do esperado — um pico repentino, uma sequência de consultas que
parece **enumeração de identificadores** (tentando descobrir, por tentativa e erro, quais valores
são válidos) — é um sinal que merece **detecção automatizada** e alerta, não descoberta manual
tardia. A mesma disciplina geral de detecção e resposta a incidentes de segurança se aplica aqui
com o TPP, em vez de um usuário final, como a unidade de análise.

## Gestão de chaves e certificados: calendário e alerta antecipado

Um certificado ou uma chave que expira sem aviso prévio é um incidente **inteiramente evitável** —
um **calendário de expiração**, com **alerta antecipado** configurado com margem suficiente para
agir (rotacionar, renovar) antes do vencimento, transforma um problema reativo em uma tarefa
agendada e rotineira.

## Suporte ao cliente: "meu consentimento não funciona"

Do ponto de vista do cliente final, um problema técnico específico (token expirado, consentimento
em estado inesperado, uma detentora específica fora do ar) se manifesta como "não está
funcionando" — sem nenhum detalhe técnico. A equipe de suporte precisa de ferramentas que
traduzam esse relato vago para o estado técnico real (qual consentimento, qual estado, qual TPP,
qual detentora) rapidamente, sem depender de escalada manual para a engenharia em todo caso.

## *Game days*, custo, capacidade e segregação de funções

*Game days* regulares (provocar deliberadamente os cenários do `PROJETO.md`) são o que transforma
runbooks teóricos em procedimentos realmente testados; **custo e capacidade** de operar o
ecossistema (quantas detentoras, qual volume de TPPs) precisam de planejamento contínuo, não
reativo; e **segregação de funções** — quem pode aprovar uma mudança, quem pode executá-la, quem
audita o resultado — é a mesma disciplina já formalizada para mudança regulada em geral, aqui
aplicada ao componente que decide identidade e consentimento de todo o sistema.

## Exemplo numa fintech

Às 14h, um TPP específico começa a receber `401` em massa; investigação rápida revela que o
certificado dele expirou, e o diretório ainda não refletiu a renovação que ele já havia
solicitado — o painel por TPP mostra exatamente qual participante está afetado, isolando o
problema antes que alguém assumisse, erroneamente, que o transmissor inteiro estava com defeito.

## Hands-on

**Tutorial.** Implemente o painel de SLO por TPP e o calendário de expiração de certificados, com
alerta antecipado.

**Desafio.** Conduza um *game day* de três cenários do `PROJETO.md`, documentando cada um com um
*post-mortem*.

**Invariantes testáveis**

1. O alerta de **certificado a expirar** dispara com a **antecedência configurada** — verificado
   com relógio falso avançando até exatamente o limiar declarado.
2. O **painel por TPP** reproduz exatamente os números já calculados pelo harness de conformidade
   e pelas métricas de desempenho dos marcos anteriores.
3. Um **padrão de uso anômalo** injetado deliberadamente (pico de tráfego, sequência de
   enumeração de identificadores) é **detectado** e gera um alerta correspondente.
4. O ***runbook* de revogação em massa** de um TPP comprometido **corta** todos os tokens e
   consentimentos daquele TPP específico dentro do limite declarado.
5. O **simulador de incidente** gera um relatório com **linha do tempo e impacto** documentados.
6. `make conformance` e `make audit` (do ledger subjacente) rodam **juntos**, e o capstone só
   passa se **ambos** passarem integralmente.

**Complemento.** Escreva o *runbook* "um TPP está usando dados que não deveria" — os passos
exatos, incluindo quais sinais consultar primeiro.

**Checagem**

1. Por que os incidentes mais comuns deste ecossistema envolvem identidade, autorização ou
   consentimento, em vez de simplesmente "o serviço caiu"?
2. Por que um painel só agregado esconde o tipo de problema mais comum neste domínio?
3. Por que um certificado expirando sem aviso é descrito como um incidente inteiramente evitável?
4. Por que muitos *runbooks* deste domínio precisam considerar que o problema pode envolver outra
   organização, não só sistemas sob seu próprio controle?

> **Reencontro — `observabilidade/13`, `/15`.** Os alertas e o plantão do primeiro marco sustentam
> a detecção de certificado a expirar e de uso anômalo deste marco; e o processo de incidente até a
> causa do segundo é o que se aplica quando um desses cenários típicos realmente ocorre, não
> apenas na simulação de game day.

A detecção e resposta de `seguranca-aplicacao/15` é a disciplina geral de segurança que a detecção
de uso anômalo por TPP aplica especificamente a esse domínio; a mudança regulada e segregação de
funções de `entrega-continua-e-devops/09` segue sendo a referência para quem pode aprovar,
executar e auditar uma correção neste componente; e a governança de PII e auditoria de
`dados-distribuidos/13` é o vocabulário de privacidade que rege qualquer investigação de
vazamento entre consentimentos.

## Principais aprendizados

- Os incidentes mais comuns deste ecossistema são de identidade, autorização ou consentimento —
  raramente "o serviço simplesmente caiu".
- Visibilidade por TPP e por endpoint, não só agregada, é o que permite isolar rapidamente se um
  problema é geral ou específico de um participante.
- Um certificado expirando sem aviso é um incidente inteiramente evitável com calendário e alerta
  antecipado.
- Muitos runbooks deste domínio envolvem outra organização — uma detentora, um TPP — não apenas
  sistemas sob controle direto.
- *Game days* regulares são o que transforma runbooks teóricos em procedimentos realmente
  testados, antes que um incidente real os exija.

## Capstone

O `fin-opengate` é o seu portão de Open Finance executável — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto, consolidando a confiança, os
dados, os pagamentos e a conformidade de todos os blocos anteriores.

**Entrega**

- [ ] `spec-versions.yaml` e o mapa de papéis/fases executável (marco 01)
- [ ] `diretorio-sim/` com CA, SSA e JWKS, e registro dinâmico no `transmissor/` (marco 02)
- [ ] Servidor de autorização com PAR, *request object* e token vinculado ao certificado,
      com a suíte negativa FAPI (marco 03)
- [ ] Máquina de estados do consentimento, revogação e eventos (marco 04)
- [ ] APIs de dados sobre o core simulado, com contrato canônico validado (marco 05)
- [ ] Medição de latência/disponibilidade por endpoint e por TPP (marco 06)
- [ ] Consentimento de pagamento, iniciação idempotente e estados terminais (marco 07)
- [ ] `iniciador/` com registro, descoberta e isolamento por detentora (marco 08)
- [ ] `conformidade/` com relatório de evidência e matriz de versões (marco 09)
- [ ] Painel por TPP, calendário de certificados e *runbooks* (este marco)

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Todo participante é identificado pelo diretório (certificado + SSA); nada que a requisição
      *afirma* substitui isso
- [ ] SSA/certificado adulterado, expirado, de participante revogado ou fora da CA é recusado, com
      o erro certo
- [ ] O servidor de autorização recusa **cada** violação do perfil de segurança testada (suíte
      negativa)
- [ ] Token roubado e usado com outro certificado é recusado (vinculação ao certificado)
- [ ] Consentimento só transita por estados válidos; revogado, expira ou muda, o acesso cessa
      dentro do limite **declarado**
- [ ] Nenhuma API devolve dado fora do escopo **e** do consentimento; a recusa é a especificada
- [ ] Respostas validam contra o contrato; paginação não perde nem repete item
- [ ] Iniciação de pagamento é idempotente; o consentimento de pagamento não é reutilizável; estado
      terminal único
- [ ] Um TPP que excede a cota não degrada os demais; a medição de SLA reproduz o esperado
- [ ] O iniciador isola falhas por detentora; resultado desconhecido é resolvido por consulta,
      nunca por novo débito
- [ ] `make conformance` produz relatório de evidência e **falha** quando um requisito é violado
      de propósito
- [ ] Nenhum certificado, diretório, credencial ou dado real em nenhum momento

**Antes de fechar**, rode o *game day* do `PROJETO.md` (os sete cenários) e escreva um
*post-mortem* de uma página para cada um — inclusive se nada tiver quebrado. E responda por
escrito à pergunta final da trilha: **das garantias que você prova no `fin-opengate`, qual só vale
porque o diretório e a CA são simulados — e que comportamento de um participante real você
esperaria que quebrasse primeiro?**
