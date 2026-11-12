---
id: computacao-ecs-eks-ou-lambda
title: "Computação: ECS, EKS ou Lambda"
summary: "A escolha de computação é uma escolha de quem opera o quê; o critério é time, carga e controle, não moda. EC2, ECS com Fargate, EKS e Lambda numa tabela de decisão; task role × papel de execução; Graviton; imagem por digest; e o deploy sem queda casando o drain de 30 s do spring-boot/12 com o stopTimeout do ECS (padrão 30 s, até 120 s no Fargate) e o deregistration delay do ALB (padrão 300 s)."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [arquitetura, plataforma]
references:
  - title: "Amazon ECS — Task definition parameters for Fargate"
    url: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
  - title: "Elastic Load Balancing — Target groups for your Application Load Balancers"
    url: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html
  - title: "Amazon EKS — Best practices guide"
    url: https://docs.aws.amazon.com/eks/latest/best-practices/introduction.html
  - title: "AWS Graviton"
    url: https://aws.amazon.com/ec2/graviton/
---

## A escolha é de quem opera o quê

Toda opção de computação na AWS roda o mesmo código. O que muda é **quem opera o quê**: o sistema
operacional, o orquestrador, a escala e o *patch*. A pergunta de entrevista "ECS ou EKS?" tem uma resposta
honesta: depende do time, da carga e do controle que o serviço precisa. Nunca depende da moda.

| | EC2 | ECS no Fargate | EKS | Lambda |
| --- | --- | --- | --- | --- |
| Você opera | sistema operacional, *runtime*, escala | a definição da tarefa e o serviço | os *workloads*, os nós (ou o Karpenter), os *add-ons* | o código, a concorrência, o papel |
| A AWS opera | o *hypervisor* | os servidores, o *patch* do host, o agendador | o *control plane* do Kubernetes | tudo abaixo do *handler* |
| Bom para | *software* de terceiros, licença por máquina, GPU | serviço HTTP ou *worker* contínuo, time sem Kubernetes | muitos serviços, time que já opera Kubernetes, portabilidade | evento intermitente (marco 06) |
| Cuidado com | ninguém fazendo *patch* | menos ajustes finos do que no EKS | custo de operar o *cluster* e os *add-ons* | duplicidade, concorrência contra o banco, custo em carga constante |

**EC2 ainda é a resposta** quando o *software* exige a máquina (um banco de terceiros, licença por núcleo,
acesso a *hardware*), ou quando o custo de uma frota grande e estável pesa mais que a operação.

## ECS com Fargate

O ECS é o orquestrador de contêineres da AWS, sem Kubernetes. A unidade é a **tarefa**, descrita por uma
***task definition***: imagem, CPU, memória, portas e os dois papéis. Um **serviço** mantém N tarefas
rodando, atrás de um *target group* do ALB, e troca as tarefas no *deploy*. No **Fargate**, não há
instância para gerenciar: cada tarefa ganha a própria micro-VM.

Os dois papéis são a confusão mais comum, e uma falha de menor privilégio:

- o **papel de execução** é usado pelo **agente do ECS** para baixar a imagem do ECR, ler segredos
  injetados no início e mandar *logs*;
- o ***task role*** é usado pelo **código** da aplicação para chamar a AWS (fila, tabela, segredo).

Usar o papel de execução como *task role* dá ao código as permissões do agente, e vice-versa. Cada serviço
tem o seu *task role*, com o menor privilégio do marco 02.

## EKS: o que a AWS opera, e o que fica com você

No EKS, a AWS opera o ***control plane*** do Kubernetes (API, etcd, agendador), em várias AZs. Ficam com
você os *workloads*, os nós e os *add-ons* que fazem o *cluster* funcionar na AWS:

- o **AWS Load Balancer Controller**, que cria ALB e NLB a partir de `Ingress` e `Service`;
- o **Karpenter**, que provisiona nós sob medida para os *pods* pendentes;
- a identidade de *pod*, com Pod Identity ou IRSA (marco 02).

O conhecimento de Kubernetes está na trilha `kubernetes`:

- escala com HPA e KEDA (`kubernetes/07`);
- quando não usar Kubernetes (`kubernetes/14`).

## Graviton, imagem e *deploy*

**Graviton** são os processadores ARM da AWS, em geral com preço por hora menor que o da instância x86
equivalente. Para Java e Go, a mudança costuma ser só a imagem multi-arquitetura e
`cpu_architecture = "ARM64"` na *task definition*. Meça a sua carga antes de prometer economia.

**Imagem por *digest*.** A imagem vem do **ECR**, com varredura de vulnerabilidade ligada, e é referenciada
pelo ***digest*** (`@sha256:...`), nunca por `latest`. A *tag* é um ponteiro que pode mudar entre o teste
e a produção. O *digest* é o artefato que passou na esteira e foi promovido
(`entrega-continua-e-devops/05`).

