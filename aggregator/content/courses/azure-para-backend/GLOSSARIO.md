Um verbete por termo: definição em uma frase, o exemplo no `fin-azure`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos neutros (*envelope encryption*, identidade de *workload* como
conceito, DLQ, idempotência) são verbetes das trilhas donas e não se repetem aqui.

## Governança

### Tenant
**Em uma frase:** a instância do Microsoft Entra ID de uma organização; a raiz de identidade, à qual se ligam todas as assinaturas e todos os *management groups*.
**No fin-azure:** um *tenant* só, compartilhado por produção e homologação, com a separação feita pela árvore de *management groups*.
**Erro comum:** tratar o *tenant* como fronteira de ambiente; ele é compartilhado, e um papel do Entra amplo demais alcança tudo.
**Onde na prática:** marco 01.

### Management group
**Em uma frase:** o nível da hierarquia do Azure acima das assinaturas; política e permissão atribuídas nele herdam para todas as assinaturas e recursos abaixo.
**No fin-azure:** o management group `producao` recebe a iniciativa de guardrails, com localizações permitidas e *tags* obrigatórias.
**Erro comum:** atribuir a política assinatura por assinatura e esquecer a assinatura nova, que nasceu fora da árvore.
**Onde na prática:** marco 01.

### Assinatura
**Em uma frase:** a unidade de cobrança, de cotas e de isolamento de recursos no Azure, pendurada num *management group*.
**No fin-azure:** produção, homologação e a plataforma compartilhada (*hub*, *log*) são assinaturas separadas.
**Erro comum:** colocar produção e teste na mesma assinatura e separar só por *resource group*, onde uma atribuição na assinatura alcança os dois.
**Onde na prática:** marco 01.

### Resource group
**Em uma frase:** o contêiner lógico de recursos dentro de uma assinatura, com ciclo de vida, permissão e *tags* próprios.
**No fin-azure:** um *resource group* por componente e ambiente, como `rg-dados` e `rg-mensageria`.
**Erro comum:** achar que o recurso herda a *tag* do *resource group*; ele não herda sem uma política `modify`.
**Onde na prática:** marco 01, e também no marco 11.

### Azure Policy
**Em uma frase:** o serviço que avalia as propriedades dos recursos contra regras e aplica um efeito: negar, auditar, corrigir (`modify`) ou criar o que falta (`deployIfNotExists`).
**No fin-azure:** a iniciativa de guardrails nega região fora do Brasil e corrige a *tag* `cost-center` a partir do *resource group*.
**Erro comum:** esperar que a política barre uma ação da API, como a SCP da AWS; ela avalia o recurso, não a chamada.
**Onde na prática:** marco 01.

### deployIfNotExists
**Em uma frase:** o efeito do Azure Policy que cria um recurso relacionado quando ele falta, com uma *managed identity* na atribuição.
**No fin-azure:** a política cria o *diagnostic setting* de todo Key Vault novo que nasce sem ele.
**Erro comum:** atribuir a política sem a identidade ou sem o papel dela; a avaliação marca o recurso como não conforme e nada é criado.
**Onde na prática:** marco 01, e também no marco 09.

### Resource lock
**Em uma frase:** a trava `CanNotDelete` ou `ReadOnly` num recurso, *resource group* ou assinatura, que vale até para quem é Owner.
**No fin-azure:** o Postgres e o Cosmos de produção têm `CanNotDelete`, cobrado por regra sobre o código.
**Erro comum:** usar `ReadOnly` num banco e descobrir que operações de gerenciamento comuns, como listar chaves, passam a falhar.
**Onde na prática:** marco 07.

### Região pareada
**Em uma frase:** a região para onde o Azure replica a cópia geográfica de alguns serviços e para onde ele leva uma atualização de cada vez; o par não traz *failover* automático.
**No fin-azure:** o par do Brazil South é o South Central US, nos Estados Unidos, e o par não é recíproco.
**Erro comum:** ligar GRS ou o *backup* geográfico sem perceber que o dado classificado vai para fora do país.
**Onde na prática:** marco 01, e também no marco 10.

## Identidade

### Microsoft Entra ID
**Em uma frase:** o serviço de identidade da Microsoft (antigo Azure AD) que autentica pessoas, aplicações e *workloads* para o Azure e para os serviços.
**No fin-azure:** todos os serviços autenticam no Postgres, no Service Bus e no Storage pelo Entra ID, sem senha nem chave.
**Erro comum:** confundir os papéis do Entra (administrar o diretório) com os papéis do Azure (administrar recursos).
**Onde na prática:** marco 02.

