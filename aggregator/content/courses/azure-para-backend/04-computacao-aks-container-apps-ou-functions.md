---
id: computacao-aks-container-apps-ou-functions
title: "Computação: AKS, Container Apps ou Functions"
summary: "A escolha de computação no Azure é uma escolha de quanta plataforma você quer operar; o critério é time, carga e controle. App Service em uma página, Container Apps com revisões, escala e ambiente interno, AKS com o que a Microsoft opera e o que é seu, AKS Automatic e node auto-provisioning em GA, Functions como computação de evento, ACR sem administrador e imagem por digest — com seis regras sobre o código que pegaram, no laboratório, identidade compartilhada, senha de registro e encerramento sem folga."
estimatedMinutes: 60
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [arquitetura, plataforma]
references:
  - title: "Azure Container Apps — Update and deploy changes (revisions)"
    url: https://learn.microsoft.com/azure/container-apps/revisions
  - title: "Azure Container Apps — Networking in an environment"
    url: https://learn.microsoft.com/azure/container-apps/networking
  - title: "Azure Container Registry — Authentication options"
    url: https://learn.microsoft.com/azure/container-registry/container-registry-authentication
  - title: "AKS — Node auto-provisioning"
    url: https://learn.microsoft.com/azure/aks/node-auto-provisioning
---

## Quanta plataforma você quer operar

No Azure, as quatro opções de computação para um backend se ordenam pelo quanto você opera:

| | App Service | Container Apps | AKS | Functions |
| --- | --- | --- | --- | --- |
| Você entrega | código ou contêiner | contêiner | contêiner e manifestos | função |
| A Microsoft opera | tudo abaixo do app | o *cluster*, a escala e o *ingress* | o plano de controle do Kubernetes | tudo abaixo da função |
| Você opera | o app | o app e as regras de escala | os nós (ou não, no AKS Automatic), o *add-on* de rede, o *ingress*, o *upgrade* | a função e o *binding* |
| Bom para | o app web ou a API simples | a maioria dos serviços de uma fintech de porte médio | muitos serviços, controle fino, operadores e *mesh* | evento intermitente (marco 06) |

**App Service em uma página.** É a plataforma web mais antiga do Azure, com *deployment slots*, escala por
instância e integração com VNet. Para uma API simples, com um time pequeno, ainda é a resposta. Ela perde para
o Container Apps quando a escala precisa vir de fila ou de evento, e não de CPU.

## Container Apps

O **Azure Container Apps** roda contêineres num ambiente gerenciado, sem expor o Kubernetes por baixo.
Conferido em 12 nov 2026:

- **Revisões.** Cada mudança de configuração do contêiner cria uma **revisão** imutável. No modo **single**,
  o padrão, a nova revisão sobe, escala e só então recebe tráfego; se ela falhar, o tráfego fica na antiga.
  No modo **multiple**, várias revisões ficam ativas, e o tráfego se divide por **pesos** que somam 100%. Os
  ***labels*** dão a uma revisão uma URL própria, para testar antes de mandar tráfego. É o *blue-green* e o
  *canary* sem ferramenta extra.
- **Escala.** As regras de escala vêm do KEDA: HTTP, TCP, fila do Service Bus, partições do Event Hubs. A
  escala até zero existe, e o primeiro pedido depois dela paga a partida.
- **Ambiente.** O ambiente com ***workload profiles*** aceita os planos Consumption e Dedicated, precisa de uma
  sub-rede de no mínimo /27 e é o único que aceita UDR e saída por NAT Gateway (a saída única do marco 03). O
  ambiente só Consumption, o legado, precisa de /23 e não aceita UDR. Um **ambiente interno** não tem
  *endpoint* público: o "qualquer lugar" do *ingress* passa a ser "qualquer lugar da VNet".

O *deploy* sem *downtime* depende do encerramento: o contêiner recebe o sinal, termina o que está em curso e
sai antes do `termination_grace_period_seconds`. O *drain* do `pix-gateway` está medido em `spring-boot/12`, e os
*probes* e o encerramento no Kubernetes, em `kubernetes/06`.

## AKS

No **Azure Kubernetes Service**, a Microsoft opera o plano de controle (API Server, etcd, *scheduler*), e você
opera o resto:

- os ***node pools***: o de **sistema**, com os componentes do *cluster*, e os de **usuário**, com as cargas.
  Separe os dois, e espalhe os nós pelas zonas;
- a **rede**: o Azure CNI, que dá IP da VNet a cada *pod*, ou o Azure CNI Overlay, que economiza endereço;
- o ***ingress***: o **Application Gateway for Containers**, a borda gerenciada para o AKS, exige Azure CNI ou
  Overlay e a *workload identity* ligada;
- a **identidade dos *pods***: a **AKS Workload Identity** troca o *token* da *service account* do Kubernetes
  por um *token* do Entra ID, com a identidade *user-assigned* do marco 02, sem segredo no *cluster*;
- o ***upgrade*** do Kubernetes e dos nós.

Conferido em 12 nov 2026: o **AKS Automatic** está em GA desde set 2025. Ele opera os nós, a escala, a
manutenção e os reparos. O ***node auto-provisioning***, baseado no Karpenter, vem pré-configurado no AKS
Automatic e pode ser ligado no Standard, também em GA. O autoescalonamento, a escala de *workloads* e o
*multi-tenancy* em termos neutros são de `kubernetes/07` e `kubernetes/14`.

## Registro de imagem