**Deploy sem queda.** Três números precisam casar:

1. **O *drain* da aplicação.** No `spring-boot/12`, o *graceful shutdown* espera até 30 s
   (`spring.lifecycle.timeout-per-shutdown-phase=30s`).
2. **O `stopTimeout` do contêiner.** É o tempo entre o `SIGTERM` e o `SIGKILL`. O padrão é **30 s**, e o
   máximo no Fargate é **120 s** (documentação do ECS, conferida em 10 nov 2026). Com o padrão igual ao
   *drain*, o `SIGKILL` pode chegar no meio dele.
3. **O *deregistration delay* do *target group*.** É quanto o ALB espera as conexões em voo antes de
   tirar o alvo. O padrão é **300 s**: seguro, mas cada *deploy* espera cinco minutos por tarefa. Ajuste
   para um pouco acima do *drain*.

O *health check* do *target group* aponta para a *readiness*, como no Kubernetes (`kubernetes/06`).

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| AKS | EKS | os dois gerenciam o *control plane*; no EKS, os *add-ons* de integração (*load balancer*, identidade, autoescala de nós) são escolhas suas |
| Container Apps | ECS no Fargate (aproximação) | o Container Apps traz escala por evento e Dapr embutidos; no ECS, escala e *service discovery* são configurados à parte |
| Azure Functions | Lambda | conceito igual; limites, cobrança e *triggers* diferentes (marco 06) |
| ACR | ECR | a varredura e a política de ciclo de vida das imagens são do próprio ECR |

O marco gêmeo no Azure é `azure-para-backend/04`.

## Exemplo numa fintech

O `pix-gateway` foi para o ECS no Fargate com a *task definition* gerada por um *template* antigo, em que o
`task_role_arn` apontava para o mesmo papel de execução, "porque funcionou". O papel de execução tinha
leitura de todos os segredos da conta, para injetá-los no início de qualquer serviço. Numa revisão de
segurança, um *endpoint* de diagnóstico do `pix-gateway` devolvia o resultado de chamadas à AWS, e por ele
era possível ler o segredo do banco do ledger. A correção separou os papéis, deu ao *task role* só a fila e
o segredo do próprio serviço, e virou regra sobre o plano.

## Hands-on

**Tutorial.** Escreva a *task definition* do `pix-gateway` (Fargate, ARM64, porta 8443) e o *target group*
em Terraform, e rode o `plan` sem conta. Leia o `container_definitions` no JSON do plano: ele é uma *string*
JSON dentro do JSON, e a política precisa decodificá-lo.

**Desafio.** O ADR "onde roda cada componente do `fin-platform`" e o módulo de ECS/Fargate do
`pix-gateway`.

**Invariantes testáveis**

1. **O ADR aplica a tabela de decisão** a cada componente (`pix-gateway`, `ledger-core`, `pix-stream`,
   processador de liquidação) e justifica pelo menos uma escolha contrária à intuição. Por exemplo: o
   processador de lote vai para contêiner, não para função, por causa da conta de custo do marco 06.
2. **Toda tarefa tem *task role* própria**, diferente do papel de execução, e **sistema de arquivos
   somente leitura** (`readonlyRootFilesystem`). A política sobre o plano reprova a *fixture* com os dois
   papéis iguais e o sistema de arquivos gravável.
3. **O `stopTimeout` e o *deregistration delay* cobrem o *drain*** de 30 s do `spring-boot/12`: os dois
   são maiores que ele. A *fixture* com `stopTimeout` 30 reprova.
4. **A imagem vem do ECR, por *digest***: a regra exige
   `<conta>.dkr.ecr.<região>.amazonaws.com/<repo>@sha256:<64 hex>`. A *fixture* com `:latest` reprova.

**Complemento.** Com uma conta real e orçamento criado antes, suba o serviço com duas tarefas, faça um
*deploy* com carga contínua e conte as requisições com erro durante a troca, com `stopTimeout` em 30 e em
45. Destrua tudo no fim.

**Checagem**

1. Qual é a diferença entre o papel de execução e o *task role*, e por que eles não podem ser o mesmo?
2. O que a AWS opera no EKS, e o que continua com você?
3. Por que a imagem é referenciada por *digest* e não por *tag*?
4. Quais três números precisam casar para um *deploy* sem queda no ECS?

## Principais aprendizados

- Computação é decidir quem opera o quê, numa tabela, por time, carga e controle.
- No ECS, o papel de execução é do agente; o *task role* é do código, um por serviço.
- No EKS, a AWS opera o *control plane*; *add-ons*, nós e identidade de *pod* ficam com você.
- Graviton costuma baratear; meça antes de prometer.
- Imagem do ECR por *digest*, nunca `latest`.
- *Drain* < `stopTimeout` (padrão 30 s, máximo 120 s no Fargate) e *drain* < *deregistration delay*
  (padrão 300 s, ajustável).
