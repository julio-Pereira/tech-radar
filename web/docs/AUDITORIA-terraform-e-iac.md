# Auditoria — trilha `terraform-e-iac`

Trilha de Terraform além do básico: 7 marcos, 425 minutos, `estimatedHours: 14`, 34 questões, com o
projeto guia `fin-iac`. Ela entra antes de `aws-para-backend`, que usa o `fin-iac` como base. Este
documento registra o que foi conferido em cada fase, e como.

## 1. Fase 0 — versões, laboratório e esqueleto

### Versões conferidas (10 nov 2026)

| Item | Onde foi lido | Resultado |
| --- | --- | --- |
| Terraform | `releases.hashicorp.com/terraform/index.json` | **1.17.1** é a mais nova estável. O binário foi baixado e conferido pelo `SHA256SUMS` |
| *Release notes* do Terraform | `CHANGELOG.md` de cada linha, de 1.5 a 1.17, no repositório oficial | tabela "recurso → versão" no `PROJETO.md` |
| OpenTofu | `CHANGELOG.md` das linhas 1.6 a 1.13 e o *proxy* de módulos Go | **1.13.9**; a linha 1.13 tem suporte até 1 ago 2027 |
| Provedor `hashicorp/aws` | `releases.hashicorp.com` | **6.72.0** |
| Provedor `cyrilgdn/postgresql` | *proxy* de módulos Go, com o código compilado aqui | **1.27.0** (jun 2026), MPL 2.0 |
| `moto` | PyPI | **5.2.5**, Apache 2.0 |
| `tflint` | *proxy* de módulos Go, compilado aqui | **0.66.0**, MPL 2.0, *ruleset* `terraform` 0.17.0 embutido |
| Conftest | *proxy* de módulos Go, compilado aqui | **0.71.1** (OPA 1.21.1), Apache 2.0 |
| Checkov | PyPI | **3.4.3**, Apache 2.0 |
| Terragrunt | *proxy* de módulos Go e `LICENSE.txt` | **1.2.1**, MIT |

**O registro do Terraform está bloqueado neste ambiente** (`registry.terraform.io` responde 403 pelo
*proxy*). Os provedores foram instalados por um `filesystem_mirror`:

- o `aws`, pelo zip oficial de `releases.hashicorp.com`;
- o `postgresql`, compilado do código-fonte obtido pelo *proxy* de módulos Go.

Os exemplos da trilha não dependem disso: com acesso ao registro, o `terraform init` comum resolve os
dois provedores.

### Resultados do laboratório (Terraform 1.17.1)

Postgres 17 em Docker e `moto` 5.2.5 em modo servidor. Nada usa conta em nuvem.

| Experimento | Marco | Resultado |
| --- | --- | --- |
| dois `apply` simultâneos no *backend* `pg` | 02 | A conclui; B falha com `Error acquiring the state lock` / `Already locked for workspace creation: default` (mensagem da primeira execução; com o estado já criado, é `Workspace is already locked: default`, ver §5); o `plan` seguinte sai vazio (`-detailed-exitcode` = 0) |
| `PutObject` com `If-None-Match: *` sobre objeto existente no `moto` | 02 | `PreconditionFailed`: o `moto` respeita a escrita condicional que o bloqueio nativo exige |
| dois `apply` simultâneos no *backend* `s3` com `use_lockfile = true` | 02 | B falha com `Error acquiring the state lock` (erro no `PutObject` do `.tflock`); o *bucket* versionado guardou 2 versões do estado |
| *backend* `s3` com `dynamodb_table` | 02 | `Warning: Deprecated Parameter`, com a sugestão de usar `use_lockfile` |
| senha por `ephemeral "aws_secretsmanager_secret_version"` (Secrets Manager do `moto`) em `password_wo` | 03 | 0 ocorrências da senha no estado e no plano salvo; a aplicação autentica no Postgres com ela |
| a mesma senha por variável `sensitive` em `password` | 03 | o plano mostra `(sensitive value)`, mas a senha aparece **1 vez** no estado e **2 vezes** no plano salvo |
| bloco `import` de um papel criado à mão, com `-generate-config-out` | 06 | 1 importado; o `plan` seguinte sai vazio. A configuração gerada tem 21 atributos, quase todos valores padrão (`connection_limit = -1`, `valid_until = "infinity"`...), e o Terraform avisa que a geração ainda é **experimental** |
| `removed` com `lifecycle { destroy = false }` | 06 | o `plan` diz `will no longer be managed by Terraform, but will not be destroyed`; o estado fica vazio e o papel continua no Postgres |
| `terraform query` com `list "aws_s3_bucket"` no `moto` | 06 | lista os 3 *buckets*; com `-generate-config-out`, gera 6 blocos (`import` e `resource`) |
| Conftest sobre o `plan` em JSON | 07 | uma regra Rego nega o *bucket* sem a *tag* `owner` (saída 1) |
| Checkov sobre o código | 07 | o *bucket* público é reprovado em `CKV_AWS_53`, `CKV_AWS_54` e `CKV_AWS_56` |

