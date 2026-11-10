---
id: modulos-versoes-e-provedores
title: "Módulos, versões e provedores"
summary: "Um módulo é uma API pública: precisa de contrato, versão e um jeito de atualizar sem susto. Validação de entrada com mensagem clara, terraform test como teste de contrato contra duas versões do provedor, a v2.0.0 que renomeia um recurso interno (medido: sem moved, destroy + create; com moved, nenhuma ação), o lock file com hashes por plataforma e a atualização de versão maior ambiente por ambiente."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, arquitetura]
references:
  - title: "Terraform — Modules: develop"
    url: https://developer.hashicorp.com/terraform/language/modules/develop
  - title: "Terraform — Dependency lock file"
    url: https://developer.hashicorp.com/terraform/language/files/dependency-lock
  - title: "Terraform — Version constraints"
    url: https://developer.hashicorp.com/terraform/language/expressions/version-constraints
  - title: "Terraform — Refactor modules (moved)"
    url: https://developer.hashicorp.com/terraform/language/modules/develop/refactoring
---

## Um módulo é uma API

Quando outro time chama o seu módulo, as variáveis são os parâmetros, as saídas são o retorno, e os
endereços internos dos recursos fazem parte do contrato, mesmo que ninguém os veja. Mudar qualquer um dos
três pode quebrar quem chama. É o mesmo raciocínio de uma biblioteca (`design-de-codigo/08`): uma
superfície pequena, explícita e versionada.

O marco `engenharia-de-plataforma/05` trata os módulos como produto da plataforma, consumidos por quem
pede um ambiente. Este marco trata de como desenhar, versionar e atualizar um módulo sem susto.

## O desenho do contrato

**Entradas mínimas, com tipo e validação.** Cada variável tem tipo, descrição e, quando há regra,
`validation` com uma mensagem que diz o que fazer. Para agrupar opções, um objeto com `optional` e
valor padrão mantém a chamada curta:

```hcl
variable "conexoes" {
  type = object({
    limite_app = optional(number, 20)
  })
  default = {}
  validation {
    condition     = var.conexoes.limite_app >= 1 && var.conexoes.limite_app <= 200
    error_message = "conexoes.limite_app: entre 1 e 200."
  }
}
```

**Saídas como contrato.** Exponha o que o chamador precisa (o nome do banco, o papel da aplicação), não o
objeto inteiro do recurso. Saída é compromisso: removê-la é mudança incompatível.

**Nenhum bloco `provider` dentro do módulo.** O módulo declara `required_providers` com a faixa de
versões que suporta. Quem configura o provedor (credencial, região, *endpoint*) é o módulo raiz. Um
módulo com `provider` próprio não pode ser usado com `for_each` nem `count` e prende o chamador a uma
configuração que não é dele.

**Composição, não módulo faz-tudo.** Um módulo `postgres-servico` que cria papel, banco e permissões de um
serviço é coeso. Um módulo `plataforma` com 40 variáveis, que cria rede, banco, fila e *cluster*
conforme *flags*, é impossível de testar e de atualizar. O módulo raiz compõe módulos pequenos.

## Versão semântica e o que quebra

O módulo é publicado por *tag* Git (`?ref=v1.2.0`) ou num registro. Em ambos, a versão segue a regra
semântica:

| Mudança | Versão |
| --- | --- |
| variável nova com padrão, saída nova | menor (1.3.0) |
| correção que não muda o plano de quem chama | correção (1.2.1) |
| renomear ou remover variável, remover saída, mudar o tipo de uma entrada | **maior** (2.0.0) |
| mudar o endereço interno de um recurso (renomear, mover para submódulo, `count` → `for_each`) | **maior**, e com `moved` |

O último caso é o mais traiçoeiro, porque o chamador não vê o endereço interno. Medido com o módulo
`postgres-servico`, cuja v2 renomeia `postgresql_role.app` para `postgresql_role.aplicacao`:

| Versão consumida depois da v1.0.0 | O plano de quem atualiza |
| --- | --- |
| v2.0.0-rc1, sem `moved` | `postgresql_role.app will be destroyed` e `postgresql_role.aplicacao will be created`: o papel da aplicação cai, com as conexões e os *grants* |
| v2.0.0, com `moved` | `postgresql_role.app has moved to postgresql_role.aplicacao`, `Plan: 0 to add, 0 to change, 0 to destroy` |

O bloco `moved` fica no módulo pelo menos até todos os chamadores passarem pela versão que o
introduziu. Removê-lo cedo é, de novo, mudança incompatível.

## Restrições de versão e o *lock file*

Há três restrições, e cada uma tem um dono:

- **`required_version`** do Terraform, no módulo: a menor versão da CLI que ele aceita. O `fin-iac` usa
  `>= 1.14`, a primeira com todos os recursos da trilha.
- **`version` em `required_providers`, no módulo:** a faixa que o módulo suporta, como
  `>= 1.26, < 2.0`. Faixa, não versão exata, para não prender o chamador.
- **A versão exata, no módulo raiz:** é ele que decide o que roda em produção.

O **`.terraform.lock.hcl`** é gerado pelo `init` no módulo raiz. Ele grava a versão escolhida de cada
provedor e os *hashes* dos pacotes, e o próximo `init` recusa um pacote com *hash* diferente. É o que
garante que a esteira e o laptop usam o mesmo binário, e que um pacote adulterado não passa. Ele
**vai para o Git**. Num módulo filho, não: quem trava as versões é a raiz.

Os *hashes* são por plataforma. Gerado só no Linux da esteira, o lock falha no Mac de quem roda o `plan`
local. O comando que resolve:

