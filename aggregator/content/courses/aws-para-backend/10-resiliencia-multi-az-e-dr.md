---
id: resiliencia-multi-az-e-dr
title: "Resiliência: multi-AZ, multi-região e DR"
summary: "Multi-AZ é o padrão; multi-região é uma decisão de negócio com RPO, RTO e custo escritos. Estabilidade estática, o que é regional e falha junto, as quatro estratégias de DR, a replicação de cada serviço e o que ela garante (Aurora Global com RPO em segundos, S3 RTC com SLA de 99,9% em 15 min), células, cotas como risco — e um game day local que derrubou uma AZ com 200 de 200 pagamentos confirmados e nenhum em dobro."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [confiabilidade, arquitetura]
references:
  - title: "Amazon Builders' Library — Static stability using Availability Zones"
    url: https://aws.amazon.com/builders-library/static-stability-using-availability-zones/
  - title: "Disaster Recovery of Workloads on AWS (whitepaper)"
    url: https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html
  - title: "Amazon Aurora — Using switchover or failover in an Aurora global database"
    url: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html
  - title: "Amazon S3 — Replication Time Control"
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-time-control.html
  - title: "AWS Fault Isolation Boundaries — Global services"
    url: https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/global-services.html
  - title: "AWS Fault Injection Service — AZ Availability: Power Interruption"
    url: https://docs.aws.amazon.com/fis/latest/userguide/az-availability-scenario.html
---

## Multi-AZ é o padrão; multi-região é decisão

Uma **região** tem várias **AZs**, cada uma com energia, rede e prédios próprios. Uma falha de AZ acontece
e precisa ser rotina: o serviço em três AZs perde um terço da capacidade e continua. Isso é o padrão, não
uma escolha.

**Multi-região** é outra conversa. Ela dobra (ou quase) a infraestrutura, traz a replicação assíncrona entre
regiões e o problema do saldo com dois escritores (marco 07). Só se justifica por um **RPO e um RTO
escritos** pelo negócio, com o custo ao lado. A teoria de disponibilidade, de multi-região e de células é
de `system-design/13`; este marco é a AWS.

## Estabilidade estática

A Builders' Library chama de **estabilidade estática** o sistema que continua funcionando na falha **sem
precisar mudar nada**: sem escalar, sem criar instância, sem chamar o plano de controle. O motivo é que,
na falha de uma AZ, a demanda pelo plano de controle (criar instâncias, mudar rotas) explode justamente
quando ele está mais lento.

Na prática:

- **capacidade pré-provisionada** para perder uma AZ: com três AZs, cada uma aguenta a metade do pico, e a
  perda de uma deixa as outras duas com 100%;
- o **caminho de dados** não depende do **plano de controle**: o serviço que lê a configuração na
  partida não para quando a API de configuração cai;
- o ***failover* já testado** (o Multi-AZ do RDS, marco 07), e não um *script* que roda pela primeira vez
  no incidente.

## O que falha junto

- **Zonal:** sub-rede, instância, tarefa, volume EBS, NAT Gateway (um por AZ, marco 03).
- **Regional:** a VPC, o SQS, o DynamoDB, o S3, o Lambda e o KMS. Eles já usam várias AZs por dentro, e a
  falha deles é da região.
- **Global, com plano de controle numa região só:** pelo *whitepaper* *AWS Fault Isolation Boundaries*,
  os serviços globais, como o IAM e o Route 53, têm o plano de dados distribuído e o **plano de controle
  numa única região** (no DNS público do Route 53, us-east-1). Responder DNS continua funcionando; mudar
  registros ou criar papéis pode falhar junto com aquela região. O plano de DR não pode depender de
  **criar** um papel ou **mudar** um registro durante a falha: o registro de *failover* e o papel da região
  secundária existem antes, e o *failover* usa o plano de dados (o *health check*).

**Cotas** também falham junto. A região secundária com a cota padrão de tarefas, de concorrência do
Lambda ou de IPs não aguenta a carga da primária. O aumento de cota é pedido **antes**, e a cota faz parte
do plano de DR.

## As quatro estratégias

O *whitepaper* de DR da AWS descreve as quatro em ordem crescente de custo e decrescente de RPO e RTO:

| Estratégia | O que fica pronto na região secundária | RPO e RTO (ordem de grandeza) | Custo |
| --- | --- | --- | --- |
| ***Backup and restore*** | só os *backups* | horas | o menor |
| ***Pilot light*** | dados replicados; computação desligada ou mínima | dezenas de minutos | baixo |
| ***Warm standby*** | dados replicados e uma versão menor do serviço, funcionando | minutos | médio |
| **Ativo-ativo** (*multi-site*) | o serviço inteiro nas duas, atendendo | próximo de zero no RTO | o maior |

A diferença entre *pilot light* e *warm standby* está no que roda. No *pilot light*, a computação precisa
ser criada ou escalada na falha, o que depende do plano de controle e das cotas. No *warm standby*, ela já
atende tráfego, só que menor, e escala.

O **Route 53** faz o *failover* de DNS com ***health checks***: o registro primário sai quando o
*health check* falha, e o secundário passa a responder. O TTL do registro e o *cache* dos clientes entram
no RTO.

## A replicação de cada serviço, e o que ela garante

Conferido em 10 nov 2026:

| Serviço | Replicação entre regiões | O que ela garante |
| --- | --- | --- |
| Aurora | **Aurora Global Database** | RPO **tipicamente em segundos** e RTO **na ordem de minutos**, pela documentação. No Postgres, o parâmetro `rds.global_db_rpo` limita o atraso, ao custo de segurar a escrita na primária |
| DynamoDB | ***Global tables*** | MREC: eventual, a última escrita vence. MRSC: forte, mas em três regiões e sem transações (marco 07) |
| S3 | **Replicação entre regiões**, com o **RTC** opcional | o RTC tem **SLA de 99,9% dos objetos em 15 minutos** (a meta de projeto é 99,99%). Não vale acima da cota de 1 Gbps de replicação |

**Replicação assíncrona significa RPO maior que zero.** Na falha da região, o que foi confirmado na
primária e ainda não chegou à secundária se perde, ou fica preso até a primária voltar. Para o ledger,
isso é dinheiro: a conciliação (`ledger-e-contabilidade/08`) precisa achar e repor esse buraco. A
replicação por log e o atraso dela estão em `dados-distribuidos/02`. O Kafka entre regiões é de `kafka/12`,
e o RPO e o RTO como contrato são de `dados-distribuidos/12`.

## Células e *shuffle sharding*

Uma **célula** é uma cópia completa e independente do serviço, atendendo uma fatia dos clientes. Uma falha,
um *deploy* ruim ou um cliente abusivo derruba uma célula, não o serviço. O ***shuffle sharding*** dá a
cada cliente uma combinação de células (ou de nós), de modo que dois clientes quase nunca compartilham
todas: o abuso de um atinge poucos outros. O particionamento por trás disso é o de `dados-distribuidos/03`.

## *Game day*

O DR que nunca foi exercitado não existe. O **AWS Fault Injection Service** (FIS) tem um cenário pronto de
**queda de energia de uma AZ**: para as instâncias da AZ, bloqueia a criação de novas, termina os nós do
ElastiCache e força o *failover* do RDS. Com o ***zonal autoshift*** ligado, o tráfego sai da AZ cinco
minutos depois do início.

Sem conta, o *game day* é local: derrubar "uma AZ" (os processos de uma metade do serviço) durante uma
carga e medir. O post-mortem de uma página é o de `system-design/13`.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Availability Zones | Availability Zones | o conceito é o mesmo; o NAT Gateway da AWS é zonal, e um só é ponto único |
| Região pareada | não há par fixo | na AWS, a região secundária é escolha sua, assim como a cota dela |
| Azure Site Recovery | AWS Elastic Disaster Recovery, ou a replicação de cada serviço | numa arquitetura gerenciada, o DR é a soma da replicação de cada serviço |
| Traffic Manager / Front Door | Route 53 com *health checks* (ou Global Accelerator) | o RTO inclui o TTL do registro DNS |
| Chaos Studio | Fault Injection Service | os dois têm cenários de queda de zona prontos |

O marco gêmeo no Azure é `azure-para-backend/10`.

> **O que o laboratório não reproduz.** Um *game day* com processos locais não reproduz a rede de uma AZ, o
> plano de controle sobrecarregado, o TTL do DNS nem as cotas da região secundária. Ele prova que o
> **seu** serviço sobrevive à perda de metade das instâncias sem duplicar pagamento. O comportamento da
> AWS na falha só aparece no FIS, numa conta real.