**Cobertura das consultas de listagem.** O provedor `aws` 6.72.0 declara 273 tipos de listagem, entre
eles `aws_s3_bucket`, `aws_dynamodb_table` e `aws_iam_role`. O `postgresql` 1.27.0 não declara
nenhum. No marco 06, os papéis do Postgres são descobertos por consulta ao catálogo do próprio banco, e
os recursos do `moto` por `terraform query`.

**Efêmeros por provedor.** O `aws` 6.72.0 tem 11 recursos efêmeros, entre eles
`aws_secretsmanager_secret_version`, `aws_secretsmanager_random_password` e `aws_ssm_parameter`. O
`postgresql` não tem efêmeros, mas tem o `password_wo` com `password_wo_version` no `postgresql_role`.

### Decisões da Fase 0

- **Categoria `"Cloud"`.** O campo é texto livre (o compilador só reconhece especialmente "Domínio
  financeiro"). `"Cloud"` é a categoria que o plano da `aws-para-backend` também usa, e as duas
  trilhas ficam juntas no catálogo.
- **Versão mínima: Terraform 1.14**, a primeira com todos os recursos que a trilha usa.
- **Bloqueio do S3 no `moto`, sem MinIO.** O `moto` respeitou a escrita condicional, e é o mesmo
  laboratório da `aws-para-backend`. O caminho 2 do plano (D2) entra no Tutorial do marco 02, não no
  Complemento.
- **Sem o provedor `docker`.** O `postgresql` e o `aws` com o `moto` cobrem todos os invariantes.
- **Motor de política: Conftest (OPA/Rego), por ADR.** As trilhas `entrega-continua-e-devops/06` e
  `arquitetura-de-solucoes/05` pedem um motor de código aberto escolhido por ADR, sem nomeá-lo. O OPA
  já é o motor de autorização de `seguranca-aplicacao/08`, e o Conftest avalia o `plan` em JSON
  localmente. O Terraform Policy, estável na 1.17, entra como alternativa no marco 07, sem virar
  dependência.
- **Analisador de segurança: Checkov, por ADR.** O Trivy foi descartado como padrão. Em 19 mar 2026,
  credenciais vazadas foram usadas para publicar o Trivy 0.69.4 malicioso e reapontar as *tags* da
  `trivy-action` e da `setup-trivy` para código que roubava segredos (CVE-2026-33634). O caso entra no
  marco 07 como argumento para fixar *actions* por SHA (ponte com `entrega-continua-e-devops/02`). O
  Checkov é instalado pelo PyPI com versão fixa.
- **Infracost só como Complemento.** A CLI é Apache 2.0, mas precisa de uma chave da API de preços, e
  os invariantes da trilha rodam em CI sem credencial.
- **Stacks no marco 05 como critério, sem hands-on.** É um recurso do HCP Terraform (estável desde a
  HashiConf 2025), com a CLI `terraform stacks` desde a 1.13.
- **Dividir estado: `removed` + `import`.** A página oficial "Refactor state" recomenda esse caminho
  para mover recursos entre estados, e o `moved` só funciona dentro de um estado. O marco 06 prova a
  divisão.

### URLs das fontes

- **`developer.hashicorp.com`:** não resolve neste ambiente. Os caminhos do `course.yaml` foram
  conferidos por busca:
  - `language/backend/s3`;
  - `language/manage-sensitive-data` e `.../write-only`;
  - `language/modules/develop/refactoring`;
  - `language/state/refactor`.
  - A página de efêmeros do plano (`manage-sensitive-data/ephemeral`) não apareceu na busca. Em seu
    lugar entraram a página geral de dados sensíveis e a de *write-only*.
- **Guia do exame.** O plano apontava para `certification-004/associate-study-004`, que a busca não
  encontrou. Entrou a lista de conteúdo do exame, `certification-004/associate-review-004`.
- **Changelog.** `github.com` é bloqueado aqui. O `CHANGELOG.md` foi lido por
  `raw.githubusercontent.com`, e o `course.yaml` aponta para o arquivo no repositório oficial.
- **`opentofu.org/docs/`:** não resolve aqui; é a documentação oficial do projeto.

### Esqueleto

- **`course.yaml`:** o do §6 do plano. Mudaram duas coisas:
  - as fontes, conforme as URLs acima;
  - o comentário das horas, que agora cita esta auditoria.
- **7 stubs válidos.** O frontmatter tem `id`, `title`, `summary` e `estimatedMinutes`, somando 425
  min, e o 07 já tem um `## Capstone` mínimo. `reviewedAt` e `reviewEvery: 6m` entram com o conteúdo
  de cada fase.
- **`PROJETO.md`:**
  - o porquê da trilha;
  - as peças por marco e os contratos com os vizinhos;
  - o laboratório testado e a tabela "recurso → versão";
  - os pré-requisitos com licença e o mapa para o exame 004.
- **`GLOSSARIO.md` mínimo:** 4 verbetes, sem repetir os de `entrega-continua-e-devops`. A meta da
  Fase 3 é ≥30.
- **`capstones.yaml`:** entra o `fin-iac`, com `depends_on: [fin-pipeline, fin-landscape, ledger-core]`,
  as linhas "consome" do `PROJETO.md`. As arestas de quem consome o `fin-iac` (`fin-interconnect` e
  `fin-devplatform`) entram na Fase 3, junto com as pontes da §10 do plano.

### Pontes para a Fase 1 em diante

- `aws-para-backend/08` (marcos 02 e 03) e `design-de-codigo/08` (marco 04) apontam para trilhas ainda
  não publicadas. Elas entram em `bridges-planned.yaml` no PR do marco que as cita.
- **Legado e modernização** (marco 06) fica em `arquitetura-de-solucoes/03` ("Core bancário e legado")
  e `/07` ("Modernização de portfólio").

## 2. Fase 1 — marcos 01 a 03

Os três marcos têm os cinco blocos de `## Hands-on`, `reviewedAt: 2026-11-10` e `reviewEvery: 6m`, e
somam 16 questões (4 + 6 + 6). Todo número citado no texto foi medido no laboratório da §1, com o
Terraform 1.17.1.

### Medições novas

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 01 | mudar `lc_collate` de `postgresql_database` | `must be replaced`, com `# forces replacement` em `lc_collate` e `lc_ctype`; no JSON, `["delete", "create"]` |
| 01 | o mesmo com `prevent_destroy = true` | `Error: Instance cannot be destroyed`, saída 1 |
| 01 | o mesmo com `create_before_destroy = true` e nome fixo | `database "ledger_prod" already exists` |
| 01 | pré-condição de retenção com `mock_provider` e `expect_failures` | `terraform test`: 2 passaram, sem banco |
| 01 | Conftest com a lista de recursos críticos | nega `["delete", "create"]`; aprova com a exceção em `--data` |
| 01 | `lifecycle { destroy = false }` (1.16) | num `terraform destroy`, o papel sai do estado e continua no Postgres. Com o bloco apagado do código, o plano voltou a dizer `will be destroyed`. O texto do marco foi corrigido: a primeira versão dizia que ele protegia também depois de o bloco sair |
| 02 | `kill -9` no meio do `apply` | no `s3`, o `.tflock` ficou órfão (`Error acquiring the state lock` com `ID:`) até o `force-unlock`; no `pg`, o próximo `plan` rodou |
| 02 | substituição interrompida | o plano seguinte pediu `1 to add`: o objeto velho já tinha saído |
| 02 | estado sobrescrito com lixo no *bucket* versionado | `Unsupported state file format`; com a versão anterior copiada por cima, o `plan` saiu vazio |
| 02 | `init -migrate-state` de `local` para `pg` | as mesmas 3 linhas no `state list` antes e depois |
| 02 | papel sem *grant* no esquema do estado | `permission denied for schema rede_pix` |
| 03 | rotação por `password_wo_version` 2 → 3, com o valor novo no cofre | a senha antiga é recusada, a nova é aceita, e o estado não tem nenhuma das duas |
| 03 | `TF_LOG=TRACE` | com a senha por `-var`, 2 ocorrências no log, nos argumentos da linha de comando; com o efêmero, 0 |

### Armadilha do laboratório

A imagem oficial do Postgres usa `trust` para `127.0.0.1` no `pg_hba.conf`: por `localhost`, dentro do
contêiner, **qualquer senha entra**. A primeira checagem de autenticação da §1 foi feita assim, e por
isso não provava nada. Ela foi refeita pelo IP do contêiner, onde vale o `scram-sha-256`:

- o `ledger_app` (*write-only*) entrou com a senha certa e foi recusado com a antiga;
- o `ledger_app_antes` (`sensitive`) entrou com a senha certa e foi recusado com uma senha errada.

O Tutorial do marco 03 avisa sobre a armadilha e manda conectar pela porta publicada ou pelo IP. O
`permission denied` do marco 02 é autorização, não autenticação, e vale por `localhost`.

### Conteúdo

- **Pontes:**
  - `entrega-continua-e-devops/02` e `/06`;
  - `seguranca-aplicacao/10`;
  - `aws-para-backend/08`, registrada em `bridges-planned.yaml` até a trilha existir.
- **Caixas "E no OpenTofu?":**
  - no 01, o `mock_provider` na 1.8;
  - no 02, a criptografia no cliente (1.7) e a mudança do bloqueio do `pg` (1.10);
  - no 03, efêmeros e *write-only* na 1.11.
- **HCL dos marcos:** os 3 blocos passam no `terraform fmt -check`. Um deles estava fora do formato
  (alinhamento do `command`) e foi corrigido.
- **Quizzes:** 16 questões. A resposta certa foi distribuída entre as quatro posições, e nenhuma é a
  opção estritamente mais longa.
- **Testes:** os golden de seções sobem +3 em cada bloco, e os três marcos saem de `wantNoSection`.

## 3. Fase 2 — marcos 04 e 05

Os dois marcos têm os cinco blocos de `## Hands-on`, `reviewEvery: 6m` e 4 questões cada. As medições
usaram o laboratório da §1, com o Terraform 1.17.1.

### Medições novas

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 04 | módulo `postgres-servico` com `validation` e `optional`, testado por `terraform test` com `mock_provider` | 3 casos passaram: nome válido com a saída esperada, nome com maiúscula e limite 0 rejeitados na variável certa |
| 04 | consumidor na v1.0.0 (*tag* Git local) atualizando para a v2.0.0-rc1, que renomeia `postgresql_role.app` sem `moved` | `app will be destroyed` e `aplicacao will be created`, `Plan: 1 to add, 0 to change, 1 to destroy` |
| 04 | o mesmo para a v2.0.0, com `moved` | `has moved to`, `Plan: 0 to add, 0 to change, 0 to destroy` |
| 04 | a mesma suíte com o `postgresql` 1.26.0 e o 1.27.0, fixados por `matriz_override.tf` | 3 passaram nas duas versões; o lock registrou a versão de cada rodada |
| 04 | `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64` (`aws` 6.72.0, por `-fs-mirror`) | dois *hashes* `h1:`, um por plataforma |
| 05 | plano salvo em `homologacao` aplicado com `producao` selecionado (*backend* `pg`) | recusado: `The plan file describes changes to the "homologacao" workspace, but the "producao" workspace is currently in use` (comportamento da 1.15) |
| 05 | política de mínimos por ambiente sobre o plano em JSON (`input.variables`) | produção com 30 dias e 1 réplica reprovada em 2 regras; dev com 7 dias e 1 réplica aprovado |

O provedor `postgresql` 1.26.0 foi compilado do código-fonte, como o 1.27.0, para a matriz.

### Correções durante a escrita

- **Variáveis na fonte do módulo.** A primeira versão punha a novidade da 1.15 do Terraform dentro da
  caixa do OpenTofu. O *changelog* do OpenTofu mostra que ela chegou lá antes, na 1.8 ("Variables and
  Locals allowed in module sources and backend configurations"). O texto passou a dar as duas versões.
- **Bloco HCL fora do formato** no `tests/contrato.tftest.hcl` do laboratório (alinhamento de `=`),
  pego pelo `fmt -check`. Os blocos HCL dos marcos 04 e 05 passam no `fmt -check`.

### Conteúdo

- **Pontes:**
  - `entrega-continua-e-devops/05`;
  - `engenharia-de-plataforma/05`;
  - `kubernetes/13`;
  - `design-de-codigo/08`, registrada em `bridges-planned.yaml`.
- **Caixas "E no OpenTofu?":**
  - no 04, o registro próprio, que muda o endereço no lock, e as variáveis na fonte do módulo;
  - no 05, o `for_each` em configuração de provedor (1.9) e a ausência do Stacks.
- **Quizzes:** 8 questões, com a resposta certa distribuída e nunca a opção mais longa. A trilha soma
  24 de 34.
- **Testes:** os golden de seções sobem +2 em cada bloco, e os dois marcos saem de `wantNoSection`.

## 4. Fase 3 — marcos 06 e 07, capstone, glossário e pontes

Os marcos 06 (quiz de 6) e 07 (quiz de 4) completam a trilha: 7 marcos, 425 minutos e **34 questões**.
O 07 traz o `## Capstone`, com **Entrega**, **Critérios de pronto** e a pergunta final do plano.

### Medições novas

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 06 | *script* `legado/` cria 3 papéis e 1 banco no Postgres, 1 *bucket* e 1 tabela DynamoDB no `moto`; `import` (com `for_each` nos papéis) | `6 imported`; o `plan` seguinte com `-detailed-exitcode` = 0 |
| 06 | `-generate-config-out` | papel: 21 atributos, quase todos padrão; banco: 11; tabela DynamoDB: `recovery_period_in_days = 0`, que o `plan` recusou (`expected ... in the range (1 - 35), got 0`) |
| 06 | `import` com `for_each` e geração de configuração | falha: `The target resource does not use for_each`. O bloco `resource` com `for_each` precisa existir antes |
| 06 | banco e papéis levados para `module.conciliacao` com `moved` | 4 linhas `has moved to`, e o plano em JSON sem nenhuma ação diferente de `no-op` |
| 06 | `count` → `for_each` em 3 itens | sem `moved`: `3 to add, 3 to destroy`; com `moved`: plano vazio |
| 06 | divisão do estado: `removed` (`destroy = false`) na origem e `import` no destino | `2 imported`; a soma dos endereços dos dois estados é igual à lista antiga (6); os dois planos vazios; o *bucket* e a tabela continuam no `moto` |
| 07 | plano salvo seguido de outro `apply` no mesmo estado | `Error: Saved plan is stale` |
| 07 | papel com só `SELECT` na tabela de estado do `pg` | `plan` roda (com `PG_SKIP_SCHEMA_CREATION`, `PG_SKIP_TABLE_CREATION` e `PG_SKIP_INDEX_CREATION`). No `apply`, o recurso **foi alterado** no Postgres antes da falha `permission denied for table states`, e ficou um `errored.tfstate` local |
| 07 | `ALTER ROLE ... CONNECTION LIMIT 999` direto no Postgres | `plan -refresh-only -detailed-exitcode`: `Objects have changed outside of Terraform`, `connection_limit = 30 -> 999`, saída 2 |
| 07 | `tflint` 0.66.0 com o *preset* `recommended` | `terraform_required_version`, `terraform_typed_variables` e `terraform_unused_declarations` numa *fixture* |

**Ajuste de laboratório.** O SQS foi trocado por uma tabela DynamoDB no *script* legado. O `moto` devolve a
URL da fila como `http://localhost:5055/...`, e o provedor `aws` 6.72.0 recusou esse formato como ID de
importação (`could not parse ... as SQS URL`).

**Correção do invariante 3 do 07.** A primeira redação dizia "o papel de `plan` não consegue escrever (teste
de permissão no *backend* `pg`)". A medição mostrou que a permissão só no estado deixa o recurso mudar. O
invariante passou a exigir credencial de leitura no estado **e** no provedor, e a conferir que o objeto
no Postgres não mudou.

### Glossário, conceitos e pontes

- **Glossário: 38 verbetes**, todos com marco resolvido (golden `38/38`). Nenhum repete os de
  `entrega-continua-e-devops`: estado, *plan* como artefato, *drift*, raio de explosão e política sobre o
  plano continuam lá.
- **`conceitos.yaml`:** entrou o `argumento-write-only`, com dono em `terraform-e-iac/03`. A citação fora
  do dono está em `conectividade-multicloud/06`, num parágrafo que faz ponte para o marco 02, não para o
  03. Por isso o *linker* liga o termo. O termo está sem itálico ali, porque o *linker* não atravessa a
  ênfase do Markdown.
- **Edições da §10 do plano:**
  - `entrega-continua-e-devops/06`: a seção "Para ir além", com pontes para os marcos 02, 03 e 06, e no
    invariante 6, "O conserto está em `terraform-e-iac/03`";
  - `conectividade-multicloud/06`: pontes para os marcos 02 e 03, nos "Segredos fora do código" e nos
    aprendizados;
  - `engenharia-de-plataforma/05`: ponte para o marco 04.
- **`capstones.yaml`:** `fin-interconnect` e `fin-devplatform` passam a depender do `fin-iac`, as linhas
  "serve" do `PROJETO.md`. O `fin-aws` entra quando a trilha `aws-para-backend` existir.
- **Pontes do 06 e do 07:**
  - `arquitetura-de-solucoes/03` e `/07`;
  - `entrega-continua-e-devops/02`, `/06` e `/09`.

### Testes

- O `wantNoSection` volta a ser vazio: todo marco tem `## Hands-on` de novo.
- O golden de seções sobe +2 em cada bloco.
- O golden do glossário foi regenerado.

## 5. Fase 4 — auditoria e revisão independente

### Números da trilha

Conferidos pelo `TestTerraformEIacAuditoria` (`aggregator/internal/course/terraformeiac_auditoria_test.go`),
que roda em todo *build*:

- 7 marcos, Σ 425 min, `estimatedHours: 14` e `level: advanced`;
- `reviewEvery: 6m` e `reviewedAt` em todos os marcos;
- os cinco blocos de `## Hands-on` em cada marco e o `## Capstone` só no 07;
- 34 questões, 6 nos marcos 02, 03 e 06 e 4 nos demais, nenhuma com a resposta certa sendo a opção
  estritamente mais longa (medido: 0 de 34);
- 38 verbetes no glossário, todos apontando para os marcos 01 a 07;
- nenhuma ponte `terraform-e-iac/NN` quebrada, em nenhuma trilha.

Os blocos HCL de todos os marcos passam no `terraform fmt -check`. Os resultados de laboratório não cabem
no teste Go, porque precisam do Terraform, do Postgres e do `moto`. Eles ficam nas §1 a §4 e na revisão
abaixo.

### Revisão independente dos marcos 02, 03 e 06

Um revisor que não escreveu os marcos reexecutou do zero cada afirmação medida e cada invariante
destrutivo. Ele trabalhou num diretório próprio, com objetos `rev_` e o mesmo Terraform 1.17.1, e
conferiu as versões nos *changelogs* oficiais. Quase tudo se reproduziu. Ele também conferiu os
gabaritos dos três quizzes: estão todos certos. Os 12 achados e o que mudou:

| # | Achado | Correção |
| --- | --- | --- |
| 1 | **Erro factual.** A caixa do OpenTofu no 06 dizia que só o OpenTofu (1.10) move entre recursos de tipos diferentes. O *changelog* do Terraform 1.8 mostra que ele também move, quando o provedor de destino declara a conversão (exemplo canônico: `null_resource` → `terraform_data`) | caixa do 06 e `PROJETO.md` corrigidos; nova linha na tabela "recurso → versão" (1.8 / 1.10) |
| 2 | "Plano vazio" com `moved` pendente: o plano mostra `0 to add, 0 to change, 0 to destroy`, mas `-detailed-exitcode` sai **2** até o `apply` | 06 (tabela e parágrafo novo), quiz do 06, glossário, e o mesmo no 04: o invariante 3 passou a exigir só `no-op` no JSON, o resumo e os aprendizados dizem "nenhuma ação", e o critério do capstone também |
| 3 | O vazamento no `TF_LOG` vem do `-var`, não da falta de efêmero: a mesma variável `sensitive` por `TF_VAR_senha` deu 0 | conferido aqui também (0 ocorrências por `TF_VAR_`); texto, quiz e aprendizado do 03 |
| 4 | O `apply` interrompido pode deixar o objeto novo **fora** do estado: na revisão, o `apply` seguinte falhou com `BucketAlreadyExists` | o 02 descreve os dois desfechos, e o conserto do segundo é importar o objeto órfão (marco 06) |
| 5 | Depois do `-migrate-state`, o `terraform.tfstate` local fica com 0 bytes e o estado inteiro vai para `terraform.tfstate.backup` | o 02 manda apagar os dois arquivos |
| 6 | `Already locked for workspace creation` só aparece na primeira execução; em regime, é `Workspace is already locked: default`. No `s3`, a mensagem traz `412 PreconditionFailed` | 02 e §1 desta auditoria |
| 7 | O papel de leitura do `pg` precisa das `PG_SKIP_*`, ou o `init` falha com `permission denied for schema public` | o 02 traz o aviso e a ponte para o 07 |
| 8 | "Só `name` e `template`" omitia o valor: com `template1`, o plano pediu substituição. Papéis com LOGIN precisam de `login = true` | 06 |
| 9 | O invariante 5 do 06 reprovaria `default = null` numa variável | o padrão passou a valer só dentro de bloco `resource`, com uma *fixture* de controle |
| 10 | "3 filas": a medição foi com 3 `terraform_data`, porque o SQS saiu do laboratório | 06 e quiz dizem "3 itens" |
| 11 | O exemplo do `terraform query` omitia `account_id=,` | 06 |
| 12 | Versões da rotação desencontradas (texto 2 → 3, invariante "versão 2") | o texto usa 1 → 2 |

**Não verificado pelo revisor, com o motivo:**

- o `moved` entre tipos na prática, porque o provedor `null` não está no *mirror*;
- o comportamento do OpenTofu, porque não há binário `tofu` no laboratório (só os *changelogs*);
- as linhas de Azure e GCS da tabela do 02, porque não há emulador;
- as datas externas, porque os sites não resolvem neste ambiente.

**Nuance anotada, sem mudança no texto.** O revisor lembrou que, no Terraform, o bloqueio de criação do
`pg` é comum a todos os esquemas do mesmo banco. O OpenTofu 1.10 trocou isso por um bloqueio mais
granular. Com poucos estados, isso não pesa contra "um esquema por estado". Fica como ponto de revisão
se o `fin-iac` crescer.

## Critérios de aceite (§12 do plano)

- [x] 7 marcos com os cinco blocos de `## Hands-on` e invariantes testáveis.
- [x] Invariantes de bloqueio, importação e `removed` provados contra recursos reais locais (Postgres e
      `moto`), não só *mock*, e reproduzidos por um revisor independente.
- [x] Tabela "recurso → versão" no `PROJETO.md`, conferida nos *changelogs*; nenhuma versão de memória.
- [x] Edições da §10 aplicadas e pontes resolvendo.
- [x] `GLOSSARIO.md` com 38 verbetes, sem duplicar os de `entrega-continua-e-devops`; `reviewEvery: 6m`.
- [x] `go test ./...` e os testes do front verdes.
