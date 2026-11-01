---
id: governanca-e-paved-road
title: "Governança e paved road"
summary: "Governança que vira fila de aprovação é contornada; a que torna o caminho certo o mais fácil e deixa exceções com prazo é seguida."
estimatedMinutes: 55
completion: quiz
references:
  - title: "Scaling the Practice of Architecture, Conversationally (Andrew Harmel-Law)"
    url: https://martinfowler.com/articles/scaling-architecture-conversationally.html
  - title: "Documenting Architecture Decisions (Michael Nygard)"
    url: https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
---

## Direitos de decisão: quem decide o quê

Antes de qualquer processo de governança, a pergunta mais básica: **quem** tem o direito de decidir
cada tipo de questão? Sem essa clareza, toda decisão de arquitetura se torna uma negociação política
em vez de um processo previsível — e pior, decisões conflitantes de pessoas diferentes, cada uma
achando que tinha autoridade, se tornam comuns.

## Comitê de arquitetura × processo de aconselhamento

Um **comitê de arquitetura** centraliza decisão num grupo pequeno que se reúne periodicamente — e
vira gargalo quando o volume de decisões excede a capacidade do comitê de revisar tudo em tempo
razoável. O **processo de aconselhamento** (*advice process*, **confira** a fonte) distribui o
**direito de decidir** para quem está mais próximo do problema, com a obrigação de **consultar**
quem é afetado e quem tem experiência relevante antes de decidir — sem exigir aprovação prévia de
um comitê central. A decisão continua sendo de quem a toma; o processo garante que ela não é tomada
no vácuo.

## ADR como registro de decisão, e o log como memória

Uma ADR individual documenta uma decisão específica; o **log** de todas as ADRs, consultável e
buscável, é a **memória institucional** de como e por que o sistema chegou ao estado atual —
sem esse log, a mesma pergunta ("por que fizemos assim?") é respondida de memória por quem ainda
está na empresa, até que essa pessoa saia e a resposta se perca de verdade.

## Padrões × diretrizes

Um **padrão** é obrigatório, verificado, com consequência se violado. Uma **diretriz** é uma
recomendação forte, mas sem mecanismo de bloqueio — útil quando a situação exige julgamento caso a
caso que uma regra rígida não capturaria bem. Confundir as duas categorias é comum: tratar uma
diretriz como se fosse padrão gera atrito quando alguém a ignora legitimamente; tratar um padrão como
diretriz permite violação sistemática sem ninguém perceber.

## Radar tecnológico, mantido pela própria equipe

Um radar com anéis — **adotar**, **testar**, **avaliar**, **segurar** — categoriza tecnologias e
práticas pelo nível de confiança da organização nelas. O radar só tem valor se for **mantido pela
própria equipe de arquitetura**, com revisão periódica — um radar copiado de uma fonte externa e
nunca atualizado se torna, rapidamente, um documento decorativo que não reflete mais a realidade
atual da organização.

## *Paved road* / *golden path*: o caminho certo mais fácil que o alternativo

Um modelo de serviço que já nasce **conforme** — com CI, observabilidade, segurança e estrutura já
embutidos — torna seguir o padrão o caminho de menor esforço, não o caminho de maior disciplina. A
trilha `entrega-continua-e-devops` (marco 10, "esteira como produto") é quem **constrói** o modelo de pipeline que materializa parte desse *paved road*; este
marco **verifica** se um serviço está conforme a ele, não reconstrói o modelo em si.

## Conformidade como código, e exceções com dono e prazo

Verificar conformidade ao *paved road* de forma **automatizada** (não por checklist manual revisado
esporadicamente) é o que torna a governança escalável sem crescer o tamanho do time de governança
proporcionalmente ao número de serviços. Quando uma exceção legítima é necessária, ela tem **dono**
e **prazo** — nunca uma exceção "permanente" que, na prática, nunca é revisada de novo.

## Custo da governança: tempo de espera medido

O custo de qualquer processo de governança é, majoritariamente, **tempo de espera** — e esse tempo
deveria ser **medido**, não assumido como aceitável. Um comitê que adiciona dias de espera por
decisão, sem que ninguém tenha medido esse número, está pagando um custo invisível que só se torna
visível quando alguém finalmente calcula.

## Antipadrões

