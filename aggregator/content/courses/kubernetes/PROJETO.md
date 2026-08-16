# Projeto guia — fin-platform

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> Aqui você constrói o repositório guarda-chuva — onde os outros componentes rodam.

## O que você vai construir

O repositório GitOps que sobe a fintech inteira num `kind` de 3 nós: `pix-gateway`,
`ledger-core`, Kafka via Strimzi, e o stack de observabilidade. Kustomize com `base` e
`overlays/dev|prod`, Gateway API na borda, NetworkPolicy default-deny, Pod Security
`restricted`, policies Kyverno, HPA e KEDA, Argo CD reconciliando, Velero fazendo backup.

O ponto do exercício não é subir contêiner — é **operar**: sobreviver a um deploy sob
carga, negar o que deve ser negado, e restaurar um namespace com RTO medido. Se você
não fez as trilhas vizinhas, use as imagens públicas de stub documentadas no `base` —
o que se aprende aqui é a plataforma, não o código que roda nela.

## Pré-requisitos

- Docker, `kind`, `kubectl`, `kustomize` e `helm`
- ~12 GB de RAM livres (3 nós + Kafka + Prometheus pesam)
- `argocd` CLI, `velero` CLI e `cosign`
- **Não precisa:** cluster gerenciado, conta em cloud paga, licença de service mesh.
  Tudo roda local; o marco 04 explica o que muda em nuvem (LoadBalancer, egress fixo).

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `kind` de 3 nós + repo com `base/` | `kubectl get nodes` mostra 3 Ready |
| 02 | Deployment + Service do `pix-gateway`, com labels de time e centro de custo | `kubectl get endpointslices` lista os pods certos |
| 03 | ConfigMap + Secret montado como arquivo, overlays `dev`/`prod` | Rotacionar a credencial sem reiniciar o pod |
| 04 | Gateway API com HTTPRoute por serviço, timeout da borda ≥ backend | `curl` externo chega ao serviço; timeout do Gateway não corta antes |
| 05 | Requests/limits medidos, `limits.memory` em tudo, PDB sensato | `drain` de um nó completa sem bloquear |
| 06 | Probes corretas + `preStop` e rollout sem downtime | Deploy sob carga com **zero 5xx** |
| 07 | HPA por RPS e KEDA por lag do Kafka, com `maxReplicaCount` ≤ partições | Escala sob carga e não passa do número de partições |
| 08 | Kafka via Strimzi em StatefulSet, com PVC e snapshot | Rolling restart espera o ISR se recompor |
| 09 | Pod Security `restricted`, imagens sem root, cosign + Kyverno `verifyImages` | Imagem sem assinatura é bloqueada na admissão |
| 10 | RBAC por namespace, audit log saindo do cluster | `kubectl auth can-i` nega o que deve negar |
| 11 | NetworkPolicy default-deny com DNS liberado (TCP **e** UDP) | Conexão não autorizada é provadamente negada |
| 12 | OTel Collector + Prometheus + Grafana no cluster | Painel de plantão responde em 1 minuto num incidente simulado |
| 13 | Argo CD com `selfHeal`, Velero com restore testado | Mudança manual é desfeita; restore do namespace com RTO anotado |
| 14 | ResourceQuota + LimitRange, rateio por label, ADR de "quando não usar" | Fatura por time sai do label, não de estimativa |

## Definição de pronto (capstone)

- [ ] `make up` sobe tudo do zero em cluster limpo, sem passo manual
- [ ] Deploy sob carga com **zero 5xx** medidos por um gerador externo
- [ ] `kubectl auth can-i --as=...` nega o que deve negar, e o teste está no repo
- [ ] Policy bloqueia imagem sem digest e sem assinatura
- [ ] Restore do namespace inteiro feito de verdade, com RTO medido e anotado
- [ ] NetworkPolicy default-deny ativa, com o negado comprovado por teste
- [ ] Runbook diz como pausar o Argo CD antes de mitigar um incidente à mão
- [ ] Uma ADR por bloco: topologia do cluster, borda, segurança do workload, GitOps e DR

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Matar um pod durante um pagamento.** O cliente vê erro? O pagamento aconteceu?
2. **Drenar um nó** com o PDB ativo. O drain completa ou trava — e você sabe dizer por quê?
3. **Derrubar o antifraude** e observar a readiness do `pix-gateway`. Se tudo ficou
   NotReady junto, a sua readiness está checando o mundo em vez de si mesma.
4. **Estourar a memória** de um contêiner e ver o OOMKill. Quem mais foi despejado do nó?
5. **Quebrar uma policy de propósito** (subir imagem sem assinatura) e confirmar que a
   admissão nega — e que o alerta disso chega em algum lugar.
