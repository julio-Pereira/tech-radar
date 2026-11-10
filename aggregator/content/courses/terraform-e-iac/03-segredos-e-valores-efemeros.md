---
id: segredos-e-valores-efemeros
title: "Segredos e valores efêmeros"
summary: "sensitive esconde da tela, não do estado; o conserto é não deixar o segredo entrar no estado. Medido: a mesma senha com sensitive aparece 1 vez no estado e 2 no plano salvo; lida de um cofre por recurso efêmero e entregue em password_wo, 0 e 0, e a aplicação autentica. O TF_LOG que registra o -var, o plano salvo como artefato sensível e a credencial do provedor por OIDC."
estimatedMinutes: 55
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [seguranca]
references:
  - title: "Terraform — Manage sensitive data in your configuration"
    url: https://developer.hashicorp.com/terraform/language/manage-sensitive-data
  - title: "Terraform — Use temporary write-only arguments"
    url: https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only
  - title: "Terraform 1.11 — ephemeral values in managed resources with write-only arguments"
    url: https://www.hashicorp.com/blog/terraform-1-11-ephemeral-values-managed-resources-write-only-arguments
  - title: "OpenTofu — Ephemerality"
    url: https://opentofu.org/docs/language/ephemerality/
---

## O problema que ficou aberto

O marco `entrega-continua-e-devops/06` terminou com uma demonstração: um valor marcado como secreto
aparece em texto claro no estado. Este marco conserta isso. A medição abaixo usa o provedor
`cyrilgdn/postgresql` 1.27.0 e o papel de aplicação do Postgres do ledger, com a mesma senha conhecida
nos dois casos:

| Como a senha entra | Na tela do `plan` | No estado | No plano salvo |
| --- | --- | --- | --- |
| variável `sensitive`, argumento `password` | `(sensitive value)` | **1 ocorrência** | **2 ocorrências** |
| recurso efêmero do cofre, argumento `password_wo` | `(write-only attribute)` | 0 | 0 |

Nos dois casos, a aplicação autentica no Postgres com a senha. A diferença é onde mais ela fica.

## `sensitive` é sobre exibição

`sensitive = true` numa variável ou saída faz o Terraform trocar o valor por `(sensitive value)` na
saída do `plan` e do `apply`. É útil: o valor não aparece no log da esteira nem na tela de quem revisa.
Mas o estado precisa guardar os atributos do recurso para comparar na próxima execução, e guarda o valor
inteiro, em texto claro, com uma marca de sensível ao lado. O plano salvo (`-out`) também guarda,
porque o `apply` precisa dele para executar exatamente o que foi revisado.

Conclusão: `sensitive` protege o segredo de olhos humanos na saída. Ele não protege de quem lê o estado
ou o artefato do plano (marco 02).

## Efêmeros e *write-only*: o valor que não persiste

Duas peças, em duas versões, resolvem o problema na origem:

- **Valores efêmeros (Terraform 1.10).** Uma variável ou saída com `ephemeral = true`, ou um bloco
  `ephemeral` (um recurso efêmero), existe só durante uma execução. O Terraform não grava o valor no
  estado nem no plano, e só aceita a referência em outro contexto efêmero.
- **Argumentos *write-only* (Terraform 1.11).** Um argumento de recurso que o provedor recebe no
  `apply` e que não é gravado. Ele é o ponto onde o valor efêmero entra num recurso comum. Como o
  Terraform não consegue comparar um valor que não guardou, o provedor oferece um argumento de versão
  ao lado, guardado no estado: mudar a versão faz o Terraform reenviar o valor.

No `fin-iac`, a senha mora no cofre e é lida na hora:

```hcl
ephemeral "aws_secretsmanager_secret_version" "app" {
  secret_id = "ledger/app"
}

resource "postgresql_role" "app" {
  name                = "ledger_app"
  login               = true
  password_wo         = ephemeral.aws_secretsmanager_secret_version.app.secret_string
  password_wo_version = 1
}
```

No laboratório, o cofre é o Secrets Manager do `moto`. A rotação é trocar o valor no cofre e subir
`password_wo_version`: medido, o `apply` mostrou `~ password_wo_version = "1" -> "2"`, a senha antiga
passou a ser recusada, a nova foi aceita, e o estado continuou sem nenhuma das duas. O ciclo de vida da
rotação (duas versões válidas, o relógio do vazamento) é o de `seguranca-aplicacao/10`.

A disponibilidade é por provedor e por recurso, e precisa ser conferida no registro. O `aws` 6.72.0 tem
11 recursos efêmeros, entre eles `aws_secretsmanager_secret_version`,
`aws_secretsmanager_random_password` e `aws_ssm_parameter`. O `postgresql` 1.27.0 não tem nenhum
recurso efêmero, mas tem o `password_wo` no `postgresql_role`.

## Melhor ainda: o Terraform nem ver o segredo

O argumento *write-only* tira o segredo do estado. Há um passo além: o segredo não passar pelo Terraform.

- **Senha gerada pelo serviço.** Muitos bancos gerenciados geram e guardam a senha mestra no cofre do
  próprio provedor de nuvem. O Terraform cria o banco e recebe só a referência ao segredo.
- **Sem senha.** Autenticação por identidade (IAM, identidade de *workload*) no lugar de usuário e
  senha. Não há nada para vazar.
- **Senha gerada no cofre.** O `aws_secretsmanager_random_password` efêmero gera o valor sem gravá-lo.
  A trilha `aws-para-backend/08` monta o cofre e as chaves de KMS de verdade.

## A credencial do próprio provedor

