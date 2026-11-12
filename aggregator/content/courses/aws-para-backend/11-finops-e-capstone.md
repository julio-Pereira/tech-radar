---
id: finops-e-capstone
title: "FinOps na AWS e capstone"
summary: "Custo é um requisito não funcional com dono; quem não modela o custo antes descobre na fatura. Os vetores de custo de um backend, os escondidos (NAT, logs e tráfego entre AZs), tags e orçamentos, Savings Plans × reservas × spot, rightsizing e Graviton, o custo por mil transações Pix — com um modelo que lê o plano e mostrou o NAT sem endpoint indo de US$ 13,50 para US$ 261 por mês — e o capstone do fin-aws."
estimatedMinutes: 70
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [arquitetura, negocio]
references:
  - title: "Amazon VPC Pricing"
    url: https://aws.amazon.com/vpc/pricing/
  - title: "Amazon CloudWatch Pricing"
    url: https://aws.amazon.com/cloudwatch/pricing/
  - title: "Amazon EC2 — Spot Instance interruption notices"
    url: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html
  - title: "AWS Well-Architected — Cost Optimization Pillar"
    url: https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html
---

## Custo é requisito, e tem dono

Latência, disponibilidade e segurança entram na ADR com número e dono. O custo costuma entrar depois, na
fatura, quando a arquitetura já não muda barato. O FinOps na AWS é tratar o custo como os outros requisitos
não funcionais:

- um **modelo** feito antes, a partir do plano e do tráfego esperado;
- um **dono** por centro de custo;
- um **alarme** antes da fatura;
- uma **unidade de negócio** que dá sentido ao total: o custo por mil transações Pix.

A plataforma como produto e o custo dela estão em `engenharia-de-plataforma/08`; o custo por transação como
requisito de evolução, em `system-design/14`.

## Os vetores de custo de um backend

| Vetor | Cobrado por | Onde aparece no `fin-aws` |
| --- | --- | --- |
| Computação | hora de instância, de vCPU e de memória, ou invocação e GB-segundo | as tarefas Fargate do `pix-gateway`, as funções do lote |
| Banco | hora de instância, armazenamento, E/S, réplicas, *backup* | o RDS do ledger, o DynamoDB de idempotência |
| Transferência de dados | GB entre AZs, entre regiões e para a internet | a réplica em outra AZ, o DR (marco 10), o *webhook* para fora |
| Rede gerenciada | hora e GB do NAT, hora e GB do *interface endpoint* | a saída controlada do marco 03 |
| Armazenamento e requisição | GB-mês, mais cada `PUT` e `GET` | os extratos no S3 |
| Observabilidade | GB de *log* ingerido e guardado, métricas, alarmes | o marco 09 |

## Os três custos escondidos

**NAT.** Todo GB que passa pelo NAT paga processamento. Em us-east-1, conferido em 10 nov 2026, são
US$ 0,045 por hora e US$ 0,045 por GB (marco 03). O tráfego para o S3 e o DynamoDB que sai pelo NAT, em vez
de ir pelo *gateway endpoint* gratuito, é o desperdício mais comum de uma VPC.

**Tráfego entre AZs.** O dado que cruza AZs dentro da região é cobrado nos dois sentidos, US$ 0,01 por GB em
cada um (us-east-1, conferido em 10 nov 2026). Ele aparece em três lugares:

- o serviço que chama outro em outra AZ;
- a replicação do banco;
- o *cluster* Kafka com réplicas espalhadas.

O roteamento por zona e a afinidade de AZ reduzem esse custo. A resiliência do marco 10 aumenta, e por isso
a conta entra na ADR.

**Logs.** Um grupo sem retenção guarda para sempre, e a ingestão Standard custa US$ 0,50 por GB (marco 09).
Um serviço que registra o corpo de toda requisição em `INFO` paga, em *log*, mais do que em computação.

## *Tags*, orçamentos e quem paga

- **Tags de alocação de custo.** A *tag* `centro-de-custo`, obrigatória pela SCP do marco 01, só aparece
  nos relatórios depois de **ativada** como *tag* de alocação no faturamento. As ***cost categories***
  agrupam contas e *tags* em categorias do negócio.
- **Orçamento com alarme previsto.** O AWS Budgets avisa quando o gasto **previsto** do mês passa de uma
  fração do limite, não só quando o real já passou. Ele vai para o plano, como qualquer outro recurso.
- **Detecção de anomalia.** O Cost Anomaly Detection aprende o padrão e avisa do desvio: o NAT que dobrou
  num dia, o *log* que explodiu depois de um *deploy*.

## Comprar melhor: compromisso, *spot* e *rightsizing*

