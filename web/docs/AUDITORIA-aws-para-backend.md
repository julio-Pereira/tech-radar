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