### Managed identity
**Em uma frase:** uma identidade do Entra ID (antigo Azure AD) que o próprio Azure gerencia para um recurso, sem segredo para guardar nem rotacionar; existe na forma *system-assigned*, presa ao recurso, e *user-assigned*, independente dele.
**No fin-azure:** o `pix-gateway` no Container Apps usa uma *user-assigned* própria para enviar à fila e ler os seus segredos.
**Erro comum:** compartilhar a mesma identidade entre vários serviços, e com isso somar as permissões de todos em cada um.
**Onde na prática:** marco 02.

### Credencial federada
**Em uma frase:** a confiança configurada numa identidade do Entra ID para aceitar um *token* OIDC de um emissor externo (um *cluster*, uma esteira de CI) no lugar de um segredo.
**No fin-azure:** a esteira de CI e o *service account* do AKS trocam o próprio *token* por um do Entra, sem segredo guardado.
**Erro comum:** federar o *subject* de *pull request* na identidade de produção, e qualquer PR passa a se autenticar como ela.
**Onde na prática:** marco 02.

### Role assignment
**Em uma frase:** a atribuição que liga um principal a uma *role definition* num escopo; é a unidade do RBAC do Azure.
**No fin-azure:** o `pix-gateway` tem "Azure Service Bus Data Sender" só na fila de liquidação, não no *namespace*.
**Erro comum:** atribuir na assinatura "porque é mais simples", com o limite de 5.000 atribuições por assinatura e o escopo largo como preço.
**Onde na prática:** marco 02.

### `NotActions`
**Em uma frase:** a lista de ações que uma *role definition* exclui do que ela mesma concede; não é uma negação, e outro papel atribuído ao mesmo principal pode conceder a ação de volta.
**No fin-azure:** o avaliador didático prova o caso "papel A com `NotActions` + papel B que concede = permitido".
**Erro comum:** usar `NotActions` como se fosse um `Deny`; a negação explícita no Azure é a *deny assignment*.
**Onde na prática:** marco 02.

### DataActions
**Em uma frase:** as ações do **plano de dados** numa *role definition* (ler um *blob*, enviar uma mensagem), separadas das `Actions` do plano de controle.
**No fin-azure:** o papel de leitura de comprovantes tem `DataActions` de leitura de *blob* e nenhuma `Action` de gerenciamento.
**Erro comum:** dar Owner esperando acesso aos dados; o Owner não tem `DataActions`, mas lista as chaves da conta e lê pela *shared key*.
**Onde na prática:** marco 02, e também no marco 08.

### PIM (Privileged Identity Management)
**Em uma frase:** o serviço do Entra ID que torna um papel privilegiado elegível, ativado por tempo limitado, com aprovação e justificativa.
**No fin-azure:** o acesso de escrita das pessoas em produção é elegível pelo PIM, por uma hora, com aprovação.
**Erro comum:** deixar papéis privilegiados permanentes para pessoas "por praticidade", sem trilha de quando foram usados.
**Onde na prática:** marco 02.

## Rede

### Hub-spoke
**Em uma frase:** a topologia em que uma VNet central (*hub*) concentra o Firewall, o DNS e a conectividade, e as VNets das cargas (*spokes*) se ligam a ela por *peering*.
**No fin-azure:** o *hub* tem o Firewall, o DNS Private Resolver e as zonas `privatelink`; cada componente tem o seu *spoke*.
**Erro comum:** criar recursos compartilhados em cada *spoke*, como as zonas DNS, e multiplicar o custo e os pontos de falha.
**Onde na prática:** marco 03, e também no marco 11.

### Private Endpoint
**Em uma frase:** uma interface de rede com IP privado numa sub-rede sua, que liga a VNet a um serviço PaaS específico pela rede da Microsoft.
**No fin-azure:** Blob, Service Bus, Postgres, Cosmos e Key Vault têm Private Endpoint, com o acesso público desligado.
**Erro comum:** criar o Private Endpoint e deixar o acesso público ligado, ou esquecer a zona DNS; o tráfego continua pela internet, sem erro.
**Onde na prática:** marco 03, e também no marco 11.

