---
id: observabilidade-vs-monitoramento
title: "Observabilidade não é monitoramento"
summary: "A distinção funcional entre verificar condições previstas e inferir estado interno, os unknown-unknowns, e por que cardinalidade é pré-condição e não detalhe."
estimatedMinutes: 40
references:
  - title: "Google SRE Book — Monitoring Distributed Systems"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
  - title: "OpenTelemetry — What is Observability?"
    url: https://opentelemetry.io/docs/concepts/observability-primer/
---

## A pergunta que abre a trilha

Por que o seu alerta de CPU nunca pegou o incidente de verdade?

Porque ele foi escrito por alguém que já sabia o que ia dar errado. E o incidente que
te acorda às 3h é, por definição, o que ninguém previu.

**Monitorar** é verificar continuamente um conjunto **pré-definido** de condições:
CPU acima de 80%, endpoint respondendo, disco com espaço. Você decide antes o que
observar, e o sistema avisa quando aquilo sai da faixa.

**Observabilidade** é uma propriedade do sistema: a capacidade de **inferir seu estado
interno** a partir do que ele emite — inclusive para perguntas que ninguém formulou
antes. O teste é direto: *você consegue responder a uma pergunta nova sobre a produção,
agora, sem fazer deploy?*

O termo vem da teoria de controle, onde um sistema é observável se o estado interno
pode ser deduzido das saídas em tempo finito. A transposição para software é útil e não
é metáfora vazia, porque preserva a parte que importa: observabilidade não é uma
ferramenta que você compra, é uma **propriedade do que o sistema emite**. Comprar
Grafana não torna nada observável, do mesmo jeito que comprar um osciloscópio não torna
um circuito observável.

E os dois não são rivais. Monitoramento é o subconjunto que dispara o pager;
observabilidade é o que te deixa investigar depois que ele disparou.

## Known-knowns, known-unknowns, unknown-unknowns

O enquadramento mais útil do marco:

- **Known-known** — você sabe que importa e sabe o valor normal. *"O gateway responde em
  ~80ms."* É dashboard.
- **Known-unknown** — você sabe que pode dar problema, mas não sabe quando. *"O PSP pode
  ficar lento."* É alerta.
- **Unknown-unknown** — você nem sabia que essa condição existia. *"Pagamentos com valor
  acima de R$50 mil, de clientes migrados na semana passada, caem no timeout do
  antifraude porque o payload extra estoura o buffer."*

Dashboard e alerta cobrem os dois primeiros. **O incidente sério é quase sempre o
terceiro** — e ele não tem dashboard, porque ninguém sabia que ele existia. Responder a
unknown-unknowns exige poder **fatiar o dado por dimensões arbitrárias no momento da
investigação**. Daí a seção de cardinalidade abaixo.

## Black-box e white-box

- **Black-box**: sondar de fora, como um cliente. *O pagamento funciona agora?*
- **White-box**: enxergar por dentro. *Por que não funciona?*

Você precisa dos dois, e a divisão de trabalho é clara: o **black-box detecta**, o
white-box **explica**. E há uma razão específica para não abrir mão do black-box: ele é
o único que pega o que a sua instrumentação não previu. Se o DNS externo quebrou, se o
certificado expirou, se o balanceador está devolvendo 502 antes de chegar na sua app,
todas as suas métricas internas estão verdes — porque nenhuma requisição chegou.

Um teste sintético que faz um pagamento real de R$0,01 a cada minuto, ponta a ponta,
pega mais incidentes do que a maioria dos alertas de infraestrutura. E é
desconfortavelmente barato de montar.

**Monitoramento sintético** é isso: tráfego artificial e previsível, de fora.
**RUM** (*real user monitoring*) é o oposto: telemetria do cliente real, no navegador ou
no app, onde moram a latência de rede e o dispositivo lento que você nunca reproduz.

## Cardinalidade é pré-condição, não detalhe

Se você não consegue perguntar `psp=itau AND versao=4.2 AND regiao=sa-east-1`, você tem
monitoramento, não observabilidade.

**Dimensionalidade** é quantos atributos você anexa a cada evento (`psp`, `versao`,
`bandeira`, `tipo_conta`, `canal`). **Cardinalidade** é quantos valores distintos cada
atributo tem — e o produto de todas as cardinalidades é o número de séries que a sua
ferramenta precisa guardar.

Alta dimensionalidade é o que permite investigar unknown-unknowns: a hipótese que você
não tinha antes só pode ser testada se o dado já foi gravado com aquele recorte.

E aqui está a tensão que atravessa a trilha inteira: **isso custa dinheiro**. Um
atributo `payment_id` numa métrica cria uma série por pagamento e derruba o Prometheus.
A escolha de quais dimensões manter, em qual sinal, com qual retenção, é a decisão
central do marco 16 — e a razão de o marco 04 mostrar que métricas exigem cardinalidade
baixa **por construção**, enquanto logs e traces são onde a alta cardinalidade cabe.

