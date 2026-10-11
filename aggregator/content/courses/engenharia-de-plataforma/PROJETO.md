# Projeto guia — fin-devplatform

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
> constrói enquanto lê a trilha. O `fin-devplatform` é a **plataforma interna de desenvolvimento**
> do `fin-platform`: uma equipe de produto pede um serviço, um ambiente ou uma mudança; a
> plataforma entrega, com *defaults* seguros, evidência, custo atribuído e um caminho de volta.

## O que você vai construir

Nove pastas: `plataforma/` (o *control plane* em Go: API de autosserviço, reconciliador,
política), `catalogo/` (entidades em YAML + esquema + *scorecards*), `templates/` (*golden paths*
versionados em Java e Go + repositórios-*fixture* para testar atualização), `infra/` (módulos
Terraform locais), `politicas/` (padrões de segurança e conformidade), `operacao/` (SLO da
plataforma, modelo de suporte, *runbooks*), `custo/` (alocação e *showback*), `adocao/` (jornada,
funil e métricas) e `docs/` (ADRs). Um portal visual é **opcional**.

**Contratos com os vizinhos** (todos simuláveis com stub):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Modelo de pipeline conforme e *gates* (`make gates`) | `fin-pipeline`, trilha entrega-continua-e-devops |
| consome | Mapa de capacidades, regras de governança, radar e exceções | `fin-landscape`, trilha arquitetura-de-solucoes |
| consome | Módulos Terraform e política sobre o plano | `fin-pipeline` / `fin-landscape` |
| consome | SLOs como definição de saúde | trilha observabilidade |
| consome | Manifestos de *namespace*/cota/rede como destino (gerados, validados como arquivo) | trilha kubernetes |
| serve | API de autosserviço (serviço novo, ambiente, mudança) | equipes de produto |
| serve | Catálogo (dono, dependências, *scorecard*) | `fin-landscape` (revisão arquitetural), observabilidade (roteamento de alerta) |
| serve | Evidência de cada ação e custo por dono | auditoria, FinOps |

**O que este projeto não é.** Não cria recurso em nuvem, não escolhe fornecedor de portal, não
reimplementa GitOps nem a esteira (consome ambos) e não é um PaaS para clientes externos.

**Pré-requisitos.** Go (toolchain atual) e JDK 21+ (templates); `terraform` (ou `tofu`); `git`; o
motor de política já escolhido em ADR; `actionlint`. **Opcional:** `docker`, cluster local
(kind/k3d), um portal para estudo comparativo. **Não precisa:** conta em nuvem, ferramenta paga.
Confirmar licenças e versões na Fase 0.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `adocao/jornada.yaml` + backlog priorizado + definição de métricas | Tempo até o primeiro deploy calculado do mapa; toda métrica declara a decisão que informa; automatizar o passo de maior espera reduz o tempo (relação) |
| 02 | `plataforma/` com API `POST /v1/pedidos` e reconciliador | Mesmo pedido duas vezes = mesmo resultado; converge; quebra de contrato detectada; pedido atômico (tudo ou nada) |
| 03 | `catalogo/` com esquema, relações e *scorecards* | Todo componente tem um dono existente; relações só para entidades existentes; órfão detectado; *scorecard* determinístico |
| 04 | `templates/` v1→v2 + repositórios-*fixture* + CI do template | Serviço gerado passa nos *gates* sem edição; atualização aplica sem sobrescrever personalização e **reporta** conflitos; *drift* listado |
| 05 | Módulos Terraform locais e pedido de ambiente | Plano válido e conforme à política; cota respeitada; TTL remove só o que expirou e não está protegido; segunda aplicação sem mudança |
| 06 | `politicas/` + matriz de autorização + trilha de auditoria | Permissões da plataforma mínimas; time A não cria em *tenant* de B; toda ação gera registro encadeado; *default deny* de rede |
| 07 | `operacao/` com SLO, suporte e *runbooks* | SLO calculado do histórico e violado por degradação injetada; carga em execução não depende da plataforma; alerta sem *runbook* reprova |
| 08 | `custo/` com alocação e *showback* | Custo alocado soma o total; custo sem dono aparece como balde próprio; recurso zumbi plantado é achado |
| 09 | Funil de adoção, plano de migração e `make platform-review` | *Onboarding* de um time simulado chega ao primeiro deploy sem passo manual; caminho antigo é bloqueado após o prazo; revisão falha se qualquer parte falhar |

### Definição de pronto (capstone)

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

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **A API da plataforma cai** durante um deploy de produção. O que já roda continua? O que fica
   bloqueado?
2. **O template v2 quebra** um serviço com personalização. O CI do template pega? Quantos
   repositórios são afetados?
3. **Um time pede um ambiente enorme.** Cota e política barram? Com que mensagem?
4. **O TTL expira um ambiente com dados.** O que protege? O que teria acontecido sem proteção?
5. **Uma credencial da plataforma vaza.** Qual o raio de explosão? Que ação a evidência mostra?
6. **O custo dobra no mês.** O *showback* aponta o dono em quanto tempo? E o custo sem dono?
7. **Ninguém usa o novo caminho.** O funil mostra onde o time desiste? O que você muda?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 555 min de leitura viram ~19h porque o hands-on é
construir a capacidade, plantar a falha (conflito de template, ambiente expirado, credencial
vazada) e ver o controle agir.
