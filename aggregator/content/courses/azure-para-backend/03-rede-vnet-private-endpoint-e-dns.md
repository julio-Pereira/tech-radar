---
id: rede-vnet-private-endpoint-e-dns
title: "Rede: VNet, Private Endpoint e DNS"
summary: "No Azure, o PaaS nasce com endpoint público. O trabalho de rede de uma fintech é desligar o público, ligar o privado e fazer o DNS resolver para o privado — os três, provados. VNet, NSG e ASG, a saída única e as sub-redes privadas por padrão desde mar 2026, service endpoint × Private Endpoint, a zona privatelink e o vínculo que o peering não compartilha, o DNS Private Resolver e os VNet flow logs — com um resolvedor didático em Go que mostra o pod do AKS indo pela internet sem erro nenhum."
estimatedMinutes: 65
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [seguranca, plataforma]
references:
  - title: "Azure Private Endpoint private DNS zone values"
    url: https://learn.microsoft.com/azure/private-link/private-endpoint-dns
  - title: "Azure DNS Private Resolver — endpoints and rulesets"
    url: https://learn.microsoft.com/azure/dns/private-resolver-endpoints-rulesets
  - title: "Azure — Default outbound access"
    url: https://learn.microsoft.com/azure/virtual-network/ip-services/default-outbound-access
  - title: "Azure — How network security groups filter network traffic"
    url: https://learn.microsoft.com/azure/virtual-network/network-security-group-how-it-works
---

## O PaaS nasce público

Na AWS, o banco e a fila vivem dentro da VPC por padrão. No Azure, quase todo PaaS (Storage, Cosmos DB, Key
Vault, Service Bus, o Postgres no modo de acesso público) nasce com um ***endpoint* público** na internet,
protegido só pela autenticação. O trabalho de rede de uma fintech no Azure tem três passos, e os três precisam
ser provados:

1. **desligar o público:** `public network access: disabled` em cada serviço;
2. **ligar o privado:** um **Private Endpoint**, uma interface de rede com IP privado numa sub-rede sua,
   ligada ao serviço;
3. **fazer o DNS resolver para o privado**, que é onde quase tudo dá errado.

## VNet, NSG e saída

A **VNet** se divide em sub-redes. O **NSG** (*network security group*) é o filtro com estado, aplicado à
sub-rede ou à interface de rede. Conferido em 12 nov 2026:

- as regras padrão não se apagam: `AllowVnetInBound` (65000), `AllowAzureLoadBalancerInBound` (65001) e
  `DenyAllInBound` (65500); as regras próprias vão de 100 a 4096 e vencem as padrão;
- com NSG na sub-rede **e** na interface, a entrada precisa ser permitida pelos dois;
- o ***service tag*** `VirtualNetwork` inclui as VNets com *peering* e as redes locais conectadas, e por isso a
  regra padrão `AllowVnetInBound` é mais larga do que o nome sugere.

O **ASG** (*application security group*) dá nome a um conjunto de interfaces (`asg-ledger`), para escrever a
regra por papel e não por IP. É o mais perto do "*security group* como origem" da AWS.

**Saída.** Conferido em 12 nov 2026: nas versões de API posteriores a 31 mar 2026, as sub-redes de **VNets
novas nascem privadas** (`defaultOutboundAccess = false`) e não saem para a internet sem um método explícito. As
VNets existentes não mudam. O desenho do `fin-azure` tem **saída única**:

- uma **UDR** (*user-defined route*) com `0.0.0.0/0` para o **Azure Firewall** no *hub*, quando a saída precisa
  de filtro por domínio;
- ou o **NAT Gateway**, por ADR, quando só precisa de IP de saída estável.

## *Service endpoint* × Private Endpoint

| | *Service endpoint* | Private Endpoint |
| --- | --- | --- |
| O que é | a sub-rede passa a falar com o serviço pelo *backbone*, com o IP privado de origem | uma interface com IP privado na sua sub-rede, para **uma instância** do serviço |
| O serviço continua com IP público | sim; a regra de rede do serviço aceita a sub-rede | sim, até você desligar o acesso público |
| Alcance | a sub-rede, para o serviço inteiro | a instância, de qualquer rede que alcance o IP (*peering*, VPN, ExpressRoute) |
| DNS | não muda | precisa da zona privada |

O critério: dado classificado vai por **Private Endpoint**, com o acesso público desligado. O *service endpoint*
não chega ao serviço a partir das redes locais nem de outras VNets, e não aponta uma instância.