### Private DNS zone
**Em uma frase:** a zona de DNS privada do Azure (como `privatelink.blob.core.windows.net`) que faz o nome público de um serviço resolver para o IP do Private Endpoint, nas VNets vinculadas a ela.
**No fin-azure:** a zona `privatelink` de cada serviço fica no *hub* e é vinculada a toda VNet que consome o serviço.
**Erro comum:** criar o Private Endpoint e esquecer a zona ou o vínculo; o nome continua resolvendo para o IP público, e o tráfego sai pela internet, sem erro.
**Onde na prática:** marco 03.

### Azure DNS Private Resolver
**Em uma frase:** o serviço gerenciado com *inbound endpoint* e *outbound endpoint* que deixa redes fora do Azure resolverem as zonas privadas, e o Azure resolver nomes dessas redes.
**No fin-azure:** o *inbound endpoint* no *hub* recebe as consultas que vêm do *data center* e da outra nuvem pela VPN.
**Erro comum:** achar que quem está na rede local enxerga a zona privada; ele precisa encaminhar a consulta para o *inbound endpoint*.
**Onde na prática:** marco 03.

### UDR (User-Defined Route)
**Em uma frase:** a rota definida por você numa tabela de rotas associada a uma sub-rede, que substitui o roteamento padrão do Azure.
**No fin-azure:** toda sub-rede de aplicação tem `0.0.0.0/0` para o IP privado do Firewall, como `VirtualAppliance`.
**Erro comum:** criar a sub-rede nova sem associar a tabela de rotas, e o tráfego dela sai direto para a internet.
**Onde na prática:** marco 03.

### NSG (Network Security Group)
**Em uma frase:** o conjunto de regras de filtro de tráfego, por prioridade, associado a uma sub-rede ou a uma interface de rede.
**No fin-azure:** só o NSG da borda aceita entrada de `Internet`, na porta 443; os outros só aceitam a VNet.
**Erro comum:** esquecer que as regras padrão (`AllowVnetInBound` e outras) não se apagam e liberam o tráfego entre VNets ligadas por *peering*.
**Onde na prática:** marco 03.

## Computação

### Azure Container Apps
**Em uma frase:** o serviço de contêineres sem *cluster* para gerenciar, com escala por evento, revisões e um ambiente que agrupa os apps numa rede.
**No fin-azure:** o `pix-gateway` roda num ambiente interno, com redundância de zona e três réplicas no mínimo.
**Erro comum:** criar o ambiente sem redundância de zona; ela só se escolhe na criação, e corrigir exige recriar.
**Onde na prática:** marco 04, e também no marco 10.

### Revisão
**Em uma frase:** a versão imutável de um app do Container Apps, criada a cada mudança de configuração do contêiner; no modo *multiple*, o tráfego se divide entre revisões por pesos.
**No fin-azure:** a versão nova do `pix-gateway` recebe 10% do tráfego antes de ir a 100%.
**Erro comum:** esquecer revisões antigas ativas no modo *multiple*; com réplicas mínimas, elas continuam rodando e cobrando.
**Onde na prática:** marco 04.

### AKS Workload Identity
**Em uma frase:** a federação OIDC entre um *service account* do Kubernetes e uma identidade *user-assigned* do Entra ID, que dá ao *pod* uma identidade sem segredo.
**No fin-azure:** o consumidor de lançamentos no AKS recebe o papel de leitura da fila pela própria identidade.
**Erro comum:** dar o acesso da aplicação à identidade do *kubelet*, que é do nó, e todo *pod* do nó passa a ter as permissões dela.
**Onde na prática:** marco 02, e também no marco 04.

### Flex Consumption
**Em uma frase:** o plano de hospedagem do Azure Functions recomendado para apps novos, em Linux, com escala por evento, VNet e instâncias *always ready* opcionais.
**No fin-azure:** a função do lote de liquidação roda no Flex, com a escala máxima limitada pelo que o banco aguenta.
**Erro comum:** deixar a escala máxima no padrão; mil instâncias com um *pool* cada esgotam as conexões do Postgres.
**Onde na prática:** marco 06.

### Durable Functions
**Em uma frase:** a extensão do Functions que guarda o estado de um processo de várias etapas, com um orquestrador reexecutado do início (*replay*) a cada passo.
**No fin-azure:** o processamento do arquivo D+1 é um orquestrador com *fan-out* por lote, e as atividades são idempotentes.
**Erro comum:** chamar `time.Now()`, aleatório ou I/O direto no orquestrador; o *replay* toma outro caminho.
**Onde na prática:** marco 06.

## Mensageria