**Comitê como gargalo**: já discutido. **Padrão sem dono**: ninguém responsável por manter o padrão
atualizado ou por decidir sobre exceções. **Exceção eterna**: uma exceção que nunca expira, que na
prática se tornou parte permanente do sistema sem nunca ter sido formalmente promovida a padrão ou
revisada.

## Exemplo numa fintech

Um time quer usar um banco de dados fora do radar atual (não está em "adotar" nem "testar"). Em vez
de negar categoricamente ou aprovar sem critério, o processo de exceção formal roda por 90 dias, com
critério explícito definido de antemão: ao final do prazo, ou o banco é promovido ao radar (se o uso
provou valor real) ou o time migra de volta para uma opção já aprovada (se não provou) — nunca uma
terceira opção de "continuar indefinidamente em exceção".

## Hands-on

**Tutorial.** Construa `governanca/radar.yaml`, `excecoes.yaml`, e um modelo de serviço conforme ao
*paved road*.

**Desafio.** Gere um serviço novo a partir do modelo e faça-o passar em todas as verificações de
conformidade.

**Invariantes testáveis**

1. Toda exceção tem `dono`, `motivo` e `expira_em`; com **relógio falso** avançado além do prazo, o
   CI **falha** — a exceção vencida bloqueia, não é ignorada silenciosamente.
2. Um serviço gerado pelo modelo passa em **todas** as verificações de conformidade **sem edição
   manual** — a primeira execução já é conforme.
3. Todo item do radar tem anel, dono e data de revisão — verificado por *lint* sobre
   `radar.yaml`, nenhum campo ausente.
4. Toda ADR lista as **partes consultadas** — verificado por *lint* sobre o documento da ADR.
5. O tempo médio de decisão é **calculado** a partir dos timestamps dos próprios ADRs registrados —
   nunca estimado de memória.
6. Uma regra marcada como **padrão** bloqueia o CI se violada; uma marcada como **diretriz** não
   bloqueia, mas aparece no relatório de conformidade — as duas categorias têm comportamento
   verificavelmente diferente.

**Complemento.** Meça quanto tempo uma aprovação síncrona de comitê custaria, em espera, para o
volume real de decisões do seu contexto de trabalho.

**Checagem**

1. Qual é a diferença entre comitê de arquitetura e processo de aconselhamento, e por que o segundo
   escala melhor?
2. Por que confundir padrão com diretriz causa atrito ou permite violação sistemática, dependendo
   de qual direção da confusão ocorre?
3. Por que um radar tecnológico só tem valor se mantido pela própria equipe, com revisão periódica?
4. O que distingue *paved road* verificado automaticamente de um checklist manual revisado
   esporadicamente, em termos de escalabilidade de governança?

> **Reencontro — `system-design/15`; `spring-boot/13`; `seguranca-aplicacao/13`; `kubernetes/14`;
> `observabilidade/12`; `entrega-continua-e-devops/10`.** A trajetória de IC
> sênior/staff de `system-design/15` é onde a habilidade de tomar decisão sem autoridade formal
> central (o espírito do processo de aconselhamento) já é discutida. O time de plataforma de
> `spring-boot/13` (Conway) é quem tipicamente mantém o *paved road* por dentro. A ordem dos *gates*
> de segurança de `seguranca-aplicacao/13` é um componente concreto do modelo de pipeline conforme.
> A decisão de custo de `kubernetes/14` é o tipo de critério que um radar tecnológico também precisa
> capturar. O SLO de `observabilidade/12` é outro exemplo de "regra que só vale alguma coisa quando
> verificada automaticamente" — a mesma disciplina de conformidade como código. E
> `entrega-continua-e-devops/10` é, especificamente, quem constrói o modelo de pipeline que este
> marco verifica.

## Principais aprendizados

- Direitos de decisão claros evitam que arquitetura se torne negociação política — sem eles,
  decisões conflitantes de pessoas diferentes se tornam comuns.
- Processo de aconselhamento distribui o direito de decidir para quem está mais próximo do
  problema, com obrigação de consultar — escala melhor que um comitê central que vira gargalo.
- Padrão é obrigatório e verificado; diretriz é recomendação sem bloqueio — confundir as duas
  categorias causa atrito ou permite violação sistemática.
- *Paved road* torna o caminho certo o mais fácil, não o mais disciplinado — e sua conformidade
  verificada automaticamente escala sem crescer o time de governança proporcionalmente.
- O custo de governança é majoritariamente tempo de espera, e deveria ser medido — não assumido
  como um custo invisível e aceitável.
