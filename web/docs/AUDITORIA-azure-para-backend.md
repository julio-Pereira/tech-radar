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

## 2. Fase 1 — Bloco A (marcos 01 a 03)

Os três marcos têm:

- os cinco blocos de `## Hands-on`;
- a tabela "Na AWS → no Azure", com ponte para o marco gêmeo da `aws-para-backend`;
- a caixa "armadilha";
- a caixa "o que o laboratório não reproduz" nos marcos com avaliador ou resolvedor didático (02 e 03);
- `reviewEvery: 6m`;
- 16 questões (4 + 6 + 6). A resposta certa está distribuída e nunca é a opção estritamente mais longa:
  conferido por *script*, depois de rebalancear 7 das 16.

Os *goldens* de seções sobem para 260/307/299/290/305, e os três marcos saem de `wantNoSection`.

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 01 | Conftest `--parser hcl2` sobre a árvore de governança: assinatura sob *guardrails*, localizações e *tags* | a primeira versão da regra **reprovou o código bom**: a função do pai devolvia o endereço completo (`azurerm_management_group.fin`), e não o nome. Corrigida, o código bom passou nas 3 regras, e a *fixture* ruim foi reprovada em **4 achados** (assinatura num *management group* solto, *resource group* em `eastus`, `data-classification` faltando no `local.tags`, *resource group* sem *tag*) |
| 02 | avaliador didático de RBAC em Go (`go test`) | os **10 casos da documentação** e a matriz do `pix-gateway` (1 permitido, 3 negados) passaram. Na **mutação** que trata `NotActions` como negação global, o caso "outro papel concede de volta" falhou |
| 02 | Conftest sobre as atribuições e as identidades | o código bom passou nas 3 regras; a *fixture* ruim, em **4 achados** (escopo de assinatura, `Contributor`, `Data Owner` no *namespace*, `azuread_application_password`) |
| 03 | resolvedor didático de DNS em Go | zona vinculada ao *hub* e ao AKS: IP privado. Zona só no *hub*, AKS com *peering*: **IP público**. A matriz de VNets consumidoras pegou exatamente a VNet de funções sem vínculo |
| 03 | Conftest sobre a rede: PaaS público, Private Endpoint, zona e vínculo, NSG, saída única, sobreposição com as bordas, *flow logs* | o código bom passou nas 8 regras; a *fixture* ruim foi reprovada em **8 achados** |

### Números conferidos (12 nov 2026)

- **Governança:**
  - até seis níveis de *management group* abaixo da raiz e 10.000 por tenant; a orientação do CAF é de três a
    quatro níveis;
  - os 11 efeitos do Azure Policy (`addToNetworkGroup`, `append`, `audit`, `auditIfNotExists`, `deny`,
    `denyAction`, `deployIfNotExists`, `disabled`, `manual`, `modify`, `mutate`), com `modify` e
    `deployIfNotExists` exigindo *managed identity* na atribuição;
  - o *framework* da Microsoft para instituições financeiras recomenda *sandboxes* como tenants isolados.
- **RBAC:**
  - **5.000** atribuições por assinatura, um limite fixo, e 500 por *management group* (páginas antigas ainda
    dizem 4.000 ou 2.000);
  - a ordem de avaliação: *deny assignments*, atribuições somadas, condições;
  - as *deny assignments* vencem o `Owner`;
  - os papéis de controle não dão dados pelo Entra ID, mas o `listkeys` dá a chave da conta, e o portal usa
    esse caminho.
- **Rede:**
  - as regras padrão do NSG (65000, 65001, 65500) e as próprias de 100 a 4096;
  - com NSG na sub-rede e na interface, os dois precisam permitir;
  - as zonas `privatelink` dos cinco serviços do marco;
  - o DNS Private Resolver, com *inbound endpoint*, *outbound endpoint* e *forwarding rulesets*.

### Pontes

- `arquitetura-de-solucoes/05`;
- `system-design/13`;
- `seguranca-aplicacao/08`, `/10` e `/11`;
- `kubernetes/10` e `/11`;
- `entrega-continua-e-devops/02`;
- `conectividade-multicloud/02`, `/04` e `/08`;
- `aws-para-backend/01`, `/02` e `/03`, os marcos gêmeos.

## 3. Fase 2 — Bloco B (marcos 04 a 06)

Os três marcos têm:

- os cinco blocos de `## Hands-on`;
- a tabela "Na AWS → no Azure", com ponte para o marco gêmeo;
- a caixa "armadilha";
- a caixa "o que o emulador/laboratório não reproduz" nos marcos com emulador ou *harness* (05 e 06);
- `reviewEvery: 6m`;
- 16 questões (4 + 6 + 6). A resposta certa está distribuída e nunca é a opção estritamente mais longa:
  conferido por *script*, depois de rebalancear 11 das 16.

Os *goldens* de seções sobem para 263/310/302/293/308.

Os nomes dos atributos usados pelas regras (`termination_grace_period_seconds`, `registry.identity`,
`internal_load_balancer_enabled`, `admin_enabled`, `maximum_instance_count`, `storage_authentication_type`) foram
conferidos no *schema* do `azurerm` 5.13.0 (`terraform providers schema -json`), e não de memória.

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 04 | Conftest sobre o Container Apps e o ACR | o código bom passou nas 6 regras. A *fixture* ruim foi reprovada nas **6**: ambiente público, identidade compartilhada, encerramento de 30 s igual ao *drain*, imagem puxada com usuário e senha, imagem `:latest`, ACR com administrador |
| 05 | emulador do Service Bus, *lock* de 5 s, 20 mensagens com 30% processadas em 8 s, 3 consumidores | **sem *inbox*: 26 lançamentos para 20 mensagens; com *inbox*: 20** |
| 05 | 3 mensagens até a DLQ, uma já aplicada antes da falha; reprocessamento com *inbox* | 3 na DLQ; **3 lançamentos** depois do reprocessamento |
| 05 | sessões: 10 contas × 5 lançamentos, 4 receptores (`NEXT_AVAILABLE_SESSION`) | 50 mensagens, **nenhuma conta fora de ordem**. A primeira versão do teste passou `session_id=None` e não recebeu nada; a segunda leu 100 mensagens porque as da primeira tinham ficado na fila |
| 05 | 400 KB direto na fila do emulador; depois por referência no Azurite | `MessageSizeExceededError`; pela referência, o conteúdo conferiu |
| 06 | *harness* em Go: 100 eventos entregues 1 a 4 vezes, embaralhados e em paralelo, com *inbox* | 204 entregas, **100 efeitos** |
| 06 | *replay* do orquestrador com o mesmo histórico, 20 vezes | com o relógio do contexto, a mesma sequência; com `time.Now()` e aleatório direto, **0 de 20** repetiram |
| 06 | 200 "instâncias" contra um limite de conexões | pico de 200 sem limite e de 20 com o limite (simulação; a medição contra um Postgres real é a de `aws-para-backend/06`) |
| 06 | Conftest sobre a Function App no Flex Consumption | o código bom passou nas 3 regras; a *fixture* ruim foi reprovada nas **3** (400 conexões contra 40, *connection string* com `SharedAccessKey`, storage por *connection string*) |

### Números conferidos (12 nov 2026)

- **Container Apps:**
  - revisões em modo *single*, o padrão, e *multiple*, com pesos que somam 100% e *labels*;
  - o ambiente com *workload profiles* pede sub-rede /27 e aceita UDR e NAT; o legado, só Consumption, pede /23
    e não aceita.
- **ACR:** o administrador vem desligado, tem permissão total e há uma política interna que nega ligá-lo.
- **AKS:**
  - AKS Automatic em GA desde set 2025;
  - *node auto-provisioning* em GA;
  - o Application Gateway for Containers exige Azure CNI ou Overlay e a *workload identity*.
- **Service Bus:**
  - *lock* padrão de 1 min e máximo de 5 min;
  - `MaxDeliveryCount` padrão de 10;
  - duplicidade de 10 min por padrão e 7 dias no máximo;
  - 256 KB no Standard e 100 MB no Premium, por AMQP;
  - 100 mensagens por transação.
- **Event Grid:**
  - *retry* até 24 h ou 30 tentativas, com calendário fixo;
  - *dead-letter* desligado por padrão;
  - 400 e 413 vão direto para o *dead-letter*.
- **Event Hubs:** Kafka no Standard em diante; compressão só gzip, no Premium e no Dedicated; transações em
  *preview*.
- **Functions:**
  - Flex Consumption com até 1.000 instâncias, de 512 a 4.096 MB (2.048 MB por padrão);
  - *timeout* padrão de 30 min, sem máximo;
  - 0 instâncias *always ready* por padrão;
  - o Consumption em Linux se aposenta em 30 set 2028;
  - *retry* do *runtime* para Event Hubs, Kafka, Cosmos DB e Timer.
