---
id: estado-remoto-e-bloqueio
title: "Estado remoto e bloqueio"
summary: "O estado é o banco de dados da sua infraestrutura: acesso mínimo, criptografia, versionamento, bloqueio e backup. Medido localmente: dois apply simultâneos no pg e no S3 (use_lockfile no moto), o .tflock órfão depois de um kill -9 que só o force-unlock resolve, a restauração de uma versão anterior depois de corromper o estado, o papel sem acesso ao estado e a migração de backend sem perder endereço."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, seguranca]
references:
  - title: "Terraform — Backend block: s3"
    url: https://developer.hashicorp.com/terraform/language/backend/s3
  - title: "Terraform — Backend block: pg"
    url: https://developer.hashicorp.com/terraform/language/backend/pg
  - title: "Terraform — State locking"
    url: https://developer.hashicorp.com/terraform/language/state/locking
  - title: "OpenTofu — State and plan encryption"
    url: https://opentofu.org/docs/language/state/encryption/
---

## O estado é um banco de dados

O estado é o mapa entre cada endereço do código (`postgresql_database.ledger`) e o objeto real que ele
representa, com todos os atributos lidos na última execução. Sem ele, o Terraform não sabe o que já
criou. Com ele errado, o Terraform cria em dobro ou destrói o que não devia. E ele guarda segredos em
texto claro (marco 03).

Por isso, o estado de um time não fica no disco de ninguém. Ele vai para um *backend* remoto, com as
mesmas exigências de um banco de produção: acesso mínimo, criptografia, versionamento, bloqueio e uma
forma testada de recuperar.

## Bloqueio: um escritor por vez

Dois `apply` no mesmo estado, ao mesmo tempo, leem a mesma versão, mudam coisas diferentes e gravam um
por cima do outro. O segundo apaga do estado o que o primeiro criou, e o próximo `plan` tenta criar de
novo o que já existe. O bloqueio impede isso: quem chega primeiro adquire o bloqueio, e o outro falha.

Medido com dois `apply` disparados com 2 segundos de diferença:

```text
Error: Error acquiring the state lock
Error message: Already locked for workspace creation: default
```

Esse foi o *backend* `pg`. No `s3` com `use_lockfile`, o erro foi o mesmo, causado pelo `PutObject`
condicional do arquivo `.tflock`. Nos dois casos, o primeiro `apply` terminou, e o `plan` seguinte saiu
vazio.

### O bloqueio nativo do S3

Até a 1.10, o *backend* `s3` só bloqueava com uma tabela DynamoDB. A 1.10 trouxe o bloqueio nativo, e a
1.11 o tornou estável: com `use_lockfile = true`, o Terraform grava um objeto `<chave>.tflock` com uma
escrita condicional (`If-None-Match: *`), que falha se o objeto já existe. O argumento `dynamodb_table`
ficou obsoleto na 1.11, e na 1.17 o `init` ainda avisa:
`Warning: Deprecated Parameter ... Use parameter "use_lockfile" instead`. Para migrar, os dois podem
ficar ligados juntos por um tempo, e o Terraform adquire os dois bloqueios.

O bloqueio depende de o servidor respeitar a escrita condicional. Num emulador ou num armazenamento
"compatível com S3" que ignore o cabeçalho, o bloqueio simplesmente não existe, e nada avisa. Teste
antes de confiar. O `moto` 5.2.5 respeitou: a segunda escrita voltou com `PreconditionFailed`.

### Quando o processo morre no meio

O bloqueio se comporta diferente quando o `apply` é morto com `kill -9`. Medido:

| *Backend* | Depois do `kill -9` |
| --- | --- |
| `pg` | o próximo `plan` rodou: o *advisory lock* do Postgres acaba com a sessão |
| `s3` com `use_lockfile` | o próximo `plan` falhou com `Error acquiring the state lock` e um `ID:`; o `.tflock` ficou órfão |

