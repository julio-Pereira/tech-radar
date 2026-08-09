---
id: profiling
title: "Profiling contínuo"
summary: "O sinal que responde 'por quê, em qual linha' — flame graphs em produção o tempo todo, com custo baixo e uma armadilha de leitura."
estimatedMinutes: 40
references:
  - title: "Grafana Pyroscope — Documentation"
    url: https://grafana.com/docs/pyroscope/latest/
  - title: "Brendan Gregg — Flame Graphs"
    url: https://www.brendangregg.com/flamegraphs.html
  - title: "OpenTelemetry — Profiling"
    url: https://opentelemetry.io/docs/specs/otel/profiles/
---

## A última pergunta

Métrica: *tem problema?* Trace: *onde na cadeia?* Log: *o que aconteceu?* Sobra a
pergunta final: **por que, em qual linha de código?**

O trace mostra que o span "cálculo de tarifa" levou 800ms. E dentro dele? Instrumentar
manualmente cada função é inviável e produziria traces de centenas de spans (marco 05).

O **profile** responde: uma amostra periódica da pilha de execução de todas as threads,
agregada. O que aparece com mais frequência no topo das pilhas é onde a CPU está.

## Profiling contínuo, não sob demanda

O modelo tradicional é reativo: há um problema, alguém conecta um profiler, reproduz,
analisa. Três defeitos — exige reproduzir (e o incidente já passou), o overhead do
profiler tradicional desencoraja usá-lo em produção, e você só olha depois que sabe onde
procurar.

**Profiling contínuo** inverte: amostra a ~100Hz o tempo todo, em produção, com overhead
tipicamente abaixo de 2–3% de CPU. Você tem o profile de **ontem às 3h da manhã**, quando
o incidente aconteceu — que é exatamente o que não dá para reproduzir.

Isso é possível porque amostragem estatística é barata: 100 amostras por segundo por
thread produzem pouquíssimo dado, e a agregação é o que dá o sinal. É o "custo baixo" da
tabela do marco 04.

