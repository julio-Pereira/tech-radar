---
id: observabilidade-e-debug
title: "Observabilidade e debugging"
summary: "As camadas de métrica que se confundem, alerta por sintoma e burn rate, e a árvore de decisão para os cinco estados de pod que você vai encontrar."
estimatedMinutes: 50
references:
  - title: "Kubernetes — Debug Running Pods"
    url: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/
  - title: "Prometheus Operator — Documentation"
    url: https://prometheus-operator.dev/docs/getting-started/introduction/
  - title: "Google SRE Workbook — Alerting on SLOs"
    url: https://sre.google/workbook/alerting-on-slos/
---

## Três camadas que as pessoas confundem

Quando alguém diz "temos monitoramento do Kubernetes", pode ser qualquer uma destas — e
elas respondem a perguntas diferentes:

1. **Cluster e nós** — `kube-state-metrics` (o estado dos *objetos*: quantos pods
   `Ready`, qual Deployment está desatualizado, PDB violado) e `cAdvisor`/`node-exporter`
   (o consumo *real*: CPU, memória, disco, o throttling do marco 05).
2. **Plataforma** — Gateway, CoreDNS, o próprio Kafka: componentes que você opera e que
   não são a sua aplicação.
3. **Aplicação** — RED do `pix-gateway`, e as métricas de negócio.

A confusão custa caro quando o alerta olha a camada errada. "Pod reiniciando" (camada 1)
não é incidente se o serviço está atendendo; "taxa de autorização caiu" (camada 3) é
incidente mesmo com todos os pods `Ready` e a CPU tranquila.

`kube-state-metrics` e `cAdvisor` são complementares, não alternativos: o primeiro diz o
que o cluster *acha* que existe, o segundo o que está *acontecendo*. A divergência entre
os dois é frequentemente o próprio diagnóstico.

## Coleta: ServiceMonitor e OTel Collector

O **Prometheus Operator** torna a coleta declarativa: em vez de editar a configuração
central do Prometheus a cada serviço novo, cada time entrega um `ServiceMonitor` junto do
seu Deployment.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: pix-gateway
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: pix-gateway
  endpoints:
    - port: metrics
      interval: 30s
