---
id: modelo-mental-do-azure
title: "O modelo mental do Azure"
summary: "Tenant, management group, assinatura e resource group formam uma hierarquia de escopo: política, permissão e custo herdam de cima para baixo. A árvore de governança como código, o Azure Policy e os seus efeitos, o que é regional, zonal e global, o par do Brazil South fora do país — e a regra sobre o código que, no laboratório, errou a herança na primeira versão."
estimatedMinutes: 50
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [arquitetura, seguranca]
references:
  - title: "Azure — Organize your resources with management groups"
    url: https://learn.microsoft.com/azure/governance/management-groups/overview
  - title: "Azure Policy — Definition effect basics"
    url: https://learn.microsoft.com/azure/governance/policy/concepts/effect-basics
  - title: "Azure — Region pairs and nonpaired regions"
    url: https://learn.microsoft.com/azure/reliability/regions-paired
  - title: "Cloud Adoption Framework — Azure landing zones"
    url: https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/
---

## Uma árvore de escopos

Quem chega ao Azure vindo da AWS procura a "conta". Ela não existe do mesmo jeito. No Azure há uma
**árvore**, e quase tudo (política, permissão, custo) é atribuído num nó dela e **herda para baixo**:

| Nível | O que é | Isola |
| --- | --- | --- |
| **Tenant** do Microsoft Entra ID (antigo Azure AD) | o diretório de identidades: usuários, grupos, aplicações | a identidade |
| ***Management group*** | um agrupamento de assinaturas | nada sozinho; é onde a política e a permissão se aplicam a muitas assinaturas de uma vez |
| **Assinatura** | a unidade de cobrança, de cota e de isolamento de recursos | custo, cota e o alcance padrão das permissões |
| ***Resource group*** | um contêiner de recursos com o mesmo ciclo de vida | o ciclo de vida: apagar o grupo apaga tudo dentro dele |
| **Recurso** | a fila, o banco, a VNet | — |

Conferido em 12 nov 2026: a árvore de *management groups* tem até **seis níveis** abaixo da raiz, sem contar
a raiz nem as assinaturas, e até 10.000 *management groups* por tenant. A orientação do CAF é manter a árvore
rasa, com três ou quatro níveis.

**O tenant é compartilhado.** Duas assinaturas no mesmo tenant compartilham o diretório: o mesmo usuário, o
mesmo grupo e a mesma aplicação podem ter papel nas duas. É por isso que a assinatura isola menos que a
conta da AWS. A fronteira mais forte do Azure, para um *sandbox* totalmente separado, é um **tenant
separado**. O *framework* da Microsoft para instituições financeiras reguladas recomenda exatamente isso
para *sandboxes*.

**O *resource group* não é fronteira de segurança forte.** Ele é uma unidade de ciclo de vida e um escopo de
permissão conveniente. Quem tem papel na assinatura alcança todos os grupos dela.

## Azure Policy: avaliar o recurso, não a chamada

O **Azure Policy** avalia as **propriedades do recurso** que está sendo criado ou alterado (a região, o SKU, o
`public network access`, as *tags*) e decide o que fazer. Essa é a diferença para a SCP da AWS, que avalia
a **ação** da API.

Conferido em 12 nov 2026, os efeitos são `addToNetworkGroup`, `append`, `audit`, `auditIfNotExists`,
`deny`, `denyAction`, `deployIfNotExists`, `disabled`, `manual`, `modify` e `mutate`. Os que um backend usa
todo dia:

| Efeito | O que faz | Quando |
| --- | --- | --- |
| `deny` | recusa a criação ou a alteração (403) | regra que não admite exceção: região fora da lista, storage público |
| `audit` | deixa passar e registra como não conforme | regra nova, antes de virar `deny`, para medir o impacto |
| `modify` | acrescenta ou corrige propriedades e *tags* na criação | herdar a *tag* `cost-center` do *resource group* |
| `deployIfNotExists` | cria um recurso relacionado quando ele falta | o *diagnostic setting* de todo recurso (marco 09) |
| `denyAction` | bloqueia uma operação específica, como apagar | proteger o recurso crítico contra exclusão |

