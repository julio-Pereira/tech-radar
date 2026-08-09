---
id: frameworks-de-sinal
title: "Frameworks de sinal: Golden Signals, RED e USE"
summary: "Por onde começar a instrumentar sem instrumentar tudo: a lente do serviço, a lente do recurso, e o sinal preditivo que quase todo mundo esquece."
estimatedMinutes: 45
references:
  - title: "Google SRE Book — Monitoring Distributed Systems"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
  - title: "Brendan Gregg — The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Grafana — The RED Method"
    url: https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/
---

## O problema: por onde começar

"Instrumente tudo" é conselho ruim. Produz milhares de séries que ninguém olha, uma
conta cara (marco 16) e nenhum alerta confiável. Os frameworks existem para responder a
uma pergunta específica — *quais são as primeiras quatro métricas deste componente?* —
e o valor deles está em ser um **checklist curto e fechado**.

Três frameworks, três lentes. Não são concorrentes.

## Four Golden Signals

Do livro de SRE do Google. Para qualquer serviço voltado ao usuário:

- **Latência** — quanto tempo leva.
- **Tráfego** — quanta demanda chega.
- **Erros** — quantas requisições falham.
- **Saturação** — quão cheio está o recurso mais limitante.

O detalhe que quase todo mundo perde, e que é o parágrafo mais útil do marco:
**latência de sucesso e latência de erro precisam ser medidas separadamente.**

Erro costuma ser **rápido** — um 500 por conexão recusada volta em 2ms. Se você joga
tudo num histograma só, uma tempestade de erros **melhora** o seu p99: metade das
requisições agora responde em 2ms, o percentil desce, o gráfico fica verde no exato
momento em que o sistema está pior. Já vi isso ser lido em reunião de incidente como
"a latência normalizou".

Separe por status desde o começo. É uma label a mais e evita a leitura invertida no pior
momento possível.

## RED — a lente do serviço

**Rate, Errors, Duration** — requisições por segundo, taxa de falha, distribuição de
tempo de resposta. É o subconjunto dos Golden Signals que descreve **o que o consumidor
sente**, e aplica-se uniformemente a qualquer coisa que atenda pedidos: endpoint HTTP,
método gRPC, consumidor de tópico Kafka (onde "requisição" é "mensagem processada").

A uniformidade é a virtude: com RED em todos os serviços, um dashboard genérico serve
para qualquer um, e a comparação entre serviços faz sentido.

## USE — a lente do recurso

De Brendan Gregg, e criada para um propósito diferente: **achar gargalo**, não relatar
saúde. Para cada recurso:

- **Utilization** — fração do tempo ocupado.
- **Saturation** — quanto trabalho está **na fila** esperando.
- **Errors** — contagem de erros do recurso.

"Recurso" é mais amplo do que CPU e disco. No `fin-platform`: pool de conexões do
Hikari, fila de tarefas do executor, buffer do producer Kafka, file descriptors,
partições de um consumer group.

A diferença entre *utilization* e *saturation* é a lição do framework. Utilização vai
até 100% e satura ali — ela não consegue expressar "quão pior está ficando". Saturação
não tem teto: o pool de 20 conexões pode estar em 100% de utilização com 3 threads
esperando ou com 300. **É a fila que dói**, e é a fila que cresce antes do timeout
aparecer.

## A tabela de decisão

O entregável do marco. Cole no wiki do time:

| Pergunta | Framework | Exemplo no `fin-platform` |
| --- | --- | --- |
| O usuário está sofrendo? | RED / Golden Signals | taxa de erro do `POST /payments` |
| O que está limitando? | USE | saturação do pool Hikari, lag do consumer |
| Estou perto do limite? | Saturação (ambos) | fila de liquidação crescendo |

O fluxo de uso é: **RED detecta, USE explica.** O alerta dispara por RED (sintoma, o
que o cliente sente — marco 13 formaliza isso). A investigação percorre USE recurso por
recurso, procurando o que está com fila. Alertar por USE produz o alerta de CPU do
marco 01: dispara sem incidente e cala durante o incidente.

## Saturação é o único sinal preditivo

Latência, erros e tráfego dizem o que **está** acontecendo. Saturação diz o que **vai**
acontecer.

