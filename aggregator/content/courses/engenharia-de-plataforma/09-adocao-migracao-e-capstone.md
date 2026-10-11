---
id: adocao-e-capstone
title: "Adoção, migração e capstone"
summary: "Uma plataforma vence quando as equipes migram por escolha e o caminho antigo pode ser desligado — e perde quando vira obrigatória sem ser melhor. Capstone da trilha."
estimatedMinutes: 70
references:
  - title: "CNCF Platform Engineering Maturity Model"
    url: https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/
---

## Funil de adoção

**Descobriu** → **experimentou** → **migrou** → **ficou** — um funil que, como qualquer funil de
produto, revela **onde** as equipes desistem, não apenas quantas chegaram ao fim. Uma equipe que
descobre a plataforma mas nunca experimenta aponta para um problema diferente de uma equipe que
experimenta mas não migra, que por sua vez é diferente de uma equipe que migra mas depois volta
para o caminho antigo ("não ficou").

## Migração de equipes como *strangler* da plataforma

Migrar equipes para a plataforma segue a mesma disciplina de *strangler* (`system-design/14`, por
link, não reensinada aqui): **coexistência** (o caminho antigo e o novo funcionando ao mesmo tempo
por um período), **prazo** (não indefinido), e **ponto de retorno** (até onde é fácil desistir da
migração se algo não funcionar como esperado).

## Aposentar o caminho antigo: bloquear novos, depois migrar o legado

A sequência correta para desligar um caminho antigo: primeiro, **bloquear novos usos** (nenhum
serviço novo pode mais ser criado pelo caminho antigo); depois, **migrar o legado** existente
gradualmente. Tentar fazer as duas coisas ao mesmo tempo — ou migrar o legado antes de bloquear
novos usos, deixando a porta antiga ainda aberta — prolonga indefinidamente a necessidade de manter
os dois caminhos funcionando.

## Medir valor: tempo até o primeiro deploy, % em *golden path*, DORA antes/depois

Os números que comprovam que a plataforma está funcionando: o **tempo até o primeiro deploy**
(marco 01) comparado antes e depois; o **percentual de serviços no *golden path*, por versão** (não
só "estão usando o golden path", mas qual versão — conectando ao *drift* de template do marco 04);
métricas DORA antes/depois da adoção (**confira** as definições vigentes); e pesquisa de
experiência do desenvolvedor.

## Roadmap e priorização por dor

O roadmap de evolução da plataforma continua priorizado pela mesma lógica do marco 01: por **dor**
real das equipes, não por "o que parece mais interessante de construir" do ponto de vista da
equipe de plataforma.

## Comprar × construir a própria IDP (aplicando `arquitetura-de-solucoes/04`)

Um estudo **comparativo e neutro** de portal/catálogo (Backstage e alternativas) e de composição de
infraestrutura (Crossplane e alternativas), aplicando diretamente o framework de TCO e
sensibilidade de `arquitetura-de-solucoes/04` (**trilha planejada**) — com critérios explícitos,
**sem recomendar produto**, e com licenças e maturidade a **conferir** antes de qualquer decisão
real.

## Estrutura da equipe e do suporte, e quando encerrar um recurso

À medida que a plataforma cresce, a estrutura da equipe que a mantém precisa evoluir — e, assim como
qualquer capacidade de produto, uma capacidade da plataforma que não é mais usada, ou que nunca
provou valor suficiente, merece ser **encerrada** deliberadamente, não mantida indefinidamente por
inércia.

## A revisão da plataforma como um todo

O exercício final consolida tudo: catálogo, *golden paths*, ambientes, segurança, operação, custo, e
adoção — numa revisão única que confirma (ou refuta) que a plataforma, como um todo, está cumprindo
a promessa do marco 01: reduzir carga cognitiva e ser escolhida, não imposta.

## Exemplo numa fintech

Três equipes migram para a plataforma voluntariamente, atraídas pela redução real de tempo até o
primeiro deploy. Uma quarta equipe **resiste** — não por teimosia, mas por um motivo **legítimo**:
um requisito regulatório específico do sistema dela que a plataforma, na versão atual, não atende
ainda. A resposta correta não é forçar a migração (que produziria uma plataforma "imposta" para
aquela equipe) nem desistir da equipe — é a plataforma **ganhar uma capacidade nova** que resolve o
requisito, e só então completar a migração, por escolha informada.

## Hands-on

**Tutorial.** Construa `adocao/` com eventos sintéticos de adoção e o funil completo; simule o
*onboarding* de um time novo.

**Desafio.** Produza o plano de migração de um repositório com pipeline própria (fora do modelo de
pipeline conforme), e `make platform-review`.

**Invariantes testáveis**

1. O *onboarding* simulado chega ao primeiro deploy **sem passo manual** — a lista de passos
   manuais necessários é **vazia**, ou, se não for, a falha lista **cada um** especificamente.
2. A métrica "% em *golden path* por versão" é **calculada** a partir de eventos sintéticos e
   **bate** com a massa de dados conhecida usada no teste.
3. O plano de migração produz um ***diff*** que passa em **todos** os *gates* da esteira — a
   migração proposta já é conforme antes de ser aplicada.
4. Com **relógio falso** avançado além do prazo de depreciação, **novos** serviços tentando usar o
   caminho antigo são **bloqueados** — serviços já existentes não são afetados retroativamente.