```

É o padrão do marco 02 de novo: **labels são o join**. Selector errado significa
serviço sem métrica nenhuma, sem erro em lugar nenhum — e ninguém nota até precisar do
gráfico durante um incidente. Um alerta de "target esperado ausente" é o que fecha esse
buraco.

O **OpenTelemetry Collector** é o pipeline único para traces, métricas e logs (a trilha
de observabilidade detalha nos marcos 05–06). No cluster, o padrão é `DaemonSet` como
agente por nó, com o `k8sattributes` processor enriquecendo tudo com `k8s.pod.name`,
`k8s.namespace.name` e labels — é o que liga a telemetria da aplicação ao objeto do
Kubernetes.

**Logs** vão para um agregador (Loki, Elastic) via agente no nó lendo
`/var/log/containers/`. E a regra que evita descobrir tarde: **log de container é
efêmero.** Se o pod morre e o log não saiu do nó, ele não existe mais — e o pod que morreu
é exatamente o que você quer investigar. `kubectl logs --previous` salva o container
anterior do *mesmo* pod, e só até o pod sumir.

## Alertar por sintoma, não por causa

O alerta de "CPU acima de 80%" é o exemplo canônico do que não fazer: dispara em
madrugada de batch sem incidente nenhum, e fica calado durante o incidente real de
I/O-bound (marco 07).

A regra: **alerte pelo que o usuário sente.** Taxa de erro do `POST /payments`, latência
p99 acima do orçado, fila de liquidação crescendo. Causa vai para o dashboard e para o
runbook, não para o pager.

**Burn rate** é a forma madura: em vez de "erro acima de 1%", alerte por *quão rápido o
error budget está sendo consumido* (marcos 12–13 da trilha de observabilidade). Duas
janelas combinadas — uma curta para pegar o incidente agudo, uma longa para pegar a
degradação lenta — evitam tanto o alerta que grita por um pico de 30 segundos quanto o
silêncio de uma queda de 0,5% que consome o mês inteiro.

Os **golden signals** (latência, tráfego, erros, saturação) dão o esqueleto para cada
serviço, e a saturação é a única que avisa antes.

## A árvore de decisão do pod quebrado

Cinco estados cobrem quase tudo. O valor está em saber **qual comando responde a qual**:

| Estado | Causa provável | Primeiro comando |
| --- | --- | --- |
| `Pending` | nenhum nó satisfaz requests/affinity/taints; PVC sem volume | `kubectl describe pod` → seção Events, mensagem do scheduler |
| `ImagePullBackOff` | tag inexistente, registry privado sem credencial, digest errado | `describe` → o erro do pull é literal |
| `CrashLoopBackOff` | app morre no boot; config faltando; liveness matando | `kubectl logs --previous` |
| `OOMKilled` (exit 137) | limite de memória baixo ou vazamento | `describe` → `lastState.terminated.reason` |
| `Evicted` | pressão de recurso no nó; QoS `BestEffort` primeiro | `describe node` → conditions |

O reflexo certo é sempre o mesmo, e é o do marco 01: **leia o `status` e os events antes
de mudar qualquer coisa.** O Kubernetes quase sempre já escreveu o motivo; o problema é
que ninguém abriu o `describe`.

Para o caso em que os logs não bastam, **ephemeral containers**:

```bash
kubectl debug -it pix-gateway-7f9-x2k --image=nicolaka/netshoot --target=pix-gateway
```

Isso injeta um container com ferramentas de rede **no pod que está rodando**,
compartilhando o namespace de processo do container alvo — sem reiniciar nada e sem
precisar de shell na imagem de produção. É o que torna a imagem distroless do marco 09
viável: você não perde a capacidade de debugar, só a move para fora da imagem.

E `kubectl debug node/<nó>` dá um pod privilegiado no nó, para quando o problema é do nó
e não do pod.

## Exemplo numa fintech

Métrica de negócio no **mesmo painel** da infra. O painel de plantão do `fin-platform`
tem, lado a lado:

- TPV por minuto e **taxa de autorização por PSP** (o sinal que pega o incidente
  silencioso).
- Taxa de erro e p99 do `POST /payments`.
- Lag do consumidor do ledger.
- Saturação: pool Hikari, throttling de CPU, memória por pod.

A razão de estarem juntos é a correlação em tempo de incidente. "A taxa de autorização
caiu 20% às 14h07" ao lado de "o p99 do PSP subiu às 14h06" resolve em segundos o que
levaria meia hora em três abas separadas.

E o número que importa politicamente: quando o painel mostra R$ por minuto ao lado da
taxa de erro, a conversa sobre confiabilidade deixa de ser técnica.

## Hands-on

**Desafio — diagnosticar em ≤5 comandos.** Peça a alguém (ou escreva um script) que
quebre o `pix-gateway` de uma destas formas, sem te contar qual:

1. `requests.memory` maior que qualquer nó tem livre.
2. Tag de imagem inexistente.
3. Variável de ambiente obrigatória removida (a app morre no boot).
4. `limits.memory` reduzido a 64Mi.
5. Selector do Service alterado (marco 02).

**Invariantes testáveis:**

- Você identifica a causa em **no máximo 5 comandos**, e todos são de **leitura** —
  nenhum `edit`, nenhum `delete`.
- Registre a sequência exata usada em cada caso. Ao final, compare as cinco sequências:
  as três primeiras devem começar pelo mesmo comando. Se você começou diferente em cada
  uma, você está adivinhando, não diagnosticando.

**Complemento — o post-mortem de uma página.** Escolha um dos casos e escreva em
`docs/postmortem/`: linha do tempo (detecção, diagnóstico, mitigação), impacto
(quantos pagamentos, quanto TPV), causa raiz, **por que não foi detectado antes**, e uma
ação de prevenção. Sem nome de pessoa em lugar nenhum — post-mortem investiga o sistema.

**Complemento — o alerta que não deveria existir.** Configure um alerta de CPU > 80% e um
alerta de taxa de erro > 1%. Rode uma carga de batch pesada e veja qual dispara. Depois
degrade o PSP (com latência artificial) e veja qual dispara. Escreva 5 linhas sobre qual
dos dois você levaria para o pager.

**Checagem.** (a) Um pod está `Pending` há 10 minutos e nada nos logs — onde está a
resposta? (b) Por que `kubectl logs` não ajuda num `CrashLoopBackOff` e o que você usa?
(c) Como debugar rede num pod cuja imagem é distroless? (d) Por que "pod reiniciando" pode
não ser incidente e "taxa de autorização caiu" é?

## Principais aprendizados

- `kube-state-metrics` (o que o cluster acha) e `cAdvisor` (o que acontece) são
  complementares — a divergência entre os dois costuma ser o diagnóstico.
- ServiceMonitor torna a coleta declarativa e herda o problema de label errado: métrica
  ausente sem erro nenhum.
- Alerte por sintoma e burn rate; causa vai para dashboard e runbook, não para o pager.
- `describe` e events antes de qualquer mudança; ephemeral containers são o que tornam a
  imagem mínima debugável.