- **Durable:**
  - sem relógio, aleatório, GUID nem I/O direto no orquestrador;
  - `ctx.getCurrentInstant()` em Java;
  - a página de *preview* do Go lista a falta de Durable para Go.

### Pontes

- `kubernetes/06`, `/07` e `/14`;
- `spring-boot/12`;
- `entrega-continua-e-devops/05`;
- `kafka/10`;
- `arquitetura-eventos/08` e `/09`;
- `concorrencia-e-recursos/07`;
- `aws-para-backend/04`, `/05` e `/06`.

## 4. Fase 3 — Bloco C (marcos 07 e 08)

Os dois marcos têm:

- os cinco blocos de `## Hands-on`;
- a tabela "Na AWS → no Azure", com ponte para o marco gêmeo;
- a caixa "armadilha" e a caixa do emulador;
- `reviewEvery: 6m`;
- 10 questões (4 + 6). A resposta certa nunca é a opção estritamente mais longa: conferido por *script*, depois de
  rebalancear 8 das 10.

Os *goldens* de seções sobem para 265/312/304/295/310. Os atributos das regras foram conferidos no *schema* do
`azurerm` 5.13.0.

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 07 | *script* sobre um dia sintético de 500 mil escritas (30% em 200 contas PJ) | **data:** 1 valor, **100%** numa partição; **conta:** a mais quente com **0,165%**; **identificador fim a ponta:** nenhuma acima de 0,001%. A primeira versão do *script*, com `random.choices` sobre 2 milhões de pesos a cada sorteio, passou de 5 minutos e foi interrompida |
| 07 | escrita condicional, ETag e *batch* no emulador do Cosmos | os resultados da Fase 0 (§1), citados no texto |
| 07 | Conftest sobre o Postgres Flexible Server e o Cosmos | o código bom passou nas 7 regras; a *fixture* ruim foi reprovada em **6 achados** (sem HA, com senha e com *backup* geográfico no Postgres; chave de conta, *backup* periódico e sem *lock* no Cosmos) |
| 08 | envelope: chave de dados AES-GCM com AAD, embrulhada com uma chave RSA do Lowkey Vault 7.4.0, objeto no Azurite | o objeto gravado **não contém o CPF**; o AAD certo abriu; o AAD de outro arquivo, o de outro serviço e a falta de AAD deram **`InvalidTag`** |
| 08 | operações da chave no Lowkey Vault | criada sem operações, a chave recusou o *wrap* (`does not have ENCRYPT operation`); com `wrapKey` e `unwrapKey`, o *unwrap* pediu `decrypt`, uma particularidade do Lowkey registrada na caixa do emulador |
| 08 | Conftest sobre o storage, a imutabilidade, o Key Vault e as atribuições no vault | o código bom passou nas 6 regras; a *fixture* ruim foi reprovada em **7 achados** |

### Números conferidos (12 nov 2026)

- **Postgres Flexible Server:**
  - HA *zone-redundant* com *failover* de 60 a 120 s e SLA de 99,99%; *same-zone* com SLA de 99,95%;
  - PgBouncer embutido na porta 6432, fora do tier Burstable, e reiniciado no *failover*;
  - PITR de 7 a 35 dias;
  - o *backup* geográfico vai para o par, só se liga na criação e tem RPO de geo-restore de até cerca de uma hora.
- **Cosmos DB:**
  - 20 GB por partição lógica e 10.000 RU/s por partição;
  - *transactional batch* de 100 operações e 2 MB, na mesma chave;
  - *backup* contínuo de 7, 30 ou 35 dias;
  - última escrita que vence como padrão do *multi-region writes*;
  - chaves hierárquicas com até três níveis.
- **Storage:**
  - *shared key* com padrão nulo, que equivale a ligada;
  - SAS de delegação de usuário de no máximo 7 dias;
  - TLS 1.2 obrigatório desde 3 fev 2026 (corrigido na Fase 6; o texto da Fase 3 dizia "recomendado");
  - só a imutabilidade travada atende a SEC 17a-4(f), estendida até cinco vezes no contêiner.
- **Key Vault:**
  - *soft delete* de 7 a 90 dias (90 por padrão), sem mudar depois;
  - *purge protection* opcional, desligada e irreversível;
  - Standard FIPS 140-2 nível 1; Premium e Managed HSM FIPS 140-3 nível 3.