```text
terraform providers lock -platform=linux_amd64 -platform=darwin_arm64
- Obtained hashicorp/aws checksums for linux_amd64
- Obtained hashicorp/aws checksums for darwin_arm64
Success! Terraform has updated the lock file.
```

Saída real com o provedor `aws` 6.72.0. O lock passou a ter um *hash* `h1:` por plataforma.

## Atualizar um provedor de versão maior

Uma versão maior de provedor muda o *schema*: argumentos renomeados, padrões diferentes, recursos
divididos em dois. A sequência que não assusta:

1. Ler o guia de atualização do provedor, que lista cada mudança incompatível.
2. Subir a restrição da raiz e rodar `init -upgrade` num ramo.
3. Rodar o `plan` em **cada** ambiente, começando por dev. O critério de pronto é o **plano vazio**: a
   atualização em si não deve mudar nada. Se o plano tem mudanças, a configuração precisa ser ajustada
   até ele esvaziar.
4. Aplicar ambiente por ambiente, com a nova versão do lock no mesmo PR.

O teste de contrato do módulo (`terraform test`) roda contra as versões do provedor que a faixa promete
suportar. No laboratório, a mesma suíte passou com o `postgresql` 1.26.0 e com o 1.27.0, fixados por um
arquivo `*_override.tf` gerado pela matriz da esteira.

> **E no OpenTofu?** Módulos, `moved`, o *lock file* e as restrições funcionam igual. O OpenTofu tem
> registro próprio (`registry.opentofu.org`), e o endereço do provedor no lock muda de
> `registry.terraform.io/...` para o do registro usado. Trocar de ferramenta exige regenerar o lock.
> Variáveis e `locals` na fonte e na versão de um módulo chegaram antes no OpenTofu (1.8) do que no
> Terraform (1.15). Nos dois, use com cuidado: uma versão que vem de variável deixa de aparecer no
> *diff* do PR.

## Exemplo numa fintech

O time de plataforma publicou a v1.4.0 do módulo de banco com uma "pequena melhoria": o papel da
aplicação passou a ser criado por um submódulo, para reaproveitar código. Para o time de plataforma, os
testes passavam. Três times de produto atualizaram na mesma semana. No primeiro, o plano mostrava
`1 to destroy` dentro do módulo, e alguém notou. No segundo, o *pipeline* aplicava automaticamente em
homologação, e o papel recriado perdeu os *grants* de leitura de outro serviço. A correção virou a
v2.0.0 com `moved`, e a regra do time: toda versão do módulo roda um teste que aplica a versão anterior,
atualiza e exige um plano sem nenhuma ação além de `has moved to`.

## Hands-on

**Tutorial.** Crie o repositório local `modulos/postgres-servico` com `versions.tf`, `variables.tf`,
`main.tf`, `outputs.tf` e `tests/`. Publique a v1.0.0 como *tag* Git. Consuma-o de um módulo raiz com
`source = "git::file:///.../postgres-servico?ref=v1.0.0"`, aplique contra o Postgres do `lab/` e gere o
lock com duas plataformas.

**Desafio.** O módulo `postgres-servico` versionado: papel dono, banco, papel de aplicação e permissões,
com teste de contrato e uma v2.0.0 que renomeia um recurso interno.

**Invariantes testáveis**

1. **Entrada inválida é rejeitada com mensagem clara.** No `terraform test`, com `mock_provider`, uma
   tabela de casos: nome com maiúscula, limite 0 e limite 201 falham na variável certa
   (`expect_failures`), e o caso válido passa com a saída esperada.
2. **O contrato vale nas versões prometidas.** A matriz da esteira roda a suíte com as duas últimas
   versões menores do provedor (1.26.0 e 1.27.0), cada uma fixada por um *override*.
3. **A v2.0.0 atualiza sem ação.** Um teste aplica a v1.0.0, troca a *tag* para v2.0.0, roda
   `init -upgrade` e exige que o plano em JSON só tenha `no-op` (o `has moved to` ainda pendente faz o
   `-detailed-exitcode` sair 2; depois do `apply`, ele sai 0). A *tag* `v2.0.0-rc1`, sem o `moved`,
   falha no mesmo teste com `delete` e `create`.
4. **O lock está no Git e cobre as plataformas.** O teste confere que o `.terraform.lock.hcl` da raiz
   está rastreado e tem um *hash* `h1:` por plataforma declarada.
5. **Nenhum `provider` dentro do módulo.** Uma verificação estática falha se encontrar um bloco
   `provider` em `modulos/`. Uma *fixture* violadora prova que ela reprova.

**Complemento.** Leia o guia de atualização da última versão maior do provedor `aws` e escreva o plano de
atualização do `fin-iac`: o que muda, em que ordem de ambientes, e qual plano precisa estar vazio em
cada etapa.

**Checagem**

1. O que o *lock file* trava, e por que ele vai para o Git na raiz e não no módulo filho?
2. Por que renomear um recurso interno é mudança incompatível, mesmo sem mudar variável nem saída?
3. Por que um módulo não deve configurar o próprio `provider`?
4. Qual é o critério de pronto ao atualizar um provedor de versão maior?

## Principais aprendizados

- Variáveis, saídas e endereços internos formam o contrato do módulo.
- Entrada com tipo e validação; saída mínima; nenhum `provider` no módulo; composição de módulos
  pequenos.
- Mudar endereço interno é versão maior, com `moved`. Medido: sem ele, destrói e cria; com ele,
  nenhuma ação.
- O módulo declara faixa de versões; a raiz fixa a versão e versiona o lock, com *hash* por plataforma.
- Atualização de provedor maior: guia, `init -upgrade` num ramo, plano vazio ambiente por ambiente.