O **`force-unlock <ID>`** existe para o segundo caso: um bloqueio que ninguém mais segura. Antes de
usá-lo, confirme que o processo dono do bloqueio morreu de verdade (o *job* da esteira cancelado, a
máquina desligada). Destravar um bloqueio vivo é exatamente o que o bloqueio existia para impedir. Nunca
o use para "andar mais rápido" quando a esteira está ocupada.

Um `apply` interrompido também pode deixar a infraestrutura pela metade. No teste, uma substituição
morta no meio deixou o plano seguinte pedindo `1 to add`: o objeto velho já tinha saído, e o novo não
existia. O estado não corrompeu, mas o ambiente ficou num estado intermediário até o próximo `apply`.

## Criptografia, versionamento e quem lê

| | AWS (S3) | Azure (Blob) | GCP (GCS) |
| --- | --- | --- | --- |
| *Backend* | `s3` | `azurerm` | `gcs` |
| Bloqueio | `use_lockfile` (nativo desde a 1.11); DynamoDB obsoleto | *lease* do *blob*, nativo | nativo, por precondição de geração do objeto |
| Versionamento | versionamento do *bucket* | versionamento de *blob* e *soft delete* | versionamento de objetos |
| Criptografia em repouso | SSE-S3 por padrão; `kms_key_id` para chave própria | criptografia do Storage por padrão; chave gerenciada pelo cliente opcional | chave do Google por padrão; `kms_encryption_key` opcional |

**Versionamento é o *backup*.** Com o *bucket* versionado, cada gravação do estado guarda a anterior. No
teste, o objeto de estado foi sobrescrito com lixo. O `plan` falhou com `Unsupported state file
format`. A versão anterior foi copiada por cima da atual, e o `plan` seguinte saiu vazio. Sem
versionamento, a recuperação seria reimportar tudo (marco 06).

**Quem lê o estado lê todos os segredos dele.** O acesso ao *backend* é separado em três papéis: a
esteira que aplica (escrita), a esteira que planeja (leitura) e todo o resto (nada). A aplicação nunca
lê o estado. O ciclo de vida de cada credencial desses papéis segue `seguranca-aplicacao/10`. No
*backend* `pg`, isso é um esquema por estado e `GRANT` só para os papéis da esteira. Um
papel sem *grant* recebeu `permission denied for schema rede_pix`.

## Estados por fronteira e o acoplamento entre eles

Um estado único para o `fin-platform` inteiro tem o maior raio de explosão, o `plan` mais lento e o
bloqueio mais disputado (`entrega-continua-e-devops/06`). O `fin-iac` divide por **fronteira** (rede,
dados, aplicação) e por **ambiente**.

Um estado precisa de valores de outro: a aplicação precisa do *endpoint* do banco. O
`terraform_remote_state` lê as saídas de outro estado, e por isso exige permissão de leitura sobre o
estado inteiro do vizinho, com todos os segredos dele. A alternativa é **publicar** as saídas num lugar
feito para isso, como um parâmetro do SSM ou um segredo, e ler com um *data source* comum (a trilha
`aws-para-backend/08` monta isso com SSM e KMS). No `fin-iac`, um estado de ambiente nunca lê o estado
de outro ambiente: produção não depende do que homologação gravou.

## Migrar de *backend*

Mudar o bloco `backend` e rodar `terraform init -migrate-state` copia o estado para o destino. A prova
de que nada se perdeu é a lista de endereços: medido aqui, `terraform state list` antes e depois da
migração de `local` para `pg` deu as mesmas 3 linhas. Depois da migração, o arquivo local
`terraform.tfstate` precisa sair do disco e nunca entrar no Git.

> **E no OpenTofu?** Duas diferenças entram aqui. A **criptografia de estado e de plano no cliente**,
> desde a 1.7: o arquivo é cifrado antes de sair da máquina, e o *backend* guarda só texto cifrado. O
> Terraform não tem isso. E o **bloqueio do `pg` mudou na 1.10**: versões diferentes do OpenTofu no
> mesmo banco podem gravar ao mesmo tempo e perder dados. Todo o time precisa estar na mesma linha antes
> de usar o `pg`.

