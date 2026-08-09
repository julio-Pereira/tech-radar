---
id: ciclo-de-vida
title: "Ciclo de vida do pod e deploy sem derrubar transação"
summary: "As três probes e o erro clássico de cada uma, a coreografia do shutdown que exige colaboração da app, e por que o pod continua recebendo tráfego depois do SIGTERM."
estimatedMinutes: 55
references:
  - title: "Kubernetes — Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: "Kubernetes — Configure Liveness, Readiness and Startup Probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "Kubernetes — Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
---

## As três probes, e o erro clássico de cada uma

Elas parecem variações do mesmo health check. Fazem coisas opostas.

**`livenessProbe` — "devo te matar?"** Falhou, o kubelet **reinicia o container**.

> *Erro clássico:* liveness apontando para um endpoint que depende do banco. O banco fica
> lento no pico, a liveness estoura, **todos os pods reiniciam ao mesmo tempo** — e o
> reinício em massa derruba o que ainda funcionava. Você transformou lentidão em queda.
>
> Regra: liveness só deve detectar **deadlock irrecuperável do processo**. Se um restart
> não conserta, não é liveness. Na dúvida, não use liveness — muitos serviços vivem
> melhor sem ela.

**`readinessProbe` — "posso te mandar tráfego?"** Falhou, o pod sai do EndpointSlice
(marco 04) e para de receber. Não reinicia nada.

> *Erro clássico:* readiness que retorna 200 antes de a aplicação conseguir atender —
> Spring com contexto ainda subindo, pool de conexões vazio, cache frio. O pod entra no
> balanceamento e devolve erro nas primeiras requisições. É a causa nº 1 de 5xx durante
> deploy.
>
> Segundo erro, mais sutil: readiness que checa **dependência externa**. Se o PSP cai,
> todos os pods ficam `NotReady` ao mesmo tempo, o Service fica sem endpoint nenhum e
> você perde inclusive o tráfego que não precisava do PSP. Readiness responde "**eu**
> estou pronto", não "o mundo está bem".

**`startupProbe` — "já terminou de subir?"** Enquanto ela não passa, liveness e
readiness ficam suspensas.

> Existe para aplicação de boot lento (JVM, cache grande). Sem ela, você é obrigado a
> afrouxar a liveness com `initialDelaySeconds` alto — e aí a liveness fica lenta para
> detectar problema real pelo resto da vida do pod. A startupProbe resolve os dois:
> tolerante no boot, agressiva depois.

## A coreografia do shutdown

Aqui está o detalhe que produz 5xx em deploy mesmo com tudo "configurado direito".

Quando um pod é deletado, **duas coisas acontecem em paralelo, sem sincronia entre si**:

```
1. kubelet:    preStop  →  SIGTERM  →  (grace period)  →  SIGKILL
2. controller: remove o pod do EndpointSlice  →  kube-proxy de CADA nó
                                                  atualiza suas regras
```

O caminho 2 é **assíncrono e distribuído**. Entre o SIGTERM e a última regra de iptables
ser atualizada em todos os nós, passam centenas de milissegundos a segundos. Nesse
intervalo, **o pod que já recebeu SIGTERM continua recebendo requisições novas**.

Se a app fecha o servidor no primeiro SIGTERM, essas requisições batem em conexão
recusada. É exatamente o 5xx que você está tentando eliminar.