### Service Bus
**Em uma frase:** o serviço de filas e tópicos do Azure para comandos com garantia, com *peek-lock*, DLQ, sessões, transações e detecção de duplicidade.
**No fin-azure:** a fila de liquidação e o tópico de "Pix liquidado" estão num *namespace* Premium.
**Erro comum:** achar que a detecção de duplicidade impede o processamento duplo; ela só olha o envio.
**Onde na prática:** marco 05.

### Peek-lock
**Em uma frase:** o modo de recebimento do Service Bus em que a mensagem fica travada para um receptor até ele a completar, abandonar ou o *lock* expirar.
**No fin-azure:** o consumidor de lançamentos renova o *lock* enquanto processa, e o *inbox* garante um efeito por mensagem.
**Erro comum:** processar além do *lock* (padrão de 1 minuto, máximo de 5) sem renovar; a mensagem volta e o efeito acontece duas vezes.
**Onde na prática:** marco 05.

### Sessão do Service Bus
**Em uma frase:** o agrupamento de mensagens por `SessionId`, entregues em ordem e presas a um receptor por vez.
**No fin-azure:** os lançamentos de cada conta vão na sessão da conta, e cada conta é aplicada em ordem.
**Erro comum:** usar uma sessão só para tudo; a ordem fica garantida, e o paralelismo cai para um receptor.
**Onde na prática:** marco 05.

### Event Grid
**Em uma frase:** o serviço de entrega de eventos por *push*, pelo menos uma vez, para os assinantes cujo filtro casa, no formato CloudEvents.
**No fin-azure:** o evento de *blob* criado dispara o processamento do arquivo de liquidação.
**Erro comum:** não configurar o *dead-letter*; ele vem desligado, e o evento que esgota as tentativas se perde.
**Onde na prática:** marco 05.

### Event Hubs
**Em uma frase:** o *log* particionado do Azure para fluxo contínuo de eventos, com *consumer groups*, *checkpoint* e o protocolo do Kafka.
**No fin-azure:** o fluxo de todas as transações vai pelo Event Hubs para o antifraude e para o *data lake*.
**Erro comum:** usá-lo como fila de comandos; ele não tem *lock* por mensagem nem DLQ, e uma mensagem que nunca passa trava a partição.
**Onde na prática:** marco 05.

## Dados

### Flexible Server
**Em uma frase:** o Azure Database for PostgreSQL gerenciado, com HA *zone-redundant* ou *same-zone*, PgBouncer embutido e PITR de 7 a 35 dias.
**No fin-azure:** o Postgres do ledger tem HA *zone-redundant*, autenticação só pelo Entra ID e PITR de pelo menos 14 dias.
**Erro comum:** ligar o *backup* geográfico no Brazil South sem perceber que ele vai para o South Central US.
**Onde na prática:** marco 07.

### Request unit (RU)
**Em uma frase:** a unidade de custo do Cosmos DB, que mede o trabalho de cada operação; a capacidade é provisionada, *autoscale* ou *serverless* em RU/s.
**No fin-azure:** o índice de idempotência lê e grava por chave, a operação mais barata em RU.
**Erro comum:** dimensionar pelo total de RU/s e ignorar o teto de 10.000 RU/s por partição física.
**Onde na prática:** marco 07.

### Transactional batch
**Em uma frase:** o grupo de até 100 operações e 2 MB no Cosmos DB, na mesma chave de partição, executado tudo ou nada.
**No fin-azure:** o débito do saldo e o registro de idempotência vão no mesmo *batch*, na chave da conta.
**Erro comum:** desenhar a transação entre chaves de partição diferentes; o *batch* não atravessa partições.
**Onde na prática:** marco 07.

## Storage e chaves

### Shared key
**Em uma frase:** a autorização do Storage pela chave da conta, que dá acesso total aos dados e passa por fora do RBAC.
**No fin-azure:** toda conta com dado classificado tem a *shared key* desligada; só o Entra ID autoriza.
**Erro comum:** deixar o campo no padrão, que equivale a ligada, e um Owner lê tudo listando as chaves.
**Onde na prática:** marco 08.

### SAS de delegação de usuário
**Em uma frase:** a assinatura de acesso compartilhado do Storage assinada com uma chave obtida pelo Entra ID, com validade de até 7 dias.
**No fin-azure:** o parceiro de contabilidade recebe uma SAS de delegação de leitura, só no contêiner do mês, por um dia.
**Erro comum:** gerar a SAS de conta, assinada com a chave da conta, válida por anos e impossível de revogar sem rodar a chave.
**Onde na prática:** marco 08.

