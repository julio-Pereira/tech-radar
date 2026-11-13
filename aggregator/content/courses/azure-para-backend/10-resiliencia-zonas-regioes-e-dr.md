---
id: resiliencia-zonas-regioes-e-dr
title: "Resiliência: zonas, regiões e DR"
summary: "Zone-redundant é o padrão; multi-região é decisão de negócio e, no Brasil, também regulatória, porque o par do Brazil South fica fora do país. O que é zonal e o que é zone-redundant em cada serviço, a zona que só se escolhe na criação, o par assimétrico Brazil South → South Central US e o Brazil Southeast de acesso restrito, Front Door × Traffic Manager, Chaos Studio — com uma tabela de regras que reprovou a ADR com a cópia geográfica para os Estados Unidos sem ADR de residência e a região restrita sem pedido de acesso."
estimatedMinutes: 60
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [confiabilidade, regulacao]
references:
  - title: "Azure reliability — Azure region pairs and nonpaired regions"
    url: https://learn.microsoft.com/azure/reliability/regions-paired
  - title: "Azure reliability — Azure services that support availability zones"
    url: https://learn.microsoft.com/azure/reliability/availability-zones-service-support
  - title: "Azure Container Apps — Create a zone-redundant container app"
    url: https://learn.microsoft.com/azure/container-apps/how-to-zone-redundancy
  - title: "Azure Architecture Center — Load-balancing options"
    url: https://learn.microsoft.com/azure/architecture/guide/technology-choices/load-balancing-overview
  - title: "Azure Chaos Studio — Scenarios and outage templates"
    url: https://learn.microsoft.com/azure/chaos-studio/chaos-studio-scenarios
---

## Zone-redundant é o padrão; multi-região é decisão

Uma região do Azure com ***availability zones*** tem três zonas, cada uma com energia, refrigeração e rede
próprias. A teoria é a do marco gêmeo e de `system-design/13`: a perda de uma zona é rotina, e o serviço
precisa continuar sem mudar nada (a **estabilidade estática** de `aws-para-backend/10`).

Multi-região dobra a infraestrutura, traz a replicação assíncrona e o problema do saldo com dois escritores
(marco 07). Ela só se justifica por um RPO e um RTO escritos pelo negócio, com o custo ao lado. No Brasil, há
mais uma pergunta, que este marco responde: **para onde o dado vai**.

## Zonal, *zone-redundant* e regional

O Azure usa duas palavras que mudam o desenho:

- **zonal:** o recurso fica **numa zona que você escolhe** (uma VM na zona 2, um disco). Ele cai com a zona;
  a resiliência vem de ter vários, em zonas diferentes;
- ***zone-redundant***: o serviço espalha o recurso pelas zonas sozinho. Ele sobrevive à zona sem você
  fazer nada.

Conferido em 12 nov 2026, para os serviços do `fin-azure`:

| Serviço | Como fica *zone-redundant* | O cuidado |
| --- | --- | --- |
| Container Apps | o ambiente com redundância de zona, numa VNet com sub-rede de infraestrutura | **só na criação**: não muda depois. Pelo menos duas réplicas para espalhar; sem custo extra |
| AKS | *node pools* em várias zonas | o disco persistente é zonal: o *pod* com volume não muda de zona |
| Postgres Flexible Server | HA *zone-redundant* (marco 07) | o *same-zone* não protege da zona |
| Cosmos DB | `zone_redundant` em cada região da conta | é por região, configurado na criação da região |
| Storage | ZRS, ou GZRS para somar a cópia geográfica | LRS fica num *datacenter* só; GRS copia para o par |
| Service Bus | automático em todos os *tiers*, nas regiões com zona, sem custo | a propriedade `zoneRedundant` pode aparecer como `false` mesmo assim |
| Key Vault, Event Grid | do próprio serviço | nada a configurar |

A regra que pega times novos: **a zona é decisão de criação** em vários serviços. Um ambiente do Container
Apps criado sem redundância de zona precisa ser recriado. Por isso ela vai no código desde o primeiro
`apply`, e a regra sobre o código a cobra antes de existir o recurso.

## O par do Brazil South

Toda região pode ter uma **região pareada**. O par traz duas coisas, conferidas em 12 nov 2026:

- as **atualizações planejadas** da plataforma vão para uma região do par de cada vez;
- numa falha ampla, **uma região de cada par** tem prioridade na recuperação.

O par não traz *failover* automático nem resiliência por si: a documentação é explícita. A cópia geográfica
do Storage (GRS) e o *backup* geográfico do Postgres (marco 07) vão **para o par**, e o *failover* gerenciado
pela Microsoft é o último recurso.

O detalhe que muda a arquitetura no Brasil:

- o par do **Brazil South** é o **South Central US**, fora da geografia Brasil. O par é **assimétrico**: o
  South Central US não tem o Brazil South como par;
- o **Brazil Southeast** tem o Brazil South como par, mas é uma região de **acesso restrito**: ela existe
  para cenários específicos, como o DR dentro do país, e o uso depende de pedido. Nem todo serviço existe
  nela.