## O DNS do Private Endpoint

O nome do serviço não muda. `cosmos-ledger.documents.azure.com` tem um **CNAME** para
`cosmos-ledger.privatelink.documents.azure.com`. O que decide o IP é **quem resolve esse segundo nome**:

- de uma VNet **vinculada** à ***Private DNS zone*** `privatelink.documents.azure.com`, ele resolve para o IP
  privado do Private Endpoint;
- de qualquer outro lugar, resolve para o IP público.

As zonas, conferidas em 12 nov 2026: `privatelink.blob.core.windows.net` (Blob),
`privatelink.documents.azure.com` (Cosmos DB para NoSQL), `privatelink.postgres.database.azure.com` (Postgres
Flexible Server), `privatelink.vaultcore.azure.net` (Key Vault) e `privatelink.servicebus.windows.net` (Service
Bus e Event Hubs). A tabela da documentação tem uma linha por serviço e subrecurso; o Cosmos muda de zona com a
API.

Três pontos que derrubam projetos:

- **O vínculo é por VNet, e o *peering* não o compartilha.** A zona vinculada só ao *hub* não resolve para o
  *spoke* do AKS, mesmo com *peering*. Ou a zona é vinculada a toda VNet consumidora, ou os *spokes* usam um
  resolvedor central.
- **Quem está nas redes locais não enxerga a zona.** O DNS da empresa precisa encaminhar `privatelink.*` para o
  **Azure DNS Private Resolver**: o ***inbound endpoint*** recebe as consultas das redes locais; o ***outbound
  endpoint***, com os ***forwarding rulesets***, manda do Azure para o DNS local.
- ***Split-brain*.** O mesmo nome responde um IP dentro e outro fora. Funciona, e engana: quem testa do
  *notebook* vê o IP público e acha que está tudo certo.

## Topologia

O ***hub-spoke*** é o padrão: o *hub* tem o Firewall, o Private Resolver, as zonas privadas e o *gateway* da
conexão com as redes locais (o ExpressRoute de `conectividade-multicloud/04`); cada *spoke* é uma carga de
trabalho. O ***peering* não é transitivo**: dois *spokes* só se falam pelo Firewall do *hub*, com UDR. O
**Virtual WAN** é o *hub* gerenciado pela Microsoft, para quando há muitas regiões e filiais. O endereçamento sem
sobreposição com as outras nuvens é de `conectividade-multicloud/02`, e o anúncio mínimo, de
`conectividade-multicloud/08`.

**Borda de entrada.** O **Front Door**, global, ou o **Application Gateway**, regional, os dois com WAF, ficam na
frente do serviço. O mTLS e a terminação TLS na borda são de `seguranca-aplicacao/11`; dentro do *cluster*, a
política de rede é de `kubernetes/11`.

**Registro.** Conferido em 12 nov 2026: os **NSG flow logs** não aceitam criação nova desde 30 jun 2025 e se
aposentam em 30 set 2027. O substituto são os **VNet flow logs**, ligados na VNet.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| VPC | VNet | o PaaS do Azure não vive dentro dela: chega por Private Endpoint |
| *security group* | NSG + ASG | o NSG se aplica à sub-rede ou à interface; o ASG é o "grupo como origem" |
| NACL | sem equivalente | o NSG na sub-rede faz o papel |
| *gateway endpoint* / *interface endpoint* | *service endpoint* / Private Endpoint | o Private Endpoint exige a zona DNS vinculada a cada VNet consumidora |
| Route 53 privado | Private DNS zone + DNS Private Resolver | o vínculo é por VNet, e o *peering* não o leva |
| Transit Gateway | *hub* com Firewall, ou Virtual WAN | o *peering* não é transitivo; a passagem é pela UDR para o Firewall |

O marco gêmeo é `aws-para-backend/03`.

> **Armadilha.** Criar o Private Endpoint e esquecer a zona DNS, ou o vínculo. A aplicação continua resolvendo o
> IP público, o tráfego sai pela internet, e tudo funciona, sem erro, até a auditoria. Se o acesso público já
> estiver desligado, aí sim aparece: como `403` ou *timeout*, e o time desconfia da permissão, não do DNS.

> **O que o laboratório não reproduz.** O resolvedor didático modela zonas, vínculos e o CNAME, não o DNS real:
> não há TTL, *cache* do cliente, encaminhamento das redes locais nem o Private Resolver. As regras sobre o
> código provam que a configuração existe; se o nome resolve, de fato, só uma assinatura mostra.

