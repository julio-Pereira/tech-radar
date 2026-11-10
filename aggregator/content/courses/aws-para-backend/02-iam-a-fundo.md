---
id: iam-a-fundo
title: "IAM a fundo"
summary: "IAM é o perímetro real da AWS; menor privilégio só existe se for provado por teste. A lógica de avaliação (Deny explícito vence, Allow necessário, negação implícita por padrão, os dois lados entre contas), SCP e permissions boundary como cortes, papéis e o confused deputy, Pod Identity × IRSA, e um avaliador didático em Go que reproduz a tabela da documentação."
estimatedMinutes: 65
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [seguranca, arquitetura]
references:
  - title: "IAM — Policy evaluation logic"
    url: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
  - title: "IAM — Cross-account policy evaluation logic"
    url: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html
  - title: "IAM — Permissions boundaries"
    url: https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html
  - title: "Amazon EKS — Identity and access management (best practices)"
    url: https://docs.aws.amazon.com/eks/latest/best-practices/identity-and-access-management.html
---

## O perímetro é o IAM

Numa rede de data center, o perímetro é o *firewall*. Na AWS, quase todo serviço tem uma API pública na
internet, e o que decide se uma chamada passa é o **IAM**. Uma permissão a mais é uma porta aberta, mesmo
com a rede fechada (marco 03). Por isso, menor privilégio não é uma intenção de revisão: é uma propriedade
que um teste prova.

Toda requisição tem quatro partes:

- o **principal**, quem chama: um papel, um usuário ou um serviço da AWS;
- a **ação**, por exemplo `sqs:SendMessage`;
- o **recurso**, pelo ARN, por exemplo `arn:aws:sqs:sa-east-1:111111111111:pagamentos`;
- as **condições**, o contexto: origem, *tags*, se a conexão usa TLS.

## Os tipos de política

| Política | Onde fica | O que faz |
| --- | --- | --- |
| de identidade | no papel ou no usuário | concede ações ao principal |
| de recurso | no recurso (*bucket*, fila, chave KMS) | concede acesso ao recurso, e nomeia o principal |
| *permissions boundary* | no papel | limita o máximo que a política de identidade pode conceder |
| SCP | na OU ou na conta (marco 01) | limita o máximo da conta inteira |
| *session policy* | na sessão do `AssumeRole` | limita a sessão |

Só as duas primeiras **concedem**. As outras três **cortam**: se existem, a ação precisa estar permitida
nelas também.

## A lógica de avaliação

A documentação oficial (conferida em 10 nov 2026) descreve uma sequência:

1. **Negação explícita vence.** Um `Deny` aplicável em qualquer política encerra a avaliação com negação.
2. **Os cortes precisam permitir.** Com SCP, *permissions boundary* ou *session policy* presentes, todas
   precisam ter um `Allow` para a ação.
3. **Alguém precisa conceder.** Na mesma conta, basta uma política de identidade **ou** uma de recurso
   permitir.
4. **O resto é negação implícita.** Sem nenhum `Allow`, a resposta é negar.

**Entre contas, os dois lados.** Quando o principal está numa conta e o recurso em outra, a política de
identidade da conta de origem **e** a política de recurso da conta de destino precisam permitir. Uma só
não basta.

**O *boundary* corta a identidade, não o recurso.** O *permissions boundary* limita o que a política de
identidade concede. Uma política de recurso que nomeia diretamente um usuário ou uma sessão de papel não é
limitada pela negação implícita do *boundary*. Uma que nomeia o ARN do papel é. Essa nuance aparece em
entrevista, e cai fácil.

### Um avaliador didático

O jeito mais rápido de aprender a lógica é escrevê-la. Um avaliador em Go para um subconjunto (identidade,
recurso, SCP e *boundary*, com `Deny` explícito, sem condições e sem curinga parcial) cabe em 80 linhas. O
coração dele:

