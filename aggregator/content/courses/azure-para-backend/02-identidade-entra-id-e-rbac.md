---
id: identidade-entra-id-e-rbac
title: "Identidade: Entra ID e RBAC"
summary: "No Azure, o perímetro é a atribuição de papel no escopo certo; menor privilégio só existe quando o escopo é o recurso, e quando é provado por teste. Managed identity e federação sem segredo, role definition e assignment, a avaliação (deny assignment primeiro, papéis somados, NotActions que não nega), o plano de controle × o plano de dados e o listKeys que contorna o RBAC — com um avaliador didático em Go que pegou, por mutação, o erro de tratar NotActions como negação."
estimatedMinutes: 65
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [seguranca, arquitetura]
references:
  - title: "Azure RBAC — What is Azure role-based access control?"
    url: https://learn.microsoft.com/azure/role-based-access-control/overview
  - title: "Azure RBAC — Understand role definitions"
    url: https://learn.microsoft.com/azure/role-based-access-control/role-definitions
  - title: "Azure RBAC — Troubleshoot limits"
    url: https://learn.microsoft.com/azure/role-based-access-control/troubleshoot-limits
  - title: "Azure Storage — Authorize access to blob data in the Azure portal"
    url: https://learn.microsoft.com/azure/storage/blobs/authorize-data-operations-portal
---

## Quem é quem no Entra ID

O **Microsoft Entra ID** (antigo Azure AD) é o diretório. Para um backend, importam quatro objetos:

- **usuário e grupo**, para pessoas. A permissão vai para o grupo, nunca para a pessoa;
- ***app registration***, a definição de uma aplicação no diretório;
- ***service principal***, a instância daquela aplicação num tenant, que recebe os papéis;
- ***managed identity***, um *service principal* que o próprio Azure gerencia para um recurso, **sem segredo
  para guardar nem rotacionar**.

A *managed identity* tem duas formas:

| | *System-assigned* | *User-assigned* |
| --- | --- | --- |
| Vida | nasce e morre com o recurso | recurso próprio, independente |
| Compartilhamento | uma por recurso | pode ser usada por vários recursos |
| Quando | um recurso, um papel, ciclo de vida igual | o papel precisa existir antes do recurso (o Terraform cria a identidade, a atribuição e só depois o app), ou várias réplicas com a mesma identidade |

O critério do `fin-azure`: ***user-assigned*, uma por serviço, nunca compartilhada entre serviços**.
Compartilhar soma as permissões de todos em cada um.

**Federação de *workload*.** Para o que roda fora do Azure (GitHub Actions) ou no AKS, a identidade confia num
emissor OIDC externo: o *token* do GitHub ou da *service account* do Kubernetes é trocado por um *token* do
Entra ID, sem segredo nenhum. É a identidade de *workload* de `kubernetes/10` e o OIDC da esteira de
`entrega-continua-e-devops/02`. O segredo ou o certificado de *service principal* é dívida: ele vaza, vence e
precisa de rotação.

**Credencial no código.** O `DefaultAzureCredential` serve ao desenvolvimento. Em produção, a recomendação atual
da Microsoft é uma credencial explícita (`ManagedIdentityCredential` ou a de federação), porque a cadeia pode cair
num método inesperado sem aviso.

## Papel, atribuição e escopo

Uma ***role definition*** é uma lista de permissões em quatro campos:

- `Actions` e `NotActions`, no **plano de controle** (o Azure Resource Manager: criar, alterar, apagar,
  listar chaves);
- `DataActions` e `NotDataActions`, no **plano de dados** (ler o *blob*, enviar à fila, ler o segredo).

Uma ***role assignment*** liga **principal + papel + escopo**. O escopo é um nó da árvore do marco 01
(*management group*, assinatura, *resource group* ou recurso), e a atribuição vale para ele e para tudo abaixo.

Conferido em 12 nov 2026: até **5.000 atribuições por assinatura**, um limite fixo que não aumenta, e 500 por
*management group*. A atribuição para grupo, e não para cada identidade, é também o que mantém a conta abaixo
do teto.