O **Azure Container Registry** (ACR) guarda as imagens. Conferido em 12 nov 2026: o **usuário administrador
vem desligado** por padrão, tem permissão total no registro e só deve ser ligado se não houver outro jeito. Há
uma política interna do Azure Policy que nega ligá-lo. O caminho certo:

- o app puxa a imagem com a **própria identidade**, com o papel `AcrPull`;
- no AKS, quem puxa é a identidade do *kubelet*;
- a imagem é referenciada por ***digest*** (`@sha256:...`), e não por *tag*. A *tag* muda de conteúdo; o
  *digest*, não.

A varredura e a assinatura de imagem estão na esteira de `entrega-continua-e-devops/05`.

## A tabela de decisão

| Se... | então |
| --- | --- |
| o time tem menos de dez pessoas e menos de uns dez serviços | Container Apps |
| a escala vem de fila ou evento, e o serviço é contínuo | Container Apps, com a regra de escala da fila |
| o trabalho é intermitente, por evento, de duração curta | Functions (marco 06) |
| há muitos serviços, operadores, *service mesh* ou controle fino de rede e de nó | AKS, de preferência o Automatic |
| é uma API web simples, sem escala por evento | App Service |

A escolha vai numa ADR, com o custo de operar ao lado do custo de rodar.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| ECS com Fargate | Container Apps (aproximação) | o Container Apps tem revisões e divisão de tráfego nativas, e escala por KEDA |
| EKS | AKS | o AKS Automatic opera os nós; o *ingress* gerenciado é o Application Gateway for Containers |
| Lambda | Functions | o modelo de hospedagem muda tudo (marco 06) |
| ECR | ACR | o ACR tem um usuário administrador que precisa ficar desligado |
| Karpenter | *node auto-provisioning* | no AKS, é o próprio Karpenter, gerenciado |
| EKS Pod Identity | AKS Workload Identity | federação OIDC com a identidade *user-assigned* |

O marco gêmeo é `aws-para-backend/04`.

> **Armadilha.** Escolher AKS por padrão para três serviços e um time de cinco pessoas. O *cluster* vira o
> produto: *upgrade*, *node pool*, *add-on* de rede, *ingress*, política. Para esse tamanho, o Container Apps
> entrega revisões, escala por fila e ambiente interno sem nada disso.

## Exemplo numa fintech

O time do `pix-status` publicou a imagem com a *tag* `:latest` e puxava do ACR com o usuário administrador, cuja
senha estava num segredo do Container Apps. Um *deploy* de outro serviço republicou a `:latest` errada. Na
próxima réplica que subiu, o `pix-status` passou a rodar o código de outro serviço, com a mesma senha que dava
acesso total ao registro. A correção:

- imagem por *digest*, e o `pix-status` com a identidade própria e o papel `AcrPull`;
- o administrador do registro desligado, com a política interna em `deny`;
- uma regra sobre o código que reprova *tag*, senha de registro e identidade compartilhada.

## Hands-on

**Tutorial.** Escreva a ADR "onde roda cada componente do `fin-platform`", aplicando a tabela de decisão a cada
um. Compare com a decisão do `fin-aws` (`aws-para-backend/04`).

**Desafio.** O módulo de Container Apps do `pix-gateway` e do `pix-status`, com as regras sobre o código em
`politicas/computacao.rego` e o *drain* medido num arquivo de dados.

**Invariantes testáveis**

1. **A ADR justifica.** A tabela de decisão é aplicada a cada componente, e pelo menos uma escolha contraria a
   intuição, com o motivo.
2. **Identidade própria, sem senha de registro.** Todo app tem uma identidade *user-assigned* que nenhum outro
   app usa, e puxa a imagem por ela. O registro tem `admin_enabled = false`.
3. **Imagem por *digest*.** Toda imagem traz `@sha256:`.
4. **Ambiente interno.** O ambiente do Container Apps tem `internal_load_balancer_enabled = true`, atrás da borda
   do marco 03.
5. **O encerramento cobre o *drain*.** O `termination_grace_period_seconds` é maior que o *drain* de
   `spring-boot/12`.

Medido: o código bom passou nas 6 regras. A *fixture* ruim foi reprovada nas **6**:

- o ambiente com entrada pública;
- a identidade compartilhada entre os dois apps;
- o encerramento de 30 s, igual ao *drain*, sem folga;
- a imagem puxada com usuário e senha;
- a imagem por *tag* `:latest`;
- o registro com o administrador ligado.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, publique o `pix-gateway` no
Container Apps em modo *multiple*, mande 10% do tráfego para a nova revisão e meça os erros durante a troca.
Destrua tudo no fim.

**Checagem**

1. Quando Container Apps, quando AKS?
2. O que o modo *multiple* de revisões permite, e como ele se usa num *canary*?
3. O que a Microsoft opera no AKS, e o que continua seu?
4. Por que imagem por *digest*, e por que o usuário administrador do ACR desligado?

## Principais aprendizados

- A escolha é quanta plataforma você quer operar: App Service, Container Apps, AKS ou Functions.
- Container Apps: revisões imutáveis, pesos que somam 100%, escala por KEDA e ambiente interno. Só o ambiente
  com *workload profiles* aceita UDR e NAT.
- AKS: a Microsoft opera o plano de controle. AKS Automatic e *node auto-provisioning* em GA (nov 2026).
- ACR com o administrador desligado, puxado por identidade, imagem por *digest*.
- O encerramento precisa de folga sobre o *drain*. Medido: 6 regras, 6 achados na *fixture*.
