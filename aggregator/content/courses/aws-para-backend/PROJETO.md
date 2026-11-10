# Projeto guia: `fin-aws`

> Componente do `fin-platform`. O `fin-aws` é o **`fin-platform` desenhado para a AWS**: a infraestrutura
> como código que o descreve, os adaptadores AWS dos serviços que você já construiu e as provas, sobre o
> plano e em emuladores, de que identidade, rede, dados, chaves, resiliência e custo estão certos.

## Por que uma trilha própria

As vagas de sênior analisadas em 7 e 8 nov 2026 pedem **AWS** com mais frequência que Azure: arquitetura,
serviços e boas práticas, serverless, FinOps, CloudWatch e SQS, com a certificação Associate como
diferencial. Uma tabela "conceito → serviço" não sustenta uma entrevista técnica. Esta trilha cobre as
decisões que um backend sênior toma e defende na AWS, sempre ligadas ao `fin-platform` e às trilhas
neutras que já ensinam o conceito.

A tese: quase toda falha grave de um serviço backend na AWS vem de **permissão demais, rede aberta demais
e custo que ninguém modelou**. O engenheiro sênior desenha esses três primeiro e prova, com teste sobre o
plano e com emulador, que estão certos antes de existir uma conta.

Quem vem de Azure encontra, em todo marco, uma tabela **"no Azure → na AWS → o que muda de verdade"**.

## O que você vai construir

| Pasta | Conteúdo |
| --- | --- |
| `infra/` | módulos Terraform: `organizacao`, `iam`, `rede`, `computacao`, `mensageria`, `dados`, `chaves`, `observabilidade` |
| `politicas/` | regras do motor de política sobre o JSON do `plan` e o avaliador didático de IAM |
| `lab/` | *compose* com o `moto` em modo servidor e o DynamoDB Local |
| `adapters/go/` | adaptadores AWS do `ledger-core` (AWS SDK for Go v2) |
| `adapters/java/` | adaptadores AWS do `pix-gateway` (AWS SDK for Java 2.x) |
| `custo/` | o modelo de custo do marco 11 |
| `adr/` | as decisões: emuladores, computação, mensageria, DR |

O `fin-aws` usa o layout de estado, o *backend*, os módulos versionados e a esteira do `fin-iac`
(`terraform-e-iac`). Esta trilha não ensina Terraform.

| Marco | Peça do `fin-aws` |
| --- | --- |
| 01 | Contas e OUs como código, com SCP e *tags* obrigatórias |
| 02 | Papéis e políticas de menor privilégio, provados por política sobre o plano |
| 03 | VPC com saída única e controlada, e *endpoints* privados |
| 04 | A decisão de computação, por ADR, e o serviço no alvo escolhido |
| 05 | Filas, tópicos e barramento, com idempotência e DLQ |
| 06 | Funções com concorrência limitada contra o banco |
| 07 | Banco gerenciado com *failover* e capacidade escritos |
| 08 | *Buckets* fechados, chaves KMS com dono e segredos com rotação |
| 09 | Alarmes a partir dos SLOs e a telemetria por OTel |
| 10 | O plano de DR, com RPO e RTO |
| 11 | O modelo de custo e o capstone |

## Contratos com os vizinhos

Todos simuláveis com *stub*.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | serviços que ganham adaptador AWS | `ledger-core` (`go-fintech`), `pix-gateway` (`spring-boot`) |
| consome | eventos e contratos de mensagem | `pix-stream` (`kafka`), `arquitetura-eventos` |
| consome | SLOs a virar alarmes | `fin-watch` (`observabilidade`) |
| consome | dimensionamento de pool e concorrência | `fin-contention` (`concorrencia-e-recursos`) |
| consome | CIDRs das bordas de outras nuvens | `fin-interconnect` (`conectividade-multicloud`) |
| consome | layout de estado, *backend*, módulos versionados e esteira de IaC | `fin-iac` (`terraform-e-iac`) |
| serve | módulos e políticas reutilizáveis | `fin-devplatform` (`engenharia-de-plataforma`) |

**O que não é:** não exige conta AWS, não é uma *landing zone* completa de produção, não é curso de
certificação e não é catálogo de serviços.