## Como o acesso é decidido

A ordem da documentação:

1. **As *deny assignments* primeiro.** Uma que se aplique bloqueia, mesmo contra o `Owner`.
2. **As atribuições do principal** (e dos grupos dele) que abrangem o escopo são **somadas**: basta uma conceder.
3. **As condições** das atribuições, quando houver, filtram o que o papel concedeu.

Três consequências que caem em entrevista:

- **`NotActions` não é negação.** Ele só tira ações **daquele papel**. O `Contributor` tem `*` em `Actions` e,
  entre outras, `Microsoft.Authorization/*/Write` em `NotActions`: ele não atribui papel. Mas se o mesmo
  principal tiver também o `User Access Administrator`, a soma concede. A negação explícita do Azure é a ***deny
  assignment***.
- ***Deny assignments* existem em dois tipos.** As da plataforma (criadas por Deployment Stacks e aplicações
  gerenciadas, por exemplo) e as atribuídas pelo usuário. Conferido em 12 nov 2026: as do usuário negam escrita,
  exclusão e ações num escopo, mas **não cobrem leitura nem ações de dados**, não aceitam grupo como principal e
  exigem pelo menos um principal excluído. Elas são raras e servem para proteger, não para desenhar acesso.
- **Condições não negam.** Uma condição de atribuição (ABAC, hoje para Blob, inclusive o Data Lake Gen2, e Queue Storage) só restringe o que
  o papel concede.

## Plano de controle × plano de dados

O `Owner` da assinatura **não lê um *blob*** pelo RBAC de dados: o papel não tem `DataActions`. Mas o `Owner`
tem `Microsoft.Storage/storageAccounts/listkeys/action`, que devolve as **chaves da conta**. Com a chave, ele lê
tudo pela autorização *Shared Key*, por fora do RBAC. O portal faz isso sozinho: se você tem `listkeys`, ele usa
a chave para mostrar os dados.

É por isso que o marco 08 desliga a *shared key*. Com ela ligada, o papel de controle é, na prática, papel de
dados.

**Papéis do Entra × papéis do Azure.** O papel do Entra (*Global Administrator*, *Application Administrator*)
age sobre o diretório: usuários, aplicações, consentimentos. O papel do Azure (RBAC) age sobre os recursos. Um
*Global Administrator* pode se elevar para *User Access Administrator* na raiz da árvore, e esse é o caminho de
emergência que precisa de alarme. Para pessoas, o acesso privilegiado vai pelo **PIM** (*Privileged Identity
Management*): papel elegível, ativado por tempo limitado, com justificativa. A autorização no nível da
aplicação, do escopo ao ReBAC, é de `seguranca-aplicacao/08`; o ciclo de vida de segredos e chaves, de
`seguranca-aplicacao/10`.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| política IAM anexada | *role definition* + *role assignment* no escopo | a permissão está no par papel-escopo, e herda pela árvore |
| *role* + `AssumeRole` | *managed identity* ou federação de *workload* | o Azure entrega o *token* à identidade do recurso, sem política de confiança escrita por você |
| *permissions boundary* | sem equivalente direto | o teto é o escopo da atribuição e o Azure Policy |
| `Deny` explícito | *deny assignment* | rara, com limites, e não cobre leitura nem dados |
| IRSA / EKS Pod Identity | AKS Workload Identity | federação OIDC entre a *service account* e a identidade *user-assigned* |

O marco gêmeo é `aws-para-backend/02`.

> **Armadilha.** Achar que `NotActions` bloqueia, e dar `Contributor` no *resource group* à identidade da
> aplicação "para ela conseguir ler o Key Vault". O `Contributor` não lê o segredo pelo RBAC de dados, mas
> gerencia o vault, o storage e a fila do grupo inteiro, e lista as chaves da conta de storage.