## Exemplo numa fintech

Dois engenheiros mexiam no estado da rede do Pix. Um aplicava uma regra de *firewall* nova. O outro, ao
mesmo tempo, aumentava uma sub-rede. O estado ficava num *bucket* sem bloqueio, porque "a tabela
DynamoDB dava trabalho". Os dois `apply` terminaram. O segundo gravou o estado sem a regra do primeiro.
No dia seguinte, o `plan` propôs criar uma regra que já existia, o `apply` falhou por duplicidade, e o
time levou horas para descobrir que o estado tinha perdido um recurso. A correção custou uma linha
(`use_lockfile = true`), o versionamento do *bucket* e um teste que dispara dois `apply` e exige que um
falhe.

## Hands-on

**Tutorial.** Suba o `lab/` do `fin-iac`: Postgres 17 e `moto` em modo servidor. Configure o *backend*
`pg` e rode dois `apply` simultâneos de um `terraform_data` com um `local-exec` lento. Depois, crie o
*bucket* `fin-tfstate` versionado no `moto` e repita com o *backend* `s3` (`use_lockfile = true`,
`endpoints = { s3 = "http://localhost:5055" }`, `use_path_style = true`). Mate um `apply` com `kill -9`
nos dois *backends* e compare o que sobra.

**Desafio.** Divida o estado do `fin-iac` por fronteira (rede, dados, aplicação), cada um com bloqueio,
versionamento e um papel de acesso separado.

**Invariantes testáveis**

1. **Concorrência.** O teste dispara dois `apply` no mesmo estado. Um termina, o outro falha com erro de
   bloqueio, e o `plan` seguinte sai vazio (`-detailed-exitcode` = 0).
2. **Recuperação.** O teste sobrescreve o objeto de estado com lixo, confere que o `plan` falha,
   restaura a versão anterior pelo versionamento do *bucket* e confere que o `plan` seguinte sai vazio.
3. **A aplicação não lê o estado.** Com o papel da aplicação, a leitura da tabela de estado no `pg`
   falha com `permission denied`.
4. **Sem `terraform_remote_state` entre ambientes.** Uma verificação estática falha se um estado de um
   ambiente referenciar o estado de outro. Uma *fixture* violadora prova que a verificação reprova.
5. **Migração sem perda.** A lista de `terraform state list` antes da migração de `local` para remoto é
   igual à lista depois.

**Complemento.** Mate um `apply` no meio de uma substituição e descreva o estado em que o ambiente
ficou. Escreva o *runbook* do `force-unlock`: como confirmar que o dono do bloqueio morreu, quem pode
destravar e o que registrar.

**Checagem**

1. O que acontece com dois `apply` simultâneos sem bloqueio, e por que o erro só aparece depois?
2. Por que um emulador "compatível com S3" pode deixar você sem bloqueio, sem aviso?
3. Quando o `force-unlock` é a resposta certa, e quando é o erro que o bloqueio existia para impedir?
4. Por que `terraform_remote_state` amplia quem precisa ler o estado, e qual é a alternativa?

## Principais aprendizados

- O estado é o banco de dados da infraestrutura: acesso mínimo, criptografia, versionamento e bloqueio.
- No S3, `use_lockfile` (estável desde a 1.11) substitui a tabela DynamoDB, que está obsoleta, se o
  servidor respeitar a escrita condicional.
- Um processo morto deixa o `.tflock` do S3 órfão; o `pg` libera com a sessão. O `force-unlock` vem
  depois de confirmar que o dono morreu.
- O versionamento do *bucket* é o *backup*: restaurar a versão anterior e ver o `plan` vazio.
- Quem lê o estado lê os segredos. A aplicação nunca lê, e `terraform_remote_state` amplia o acesso.
- Migração de *backend* se prova com a mesma lista de endereços antes e depois.
