---
id: rbac-e-auditoria
title: "RBAC, identidade e auditoria"
summary: "Least privilege que sobrevive ao contato com a realidade, identidade de workload sem chave estática, e o audit log como o insumo que o regulador pede."
estimatedMinutes: 55
references:
  - title: "Kubernetes — Using RBAC Authorization"
    url: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
  - title: "Kubernetes — Auditing"
    url: https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/
  - title: "Kubernetes — Managing Service Accounts"
    url: https://kubernetes.io/docs/concepts/security/service-accounts/
---

## Autenticação e autorização são separadas

O API server resolve, em ordem: **quem é você** (autenticação), **o que você pode**
(autorização, RBAC), **o objeto é aceitável** (admissão, marco 09).

O detalhe que surpreende: **o Kubernetes não tem usuários.** Não existe objeto `User`,
não existe `kubectl create user`. Identidade humana vem de fora — certificado cliente,
OIDC (o caminho certo: seu provedor corporativo emite o token, o grupo do provedor vira o
grupo do RBAC), ou webhook do provedor de nuvem.

Isso é uma vantagem: desligar alguém no provedor de identidade desliga o acesso ao
cluster, sem ninguém precisar lembrar de revogar um kubeconfig. E é o argumento decisivo
contra distribuir certificados de cliente — certificado emitido não tem revogação
prática, e ele vale até expirar.

**ServiceAccount**, por outro lado, é objeto do cluster e é a identidade dos **workloads**.

## RBAC de verdade

Quatro objetos, e a combinação é o que confunde:

| | Escopo do que permite | Onde vive |
| --- | --- | --- |
| `Role` | um namespace | namespace |
| `ClusterRole` | cluster inteiro (ou recursos sem namespace) | cluster |
| `RoleBinding` | concede **dentro de um namespace** | namespace |
| `ClusterRoleBinding` | concede **em todo o cluster** | cluster |

A combinação útil e pouco conhecida: **`RoleBinding` apontando para um `ClusterRole`** —
define a regra uma vez, concede namespace a namespace. É como se escreve "leitor" uma vez
e se aplica a 30 namespaces sem duplicar YAML.

O erro que vira incidente: `ClusterRoleBinding` para um `ClusterRole` quando a intenção
era um namespace. O objeto é quase idêntico, o efeito é o cluster inteiro.

RBAC é **puramente aditivo** — não existe `deny`. O que alguém pode é a união de tudo que
lhe foi concedido, e por isso não dá para "corrigir" uma permissão ampla adicionando uma
restrição: é preciso remover a concessão.

### Least privilege que funciona

O método que sobrevive: comece do **zero**, rode, leia o erro, adicione **exatamente** o
verbo e o recurso que faltou, repita. É tedioso e é o único jeito de chegar num Role
mínimo — deduzir no papel sempre erra para mais.

Ferramentas de auditoria:

```bash
kubectl auth can-i --list --as=system:serviceaccount:payments:pix-gateway
kubectl auth can-i delete pods -n payments --as=...   # a pergunta específica
kubectl auth can-i '*' '*' --as=...                   # o teste de "sou admin sem querer?"
```

Três armadilhas concretas:

- **`cluster-admin` "temporário"** que nunca é removido. É a permissão mais comum em
  produção e a mais difícil de justificar numa auditoria.
- **Wildcards.** `verbs: ["*"]` inclui `delete` e `deletecollection`. `resources: ["*"]`
  inclui `secrets`.
- **`escalate` e `bind`.** Quem tem esses verbos em roles pode **conceder a si mesmo**
  qualquer permissão. É `cluster-admin` com outro nome, e passa despercebido em review.

E o ponto que reorganiza o desenho, já antecipado no marco 03: **quem pode criar Pod num
namespace pode ler qualquer Secret daquele namespace** — basta montá-lo. Também pode
assumir a identidade de qualquer ServiceAccount do namespace, especificando-a no pod.
Portanto `create pods` é, na prática, "tudo o que qualquer workload deste namespace pode
fazer". Isso é o que torna a **separação por namespace** uma fronteira de segurança real,
e "dar deploy" uma permissão muito mais forte do que parece.

### `automountServiceAccountToken: false`

Por padrão, todo pod recebe montado o token da sua ServiceAccount. Um pod comprometido
tem, de graça, credencial válida para o API server.

A maioria dos workloads **não fala com o API server** — o `pix-gateway` não precisa
listar pods. Então:

```yaml
spec:
  automountServiceAccountToken: false
```

Desligue por padrão; ligue só onde é necessário. É uma linha, e ela remove a escalada mais
conveniente que existe depois de um RCE.

## Identidade de workload para recursos externos

O problema clássico: o `pix-gateway` precisa ler um bucket S3 ou um Secret Manager. A
solução ruim e comum é uma chave de acesso estática num Secret — que não rotaciona, vaza
em log, e vale para sempre.

A solução atual: a ServiceAccount do Kubernetes é **federada** com o IAM do provedor.

- **IRSA** (AWS), **Workload Identity** (GCP), **Workload Identity Federation** (Azure).
- Por baixo: **projected service account tokens**, tokens OIDC de vida curta, com
  audience específica, emitidos pelo próprio API server e **rotacionados
  automaticamente** pelo kubelet. O provedor confia no emissor OIDC do cluster e troca o
  token por credencial temporária.

O ganho não é conveniência, é a eliminação de uma classe inteira de problema: **não existe
segredo de longa duração para vazar**. O token dura minutos e é escopado por audience.