## O laboratório: plano, emulador e, só se quiser, conta

O hands-on tem três camadas, e nenhuma exige conta paga:

1. **Plano, não `apply`.** Terraform com `terraform test` e `mock_provider`, mais a política sobre o JSON
   do `plan` (Conftest, o motor do ADR do `fin-iac`). A maioria dos invariantes se prova aqui: menor
   privilégio, rede fechada, criptografia ligada e *tags* de custo.
2. **Emulador**, para comportamento em execução (ADR abaixo).
3. **Conta AWS real, só como Complemento**, sempre com orçamento e alarme de custo criados antes de
   qualquer `apply` e um `destroy` documentado no fim. Nenhum invariante depende dela.

### ADR: os emuladores (10 nov 2026)

Testado neste ambiente, com Docker:

| Emulador | Versão | Licença | Testado | Papel |
| --- | --- | --- | --- | --- |
| `moto` em modo servidor | 5.2.5 | Apache 2.0 | **SQS FIFO**: deduplicação (3 de 4 mensagens na fila), grupo bloqueado enquanto há mensagem em voo, mensagem de ~1 MiB aceita. **SNS → SQS** com política de filtro: a fila filtrada recebeu 1 de 3. **EventBridge** com regra para SQS: só o evento casado chegou. **S3** com escrita condicional (bloqueio do `terraform-e-iac/02`). Secrets Manager, KMS, IAM e STS | o emulador padrão: SQS, SNS, EventBridge, S3, KMS, Secrets Manager, IAM, STS |
| DynamoDB Local (`amazon/dynamodb-local`) | 3.3.2 | *Amazon DynamoDB Local License Agreement* (proprietária, gratuita, oficial da AWS) | sobe e responde | DynamoDB, com a semântica mais próxima do serviço |
| ElasticMQ (`softwaremill/elasticmq-native`) | imagem atual | Apache 2.0 | FIFO: deduplicação e bloqueio de grupo corretos | alternativa ao `moto` só para SQS |
| SAM CLI (`sam local`) | 1.171.0 | Apache 2.0 | não executado na Fase 0; o `public.ecr.aws` responde | funções locais, nos marcos 04 e 06 |

**Decisão.** O `moto` é o emulador padrão: um processo cobre todos os serviços da trilha, menos o DynamoDB,
e o bloqueio de estado do `fin-iac` já roda nele. O DynamoDB Local fica para o marco 07, porque é a
implementação oficial. O ElasticMQ fica como alternativa para quem já o usa.

**Descartados como padrão:**

- **MinIO.** A edição comunitária entrou em modo de manutenção em 3 dez 2025, e a publicação de imagens e
  binários da comunidade parou antes disso. O S3 do `moto` cobre o que a trilha precisa.
- **LocalStack.** Desde a versão 2026.03.0, a imagem única exige conta e *token*, e o uso comercial é
  pago. Ele fica documentado como **opção** para quem já tem conta, nunca como pré-requisito.

**O que nenhum emulador reproduz** (caixa obrigatória nos marcos com emulador): a avaliação real de
políticas IAM (o `moto` não nega por padrão), cotas e limites de vazão, latência e falhas de rede reais e
o custo.

## Limites e comportamentos conferidos

Conferidos na documentação oficial e nos anúncios da AWS em **10 nov 2026**. O `docs.aws.amazon.com` não
abre neste ambiente, então a conferência foi pelos trechos oficiais devolvidos pela busca (detalhe na
auditoria). Todo número entra no texto com essa data.