- **CMK revogada:** Storage responde 403; Cosmos entra em revogação e leva até uma hora para sair; Postgres fica
  inacessível em até 60 minutos, e leva até 60 para voltar.
- **Redis:** o Azure Cache for Redis se aposenta (Enterprise em mar 2027; Basic, Standard e Premium em set 2028),
  e o sucessor é o Azure Managed Redis.

### Pontes

- `dados-distribuidos/07`, `/09`, `/13`, `/16` e `/18`;
- `seguranca-aplicacao/09` e `/10`;
- `aws-para-backend/07` e `/08`.

## 5. Fase 4 — Bloco D (marcos 09 a 11, capstone, glossário e conceitos)

Os três marcos saíram dos *stubs*, cada um com os cinco blocos de Hands-on e 4 perguntas de quiz. O marco 11
traz o `## Capstone` do `fin-azure`, com a entrega por marco, os critérios de pronto e a pergunta final.

O `GLOSSARIO.md` passou de 4 para **55 verbetes**, todos com "Onde na prática" resolvendo para um marco.
O `conceitos.yaml` ganhou 5 conceitos com dono nesta trilha e citados fora dela: *managed identity* (02),
Private Endpoint (03), Service Bus (05), Key Vault (08) e Application Insights (09). O `Cosmos DB` continua com
dono em `dados-distribuidos/16`.

O teste de seções voltou a `var wantNoSection []string`: todo marco tem Hands-on. Os *goldens* de blocos foram
para 268, 315, 307, 298 e 313.

### Mudanças em relação ao plano

- **Preços.** O laboratório não alcançou a Azure Retail Prices API (`prices.azure.com`): o *proxy* recusou a
  conexão (403, `connect_rejected`). As páginas de preço do Azure, consultadas pela busca, vieram com os
  valores em branco. Nenhum preço foi citado de memória. O modelo de custo do marco 11 **separa a quantidade
  cobrável do preço**: as invariantes estão em quantidades (horas de *endpoint*, zonas, GB ingeridos, GB-mês
  retidos), e o custo em reais sai quando o leitor roda o modelo com um arquivo de preços tirado da API. O
  marco diz isso no texto.
- ***Tag* de custo.** O marco 01 fixou a *tag* `cost-center`; o primeiro rascunho do modelo de custo usou
  `centro-de-custo`, herdado do `fin-aws`. Ficou `cost-center` no texto e no laboratório.
- ***Game day*.** O marco 10 cita a medição do *harness* de `aws-para-backend/10` (200 de 200, nenhum em dobro),
  que prova o serviço e não a nuvem, em vez de repeti-la.
- **Norma de nuvem.** O marco 10 aponta a Resolução CMN nº 4.893/2021 para `conectividade-multicloud/09`, que
  já a trata com a ressalva de conferir a versão vigente; não há trilha própria de regulação.

### Medições

| Marco | O que foi medido | Resultado |
| --- | --- | --- |
| 09 | Conftest (`--parser hcl2`) sobre o módulo de observabilidade, com os SLOs do `fin-watch` como dados | o código bom passou nas 9 regras; a *fixture* ruim foi reprovada em **7 achados**: o SLO `ledger-lancamento-disponibilidade` sem alerta, o Key Vault sem *diagnostic setting*, a fila `liquidacao` sem alerta de DLQ, o Cosmos sem alerta de 429, a tabela `AZKVAuditLogs` com 365 dias, o Activity Log sem exportação e o Application Insights com ingestão por chave |
| 09 | mutações isoladas | o alerta de DLQ com o `EntityName` da fila errada reprovou a fila descoberta; o Postgres mandando *log* para um *workspace* do time reprovou, junto com o *workspace* sem retenção explícita |
| 10 | tabela de regras de DR (`regras_dr.py`) | a ADR boa passou; a ruim foi reprovada em **6 achados**: o Brazil Southeast sem pedido de acesso, *pilot light* com RTO de 5 min, cópia para o South Central US sem ADR de residência, RPO 0 em replicação assíncrona, tempo para escalar maior que o RTO e componente sem custo |
| 10 | Conftest sobre o caminho de pagamento | o código bom passou nas 7 regras; a *fixture* ruim foi reprovada em **6 achados**: ambiente do Container Apps sem zona, 1 réplica, Postgres *same-zone*, Cosmos sem `zone_redundant`, *storage* LRS e uma conta GZRS de dado classificado sem ADR |
| 11 | modelo de custo sobre o código (`python-hcl2`), 5 *endpoints*, 5 zonas, 75 GB de *log* por dia | **3.650** horas de *endpoint*, 1.000 GB processados, 5 zonas-mês, **2.250 GB** ingeridos (`pix` 1.200, `ledger` 750, `plataforma` 300), nenhum GB-mês retido cobrado |
| 11 | mutação: zonas `privatelink` em cada *spoke* | de **5 para 15** zonas, cada nome 3 vezes; reprovou |
| 11 | mutação: *workspace* do `pix` com 365 dias, sem ADR | de 0 para **13.360 GB-mês** retidos cobrados (40 GB/dia × 334 dias além dos 31 incluídos); reprovou |
| 11 | mutação: *endpoint* sem `cost-center` e *budget* só com alerta real | reprovou nas duas |

