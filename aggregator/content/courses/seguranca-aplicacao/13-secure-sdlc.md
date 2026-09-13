---
id: secure-sdlc
title: "Secure SDLC: o controle que roda sozinho"
summary: "Shift-left sem virar ruído, o gate que todo mundo aprende a burlar deixa de ser controle, e a exceção que expira sozinha — o requisito de segurança virando teste automatizado."
estimatedMinutes: 55
references:
  - title: "OWASP DevSecOps Guideline"
    url: https://owasp.org/www-project-devsecops-guideline/
  - title: "OWASP Code Review Guide"
    url: https://owasp.org/www-project-code-review-guide/
  - title: "NIST Secure Software Development Framework (SSDF)"
    url: https://csrc.nist.gov/pubs/sp/800/218/final
---

## Shift-left sem virar ruído

"Shift-left" — mover verificação de segurança para mais cedo no ciclo — só funciona quando
cada ferramenta roda **onde ela rende de verdade**, não em todo lugar de uma vez. **Secret
scanning** rende em dois pontos: **pre-commit** (bloqueia antes do segredo sair da máquina
do desenvolvedor) e **no histórico completo** (pega o que já vazou antes do scanner
existir). **SAST** (Static Application Security Testing) rende em **pre-merge**, com um
conjunto **curado** de regras — rodar todas as regras disponíveis de fábrica produz tanto
ruído que ninguém lê o resultado. **SCA** roda **continuamente** (a árvore de dependência
muda mesmo sem novo commit, porque novas CVEs são publicadas). **DAST** (Dynamic
Application Security Testing) rende em **staging**, contra um sistema rodando de verdade —
um SSRF como o do marco 03 é exatamente o tipo de falha que DAST, testando contra um
ambiente real, consegue pegar, e que SAST, lendo só o código estático, costuma deixar
passar. **IaC scan** roda contra o código de infraestrutura antes do apply. **Rodar tudo, em todo
lugar, o tempo todo é operacionalmente equivalente a não rodar nada** — o volume de
resultado ignorado converge para o mesmo lugar que a ausência de verificação.

## Falso positivo é problema de processo, não de ferramenta

A causa mais comum de um programa de segurança morrer lentamente não é falta de
ferramenta — é **taxa de falso positivo alta o bastante para o time aprender a ignorar o
gate**. No momento em que um gate de segurança vira algo que todo desenvolvedor sabe
como contornar (um merge forçado, um flag de bypass usado por rotina), **ele deixou de ser
controle**, mesmo continuando tecnicamente "ativo" no pipeline. A resposta correta não é
remover o gate — é **política de exceção com três elementos obrigatórios**: **prazo**
(até quando a exceção vale), **dono** (quem é responsável por resolvê-la) e **expiração
automática** (a exceção que vence **volta a falhar o build sozinha**, sem que ninguém
precise lembrar de revisá-la manualmente).

## Requisito de segurança como teste automatizado

O ASVS do marco 02 gerou requisitos numerados; aqui eles completam o ciclo, virando
**teste automatizado** que roda a cada build. Essa transformação é o que impede que todo
controle desta trilha **envelheça no primeiro refactor**: um requisito satisfeito
manualmente uma vez, e nunca mais verificado, é conhecimento que existiu — não proteção
que continua existindo. Um requisito que é teste de regressão continua valendo mesmo
quando a pessoa que o implementou já não está no time.

## Code review com lente de segurança

Uma checklist de revisão de segurança **longa demais simplesmente não é usada** — ninguém
percorre trinta itens em cada PR. Uma checklist **curta**, com os cinco pontos que
concentram a maior parte do risco real — **autorização, entrada, segredo, criptografia,
log** — pega a maior parte do que importa sem exigir disciplina sobre-humana do revisor.
O objetivo não é cobrir 100% dos casos possíveis; é cobrir, de forma sustentável, os que
mais aparecem e mais custam.

## Gestão de vulnerabilidade

Um backlog de vulnerabilidade sem regra cresce indefinidamente até virar ruído que ninguém
mais olha. A estrutura que sustenta um backlog gerenciável: **SLA por severidade** (prazo
diferente conforme criticidade), **dono nomeado** para cada item (sem dono, nada se move),
e **política de descarte explícita** — um critério documentado para quando um item pode
ser fechado como aceito, não corrigido, sem que isso pareça negligência não declarada.

## Exemplo numa fintech

A lição de `kubernetes/09` — "a política é o controle auditável; o wiki não é" — se aplica
aqui do lado do código: **evidência de controle gerada pelo próprio pipeline** (o log de
execução do gate, o registro de exceção com prazo) é o que sustenta uma auditoria; uma
página de wiki descrevendo "como fazemos revisão de segurança" não prova que ela
aconteceu numa mudança específica.

## Hands-on

**Desafio — pipeline com quatro gates e exceção com expiração.** Implemente um pipeline
com quatro gates: (1) secret scanning; (2) CVE crítica **alcançável** (*reencontro:* marco
12); (3) violação de regra SAST curada; (4) política de exceção com prazo, dono e
expiração automática.

**Invariantes testáveis**

1. Um PR com segredo plantado deliberadamente é barrado pelo gate.
2. Um PR com CVE crítica alcançável (função vulnerável de fato chamada) é barrado.
3. Um PR que viola uma regra SAST da lista curada é barrado.
4. Uma exceção registrada libera o build normalmente até a data declarada; **depois da
   expiração, o mesmo build volta a falhar automaticamente, sem qualquer intervenção**.

**Complemento.** Meça, durante uma semana de uso real (ou simulado) do pipeline, a taxa de
falso positivo de cada gate. Um gate acima de um limiar que você definir por escrito
(por exemplo, 10% de falso positivo) é candidato a revisão de regra antes de continuar
bloqueando build.

**Checagem**

1. Por que rodar todas as regras de SAST disponíveis, em todo commit, tende a produzir o
   mesmo resultado prático que não rodar SAST algum?
2. O que caracteriza a política de exceção que este marco descreve, além de simplesmente
   "permitir pular o gate"?
3. Por que um requisito ASVS satisfeito manualmente, sem virar teste automatizado,
   costuma parar de proteger o sistema depois de um refactor?
4. Por que uma checklist de revisão de segurança curta tende a proteger mais, na prática,
   do que uma checklist longa e completa?

## Principais aprendizados

- Cada ferramenta de shift-left rende num momento específico do ciclo — secret scanning
  no commit e no histórico, SAST no merge, SCA contínuo, DAST em staging, IaC antes do apply.
- Falso positivo é o que transforma um gate de controle em obstáculo contornado por
  rotina; a exceção com prazo, dono e expiração automática é a resposta estrutural.
- Requisito ASVS vira teste automatizado para não envelhecer no primeiro refactor —
  conhecimento implementado uma vez não é o mesmo que proteção que continua ativa.
- Checklist curta de revisão de segurança (autorização, entrada, segredo, criptografia,
  log) protege mais na prática do que uma lista longa que ninguém consegue seguir.
- Evidência de controle gerada pelo próprio pipeline é o que sustenta auditoria — a mesma
  lição de `kubernetes/09`, aplicada agora do lado do código.
