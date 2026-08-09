---
id: gitops-e-dr
title: "GitOps, entrega progressiva e DR"
summary: "O cluster como consequência do Git, canary com análise automática, e o restore cronometrado que transforma um plano de continuidade em fato."
estimatedMinutes: 55
references:
  - title: "Argo CD — Documentation"
    url: https://argo-cd.readthedocs.io/en/stable/
  - title: "Argo Rollouts — Progressive Delivery"
    url: https://argo-rollouts.readthedocs.io/en/stable/
  - title: "Velero — Backup and Migrate Kubernetes Resources"
    url: https://velero.io/docs/
  - title: "OpenGitOps — Principles"
    url: https://opengitops.dev/
---

## O cluster como consequência do Git

GitOps inverte a direção do deploy. Em vez de o pipeline **empurrar** (`kubectl apply` a
partir do CI, que para isso precisa de credencial de produção), um agente **dentro** do
cluster puxa o estado desejado do repositório e reconcilia.

É o loop do marco 01 aplicado à entrega: o Git é o `spec`, o cluster é o `status`, o Argo
CD é o controller.

O que muda concretamente:

- **Nenhuma credencial de cluster no CI.** A superfície de ataque do pipeline deixa de
  incluir produção — e pipeline comprometido é um vetor real.
- **Drift detection.** Alguém fez `kubectl edit` (marco 02)? O Argo mostra `OutOfSync`, e
  com `selfHeal` ligado reverte sozinho. O cluster deixa de acumular mudanças que ninguém
  registrou.
- **Rollback é um `git revert`.** Reproduzível, com autor e motivo.
- **Sync waves** ordenam o que precisa de ordem (CRDs antes dos objetos que os usam,
  migração antes da aplicação) via annotation.

E o ponto que fecha o marco 10: a **segregação de funções sai de graça**. O autor do PR
não é quem aprova; ninguém aplica à mão porque só o Argo tem permissão de escrita. O
controle que a auditoria pede vira consequência do fluxo, em vez de um processo que
alguém precisa lembrar de seguir.

Cuidados que a prática ensina:

- **Repo de app separado do repo de config.** Senão o commit de imagem nova polui o
  histórico da aplicação, e a esteira que atualiza a tag entra em laço com o build.
- **`selfHeal` é lâmina de dois gumes.** Durante um incidente, ele desfaz a sua mitigação
  manual em segundos. Saiba como pausar a aplicação — e tenha isso no runbook, não na
  memória de alguém.
- **Segredos não vão para o Git.** É o marco 03: `ExternalSecret` aponta, o valor mora no
  cofre.

## Entrega progressiva

O rolling update do marco 06 troca as réplicas sem derrubar tráfego, mas não **avalia** se
a versão nova é boa: se ela sobe `Ready` e devolve 500, o rollout completa alegremente.

**Canary com análise automática** fecha esse buraco. Com Argo Rollouts:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 5
      - pause: { duration: 5m }
      - analysis:
          templates: [{ templateName: taxa-de-erro }]
      - setWeight: 25
      - pause: { duration: 10m }
      - setWeight: 50
