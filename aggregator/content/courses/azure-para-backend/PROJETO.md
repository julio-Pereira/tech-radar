# Projeto guia: `fin-azure`

> Componente do `fin-platform`. O `fin-azure` é o **`fin-platform` desenhado para o Azure**: a
> infraestrutura como código que o descreve, os adaptadores Azure dos serviços que você já construiu e as
> provas, sobre o código e em emuladores, de que governança, identidade, rede, dados, chaves, resiliência
> e custo estão certos.

## Por que uma trilha própria

O Azure é a nuvem dominante em bancos e instituições financeiras brasileiras, e uma tabela "conceito →
serviço" não sustenta uma entrevista para ele. Esta trilha é a gêmea da `aws-para-backend`: o mesmo
esqueleto (11 marcos, 655 minutos, 54 questões) para que as duas sejam comparáveis marco a marco. O
conteúdo segue o que é **próprio do Azure**, e o Azure tem armadilhas que não existem na AWS:

- a hierarquia de escopo do RBAC, em que `NotActions` subtrai do papel e não nega;
- o PaaS que nasce com *endpoint* público;
- o DNS do Private Endpoint;
- o plano de controle separado do plano de dados;
- o par de regiões do Brazil South, que fica fora do Brasil.

A tese: no Azure, quase toda falha grave de um serviço backend vem de **identidade com escopo largo
demais, *endpoint* público que ninguém desligou, DNS privado mal resolvido e custo que ninguém modelou**.
O engenheiro sênior desenha esses quatro primeiro e prova que estão certos antes de existir uma
assinatura.

Quem vem da AWS encontra, em todo marco, uma tabela **"na AWS → no Azure → o que muda de verdade"**, com
ponte para o marco gêmeo da `aws-para-backend`. Quem já usa Azure encontra, em todo marco, uma caixa
**"armadilha"**: o erro que quem usa Azure há anos ainda comete.

