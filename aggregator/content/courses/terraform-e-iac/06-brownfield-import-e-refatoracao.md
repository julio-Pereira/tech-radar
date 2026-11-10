---
id: brownfield-import-e-refatoracao
title: "Brownfield: importação e refatoração"
summary: "Trazer para o código o que nasceu no console é o trabalho mais comum e mais arriscado de IaC; o critério de pronto é um plan vazio. Medido contra o Postgres e o moto: import declarativo de 6 recursos com plan vazio, a configuração gerada que nem valida, moved para módulo e de count para for_each sem nenhuma ação, removed que deixa o objeto vivo, e a divisão de um estado em dois com removed + import, conferida endereço a endereço."
estimatedMinutes: 65
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, confiabilidade]
references:
  - title: "Terraform — Import"
    url: https://developer.hashicorp.com/terraform/language/import
  - title: "Terraform — Generating configuration"
    url: https://developer.hashicorp.com/terraform/language/import/generating-configuration
  - title: "Terraform — Refactor modules (moved/removed)"
    url: https://developer.hashicorp.com/terraform/language/modules/develop/refactoring
  - title: "Terraform — Refactor state"
    url: https://developer.hashicorp.com/terraform/language/state/refactor
---

## O trabalho mais comum de IaC

Pouca infraestrutura nasce no Terraform. Ela nasce num console, num *script* de 2019 ou num chamado que
alguém atendeu à mão. É o mesmo legado de `arquitetura-de-solucoes/03`, visto de dentro da infraestrutura,
e trazê-lo para o código é um passo da modernização de `arquitetura-de-solucoes/07`. Trazer isso para o código (*brownfield*) é o trabalho mais frequente de quem cuida
de IaC num time, e o mais arriscado: um erro de endereço vira um `destroy` num banco que ninguém sabia que
o Terraform podia tocar.

A sequência segura tem quatro passos, e cada um termina num critério verificável:

1. **Inventário.** Listar o que existe, com o identificador que o provedor usa para importar.
2. **Importar sem mudar nada.** O critério é o `plan` **vazio** depois da importação. Se o plano propõe
   mudar algo, a configuração ainda não descreve o objeto real.
3. **Só então refatorar.** Renomear, agrupar em módulos, trocar `count` por `for_each`. O critério é um
   plano sem `delete` nem `replace`.
4. **Dividir estados**, se for o caso, com a mesma exigência.

Juntar importar e melhorar no mesmo passo é como uma migração de banco que muda o esquema e os dados de
uma vez: quando o plano mostra uma diferença, ninguém sabe se ela é intencional.

## Descobrir o que existe

Desde a 1.14, as **consultas de listagem** fazem parte do Terraform. Um bloco `list` num arquivo
`.tfquery.hcl` pede ao provedor todos os objetos de um tipo, e o `terraform query` os mostra:

```text
list.aws_s3_bucket.todos   bucket=conciliacao-arquivos,region=us-east-1   conciliacao-arquivos
```

Com `-generate-config-out`, ele já escreve os blocos `import` e `resource`. A cobertura é por provedor: o
`aws` 6.72.0 declara 273 tipos de listagem. O `postgresql` 1.27.0 não declara nenhum, e os papéis e bancos
se descobrem pelo catálogo do próprio Postgres (`pg_roles`, `pg_database`).

## O bloco `import` e a configuração gerada

O bloco **`import`** (1.5) declara a importação no código (o vocabulário básico de estado e *drift* está em
`entrega-continua-e-devops/06`). Diferente do comando antigo
`terraform import`, que mexia no estado na hora e sem revisão, ele passa pelo `plan`: o PR mostra
`will be imported`, o revisor vê, e o `apply` faz. Desde a 1.7 aceita `for_each`, e desde a 1.16 pode
ficar dentro de módulos.

```hcl
import {
  for_each = toset(["a", "b", "c"])
  to       = postgresql_role.conciliador[each.key]
  id       = "conciliador_${each.key}"
}
```

O `plan -generate-config-out=gerado.tf` escreve o bloco `resource` dos objetos importados que ainda não
têm configuração. Ele é um **rascunho**, e o Terraform 1.17 ainda chama a geração de experimental. Três
medições mostram o porquê:

- **Ruído.** Para um papel do Postgres, o arquivo gerado tinha 21 atributos, quase todos valores padrão
  (`connection_limit = -1`, `valid_until = "infinity"`, `password = null`). Para o banco, 11. A
  configuração final precisa só de `name` e de `template`.
- **Inválido.** Para a tabela DynamoDB, o gerado tinha
  `point_in_time_recovery { recovery_period_in_days = 0 }`, e o próprio `plan` recusou:
  `expected point_in_time_recovery.0.recovery_period_in_days to be in the range (1 - 35), got 0`.
- **Sem `for_each`.** Para um `import` com `for_each`, a geração falhou com
  `The target resource does not use for_each`: o bloco `resource` com `for_each` precisa existir antes,
  escrito à mão.

Revise o rascunho, apague os padrões, escreva o recurso como ele deveria ser e só então rode o `plan`.
Medido no laboratório: 6 recursos (três papéis, um banco, um *bucket* e uma tabela), `6 imported` no
`apply`, e o `plan` seguinte com `-detailed-exitcode` = 0.

## Refatorar: `moved` e `removed`

O **`moved`** (1.1) diz ao Terraform que um objeto mudou de endereço sem mudar de identidade. Ele cobre os
três casos clássicos, e os três foram medidos:

| Refatoração | Sem `moved` | Com `moved` |
| --- | --- | --- |
| levar o banco e os papéis para `module.conciliacao` | destrói e cria | `has moved to module.conciliacao...`, nenhuma ação |
| trocar `count` por `for_each` em 3 filas | `3 to add, 3 to destroy` | `0 to add, 0 to change, 0 to destroy` |
| renomear um recurso interno de módulo (marco 04) | destrói e cria | `has moved to`, plano vazio |

O critério de pronto da refatoração não é "o plano parece pequeno": é o plano em JSON sem nenhuma ação
`delete`. No `fin-iac`, a mesma política do marco 01 roda sobre todo plano de refatoração.

O **`removed`** (1.7) diz que um recurso deixou de ser gerenciado por este estado. Com
`lifecycle { destroy = false }`, o objeto sai do estado e **continua existindo**: medido, o plano dizia
`will no longer be managed by Terraform, but will not be destroyed`, e o *bucket* e a tabela continuavam
no `moto` depois do `apply`. Sem o `removed`, apagar o bloco `resource` faz o próximo plano destruir o
objeto.

## Dividir um estado em dois

O `moved` só funciona dentro de um estado. Para mover recursos para outro estado, a documentação oficial
("Refactor state") indica `removed` no de origem e `import` no de destino. Medido, ao tirar o *bucket* e
a tabela do estado de dados para um estado só de AWS:

- no estado de origem, `removed` com `destroy = false` nos dois recursos;
- no estado novo, os dois blocos `resource` e os dois `import`: `2 imported`;
- a soma dos endereços dos dois estados ficou igual à lista do estado antigo (6 endereços);
- os dois `plan` saíram vazios.

O `terraform state mv` e o `state rm` fazem o mesmo mexendo direto no estado, sem plano e sem revisão.
Eles ficam para emergência, sempre depois de um *backup* do estado (o versionamento do marco 02).

> **E no OpenTofu?** `import` com `for_each` e `removed` existem desde a 1.7, e o `moved` veio do
> *fork*. Desde a 1.10, o `moved` do OpenTofu também move um objeto entre recursos de **tipos**
> diferentes, com migração automática dos dados no estado (por exemplo, quando um provedor divide um
> recurso em dois). O Terraform não faz isso. As consultas de listagem não existem no OpenTofu.

## Exemplo numa fintech

O serviço de conciliação tinha três papéis no Postgres do ledger, criados à mão em anos diferentes, um
banco `conciliacao_legado` e, no console da nuvem, o *bucket* dos arquivos de conciliação e a tabela dos
lotes. A primeira tentativa de importar juntou tudo num PR com módulos novos e nomes melhores. O plano
mostrava 6 importações e 4 mudanças, e ninguém conseguia dizer quais mudanças eram intencionais. O PR foi
refeito em três: importar com plano vazio, refatorar em módulo com plano sem `delete` e mover a parte de
nuvem para o estado de AWS com `removed` e `import`. Os três foram revisados em menos tempo que o
primeiro.

## Hands-on

**Tutorial.** Rode o *script* `legado/` do `fin-iac`, que cria à mão três papéis e um banco no Postgres,
um *bucket* e uma tabela DynamoDB no `moto`. Descubra os objetos de nuvem com `terraform query` e os do
Postgres pelo catálogo. Gere a configuração com `-generate-config-out` e leia o que veio.

**Desafio.** Traga tudo para o `fin-iac` e depois reorganize: os papéis e o banco num módulo, e os
recursos de nuvem num estado próprio.

**Invariantes testáveis**

1. **Importado sem mudança.** Depois do `apply` da importação, `plan -detailed-exitcode` = 0.
2. **Refatoração sem destruição.** Depois de mover para o módulo e trocar `count` por `for_each`, a
   política sobre o plano em JSON não encontra nenhuma ação `delete` nem `replace`.
3. **Divisão sem perda.** A soma de `terraform state list` dos dois estados novos é igual à lista do
   estado antigo, e os dois `plan` saem vazios.
4. **`removed` não destrói.** Depois do `apply` com `removed`, o endereço sumiu do estado, e uma consulta
   direta ao Postgres e ao `moto` confirma que o objeto continua lá.
5. **Configuração gerada não passa sem revisão.** Um teste falha se um `.tf` do repositório tiver o
   cabeçalho `# __generated__ by Terraform` ou um valor padrão da lista de ruído (`connection_limit = -1`,
   `valid_until = "infinity"`, `= null`). Uma *fixture* com o rascunho cru prova que o teste reprova.

**Complemento.** Faça a mesma divisão de estado com `terraform state mv` entre dois arquivos locais e
compare com o caminho `removed` + `import`: o que o revisor do PR consegue ver em cada um, e o que
acontece se a sessão cair no meio.

**Checagem**

1. Por que o bloco `import` é preferível ao comando `terraform import`?
2. Por que a configuração gerada não é código final? Dê dois motivos medidos.
3. Qual é o critério de pronto da importação, e qual é o da refatoração?
4. Como se move um recurso de um estado para outro sem destruí-lo?

## Principais aprendizados

- *Brownfield* em passos separados: inventário, importar com plano vazio, refatorar sem `delete`,
  dividir estados.
- `terraform query` (1.14) descobre o que existe, conforme a cobertura de cada provedor.
- O bloco `import` passa pelo `plan` e pela revisão; o comando antigo não.
- A configuração gerada é rascunho: medido, ruído de padrões, um valor inválido e nenhum `for_each`.
- `moved` muda endereço sem destruir; `removed` com `destroy = false` tira do estado sem destruir.
- Estado se divide com `removed` + `import`, conferindo os endereços e os dois planos vazios.