```

O `AnalysisTemplate` consulta o Prometheus e **aborta** se a métrica sair da faixa —
rollback automático em segundos, sem humano no meio. A métrica de análise deve ser de
**sintoma** (taxa de erro, p99), pela mesma razão do marco 12.

**Blue-green** mantém as duas versões inteiras e troca o tráfego de uma vez: rollback é
instantâneo, ao custo do dobro de capacidade. Faz sentido quando o canary é inviável — por
exemplo, quando a versão nova exige uma migração de banco incompatível.

E a restrição que nenhuma estratégia resolve: **rollback de código não desfaz migração de
banco** (marco 06). Toda migração precisa ser compatível com a versão anterior —
expandir, migrar, contrair — ou o rollback automático quebra mais do que conserta. É a
mesma disciplina do schema de eventos (marco 07 da trilha Kafka).

## DR: backup, restore e o número que importa

**RPO** é quanto dado você aceita perder (a idade do último backup válido). **RTO** é
quanto tempo você aceita ficar fora. Os dois são números de negócio, e a engenharia diz
se são atingíveis.

**Velero** faz backup dos objetos do Kubernetes e, via snapshot ou Restic/Kopia, dos
volumes. O que backup de objetos **não** cobre: o dado do banco gerenciado (tem o próprio
backup) e o etcd em si (num cluster gerenciado é do provedor; num autogerenciado é seu, e
é o backup mais importante que existe).

Com GitOps, boa parte do "restore" é recriar o cluster e apontar o Argo para o repo. O
que **não** está no Git é o que precisa de Velero: PVCs, e objetos gerados por controllers
(certificados emitidos, por exemplo).

E a frase que separa plano de fato: **restore que nunca foi testado é uma hipótese.**
Modos de falha que só aparecem no primeiro restore real são comuns: snapshot de volume
inconsistente porque o banco não foi congelado, CRD ausente porque o operator ainda não
subiu, `LoadBalancer` que volta com IP diferente e o parceiro tem o antigo cadastrado.

**Upgrade N-2 como rotina** (marco 01) é parte de DR: um cluster desatualizado é um
cluster que você não consegue recriar da mesma forma. E o **game day** — derrubar coisas
de propósito, em horário combinado, com post-mortem mesmo quando nada quebra — é o que
mantém tudo isso verdadeiro entre uma auditoria e outra.

## Exemplo numa fintech

Todo deploy em produção tem PR aprovado, autor, revisor e diff. A evidência de mudança
que a auditoria pede sai do próprio fluxo:

- *"Quem autorizou essa mudança?"* → o PR, com o revisor.
- *"O que exatamente mudou?"* → o diff.
- *"Quando chegou em produção?"* → o commit de sync do Argo.
- *"Como voltaram?"* → o `git revert`, com horário.

No `fin-platform`: `fin-platform-config` como repo de GitOps, Argo CD com `selfHeal`
ligado em produção, canary de 5%→25%→50% com análise por taxa de erro, backup Velero
diário do namespace `payments` com **restore mensal cronometrado** — e o RTO medido
anotado no runbook, não estimado.

## Hands-on

**Tutorial — Argo CD gerenciando o `fin-platform`.**

1. Instale o Argo CD no `kind` e crie um `Application` apontando para
   `overlays/dev` do seu repo.
2. Faça um commit mudando as réplicas e observe a reconciliação sem `kubectl apply`.
3. **Prove o drift detection:** rode `kubectl scale` à mão e veja o Argo marcar
   `OutOfSync` (e reverter, com `selfHeal`). Cronometre.
4. Instale Argo Rollouts e converta o `pix-gateway` para canary com `AnalysisTemplate`
   consultando a taxa de erro no Prometheus.
5. Faça deploy de uma versão **propositalmente quebrada** (que devolve 500 em 10% das
   requisições) e prove o rollback automático — **sem intervenção humana**. Cronometre da
   primeira requisição com erro até o rollback concluído.
6. `git commit`.

**Desafio — restaurar o namespace e cronometrar o RTO.**

1. Instale o Velero com storage local (MinIO no `kind`).
2. Backup do namespace `payments` inteiro, incluindo PVCs.
3. `kubectl delete namespace payments` — de verdade.
4. Restaure e **cronometre**.

**Invariantes testáveis:**

- Todos os Deployments voltam com o mesmo número de réplicas `Ready`.
- Os dados dos PVCs estão íntegros (conte registros antes e depois — iguais).
- Um pagamento de ponta a ponta funciona depois do restore.
- **O RTO medido está escrito em `docs/runbook/`**, com a data do teste. Um número, não
  uma estimativa.

5. **A parte que ensina:** liste tudo que **não** voltou automaticamente e por quê.
   Certificados? IP do LoadBalancer? Secrets do ESO? Essa lista é o seu plano de DR real
   — o resto é o que o Velero já fazia.

**Checagem.** (a) Por que GitOps reduz a superfície de ataque do pipeline? (b) Seu
`selfHeal` está ligado e você precisa mitigar um incidente à mão — o que acontece e o que
o runbook precisa dizer? (c) Por que rollback automático de canary não te salva de uma
migração de banco incompatível? (d) Qual a diferença entre ter backup e ter DR?

## Principais aprendizados

- GitOps é o loop de reconciliação aplicado à entrega: sem credencial de produção no CI,
  com drift detection, e SoD como consequência do fluxo.
- Canary com análise automática avalia a versão nova por métrica de sintoma e reverte
  sozinho — o que o rolling update não faz.
- Rollback de código não desfaz migração de banco: expandir, migrar, contrair.
- Restore não testado é hipótese; o entregável de DR é o RTO **medido** e a lista do que
  não volta sozinho.
