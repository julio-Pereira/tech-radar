# Auditoria — trilha `azure-para-backend`

Registro de cada fase da trilha (`PLANO-trilha-azure-para-backend.md`): o que foi conferido, contra que
fonte, o que foi medido no laboratório e o que mudou em relação ao plano.

## 1. Fase 0 — conferências, laboratório e esqueleto

### Mudanças em relação ao plano

Seis conferências mudaram o que o plano previa:

1. **A camada 1 não é "política sobre o JSON do plano".** O provedor `azurerm` não tem as opções de pular
   credencial que o `aws` tem. Sem assinatura, o `terraform plan` falha antes de produzir o plano (medido
   abaixo). A camada passa a ser `terraform test` com `mock_provider` e Conftest sobre o código HCL, com a
   convenção de atributo de segurança literal no módulo. A política sobre o plano fica como Complemento,
   com assinatura (ADR no `PROJETO.md`).
2. **O AZ-204 foi aposentado em 31 jul 2026.** O mapa de certificação usa o AZ-305 (ativo, guia de 17 abr
   2026) e o AI-200, que é o caminho de desenvolvedor atual. O texto registra que o AI-200 é mais voltado a
   IA e o que a trilha não cobre dele.
3. **O Go tem suporte nativo no Azure Functions**, só no Flex Consumption, e a documentação recomenda o
   nativo, e não o *custom handler*, para apps novos em Go. O marco 06 ensina o nativo, com o *custom
   handler* como alternativa. As páginas oficiais divergem entre GA e *preview*, e o marco confere de novo.
4. **O `DefaultAzureCredential` não é a recomendação para produção.** A orientação atual da Microsoft é
   uma credencial explícita (`ManagedIdentityCredential` ou federação), porque a cadeia pode cair num
   método inesperado sem aviso. O [D4] do plano passa a dizer isso.
5. **O Redis gerenciado mudou de nome e de produto.** O Azure Cache for Redis se aposenta (Enterprise em 31
   mar 2027; Basic, Standard e Premium em 30 set 2028), e o sucessor é o Azure Managed Redis.
6. **As *deny assignments* não são só da plataforma.** Existem *deny assignments* atribuídas pelo
   usuário, com limites: não cobrem leitura nem ações de dados, não aceitam grupo como principal e exigem
   ao menos um principal excluído.

### Conferências (Microsoft Learn e anúncios, 12 nov 2026)

