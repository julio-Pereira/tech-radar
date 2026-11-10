# Projeto guia: `fin-iac`

> Componente do `fin-platform`. O `fin-iac` é a **fundação de infraestrutura como código** que os outros
> componentes de nuvem consomem. Ele define como o estado é dividido e guardado, como os módulos são
> publicados e testados, e como uma mudança chega à produção.

## Por que uma trilha própria

O catálogo ensina Terraform num marco só, o `entrega-continua-e-devops/06`, e o usa como meio em
`conectividade-multicloud/06`, `engenharia-de-plataforma/05` e na trilha `aws-para-backend`. Esta trilha
parte do que aquele marco já ensina e cobre o que separa quem fez o tutorial de quem mantém a IaC de um
time:

- o estado remoto com bloqueio;
- o segredo fora do estado;
- módulos com versão;
- vários ambientes do mesmo código;
- a infraestrutura que já existe (*brownfield*);
- a mudança só por PR.

Nenhuma das quatro vagas analisadas em 7 nov 2026 citou Terraform pelo nome. A prioridade vem das
trilhas de nuvem que dependem desta e das vagas com AWS, que costumam pedir IaC.

## O que você vai construir

| Pasta | Conteúdo |
| --- | --- |
| `estados/` | raízes de estado por fronteira (rede, dados, aplicação) e por ambiente |
| `modulos/` | módulos com *tags* semânticas e `tests/` de contrato |
| `politicas/` | regras sobre o plano em JSON, no motor do catálogo |
| `lab/` | *compose* com o Postgres (*backend* `pg` e alvo do provedor `postgresql`) e o `moto` (S3, SQS, DynamoDB, IAM, Secrets Manager) |
| `legado/` | o *script* que cria recursos "à mão", para o marco 06 importar |
| `.github/workflows/` | a esteira de PR do marco 07 |
| `adr/` | as decisões: motor de política, analisador de segurança, layout de estado |

| Marco | Peça do `fin-iac` |
| --- | --- |
| 01 | O banco do ledger protegido contra destruição, com pré-condição e política |
| 02 | Estados por fronteira, com bloqueio, versionamento e acesso separado |
| 03 | O papel de aplicação do Postgres sem a senha no estado |
| 04 | O módulo `postgres-servico` versionado, com teste de contrato |
| 05 | Três ambientes do mesmo código |
| 06 | Os recursos legados importados e reorganizados em módulos |
| 07 | A esteira de PR, com plano comentado, portões e detecção de *drift* |

## Contratos com os vizinhos

| Direção | Interface | Vizinho |
| --- | --- | --- |
| serve | módulos versionados, layout de estado, esteira de IaC | `fin-aws` (`aws-para-backend`), `fin-interconnect` (`conectividade-multicloud`), `fin-devplatform` (`engenharia-de-plataforma`) |
| consome | motor de política e regras compartilhadas | `fin-pipeline` (`entrega-continua-e-devops`), `fin-landscape` (`arquitetura-de-solucoes/05`) |
| consome | o banco do ledger, como alvo de importação | `ledger-core` (`go-fintech`) |

**O que não é:** um curso introdutório, um catálogo de provedores ou uma preparação para certificação.

## Laboratório: tudo local, com recursos de verdade

O estado, o bloqueio e a importação não se provam só com *mock*: é preciso algo que exista. Cada caminho
abaixo foi testado em 9 e 10 nov 2026 com o Terraform 1.17.1 (detalhes na auditoria):

| Caminho | O que prova | Resultado |
| --- | --- | --- |
| *Backend* `pg` com o Postgres 17 em Docker | bloqueio real, papel separado para ler o estado | dois `apply` simultâneos: um passa, o outro falha com `Error acquiring the state lock`, e o `plan` seguinte sai vazio |
| *Backend* `s3` com `use_lockfile` no `moto` 5.2.5 | bloqueio nativo do S3 e versionamento do estado | o `moto` respeita o `If-None-Match`; o segundo `apply` falha no `PutObject` condicional |
| Provedor `cyrilgdn/postgresql` 1.27.0 | importação, *drift*, `removed` e senha *write-only* | `password_wo` tira a senha do estado e do plano salvo |
| Provedor `hashicorp/aws` 6.72.0 apontado para o `moto` | consultas de listagem, segredo efêmero, analisador de segurança | `terraform query` lista os *buckets* criados à mão |
| `mock_provider` | o que é só forma do plano | convenção do catálogo |

O provedor `docker`, previsto no plano, ficou de fora. O `postgresql` e o `aws` com o `moto` cobrem todos
os invariantes, e um provedor a menos é um provedor a menos para atualizar.

## Recurso → versão

Conferido nas *release notes* oficiais (o `CHANGELOG.md` de cada versão no repositório do Terraform e do
OpenTofu), em 10 nov 2026.

