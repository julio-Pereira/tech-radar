---
id: o-grafo-e-o-ciclo-de-vida
title: "O grafo e o ciclo de vida"
summary: "O plan é o resultado de um grafo de dependências; quem entende o grafo entende por que um recurso foi destruído. Dependência implícita × depends_on, o # forces replacement que o plano já mostrava, prevent_destroy, create_before_destroy com nome fixo (medido: falha), pré-condições testadas com mock_provider e a política que barra delete em recurso crítico."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, confiabilidade]
references:
  - title: "Terraform — Resource lifecycle"
    url: https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
  - title: "Terraform — Custom conditions"
    url: https://developer.hashicorp.com/terraform/language/expressions/custom-conditions
  - title: "Terraform — terraform graph"
    url: https://developer.hashicorp.com/terraform/cli/commands/graph
  - title: "Terraform — Tests: mocks"
    url: https://developer.hashicorp.com/terraform/language/tests/mocking
---

## O plano é a leitura de um grafo

O marco `entrega-continua-e-devops/06` tratou o `plan` como o artefato que se revisa. Este marco trata
de onde ele vem. Antes de propor qualquer ação, o Terraform monta um **grafo de dependências**. Os nós
são recursos, *data sources*, módulos e provedores. As arestas dizem quem precisa existir antes de quem.
Depois, ele compara três coisas para cada nó: o que está na configuração, o que está no estado e o que
existe de verdade (o *refresh*).

O grafo decide a ordem. Na criação, um recurso vem depois de tudo de que ele depende. Na destruição, a
ordem se inverte: o dependente sai primeiro. Nós sem aresta entre si rodam em paralelo, até 10 por
padrão (`-parallelism`). O `terraform graph` mostra esse grafo, e desde a 1.16 também em Mermaid
(`-format=mermaid`), que cabe direto num PR.

## Dependência implícita × `depends_on`

A dependência certa é a **implícita**: um recurso referencia um atributo de outro, e o Terraform
desenha a aresta sozinho. Quando o papel de aplicação usa `postgresql_database.ledger.name` num
`postgresql_grant`, o *grant* espera o banco existir, e sai antes dele na destruição.

O `depends_on` existe para a dependência que o código não mostra, como uma permissão que precisa estar
ativa antes de um processo ler algo. Ele é o último recurso, por dois motivos:

- **Ele é largo.** Aponta para o recurso inteiro, não para um atributo. Num *data source*, isso adia a
  leitura para o `apply` sempre que o alvo tiver qualquer mudança pendente, e o plano fica cheio de
  `(known after apply)`.
- **Ele esconde a razão.** Uma referência explica a si mesma. Um `depends_on` precisa de um comentário
  dizendo por que existe, ou o próximo engenheiro o apaga.

## O que força a substituição

Alguns atributos não podem mudar num objeto que já existe. O provedor os marca como *ForceNew*, e mudar
um deles vira **destruir e criar de novo**. O plano avisa, e é aí que um revisor atento salva o banco:

```text
  # postgresql_database.ledger must be replaced
      ~ lc_collate = "en_US.utf8" -> "C" # forces replacement
      ~ lc_ctype   = "en_US.utf8" -> "C" # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
```

Saída real, com o provedor `postgresql` 1.27.0. A pessoa queria só mudar a ordenação de texto. O
resultado é um banco novo e vazio. No plano em JSON, a ação aparece como `["delete", "create"]`, e é
isso que uma política pode pegar sem depender de alguém ler a linha.

## O bloco `lifecycle`

O `lifecycle` muda como o Terraform trata a troca de um recurso:

- **`prevent_destroy = true`** faz o `plan` falhar se ele pedir a destruição do recurso. Medido aqui:
  `Error: Instance cannot be destroyed`, com saída 1. É a proteção mínima do banco de produção. Ela tem
  um limite: se o bloco `resource` for apagado do código, a proteção some junto e o recurso é
  destruído. Contra isso servem o bloco `removed` (marco 06) e a política sobre o plano.
- **`create_before_destroy = true`** inverte a ordem da substituição: cria o novo, depois destrói o
  velho. Serve para o que pode existir em dobro por um momento. Com um nome fixo, não serve: o mesmo
  banco com `create_before_destroy` falhou com `database "ledger_prod" already exists`. Ou o nome
  varia (um sufixo gerado), ou a troca não pode ser sem interrupção.
- **`ignore_changes`** manda o Terraform ignorar diferenças num atributo. Ele resolve o atributo que
  outro sistema muda de propósito, como as *tags* que uma ferramenta de custo acrescenta. Mas é também
  o jeito mais fácil de esconder um *drift* que devia ser visto. Por isso, no `fin-iac` ele só entra
  com um comentário de justificativa.
- **`replace_triggered_by`** força a substituição quando outro recurso muda. Desde a 1.15, uma
  referência a um atributo que não existe é erro, não silêncio.
- **`destroy = false`**, desde a 1.16, troca a destruição por "esquecer": medido aqui, um
  `terraform destroy` tirou o papel do estado (`will no longer be managed by Terraform, but will not be
  destroyed`) e o papel continuou no Postgres. Como o `prevent_destroy`, ele mora no bloco `resource`:
  apagado o bloco, o plano seguinte voltou a dizer `will be destroyed`.

## Pré-condições, pós-condições e `check`

