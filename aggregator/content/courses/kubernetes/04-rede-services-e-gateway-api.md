---
id: rede-e-gateway-api
title: "Rede: Service, DNS e Gateway API"
summary: "Como um IP virtual vira um pod real, por que o ecossistema saiu do Ingress, e o que muda no antifraude quando você perde o IP de origem."
estimatedMinutes: 50
references:
  - title: "Kubernetes — Service"
    url: https://kubernetes.io/docs/concepts/services-networking/service/
  - title: "Gateway API"
    url: https://gateway-api.sigs.k8s.io/
  - title: "Kubernetes — DNS for Services and Pods"
    url: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
---

## O que um Service realmente é

Um Service **não é um processo**. Não existe proxy escutando naquele IP. O ClusterIP é
um endereço virtual que só tem sentido dentro do cluster: o kube-proxy (ou o CNI)
programa regras em cada nó que reescrevem o destino para o IP de um pod real. O
balanceamento acontece **na origem**, no nó de quem chamou.

Isso explica dois comportamentos que confundem: o ClusterIP não responde a `ping`, e
não existe um lugar central para "ver o tráfego do Service" — ele está distribuído em
todos os nós.

Os tipos, e para que servem de verdade:

- **ClusterIP** — o padrão, interno. É o que você usa entre serviços.
- **NodePort** — abre a mesma porta em todos os nós. Bloco de construção, não solução.
- **LoadBalancer** — pede um balanceador ao provedor de nuvem. **No `kind` não existe
  provedor**, então o Service fica `<pending>` para sempre. É a diferença de nuvem mais
  visível da trilha; localmente, use o port-forward ou o `extraPortMappings` do `kind`.
- **Headless** (`clusterIP: None`) — sem IP virtual: o DNS devolve os IPs dos pods
  diretamente. É como StatefulSet e clientes que fazem seu próprio balanceamento (Kafka,
  gRPC) funcionam. Volta no marco 08.

O **EndpointSlice** é a lista de destinos vivos, mantida por um controller que observa
os pods que casam com o selector **e** que estão `Ready` (marco 06). É por isso que
readiness é o que tira um pod do balanceamento — não a liveness.

### `kube-proxy`: iptables, IPVS, eBPF

- **iptables** — regras lineares; a avaliação degrada com milhares de Services, e a
  atualização de regra é uma reescrita de tabela.
- **IPVS** — hashing em kernel, escala melhor, mais algoritmos de balanceamento.
- **eBPF** (Cilium e afins) — substitui o kube-proxy inteiro, programa o datapath
  direto. É para onde o ecossistema está indo e o que torna viáveis as policies L7 do
  marco 11.

Para o `fin-platform` local, o padrão serve. O que importa saber é que essa escolha é
do cluster, não da sua app, e que ela aparece no p99 quando o número de Services cresce.

### DNS

`pix-gateway.payments.svc.cluster.local` — serviço, namespace, tipo, domínio. Dentro do
namespace, `pix-gateway` basta.

A pegadinha que consome tarde de debug: o `ndots:5` do `/etc/resolv.conf` faz cada nome
externo ser tentado primeiro com todos os sufixos de busca. `api.psp.com.br` vira 4 ou
5 consultas falhas antes da certa. Em serviço chatty com parceiro externo isso aparece
como latência inexplicável — e a correção é o FQDN com ponto final
(`api.psp.com.br.`) ou `dnsConfig` com `ndots` menor. É também a razão de o DNS ser a
primeira coisa a quebrar quando você liga NetworkPolicy default-deny (marco 11).

## Gateway API, e por que o Ingress ficou para trás

O Ingress resolveu entrada L7 por quase uma década, com um defeito estrutural: a
especificação cobria pouco, então **tudo de real virava anotação proprietária**.
Timeout, rewrite, CORS, mTLS, rate limit — cada controller com seu dialeto. Na prática,
o seu Ingress não era portável, e ninguém conseguia evoluir o padrão sem quebrar
alguém.

A **Gateway API** reorganiza isso em objetos com donos diferentes — o que é uma decisão
de *governança* tanto quanto de rede:

| Objeto | Quem é o dono | O que declara |
| --- | --- | --- |
| `GatewayClass` | plataforma | qual implementação (Envoy, NGINX Gateway Fabric, Cilium…) |
| `Gateway` | plataforma | os listeners: porta, protocolo, certificado, quem pode anexar |
| `HTTPRoute` | **o time da aplicação** | hostname, path, header, peso, backend |

O time de pagamentos edita `HTTPRoute` no seu namespace sem tocar em nada compartilhado,
e a plataforma controla o que pode ser anexado ao Gateway. Roteamento por header,
split por peso e timeouts são **campos da spec**, não anotações — o que os torna
revisáveis num PR e verificáveis por policy.