| Opção | O que você troca | Quando |
| --- | --- | --- |
| ***Savings Plans*** | compromisso de gasto por hora, em 1 ou 3 anos, por desconto | a base estável de computação. O *Compute Savings Plan* cobre EC2, Fargate e Lambda |
| **Instâncias reservadas** | compromisso com uma família ou um banco, por desconto | RDS, ElastiCache e outros serviços que o *Savings Plan* não cobre |
| ***Spot*** | capacidade que a AWS pode tomar de volta, com um aviso de **dois minutos** (conferido em 10 nov 2026), por desconto grande | trabalho que pode ser interrompido e refeito: lote, CI, reprocessamento. Nunca o caminho síncrono do pagamento |
| ***Rightsizing*** | nada: ajusta o tamanho ao uso medido | sempre, antes de comprar compromisso |
| **Graviton** (ARM) | recompilar e testar em ARM | serviços em Go e na JVM rodam em ARM sem mudança de código; a imagem precisa ser multiarquitetura |

A ordem importa: primeiro o ***rightsizing***, depois o compromisso. Um *Savings Plan* comprado sobre
instâncias superdimensionadas trava o desperdício por três anos. Os percentuais de desconto mudam: a
conta se faz na calculadora oficial, com o preço do dia.

## A unidade: custo por mil transações

O total do mês não diz se a arquitetura está boa. O custo **por mil transações Pix** diz:

> custo por mil = custo mensal do caminho do Pix ÷ transações do mês × 1.000

Com essa unidade, a pergunta "isso ficou caro?" vira "isso subiu o custo por mil?". Uma mudança que mantém
o total, mas dobra o custo por mil quando o volume cai, aparece. A métrica sai do modelo de custo e vai para
o painel do produto.

## "Como você reduziria a conta?"

A resposta de sênior numa entrevista não começa por "*spot* e *Savings Plans*". Começa por **medir**:

1. **Onde está o dinheiro:** o relatório por *tag* e por serviço, e os três maiores itens.
2. **O que é desperdício** (custo sem valor): NAT sem *endpoint*, *log* sem retenção, ambiente de teste
   ligado no fim de semana, volume EBS órfão, instância superdimensionada.
3. **O que é arquitetura**, com a decisão escrita: tráfego entre AZs, réplica, DR. A redução aqui troca
   custo por resiliência.
4. **Só então, comprar melhor:** compromisso sobre a base estável já ajustada, e *spot* para o
   interrompível.
5. **Como impedir a volta:** a regra sobre o plano e o orçamento com alarme.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Cost Management + Budgets | Cost Explorer + AWS Budgets | na AWS, a *tag* só aparece no relatório depois de ativada no faturamento |
| Azure Reservations / Savings Plan for compute | Instâncias reservadas / *Savings Plans* | o *Compute Savings Plan* cobre também Fargate e Lambda |
| Spot VMs | *Spot* | os dois avisam antes de tomar a capacidade; na AWS, o aviso é de dois minutos |
| Azure Advisor (custo) | Compute Optimizer + Trusted Advisor | os dois recomendam *rightsizing* a partir do uso medido |

O marco gêmeo no Azure é `azure-para-backend/11`.

> **O que o laboratório não reproduz.** O modelo de custo usa preços de uma data e de uma região, e um
> perfil de tráfego que é hipótese. Ele não reproduz os níveis de desconto, o nível gratuito, o *Savings
> Plan* nem a fatura real. Ele prova uma coisa: **uma mudança no plano muda o custo modelado, e o teste
> mostra quanto**, antes do *merge*.

## Exemplo numa fintech

A conta de produção do Pix subiu 40% num mês, sem aumento de volume. O Cost Explorer mostrou que o
crescimento estava no NAT. Um *deploy* do `ledger-core` tinha trocado o cliente do DynamoDB por um que
resolvia o *endpoint* público do serviço, e a nova sub-rede não estava associada à tabela de rotas com o
*gateway endpoint*. Todo o tráfego do índice de idempotência passou a sair pelo NAT. A correção:

- a sub-rede nova entrou na tabela de rotas do *endpoint*;
- o modelo de custo passou a rodar na esteira, comparando o plano novo com o anterior;
- a regra "NAT sem *endpoint* para S3 e DynamoDB" passou a reprovar o PR.

## Hands-on

**Tutorial.** Escreva o modelo de custo do `fin-aws` (`custo/custo.py`). Ele lê o JSON do `plan`, um
arquivo de preços com data, região e fonte, e um perfil de tráfego (transações por mês e GB por destino),
e imprime o custo mensal por componente e por mil transações.

**Desafio.** O modelo de custo provado como teste, sobre o plano.

**Invariantes testáveis**

1. **Custo por componente e por mil transações.** O modelo calcula as duas coisas, com os preços de uma
   data registrada (10 nov 2026, us-east-1, com a fonte). Medido, com 30 milhões de transações por mês: rede
   e *logs* somaram US$ 692,05 por mês, ou **US$ 0,0231 por mil transações**. Os *logs* (US$ 530) custaram
   mais que o NAT (US$ 112).