**Nome atual primeiro.** Na primeira menção, o nome antigo vem entre parênteses ("Microsoft Entra ID
(antigo Azure AD)"), porque o entrevistador e a documentação antiga ainda usam os dois.

## O que você vai construir

| Pasta | Conteúdo |
| --- | --- |
| `infra/` | módulos Terraform: `governanca`, `identidade`, `rede`, `dns`, `computacao`, `mensageria`, `dados`, `chaves`, `observabilidade` |
| `politicas/` | regras sobre o código Terraform, o catálogo de invariantes compartilhado com o `fin-aws`, o avaliador didático de RBAC e o resolvedor didático de DNS |
| `lab/` | *compose* com Azurite, os emuladores do Service Bus, do Event Hubs e do Cosmos DB, Postgres, SQL Server e o Lowkey Vault |
| `adapters/go/` | adaptadores Azure do `ledger-core` (Azure SDK for Go) |
| `adapters/java/` | adaptadores Azure do `pix-gateway` (Azure SDK for Java e Spring Cloud Azure) |
| `custo/` | o modelo de custo do marco 11 |
| `adr/` | as decisões: laboratório, computação, mensageria, residência e DR |

| Marco | Peça do `fin-azure` |
| --- | --- |
| 01 | Management groups, assinaturas e iniciativas de Azure Policy como código, com *tags* obrigatórias |
| 02 | Identidades sem segredo e atribuições de papel no menor escopo, provadas pelo avaliador |
| 03 | Rede *hub-spoke* sem *endpoint* público, com Private Endpoint e DNS privado provados |
| 04 | A decisão de computação, por ADR, e o `pix-gateway` no alvo escolhido |
| 05 | Filas, tópicos e *streams*, com idempotência, DLQ e ordem por sessão |
| 06 | Funções e orquestração determinística, com concorrência limitada contra o banco |
| 07 | Bancos gerenciados com HA, PITR e chave de partição analisada |
| 08 | *Storage* sem *shared key*, Key Vault com *purge protection* e segredos fora do código |
| 09 | Alertas a partir dos SLOs e *diagnostic settings* em todo recurso |
| 10 | O plano de DR, com RPO, RTO e residência justificada |
| 11 | O modelo de custo e o capstone |

O `fin-azure` usa o layout de estado, o *backend*, os módulos versionados e a esteira do `fin-iac`
(`terraform-e-iac`). Esta trilha não ensina Terraform.

## Contratos com os vizinhos

Todos simuláveis com *stub*.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | serviços que ganham adaptador Azure | `ledger-core` (`go-fintech`), `pix-gateway` (`spring-boot`) |
| consome | eventos e contratos de mensagem | `pix-stream` (`kafka`), `arquitetura-eventos` |
| consome | SLOs a virar alertas | `fin-watch` (`observabilidade`) |
| consome | dimensionamento de *pool* e concorrência | `fin-contention` (`concorrencia-e-recursos`) |
| consome | espaços de endereço e bordas de outras nuvens | `fin-interconnect` (`conectividade-multicloud`) |
| consome | layout de estado, módulos e esteira de IaC | `fin-iac` (`terraform-e-iac`) |
| compartilha | catálogo de invariantes de nuvem | `fin-aws` (`aws-para-backend`) |
| serve | módulos e políticas reutilizáveis | `fin-devplatform` (`engenharia-de-plataforma`) |

**O que não é:** não exige assinatura Azure, não é uma *landing zone* completa de produção (o CAF e os
módulos oficiais existem para isso), não é curso de certificação e não ensina Terraform.

## O catálogo de invariantes compartilhado

Os invariantes centrais têm **o mesmo nome e a mesma intenção** no `fin-aws` e no `fin-azure`, com
implementação por provedor. Isso torna a comparação AWS × Azure concreta.

| Invariante | Intenção | Na AWS (`aws-para-backend`) | No Azure (esta trilha) |
| --- | --- | --- | --- |
| `sem-entrada-publica` | nenhum dado alcançável pela internet | marcos 03 e 08 (SG, BPA) | marcos 03 e 08 (`public network access` desligado, Private Endpoint) |
| `saida-unica` | toda saída por um ponto conhecido | marco 03 (NAT/Firewall) | marco 03 (UDR para o Firewall, ou NAT por ADR) |
| `menor-privilegio` | identidade só com o que usa, no menor escopo | marco 02 | marco 02 |
| `criptografia-com-chave-do-cliente` | dado classificado com chave do cliente | marco 08 (KMS) | marco 08 (CMK no Key Vault) |
| `tags-de-custo` | todo recurso com dono e centro de custo | marco 01 | marco 01 |
| `retencao-de-logs` | nenhum *log* guardado para sempre por omissão | marco 09 | marco 09 |
| `segredo-fora-do-plano` | nenhum segredo no código, no estado ou no plano | marco 08 | marco 08 |

O `fin-aws` já existe; o catálogo adota os nomes dele.

## O laboratório: código, emulador e, só se quiser, assinatura

O hands-on tem três camadas, e nenhuma exige assinatura paga.

### ADR: a camada de infraestrutura (12 nov 2026)

**Contexto.** Na AWS, o provedor aceita `skip_credentials_validation` e similares, e o `terraform plan`
roda sem conta; a política avalia o JSON do plano. **No Azure, isso não existe.** Medido aqui com o
`hashicorp/azurerm` 5.13.0:

- sem credencial, o `plan` falha ao montar o autenticador (`unable to build authorizer for Resource
  Manager API`), porque procura a Azure CLI;
- com uma credencial falsa, o provedor **chama o Entra ID** e falha com `AADSTS700038` (o identificador
  não é de um aplicativo válido).

Sem assinatura, não há JSON de plano para avaliar.

**Decisão.** A camada 1 tem duas ferramentas, e nenhuma pede credencial:

1. **`terraform test` com `mock_provider "azurerm"`**, para o que depende de valor resolvido (variáveis,
   composição de módulos, `for_each`). Medido: o caso bom passou, e a mutação com `shared key` ligada foi
   reprovada.
2. **Conftest sobre o código HCL** (`--parser hcl2`), para as regras estruturais. Medido: a *fixture*
   sem os atributos de segurança foi reprovada nas duas regras, e o código com os valores literais passou.
   O código com o valor vindo de uma variável (`${var.publico}`) **também foi reprovado**: a regra não
   resolve variáveis. Por isso, a convenção do `fin-azure` é **atributo de segurança literal no módulo**;
   o que precisa variar fica no `terraform test`.

Com assinatura, a política sobre o JSON do plano volta a funcionar, igual à AWS. Ela fica como
Complemento.

### ADR: os emuladores (12 nov 2026)

Testados neste ambiente, com Docker:

| Emulador | Imagem | Licença | Testado | Papel |
| --- | --- | --- | --- | --- |
| **Service Bus** (oficial) | `azure-messaging/servicebus-emulator`, imagem de 1 jul 2026 | *Microsoft Software License Terms*; depende do SQL Server em edição de desenvolvimento | detecção de duplicidade (dois envios do mesmo `MessageId`, uma mensagem); *lock* de 5 s expirado devolve a mensagem, e completar a primeira cópia dá `MessageLockLostError`; DLQ por `MaxDeliveryCountExceeded`; sessão em ordem e bloqueada para um segundo receptor (`SessionCannotBeLockedError`) | marco 05 |
| **Event Hubs** (oficial) | `azure-messaging/eventhubs-emulator`, imagem de 30 jun 2026 | *Microsoft Software License Terms*; depende do Azurite | 10 eventos produzidos e consumidos; com *checkpoint* no Azurite, o consumidor reiniciado leu só os 3 novos | marco 05 |
| **Cosmos DB** (oficial, *vNext*, Linux) | `cosmosdb/linux/azure-cosmos-emulator:vnext-preview`, imagem de 19 out 2026 | licença do emulador da Microsoft | 50 `create_item` concorrentes da mesma chave: 1 sucesso, 49 com 409; `replace` com ETag velho: 412; *transactional batch* com um `create` duplicado falhou inteiro e o saldo não mudou | marco 07 |
| **Azurite** (oficial) | `azure-storage/azurite` 3.37.0 | MIT | Blob para o *checkpoint* do Event Hubs e para a carga grande do Service Bus | marcos 05 e 08 |
| **Lowkey Vault** (comunitário) | `nagyesta/lowkey-vault` 7.4.0 | MIT | segredo gravado em duas versões e lido com o SDK oficial (`azure-keyvault-secrets`) | marco 08, no lugar do Key Vault |
| **SQL Server** | `mssql/server:2022-latest` | edição de desenvolvimento | dependência do emulador do Service Bus | marcos 05 e 07 |

Quatro coisas que o laboratório mostrou, e que viram conteúdo:

- **O emulador do Service Bus aceita janela de duplicidade de no máximo 5 minutos.** Com 10 minutos, ele
  não sobe, e o erro no fim do *log* diz `Out of memory`, que engana; a causa real está mais acima. Na
  nuvem, o padrão é 10 minutos e o máximo é 7 dias.
- **O Azurite fica atrás do SDK.** O `azure-storage-blob` 12.31.1 usa a versão de API 2026-10-06, que o
  Azurite 3.37.0 recusa (`InvalidHeaderValue`). A saída documentada é iniciar o Azurite com
  `--skipApiVersionCheck`.
- **A chave padrão do Azurite não se digita de memória.** Uma letra errada dá `AuthorizationFailure`, que
  parece problema de assinatura. A chave vem da documentação do Azurite, por cópia.
- **O Lowkey Vault não é o Key Vault.** Ele é um dublê de teste e cobre parte da API. O próprio projeto
  diz que não substitui o serviço.

**O que nenhum emulador reproduz** (caixa obrigatória nos marcos com emulador):

- RBAC (os emuladores aceitam a *connection string* com chave e não avaliam papel);
- Private Endpoint e DNS privado;
- cotas, *throttling* e RU real;
- latência e multi-região;
- custo.

**Credencial sem segredo.** Os adaptadores usam a cadeia de credencial do SDK só no desenvolvimento. Em
produção, usam uma credencial explícita (`ManagedIdentityCredential` ou a federação de *workload*), porque
a recomendação atual da Microsoft é não depender do `DefaultAzureCredential` em produção: a cadeia pode
cair num método inesperado sem aviso. *Connection string* com chave existe só no laboratório, apontando
para emulador, e um teste garante que ela não chega ao código de infraestrutura.

**Assinatura real, só como Complemento**, sempre com *budget* e alerta criados antes de qualquer `apply`
e um `destroy` documentado no fim. Nenhum invariante depende dela.

## Limites e comportamentos conferidos

Conferidos no Microsoft Learn e nos anúncios da Microsoft em **12 nov 2026**. Todo número entra no texto
com essa data.

| Tema | Valor conferido | Marco |
| --- | --- | --- |
| par de regiões do Brazil South | **South Central US**, nos Estados Unidos, e a relação não é recíproca. O **Brazil Southeast** tem acesso restrito (cenários como DR no país) e é pareado com o Brazil South | 01, 10 |
| saída padrão (*default outbound access*) | nas versões de API posteriores a 31 mar 2026, as sub-redes de VNets novas nascem privadas (`defaultOutboundAccess = false`); as existentes não mudam | 03 |
| NSG flow logs | sem criação nova desde 30 jun 2025; aposentadoria em 30 set 2027. O substituto são os **VNet flow logs** | 03 |
| `NotActions` | não é negação: só exclui ações do papel, e outro papel pode conceder de volta | 02 |
| *deny assignments* | além das criadas pela plataforma, existem *deny assignments* atribuídas pelo usuário, que negam escrita, exclusão e ações num escopo. Não cobrem leitura nem ações de dados, não aceitam grupo como principal e exigem ao menos um principal excluído | 02 |
| condições em atribuições (ABAC) | Blob Storage e Queue Storage | 02, 08 |
| hospedagem do Functions | **Flex Consumption** é a recomendação para apps novos; o Consumption em Linux se aposenta em 30 set 2028 | 06 |
| Go no Functions | suporte nativo a Go 1.24+, só no Flex Consumption; a documentação recomenda o nativo, e não o *custom handler*, para apps novos em Go. Uma página diz GA, outra diz *preview*; o marco 06 confere de novo | 06 |
| *retry* por *trigger* | políticas de *retry* do *runtime* para Cosmos DB, Event Hubs, Kafka e Timer; Service Bus e Event Grid usam o mecanismo do próprio serviço (contagem de entrega e DLQ, política da assinatura) | 06 |
| detecção de duplicidade do Service Bus | padrão de 10 minutos, máximo de 7 dias (no emulador, 5 minutos). Não impede o mesmo processamento duas vezes | 05 |
| mensagem do Service Bus | 256 KB no Standard; até 100 MB no Premium, por AMQP | 05 |
| DR do Service Bus | o **Geo-Disaster Recovery** copia só metadados (entidades e configuração), não as mensagens. A **Geo-Replication** (Premium) replica as mensagens. Os dois não convivem no mesmo *namespace* | 10 |
| Kafka no Event Hubs | Standard, Premium e Dedicated (não no Basic); compressão só gzip, no Premium e no Dedicated; transações em *preview*, com páginas que divergem. No emulador, só as APIs de produtor e consumidor | 05 |
| chaves de partição hierárquicas do Cosmos DB | até três níveis; operações transacionais exigem o caminho completo da chave | 07 |
| Redis gerenciado | o **Azure Cache for Redis** se aposenta: Enterprise em 31 mar 2027; Basic, Standard e Premium em 30 set 2028. O sucessor é o **Azure Managed Redis** | 07 |
| AKS | **AKS Automatic** em GA desde set 2025; *node auto-provisioning* (baseado no Karpenter) em GA | 04 |
| Chaos Studio | ativo, com cenários de queda de zona; os *workspaces* estão em *preview* | 10 |
| Retail Prices API | `prices.azure.com`, sem autenticação, só a nuvem comercial | 11 |
| Spring Cloud Azure | linha 7.x para o Spring Boot 4; a 7.4.0 é compatível com o 4.0.0 a 4.1.0 | 04–08 |
| credencial em produção | credencial explícita (`ManagedIdentityCredential` ou federação), não o `DefaultAzureCredential` | 02, 04 |

## Versões

| Ferramenta | Versão conferida (nov 2026) | Licença |
| --- | --- | --- |
| Terraform | 1.17.1 (mínima 1.14, a mesma do `fin-iac`) | BUSL 1.1 |
| Provedor `hashicorp/azurerm` | 5.13.0 | MPL 2.0 |
| Azure SDK for Go | `azidentity` 1.15.0, `azservicebus` 1.11.0, `azeventhubs` 1.4.0, `azcosmos` 1.5.0, `azblob` 1.8.3, `azsecrets` 1.5.1 | MIT |
| Azure SDK for Java | `azure-sdk-bom` 1.3.9; Spring Cloud Azure 7.4.0 | MIT |
| Azurite | 3.37.0 | MIT |
| Lowkey Vault | 7.4.0 | MIT |
| Conftest (OPA) | 0.71.1 | Apache 2.0 |
| Docker, Go e JDK | os do catálogo | — |

**Não precisa:** assinatura Azure nem Azure CLI.

## Mapa para os exames

O **AZ-204** (Developing Solutions for Microsoft Azure) foi **aposentado em 31 jul 2026**. O caminho de
desenvolvedor passou a ser o **AI-200** (Developing AI Cloud Solutions on Azure), mais voltado a IA do que
o AZ-204 era. O **AZ-305** (Designing Microsoft Azure Infrastructure Solutions) continua ativo, com o guia
atualizado em 17 abr 2026. A trilha não substitui o material oficial.

| Domínio do AZ-305 | Peso | Marcos |
| --- | ---: | --- |
| Design identity, governance, and monitoring solutions | 25–30% | 01, 02, 09 |
| Design data storage solutions | 20–25% | 07, 08 |
| Design business continuity solutions | 15–20% | 10 |
| Design infrastructure solutions | 30–35% | 03, 04, 05, 06, 11 |

| Domínio do AI-200 | Peso | Marcos |
| --- | ---: | --- |
| Containerized solutions | 20–25% | 04 |
| AI solutions using Azure data management services | 25–30% | 07 (só a parte de dados) |
| Connecting to and consuming Azure services | 20–25% | 05, 06, 08 |
| Securing, monitoring, and troubleshooting | 20–25% | 02, 09 |

**O que a trilha não cobre dos exames:** os serviços de IA do AI-200, migração (Azure Migrate, Database
Migration Service), VMs e armazenamento de arquivos em profundidade, identidade corporativa (Entra ID para
o administrador de identidade) e analítica (Synapse, Fabric, Databricks).

## Regra das horas

A trilha soma 655 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 655 x 2 / 60 = 21,8, arredondado para **22 horas**.