Para um dado classificado, isso cria duas opções, e as duas vão numa ADR:

- **DR fora do país**, no South Central US, pelo par: precisa de base legal para a transferência
  internacional, cifra com chave do cliente (marco 08) e a decisão escrita;
- **DR no país**, no Brazil Southeast: precisa do acesso liberado, da conferência de que cada serviço do
  caminho existe lá e das cotas pedidas antes.

A norma sobre nuvem e transferência de dado (a referência usual é a Resolução CMN nº 4.893/2021, a conferir
na versão vigente) está em `conectividade-multicloud/09`. Este marco não a repete; ele faz o código e a ADR
cobrarem a decisão.

## As estratégias de DR

As quatro estratégias são as do marco gêmeo (*backup and restore*, *pilot light*, *warm standby* e
ativo-ativo), com o custo subindo e o RPO e o RTO caindo. No Azure, o DR de uma arquitetura gerenciada é a
**soma da replicação de cada serviço**:

| Serviço | Replicação entre regiões | O que ela garante |
| --- | --- | --- |
| Postgres Flexible Server | réplica de leitura em outra região, promovida na falha; ou o *geo-restore* do *backup* | a réplica é assíncrona; o *geo-restore* tem RPO de até cerca de uma hora (marco 07) |
| Azure SQL | *failover groups* | o nome de leitura e escrita acompanha o *failover* |
| Cosmos DB | mais regiões na conta, com uma ou várias de escrita | a escrita em várias regiões resolve conflito pela última escrita (marco 07) |
| Storage | GRS ou GZRS, para o par | assíncrona; o *failover* da conta é seu ou da Microsoft |
| Service Bus | *geo-replication* ou *geo-disaster recovery* (Premium) | o *geo-DR* replica só os metadados, não as mensagens |

**Replicação assíncrona significa RPO maior que zero**, e para o ledger isso é dinheiro. A conciliação
(`ledger-e-contabilidade/08`) precisa achar e repor o buraco. A replicação por *log* está em
`dados-distribuidos/02`; o RPO e o RTO como contrato, em `dados-distribuidos/12`.

## Entrada global: Front Door ou Traffic Manager

Para mandar o cliente para a região viva, conferido em 12 nov 2026:

- o **Front Door** termina a conexão no ponto de presença perto do cliente e fala com as origens por
  conexões próprias. A sonda de saúde tira a origem doente **sem esperar DNS**, e ele traz WAF, TLS e *cache*
  na borda;
- o **Traffic Manager** é **balanceamento por DNS**: devolve o nome da região saudável, e o cliente se conecta
  direto. O *failover* depende do **TTL** e dos clientes que o ignoram. Ele serve para tráfego que não é
  HTTP.

Para uma API HTTP, o Front Door. A documentação recomenda um ou outro, não os dois; a exceção é o Traffic
Manager **na frente** do Front Door, como caminho de reserva. A entrada da API do Pix com mTLS e o WAF
seguem `seguranca-aplicacao` e o marco 03.

## Cotas, plano de controle e o *game day*

As **cotas** da região secundária fazem parte do plano de DR: vCPU por família, núcleos do Container Apps,
IPs. A secundária com a cota padrão não aguenta a primária. O pedido de aumento vem antes, e no Brazil
Southeast vem junto com o pedido de acesso.

O DR que nunca foi exercitado não existe. Conferido em 12 nov 2026: o **Chaos Studio** usa o modelo de
***workspaces*** e tem o cenário ***Compute Zone Down***, que desliga as VMs e as instâncias de *scale set* de
uma zona. Ele **não cobre o AKS como um todo**, nem os serviços gerenciados: para eles, o exercício é o
*failover* forçado de cada um (o do Postgres, o da conta do Cosmos).

Sem assinatura, o *game day* é local, e o do marco gêmeo vale igual: derrubar "uma zona" (metade dos
processos) no meio de 200 pagamentos. Medido em `aws-para-backend/10`: **200 de 200 confirmados**, nenhuma
falha vista pelo cliente, 50 tentativas extras e **200 lançamentos** no banco, sem nenhum em dobro. O que
prova é o serviço, não a nuvem.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| Availability Zones | Availability Zones | no Azure, vários serviços escolhem a zona só na criação |
| sem par fixo | região pareada | o par do Brazil South fica nos Estados Unidos; o Brazil Southeast é restrito |
| replicação de cada serviço | replicação de cada serviço | a cópia geográfica padrão (GRS, *geo-backup*) vai para o par |
| Route 53 com *health checks* | Front Door, ou Traffic Manager | o Front Door tira a origem sem esperar o TTL do DNS |
| Fault Injection Service | Chaos Studio | o cenário de zona do Chaos Studio não cobre o AKS inteiro |

O marco gêmeo é `aws-para-backend/10`.