```go
func Avaliar(r Requisicao, c Contexto) string {
	for i, ps := range [][]Politica{c.Identidade, c.Recurso, c.SCP, c.Boundary} {
		if nega, _ := efeito(ps, r, i == 1); nega {
			return "ExplicitDeny"
		}
	}
	if len(c.SCP) > 0 {
		if _, permite := efeito(c.SCP, r, false); !permite {
			return "ImplicitDeny"
		}
	}
	_, idOK := efeito(c.Identidade, r, false)
	_, recOK := efeito(c.Recurso, r, true)
	if len(c.Boundary) > 0 {
		if _, permite := efeito(c.Boundary, r, false); !permite {
			idOK = false // o boundary limita só o que a identidade concede
		}
	}
	if r.ContaPrincipal != r.ContaRecurso {
		if idOK && recOK {
			return "Allow"
		}
		return "ImplicitDeny"
	}
	if idOK || recOK {
		return "Allow"
	}
	return "ImplicitDeny"
}
```

No laboratório, ele passou nos 9 casos tirados das páginas oficiais de avaliação:

- sem política nenhuma;
- identidade permite;
- `Deny` vence `Allow`;
- SCP sem a ação;
- *boundary* sem a ação;
- entre contas só com a identidade, só com o recurso e com os dois;
- mesma conta só com o recurso.

Ele é didático, não a AWS: condições, curingas parciais (`sqs:Send*`), *session policies* e as exceções
por serviço ficam de fora.

## Papéis, confiança e o *confused deputy*

Um **papel** não tem senha nem chave. Quem o assume com `sts:AssumeRole` recebe **credenciais
temporárias**, que expiram. A **política de confiança** do papel diz quem pode assumi-lo. Uma chave de
acesso de longo prazo é dívida: ela não expira, vaza em *log* e em repositório, e precisa de rotação manual
(`seguranca-aplicacao/10`). Pessoas entram pelo **IAM Identity Center**, com SSO e credenciais temporárias.

O ***confused deputy*** é o caso de um serviço com permissão legítima ser usado para agir em nome de quem
não deveria. Exemplo: o SNS pode publicar na sua fila, mas qualquer tópico de qualquer conta, se a
política da fila só disser "o serviço SNS". A defesa é condicionar a confiança à origem:

- **`aws:SourceArn` ou `aws:SourceAccount`**, quando um serviço da AWS assume o papel ou acessa o recurso
  em nome de um recurso seu;
- **`ExternalId`**, quando um terceiro (um fornecedor de monitoramento, por exemplo) assume um papel na sua
  conta.

Outras condições úteis:

- `aws:PrincipalOrgID`, para aceitar só principais da sua organização;
- `aws:SecureTransport`, para exigir TLS;
- *tags* do principal e do recurso, para controle por atributo (o ABAC de `seguranca-aplicacao/08`).

O **IAM Access Analyzer** aponta recursos compartilhados com fora da conta e permissões não usadas. Ele é a
versão contínua do que o teste sobre o plano faz no PR.

## Identidade de *workload*

O código nunca carrega chave. Ele recebe um papel pelo lugar onde roda:

| Onde roda | Como recebe o papel |
| --- | --- |
| EC2 | *instance profile* |
| ECS | *task role* |
| Lambda | papel de execução |
| EKS | **EKS Pod Identity**, a recomendação atual da AWS, ou IRSA |

No EKS, a documentação de boas práticas (conferida em 10 nov 2026) recomenda o **Pod Identity**:

- dispensa o provedor OIDC por *cluster*;
- evita o limite de 100 provedores OIDC por conta;
- usa um agente em cada nó.

O **IRSA** continua suportado e é o caminho onde o Pod Identity não chega: Fargate, nós Windows e
*clusters* fora do EKS. O conceito de identidade de *workload* está em `kubernetes/10`.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Entra ID + RBAC do Azure | IAM (políticas JSON) | o Azure atribui papéis a escopos; na AWS a política descreve ação e recurso, e a política de recurso é comum |
| *managed identity* | papel IAM (*instance profile*, *task role*, Pod Identity) | a mesma ideia: identidade sem segredo, com credencial temporária |
| *deny assignment* / Azure Policy | `Deny` explícito, SCP, *permissions boundary* | na AWS, o corte por SCP vale para a conta toda, inclusive o raiz |
| PIM para acesso elevado | Identity Center com conjuntos de permissão e sessões curtas | o elevado vem por papel assumido, nunca por usuário com chave |