## Exemplo numa fintech

O `ledger-core` no AKS gravava no Cosmos DB "pela rede privada", segundo o diagrama. A zona
`privatelink.documents.azure.com` estava vinculada só à VNet do *hub*. O *pod*, no *spoke* do AKS, resolvia o nome
pelo DNS público e saía pela internet até o *endpoint* público do Cosmos, que ainda estava ligado. Ninguém notou
até o dia em que o time de segurança desligou o acesso público: o ledger parou com *timeout*, e a primeira
suspeita foi o RBAC. A correção:

- a zona passou a ser vinculada a toda VNet consumidora, pelo módulo `dns`;
- o acesso público foi desligado em todo PaaS;
- uma regra sobre o código passou a reprovar a zona sem vínculo com uma VNet consumidora.

## Hands-on

**Tutorial.** Escreva em Go o **resolvedor didático**: dada a topologia (zonas, registros, vínculos por VNet e o
mapa do sufixo público para a zona `privatelink`), ele responde para qual IP um nome resolve a partir de cada
VNet.

**Desafio.** A rede do `fin-azure` em *hub-spoke*, com as regras sobre o código em `politicas/rede.rego` e as
VNets consumidoras e as bordas das outras nuvens num arquivo de dados.

**Invariantes testáveis**

1. **Nenhum PaaS público.** Todo recurso PaaS com dado (Storage, Cosmos, Postgres, Key Vault, Service Bus) tem
   `public_network_access_enabled = false`, literal, e um Private Endpoint.
2. **A zona certa, vinculada a toda VNet consumidora.** O Private Endpoint usa a zona `privatelink` do serviço, e
   ela tem vínculo com cada VNet consumidora. O resolvedor prova o efeito. Medido:
   - com a zona vinculada ao *hub* e ao AKS, o nome resolveu para o IP privado;
   - com a zona só no *hub*, o AKS, com *peering*, resolveu para o **IP público**;
   - o teste da matriz pegou exatamente a VNet de funções sem vínculo.
3. **Entrada só na borda.** Nenhum NSG aceita entrada de `Internet` ou `*`, exceto o NSG da borda, na porta 443.
4. **Saída única.** Toda sub-rede de aplicação tem a rota `0.0.0.0/0` para o Firewall (`VirtualAppliance`), ou o
   NAT declarado em ADR.
5. **Sem sobreposição.** Os espaços de endereço não sobrepõem as bordas de `conectividade-multicloud` (lidas do
   arquivo de dados, com `net.cidr_intersects`).
6. ***Flow logs*.** Toda VNet tem VNet flow log.

Medido: o código bom passou nas 8 regras. A *fixture* ruim foi reprovada em **8 achados**:

- o Cosmos público;
- um Key Vault público e sem Private Endpoint (dois achados);
- a zona sem vínculo com o AKS;
- a regra de entrada na porta 22;
- a sub-rede com a rota para `Internet`;
- a VNet sobrepondo a borda do fornecedor;
- o *hub* sem *flow log*.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, crie um Storage com Private
Endpoint e a zona vinculada só ao *hub*. Rode `nslookup` de uma VM no *spoke*, antes e depois do vínculo. Destrua
tudo no fim.

**Checagem**

1. Qual a diferença entre NSG e ASG, e por que a regra padrão `AllowVnetInBound` é mais larga do que parece?
2. Quando *service endpoint*, quando Private Endpoint?
3. Por que o *pod* num *spoke* com *peering* resolve o IP público, e como corrigir?
4. Como alguém nas redes locais da empresa resolve o nome de um Private Endpoint?

## Principais aprendizados

- O PaaS nasce público: desligar o público, ligar o privado e resolver para o privado, os três provados.
- NSG com estado, regras próprias de 100 a 4096; ASG para escrever a regra por papel.
- Sub-redes de VNets novas nascem privadas desde mar 2026. Saída única pelo Firewall ou NAT.
- O Private Endpoint depende da zona `privatelink` vinculada a cada VNet consumidora. O *peering* não leva o
  vínculo, e as redes locais precisam do Private Resolver.
- *Peering* não é transitivo. NSG flow logs aposentam em set 2027; o caminho é VNet flow log.
- O resolvedor mostrou o *pod* indo pela internet sem erro nenhum.