Uma **pré-condição** é uma regra que precisa valer antes de o Terraform agir sobre o recurso. Se ela
falha, o `plan` para com a mensagem que você escreveu. Uma **pós-condição** confere o resultado depois
de criado. Um bloco **`check`** (desde a 1.5) faz uma verificação contínua, que avisa sem bloquear, e
serve para "o *endpoint* responde" ou "o certificado vence em mais de 30 dias".

Uma regra de negócio que não pode ser violada vira pré-condição. No ledger, o mínimo de retenção é de 5
anos:

```hcl
resource "postgresql_database" "ledger" {
  name = "ledger_prod"
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.retencao_dias >= 1825
      error_message = "O ledger guarda no mínimo 5 anos (1825 dias)."
    }
  }
}
```

E ela se testa sem banco nenhum, com `mock_provider` e `expect_failures`:

```hcl
mock_provider "postgresql" {}

run "retencao_curta_e_rejeitada" {
  command = plan
  variables { retencao_dias = 30 }
  expect_failures = [postgresql_database.ledger]
}
```

## *Data sources*, `-refresh=false` e `-target`

Um *data source* é lido em todo `plan`. Cada leitura é uma chamada de API, e dez *data sources* lentos
deixam todo `plan` lento. Se o valor puder ser uma saída de outro estado ou uma variável, prefira.

Duas opções existem para emergência, não para rotina:

- **`-refresh=false`** pula a leitura do mundo real. O plano fica rápido e cego para o *drift*.
- **`-target`** limita o plano a um pedaço do grafo. Ele deixa o resto do estado para trás e a
  configuração diverge do que foi aplicado. O próprio Terraform avisa que a opção não é para uso
  rotineiro. Usá-la em todo `apply` é sinal de que o estado é grande demais (marco 02).

> **E no OpenTofu?** O grafo, o `lifecycle`, as condições e os blocos `check` funcionam igual. O
> `mock_provider` entrou no OpenTofu na 1.8, uma versão depois do Terraform.

## Exemplo numa fintech

Um engenheiro abriu um PR para trocar a ordenação de texto do banco do ledger, porque os relatórios
ordenavam nomes com acento de um jeito estranho. A mudança era de duas linhas. O plano dizia
`must be replaced` e `1 to destroy`, mas o PR tinha outras 40 linhas de plano, e o revisor aprovou
olhando o *diff* do código. O `apply` rodou fora do horário, destruiu o banco de homologação e criou um
vazio. A restauração levou a tarde. A correção não foi "revisar melhor": foi `prevent_destroy` nos
bancos e uma política que reprova qualquer `delete` em recurso crítico, salvo exceção registrada com
prazo.

## Hands-on

**Tutorial.** Suba o Postgres do laboratório (`lab/` do `fin-iac`). Crie o banco `ledger_prod` com o
provedor `cyrilgdn/postgresql` 1.27.0, mude `lc_collate` e leia o `# forces replacement` no plano. Rode
`terraform graph -format=mermaid` e encontre a aresta entre o banco e o *grant*. Exporte o plano com
`terraform show -json` e localize `"actions": ["delete", "create"]`.

**Desafio.** Proteja o banco do ledger contra destruição, com três camadas: `prevent_destroy`, uma
pré-condição de retenção e uma política sobre o plano no motor do catálogo (Conftest com Rego, ADR do
`fin-iac`).

**Invariantes testáveis**

1. **Um plano que destruiria o banco falha.** Uma *fixture* muda `lc_collate`. O teste roda o `plan` e
   confere a saída 1 e a mensagem `Instance cannot be destroyed`.
2. **A pré-condição rejeita a configuração inválida antes do `apply`.** No `terraform test`, com
   `mock_provider`, a retenção de 30 dias é rejeitada (`expect_failures`) e a de 1825 passa.
3. **A política reprova `delete` ou `replace` em recurso crítico.** O Conftest nega o plano em JSON da
   *fixture* destrutiva, e aprova o mesmo plano quando a exceção está registrada em `excecoes.json`, com
   número de mudança e data de validade. Uma exceção vencida volta a reprovar.
4. **`ignore_changes` só com justificativa.** Uma verificação estática falha se encontrar um
   `ignore_changes` sem um comentário `# motivo:` na linha anterior. Uma *fixture* sem comentário prova
   que a verificação reprova.

**Complemento.** Troque o nome fixo do banco por um nome com sufixo gerado e aplique
`create_before_destroy`. Meça o que muda para a aplicação, que guarda o nome do banco na configuração.
Escreva no ADR quando a troca sem interrupção compensa e quando ela só desloca o problema.

**Checagem**

1. Por que a dependência implícita é preferível ao `depends_on`, e o que um `depends_on` faz com um
   *data source*?
2. Onde, no plano em texto e no plano em JSON, aparece que uma mudança vai destruir o recurso?
3. Em que caso `create_before_destroy` não resolve, e o que fazer?
4. Por que `prevent_destroy` sozinho não protege contra a remoção do bloco `resource` do código?

## Principais aprendizados

- O `plan` é a leitura de um grafo: configuração, estado e mundo real, em ordem de dependência.
- A dependência implícita explica a si mesma; `depends_on` é o último recurso, com comentário.
- `# forces replacement` no texto e `["delete", "create"]` no JSON são o aviso de destruição. Leia
  antes de aprovar, e deixe uma política ler também.
- `prevent_destroy` barra o plano destrutivo, mas não a remoção do código. `create_before_destroy`
  precisa de nome variável.
- Regra de negócio vira pré-condição, testada com `mock_provider` sem infraestrutura.
- `-target` e `-refresh=false` são ferramentas de emergência.