## Quando monitoramento basta

Nem tudo merece instrumentação cara. Um cron job interno que roda de madrugada e cujo
único modo de falha relevante é "não rodou" precisa de um alerta de execução ausente e
mais nada. Um batch noturno cujo resultado é conferido pela conciliação da manhã não
precisa de trace distribuído.

O critério é o custo do desconhecido: **quanto custa uma hora sem saber o que está
acontecendo aqui?** Se a resposta é "pouco", monitore e siga em frente. Observabilidade
é decisão de engenharia com orçamento, não dogma.

## Observability-driven development

Instrumentar depois do incidente é a ordem errada. A pergunta *"como eu vou saber que
isso quebrou?"* pertence ao **code review**, ao lado de "isso tem teste?".

Na prática, para cada mudança relevante: qual métrica muda de forma quando isso falhar;
qual atributo eu preciso ter no log para investigar; o trace atravessa a nova
integração ou ela é um buraco. Uma feature flag sem uma métrica que a discrimine é uma
feature que você não consegue avaliar nem reverter com fundamento.

## Exemplo numa fintech

MTTR tem preço direto e calculável. Se o `pix-gateway` processa R$400 mil por minuto e
fica 40 minutos fora, o incidente custou R$16 milhões em TPV não processado — mais o
que não volta, porque o cliente pagou pelo concorrente.

E há a camada que outros setores não têm: incidente relevante em instituição de
pagamento é **reportável ao regulador**, com prazo e conteúdo definidos. Quem não
consegue reconstruir a linha do tempo do incidente — quando começou, o que foi afetado,
quantos clientes, quando normalizou — não tem um problema de engenharia, tem um problema
regulatório. A telemetria é a fonte desse relatório.

## O que esta trilha faz e o que as outras fazem

As trilhas `spring-boot`, `go-fintech`, `kubernetes` e `kafka` já têm um marco de
observabilidade cada. A fronteira é:

| Nas outras trilhas | Aqui |
| --- | --- |
| **Instrumentar** o meu serviço | **Projetar o sinal** e operar a plataforma inteira |
| "como emito uma métrica em Java/Go" | "que pergunta essa métrica responde, e quanto custa" |
| Ferramenta dentro da stack | Conceito, correlação entre stacks, SLO, on-call, custo |

Regra prática: se a frase começa com *"no Spring Boot, você adiciona…"*, é da outra
trilha. Se começa com *"por que a média de latência é uma mentira?"*, é desta.

O arco é `CONCEITO (01–04) → PADRÃO (05–06) → FERRAMENTA (07–11) → DECISÃO (12–14) →
OPERAÇÃO (15–17)`. **O Bloco A não instala nada.** É vocabulário e modelo mental, e
cada conceito daqui é reencontrado pelo menos duas vezes adiante, com menção explícita
ao marco de origem — vocabulário sem reencontro evapora em uma semana.

## Hands-on

**Desafio — as 10 perguntas.** Este é o documento mais importante da trilha, e ele é
revisitado no marco 17.

São 3h da manhã. O `fin-platform` está com a taxa de erro subindo no `POST /payments`.
Liste as **10 perguntas** que o time precisa responder para diagnosticar, na ordem em
que faria sentido perguntá-las. Para cada uma, anote:

1. A pergunta, em linguagem de negócio (*"todos os clientes ou só um PSP?"*).
2. Classificação: **known-unknown** (você já sabia que podia acontecer) ou
   **unknown-unknown** (você só descobriria investigando).
3. Que sinal responderia — métrica, log, trace, profile — e **com qual recorte**.
4. Hoje, no seu sistema real de trabalho: você conseguiria responder em menos de 2
   minutos? Sim / não / só com deploy.

O resultado esperado é desconfortável: a maior parte das perguntas realmente úteis cai
em "só com deploy". Essa lista vira a espinha dorsal da trilha — os marcos seguintes
existem para transformar cada "não" em "sim", e no marco 17 você refaz o exercício.

**Checagem.** (a) Todas as suas métricas estão verdes e o cliente não consegue pagar —
que tipo de sinal falta? (b) Por que "temos Grafana" não é resposta para "somos
observáveis"? (c) Cite algo no seu sistema que merece só monitoramento, e defenda.

## Principais aprendizados

- Monitorar é checar condições previstas; observar é conseguir responder perguntas
  novas sem deploy. O pager é monitoramento, a investigação é observabilidade.
- Incidente sério é quase sempre unknown-unknown — e só o dado com alta
  dimensionalidade permite testar a hipótese que você ainda não tinha.
- Black-box detecta o que a instrumentação não previu; white-box explica. Os dois.
- Cardinalidade é a pré-condição da observabilidade **e** a origem da conta no fim do
  mês — a tensão que os marcos 04 e 16 resolvem.