### Key Vault
**Em uma frase:** o cofre gerenciado do Azure para chaves, segredos e certificados, com RBAC, *soft delete* e *purge protection*.
**No fin-azure:** a CMK do ledger fica num Key Vault com *purge protection*, e o `ledger-core` só tem os papéis de uso da chave.
**Erro comum:** usar as *access policies* do modelo legado no lugar do RBAC, fora do avaliador e do menor escopo.
**Onde na prática:** marco 08.

### Purge protection
**Em uma frase:** a opção do Key Vault que impede apagar de vez um cofre ou um objeto excluído antes do fim da retenção do *soft delete*, nem pelo administrador.
**No fin-azure:** todo cofre com CMK tem *purge protection*, cobrada por regra sobre o código.
**Erro comum:** deixá-la desligada, o padrão; quem tem papel no cofre apaga a CMK, purga, e todo dado cifrado com ela fica ilegível.
**Onde na prática:** marco 08.

### CMK (chave gerenciada pelo cliente)
**Em uma frase:** a chave sua, no Key Vault ou no Managed HSM, que o serviço usa para cifrar os dados no lugar da chave da Microsoft.
**No fin-azure:** o Storage de comprovantes, o Cosmos e o Postgres do ledger cifram com a CMK do cofre de produção.
**Erro comum:** revogar a chave sem saber o efeito em cada serviço; o dado fica inacessível, e o serviço pode parar.
**Onde na prática:** marco 08.

## Observabilidade

### Diagnostic setting
**Em uma frase:** a configuração de um recurso que manda os *logs* de recurso e as métricas para um destino (Log Analytics, Storage ou Event Hubs); sem ela, o *log* do recurso não é coletado.
**No fin-azure:** todo recurso com dado tem um *diagnostic setting* para o *workspace* central, e a assinatura manda o Activity Log.
**Erro comum:** achar que o recurso já tem *log* porque o portal mostra métricas; o *log* de auditoria só existe depois do *diagnostic setting*, e só dali em diante.
**Onde na prática:** marco 09.

### Log Analytics workspace
**Em uma frase:** o repositório de *logs* do Azure Monitor, com tabelas consultadas em KQL, cada uma com um plano e uma retenção.
**No fin-azure:** um *workspace* central por ambiente, com o acesso por recurso e a auditoria com retenção longa por tabela.
**Erro comum:** subir a retenção do *workspace* inteiro para atender a auditoria, e guardar a depuração por anos.
**Onde na prática:** marco 09, e também no marco 11.

### Plano de tabela
**Em uma frase:** a classe de uma tabela do Log Analytics (Analytics, Basic ou Auxiliary), que decide o preço da ingestão, a retenção interativa e se a consulta é cobrada.
**No fin-azure:** os *logs* de depuração de alto volume ficam em Basic; os que alimentam alertas, em Analytics.
**Erro comum:** pôr em Basic uma tabela que alimenta alerta e painel, e pagar cada consulta pelo volume lido.
**Onde na prática:** marco 09.

### Application Insights
**Em uma frase:** a parte de APM do Azure Monitor, com requisições, dependências, exceções e *traces*, guardados em tabelas de um *workspace* do Log Analytics.
**No fin-azure:** o `pix-gateway` envia pela Distro do OpenTelemetry, com a autenticação local desligada.
**Erro comum:** deixar a ingestão por chave ligada; uma *connection string* vazada injeta telemetria falsa.
**Onde na prática:** marco 09.

### Activity Log
**Em uma frase:** o registro das operações do plano de controle do Azure (quem criou, mudou ou apagou um recurso), guardado pelo Azure por 90 dias.
**No fin-azure:** a assinatura exporta o Activity Log para o *workspace* central, com a retenção da política de auditoria.
**Erro comum:** esperar que ele responda quem leu um segredo; isso está no *log* de recurso do Key Vault.
**Onde na prática:** marco 09.

## Resiliência

### Zone-redundant
**Em uma frase:** o recurso que o serviço espalha pelas zonas de disponibilidade da região sozinho e que sobrevive à perda de uma zona; o oposto do recurso zonal, preso a uma zona escolhida.
**No fin-azure:** o ambiente do Container Apps, o Postgres, o Cosmos e o Storage do caminho de pagamento são *zone-redundant*.
**Erro comum:** criar o recurso sem a opção e descobrir que, em vários serviços, ela só se escolhe na criação.
**Onde na prática:** marco 10.