| Recurso | Terraform | OpenTofu | Marco |
| --- | --- | --- | --- |
| blocos `check` | 1.5 (jun 2023) | herdado do *fork* | 01 |
| bloco `import` declarativo | 1.5 | herdado do *fork* | 06 |
| `-generate-config-out` | 1.5 (ainda **experimental** na 1.17) | herdado do *fork* | 06 |
| `terraform test` estável | 1.6 (out 2023) | 1.6 | 04 |
| `mock_provider` nos testes | 1.7 (jan 2024) | 1.8 | 01, 04 |
| bloco `removed` | 1.7 | 1.7 | 06 |
| `for_each` em `import` | 1.7 | 1.7 | 06 |
| `moved` entre recursos de tipos diferentes (se o provedor declara a conversão) | 1.8 | 1.10 | 06 |
| criptografia de estado no cliente | não existe | 1.7 | 02 |
| `for_each` em configuração de provedor | não existe | 1.9 | 05 |
| recursos, variáveis e saídas efêmeros | 1.10 (nov 2024) | 1.11 | 03 |
| bloqueio nativo do S3 (`use_lockfile`) | 1.10 em teste; estável na 1.11 (fev 2025), que torna `dynamodb_table` obsoleto | 1.10 | 02 |
| argumentos *write-only* | 1.11 | 1.11 | 03 |
| `terraform stacks` na CLI | 1.13 (ago 2025); Stacks é recurso do HCP Terraform, estável desde a HashiConf 2025 | não existe | 05 |
| consultas de listagem (`terraform query`, `.tfquery.hcl`) | 1.14 (nov 2025) | não existe | 06 |
| blocos `import` dentro de módulos | 1.16 (ago 2026) | — | 06 |
| `lifecycle { destroy = false }` em recurso | 1.16 | — | 01, 06 |
| `terraform graph -format=mermaid` | 1.16 | — | 01 |
| Terraform Policy (`-policies`) estável | 1.17 (out 2026) | não existe | 07 |

Duas diferenças do OpenTofu que entram no texto:

- **Marco 02.** Na 1.10 do OpenTofu, o *backend* `pg` mudou a implementação do bloqueio. Versões
  diferentes no mesmo banco podem gravar ao mesmo tempo e perder dados.
- **Marco 06.** O `moved` entre recursos de tipos diferentes existe nos dois, quando o provedor de
  destino declara a conversão: no Terraform desde a 1.8, no OpenTofu desde a 1.10.

**Versão mínima da trilha:** Terraform **1.14**, a primeira com efêmeros, *write-only*, `import`
declarativo, bloqueio nativo do S3 e consultas de listagem. Os exemplos rodam na **1.17.1**. O OpenTofu
é opcional, na linha 1.13.

## Pré-requisitos

| Ferramenta | Versão conferida (nov/2026) | Licença |
| --- | --- | --- |
| Terraform | 1.17.1 (mínima 1.14) | BUSL 1.1 |
| OpenTofu (opcional) | 1.13.9 | MPL 2.0 |
| Docker | Postgres 17 e o laboratório | Apache 2.0 |
| `moto` em modo servidor | 5.2.5 | Apache 2.0 |
| Provedor `cyrilgdn/postgresql` | 1.27.0 (jun 2026) | MPL 2.0 |
| Provedor `hashicorp/aws` | 6.72.0 | MPL 2.0 |
| `tflint` | 0.66.0, com o *ruleset* `terraform` embutido | MPL 2.0 |
| Checkov | 3.4.3, o analisador de segurança (ADR no marco 07) | Apache 2.0 |
| Conftest (OPA) | 0.71.1, o motor de política (ADR no marco 01) | Apache 2.0 |

**Não precisa:** conta em nuvem nem HCP Terraform pago. O Infracost entra só como Complemento do marco
07, porque a CLI precisa de uma chave da API de preços (gratuita), e a esteira da trilha roda sem
credencial.

## Mapa para o exame Terraform Associate (004)

O exame 004 substituiu o 003 em 8 jan 2026. Guias de terceiros dizem que ele testa o Terraform 1.12. O
guia oficial é a lista de conteúdo do exame no HashiCorp Developer.

| Área do exame | Onde nesta trilha |
| --- | --- |
| fluxo básico, provedores, estado | `entrega-continua-e-devops/06`; aprofundado em 01 e 02 |
| configuração (variáveis, saídas, expressões, `lifecycle`, condições) | 01 e 04 |
| módulos | 04 |
| estado remoto e *backends* | 02 |
| segredos e dados sensíveis | 03 |
| importação e refatoração | 06 |
| HCP Terraform (*workspaces*, execução remota, política) | **não coberto**: a trilha não usa produto pago; o critério de escolha está em 05 e 07 |

## Regra das horas

A trilha soma 425 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 425 x 2 / 60 = 14,2, arredondado para **14 horas**.
