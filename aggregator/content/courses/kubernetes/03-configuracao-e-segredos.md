---
id: configuracao-e-segredos
title: "Configuração, segredos e 12-factor"
summary: "Secret é base64, não criptografia; segredos de verdade com ESO/Vault/SOPS; Kustomize vs Helm por critério; e a mesma imagem promovida entre ambientes."
estimatedMinutes: 45
references:
  - title: "Kubernetes — Secrets"
    url: https://kubernetes.io/docs/concepts/configuration/secret/
  - title: "Encrypting Confidential Data at Rest"
    url: https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/
  - title: "External Secrets Operator"
    url: https://external-secrets.io/
  - title: "Kustomize"
    url: https://kubectl.docs.kubernetes.io/references/kustomize/
---

## A verdade incômoda sobre Secret

Um `Secret` do Kubernetes é um ConfigMap com o valor em **base64**. Base64 é
codificação, não criptografia — qualquer um pode decodificar:

```bash
kubectl get secret psp-credentials -o jsonpath='{.data.token}' | base64 -d
```

Por padrão, o valor vai para o etcd em texto claro. Quem lê o disco do etcd, ou um
backup dele, lê a credencial. Duas medidas são necessárias e nenhuma delas é opcional
numa fintech:

- **Encryption at rest no etcd** (`EncryptionConfiguration` no API server), idealmente
  com KMS externo em vez de chave local — caso contrário a chave está ao lado do dado.
- **RBAC**, que é a proteção real: quem pode `get secrets` no namespace pode ler tudo.
  E lembre que **quem pode criar um Pod no namespace pode montar qualquer Secret dele**
  — permissão de deploy é, na prática, permissão de leitura de segredo. Esse detalhe
  desfaz a maioria dos desenhos ingênuos de RBAC, e volta no marco 10.

Vale a comparação honesta com ConfigMap: a diferença real entre os dois é que Secret
não aparece em log por acidente, é criptografável no etcd, e é separável por RBAC. Não
é uma fronteira de segurança forte — é um lugar melhor para pôr a coisa.

## Segredos de verdade

O modelo que funciona é **o segredo não vive no cluster; ele é projetado nele**.

- **External Secrets Operator (ESO)** — um controller lê o segredo de um cofre (Vault,
  AWS Secrets Manager, GCP Secret Manager) e materializa o `Secret` no namespace,
  reconciliando periodicamente. O Git guarda só o *ponteiro* (`ExternalSecret`), nunca o
  valor. É a opção mais comum hoje e a que o `fin-platform` usa.
- **Vault com injeção via sidecar/CSI** — o segredo nem vira objeto do Kubernetes,
  chega no filesystem do pod. Isolamento melhor, operação mais pesada.
- **SOPS + age/KMS** — o valor **cifrado** no Git, decifrado no momento do apply.
  Funciona bem para GitOps de cluster pequeno e para o `kind` local; a rotação exige
  um commit, o que é uma limitação real.

**Rotação sem redeploy** é o critério que separa as opções. Se a app lê o segredo de
uma variável de ambiente, rotacionar exige reiniciar o pod — variável de ambiente é
capturada uma vez, no `exec`. Se ela lê de um **arquivo montado**, o kubelet atualiza o
conteúdo do volume sozinho e a app pode recarregar. Por isso, para credencial que
rotaciona, **monte volume, não use `env`**. O bônus: variável de ambiente vaza em
`kubectl describe pod`, em crash dump e em log de processo; arquivo montado, não.

## Kustomize vs Helm: critério, não guerra santa

Os dois resolvem problemas diferentes, e usar os dois juntos é normal.

| | Kustomize | Helm |
| --- | --- | --- |
| Modelo | patch sobre YAML real | template com valores |
| Bom para | **suas** apps, variação por ambiente | **empacotar e distribuir** software |
| O YAML base é válido? | sim, aplicável sozinho | não, é template |
| Complexidade cresce com | nº de overlays | nº de condicionais no template |