Uma **iniciativa** (*policy set*) agrupa definições, e a **atribuição** liga a iniciativa a um escopo, com
**exceções** com prazo. O `modify` e o `deployIfNotExists` precisam de uma *managed identity* na atribuição,
para remediar o que já existe.

A política como código, o "negar por padrão, exceção com prazo" e as etiquetas obrigatórias são o assunto de
`arquitetura-de-solucoes/05`; aqui está o mecanismo do Azure.

## *Landing zone* em uma página

O **Cloud Adoption Framework** (CAF) organiza a árvore em dois lados:

- a **plataforma**, com as assinaturas de **identidade**, **gerenciamento** (*logs*, monitoramento) e
  **conectividade** (o *hub* de rede do marco 03);
- as ***landing zones* de aplicação**, uma assinatura por carga de trabalho e ambiente, cada uma sob o
  *management group* certo (`producao`, `nao-producao`, `sandbox`).

As iniciativas de *guardrails* ficam no *management group* de cima e herdam para todas as assinaturas abaixo.
Uma assinatura nova, criada fora da árvore, nasce sem *guardrail* nenhum.

## Região, zona e o par do Brazil South

- **Zona de disponibilidade:** os *datacenters* de uma região com energia, rede e refrigeração próprias. Os
  serviços são **zonais** (vivem numa zona escolhida) ou ***zone-redundant*** (espalhados pelas zonas).
- **Região:** a fronteira geográfica e de residência do dado.
- **Global:** o Entra ID, o Front Door, o DNS público e o próprio Azure Resource Manager, que é o plano de
  controle único: toda criação e alteração passa por ele.

O **par de regiões** é onde a Microsoft faz a replicação geográfica de alguns serviços (o GRS do storage, por
exemplo) e atualiza uma região de cada vez. Conferido em 12 nov 2026: o par do **Brazil South é o South Central
US**, nos Estados Unidos, e a relação não é recíproca. O **Brazil Southeast** tem **acesso restrito**, para
cenários como DR dentro do país, e é pareado com o Brazil South.

Para uma fintech regulada pelo BACEN e pela LGPD, isso pesa no desenho desde o primeiro dia:

- um *backup* com redundância geográfica do Brazil South leva o dado para fora do país;
- a residência entra na escolha de SKU (marco 08) e no DR (marco 10);
- a política de localizações permitidas é a primeira iniciativa do `fin-azure`.

O Well-Architected organiza a revisão em cinco pilares: confiabilidade, segurança, otimização de custo,
excelência operacional e eficiência de desempenho. A responsabilidade compartilhada segue a mesma lógica da AWS
(`aws-para-backend/01`): quanto mais gerenciado o serviço (IaaS → PaaS → *serverless*), menos é seu, mas a
identidade, a rede e o dado são sempre seus. A disponibilidade por região e por célula, em termos neutros, é
de `system-design/13`.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| Organizations e OUs | *management groups* | os dois herdam política; no Azure, a permissão (RBAC) também herda pela árvore |
| conta | assinatura | a assinatura compartilha o tenant: a identidade não fica isolada como na conta |
| SCP | Azure Policy `deny` | a SCP avalia a ação da API; o Policy avalia a propriedade do recurso. O Policy também corrige (`modify`) e cria o que falta (`deployIfNotExists`) |
| *tags* e *stacks* | *resource group* | o Azure tem um contêiner de ciclo de vida que a AWS não tem |
| região e AZ | região, zona e par de regiões | o par é decisão da Microsoft, e o do Brazil South fica fora do país |

O marco gêmeo é `aws-para-backend/01`.

