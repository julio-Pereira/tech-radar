---
id: custo-e-decisao
title: "Custo, multi-tenancy e quando NÃO usar Kubernetes"
summary: "Right-sizing com dados reais, o isolamento que parece existir e não existe, e a decisão de techlead que fecha a trilha."
estimatedMinutes: 50
references:
  - title: "Kubernetes — Resource Quotas"
    url: https://kubernetes.io/docs/concepts/policy/resource-quotas/
  - title: "Kubernetes — Multi-tenancy"
    url: https://kubernetes.io/docs/concepts/security/multi-tenancy/
  - title: "FinOps Foundation — Kubernetes"
    url: https://www.finops.org/introduction/what-is-finops/
---

## Onde o dinheiro vaza

Quase sempre no mesmo lugar: **requests inflados**.

O ciclo é conhecido. Alguém não sabe quanto a app consome, chuta `1 CPU / 2Gi` "por
segurança", copia para os outros seis serviços, e o cluster passa a reservar quatro vezes
o que usa. Como o scheduler reserva pelo **request** (marco 05), você paga por nós que
estão 20% ocupados de verdade.

O diagnóstico é uma consulta:

```promql
# Quanto do que foi reservado está realmente em uso, por workload
sum by (namespace, pod) (rate(container_cpu_usage_seconds_total[7d]))
  / sum by (namespace, pod) (kube_pod_container_resource_requests{resource="cpu"})
```

Razão de 0,15 significa 85% de desperdício naquele workload.

**Right-sizing com dados reais**, não com opinião: request de CPU perto do p50 observado
(o burst usa a CPU ociosa do nó, e é para isso que `Burstable` existe), request de memória
perto do **pico** observado — memória não é compressível (marco 05) e errar para baixo é
OOMKill. O VPA em modo recomendação produz esses números sem recriar pods.

Depois: **bin packing** (nós grandes demais deixam sobra que nada preenche; nós pequenos
demais desperdiçam em overhead de sistema), **spot** para carga tolerante a interrupção
(batch, processamento assíncrono — nunca a autorização), e **desligar o que não é
produção fora do horário**, que costuma ser a economia mais fácil e a mais esquecida.

## Medir por dono

Sem rateio, "o cluster custa R$ 80 mil" é um número que ninguém consegue agir sobre. Com
os labels do marco 02 (`fin.io/team`, `fin.io/cost-center`), vira custo por time — e a
conversa muda de "precisamos economizar" para "o time X representa 40% e usa 12%".

**ResourceQuota** limita o total que um namespace pode requisitar; **LimitRange** define
padrões e tetos por container — inclusive um request mínimo, que impede o pod
`BestEffort` acidental do marco 05.

O efeito colateral que surpreende: com `ResourceQuota` ativa, **todo** pod do namespace
passa a ser obrigado a declarar requests e limits. Isso quebra manifestos existentes, e é
exatamente o comportamento desejado — só precisa ser comunicado antes.

## Multi-tenancy: isolamento real vs aparente

**Namespace por time** dá: fronteira de nome, RBAC (marco 10), NetworkPolicy (marco 11),
quota. Não dá: kernel separado (marco 09), isolamento de nó por padrão, proteção contra
um vizinho barulhento saturando o disco ou a rede do nó, nem contra um CRD ou webhook mal
comportado que afeta o cluster inteiro.

A régua honesta:

- **Namespace basta** quando os inquilinos são times da mesma empresa, sob a mesma
  política de segurança, com confiança mútua. É o caso da maioria — inclusive do
  `fin-platform`.
- **Cluster separado** quando o inquilino é hostil ou não confiável (código de cliente),
  quando a conformidade exige separação física, ou quando os ciclos de upgrade não podem
  ser compartilhados. Produção **sempre** em cluster separado de dev/homologação.

Chamar namespace de "isolamento" numa reunião com auditoria é o tipo de imprecisão que
volta como achado.

## A decisão de techlead

O fecho da trilha, e a pergunta mais importante dela: **você precisa de Kubernetes?**

Ele é uma plataforma. O custo não é a fatura de computação — é a **plataforma que alguém
precisa operar**: upgrades trimestrais, CNI, ingress, policies, certificados, o operator
que quebrou, o webhook que travou o cluster.

Para um time de 5 pessoas com 3 serviços, isso é caro em atenção. As alternativas
entregam boa parte do que você viu nesta trilha:

| | Entrega | Não entrega |
| --- | --- | --- |
| **Cloud Run / Container Apps** | escala a zero, deploy, TLS, revisões | scheduling fino, operators, portabilidade |
| **ECS Fargate** | containers sem gerenciar nós | ecossistema CNCF, CRDs |
| **PaaS** (Heroku e afins) | quase tudo, com o mínimo de operação | controle, custo em escala |
| **VMs com systemd** | simplicidade, previsibilidade | elasticidade, self-healing |

Kubernetes ganha quando: você tem muitos serviços, precisa de portabilidade real entre
provedores, depende do ecossistema (operators, Gateway API, policies), ou já tem equipe de
plataforma. Perde quando: poucos serviços, time pequeno, um provedor só, e nenhum
requisito que as alternativas não cubram.

E o critério que resolve a discussão sem ideologia: **quem vai operar isso às 3h da manhã
de domingo?** Se a resposta não é convincente, a resposta é outra plataforma.

## Checklist: pronto para produção regulada

Uma página, verificável, fechando a trilha. Cada item aponta o marco que o entrega:

- [ ] Todo workload com `requests` e `limits.memory`; nenhum `BestEffort` **(05)**
- [ ] Readiness honesta, `preStop`, graceful shutdown, `maxUnavailable: 0` **(06)**
- [ ] PDB e spread por zona nos serviços críticos **(05)**
- [ ] Namespace com `enforce: restricted`; nenhum container root **(09)**
- [ ] Imagem por digest, assinada e verificada na admissão **(09)**
- [ ] Policies em `Enforce`, com teste de rejeição no pipeline **(09)**
- [ ] Uma ServiceAccount por serviço, Role mínimo, token não montado por padrão **(10)**
- [ ] Audit log ligado, seletivo, **fora** do cluster **(10)**
- [ ] Nenhum humano com `cluster-admin` permanente; `exec` só quebra-vidro **(10)**
- [ ] NetworkPolicy default-deny; egress para parceiro por IP fixo **(11)**
- [ ] Segredo no cofre, montado como arquivo, rotação sem redeploy **(03)**
- [ ] Alerta por sintoma com runbook; métrica de negócio no painel **(12)**
- [ ] Deploy só por GitOps, com PR aprovado **(13)**
- [ ] **Restore testado com RTO medido e datado** **(13)**
- [ ] Custo rateado por time; quotas por namespace **(14)**

Se algum item não puder ser demonstrado com um comando ou um artefato, ele não está
pronto — está documentado, que é diferente.

## Exemplo numa fintech

O `pix-gateway` precisa de Kubernetes? A resposta defensável depende do contexto, e o
exercício é escrevê-la.

A favor, no caso de uma fintech: requisitos de rede e segurança que a trilha inteira
mostrou serem expressáveis como objeto versionado (NetworkPolicy, policies de admissão,
RBAC), evidência de conformidade que sai do GitOps, portabilidade entre provedores (que
em setor regulado às vezes é exigência contratual), e o ecossistema de operators
(Strimzi, ESO, cert-manager).

Contra: se são três serviços e o time tem cinco pessoas, o Cloud Run entrega deploy, TLS,
escala e revisões sem plataforma para operar — e a conformidade se resolve de outras
formas.

## Hands-on

**Desafio — a ADR que fecha a trilha.** Escreva
`docs/adr/00X-kubernetes-para-o-pix-gateway.md`:

1. **Contexto** — número de serviços, tamanho e experiência do time, provedor, requisitos
   regulatórios concretos.
2. **Decisão** — Kubernetes ou alternativa nomeada.
3. **Alternativas consideradas** — pelo menos duas, com o que cada uma entregaria e o que
   não entregaria **no seu caso**, não em geral.
4. **Consequências** — o que fica mais fácil e o que fica mais difícil.
5. **Gatilho de reversão** — o fato observável que faria revisar. *"Se o time de
   plataforma cair abaixo de 2 pessoas"* ou *"se passarmos de 20 serviços"* são gatilhos;
   *"se ficar difícil"* não é.

O critério de qualidade é a seção 3: uma ADR que só argumenta a favor da decisão tomada é
justificativa, não decisão.

**Complemento — right-sizing com dados reais.** Rode a consulta de razão uso/request para
todos os workloads do `fin-platform` por 7 dias. Produza uma tabela com request atual,
uso p50, uso p99 e request proposto. Aplique e prove que nada foi OOMKilled na semana
seguinte. Calcule a economia.

**Complemento — o checklist.** Percorra a lista da seção anterior no `fin-platform` e
marque o que você **consegue demonstrar com um comando**. O que sobrar é o backlog real
da plataforma.

**Checagem.** (a) Requests inflados custam dinheiro mesmo com o cluster ocioso — por quê?
(b) O que namespace **não** isola? (c) Qual pergunta resolve a discussão "Kubernetes ou
Cloud Run" sem ideologia? (d) Por que ativar `ResourceQuota` quebra manifestos
existentes, e por que isso é bom?

## Principais aprendizados

- O dinheiro vaza em requests inflados: o scheduler reserva pelo request, e right-sizing
  se faz com p50 de CPU e pico de memória medidos.
- Namespace dá nome, RBAC, policy e quota — não dá kernel separado nem proteção contra
  vizinho barulhento; produção em cluster separado.
- Kubernetes ganha com muitos serviços, portabilidade e ecossistema; perde com time
  pequeno e poucos serviços — e o critério é quem opera às 3h de domingo.
- Item de checklist que não pode ser demonstrado com um comando está documentado, não
  pronto.

## Capstone

O `fin-platform` é o repositório guarda-chuva do sistema — a especificação completa está
em `PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `kind` de 3 nós + Kustomize com `base` e `overlays/dev|prod`
- [ ] Gateway API na borda, com timeout maior ou igual ao do backend
- [ ] Requests e limits medidos, `limits.memory` em tudo, PDB que não trava o drain
- [ ] Pod Security `restricted`, imagens sem root, cosign + Kyverno `verifyImages`
- [ ] RBAC por namespace e audit log saindo do cluster
- [ ] NetworkPolicy default-deny, com DNS liberado em TCP **e** UDP
- [ ] Argo CD com `selfHeal` e Velero com restore exercitado

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] `make up` sobe tudo do zero em cluster limpo, sem passo manual
- [ ] Deploy sob carga com **zero 5xx**, medidos por um gerador externo
- [ ] `kubectl auth can-i --as=...` nega o que deve negar, e o teste está no repo
- [ ] Policy bloqueia imagem sem digest e sem assinatura
- [ ] Uma conexão não autorizada é **provadamente** negada pela NetworkPolicy
- [ ] Restore de um namespace inteiro feito de verdade, com RTO medido e anotado
- [ ] O runbook diz como pausar o Argo CD antes de mitigar um incidente à mão
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma
página — inclusive se nada tiver quebrado. O que não quebrou também é resultado.