E há o fato consumado do marco 01: **o Ingress NGINX foi aposentado pelo projeto em
março de 2026**. Não há caminho "esperar para ver". Conteúdo novo se escreve em
Gateway API.

## Borda: TLS, timeouts e o IP de origem

**TLS** termina no Gateway, com o certificado num Secret referenciado pelo listener
(cert-manager renovando). Se o requisito for mTLS de ponta a ponta, o Gateway
revalida e repassa a identidade do cliente adiante por header — e aí o service mesh do
marco 11 entra.

**Timeouts na borda** existem para proteger o cluster de cliente lento. O erro comum é
o timeout da borda ser **menor** que o do backend: o cliente recebe 504, o backend
continua processando e conclui o pagamento. O usuário vê erro, o dinheiro saiu. A
regra é: timeout da borda ≥ timeout do backend, e a operação precisa ser idempotente
de qualquer jeito.

**`externalTrafficPolicy`** é o campo que mais gente descobre tarde demais:

- `Cluster` (padrão) — o tráfego pode ser reencaminhado para um pod em outro nó, e esse
  segundo salto faz **SNAT**: o backend vê o IP do nó, não o do cliente.
- `Local` — só entrega a pods do nó que recebeu, preservando o IP de origem, ao custo
  de balanceamento desigual (nó sem pod não recebe nada).

Isso **não é detalhe de rede**: se o antifraude decide por IP, ou se o rate limit conta
por IP, `Cluster` faz todos os clientes parecerem os mesmos 3 endereços. O rate limit
para de funcionar ou bloqueia todo mundo junto. Onde há proxy antes (CDN, LB L7), a
resposta costuma ser `X-Forwarded-For` com uma lista de proxies confiáveis
configurada — e **só** confiar no header quando ele vem de um proxy conhecido, senão
o cliente forja o próprio IP.

## Exemplo numa fintech

Exposição mínima: no `fin-platform`, um único Gateway público. O `ledger-core` e o
antifraude **não têm rota** — são alcançáveis só por ClusterIP interno, e o marco 11
transforma isso em garantia com NetworkPolicy em vez de convenção.

A API de iniciação de pagamento fica atrás do Gateway com **mTLS na borda**: o parceiro
apresenta certificado, o Gateway valida contra a CA da instituição e injeta a
identidade num header que o `pix-gateway` usa para autorizar. É a contraparte de
infraestrutura do marco FAPI da trilha Spring Boot — lá é o token e a assinatura, aqui
é quem consegue abrir a conexão.

## Hands-on

**Tutorial — Gateway + HTTPRoute com canary.** No `fin-platform`:

1. Instale uma implementação de Gateway API no `kind` (NGINX Gateway Fabric ou
   Envoy Gateway) e crie um `Gateway` com listener HTTPS e certificado do cert-manager.
2. `HTTPRoute` roteando `/payments` para o Service `pix-gateway`.
3. Suba `pix-gateway-v2` e mude o `backendRefs` para dois backends com
   `weight: 90` / `weight: 10`.
4. Dispare 1.000 requisições e conte por versão. **Bata a distribuição contra os pesos**
   — se não bater ~90/10, entenda por quê antes de seguir (dica: `endpointslices` e
   número de réplicas de cada versão).
5. Adicione uma segunda `HTTPRoute` que roteia para v2 **só** quando o header
   `x-canary: true` estiver presente — o padrão que permite testar em produção com
   tráfego interno.
6. `git commit`.

**Desafio — o IP de origem.** Com o Gateway no ar, faça o `pix-gateway` logar o IP que
ele enxerga. Compare com `externalTrafficPolicy: Cluster` e `Local`. Depois escreva
**meia página**: se o antifraude bloqueia por IP e o rate limit conta por IP, qual das
duas configurações você escolhe, o que você perde nela, e como você trataria
`X-Forwarded-For` sem permitir que o cliente forje o próprio endereço.

**Checagem.** (a) Por que o `Service type: LoadBalancer` fica `<pending>` no `kind`, e o
que isso ensina sobre o que a nuvem faz? (b) O timeout do Gateway é menor que o do
backend e o cliente recebeu 504 — o pagamento aconteceu? (c) Por que a Gateway API
separa `Gateway` de `HTTPRoute` em vez de ter um objeto só?

## Principais aprendizados

- Service é regra de rede, não processo; EndpointSlice é a lista de pods `Ready`, e
  readiness é o que tira do balanceamento.
- Gateway API separa plataforma (Gateway) de aplicação (HTTPRoute) e traz para a spec o
  que no Ingress era anotação proprietária — e o Ingress NGINX foi aposentado em 2026.
- Timeout de borda menor que o do backend produz 504 com o pagamento concluído.
- `externalTrafficPolicy` decide se você enxerga o IP do cliente — o que quebra rate
  limit e antifraude quando escolhido sem pensar.