> **Armadilha.** Tratar o *resource group* como fronteira de segurança e dar `Contributor` na assinatura
> "porque é só não produção". Com o tenant compartilhado, a identidade que tem papel largo numa assinatura de
> não produção costuma ser a mesma que alguém usa, um dia, para "só olhar" a produção.

## Exemplo numa fintech

Um time criou a assinatura do novo serviço de crédito pelo portal, com pressa para a demonstração. A
assinatura ficou no *management group* raiz, fora de `producao`. Sem a iniciativa de *guardrails*, ninguém
recusou a conta de storage criada em `eastus` nem o banco sem *tag* de dono. Três meses depois, a auditoria de
residência achou dados de proposta de crédito, com CPF, fora do país. A correção:

- a assinatura foi movida para `producao`, e a política de localizações passou a valer;
- a criação de assinaturas passou a ser só por código, com o *management group* obrigatório;
- uma regra sobre o código reprova a assinatura sem *management group* com *guardrails*.

## Hands-on

**Tutorial.** Crie o repositório do `fin-azure` com o Terraform, o provedor `azurerm` 5.13.0 e o Conftest
0.71.1. A camada de infraestrutura é a do ADR do `PROJETO.md`: `terraform test` com `mock_provider` e regras
do Conftest sobre o próprio código HCL (`--parser hcl2`), porque o provedor não planeja sem credencial.
Escreva o catálogo de invariantes compartilhado com o `fin-aws`.

**Desafio.** A árvore de governança do `fin-platform` como código: os *management groups* `fin`, `producao`
e `sandbox`, a iniciativa de *guardrails* atribuída em `fin` e as assinaturas associadas. As regras ficam em
`politicas/governanca.rego`, e a lista de regiões aprovadas num arquivo de dados.

**Invariantes testáveis**

1. **Toda assinatura sob *guardrails*.** Toda assinatura de carga está sob um *management group* que tem a
   iniciativa atribuída, nele ou num ancestral. Medido: a primeira versão da regra reprovou o código bom,
   porque comparava o endereço completo do *management group* pai com o nome do recurso. A herança só vale
   se a regra resolve a árvore, como o Azure faz.
2. **Localizações permitidas.** Todo recurso com região literal está em `brazilsouth` ou `brazilsoutheast`.
3. ***Tags* obrigatórias.** Todo recurso dos tipos com *tag* tem `owner`, `cost-center` e
   `data-classification`, resolvendo `local.tags`. A política `modify` do Azure herda as *tags* no ambiente
   real; a regra sobre o código pega a falta antes.

Medido: o código bom passou nas 3 regras. A *fixture* ruim foi reprovada em **4 achados**:

- a assinatura num *management group* solto;
- um *resource group* em `eastus`;
- `data-classification` faltando no `local.tags`;
- um *resource group* sem *tag* nenhuma.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, atribua a política de
localizações permitidas com efeito `audit`, crie um recurso fora da lista e veja o estado de conformidade.
Troque para `deny` e veja a criação ser recusada com 403. Destrua tudo no fim.

**Checagem**

1. Como a política e a permissão atribuídas num *management group* chegam a um recurso?
2. Por que a assinatura isola menos que a conta da AWS, e qual é a fronteira mais forte do Azure?
3. Quando `audit`, quando `deny` e quando `deployIfNotExists`?
4. O que o par do Brazil South muda para uma fintech brasileira?

## Principais aprendizados

- Tenant, *management group*, assinatura, *resource group*, recurso: tudo herda de cima para baixo.
- A assinatura compartilha o tenant. O isolamento forte é um tenant separado; o *resource group* é só ciclo de
  vida.
- O Azure Policy avalia a propriedade do recurso, não a ação: `deny`, `audit`, `modify`, `deployIfNotExists`
  e `denyAction`.
- Até seis níveis de *management group* (nov 2026); a orientação é três ou quatro.
- O par do Brazil South é o South Central US, fora do país; o Brazil Southeast é restrito.
- A regra sobre o código precisa resolver a herança da árvore. Medido: sem isso, ela reprovou o código bom.