O Terraform precisa de uma credencial para falar com a nuvem. Ela não vai em `.tf`, nem num `.tfvars`
versionado, nem no estado. Na esteira, a credencial vem por **OIDC**: o *job* recebe um *token* de curta
duração, trocado por um papel com permissões mínimas, como em `entrega-continua-e-devops/02`. Na máquina
do desenvolvedor, vem do SSO, que também gera credenciais temporárias. Uma chave de acesso fixa no
código é vazamento esperando a hora.

## O que ainda vaza

- **Saídas.** Uma saída comum com o valor de um segredo grava o valor no estado. Saída de segredo é
  `ephemeral = true`, num módulo filho, ou não existe.
- **O plano salvo.** Na esteira, o `plan -out` vira artefato para o `apply` usar (marco 07). Com
  `sensitive`, ele contém o segredo. Trate o artefato como o estado: acesso restrito e retenção curta.
- **O `TF_LOG`.** Medido aqui: com `TF_LOG=TRACE`, a senha passada por `-var senha=...` apareceu 2 vezes
  no log, dentro dos argumentos da linha de comando. A mesma variável `sensitive` passada por
  `TF_VAR_senha`, e a senha lida do cofre pelo efêmero, deram 0: o vazamento é dos argumentos da linha
  de comando. O segredo passado por `-var` também fica no histórico do *shell* e na lista de processos. Na esteira,
  log de *debug* do Terraform só em execução isolada, nunca guardado como artefato público.

> **E no OpenTofu?** Valores efêmeros, recursos efêmeros e argumentos *write-only* chegaram juntos na
> 1.11 do OpenTofu, com o mesmo modelo. A diferença é a criptografia de estado e de plano no cliente
> (desde a 1.7): mesmo com `sensitive`, o arquivo sai da máquina cifrado. Ela reduz o dano de um estado
> lido por quem não devia, mas o segredo continua dentro dele. Efêmero e *write-only* continuam sendo o
> conserto.

## Exemplo numa fintech

A senha do papel de aplicação do ledger era uma variável `sensitive`, preenchida pela esteira a partir
de um segredo do repositório. Uma auditoria pediu a lista de quem podia ler a senha de produção. A
resposta oficial era "duas pessoas e o cofre". A resposta real incluía todos com leitura no *bucket* de
estado, todos com acesso aos artefatos de *plan* da esteira dos últimos 90 dias e um *log* de *debug*
anexado a um *ticket* de suporte. A correção: senha no cofre, lida por recurso efêmero e entregue em
`password_wo`, retenção de 1 dia para o artefato do plano e um teste que varre o estado e o plano em
busca da senha conhecida.

## Hands-on

**Tutorial.** No `lab/`, crie o segredo `ledger/app` no Secrets Manager do `moto`. Aplique o papel com a
variável `sensitive` e procure a senha no `terraform.tfstate` e no plano salvo (`unzip -p plano.bin`).
Depois troque para o efêmero com `password_wo` e repita a busca. Conecte no Postgres com a senha nos dois
casos, pela porta publicada no *host* ou pelo IP do contêiner. Dentro do contêiner, por `localhost`, a
imagem oficial do Postgres usa `trust` no `pg_hba.conf` e aceita **qualquer** senha. No teste deste
marco, a senha antiga continuou "funcionando" por `localhost` e foi recusada pelo IP do contêiner. Um
teste de autenticação que não pode falhar não prova nada.

**Desafio.** Crie o papel de aplicação do Postgres do ledger sem que a senha toque o estado ou o plano,
com rotação por `password_wo_version`.

**Invariantes testáveis**

1. **Varredura limpa.** O teste aplica a configuração e procura a senha conhecida no estado e no plano
   salvo. Zero ocorrências nos dois.
2. **O teste pega o problema.** A *fixture* "antes", com a variável `sensitive`, **falha** na mesma
   varredura. Sem isso, um teste que nunca falha não prova nada.
3. **A aplicação autentica.** Com a senha lida do cofre local, uma conexão ao Postgres como
   `ledger_app` executa `select current_user`. Depois da rotação (versão 2 e valor novo no cofre), a
   senha antiga é recusada e a nova é aceita.
4. **Nenhuma credencial de provedor no código ou no estado.** Uma verificação estática falha se
   encontrar `access_key`, `secret_key` ou `password` com valor literal em `.tf` ou em `.tfvars`
   versionado, e a varredura do estado não acha a chave de teste do laboratório.

**Complemento.** Rode o `apply` com `TF_LOG=TRACE` e a senha por `-var`, procure a senha no log e
documente onde ela apareceu. Repita com o efêmero. Escreva a regra da esteira para *logs* de *debug*.

**Checagem**

1. Por que a senha aparece no estado mesmo com `sensitive = true`?
2. Qual é o papel do argumento de versão ao lado de um argumento *write-only*?
3. Onde, além do estado, um segredo de Terraform costuma vazar?
4. Por que a melhor opção, quando existe, é o Terraform nunca ver a senha?

## Principais aprendizados

- `sensitive` esconde da tela, não do estado nem do plano salvo: medido, 1 e 2 ocorrências.
- Recurso efêmero (1.10) lê o segredo na hora; argumento *write-only* (1.11) o entrega sem gravar.
  Medido: 0 e 0, com a aplicação autenticando.
- A rotação do *write-only* é pelo argumento de versão.
- Melhor ainda é a senha gerada pelo serviço, ou nenhuma senha.
- Credencial do provedor por OIDC ou SSO, nunca no código.
- Saídas, plano salvo e `TF_LOG` também vazam. O `-var` com segredo apareceu no log de *trace*; por
  `TF_VAR_`, não.
