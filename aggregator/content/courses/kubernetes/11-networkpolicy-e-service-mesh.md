---
id: rede-segura
title: "NetworkPolicy e service mesh"
summary: "Default-deny como ponto de partida, o DNS que quebra primeiro, controle de egress para parceiros, e o custo real de adotar uma malha."
estimatedMinutes: 50
references:
  - title: "Kubernetes — Network Policies"
    url: https://kubernetes.io/docs/concepts/services-networking/network-policies/
  - title: "Cilium — Network Policy"
    url: https://docs.cilium.io/en/stable/security/policy/
  - title: "Istio — Ambient Mode"
    url: https://istio.io/latest/docs/ambient/overview/
---

## O padrão do Kubernetes é rede plana

Sem NetworkPolicy, **todo pod fala com todo pod**, em qualquer namespace. O pod de
relatórios alcança o banco do ledger; o antifraude alcança a internet inteira. Namespace
separa nomes e RBAC (marco 10), **não** tráfego.

Numa fintech isso é indefensável: um RCE em qualquer container vira reconhecimento
lateral livre do ambiente inteiro. A microsegmentação é o que limita o blast radius de um
comprometimento — a mesma ideia de contenção do marco 05, aplicada à rede.

Antes de tudo, uma pré-condição que já derrubou muita gente: **NetworkPolicy só funciona
se o CNI a implementar.** Calico, Cilium, Antrea implementam; alguns CNIs simples
**aceitam o objeto e o ignoram silenciosamente**. Você aplica a policy, `kubectl get`
mostra que ela existe, e nada é bloqueado. O primeiro teste de qualquer trabalho de
NetworkPolicy é provar que uma conexão é de fato negada.

## Default-deny primeiro

A ordem correta é negar tudo e abrir o necessário — o contrário nunca converge, porque
ninguém sabe listar o que deveria ser proibido.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: payments
spec:
  podSelector: {}                  # todos os pods do namespace
  policyTypes: [Ingress, Egress]
```

Sem `ingress:` nem `egress:` declarados, nada entra e nada sai.

A semântica que confunde: policies são **aditivas e sem `deny`** — igual ao RBAC. Um pod
selecionado por qualquer policy passa a ser "isolado", e o tráfego permitido é a **união**
de todas as regras que o selecionam. Não existe policy que bloqueie algo já permitido por
outra; para fechar, é preciso remover a permissão.

E as regras são **por direção**: liberar a saída de A não libera a entrada em B. Toda
conexão precisa de egress na origem **e** ingress no destino. Metade dos "por que não
funciona" é isso.

## O DNS é a primeira coisa que quebra

Aplique default-deny e observe: tudo para de funcionar, com erro de resolução de nome. O
egress bloqueado impede o pod de alcançar o CoreDNS.

```yaml
egress:
  - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
        podSelector:
          matchLabels:
            k8s-app: kube-dns
    ports:
      - port: 53
        protocol: UDP
      - port: 53
        protocol: TCP
```

TCP junto com UDP: resposta grande cai para TCP e a falha resultante é intermitente — o
pior tipo. Vale lembrar o `ndots:5` do marco 04: um nome externo gera várias consultas, e
com DNS bloqueado o sintoma é latência antes de ser erro.

Faça disso uma policy compartilhada aplicada a todo namespace, ou você vai reescrevê-la
para sempre.

## Egress: o lado que quase todo mundo ignora

Ingress é intuitivo. **Egress é o que importa numa fintech**, por dois motivos: é o
caminho da exfiltração de dados, e é o que os parceiros exigem.

```yaml
egress:
  - to:
      - ipBlock:
          cidr: 200.155.10.0/24     # faixa do PSP
    ports: [{ port: 443, protocol: TCP }]
