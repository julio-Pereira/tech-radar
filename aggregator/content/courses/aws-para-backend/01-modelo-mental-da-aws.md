---
id: modelo-mental-da-aws
title: "O modelo mental da AWS"
summary: "Conta, região e zona de disponibilidade são fronteiras de falha, de segurança e de custo, e a conta é a mais forte das três. Organizations, OUs e SCP como código, provados sobre o plano sem conta nenhuma; o que é regional, zonal e global; a responsabilidade compartilhada de EC2 a Lambda; e a armadilha medida do tags_all que some do plano quando falta default_tags."
estimatedMinutes: 50
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [arquitetura, seguranca]
references:
  - title: "AWS Well-Architected Framework"
    url: https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html
  - title: "AWS Well-Architected — Financial Services Industry Lens"
    url: https://docs.aws.amazon.com/wellarchitected/latest/financial-services-industry-lens/financial-services-industry-lens.html
  - title: "AWS Organizations — Service control policies"
    url: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html
  - title: "AWS — Shared Responsibility Model"
    url: https://aws.amazon.com/compliance/shared-responsibility-model/
---

## Três fronteiras, e a mais forte é a conta

Quem chega à AWS tende a pensar primeiro em região, porque é o que aparece no console. Mas há três
fronteiras, e cada uma isola uma coisa diferente:

- **Conta.** É a fronteira de segurança e de custo. Uma permissão, uma cota ou uma fatura nunca cruza
  contas sem que alguém configure isso de propósito. Um engano com permissões numa conta de *sandbox* não
  alcança a produção que vive em outra conta.
- **Região.** É a fronteira de falha geográfica e de residência de dado. Cada região é independente, e a
  maioria dos serviços é regional: uma fila em `sa-east-1` não existe em `us-east-1`.
- **Zona de disponibilidade (AZ).** É a fronteira de falha física dentro da região: energia, rede e
  refrigeração separadas. A resiliência padrão de um serviço é distribuí-lo por mais de uma AZ
  (marco 10, com o desenho multi-região de `system-design/13`).

Saber o escopo de cada recurso evita surpresas. Uma sub-rede e um volume de disco são **zonais**. Uma
VPC, uma fila, uma tabela DynamoDB e um *bucket* são **regionais** (o nome do *bucket* é único no mundo,
mas os dados ficam numa região). IAM, Organizations e o DNS público do Route 53 são **globais**. Um papel
IAM criado uma vez vale em todas as regiões da conta.

## Organizations, OUs e SCP

Uma fintech não tem uma conta: tem dezenas. As **AWS Organizations** agrupam as contas numa árvore de
**unidades organizacionais** (OUs), e uma **SCP** (*service control policy*) presa a uma OU limita o que
qualquer identidade das contas abaixo dela pode fazer, inclusive o usuário raiz da conta. A exceção é a
**conta de gerenciamento** da organização, que nenhuma SCP limita. Por isso ela não roda carga de
trabalho nenhuma.

A SCP **não concede** nada. Ela corta. Uma ação só é permitida se a SCP deixa **e** uma política de
identidade concede (marco 02). Por isso a SCP é o lugar dos *guardrails* que nenhuma equipe pode
desligar, como os de `arquitetura-de-solucoes/05`:

```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "organizations:*", "sts:*", "support:*"],
  "Resource": "*",
  "Condition": { "StringNotEquals": { "aws:RequestedRegion": ["sa-east-1", "us-east-1"] } }
}
```

Essa SCP nega qualquer ação fora das duas regiões aprovadas. Os serviços globais ficam de fora no
`NotAction`, porque a requisição deles chega por uma região própria, e negá-los quebraria o IAM.

Uma estratégia de contas típica para o `fin-platform`:

| OU | Contas | Por quê |
| --- | --- | --- |
| Segurança | *log* central, auditoria | quem é auditado não apaga o próprio *log* |
| Infraestrutura | rede compartilhada | a saída controlada (marco 03) mora num lugar só |
| Produção | uma conta por domínio (ledger, Pix) | raio de explosão e custo por domínio |
| Não produção | homologação e desenvolvimento | dado de produção nunca chega aqui |
| *Sandbox* | experimentação, com orçamento | liberdade sem acesso ao resto |

## Responsabilidade compartilhada

A AWS cuida da segurança **da** nuvem (data centers, *hardware*, o *hypervisor*). O cliente cuida da
segurança **na** nuvem. A linha muda conforme o serviço:

| Serviço | Quem atualiza o sistema operacional | Quem configura rede e identidade |
| --- | --- | --- |
| EC2 | você | você |
| ECS no Fargate | a AWS | você (*task role*, *security group*) |
| Lambda | a AWS (o *runtime* gerenciado) | você (papel de execução, VPC, concorrência) |

Em nenhuma linha a AWS cuida da sua permissão, do seu dado ou da sua chave. Um *bucket* público é sempre
responsabilidade do cliente (marco 08).

## Well-Architected e a *lens* de serviços financeiros

