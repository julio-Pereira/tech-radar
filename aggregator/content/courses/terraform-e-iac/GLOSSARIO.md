Um verbete por termo: definição em uma frase, o exemplo no `fin-iac`, o erro comum associado e o marco
onde o conceito aparece na prática. Os termos básicos (estado, *plan* como artefato, *drift*, política
sobre o plano) são verbetes do glossário de `entrega-continua-e-devops` e não se repetem aqui.

## Estado

### Bloqueio nativo do S3
**Em uma frase:** o bloqueio de estado do *backend* `s3` feito por um objeto `.tflock` gravado com escrita condicional, sem tabela DynamoDB; o argumento é `use_lockfile` (Terraform 1.10 em teste, 1.11 estável).
**No fin-iac:** o estado da rede do Pix fica no *bucket* `fin-tfstate`, com `use_lockfile = true` e versionamento ligado.
**Erro comum:** manter só o `dynamodb_table`, obsoleto desde a 1.11, ou apontar para um servidor compatível com S3 que ignora a escrita condicional, e ficar sem bloqueio nenhum.
**Onde na prática:** marco 02.

## Segredos

### Argumento *write-only*
**Em uma frase:** um argumento de recurso que o provedor recebe durante o `apply` e que o Terraform não grava no estado nem no plano (Terraform 1.11).
**No fin-iac:** a senha do papel `ledger_app` no Postgres entra por `password_wo`, com `password_wo_version` para forçar a troca.
**Erro comum:** achar que `sensitive = true` tem o mesmo efeito; ele só esconde o valor da tela, e o estado continua com o texto claro.
**Onde na prática:** marco 03.

## Infraestrutura existente

### Bloco `removed`
**Em uma frase:** a declaração, no código, de que um recurso deixou de ser gerenciado, com `lifecycle { destroy = false }` para tirá-lo do estado sem destruí-lo (Terraform 1.7).
**No fin-iac:** o papel `conciliador`, que passa a ser gerenciado por outro estado, sai deste com `removed` e continua existindo no Postgres.
**Erro comum:** apagar o bloco `resource` sem o `removed`: o `plan` seguinte propõe destruir o objeto real.
**Onde na prática:** marco 06.

### Consulta de listagem
**Em uma frase:** um bloco `list` num arquivo `.tfquery.hcl` que o `terraform query` usa para descobrir recursos existentes de um tipo, com a opção de gerar os blocos `import` e `resource` (Terraform 1.14).
**No fin-iac:** a consulta `aws_s3_bucket` no `moto` encontra o *bucket* de conciliação criado no console.
**Erro comum:** tratar a configuração gerada como código final; ela vem cheia de valores padrão explícitos e precisa de revisão.
**Onde na prática:** marco 06.