A fila cresce antes de o timeout estourar. O lag do consumer sobe antes de o SLA de
liquidação furar. O pool enche antes de a requisição falhar. Se você quer alerta que
chega **antes** do incidente, ele é de saturação.

E é o mais esquecido, por um motivo legítimo: é o mais difícil de definir. Para cada
recurso é preciso saber qual é a fila e onde ela é observável — e frequentemente ela não
é exposta. O pool de conexões expõe `pending`; o executor expõe `queue.size`; o
consumidor Kafka expõe lag; o CPU expõe *run queue* e, em container, o
**throttling** (o `nr_throttled` do cgroup — a saturação de CPU que a trilha
`kubernetes` mostra no marco 05, e que a métrica de "uso de CPU" nunca revela).

Onde a fila não é exposta, a métrica de saturação é o trabalho a fazer. O desafio do
marco é exatamente esse inventário.

## O que os frameworks não cobrem: corretude

Um sistema pode ter RED impecável e estar **liquidando o valor errado**.

Todas as requisições retornam 200, em 80ms, sem erro — e o cálculo de tarifa está
usando a tabela do mês passado. Nenhum framework de sinal pega isso, porque todos medem
o *transporte*, não o *conteúdo*.

Daí a necessidade de métrica de negócio (marco 08) e de **invariantes**: a soma dos
lançamentos do ledger fecha em zero; o total liquidado no dia bate com o total
autorizado; a taxa de autorização por PSP está na faixa histórica. Invariante violada é
o único sinal que pega erro de corretude — e é o tipo de alerta que uma fintech precisa
e que quase nenhuma tem.

## Exemplo numa fintech

No `fin-platform`:

- **RED no `pix-gateway`** — RPS, taxa de 5xx e de 4xx separadas (4xx pode ser o
  parceiro mandando payload errado, o que é incidente *dele*), duração p50/p95/p99
  separada por sucesso e erro.
- **USE no pool Hikari e no consumidor Kafka** — conexões ativas vs `pending`; lag por
  partição, não só o total, porque uma partição quente (marco 06 da trilha Kafka) some
  na soma.
- **O quarto sinal que nenhum framework prevê: taxa de autorização.** É a métrica que
  o negócio olha e que detecta o incidente silencioso — quando ela cai de 94% para 71%
  sem nenhum erro 5xx, o problema é real e nenhum dos três frameworks apontou para ele.

## Hands-on

**Desafio — o mapa de sinais do `fin-platform`.** Para os quatro componentes —
`pix-gateway` (Java), `ledger-core` (Go), `pix-stream` (Kafka) e o cluster
(`fin-platform`) — produza uma tabela com:

| Componente | RED (3 métricas) | Recursos USE | Métrica de saturação **que existe** | Saturação que **falta** |

Regras que tornam o exercício útil:

1. Nomeie a métrica concreta, não a categoria (`hikaricp_connections_pending`, não
   "saturação do pool").
2. Para cada recurso, diga **qual é a fila**. Se você não consegue nomear a fila, o
   recurso provavelmente não tem métrica de saturação — e vai para a última coluna.
3. A última coluna é o entregável de verdade: ela é a lista de trabalho de
   instrumentação dos próximos marcos.
4. Marque a única métrica da tabela que detectaria um erro de **corretude**. Se não
   houver nenhuma, escreva qual invariante você criaria.

**Checagem.** (a) Sua taxa de erro subiu e o p99 **melhorou** — o que provavelmente
aconteceu? (b) Qual a diferença entre o pool a 100% de utilização com 3 threads na fila
e com 300? (c) Por que alertar por saturação de CPU é ruim, mas medir saturação de CPU
é essencial? (d) Todos os endpoints em 200 e a conciliação não fecha — que sinal pega
isso?

## Principais aprendizados

- RED é a lente do serviço (o que o cliente sente), USE é a lente do recurso (o que
  limita); RED detecta, USE explica.
- Latência de erro medida junto com a de sucesso inverte a leitura do p99 durante o
  incidente — separe por status.
- Utilização tem teto, saturação não: é a fila que dói, e ela é o único sinal que avisa
  **antes**.
- Nenhum framework cobre corretude — para isso é preciso métrica de negócio e
  invariante (marco 08).