Regra prática: **Kustomize para o que é seu, Helm para o que é de terceiros.** Você
não vai escrever um chart para o `pix-gateway` — você tem 3 ambientes, não 300
usuários. Mas vai instalar Strimzi, Prometheus e Argo CD por Helm, porque são
distribuídos assim.

O antipadrão comum é o chart interno com 40 valores e `if` aninhado, que ninguém
consegue ler nem `diff`ar. Quando o template precisa de lógica, o problema geralmente é
que ele quer ser um overlay.

## 12-factor: a mesma imagem em todo ambiente

O princípio: **build uma vez, promova o artefato**. A imagem que passou pelos testes em
dev é *bit a bit* a que vai para produção; só a configuração muda.

Isso significa que rebuildar com `-Pprod` está errado — o artefato testado deixou de ser
o artefato entregue, e a diferença entre "funcionou em homologação" e produção volta a
existir. A forma de tornar isso verificável é **referenciar a imagem por digest**
(`image: ghcr.io/fin/pix-gateway@sha256:…`) em vez de tag: tag é um ponteiro mutável,
digest é o conteúdo. No marco 09, uma policy Kyverno passa a *bloquear* imagem sem
digest — aqui o objetivo é só provar que os overlays apontam para a mesma.

## Exemplo numa fintech

Credencial de PSP **nunca** no Git, nem cifrada por conveniência, e a evidência de
rotação precisa ser gerável sob demanda para a auditoria. No `fin-platform`:

- `ExternalSecret` no Git aponta para `secret/psp/itau/prod` no Vault; o valor nunca é
  versionado.
- `refreshInterval: 1h` — o controller reconcilia, e a data de última sincronização
  fica no `status` do objeto: **essa é a evidência**, gerada pela própria plataforma em
  vez de uma planilha mantida à mão.
- A credencial é montada como **arquivo**, para que a rotação no cofre chegue no pod sem
  redeploy.
- O namespace `payments` tem RBAC que nega `get secrets` para humanos — inclusive para
  o time dono. Quem precisa do valor vai ao cofre, onde o acesso é registrado.

## Hands-on

**Desafio — a mesma imagem, dois ambientes.** No `fin-platform`, entregue
`overlays/dev` e `overlays/prod` do `pix-gateway` que diferem **somente** em
configuração — réplicas, log level, URL do PSP (sandbox vs produção), recursos — e
compartilham o mesmo `base/`.

**Invariante testável**, e o critério é este:

```bash
diff <(kubectl kustomize overlays/dev  | yq '..|.image? // empty' | sort -u) \
     <(kubectl kustomize overlays/prod | yq '..|.image? // empty' | sort -u)
```

O comando precisa sair **vazio**, e a referência precisa ser por `@sha256:`, não por
tag. Coloque isso num `make verify` do repo — é o primeiro teste de plataforma do
projeto, e o marco 13 vai rodá-lo no pipeline.

**Complemento.** Adicione um `ExternalSecret` (com o ESO apontando para um Vault em
modo dev no próprio `kind`) para a credencial do PSP, monte como arquivo e prove que
mudar o valor no Vault chega ao pod **sem** `kubectl rollout restart`. Cronometre
quanto demora e anote — é o seu tempo real de rotação.

**Checagem.** (a) Alguém com permissão de criar Pod no namespace, mas **sem**
`get secrets`, consegue ler o segredo? (b) Por que credencial rotacionável deve ser
volume e não `env`? (c) Seu time quer um chart Helm interno para o pix-gateway com 12
valores — qual pergunta você faz antes de concordar?

## Principais aprendizados

- Secret é base64: encryption at rest protege o disco, RBAC protege o acesso — e quem
  pode criar Pod pode ler o Secret que ele monta.
- Segredo mora no cofre; o Git guarda o ponteiro. Monte como arquivo para que a rotação
  chegue sem redeploy.
- Kustomize para o que é seu, Helm para o que é de terceiros; template com muita lógica
  é um overlay disfarçado.
- Mesma imagem por **digest** em todos os ambientes; só a config muda — e isso é
  verificável por script, não por confiança.