> **O que o emulador não reproduz.** O `moto` não aplica IAM como a AWS: por padrão, ele aceita qualquer
> chamada. Por isso, os invariantes deste marco são sobre o **plano** e sobre o avaliador, nunca sobre o
> comportamento do emulador. A avaliação real se confere no IAM Policy Simulator, com uma conta.

## Exemplo numa fintech

O `pix-gateway` precisava publicar na fila de pagamentos. A política de identidade foi escrita com
`"Resource": "*"`, "porque o ARN da fila ainda não existia". Meses depois, outro time criou na mesma conta a
fila de estornos manuais. O `pix-gateway`, com um erro de configuração, publicou pedidos de pagamento nela,
e o processamento de estornos tentou devolver o que nunca tinha sido pago. No avaliador, a mesma política
com curinga deu `Allow` na fila de estornos, e a política com o ARN deu `ImplicitDeny`. A correção:
`Resource` com o ARN da fila e uma regra sobre o plano que reprova `"*"` fora de uma lista revisada.

## Hands-on

**Tutorial.** Implemente o avaliador didático em Go, com os tipos `Declaracao`, `Politica`, `Requisicao` e
`Contexto`, e a tabela de casos da documentação como teste. Cada caso leva o *link* da página oficial de
onde veio.

**Desafio.** As políticas do `pix-gateway` e do `ledger-core` no `fin-aws`: identidade, recurso (fila,
segredo, tabela) e confiança, com a matriz "principal × ação × recurso" esperada.

**Invariantes testáveis**

1. **O avaliador concorda com a documentação.** A tabela de casos (sem política, `Deny` vence, SCP,
   *boundary*, entre contas com um lado e com os dois, mesma conta só com recurso) passa, cada caso com a
   fonte.
2. **Nenhum `Action: "*"` nem `Resource: "*"`** em política do plano, fora de uma lista de exceções
   revisada. A política sobre o JSON do plano reprova a *fixture* com curinga.
3. **Toda política de confiança de papel assumível por serviço tem `aws:SourceArn` ou
   `aws:SourceAccount`.** A *fixture* sem a condição reprova.
4. **A matriz é completa.** Para cada principal, cada par ação × recurso da matriz dá `Allow` no avaliador,
   e qualquer par fora dela dá negação. Por exemplo, o `pix-gateway` lendo a fila (`ReceiveMessage`), ou
   lendo o segredo do `ledger-core`.

**Complemento.** Com uma conta real e orçamento criado antes, crie os papéis do desafio e compare o
resultado do IAM Policy Simulator com o do avaliador para os mesmos casos. Destrua tudo no fim.

**Checagem**

1. Em que ordem a lógica de avaliação decide, e por que um `Deny` explícito encerra tudo?
2. O que muda numa requisição entre contas?
3. O que um *permissions boundary* limita, e o que ele não limita?
4. Como `aws:SourceArn` resolve o *confused deputy*?

## Principais aprendizados

- O IAM é o perímetro. Menor privilégio se prova com teste, sobre o plano.
- Só identidade e recurso concedem. SCP, *boundary* e *session policy* só cortam.
- `Deny` explícito vence. Na mesma conta, um `Allow` basta; entre contas, os dois lados.
- Papel com credencial temporária, nunca chave de longo prazo. Pessoas pelo Identity Center.
- Confiança com `aws:SourceArn`, `aws:SourceAccount` ou `ExternalId` contra o *confused deputy*.
- No EKS, Pod Identity é a recomendação; IRSA onde ele não chega.
- O emulador não avalia IAM; o avaliador didático e o plano, sim.