```

Duas dores reais:

- **NetworkPolicy nativa trabalha com IP/CIDR, não com nome.** O PSP publica
  `api.psp.com.br`, cujo IP muda. Ou você mantém uma lista de CIDRs (frágil, e o parceiro
  não avisa), ou usa a extensão de FQDN do seu CNI (Cilium tem `toFQDNs`) — que é
  proprietária, mas é a resposta prática.
- **O parceiro cadastrou o *seu* IP de saída.** Por padrão, o tráfego sai com o IP do nó,
  e os nós mudam a cada escala. A solução é um **egress gateway** (Cilium, Istio, ou um
  NAT dedicado): todo o tráfego para o PSP sai por um IP fixo, que é o que está no
  cadastro do parceiro. Sem isso, escalar o cluster quebra a integração — e o modo de
  falha é "funciona para alguns pods".

## Service mesh: o que ganha e o que custa

A malha entrega, sem tocar na aplicação:

- **mTLS automático** entre todos os serviços, com rotação de certificado. Criptografia em
  trânsito dentro do cluster e **identidade criptográfica** por serviço — que é a peça que
  a NetworkPolicy não dá: policy baseada em IP confia no IP, e IP em Kubernetes é
  reciclado.
- **Retry, timeout, circuit breaking e outlier detection** por configuração.
- **Observabilidade L7 uniforme** — RED de todo serviço sem instrumentar nada (ponte com
  a trilha de observabilidade, marco 03).
- **Autorização L7**: "o serviço A pode chamar `GET /saldo`, mas não `POST /transfer`" —
  granularidade que NetworkPolicy (L3/L4) não alcança.

O custo real, sem marketing:

- **Sidecar** — um proxy por pod: latência extra por salto (~1ms, mas em cadeia de 5
  serviços são 10 saltos), memória e CPU por pod, e o problema clássico do sidecar que
  não termina junto com a app, quebrando o shutdown do marco 06 (sidecars nativos do
  Kubernetes resolvem isso, mas exigem versão recente e configuração correta).
- **Ambient mode** (Istio) — sem sidecar por pod: um proxy L4 por nó e um proxy L7 apenas
  onde a política L7 for necessária. Reduz bastante o custo, e é mais novo.
- **Complexidade operacional.** É outro plano de controle para operar, atualizar e
  debugar. Quando algo quebra, agora há mais uma camada onde procurar — e ela é a menos
  familiar do time.

**Quando não vale:** menos de ~10 serviços; time sem alguém que queira dominar Envoy; ou
quando o requisito real é só criptografia em trânsito — que TLS na aplicação resolve com
menos peças. A pergunta honesta é *qual dos quatro ganhos acima nós vamos usar de fato nos
próximos 6 meses?*. Se a resposta é "mTLS", comece por NetworkPolicy + TLS na app e
reavalie.

## Exemplo numa fintech

Microsegmentação no `fin-platform`:

- O **serviço de auditoria** não fala com o mundo: egress só para o banco e para o DNS.
  Sem internet, por design — o dado que ele guarda é o que mais interessa a um atacante.
- O **antifraude** aceita ingress só do `pix-gateway`, e egress só para o Kafka e para o
  bureau externo.
- O **ledger** aceita ingress do `pix-gateway` e do consumidor; **nada** do namespace de
  ferramentas internas.
- Todo egress para PSP sai pelo **gateway de IP fixo**, cadastrado no parceiro.

E a verificação que fecha o marco 10: as policies **são** a evidência de segregação de
rede que a auditoria pede — legíveis, versionadas em Git, com PR e revisor.

## Hands-on

**Tutorial — default-deny e o caminho mínimo.** No namespace `payments`:

1. **Antes de qualquer policy**, prove que o CNI as implementa: aplique um default-deny
   num namespace de teste e confirme que uma conexão falha. Se não falhar, pare — o resto
   do exercício é ilusório.
2. Aplique `default-deny-all` em `payments`. Confirme que tudo quebrou.
3. Libere o DNS. Confirme que a resolução volta e o resto continua bloqueado.
4. Libere, um de cada vez, **só** o caminho `gateway → pix-gateway → kafka`, testando a
   cada passo com `kubectl exec ... -- curl` (ou `nc -zv`) a partir de um pod de teste.
5. `git commit` com as policies comentadas — por que cada regra existe.

**Invariantes testáveis:**

- `gateway → pix-gateway:8080` → **conecta**.
- `pix-gateway → kafka:9092` → **conecta**.
- `pod-de-teste → pix-gateway:8080` → **timeout** (não "connection refused" — timeout é a
  assinatura de policy bloqueando; refused significa que o pacote chegou).
- `pix-gateway → api.psp.com.br:443` → **timeout**, até você liberar o egress
  explicitamente.
- `ledger-core → internet` → **timeout**.

Escreva as cinco como um script `make verify-network`, incluindo as **negativas**. Como no
marco 10, é a asserção de negação que prova a segurança; a de conexão só prova que não
quebrou.

**Complemento — a ADR do mesh.** Escreva `docs/adr/00X-service-mesh.md` para o
`fin-platform`: adotar ou não. Liste os quatro ganhos, marque quais vocês usariam nos
próximos 6 meses, estime o custo (latência por salto na sua cadeia mais longa, memória por
pod × nº de pods, quem opera), e defina o gatilho que faria a decisão mudar.

**Checagem.** (a) Você aplicou a policy e nada foi bloqueado — qual a primeira hipótese?
(b) Por que é preciso liberar TCP **e** UDP na porta 53? (c) Por que o parceiro reclama
que "às vezes o IP não é o cadastrado"? (d) Qual capacidade o mesh dá que NetworkPolicy
não dá, mesmo com o CNI mais avançado?

## Principais aprendizados

- Sem NetworkPolicy a rede é plana; default-deny é o ponto de partida, e policies são
  aditivas, sem `deny`, e por direção.
- DNS quebra primeiro (TCP e UDP na 53), e o CNI precisa implementar policy — prove a
  negação antes de confiar.
- Egress é o lado que a fintech precisa: FQDN é extensão do CNI, e o IP fixo de saída é
  requisito de integração com parceiro.
- Mesh entrega mTLS com identidade, resiliência e L7 por configuração; o custo é latência,
  recursos e mais um plano de controle — decida pelos ganhos que serão usados.