No `kind` não há provedor de nuvem, então o conteúdo aqui é conceitual — mas o mecanismo
subjacente (`projected` volume com token OIDC) você **pode** ver localmente, e o tutorial
faz isso.

## Audit log: o insumo que o regulador pede

O API server pode registrar toda requisição: quem, o quê, quando, em qual objeto, de qual
IP, com qual resultado. Não vem ligado; é uma `Policy` que você escreve.

O que a policy decide é **volume vs utilidade**, por nível:

- `None` — não registra. Use para o ruído: health check, `get` de sistema.
- `Metadata` — quem/o quê/quando, sem corpo. O padrão para a maior parte.
- `Request` — inclui o objeto enviado.
- `RequestResponse` — inclui a resposta também. Caro; reserve para o que importa.

Uma policy sensata para fintech: `RequestResponse` em `secrets`, `roles`,
`rolebindings` e `pods/exec`; `Metadata` no resto de escrita; `None` no ruído de leitura
de sistema. Sem essa seletividade, o audit log fica caro o bastante para alguém decidir
desligá-lo.

E o registro que a auditoria sempre pede primeiro: **`pods/exec`**. Ele mostra quem abriu
shell em qual pod de produção, quando.

### Segregação e acesso quebra-vidro

- **Cluster separado por ambiente** (não só namespace) para produção. Namespace separa
  recurso; cluster separa *plano de controle*, e um erro de RBAC em homologação não
  alcança produção.
- **Quem tem `exec` em produção?** Idealmente ninguém. Debug se faz por log, métrica,
  trace e ephemeral container (marco 12). Quando é inevitável, que seja por **acesso
  quebra-vidro**: elevação temporária, com prazo, justificativa registrada e alerta
  disparado para o time — não silêncio.
- **SoD (segregação de funções)** — quem escreve não aprova, quem aprova não aplica. Com
  GitOps (marco 13) isso sai quase de graça: o autor do PR não é o revisor, e ninguém
  aplica à mão porque só o Argo CD tem permissão de escrita no cluster. **É o argumento
  mais forte a favor de GitOps numa instituição regulada** — o controle vira consequência
  do fluxo, não um processo que alguém precisa seguir.

## Exemplo numa fintech

O regulador pergunta: *"quem acessou o ambiente de produção nos últimos 90 dias e o que
fez?"*.

Com audit log configurado, retenção adequada e os logs fora do cluster (senão quem
comprometeu o cluster apaga a prova), a resposta é uma consulta. Sem isso, a resposta é
uma reconstrução parcial a partir de memória — que não é uma resposta.

No `fin-platform`: uma ServiceAccount por serviço, `automountServiceAccountToken: false`
onde não é preciso, nenhum humano com `cluster-admin` permanente, `exec` em produção
apenas via quebra-vidro com alerta, e audit log exportado para storage imutável
(*write-once*) fora do cluster.

## Hands-on

**Desafio — o menor Role que ainda funciona.** Para cada componente do `fin-platform`,
crie uma ServiceAccount dedicada e o Role mínimo.

Método (siga nesta ordem, é o que garante o mínimo de verdade):

1. Crie a SA **sem nenhum** Role. Suba o workload.
2. Leia o erro de permissão no log. Adicione **só** aquele verbo naquele recurso.
3. Repita até funcionar. Nunca adicione "por precaução".

**Invariantes testáveis:**

1. Cada serviço tem SA própria — **nenhum** usa a `default`.
2. `kubectl auth can-i --list --as=system:serviceaccount:payments:pix-gateway` mostra
   uma lista curta, sem `secrets` e sem wildcard.
3. `kubectl auth can-i delete pods -n payments --as=...` → **no**. Escreva pelo menos
   **5 asserções de negação** num script — provar o que a SA *não* pode é o teste que
   pega o Role frouxo; provar que ela funciona não pega nada.
4. `automountServiceAccountToken: false` em todo workload que não fala com o API server,
   com um comando que prove a ausência do token dentro do pod:
   `kubectl exec ... -- ls /var/run/secrets/kubernetes.io/` deve falhar.

**Complemento — audit log e o token projetado.** No `kind`, habilite o audit log com uma
`Policy` que registre `RequestResponse` para `secrets` e `pods/exec`, e `Metadata` para o
resto das escritas. Depois:

- Faça um `kubectl exec` num pod e **encontre a linha** no audit log. Anote todos os
  campos que identificam você.
- Inspecione um `projected` token dentro de um pod
  (`cat /var/run/secrets/kubernetes.io/serviceaccount/token`), decodifique o JWT e olhe
  `aud` e `exp`. É o mecanismo do IRSA, visível localmente.

**Checagem.** (a) Por que `create pods` num namespace equivale a ler todos os Secrets
dele? (b) Qual a diferença de efeito entre `RoleBinding`→`ClusterRole` e
`ClusterRoleBinding`→`ClusterRole`? (c) Por que o verbo `escalate` é equivalente a
`cluster-admin`? (d) Por que o audit log precisa sair do cluster?

## Principais aprendizados

- Kubernetes não tem usuários: identidade humana vem do OIDC corporativo, e ServiceAccount
  é a identidade dos workloads.
- RBAC é aditivo e sem `deny`; `create pods` num namespace implica ler seus Secrets e
  assumir suas SAs — por isso namespace é fronteira de verdade.
- `automountServiceAccountToken: false` por padrão remove a escalada mais conveniente
  depois de um RCE; identidade federada elimina a chave estática.
- Audit log seletivo por nível, fora do cluster, é o que responde "quem fez o quê" — e
  GitOps entrega SoD como consequência do fluxo.