> **Armadilha.** Ligar GRS no *storage* de comprovantes "porque é mais seguro" e descobrir na auditoria que
> o dado classificado está sendo copiado para o Texas desde o primeiro dia, sem base legal nem decisão
> escrita.

> **O que o laboratório não reproduz.** As regras e o *game day* local não reproduzem a rede de uma zona, o
> *failover* gerenciado, o TTL do DNS nem as cotas da região secundária. Eles provam que **o seu código e a
> sua ADR** não deixam passar uma zona única no caminho de pagamento, um RTO impossível ou uma cópia
> geográfica sem decisão. A falha real só aparece no Chaos Studio, numa assinatura.

## Exemplo numa fintech

O plano de DR do ledger dizia "*warm standby* no Brazil Southeast, RTO de 15 minutos". No primeiro
exercício, o time descobriu três coisas: a assinatura não tinha acesso liberado à região; o pedido levou
dias; e um dos serviços do caminho não existia lá. O RTO real era indefinido. A correção:

- o pedido de acesso e as cotas entraram na ADR, com o número do chamado, e a regra passou a reprovar a ADR
  que aponta para região restrita sem esse registro;
- a lista de serviços do caminho passou a ser conferida contra a região secundária a cada trimestre;
- os comprovantes, que precisavam de cópia fora do país pelo contrato com um parceiro, ganharam uma ADR de
  residência própria, com chave do cliente.

## Hands-on

**Tutorial.** Escreva a ADR de DR do `fin-platform` como dados (`adr/dr.json`): para cada componente, a
estratégia, o RPO, o RTO, o pico, a capacidade da secundária, o tempo para escalar, o custo mensal, a região
primária e a secundária, se o dado é classificado e as ADRs de residência e de acesso.

**Desafio.** O plano de DR do `fin-platform` no Azure, provado por regras e pelo *game day* local.

**Invariantes testáveis**

1. **A estratégia entrega o RPO e o RTO declarados.** Um *script* aplica a tabela de regras do time: o RTO
   mínimo de cada estratégia, RPO zero impossível com replicação assíncrona, tempo para escalar dentro do RTO,
   custo obrigatório.
2. **O dado sabe para onde vai.** Dado classificado replicado para fora da geografia Brasil exige ADR de
   residência; a região de acesso restrito exige o pedido registrado.

   Medido: a ADR boa passou. A ruim foi reprovada em **6 achados**:
   - o ledger no Brazil Southeast sem o pedido de acesso;
   - o `pix-gateway` em *pilot light* com RTO de 5 minutos;
   - os extratos copiados para o South Central US sem ADR de residência;
   - e um componente com RPO 0 em replicação assíncrona, tempo para escalar maior que o RTO e sem custo.
3. **Nenhuma zona única no caminho de pagamento.** As regras de `politicas/resiliencia.rego` cobram, nos
   recursos com `caminho = pagamento`:
   - o ambiente do Container Apps com redundância de zona e sub-rede;
   - pelo menos 3 réplicas (a regra do time);
   - o Postgres com HA *zone-redundant*;
   - o Cosmos *zone-redundant* em cada região;
   - o *storage* em ZRS ou GZRS.

   E, em qualquer recurso, a cópia geográfica de dado classificado sem ADR. Medido: o código bom passou nas 7
   regras. A *fixture* ruim foi reprovada em **6 achados**:
   - o ambiente sem zona;
   - 1 réplica;
   - o Postgres *same-zone*;
   - o Cosmos sem zona;
   - o *storage* LRS;
   - uma conta GZRS de dado classificado sem ADR.
4. ***Game day* local.** Derrubar uma das duas "zonas" no meio de 200 pagamentos mantém o pagamento
   funcionando, sem lançamento em dobro (o *harness* de `aws-para-backend/10`).

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, rode o cenário *Compute Zone Down*
do Chaos Studio num *scale set* de teste em três zonas, com uma carga constante, e meça a fração de requisições
que falhou e por quanto tempo. Destrua tudo no fim.

**Checagem**

1. Qual a diferença entre um recurso zonal e um *zone-redundant*, e por que a zona é decisão de criação?
2. Por que o par do Brazil South é uma questão de residência, e quais são as duas saídas?
3. Quando Front Door e quando Traffic Manager, e por que o TTL entra no RTO de um e não do outro?
4. Por que a cota da região secundária faz parte do plano de DR?

## Principais aprendizados

- *Zone-redundant* é o padrão; multi-região é decisão de negócio, com RPO, RTO e custo escritos.
- Zonal cai com a zona; *zone-redundant* sobrevive sozinho. Em vários serviços, a zona só se escolhe na
  criação.
- O par do Brazil South é o South Central US, assimétrico; o Brazil Southeast é restrito (nov 2026).
- A cópia geográfica padrão vai para o par: GRS e *backup* geográfico são decisões de residência.
- Front Door tira a origem sem esperar o DNS; Traffic Manager depende do TTL.
- Cotas e acesso à região secundária são parte do DR, e as regras cobram tudo isso antes do `apply`.