Um detalhe de ferramenta virou conteúdo implícito: o `python-hcl2` devolve cada atributo dentro de uma lista
(`"name": ["privatelink..."]`), e o modelo precisou de um acessor que desembrulha o valor.

### Números conferidos (12 nov 2026)

- **Azure Monitor:**
  - métricas de plataforma automáticas, guardadas por 93 dias; um gráfico mostra até 30 dias;
  - *resource logs* não coletados por padrão, só com *diagnostic setting* e só dali em diante;
  - Log Analytics: Analytics com 30 dias interativos por padrão e até 2 anos; Basic e Auxiliary com 30 dias
    fixos e consulta cobrada; total de até 12 anos (4.383 dias) em qualquer plano; a ingestão em Analytics
    inclui 31 dias; `AzureActivity` e `Usage` com 90 dias sem custo;
  - Application Insights clássico: ingestão encerrada em 15 jun 2025; todo recurso é baseado em *workspace*;
  - a Distro do OpenTelemetry é o caminho recomendado; o agente Java não exporta OTLP; a ingestão OTLP pelo
    agente do Azure Monitor e no AKS está em *preview*, e pela Distro e pelo Collector, GA;
  - Activity Log guardado por 90 dias;
  - `DeadletteredMessages` e `ActiveMessages` com a dimensão `EntityName`, valores pontuais;
  - `TotalRequests` com `StatusCode`; de 1% a 5% de 429 com latência aceitável é saudável.
- **Resiliência:**
  - par do Brazil South: South Central US, assimétrico; Brazil Southeast pareado com o Brazil South, de acesso
    restrito;
  - o par traz atualização sequencial e prioridade de recuperação, não *failover* automático;
  - Container Apps: redundância de zona só na criação, com VNet (/23 no Consumption, /27 com *workload
    profiles*), pelo menos duas réplicas, sem custo extra;
  - Service Bus: zona automática em todos os *tiers*, sem custo, com a propriedade `zoneRedundant` podendo
    aparecer como `false`;
  - Front Door tira a origem sem esperar DNS; Traffic Manager depende do TTL; um ou outro, com o Traffic Manager
    na frente como exceção;
  - Chaos Studio no modelo de *workspaces*, com o *Compute Zone Down*, que não cobre o AKS inteiro.
- **Custo:**
  - Private Endpoint cobrado por hora e por GB processado, nos dois sentidos (os valores não foram obtidos);
  - *tag inheritance* nos registros de uso, de 8 a 24 horas para valer;
  - *budget* com até 5 alertas reais e 5 previstos;
  - reserva aplicada antes do *savings plan*; o *savings plan* não cobre *software*, rede nem armazenamento;
  - reservas de VM de várias séries antigas sem venda nem renovação desde 1 jul 2026;
  - *spot* com até 30 segundos de aviso pelos *Scheduled Events*;
  - Hybrid Benefit desconta só a licença.

### Pontes

- `observabilidade/05`, `/12` e `/16`;
- `system-design/13` e `/14`;
- `dados-distribuidos/02` e `/12`;
- `ledger-e-contabilidade/08`;
- `engenharia-de-plataforma/08`;
- `conectividade-multicloud/09`;
- `aws-para-backend/09`, `/10` e `/11`.

## 6. Fase 5 — pontes

- **AWS → Azure.** Cada um dos 11 marcos da `aws-para-backend` ganhou, logo abaixo da tabela "No Azure → na
  AWS", a ponte para o marco gêmeo (`azure-para-backend/NN`). A volta já existia desde as Fases 1 a 4.