| Tema | Valor conferido | Marco |
| --- | --- | --- |
| tamanho máximo de mensagem do SQS | **1 MiB** (1.048.576 bytes) desde ago 2025, era 256 KiB; o *Extended Client* leva cargas maiores por referência ao S3 | 05 |
| SNS | cargas de até 1 MiB desde set 2026 | 05 |
| deduplicação FIFO do SQS | janela de **5 minutos** | 05 |
| vazão FIFO | 300 msg/s sem lote e 3.000 com lote no modo normal; até 70.000 msg/s sem lote no modo de alta vazão (`DeduplicationScope=messageGroup` + `FifoThroughputLimit=perMessageGroupId`); até 120.000 mensagens em voo | 05 |
| ordem FIFO | por `MessageGroupId`; grupos diferentes podem sair fora de ordem | 05 |
| Lambda: tempo máximo | **900 s** (15 min); no Lambda Managed Instances, até 90 min nas invocações assíncronas, e a síncrona continua em 15 min | 06 |
| Lambda: memória | de 128 MB a **10.240 MB**; 1.769 MB equivalem a uma vCPU | 06 |
| Lambda: carga útil | **6 MB** por requisição e resposta na invocação síncrona, **1 MB** na assíncrona | 06 |
| SnapStart | Java 11+, Python 3.12+ e .NET 8+; também em imagem de contêiner (jul 2026). Em Java gerenciado, sem cobrança extra; em Python, .NET e contêiner, cobrança de *cache* e de restauração | 06 |
| identidade de *pod* no EKS | **EKS Pod Identity** é a recomendação; IRSA continua suportado e cabe onde o Pod Identity não chega (Fargate, nós Windows, *cluster* fora do EKS) | 02, 04 |
| consistência do S3 | leitura forte depois de escrita para GET, PUT e LIST, e para mudanças de *tags*, ACL e metadados, desde dez 2020 | 08 |
| X-Ray | SDK e *daemon* em manutenção desde 25 fev 2026; o caminho é OpenTelemetry (ADOT ou Collector), com o *endpoint* OTLP do X-Ray e o Application Signals por cima | 09 |
| AWS Network Firewall | filtragem de saída por domínio pelo SNI, sem ler o conteúdo cifrado; no modelo centralizado com Transit Gateway, o `HOME_NET` precisa incluir os CIDRs dos *spokes* | 03 |
| AWS Fault Injection Service | biblioteca de cenários, com interrupção de energia de uma AZ, conectividade entre regiões e lentidão parcial numa AZ (nov 2025) | 10 |
| Equinix Fabric Cloud Router → AWS | conexão hospedada do Direct Connect, de 50 Mbps a 25 Gbps conforme o *metro*, aceita no console da AWS; sem redimensionamento | adendo da `conectividade-multicloud` |

## Versões

| Ferramenta | Versão conferida (nov 2026) | Licença |
| --- | --- | --- |
| Terraform | 1.17.1 (mínima 1.14, a mesma do `fin-iac`) | BUSL 1.1 |
| Provedor `hashicorp/aws` | 6.72.0 | MPL 2.0 |
| AWS SDK for Go v2 | `aws-sdk-go-v2` 1.47.8; `service/sqs` 1.52.11, `service/dynamodb` 1.73.2, `service/s3` 1.114.9 | Apache 2.0 |
| AWS SDK for Java 2.x | BOM 2.57.12 | Apache 2.0 |
| `moto` | 5.2.5 | Apache 2.0 |
| DynamoDB Local | 3.3.2 | licença própria da AWS |
| Conftest (OPA) | 0.71.1 | Apache 2.0 |
| SAM CLI (opcional) | 1.171.0 | Apache 2.0 |
| Docker, Go e JDK | os do catálogo | — |

**Não precisa:** conta AWS nem LocalStack.

## Mapa para o exame AWS Certified Solutions Architect – Associate (SAA-C03)

O guia vigente é o do SAA-C03, com quatro domínios. A trilha não substitui o material oficial.

| Domínio do exame | Peso | Marcos |
| --- | ---: | --- |
| Design Secure Architectures | 30% | 01, 02, 03, 08 |
| Design Resilient Architectures | 26% | 05, 07, 10 |
| Design High-Performing Architectures | 24% | 04, 06, 07, 09 |
| Design Cost-Optimized Architectures | 20% | 11, com custo em 04, 06 e 07 |

**O que a trilha não cobre do exame:** migração e transferência de dados (Snow Family, DataSync,
Transfer Family), analítica (Athena, EMR, Glue, Kinesis em profundidade), serviços de borda além do
básico (CloudFront, Global Accelerator) e armazenamento de arquivos (EFS, FSx).

## Regra das horas

A trilha soma 655 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 655 x 2 / 60 = 21,8, arredondado para **22 horas**.
