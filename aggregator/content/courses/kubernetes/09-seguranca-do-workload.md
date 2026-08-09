---
id: seguranca-workload
title: "Segurança do workload e da imagem"
summary: "Pod Security Standards restricted, por que o container não é fronteira forte, supply chain com digest e assinatura, e admission control que bloqueia em vez de avisar."
estimatedMinutes: 55
references:
  - title: "Kubernetes — Pod Security Standards"
    url: https://kubernetes.io/docs/concepts/security/pod-security-standards/
  - title: "Kyverno — Policy Documentation"
    url: https://kyverno.io/docs/
  - title: "Sigstore — cosign"
    url: https://docs.sigstore.dev/cosign/signing/overview/
  - title: "Kubernetes — Admission Controllers Reference"
    url: https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/
---

## O container não é fronteira de segurança forte

Comece por aqui, porque tudo o mais decorre disso.

Uma VM tem hipervisor: kernels separados, isolamento de hardware. Um container tem
**namespaces e cgroups sobre o mesmo kernel**. Uma vulnerabilidade de kernel derruba a
separação — e não é hipotético, é uma classe de CVE recorrente.

Consequência prática: um container comprometido com root e capabilities amplas está a
uma escalada de distância do **nó inteiro**, e do nó você chega aos Secrets de todos os
pods que rodam ali (marco 03) e ao token da ServiceAccount deles (marco 10).

Isso não significa que containers sejam inseguros — significa que a defesa é **em
camadas** e a primeira camada é reduzir o que o container pode fazer. Onde o isolamento
precisa ser forte de verdade (rodar código de terceiros, multi-tenancy hostil), a
resposta é sandbox com kernel próprio (gVisor, Kata) ou clusters separados — não uma
configuração melhor de Pod.

## Pod Security Standards

Três perfis, aplicados por namespace via labels — o Pod Security Admission é embutido,
não precisa instalar nada:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: payments
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.36
    pod-security.kubernetes.io/warn: restricted
```

- **`privileged`** — sem restrição. É o padrão se você não fizer nada.
- **`baseline`** — bloqueia o obviamente perigoso: `privileged: true`, hostNetwork,
  hostPID, hostPath.
- **`restricted`** — o que uma fintech usa. Exige, entre outros:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true          # não faz parte do restricted, mas deveria
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```

O que cada um compra:

- **`runAsNonRoot`** — root no container é root no kernel do nó (sem user namespaces). É
  a linha mais valiosa da lista.
- **`allowPrivilegeEscalation: false`** — impede o `setuid` que recupera privilégio.
- **`capabilities: drop: ALL`** — o container roda com dezenas de capabilities por
  padrão; quase nenhuma app precisa de qualquer uma. Se precisar de uma
  (`NET_BIND_SERVICE` para porta <1024), adicione **só** ela — ou melhor, escute na 8080.
- **`seccompProfile: RuntimeDefault`** — filtra chamadas de sistema perigosas. Uma linha,
  quase sem custo, e frequentemente esquecida.
- **`readOnlyRootFilesystem`** — impede o atacante de escrever binário no container. Exige
  `emptyDir` montado onde a app escreve de fato (`/tmp`, `/var/run`).

A adoção real é a parte que dói: aplicar `restricted` num namespace existente quebra
metade dos workloads. O caminho é `warn` primeiro (avisa sem bloquear), consertar, e só
então `enforce`. É o que o tutorial deste marco faz.

## Supply chain: o que você está de fato executando

**Imagem mínima.** Distroless ou `scratch` para binário estático (Go — trilha
`go-fintech` — compila para isso naturalmente). Menos pacote = menos CVE = menos
superfície. Bônus operacional: imagem pequena baixa rápido, o que encurta o cold start do
marco 07. O contra: sem shell, você não faz `kubectl exec` para debugar — e a resposta
para isso são ephemeral containers (marco 12), não uma imagem gorda.

**Pin por digest, não por tag.** Tag é ponteiro mutável: `v1.4.2` pode apontar para outro
conteúdo amanhã, e `:latest` é uma promessa de não-reprodutibilidade.

```yaml
image: ghcr.io/fin/pix-gateway@sha256:9c8f2e...   # imutável, verificável
```

É a mesma exigência do marco 03 (mesma imagem promovida entre ambientes); aqui ela deixa
de ser convenção e passa a ser **bloqueada por policy**.

**Scanning** (Trivy, Grype) no pipeline e **de novo periodicamente no registry** — CVE
nova aparece em imagem antiga que já passou. Scan só no build significa que você
descobre a vulnerabilidade quando fizer o próximo deploy, o que pode ser em três meses.

**SBOM** — a lista de tudo o que está dentro. O valor aparece no dia do incidente: sai
uma CVE crítica numa biblioteca, e a pergunta é "quais dos nossos 60 serviços têm isso?".
Com SBOM é uma consulta; sem, é uma semana de arqueologia.

**Assinatura com cosign/Sigstore** — assine no build, **verifique na admissão**. Sem a
verificação na admissão, a assinatura é decorativa: ela prova a origem para quem se der
ao trabalho de checar, e ninguém se dá.

## Admission control: bloquear, não avisar

Toda requisição passa pelo API server (marco 01) e, antes de persistir, por webhooks de
admissão: **mutating** (altera o objeto — injeta sidecar, adiciona label) e
**validating** (aceita ou rejeita).