## Exemplo numa fintech

O plano de DR do `pix-gateway` era *pilot light*, com RTO declarado de 15 minutos. No primeiro exercício na
região secundária, o serviço precisava subir de 2 para 60 tarefas. Ele parou em 20: a cota de tarefas do
Fargate naquela conta e região era a padrão. O pedido de aumento levou dois dias, e o RTO real passou de
uma hora. O plano mudou em três pontos:

- a estratégia passou a ser *warm standby*, com 15% da capacidade rodando o tempo todo;
- as cotas da região secundária entraram no Terraform do DR, com o valor esperado;
- o tempo para escalar entrou na ADR e passou a ser medido a cada exercício.

## Hands-on

**Tutorial.** Escreva a ADR de DR do `fin-platform` como dados (`adr/dr.json`): para cada componente, a
estratégia, o RPO, o RTO, o pico, a capacidade da secundária, o tempo para escalar e o custo mensal.

**Desafio.** O plano de DR do `fin-platform` na AWS, provado por regras e por um *game day* local.

**Invariantes testáveis**

1. **A estratégia entrega o RPO e o RTO declarados.** Um *script* aplica a tabela de regras do time: o RTO
   mínimo de cada estratégia, RPO zero impossível com replicação assíncrona, custo obrigatório. Medido: a
   ADR boa passou. A ruim foi reprovada em 4 linhas: o *pilot light* com RTO de 5 min, o tempo para escalar
   maior que o RTO, o *warm standby* com RPO 0 e um componente sem custo.
2. **Nenhuma AZ única no caminho de pagamento.** O serviço do caminho de pagamento tem sub-redes em pelo
   menos duas AZs e duas tarefas por AZ, e o banco é Multi-AZ. Medido: a mutação "uma AZ" reprovou no
   `terraform test` (1 AZ, contra o mínimo de 2), e o banco sem Multi-AZ, na regra sobre o plano.
3. **A secundária cobre o pico.** No ativo-ativo, a capacidade da outra região é ≥ o pico de
   `system-design/02`. No *pilot light* e no *warm standby*, o tempo para escalar cabe no RTO.
4. ***Game day* local.** Derrubar uma das duas "AZs" no meio de 200 pagamentos mantém o pagamento
   funcionando, sem lançamento em dobro. Medido: **200 de 200 confirmados**, nenhuma falha vista pelo
   cliente, **50 tentativas extras** (as que foram primeiro para a AZ caída) e **200 lançamentos** no banco
   depois de repetir os 200 pagamentos. Sem a segunda tentativa, seriam 50 falhas. O post-mortem tem uma
   página.

Duas armadilhas de ferramenta viraram conteúdo:

- nas `references` da configuração, um condicional traz as sub-redes **dos dois ramos**;
- `subnets` é um *set*, e no plano o `after_unknown` dele é `true` inteiro, sem tamanho.

Por isso, a regra de AZ roda no `terraform test` com `mock_provider`, que gera IDs falsos e resolve a lista
antes de existir conta.

**Complemento.** Com uma conta real e orçamento criado antes, rode o cenário de queda de energia de AZ do
FIS num ambiente de teste com o serviço em três AZs, e meça o tempo até o *zonal autoshift* tirar o
tráfego da AZ. Destrua tudo no fim.

**Checagem**

1. O que é estabilidade estática, e por que ela evita depender do plano de controle na falha?
2. Qual a diferença entre *pilot light* e *warm standby*, em custo e em RTO?
3. Por que replicação assíncrona entre regiões significa RPO maior que zero, e o que isso exige do ledger?
4. Por que uma cota de serviço é risco de DR?

## Principais aprendizados

- Multi-AZ é o padrão. Multi-região é decisão de negócio, com RPO, RTO e custo escritos.
- Estabilidade estática: capacidade já provisionada para perder uma AZ, sem depender do plano de controle.
- Serviços globais têm o plano de controle numa região só: o DR usa o plano de dados deles, não muda
  nada na falha.
- *Backup and restore*, *pilot light*, *warm standby*, ativo-ativo: o custo sobe, o RPO e o RTO caem.
- A replicação entre regiões é assíncrona: Aurora Global com RPO em segundos, S3 RTC com SLA de 99,9% em 15
  min (nov 2026).
- Cotas fazem parte do plano de DR. O *game day* local provou: 200 de 200, nenhum em dobro.