5. `make platform-review` agrega as verificações dos marcos 01–08 e **falha** se qualquer uma
   falhar, com relatório de riscos, dono e prazo — a mesma disciplina de `make review` da trilha
   `arquitetura-de-solucoes`.
6. Um **risco plantado** deliberadamente (uma violação injetada em alguma verificação agregada)
   **aparece** no relatório final.

**Complemento.** Escreva a ADR "o que a plataforma deliberadamente não faz" — documentando os
limites de escopo decididos, não apenas o que foi construído.

**Checagem**

1. O que o funil de adoção revela que uma métrica única de "equipes usando a plataforma" não
   revelaria?
2. Por que a sequência correta de aposentar um caminho antigo é bloquear novos usos **antes** de
   migrar o legado, não o contrário?
3. Por que uma equipe que resiste à migração por um motivo regulatório legítimo não deveria ser
   forçada, nem simplesmente ignorada?
4. Por que o estudo de comprar × construir a própria IDP precisa ser neutro, sem recomendar
   produto, mesmo sendo uma decisão real que a organização vai tomar?

> **Reencontro — `system-design/14`; `kubernetes/13`; `observabilidade/12`; `kubernetes/14`;
> `seguranca-aplicacao/16`.** O *strangler* de `system-design/14` é a técnica de execução direta da
> migração de equipes, sem reensino. O GitOps de `kubernetes/13` entrega a definição do caminho
> novo durante a coexistência. O SLO de `observabilidade/12` é um dos números usados para medir
> valor antes/depois da adoção. A decisão de custo e quando não usar de `kubernetes/14` é onde
> "encerrar uma capacidade que não se paga mais" já apareceu num contexto adjacente. E o programa de
> segurança de `seguranca-aplicacao/16` é outro exemplo de processo que, como esta trilha inteira,
> só funciona quando produz recomendação acionável e evolui por escolha, não imposição.

## Principais aprendizados

- O funil de adoção (descobriu → experimentou → migrou → ficou) revela onde as equipes desistem —
  informação que uma métrica única de "quantas usam" nunca revelaria.
- Aposentar um caminho antigo exige bloquear novos usos antes de migrar o legado — a ordem inversa
  prolonga indefinidamente a necessidade de manter os dois caminhos.
- Uma equipe que resiste à migração por motivo legítimo não é teimosia a ser forçada — é sinal de
  uma capacidade que a plataforma ainda precisa construir.
- Comprar × construir a própria IDP usa o mesmo framework de TCO de outras decisões — neutro, sem
  recomendar produto, porque ferramentas e licenças mudam mais rápido que o conteúdo da trilha.
- Uma plataforma vence por escolha, não por imposição — o antipadrão central que esta trilha
  termina endereçando explicitamente, do marco 01 ao 09.

## Capstone

O `fin-devplatform` é a sua plataforma interna de desenvolvimento — a especificação completa está
em `PROJETO.md`, na raiz desta trilha. Aqui é onde ela fica pronta.

**Entrega**

- [ ] `plataforma/` com API `POST /v1/pedidos` e reconciliador, idempotente e atômico
- [ ] `catalogo/` com 12 entidades, *scorecards* determinísticos, e detecção de órfãos
- [ ] `templates/` v1→v2 em Java e Go, com repositórios-*fixture* e CI do próprio template
- [ ] Extensão de `plataforma/` para ambientes, com TTL, proteção e cota
- [ ] `politicas/` com *defaults* seguros, matriz de autorização, e trilha de auditoria
- [ ] `operacao/` com SLO, modelo de suporte e *runbooks*
- [ ] `custo/` com alocação, *showback*, e detecção de zumbis
- [ ] `adocao/` com funil, plano de migração, e `make platform-review`

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Toda capacidade é uma API versionada, idempotente, com política embutida; existe CLI além do
      portal (API-first)
- [ ] Todo componente do catálogo tem dono existente, relações válidas e *scorecard* reproduzível
- [ ] Um serviço novo gerado pelo *golden path* passa em **todos** os *gates* sem edição manual
- [ ] Atualizar o template propaga a todos os repositórios **sem sobrescrever personalização**;
      conflitos são reportados, nunca silenciosos
- [ ] Todo ambiente tem dono, etiquetas de custo, cota, rede *default-deny* e prazo de vida; o que
      está protegido ou com dados nunca é removido
- [ ] As permissões da própria plataforma são mínimas e testadas; um time não age sobre outro
- [ ] Toda ação da plataforma gera evidência encadeada (quem pediu, o que mudou, política
      aplicada)
- [ ] A plataforma tem SLO próprio, modelo de suporte e *runbooks*; **a plataforma fora do ar não
      derruba o que já roda**
- [ ] O custo alocado a donos soma o custo total; custo sem dono é visível e tem meta de zero
- [ ] A adoção é medida por métricas que informam decisões (tempo até o primeiro deploy, % em
      *golden path* por versão)
- [ ] Existe plano de migração e prazo de aposentadoria do caminho antigo
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das nove
capacidades que você construiu, qual só parece valer a pena porque os "clientes internos" eram
simulados e cooperativos — e que sinal, medido com uma equipe real, mostraria que ninguém a usaria
por escolha?**