- **`arquitetura-de-solucoes/05`.** A coluna Azure da tabela de serviços por provedor aponta para o marco da
  `azure-para-backend` que ensina cada serviço (15 linhas; o API Management fica sem marco, como o API
  Gateway na coluna AWS). O parágrafo seguinte cita também as tabelas "Na AWS → no Azure".
- **`conectividade-multicloud/04` ↔ `azure-para-backend/03`.** O marco de ExpressRoute ganhou a frase do lado
  Azure do `fin-platform`, ao lado da do lado AWS; o marco 03 já apontava para ele.
- **Jornada `entrevista-senior`.** Não havia grupo de nuvem: o grupo novo **"Nuvem (escolha a da vaga)"**, no
  mesmo formato do de linguagem (opcional), traz os marcos 02, 03, 05 e 10 das duas trilhas, antes do domínio
  fintech. A jornada passou de 39 para 47 passos, e o `jornada.spec.js` acompanha os dois números (grupos e etapas).

## 7. Fase 6 — auditoria final e revisão independente

### Checagens mecânicas (13 nov 2026)

| Checagem | Resultado |
| --- | --- |
| Σ `estimatedMinutes` dos 11 marcos | **655**, igual ao plano |
| `estimatedHours` do `course.yaml` | **22** |
| perguntas de quiz | **54** (4 ou 6 por marco); respostas por posição 22% / 30% / 24% / 24% |
| resposta certa como a única opção mais longa | **0** |
| verbetes do glossário | **55** (mínimo 30), 55/55 com marco resolvido |
| marcos com os cinco blocos de Hands-on | **11 de 11**, nenhum *stub* |
| pontes | todas resolvem (`TestBridgesResolve`), nenhuma entrada nova em `bridges-planned.yaml` |
| credenciais no CI | nenhuma variável `ARM_*` ou `AZURE_*` em `.github/` |

### Revisão independente (marcos 02, 03, 05, 06 e 08)

Um revisor separado conferiu as afirmações factuais dos cinco marcos e dos quizzes contra o Microsoft Learn, só
pela busca: o WebFetch de `learn.microsoft.com` não estava liberado na rede. Resultado: **88 afirmações conferem**
(18 no 02, 15 no 03, 20 no 05, 17 no 06, 18 no 08), os quizzes estão coerentes com o texto, e **2 erros
factuais**, ambos no marco 08:

| Marco | O texto dizia | A documentação diz | Correção |
| --- | --- | --- | --- |
| 08 | "o TLS mínimo recomendado é o 1.2" | desde **3 fev 2026**, o Storage recusa TLS 1.0 e 1.1 em todas as contas (conferido de novo nesta fase) | o 1.2 é o mínimo obrigatório; a regra sobre o código (`min_tls_version`) continua, e o achado "TLS 1.0" da *fixture* virou "declarado no código" |
| 08 | "LRS (três cópias numa zona)" | o LRS replica três vezes **num único *datacenter*** | corrigido no 08 e na tabela de zonas do 10 |

Imprecisões corrigidas:

- **03:** "sub-redes privadas por padrão desde mar 2026" passou a dizer "nas versões de API posteriores a 31 mar
  2026" no resumo e nos aprendizados, como o corpo já dizia;
- **05:** a janela de duplicidade de no máximo 5 minutos do emulador não está na documentação; virou observação
  do laboratório. O emulador do Event Hubs aceita também o SDK por AMQP; a restrição de produtor e consumidor é
  do lado Kafka;
- **06:** "Durable não suporta Go" vem da documentação do Durable, não de uma página de *preview* do Go;
- **08:** o FIPS 140-3 nível 3 do Key Vault Premium vale para as chaves da plataforma de HSM mais nova; as
  antigas são FIPS 140-2 nível 2;
- **02:** o ABAC vale para Blob, inclusive o Data Lake Gen2, e Queue.

Não aplicadas, com o motivo:

- **02, *deny assignment* e grupo:** as referências do CLI e do PowerShell divergem sobre grupo como principal
  excluído; a frase do marco fala do principal da negação, que as duas recusam;
- **05, códigos sem *retry* do Event Grid:** o marco cita 400 e 413, que conferem; a lista por tipo de destino
  (403, 401) é detalhe de referência, não de desenho;
- **06, "centenas de conectores" do Logic Apps:** o número exato (mais de 1.400) não foi conferido nesta sessão,
  e "centenas" não está errado.