> **O que o laboratório não reproduz.** Os emuladores não aplicam RBAC: aceitam a *connection string* com
> chave e não avaliam papel. O avaliador didático cobre um subconjunto (escopo, curinga, soma, *deny
> assignment*); ele não modela grupos aninhados, condições, PIM nem a propagação, que pode levar minutos.

## Exemplo numa fintech

O `pix-gateway` precisava enviar para a fila de liquidação e ler dois segredos. Para "não travar o
lançamento", a identidade dele recebeu `Azure Service Bus Data Owner` no *namespace*. Meses depois, um *bug* no
código de configuração chamou a API de administração e **apagou a fila de outro serviço** no mesmo *namespace*.
A correção:

- `Azure Service Bus Data Sender` na **fila** de liquidação, e só nela;
- `Key Vault Secrets User` no vault do serviço;
- uma regra sobre o código que reprova papel `Data Owner`, `Owner`, `Contributor` e `User Access Administrator`
  para identidade de aplicação.

## Hands-on

**Tutorial.** Escreva em Go o **avaliador didático de RBAC**: escopo como prefixo de caminho, curinga em
`Actions`, `NotActions` e `DataActions`, soma de atribuições e *deny assignment* com principais excluídos. Cada
caso de teste traz o resultado esperado e a página da documentação de onde ele vem.

**Desafio.** As identidades e as atribuições do `pix-gateway` e do `ledger-core`, com as regras sobre o código
em `politicas/identidade.rego`.

**Invariantes testáveis**

1. **O avaliador concorda com a documentação.** A tabela de casos inclui:
   - a negação implícita;
   - a herança do *resource group* para o recurso, sem herança para o irmão;
   - o `Contributor` que não atribui papel;
   - o caso "`NotActions` num papel + outro papel concede = permitido";
   - o `Owner` que não lê o *blob* pelo RBAC de dados, mas lista as chaves;
   - a *deny assignment* que vence o `Owner`, com o principal excluído passando.

   Medido: os 10 casos passaram. Na **mutação** que trata `NotActions` como negação global, o caso
   "outro papel concede" falhou, e o teste pegou o erro mais comum de quem vem da AWS.
2. **Nenhum escopo nem papel largo para aplicação.** Nenhuma identidade de aplicação tem atribuição em escopo de
   assinatura ou de *management group*, nem `Owner`, `Contributor`, `User Access Administrator` ou papel
   `Data Owner`.
3. **Nenhum segredo de *service principal*.** Só *managed identity* ou credencial federada. Medido: o código bom
   passou nas 3 regras, e a *fixture* ruim foi reprovada em **4 achados**:
   - o escopo de assinatura;
   - o `Contributor`;
   - o `Data Owner` no *namespace*;
   - um `azuread_application_password`.
4. **A matriz é completa.** Para o `pix-gateway`, enviar à fila de liquidação é permitido. Receber dela, enviar
   a outra fila e apagar a fila são negados.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, crie as atribuições do desafio e
compare o avaliador com o "Check access" do portal, caso a caso. Destrua tudo no fim.

**Checagem**

1. Em que ordem o Azure decide um acesso, e por que `NotActions` não é negação?
2. Por que o `Owner` da assinatura consegue ler os dados de uma conta de storage, e como impedir?
3. Quando *system-assigned*, quando *user-assigned*?
4. Por que federação de *workload* e não segredo de *service principal*?

## Principais aprendizados

- O perímetro é principal + papel + escopo, com herança pela árvore. O escopo certo é o recurso.
- *Deny assignment* primeiro, atribuições somadas, condições filtrando. `NotActions` só subtrai do próprio papel.
- O plano de controle e o de dados são separados, mas o `listkeys` junta os dois enquanto a *shared key* estiver
  ligada.
- *User-assigned*, uma por serviço; federação no lugar de segredo; credencial explícita em produção.
- Até 5.000 atribuições por assinatura, limite fixo (nov 2026). Atribua a grupos.
- O avaliador provou os casos da documentação e pegou, por mutação, o `NotActions` tratado como negação.