A tabela completa, com o marco de cada item, está no `PROJETO.md` ("Limites e comportamentos
conferidos"). As fontes por tema:

| Tema | Fonte |
| --- | --- |
| par do Brazil South e Brazil Southeast | [Azure region pairs and nonpaired regions](https://learn.microsoft.com/azure/reliability/regions-paired) |
| saída padrão | [Default outbound access in Azure](https://learn.microsoft.com/azure/virtual-network/ip-services/default-outbound-access) |
| NSG × VNet flow logs | [Read flow logs](https://learn.microsoft.com/azure/network-watcher/flow-logs-read) |
| `NotActions` e *deny assignments* | [Understand Azure role definitions](https://learn.microsoft.com/azure/role-based-access-control/role-definitions); [`az role deny-assignment`](https://learn.microsoft.com/cli/azure/role/deny-assignment) |
| ABAC | [What is Azure ABAC?](https://learn.microsoft.com/azure/role-based-access-control/conditions-overview) |
| hospedagem do Functions | [Azure Functions scale and hosting](https://learn.microsoft.com/azure/azure-functions/functions-scale); [Flex Consumption plan](https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan) |
| Go no Functions | [Go developer reference](https://learn.microsoft.com/azure/azure-functions/functions-reference-go); [Supported languages](https://learn.microsoft.com/azure/azure-functions/supported-languages) |
| *retry* por *trigger* | [Error handling and retries](https://learn.microsoft.com/azure/azure-functions/functions-bindings-error-pages) |
| detecção de duplicidade e cotas do Service Bus | [Enable duplicate detection](https://learn.microsoft.com/azure/service-bus-messaging/enable-duplicate-detection); [Service Bus quotas](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-quotas) |
| *geo-DR* × *geo-replication* | [Service Bus Geo-Disaster Recovery](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-geo-dr) |
| Kafka no Event Hubs | [Apache Kafka protocol support](https://learn.microsoft.com/azure/event-hubs/azure-event-hubs-apache-kafka-overview); [Kafka client configurations](https://learn.microsoft.com/azure/event-hubs/apache-kafka-configurations) |
| chaves de partição hierárquicas | [Hierarchical partition keys](https://learn.microsoft.com/azure/cosmos-db/hierarchical-partition-keys-unlimited-scale) |
| Redis | [Azure Cache for Redis retirement FAQ](https://learn.microsoft.com/azure/azure-cache-for-redis/retirement-faq) |
| AKS Automatic e NAP | [AKS Automatic GA](https://azure.microsoft.com/blog/azure-kubernetes-service-automatic-fast-and-frictionless-kubernetes-for-all/); [Node auto-provisioning](https://learn.microsoft.com/azure/aks/node-auto-provisioning) |
| Chaos Studio | [Chaos Studio scenarios](https://learn.microsoft.com/azure/chaos-studio/chaos-studio-scenarios) |
| exames | [AZ-204 study guide (aposentado)](https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-204); [AZ-305 study guide](https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-305); [AI-200 study guide](https://learn.microsoft.com/credentials/certifications/resources/study-guides/ai-200) |
| Retail Prices API | [Azure Retail Prices REST API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices) |
| Spring Cloud Azure | [Spring Cloud Azure overview](https://learn.microsoft.com/azure/developer/java/spring-framework/spring-cloud-azure-overview); [Spring Versions Mapping](https://github.com/Azure/azure-sdk-for-java/wiki/Spring-Versions-Mapping) |
| credencial em produção | [Credential chains](https://learn.microsoft.com/dotnet/azure/sdk/authentication/credential-chains); [Authentication best practices](https://learn.microsoft.com/dotnet/azure/sdk/authentication/best-practices) |
| emuladores | [Service Bus emulator](https://learn.microsoft.com/azure/service-bus-messaging/overview-emulator); [Event Hubs emulator](https://learn.microsoft.com/azure/event-hubs/overview-emulator); [Cosmos DB Linux emulator vNext](https://learn.microsoft.com/azure/cosmos-db/emulator-linux) |
| serviços financeiros | [Cloud service enablement framework for regulated financial institutions](https://learn.microsoft.com/industry/financial-services/service-enablement-framework) |

Pontos em que as fontes divergem, e que os marcos conferem de novo: o status do Go no Functions (GA ou
*preview*), o status das transações Kafka no Event Hubs, a lista de compressões aceitas e o status de GA da
*geo-replication* do Service Bus.

### Laboratório: Terraform sem assinatura

Com Terraform 1.17.1 e `hashicorp/azurerm` 5.13.0, baixado do `releases.hashicorp.com` (o
`registry.terraform.io` dá 403 no *proxy* deste ambiente):

| Experimento | Resultado |
| --- | --- |
| `terraform plan` sem credencial | `unable to build authorizer for Resource Manager API: could not configure AzureCli Authorizer`, porque procura a Azure CLI |
| `terraform plan` com `ARM_CLIENT_ID`/`ARM_CLIENT_SECRET` falsos | o provedor chama o Entra ID e falha com `AADSTS700038` |
| `terraform test` com `mock_provider "azurerm"` | o caso bom passou; a mutação com `shared_access_key_enabled = true` foi reprovada |
| Conftest `--parser hcl2` sobre o código | a *fixture* sem os atributos de segurança foi reprovada nas duas regras; o código com valor literal passou; o código com o valor vindo de variável também foi reprovado, porque a regra não resolve `${var...}` |
| formato do HCL no Conftest | cada recurso vem como lista (`input.resource.<tipo>.<nome>[0]`); a primeira versão da regra não olhou a lista e deixou passar a *fixture* ruim |

### Laboratório: emuladores

Medido com Docker e os SDKs Python oficiais (`azure-servicebus` 7.15.0, `azure-eventhub` 5.15.1,
`azure-cosmos` 4.17.1, `azure-keyvault-secrets` 4.12.0, `azure-storage-blob` 12.31.1):

| Emulador | Experimento | Resultado |
| --- | --- | --- |
| Service Bus | janela de duplicidade de 10 min na configuração | o emulador não subiu: `Max Duplicate detection window supported 5m`. O fim do *log* dizia `Out of memory` |
| Service Bus | dois envios com `MessageId` `pix-1` e um com `pix-2` | duas mensagens recebidas |
| Service Bus | *lock* de 5 s, 8 s sem completar | a mensagem voltou com `delivery_count` 1; completar a primeira cópia deu `MessageLockLostError` |
| Service Bus | `MaxDeliveryCount` 3, abandonando sempre | na DLQ, com `MaxDeliveryCountExceeded` |
| Service Bus | sessão `contaA` com 3 mensagens | recebidas em ordem; um segundo receptor na mesma sessão recebeu `SessionCannotBeLockedError` |
| Event Hubs | 10 eventos, 2 partições | os 10 consumidos |
| Event Hubs + Azurite | consumo com *checkpoint*, reinício, 3 eventos novos | a segunda rodada leu só os 3 novos |
| Azurite | SDK de *blob* 12.31.1 | `The API version 2026-10-06 is not supported by Azurite`; resolvido com `--skipApiVersionCheck` |
| Azurite | chave padrão digitada de memória | `AuthorizationFailure` em toda chamada; a chave certa veio do próprio Azurite |
| Cosmos DB vNext | 50 `create_item` concorrentes da mesma chave | 1 sucesso, 49 com 409, 1 item |
| Cosmos DB vNext | `replace` com ETag velho | 412 |
| Cosmos DB vNext | *transactional batch*: `upsert` do saldo + `create` duplicado | falhou no índice 1, e o saldo continuou 70 |
| Lowkey Vault 7.4.0 | dois `set_secret` e um `get_secret` com o SDK oficial | valor atual `s3nha-v2`, duas versões |

Dois erros meus no caminho viraram conteúdo:

- A chave do Azurite digitada de memória custou meia hora de "problema de assinatura". É o argumento da
  convenção "nada de memória" aplicado a laboratório.
- O primeiro teste de *checkpoint* parecia culpa da porta com dois-pontos no nome do *namespace*. Não
  era: era a chave errada.

### Esqueleto

- `course.yaml` com 11 marcos (655 min, `estimatedHours: 22`), a categoria "Cloud" da `aws-para-backend` e
  11 fontes. O guia do AZ-204, aposentado, foi trocado pelo do AZ-305, e entrou o *framework* da Microsoft
  para instituições financeiras reguladas.
- 11 *stubs* válidos, o 11 com `## Capstone` mínimo.
- `PROJETO.md` com:
  - o catálogo de invariantes compartilhado com o `fin-aws` (os sete nomes do [D5]);
  - os dois ADRs (camada de infraestrutura e emuladores);
  - a tabela de limites, as versões e o mapa do AZ-305 e do AI-200.
- `GLOSSARIO.md` mínimo, com quatro verbetes: management group, managed identity, `NotActions` e Private
  DNS zone.
- `fin-azure` em `capstones.yaml`, dependendo do `fin-iac`, dos serviços do catálogo e do `fin-aws` (por
  causa do catálogo de invariantes). O `fin-devplatform` passa a depender também do `fin-azure`.
- Testes: os 11 *stubs* em `wantNoSection`, o *golden* do glossário com a trilha nova (4/4) e o
  `capstone.spec` com 26 componentes.

### Para as próximas fases

- **Fase 5 (pontes com a AWS).** As tabelas "No Azure → na AWS" da `aws-para-backend` ganham a ponte para o
  marco gêmeo daqui.
- **Índice de nuvem.** A coluna Azure da tabela de `arquitetura-de-solucoes/05`, feita no Bloco 2 do
  adendo de sinais, passa a apontar para os marcos desta trilha.
- **Jornada `entrevista-senior`.** Ganha os marcos 02, 03, 05 e 10 como opção "nuvem Azure".