É aqui que a política vira controle real. Kyverno (policy em YAML) ou Gatekeeper/OPA
(policy em Rego) — para a maioria dos times, Kyverno é mais barato de manter porque a
policy se parece com o resto do repositório.

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: exigir-imagem-por-digest
spec:
  validationFailureAction: Enforce        # Audit apenas registra; Enforce bloqueia
  rules:
    - name: digest-obrigatorio
      match:
        any:
          - resources:
              kinds: [Pod]
              namespaces: ["payments", "ledger"]
      validate:
        message: "Imagem precisa ser referenciada por digest (@sha256:)."
        pattern:
          spec:
            containers:
              - image: "*@sha256:*"
```

A distinção que decide se isso vale alguma coisa: **`Audit` registra, `Enforce`
bloqueia.** Uma policy em `Audit` é um relatório que ninguém lê. A migração honesta é
`Audit` → corrigir os achados → `Enforce`, com data marcada — senão o `Audit` vira
permanente.

Três cuidados operacionais que separam quem já rodou isso em produção:

- **`failurePolicy`.** Se o webhook do Kyverno cair e a policy for `Fail`, **nenhum pod
  sobe no cluster** — inclusive o próprio Kyverno, se ele reiniciar. Exclua os namespaces
  de sistema e entenda que essa escolha é entre disponibilidade e segurança.
- **Policy que muta** (mutating) é poderosa e traiçoeira: ela faz o objeto no cluster ser
  diferente do objeto no Git, e o Argo CD (marco 13) vai reportar drift para sempre.
- **Teste a policy** como código. Kyverno tem CLI (`kyverno test`) com casos de
  aceitação e rejeição — e o caso de **rejeição** é o que importa.

## Exemplo numa fintech

A auditoria pergunta: *"como vocês garantem que nenhum container roda como root em
produção?"*.

A resposta ruim é o wiki com a norma. A boa é: `enforce: restricted` no namespace, mais
uma `ClusterPolicy` em `Enforce`, mais o teste no pipeline que prova a rejeição, mais o
`PolicyReport` que lista o estado atual de cada workload. **A política é o controle
auditável; o wiki não é** — e a diferença é que a política é impossível de burlar sem
deixar rastro no Git.

No `fin-platform`, o conjunto mínimo de policies em `Enforce`:

1. Imagem por digest, de registry na allowlist.
2. Assinatura cosign verificada.
3. `runAsNonRoot` e `drop: ALL` (redundante com o PSS — redundância aqui é barata).
4. `requests` e `limits.memory` obrigatórios (evita `BestEffort`, marco 05).
5. Label `fin.io/data-classification` presente (marco 02) — governança que se aplica
   sozinha.

## Hands-on

**Tutorial — aplicar `restricted` e consertar.** No `fin-platform`:

1. Ponha `pod-security.kubernetes.io/warn: restricted` no namespace `payments`. Aplique
   os manifestos e **leia os avisos** — essa lista é o seu trabalho.
2. Conserte o `pix-gateway` até não haver aviso: usuário não-root na imagem
   (`USER 10001` no Dockerfile), `securityContext` completo, `emptyDir` em `/tmp` para o
   `readOnlyRootFilesystem`, porta 8080 em vez de 80.
3. Troque `warn` por `enforce`. Prove que um Pod com `runAsUser: 0` é **rejeitado na
   criação**, com a mensagem do PSS.
4. `git commit`.

**Desafio — a policy que bloqueia.** Escreva a `ClusterPolicy` Kyverno que rejeita imagem
sem digest.

**Invariantes testáveis** — as três, e a segunda é a que a maioria esquece:

1. `kubectl apply` de um Deployment com `image: nginx:latest` **falha**, e a mensagem de
   erro cita a policy pelo nome.
2. `kubectl apply` do mesmo Deployment com `image: nginx@sha256:...` **passa**. (Policy
   que bloqueia tudo não é policy, é indisponibilidade.)
3. Um teste automatizado (`kyverno test`) com os dois casos, rodando no pipeline. Sem
   isso, a policy quebra no dia em que alguém a editar e ninguém vai saber.

**Complemento — assinatura.** Assine a imagem do `pix-gateway` com `cosign sign` e
adicione a policy `verifyImages`. Prove que uma imagem **não assinada** é rejeitada.
Depois responda por escrito: se o registry for comprometido e o atacante substituir a
imagem mantendo a tag, o que te protege — o digest, a assinatura, ou os dois, e por quê?

**Checagem.** (a) Por que root no container é root no nó? (b) `Audit` vs `Enforce` —
qual é o valor real de uma policy em `Audit` por seis meses? (c) O webhook do Kyverno caiu
com `failurePolicy: Fail`: o que acontece no cluster? (d) Você tem SBOM de tudo e sai uma
CVE crítica no OpenSSL — qual a diferença no seu dia?

## Principais aprendizados

- Container compartilha o kernel do nó: a defesa é em camadas, e `runAsNonRoot` +
  `drop: ALL` + seccomp é a primeira delas.
- `restricted` se adota com `warn` → consertar → `enforce`; aplicar direto quebra
  workload.
- Digest em vez de tag, imagem mínima, scanning recorrente, SBOM e assinatura
  **verificada na admissão** — assinatura sem verificação é decoração.
- Policy em `Enforce` é o controle auditável que o wiki nunca foi; teste o caso de
  rejeição, e cuide do `failurePolicy` para não travar o cluster.