O **Well-Architected Framework** organiza as boas práticas em seis pilares: excelência operacional,
segurança, confiabilidade, eficiência de desempenho, otimização de custo e sustentabilidade. A
**Financial Services Industry Lens** acrescenta perguntas específicas do setor: auditabilidade, recuperação
de incidente cibernético, *open banking* e pagamentos. A versão de jan 2026 acrescentou práticas para
sistemas de IA. Ela é uma lista de perguntas para revisar um desenho, não uma arquitetura pronta.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| *management group* / *subscription* | Organizations / conta | a conta AWS é uma fronteira mais dura que a *subscription*: identidade e cota são da conta |
| Azure Policy | SCP + AWS Config | a SCP só nega e corta; a avaliação de conformidade e a correção ficam no Config |
| *resource group* | *tags* e *stacks* | não há equivalente direto. Sem *resource group*, o agrupamento por dono e por custo depende de *tags* consistentes, e por isso elas são obrigatórias |

O marco gêmeo no Azure é `azure-para-backend/01`.

Região no Brasil: `sa-east-1` (São Paulo). Escolher região é também uma decisão de residência de dado,
com a LGPD pesando na conta.

## Provar antes de existir uma conta

As contas, as OUs e as SCP do `fin-aws` são código Terraform. O `plan` roda sem conta: com o provedor
`aws` 6.72.0 e `skip_credentials_validation`, o plano da organização saiu com `6 to add` sem nenhuma
chamada a uma conta real. A política sobre o JSON do plano (Conftest, `entrega-continua-e-devops/06`)
prova o resto.

Uma armadilha medida no laboratório: as *tags* obrigatórias vêm de `default_tags` no provedor e aparecem
no plano como `tags_all`. **Sem `default_tags`, o `tags_all` vira "conhecido só depois do `apply`"** e some
do `after` do JSON. Uma regra que lê só o `after.tags_all` passa calada. Ela precisa tratar o atributo
desconhecido como "sem *tag*". Com a regra corrigida, a *fixture* sem `default_tags` reprovou 5 recursos.

## Exemplo numa fintech

Um time criou a conta de produção do Pix fora de qualquer OU, "provisoriamente", para não esperar a
equipe de plataforma. A SCP de regiões não valia ali. Meses depois, um *script* de teste de carga, rodado
com a credencial errada, subiu instâncias em `us-west-2`. O custo apareceu na fatura do mês, e a
auditoria apontou dado de teste com CPF fora das regiões aprovadas. A correção levou uma linha: mover a
conta para a OU de produção. A prevenção ficou num teste: nenhuma conta fora de uma OU com SCP, verificado
sobre o plano.

## Hands-on

**Tutorial.** Crie o repositório `fin-aws` com o layout do `fin-iac`, o provedor `aws` com
`skip_credentials_validation`, `skip_requesting_account_id` e `default_tags`, e o Conftest. Rode o `plan`
e leia o `tags_all` no JSON.

**Desafio.** O desenho de contas e OUs do `fin-platform` como código: as OUs da tabela acima, uma conta
por domínio de produção e a SCP de regiões presa à OU de produção.

**Invariantes testáveis**

1. **Nenhuma conta fora de uma OU com SCP.** A política lê a configuração do plano, segue a referência
   `parent_id` de cada `aws_organizations_account` até uma OU e exige que essa OU seja alvo de um
   `aws_organizations_policy_attachment`. Uma *fixture* com uma conta presa à raiz reprova.
2. **A SCP nega regiões não aprovadas.** A política exige uma SCP com `Deny` e condição
   `aws:RequestedRegion`, e reprova um provedor configurado numa região fora da lista. A *fixture* com
   `us-west-2` reprova.
3. **Todo recurso tem as *tags* obrigatórias** (`owner`, `cost-center`, `data-classification`). A regra
   trata o `tags_all` desconhecido como ausente. A *fixture* sem `default_tags` reprova, e a com
   `default_tags` passa.

**Complemento.** Com uma conta real e orçamento criado antes, aplique só a SCP numa OU de teste e tente
criar um recurso em `us-west-2` a partir de uma conta dentro dela. Leia o erro de `AccessDenied` e
destrua tudo no fim.

**Checagem**

1. Por que a conta é uma fronteira mais forte que a região?
2. Uma SCP com `Allow` dá acesso a uma ação? O que mais é preciso?
3. Dê um recurso zonal, um regional e um global.
4. Por que uma regra de *tags* que lê só o `tags_all` do plano pode passar calada?

## Principais aprendizados

- Conta isola segurança e custo; região isola falha geográfica e residência; AZ isola falha física.
- Saiba o escopo de cada recurso: zonal, regional ou global.
- A SCP só corta. O acesso exige a SCP deixar e a identidade conceder.
- A responsabilidade compartilhada muda com o serviço, mas permissão, dado e chave são sempre seus.
- Sem *resource group*, as *tags* são o agrupamento. Prove-as sobre o plano, tratando o desconhecido como
  ausente.