### Região de acesso restrito
**Em uma frase:** a região do Azure cujo uso depende de pedido, reservada a cenários específicos, como o DR dentro de um país.
**No fin-azure:** o DR no país usa o Brazil Southeast, com o pedido de acesso e as cotas registrados na ADR.
**Erro comum:** escrever o plano de DR para o Brazil Southeast sem o acesso liberado, e descobrir no exercício que a assinatura não cria recursos lá.
**Onde na prática:** marco 10.

### Front Door
**Em uma frase:** a entrada global da Microsoft, que termina a conexão no ponto de presença perto do cliente, com WAF, TLS e *cache*, e tira a origem doente pela sonda sem esperar DNS.
**No fin-azure:** a API pública do `pix-gateway` entra pelo Front Door, com origens em duas regiões.
**Erro comum:** pôr o Front Door e o Traffic Manager em paralelo; a recomendação é um ou outro, com o Traffic Manager na frente só como reserva.
**Onde na prática:** marco 10.

### Traffic Manager
**Em uma frase:** o balanceador global por DNS do Azure, que devolve o nome da região saudável e deixa o cliente se conectar direto.
**No fin-azure:** fica para tráfego que não é HTTP; a API usa o Front Door.
**Erro comum:** contar com *failover* em segundos; o tempo depende do TTL e dos clientes que o ignoram.
**Onde na prática:** marco 10.

### Chaos Studio
**Em uma frase:** o serviço de injeção de falhas do Azure, com cenários prontos, como o *Compute Zone Down*, que desliga as VMs e as instâncias de *scale set* de uma zona.
**No fin-azure:** o exercício de zona roda num *scale set* de teste; os serviços gerenciados são exercitados pelo *failover* forçado de cada um.
**Erro comum:** achar que o cenário de zona derruba o AKS inteiro ou os serviços gerenciados; ele não os cobre.
**Onde na prática:** marco 10.

## Custo

### Tag inheritance
**Em uma frase:** a opção do Cost Management que aplica as *tags* da assinatura e do *resource group* aos registros de uso, e não aos recursos.
**No fin-azure:** a *tag* `cost-center` do *resource group* aparece no relatório de custo de todo recurso dele.
**Erro comum:** esperar que o recurso passe a ter a *tag*; para isso é a política `modify`.
**Onde na prática:** marco 11.

### Budget
**Em uma frase:** o limite de gasto do Cost Management num escopo, com até 5 alertas por gasto real e 5 por gasto previsto.
**No fin-azure:** a assinatura de produção tem um *budget* no código, com alerta previsto em 80%.
**Erro comum:** configurar só o alerta real, que avisa quando o dinheiro já foi gasto.
**Onde na prática:** marco 11.

### Savings plan for compute
**Em uma frase:** o compromisso de gasto por hora em computação, por 1 ou 3 anos, aplicado entre famílias de VM e regiões em troca de desconto.
**No fin-azure:** a base de computação que muda de família e de região no DR fica no *savings plan*.
**Erro comum:** comprar antes do *rightsizing* e travar o desperdício por anos; o compromisso não usado na hora se perde.
**Onde na prática:** marco 11.

### Spot (Azure)
**Em uma frase:** a capacidade ociosa do Azure com desconto grande, que pode ser tomada de volta com até 30 segundos de aviso pelos *Scheduled Events*.
**No fin-azure:** o reprocessamento de lote roda em *spot*, com *checkpoint* e itens idempotentes.
**Erro comum:** usar *spot* no caminho síncrono do pagamento, ou não se inscrever nos *Scheduled Events* e perder o aviso.
**Onde na prática:** marco 11.

### Azure Hybrid Benefit
**Em uma frase:** o desconto que usa as licenças Windows Server ou SQL Server com Software Assurance que a empresa já tem; desconta só a licença.
**No fin-azure:** não se aplica ao `fin-platform`, que roda Linux e Postgres; aparece na migração de cargas Windows do legado.
**Erro comum:** esperar desconto na computação; ela continua cobrada.
**Onde na prática:** marco 11.

### Retail Prices API
**Em uma frase:** a API pública e sem autenticação da Microsoft que devolve o preço de varejo de cada medidor, por serviço e região.
**No fin-azure:** o modelo de custo recebe um arquivo de preços tirado dela, com data e região.
**Erro comum:** copiar preço de memória ou de um artigo antigo para a ADR, sem data nem região.
**Onde na prática:** marco 11.