A solução é um `preStop` que **espera**, dando tempo para a rede convergir antes de o
processo começar a se despedir:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]
terminationGracePeriodSeconds: 45   # 10 do preStop + folga para drenar em voo
```

Parece um hack e é a prática recomendada — não existe, hoje, sinal de "a rede
convergiu". Os 10 segundos são empíricos: meça no seu cluster e ajuste.

E o `terminationGracePeriodSeconds` precisa caber **preStop + a requisição mais longa em
voo**. Se ele estourar, vem `SIGKILL`, e a transação em voo morre no meio.

### A app precisa colaborar

Kubernetes manda o sinal; quem drena é a aplicação. Isso é ponte direta com as outras
trilhas:

- **Spring Boot** — `server.shutdown=graceful` e
  `spring.lifecycle.timeout-per-shutdown-phase`. Sem isso, o contexto fecha e as
  requisições em voo morrem.
- **Go** — `signal.NotifyContext` + `srv.Shutdown(ctx)`, propagando o contexto para o
  trabalho em andamento.
- **Consumidor Kafka** — sair do poll loop, terminar o lote atual, **commitar o offset**
  e só então fechar. Sair sem commitar é reprocessamento garantido (marco 04 da trilha
  Kafka).

Um `SIGTERM` ignorado é um `SIGKILL` adiado. Se a app não trata o sinal, o grace period
é só uma espera antes da morte violenta.

## Rolling update

O Deployment controla o rollout com dois números:

- **`maxSurge`** — quantos pods **a mais** que o desejado podem existir durante o
  rollout.
- **`maxUnavailable`** — quantos podem faltar.

Para deploy sem perder capacidade: **`maxUnavailable: 0`** e `maxSurge: 1` (ou mais).
Sobe o novo, espera ficar `Ready`, só então derruba um antigo. Mais lento e é o que você
quer no caminho do dinheiro.

`maxUnavailable: 0` com `replicas: 3` e capacidade justa no cluster **trava**: não há nó
para o pod extra. É a interação com o marco 05 que aparece no pior momento.

`progressDeadlineSeconds` marca o rollout como falho se ele não avançar — sem isso, um
deploy quebrado fica "em progresso" para sempre e ninguém é avisado.

**Rollback** é instantâneo porque o ReplicaSet antigo ainda existe com 0 réplicas
(marco 02): `kubectl rollout undo` só reescala os dois. Mas ele **não desfaz migração de
banco** — o que torna a compatibilidade retroativa do schema um requisito de deploy, não
uma boa prática. Vale a ponte: é o mesmo raciocínio do marco 07 da trilha Kafka.

## Exemplo numa fintech

Deploy no meio de uma janela de liquidação não pode perder requisição em voo. O que
isso exige, junto:

- `readinessProbe` que reflete a prontidão real (pool conectado, migração aplicada).
- `preStop` com espera + graceful shutdown na app.
- `terminationGracePeriodSeconds` maior que a transação mais longa — se a liquidação tem
  chamada síncrona ao PSP de até 30s, o grace precisa passar disso.
- `maxUnavailable: 0`.
- PDB do marco 05, para o drain de nó respeitar o mesmo contrato.

E a evidência: o deploy sob carga com **zero 5xx**, medida e arquivada. Sem o relatório,
é opinião.

## Hands-on

**Desafio — deploy sob carga com zero 5xx.** O desafio central do bloco.

1. `pix-gateway` com 3 réplicas, endpoint que leva ~200ms e uma chamada externa
   simulada de até 5s em 1% dos casos.
2. Rode carga constante com `k6` ou `hey` (≥100 RPS) por 5 minutos.
3. **No meio da carga**, dispare `kubectl set image` para uma versão nova.

**Invariante testável:** o relatório do gerador de carga acusa **zero** respostas 5xx e
**zero** conexões recusadas durante todo o rollout. Salve o relatório em
`docs/evidencias/` do `fin-platform`.

4. **Agora prove que cada peça importa** — este passo é o aprendizado, não o passo 3:
   remova **uma** peça de cada vez (o `preStop`; depois o graceful shutdown da app;
   depois mude para `maxUnavailable: 1`) e registre quantos 5xx aparecem em cada
   variação. Você vai descobrir que uma delas sozinha já quebra a garantia, e qual é a
   mais barata de esquecer.

**Complemento — a liveness assassina.** Configure uma liveness que depende do banco.
Deixe o banco lento (`pumba`, `tc netem` ou simplesmente pause o container). Observe
todos os pods reiniciando juntos. Escreva 5 linhas sobre por que isso transforma
degradação em indisponibilidade.

**Checagem.** (a) Por que o pod continua recebendo requisição depois do SIGTERM? (b)
Qual a diferença de efeito entre liveness e readiness falhando? (c) O PSP caiu e sua
readiness o checa — o que acontece com o tráfego que não precisa do PSP? (d)
`kubectl rollout undo` desfez o deploy; o que ele **não** desfez?

## Principais aprendizados

- Liveness reinicia (use só para deadlock irrecuperável), readiness tira do
  balanceamento (nunca cheque dependência externa), startupProbe cobre o boot lento.
- Remoção do endpoint e SIGTERM são assíncronos entre si: sem `preStop` que espera, o
  pod morre com requisição chegando.
- O grace period precisa caber preStop + a requisição mais longa, e a app precisa tratar
  SIGTERM — senão é só um SIGKILL adiado.
- `maxUnavailable: 0` é o que preserva capacidade; rollback é instantâneo, mas não
  desfaz migração de banco.