2. **NAT sem *endpoint* é sinalizado.** Uma mudança que mantém o NAT e tira os *gateway endpoints* de S3 e
   DynamoDB aumenta o custo modelado, e o teste reprova. Medido: o processamento do NAT foi de
   **US$ 13,50 para US$ 261,00** por mês (5.500 GB passaram a sair pelo NAT), e o custo por mil, de
   US$ 0,0231 para US$ 0,0313.
3. **Tudo com centro de custo.** Todo recurso que aceita *tags* tem `centro-de-custo` (provado no marco 01),
   e o relatório agrega por ele (no laboratório: *logs* do `pix` US$ 318, do `ledger` US$ 212).
4. **Orçamento no plano.** Existe um `aws_budgets_budget` com alarme de gasto **previsto**. A *fixture* sem
   orçamento é reprovada.

**Complemento.** Com uma conta real, crie o orçamento e o alarme **antes** de tudo, ative a *tag*
`centro-de-custo` como *tag* de alocação e, depois de uma semana com o ambiente de teste no ar, compare o
Cost Explorer por *tag* com o modelo. Destrua tudo no fim.

**Checagem**

1. Quais são os três custos escondidos de um backend na AWS, e como cada um aparece no plano?
2. Por que fazer *rightsizing* antes de comprar um *Savings Plan*?
3. Onde *spot* serve e onde não serve, num sistema de pagamentos?
4. Por que o custo por mil transações diz mais que o total do mês?

## Capstone

O `fin-aws` é o seu componente do `fin-platform`: o `fin-platform` desenhado para a AWS, especificado no
`PROJETO.md` desta trilha. Aqui ele fica pronto, e nada nele exige uma conta.

**Entrega**

- [ ] Contas e OUs como código, com SCP de regiões e *tags* obrigatórias (marco 01)
- [ ] Papéis de menor privilégio, com a matriz de acesso provada pelo avaliador e sobre o plano (marco 02)
- [ ] Rede fechada: saída única, *endpoints* com política, nada aberto para a internet (marco 03)
- [ ] A computação escolhida por ADR, com o serviço e o *deploy* seguro no alvo (marco 04)
- [ ] Mensageria idempotente, com DLQ, *redrive* e ordem por conta (marco 05)
- [ ] A função de lote com concorrência limitada contra o banco (marco 06)
- [ ] Dados com criptografia, PITR e proteção contra exclusão, e o índice de idempotência condicional
      (marco 07)
- [ ] *Buckets* fechados, chaves com dono e contexto, segredos fora do estado (marco 08)
- [ ] Alarmes a partir dos SLOs, com CloudTrail de organização, e a telemetria por OTel (marco 09)
- [ ] O plano de DR com RPO, RTO, estratégia e custo, e o *game day* com post-mortem (marco 10)
- [ ] O modelo de custo com o custo por mil transações (marco 11)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] IAM: o avaliador didático e a política sobre o plano reprovam as *fixtures* de privilégio demais
- [ ] Rede: as *fixtures* com SSH aberto, *endpoint* sem política e rota privada para a internet são
      reprovadas
- [ ] Mensageria: com 30% das mensagens passando do *visibility timeout*, cada lançamento aparece uma vez
- [ ] Dados: 50 escritas concorrentes da mesma chave dão um item; a transação com falha injetada não aplica
      metade
- [ ] Chaves: o contexto errado não decifra, e a política reprova `kms:*` fora do papel de administração
- [ ] Operação: todo SLO, fila, tabela e função tem alarme, e nenhum grupo de *log* fica sem retenção
- [ ] DR: a ADR passa na tabela de regras, e o `terraform test` reprova o caminho de pagamento numa AZ só
- [ ] Custo: o NAT sem *endpoint* aumenta o custo modelado e reprova
- [ ] Tudo roda em CI sem nenhuma variável `AWS_*` real

**A pergunta final.** Qual permissão, rota ou recurso do seu plano existe hoje só porque ninguém escreveu o
teste que o proibiria — e quanto ele custa por mês?

## Principais aprendizados

- Custo é requisito não funcional: modelo antes, dono por centro de custo, alarme antes da fatura.
- Três escondidos: NAT (US$ 0,045/h e /GB), tráfego entre AZs (US$ 0,01/GB por sentido) e *log* sem
  retenção (us-east-1, nov 2026).
- *Tag* de alocação ativada, *cost categories*, orçamento por gasto previsto e detecção de anomalia.
- *Rightsizing* primeiro, compromisso depois. *Spot* (aviso de dois minutos) só para o que pode ser
  refeito.
- A unidade é o custo por mil transações. Medido: o NAT sem *endpoint* o subiu de US$ 0,0231 para
  US$ 0,0313.
- Na entrevista, a resposta começa por medir, separa desperdício de arquitetura e termina com a regra que
  impede a volta.
