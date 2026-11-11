# Auditoria — trilha `aws-para-backend`

AWS para o backend sênior de fintech: 11 marcos, 655 minutos, `estimatedHours: 22`, 54 questões, com o
projeto guia `fin-aws`. A trilha vem depois da `terraform-e-iac` e usa o `fin-iac` como base. Este
documento registra o que foi conferido em cada fase, e como.

## 1. Fase 0 — conferências, emuladores e esqueleto

### Limites e comportamentos (10 nov 2026)

O `docs.aws.amazon.com` não abre neste ambiente: o *proxy* recusa o domínio. Os itens marcados
"conferir" no plano foram conferidos pelos trechos de páginas oficiais da AWS que a busca devolveu,
restrita a `aws.amazon.com` e `docs.aws.amazon.com`. Os valores estão no `PROJETO.md`, seção "Limites e
comportamentos conferidos". Os pontos que mudam o que o plano supunha:

- **Mensagem do SQS: 1 MiB, não 256 KiB.** O aumento é de ago 2025 ("Amazon SQS increases maximum message
  payload size to 1 MiB"). O SNS chegou a 1 MiB em set 2026. O marco 05 não pode usar o número antigo.
- **Carga assíncrona do Lambda: 1 MB.** A página de cotas e a referência da API `Invoke` dão 6 MB na
  invocação síncrona e 1 MB na assíncrona.
- **Lambda Managed Instances.** Até 90 min nas invocações assíncronas e por *event source mapping*
  (set 2026); a síncrona continua em 15 min. O marco 06 cita o limite padrão de 900 s e a exceção.
- **SnapStart.** Cobre Java 11+, Python 3.12+, .NET 8+ e, desde jul 2026, imagem de contêiner. É sem
  custo extra só para Java gerenciado.
- **IRSA × EKS Pod Identity.** A recomendação atual da AWS é o Pod Identity. O IRSA continua para
  Fargate, nós Windows e *clusters* fora do EKS.
- **X-Ray.** O SDK e o *daemon* estão em manutenção desde 25 fev 2026, o mesmo fato registrado na
  auditoria do adendo de sinais. O marco 09 trata o OpenTelemetry como o caminho, com o Application
  Signals por cima.
- **FIFO.** Deduplicação de 5 minutos; 300 msg/s sem lote e 3.000 com lote no modo normal; até 70.000
  msg/s no modo de alta vazão; 120.000 mensagens em voo.
- **S3.** Leitura forte depois de escrita desde dez 2020, para GET, PUT, LIST e mudanças de *tags*, ACL
  e metadados.
- **Network Firewall.** Filtra por domínio pelo SNI. No modelo centralizado, o `HOME_NET` precisa dos
  CIDRs dos *spokes*.
- **FIS.** Biblioteca de cenários, com AZ sem energia e lentidão parcial (nov 2025).
- **Equinix FCR → AWS.** Conexão hospedada do Direct Connect, de 50 Mbps a 25 Gbps conforme o *metro*,
  sem redimensionamento. É a base do adendo da `conectividade-multicloud` (§13 do plano).

### Emuladores, testados aqui

Docker neste ambiente, `boto3` como cliente:

| Teste | `moto` 5.2.5 | ElasticMQ (imagem atual) |
| --- | --- | --- |
| FIFO: o mesmo `MessageDeduplicationId` duas vezes | deduplicou (3 mensagens na fila de 4 enviadas), mas devolveu `MessageId` diferente no segundo envio | deduplicou, com o mesmo `MessageId` |
| FIFO: 3 recebimentos de 1 mensagem, sem apagar, com `a1 a2 a3` no grupo A e `b1` no B | `a1`, `b1`, vazio: o grupo A fica bloqueado com `a1` em voo | igual |
| mensagem de ~1 MiB | aceitou | aceitou |
| SNS → SQS com `FilterPolicy` | a fila filtrada recebeu 1 de 3; a sem filtro, 3 | — |
| EventBridge com regra para SQS | só o evento casado chegou | — |
| S3 com `If-None-Match: *` | `PreconditionFailed` (conferido na `terraform-e-iac`) | — |

O DynamoDB Local 3.3.2 subiu e respondeu. A licença dele é a *Amazon DynamoDB Local License Agreement*,
lida no `LICENSE.txt` da imagem: proprietária e gratuita.

**Decisão (ADR no `PROJETO.md`):**

- **Padrão:** `moto` para tudo, mais o DynamoDB Local no marco 07.
- **Alternativa para o SQS:** ElasticMQ.
- **Descartados como padrão:** o MinIO, cuja edição comunitária está em manutenção desde 3 dez 2025, e o
  LocalStack, que desde a 2026.03.0 exige conta e *token* e cobra o uso comercial. O LocalStack fica
  documentado como opção.

Diferença que vira conteúdo do marco 05: os dois emuladores deduplicam, mas o `moto` devolve um
`MessageId` novo para o envio duplicado. Um teste que compara `MessageId` para provar a deduplicação passa
num emulador e falha no outro. O invariante tem de contar as mensagens recebidas.

### SDKs e ferramentas

- **AWS SDK for Go v2:** 1.47.8 (`service/sqs` 1.52.11, `service/dynamodb` 1.73.2, `service/s3` 1.114.9),
  lido no *proxy* de módulos Go.
- **AWS SDK for Java 2.x:** BOM 2.57.12, lido no Maven Central.
- **SAM CLI:** 1.171.0, do PyPI. O `public.ecr.aws` responde aqui, então o `sam local` deve conseguir
  baixar as imagens de Lambda. Isso fica para a Fase 2.
- **`terraform test` com `mock_provider`, Conftest e o provedor `aws` 6.72.0:** já provados na
  `terraform-e-iac` (§1 e §2 daquela auditoria). O motor de política é o Conftest, o mesmo do ADR do
  `fin-iac`.

### Exame

O guia vigente é o do **SAA-C03**, com quatro domínios:

- Secure, 30%;
- Resilient, 26%;
- High-Performing, 24%;
- Cost-Optimized, 20%.

O plano pedia "conferir versão e pesos"; os pesos do SAA-C02 eram outros. A tabela do `PROJETO.md` mapeia
cada domínio para os marcos e diz o que a trilha não cobre.

### URLs das fontes

- **Financial Services Industry Lens:** existe no caminho do plano
  (`wellarchitected/latest/financial-services-industry-lens/...`), atualizada em jan 2026.
- **SDK Go:** `aws.github.io/aws-sdk-go-v2/docs/`, a URL do plano, foi trocada pelo guia oficial
  `docs.aws.amazon.com/sdk-for-go/v2/developer-guide/`.
- **Exame:** o índice genérico `examguides/` foi trocado pela página do SAA-C03.
- As demais URLs do `course.yaml` são as do plano, em domínios oficiais da AWS e do registro do
  Terraform.

### Esqueleto

- **`course.yaml`:** o do §6 do plano, com as duas URLs acima trocadas e a menção a esta auditoria no
  comentário das horas. A categoria é `"Cloud"`, a mesma da `terraform-e-iac`.
- **11 stubs válidos.** O frontmatter tem `id`, `title`, `summary` e `estimatedMinutes`, somando 655 min,
  e o 11 já tem um `## Capstone` mínimo. `reviewedAt` e `reviewEvery: 6m` entram com o conteúdo de cada
  bloco.
- **`PROJETO.md`:**
  - o porquê da trilha e as peças por marco;
  - os contratos com os vizinhos;
  - as três camadas do laboratório e o ADR dos emuladores;
  - a tabela de limites com data, as versões e o mapa do SAA-C03.
- **`GLOSSARIO.md` mínimo:** 4 verbetes (SCP, EKS Pod Identity, `MessageGroupId` e *visibility
  timeout*). A meta da Fase 4 é ≥30, sem repetir verbetes de trilhas donas.
- **`capstones.yaml`:** entra o `fin-aws`, com
  `depends_on: [fin-iac, ledger-core, pix-gateway, pix-stream, fin-watch, fin-contention,
  fin-interconnect]`, as linhas "consome" do `PROJETO.md`. A aresta "serve" para o `fin-devplatform` entra
  na Fase 4.
- **`bridges-planned.yaml`:** sai a entrada `aws-para-backend/08`. As pontes dos marcos 02 e 03 da
  `terraform-e-iac` agora resolvem para o stub.
- **`conceitos.yaml`:** *envelope encryption* já tem dono em `seguranca-aplicacao/09`, e a trilha não o
  registra. Os candidatos próprios (avaliação de política IAM e *VPC endpoint*) entram na Fase 4, se forem
  citados fora do dono.

## 2. Fase 1 — Bloco A (marcos 01 a 03)

Os três marcos têm:

- os cinco blocos de `## Hands-on`;
- a tabela "No Azure → na AWS";
- `reviewedAt: 2026-11-10` e `reviewEvery: 6m`;
- 16 questões (4 + 6 + 6), com a resposta certa distribuída e nunca a opção mais longa.

Os laboratórios usaram Terraform 1.17.1, o provedor `aws` 6.72.0 e Conftest 0.71.1, sem conta AWS. O
`plan` roda com `skip_credentials_validation` e `skip_requesting_account_id`, sem chamada a conta real.

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 01 | `plan` de OUs, contas, SCP de regiões e anexo | `6 to add`, sem conta |
| 01 | política: conta fora de OU com SCP (segue a referência `parent_id` na configuração do plano) | a conta presa à raiz reprovou |
| 01 | política: provedor fora das regiões aprovadas | a *fixture* em `us-west-2` reprovou |
| 01 | política de *tags* lendo só `after.tags_all` | **passou calada** na *fixture* sem `default_tags`: o `tags_all` vira `after_unknown`. Com a regra que trata o desconhecido como ausente, 5 recursos reprovaram, e o plano com `default_tags` passou |
| 02 | avaliador didático em Go (identidade, recurso, SCP, *boundary*, `Deny`) | 9 casos tirados das páginas "Policy evaluation logic" e "Cross-account policy evaluation logic" passaram, e a matriz do `pix-gateway` também; com curinga em `Resource`, o avaliador deu `Allow` na fila de estornos |
| 03 | `plan` da VPC em três AZs (18 recursos), com duas violações de propósito | `aws_security_group.app aceita 0.0.0.0/0 na porta 22` e `s3 sem gateway endpoint com política restrita` |
| 03 | mutação: rota para o *internet gateway* na tabela das sub-redes de aplicação | reprovou, depois de corrigir a regra (abaixo) |
| 03 | sobreposição de CIDR com `net.cidr_intersects` | `10.40.0.0/16` contra uma borda `10.40.128.0/17` reprovou; contra `10.20.0.0/16` e `10.30.0.0/16`, passou |

**Armadilha medida no 03.** No JSON do plano, o `route` do `aws_route_table` aparece na configuração como
um atributo com uma lista de `references`, e não como uma lista de blocos. A primeira versão da regra
procurava a lista de blocos, e a mutação passou. Corrigida a regra, a mutação reprovou. O texto do marco
registra o caso como argumento para a *fixture* que faz cada regra falhar.

### Números conferidos (10 nov 2026)

Os números vieram de trechos de páginas oficiais que a busca devolveu (`aws.amazon.com/vpc/pricing`,
`nat-gateway-pricing`, *blogs* oficiais de transferência de dados):

- NAT Gateway em `us-east-1`: US$ 0,045 por hora e US$ 0,045 por GB processado;
- transferência entre AZs: US$ 0,01 por GB em cada direção;
- *gateway endpoint*: sem custo;
- *interface endpoint*: cobrado por hora e por GB. O valor exato não é citado no texto, porque a busca só
  trouxe o número de um *blog*.

### Lógica de avaliação do IAM

Conferida nas páginas oficiais (entre contas, *permissions boundary*):

- na mesma conta, basta um `Allow` de identidade ou de recurso;
- entre contas, os dois lados precisam permitir;
- o `Deny` explícito vence;
- SCP, RCP, *boundary* e *session policy* precisam permitir;
- uma política de recurso que nomeia um usuário ou uma sessão não é limitada pela negação implícita do
  *boundary*, e uma que nomeia o ARN do papel é.

O marco 01 registra que a SCP não limita a conta de gerenciamento.

### Pontes

- `arquitetura-de-solucoes/05`;
- `system-design/13`;
- `entrega-continua-e-devops/06`;
- `seguranca-aplicacao/08`, `/10` e `/11`;
- `kubernetes/10` e `/11`;
- `conectividade-multicloud/02` e `/08`.

## 3. Fase 2 — Bloco B (marcos 04 a 06)

Os três marcos têm:

- os cinco blocos de `## Hands-on`;
- a tabela "No Azure → na AWS";
- a caixa "o que o emulador não reproduz" nos dois marcos com emulador (05 e 06);
- `reviewEvery: 6m`;
- 16 questões (4 + 6 + 6), com a resposta certa distribuída e nunca a opção mais longa.

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 04 | regras sobre a *task definition* e o *target group* (Terraform 1.17.1, provedor `aws` 6.72.0, sem conta) | o plano bom passou nas 6. A *fixture* ruim reprovou em 4: papel de execução usado como *task role*, sistema de arquivos gravável, imagem `:latest` e `stopTimeout` 30 contra o *drain* de 30 s do `spring-boot/12`. O `container_definitions` vem como *string* JSON dentro do JSON do plano e precisa de `json.unmarshal` |
| 05 | *visibility timeout* de 1 s e `maxReceiveCount` 3, no `moto` e no ElasticMQ | contagens de recebimento 1, 2 e 3, e depois a mensagem na DLQ, nos dois |
| 05 | `ChangeMessageVisibility` de 1 s para 5 s | a mensagem não reapareceu, nos dois |
| 05 | *redrive* (`StartMessageMoveTask`) | o `moto` 5.2.5 respondeu **500**. No ElasticMQ, a fila foi de 0 para 1 e a DLQ de 1 para 0, e o **`ApproximateReceiveCount` voltou a 1**. Por isso o Tutorial do 05 usa o ElasticMQ, e a idempotência é pela chave de negócio |
| 05 | FIFO, SNS com filtro e EventBridge | os da Fase 0 (§1), citados no texto |
| 06 | 200 "instâncias" abrindo conexão ao mesmo tempo num Postgres 17 com `max_connections` 100 | conexão direta: **100 recusadas** (`FATAL: sorry, too many clients already`), pico de 100. Com um limite de 20: 0 recusadas, pico de 20 |

O contêiner do Postgres perdeu o mapeamento de porta quando o Docker do ambiente reiniciou, e a porta
55432 ficou presa por um processo antigo. O laboratório passou para a 55433, e as medições acima foram
feitas nela.

### Números conferidos (10 nov 2026)

Conferidos nos trechos das páginas oficiais que a busca devolveu:

- **Padrões de *deploy*:** *deregistration delay* do ALB de 300 s (faixa de 0 a 3.600); `stopTimeout` do
  ECS de 30 s, com máximo de 120 s no Fargate.
- **Invocação assíncrona do Lambda:** mais duas tentativas (1 min, depois 2 min), `MaximumRetryAttempts`
  de 0 a 2 e `MaximumEventAgeInSeconds` de 60 a 21.600. Estrangulamentos e erros de sistema são refeitos
  por até 6 h.
- ***Event source mapping* de SQS:** concorrência máxima de 2 a 1.000 por fonte; a concorrência reservada
  deve ser ≥ a soma; escala até 1.250 instâncias; cota padrão da conta de 1.000; *visibility timeout* de
  pelo menos 6 vezes o *timeout* da função.
- **Preços de Lambda e Fargate:** a busca só trouxe valores arredondados de um exemplo da documentação de
  Savings Plans, então **o marco 06 não cita preço**. Ele traz a fórmula e manda usar a calculadora
  oficial com o preço do dia, conforme a convenção da trilha (§3 do plano).

### Pontes

- `kubernetes/06`, `/07` e `/14`;
- `spring-boot/12`;
- `entrega-continua-e-devops/05`;
- `kafka/10`;
- `arquitetura-eventos/08` e `/09`;
- `kotlin-backend/07`;
- `concorrencia-e-recursos/07`;
- `arquitetura-de-solucoes/05`.

## 4. Fase 3 — Bloco C (marcos 07 e 08)

Marcos escritos: 07 (dados gerenciados: RDS, Aurora e DynamoDB) e 08 (S3, KMS e segredos). Os dois saem
de `wantNoSection`, e os *goldens* de seções sobem para 254/301/293/284/299. O quiz do 07 tem 4 questões;
o do 08, que é crítico, tem 6. A opção correta nunca é a estritamente mais longa (conferido por *script*).

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 07 | 50 `PutItem` concorrentes com a mesma chave e `attribute_not_exists`, no DynamoDB Local 3.3.2 | **1 sucesso, 49 `ConditionalCheckFailedException`**, 1 item na tabela |
| 07 | `TransactWriteItems` com débito de saldo e registro de idempotência; repetição da chave e débito sem saldo | as duas canceladas com `ConditionalCheckFailed` na ação certa; saldo em 70 e a segunda chave não gravada |
| 07 | Postgres reiniciado com o *pool* aberto, 20 gravações depois da volta | sem verificação de conexão: 4 falhas (uma por conexão morta); com verificação: 1. Nenhuma confirmada se perdeu, e não foi preciso reiniciar a aplicação |
| 08 | envelope com `GenerateDataKey` do `moto` 5.2.5 e AES-GCM local | o objeto não continha o texto em claro; contexto certo abriu, contexto errado e ausência de contexto deram `InvalidCiphertextException`. **O `moto` exige o contexto**, mas não avalia a política de chave |
| 08 | plano com 7 recursos (BPA da conta, *bucket*, BPA, SSE-KMS, política de *bucket*, chave, política de chave) contra `politicas/dados.rego` | o plano bom passou. A *fixture* `extratos` (sem BPA no *bucket*, sem SSE-KMS e sem política de TLS) reprovou em **3 regras**. A mutação com o papel da aplicação recebendo `kms:*` sem condição reprovou nas **duas regras de KMS** |

### Números conferidos (10 nov 2026)

- **RDS:** *failover* de 60 a 120 s no Multi-AZ de instância e abaixo de 35 s no Multi-AZ de *cluster*.
- **DynamoDB:** transação de até 100 ações e 4 MB, custo dobrado, capacidade consumida mesmo cancelada;
  item de até 400 KB. *Global tables* MRSC disponível desde jun 2025: exatamente três regiões (ou duas e
  uma testemunha), sem transações, sem TTL e sem LSI, modo fixo na criação.
- **S3:** consistência forte desde dez 2020; *Block Public Access* ligado e ACLs desligadas por padrão em
  *bucket* novo desde abr 2023. URL pré-assinada: até 7 dias com usuário IAM (SigV4); com credencial
  temporária, expira junto com ela. Object Lock *compliance*: nem o *root* apaga ou encurta; o modo não
  muda.
- **KMS:** rotação automática de 365 dias por padrão, configurável de 90 a 2.560 (abr 2024), sob demanda
  disponível; só chaves simétricas com material do KMS; US$ 1 por mês por rotação, até a segunda.
- **Segredos:** Secrets Manager a US$ 0,40 por segredo por mês e US$ 0,05 por 10.000 chamadas; Parameter
  Store padrão sem custo, avançado a US$ 0,05 por parâmetro por mês.

**Correção durante a escrita.** O primeiro texto do 07 dizia que *global tables* resolvem conflito pela
última escrita, sem ressalva. O modo MRSC, de consistência forte, mudou isso; o texto, o quiz e a checagem
agora dizem por que nem o MRSC serve ao saldo do ledger (ele não aceita transações).

**Para a revisão independente (Fase 5).** Os prazos de espera da exclusão de chave (7 a 30 dias) e a
criptografia padrão SSE-S3 desde jan 2023 entraram no 08 como fatos estáveis; a revisão confere os dois
nas páginas oficiais, junto com os limites dos marcos 02, 03, 05, 06 e 08.

### Pontes

- `dados-distribuidos/07`, `/09`, `/12`, `/13`, `/16` e `/18`;
- `concorrencia-e-recursos/07`;
- `seguranca-aplicacao/09` e `/10`;
- `ledger-e-contabilidade/08`;
- `terraform-e-iac/03`.

## 5. Fase 4 — Bloco D (marcos 09 a 11), capstone, glossário e conceitos

Marcos escritos: 09 (observabilidade), 10 (resiliência e DR) e 11 (FinOps e capstone). Com eles,
`wantNoSection` volta a ser vazio, e os *goldens* de seções sobem para 257/304/296/287/302. Os três quizzes
têm 4 questões, e a opção correta nunca é a estritamente mais longa (conferido por *script*, depois de
rebalancear 10 das 12). A trilha soma **54 questões** (4 + 6 + 6 + 4 + 6 + 6 + 4 + 6 + 4 + 4 + 4).

### Medições

| Marco | Experimento | Resultado |
| --- | --- | --- |
| 09 | plano com 3 filas, tabela, função, 2 grupos de *log*, trilha do CloudTrail e alarmes, contra `politicas/operacao.rego` com os SLOs em `slos.json` | a primeira versão do plano bom foi **reprovada**: `SLO ledger-lancamento-disponibilidade sem alarme`. Depois do alarme, 7 de 7. A mutação sem os alarmes de operação e com um grupo sem retenção reprovou em **5 regras**; a trilha de uma região, em 1 |
| 10 | ADR de DR como dados contra `regras_dr.py` | a boa passou; a ruim reprovou em **4 linhas** (*pilot light* com RTO de 5 min, tempo para escalar maior que o RTO, *warm standby* com RPO 0, componente sem custo) |
| 10 | "nenhuma AZ única": `terraform test` com `mock_provider` e regra sobre o plano | bom: passou. Mutação "uma AZ": o `terraform test` falhou (1 AZ, mínimo 2) e a regra reprovou o banco sem Multi-AZ |
| 10 | *game day*: duas "AZs" em processos, banco compartilhado, 200 pagamentos com chave idempotente, uma AZ derrubada no 100º | **200 de 200** confirmados, nenhuma falha vista pelo cliente, **50 tentativas extras**, **200 lançamentos** depois de repetir os 200 |
| 11 | modelo de custo (`custo.py`) lendo o plano, os preços datados e um perfil de 30 milhões de transações/mês | com *endpoints*: US$ 692,05 em rede e *logs*, **US$ 0,0231 por mil**; *logs* US$ 530 contra NAT US$ 112. Sem os *gateway endpoints*: NAT de **US$ 13,50 para US$ 261,00**, custo por mil US$ 0,0313, e o teste reprovou. Sem orçamento: reprovou |

**Duas armadilhas de ferramenta no marco 10, que viraram conteúdo:**

- nas `references` da configuração, um condicional traz as sub-redes dos **dois** ramos; a primeira regra
  contou 3 AZs na mutação de uma AZ;
- `subnets` do `aws_ecs_service` é um *set*, e o `after_unknown` dele é `true` inteiro, sem tamanho.

Por isso, a regra de AZ foi para o `terraform test` com `mock_provider`, e o `.rego` ficou com o
Multi-AZ do banco.

A paridade de `trace_id` do invariante 5 do marco 09 reutiliza a medição do envio duplo de
`observabilidade/05` (AUDITORIA-adendo-sinais §1: 200 de 200 nos dois destinos), sem um laboratório novo.

### Números conferidos (10 nov 2026)

- **X-Ray:** SDKs e *daemon* em manutenção desde 25 fev 2026, fim do suporte em 25 fev 2027. *Traces*
  por OTLP no X-Ray com SigV4 desde nov 2024; métricas OTel no CloudWatch anunciadas em jun 2026.
- **CloudWatch Logs:** retenção de 1 dia a 10 anos, ou para sempre (o padrão). Ingestão Standard
  US$ 0,50/GB e Infrequent Access US$ 0,25/GB (us-east-1, primeiros 10 TB); armazenamento igual nas duas.
  A Infrequent Access não tem *metric filters*.
- **Aurora Global Database:** RPO "tipicamente em segundos" e RTO "na ordem de minutos", pela
  documentação. O "abaixo de 1 segundo" de fontes de terceiros **não** entrou.
- **S3 RTC:** o SLA é de **99,9%** dos objetos em 15 minutos (a meta de projeto é 99,99%). Uma busca
  trazia "SLA de 99,99%", e foi corrigida pela página do SLA. Não vale acima da cota de 1 Gbps.
- **FIS:** cenário de queda de energia de AZ; com *zonal autoshift*, o tráfego sai cinco minutos depois.
- **Serviços globais:** plano de controle numa única região e plano de dados distribuído (*whitepaper*
  Fault Isolation Boundaries). Para o DNS público do Route 53, a região é us-east-1. Para o IAM, a região
  **não** foi confirmada, e o texto não a nomeia.
- **Rede:** NAT US$ 0,045/h e US$ 0,045/GB (já no marco 03); tráfego entre AZs US$ 0,01/GB por sentido.
- ***Spot*:** aviso de dois minutos antes de tomar a instância. Os percentuais de desconto de *Savings
  Plans* e *spot* **não** foram conferidos, e o marco não os cita.

### Glossário, conceitos e capstone

- **`GLOSSARIO.md`:** de 4 para **50 verbetes**, nas seções Fundação, Identidade, Rede, Computação e
  funções, Mensageria, Dados e chaves, e Operar. Os conceitos neutros continuam nas trilhas donas. O
  primeiro rascunho tinha 9 verbetes com "marcos NN e MM"; o teste de cobertura exige "marco NN", e eles
  foram corrigidos (50/50).
- **`conceitos.yaml`:** a trilha passa a ser dona de dois conceitos citados fora dela:
  - `aws-secrets-manager` (dono `aws-para-backend/08`), ligado em `kubernetes/03` e `terraform-e-iac/03`;
  - `adot` (dono `aws-para-backend/09`), ligado em `observabilidade/05`.

  Outros candidatos (estabilidade estática, Object Lock, SCP) não são citados fora da trilha e ficaram de
  fora. *Pilot light* é ensinado em `system-design/13`, e partição quente em `dados-distribuidos`.
- **`capstones.yaml`:** o `fin-devplatform` passa a depender do `fin-aws`.
- **Capstone:** no marco 11, com a entrega de 11 itens (um por marco), 9 critérios de pronto, todos sem
  conta, e a pergunta final do plano.

### Para a revisão independente (Fase 5)

Além dos marcos 02, 03, 05, 06 e 08, conferir:

- o tráfego entre AZs (US$ 0,01/GB por sentido): várias fontes concordam, mas a página oficial de
  transferência do EC2 não foi aberta;
- a espera de exclusão de chave KMS (7 a 30 dias) e a criptografia padrão SSE-S3 desde jan 2023 (§4).

### Pontes

- `observabilidade/05`, `/06`, `/12` e `/16`;
- `kubernetes/12`;
- `system-design/02`, `/13` e `/14`;
- `dados-distribuidos/02`, `/03` e `/12`;
- `kafka/12`;
- `ledger-e-contabilidade/08`;
- `engenharia-de-plataforma/08`.

## 6. Fase 5 — auditoria e revisão independente

### Critérios do plano

| Critério | Resultado |
| --- | --- |
| Σ `estimatedMinutes` = 655 e `estimatedHours` = 22 | 655 min; 655 × 2 / 60 = 21,8 → 22 |
| 54 questões | 54 (6 nos marcos críticos 02, 03, 05, 06 e 08; 4 nos demais) |
| ≥ 30 verbetes | 50, com 50/50 resolvidos para um marco |
| 11 marcos com os cinco blocos de Hands-on, tabela Azure → AWS, exemplo e aprendizados | todos |
| caixa "o que o emulador não reproduz" onde há emulador | 02, 05, 06, 07, 08, 09, 10, 11; os marcos 01, 03 e 04 não usam emulador |
| Complemento com orçamento antes e *destroy* no fim | os 11 |
| `reviewEvery: 6m` | os 11 |
| nenhuma invariante depende de conta; CI sem `AWS_*` real | os *workflows* não usam variável `AWS_*` nem segredo; os laboratórios usam `test`/`test`, emuladores e `mock_provider` |
| pontes resolvem; `go test ./...` e testes do front verdes | verdes |

Sobre "todo módulo Terraform passa em `validate` e `test`": o repositório não contém o código do `fin-aws`,
que é construído por quem faz a trilha. Os módulos dos laboratórios (marcos 01 a 11) foram planejados com o
Terraform 1.17.1 e o provedor `aws` 6.72.0, e o do marco 10 passou em `terraform test` com
`mock_provider` (§5).

### Revisão independente (marcos 02, 03, 05, 06 e 08)

Um revisor separado conferiu cada limite, preço, prazo e comportamento contra a documentação oficial da
AWS, por busca restrita a `docs.aws.amazon.com` e `aws.amazon.com`. O WebFetch desses domínios estava
bloqueado na rede da sessão, então ele trabalhou com os trechos que a busca devolveu.

A maior parte confere: os limites do Lambda, do FIFO, do SQS e do KMS, os preços do NAT, do Secrets
Manager e do Parameter Store, a URL pré-assinada, o Object Lock e as datas do S3. Também conferem dois
pontos que estavam pendentes na §4: a espera de 7 a 30 dias para apagar uma chave e o SSE-S3 padrão desde
5 jan 2023. O tráfego entre AZs a US$ 0,01/GB por sentido, pendente na §5, confere nas páginas de preço da
VPC e do EFS.

Achados e o que foi feito:

| # | Marco | Achado | Correção |
| --- | --- | --- | --- |
| A1 | 02 | "o corte por SCP vale para a conta toda, inclusive o raiz" omitia que a conta de gerenciamento não é afetada | o texto agora diz *root* das contas-membro, e a conta de gerenciamento fora |
| A2 | 02 | a lógica de avaliação não citava a RCP (*resource control policy*), que também corta | RCP na tabela de tipos, no passo 2 e no aprendizado. O avaliador didático em Go continua sem RCP; é um recorte do *tutorial*, não da lógica |
| A3 | 06 | "um evento por ambiente, sempre" ignorava a multiconcorrência do Lambda Managed Instances | ressalva no modelo de execução e na tabela Azure → AWS |
| B1 | 05 | 70.000/s na FIFO de alta vazão vale só em N. Virginia, Oregon e Irlanda | o texto agora traz as regiões e os 4.500/s de São Paulo |
| B2 | 03 | a defesa contra SNI forjado citava o DNS Firewall, que não confere a conexão | Route 53 Resolved IP Validation do Network Firewall (out 2026) e bloqueio de DNS alternativo |
| B3 | 05 | o SNS a 1 MiB omitia o padrão de 256 KiB e as restrições de assinantes | ressalva acrescentada |
| B4 | 05 | "o *redrive* zera o contador" foi medido só no ElasticMQ; na AWS não está documentado | texto, aprendizado, invariante, quiz e glossário atribuem a medição ao ElasticMQ; a conclusão (o contador não serve para idempotência) fica mais forte, não mais fraca |
| B5 | 06 | os 90 min do Managed Instances valem também para *event source mapping* | acrescentado, com 5.400 s e set 2026 |
| B6 | 08 | a rotação sob demanda aceita material importado desde jun 2025 | separadas a automática e a sob demanda |
| C2 | 03 | quiz: no ElastiCache baseado em nós, só o lado da aplicação paga entre AZs | explicação ajustada |
| C3 | 08 | o parâmetro avançado paga também por interação de API | acrescentado |
| C4 | 06 | a cota de 1.000 começa menor em contas novas | acrescentado |
| C5 | 08 | o Object Lock *compliance* permite estender a retenção | acrescentado |
| C1 | 03 | a documentação mostra também um NAT Gateway regional | **não** aplicado: não conferi o modelo de cobrança, e o preço do texto continua certo. Fica para a próxima revisão (`reviewEvery: 6m`) |

O revisor não achou fonte para a interação entre *permissions boundary* e política de recurso que nomeia a
sessão (marco 02). Conferi depois em `access_policies_boundaries.html`: a política de recurso que nomeia o
ARN do papel é limitada pela negação implícita do *boundary*, e a que nomeia a sessão de papel não. O texto
do marco confere e ficou como está.

**Lição de processo.** Três dos seis achados do grupo B são lançamentos de 2025 e 2026: a multiconcorrência e
os 90 min do Managed Instances, o Resolved IP Validation e a rotação de material importado. Eles mudaram o
comportamento depois que o texto foi conferido na Fase 0. É o argumento do `reviewEvery: 6m` desta trilha.

## 7. Adendo à `conectividade-multicloud` (§13 do plano)

Sem marco novo. Em `conectividade-multicloud/04`:

- **Seção "E se a terceira nuvem for a AWS: Direct Connect".** Cobre a conexão dedicada × hospedada, a VIF
  (privada, de trânsito, pública) e o Direct Connect Gateway. Traz o ASN padrão 64512, que conflita com o
  Transit Gateway, e o SLA de 99,99% no modelo de resiliência máxima.
- **Tabela comparativa dos três *on-ramps*:** recurso central, quem emite a chave, ASN do lado da nuvem e
  redundância.
- **AWS Interconnect – multicloud.** Um parágrafo sobre o link gerenciado entre nuvens, com a ressalva de
  que ele não substitui o FCR quando a outra ponta é um fornecedor.
- **Hands-on.** A borda `aws-edge` opcional no `topologia.yaml` e o invariante 5 (opcional): ASN do gateway
  diferente do Transit Gateway e do cliente, nas faixas privadas, com as mesmas regras de CIDR e de anúncio
  mínimo.
- **Frontmatter e pontes.** O marco ganhou `reviewedAt: 2026-11-11`, `reviewEvery: 6m` e três referências.
  A ponte de ida e volta com `aws-para-backend/03` está feita.

**Conferido em 11 nov 2026:**

- **Direct Connect:**
  - a conexão hospedada precisa ser aceita antes de receber uma VIF;
  - o ASN do lado da AWS é o do Direct Connect Gateway: definido só na criação, 64512 por padrão, nas faixas
    privadas de 16 e 32 bits;
  - com o Transit Gateway também em 64512, a associação falha;
  - o SLA de 99,99% vale para o modelo de resiliência máxima, com mais de um local.
- **Equinix FCR → AWS:** a conexão usa o número da conta AWS, é aceita no console do Direct Connect, e a
  banda não pode ser alterada depois.
- **AWS Interconnect – multicloud** (anúncios "What's New"):
  - *preview* em nov 2025;
  - GA com o Google Cloud em abr 2026;
  - OCI em GA em jul 2026;
  - Azure em *preview* em ago 2026.

  A página de documentação do serviço ainda dizia "*preview*" para o Google, e os anúncios prevaleceram.

O `estimatedMinutes` do marco ficou em 65. A seção nova é leitura de referência, e a borda AWS é opcional.