O que se coleta, além de CPU: **alocação de memória** (o que responde "quem está gerando
lixo e causando GC"), **objetos vivos** (vazamento), **tempo bloqueado** em lock, e
`goroutine`/thread count.

## Ler um flame graph

Convenções que evitam o erro mais comum:

- **Largura = tempo total** naquele caminho de pilha. Só a largura importa.
- **Altura = profundidade da pilha.** Uma pilha alta **não** significa lento — é só código
  aninhado.
- **O eixo horizontal não é tempo cronológico.** É agregação, ordenada alfabeticamente
  para agrupar. Isso não é uma linha do tempo; ler como se fosse é o erro nº 1.

O que procurar, em ordem:

1. **Blocos largos no topo** — a função está gastando CPU *ela mesma* (*self time*), não
   em chamadas. É o gargalo direto.
2. **Um bloco largo inesperado** — serialização, regex compilada em laço, log em caminho
   quente, criptografia. Aparece com muito mais frequência do que se imagina.
3. **Comparação entre dois períodos** (*differential flame graph*) — antes e depois do
   deploy, pico e vale. É a técnica de maior retorno: em vez de interpretar um gráfico
   absoluto, você vê **o que mudou**.

## Correlação trace ↔ profile

O passo que fecha o ciclo dos quatro sinais: dado um span lento, ver o profile **daquele
período e daquele pod**.

O mecanismo é o mesmo dos exemplars (marco 07): o profile carrega o `trace_id`/`span_id`
como label, e a UI liga os dois. Você vai da métrica ao trace, do trace ao span lento, e
do span à linha de código.

É o argumento mais forte a favor de uma stack integrada: cada salto desses feito à mão
custa minutos de MTTR (marco 02), e são exatamente os minutos que importam.

## Status e maturidade

**Profiles é o quarto sinal do OpenTelemetry e está em alpha desde março de 2026** — a
especificação ainda muda. Na prática isso significa: use, e não construa dependência forte
no formato ainda.

**Pyroscope** é a implementação de referência no ecossistema Grafana, com SDKs por
linguagem e uma opção baseada em **eBPF** que perfila processos **sem instrumentar nada**
— sem SDK, sem recompilar, funcionando inclusive para binários de terceiros. O custo é
precisão menor de símbolos em algumas linguagens e a necessidade de kernel recente e
privilégio no nó (o que interage com o marco 09 da trilha Kubernetes: um DaemonSet
privilegiado é uma exceção de segurança que precisa ser justificada e restrita).

Por linguagem, o que esperar: Go tem `pprof` nativo e a integração é trivial; a JVM tem
async-profiler, com o cuidado usual de precisar de símbolos e de configuração para não
sofrer com *safepoint bias*.

## Exemplo numa fintech

Dois casos onde o profile responde o que os outros três sinais não respondem:

**1. O p99 que não fecha com o trace.** O trace mostra 800ms no span "autorização", mas a
soma dos spans filhos dá 200ms. Os 600ms restantes estão fora do instrumentado. O profile
do período mostra o topo da pilha em serialização JSON: o payload de resposta cresceu
depois de um campo novo, e o custo apareceu no p99 sem aparecer em nenhum span.

**2. A pausa periódica.** A cada poucos minutos, o p99 dá um pico e volta. Nenhum span
explica; nenhum log registra. O profile de alocação mostra uma função criando objetos
grandes em laço, disparando GC. A correção é no código, e sem profile a investigação
morre em "deve ser o GC" — que é uma conclusão, não um diagnóstico.

No `fin-platform`: Pyroscope como DaemonSet, CPU e alocação em todos os serviços, retenção
de 7 dias (profile é barato de gerar e não precisa de retenção longa), e a comparação
diferencial ligada ao processo de deploy — antes e depois de cada versão do
`pix-gateway`.

## Hands-on

**Desafio — do sintoma à linha.**

1. Suba Pyroscope e ligue o `pix-gateway` (JVM) e o `ledger-core` (Go), com `service` e
   `version` como labels.
2. Introduza uma ineficiência **discreta**: uma regex compilada dentro do laço de
   validação, ou uma serialização redundante no caminho de resposta. Algo que consuma CPU
   sem gerar erro nem span próprio.
3. Rode carga e observe: o p99 piora (marco 07), o trace mostra o span mais lento
   (marco 10), e **nenhum span filho explica** o tempo.

**Invariantes testáveis:**

- O flame graph do período mostra a função culpada como bloco largo no topo.
- O **differential flame graph** entre a versão sem e com a ineficiência aponta
  exatamente aquela função como a diferença — sem você precisar saber onde procurar.
- Você chega do span lento ao profile daquele pod e período em **no máximo 3 cliques**.
  Cronometre; esse número é MTTR.

4. **Alocação.** Introduza um laço que aloca objetos grandes e observe o profile de
   alocação e o efeito no p99. Corrija e prove a melhora nos dois.

**Complemento — a leitura errada.** Pegue um flame graph com uma pilha muito **alta** e
estreita e outro com uma pilha **baixa** e larga. Diga qual é o gargalo e explique por que
a altura enganou. Se você hesitou, releia a seção de convenções — é o erro mais comum.

**Checagem.** (a) O que a largura de um bloco representa, e o que a altura **não**
representa? (b) Por que o eixo horizontal não é uma linha do tempo? (c) O trace mostra
800ms num span e os filhos somam 200ms — qual sinal você abre? (d) Qual a vantagem do
eBPF e qual o custo dele num cluster com `restricted`?

## Principais aprendizados

- Profile responde "por quê, em qual linha" — a pergunta que sobra depois de métrica,
  trace e log.
- Contínuo em produção a ~100Hz com poucos por cento de overhead: você tem o profile do
  incidente de ontem, que não dá para reproduzir.
- Largura é tempo, altura é profundidade, e o eixo horizontal não é cronológico; a
  comparação diferencial é a técnica de maior retorno.
- Correlação trace↔profile fecha o ciclo dos quatro sinais; OTel profiles ainda é alpha e
  o eBPF troca instrumentação por privilégio no nó.
