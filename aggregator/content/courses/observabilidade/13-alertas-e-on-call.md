---
id: alertas-e-on-call
title: "Alertas e on-call"
summary: "Burn rate multi-janela para pegar o incidente agudo e a degradação lenta, e o plantão que não destrói o time."
estimatedMinutes: 50
references:
  - title: "Google SRE Workbook — Alerting on SLOs"
    url: https://sre.google/workbook/alerting-on-slos/
  - title: "Google SRE Book — Being On-Call"
    url: https://sre.google/sre-book/being-on-call/
  - title: "Prometheus — Alerting Rules"
    url: https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
---

## A regra: sintoma, não causa

Alerte pelo que o **usuário sente**. Causa vai para dashboard e runbook.

O teste é direto: *se este alerta disparar às 3h, existe alguém sofrendo agora?* Se a
resposta é "não necessariamente", ele não é alerta de pager.

| Sintoma (pager) | Causa (dashboard) |
| --- | --- |
| taxa de erro do `POST /payments` acima do orçado | CPU alta |
| p99 acima do SLO | pod reiniciando |
| fila de liquidação parada | disco em 80% |
| taxa de autorização despencou | lag de consumidor |

O alerta de CPU é o exemplo canônico (marco 01): dispara em batch noturno sem incidente, e
fica calado durante o incidente de I/O-bound, onde a CPU até cai.

A exceção legítima são os alertas de **saturação preditiva** (marco 03): disco que vai
encher em 4 horas é causa, mas avisa antes do sintoma e tem ação clara. O critério que
resolve: *existe uma ação específica e útil agora?* Se sim, pode ir para o pager, com
severidade menor.

## Burn rate multi-janela

Alertar por "erro acima de 1%" tem dois defeitos opostos: grita num pico de 30 segundos
que não consome budget relevante, e fica calado numa degradação de 0,5% que consome o mês
inteiro.

**Burn rate** é a velocidade de consumo do error budget, normalizada:

```
burn rate = (1 - SLI) / (1 - SLO)
```

Burn rate 1 consome exatamente o budget na janela do SLO. Burn rate 14,4 consome **todo** o
budget de 30 dias em 2 dias.

A técnica madura combina **duas janelas por alerta** — uma longa para significância
estatística e uma curta para confirmar que **ainda** está acontecendo:

| Severidade | Burn rate | Janela longa | Janela curta | Consome o budget em |
| --- | --- | --- | --- | --- |
| Crítico (pager) | 14,4 | 1h | 5m | ~2 dias |
| Alto (pager) | 6 | 6h | 30m | ~5 dias |
| Médio (ticket) | 3 | 1d | 2h | ~10 dias |
| Baixo (ticket) | 1 | 3d | 6h | ~30 dias |

```yaml
- alert: PaymentsErrorBudgetBurnFast
  expr: |
    sli:payments_availability:burn_rate1h  > 14.4
      and
    sli:payments_availability:burn_rate5m  > 14.4
  labels: { severity: page }
  annotations:
    summary: "Budget da iniciação de pagamento queimando 14x — esgota em ~2 dias"
    runbook: "https://.../runbook/payments-error-budget"
```

O `and` com a janela curta é o que evita o alerta que continua tocando **depois** que o
incidente passou: a janela longa demora a esfriar, a curta já está normal, e o alerta
silencia. É a diferença entre um sistema de alerta que o time confia e um que ele silencia.

## O que todo alerta precisa ter

- **Runbook.** Alerta sem runbook é um susto. O link vai na annotation, não no wiki que
  alguém procura às 3h.
- **Severidade honesta.** Se tudo é crítico, nada é. Página o que exige ação **agora**;
  ticket o resto.
- **Dono.** Rotear por serviço, não por "time de infra".
- **Uma frase que diz o impacto**, não a condição técnica. "Budget queimando 14x, esgota em
  2 dias" é acionável; "ratio_rate5m > 0.0144" não é.

E o que quase ninguém faz: **revisar alertas periodicamente**. Alerta que disparou 40 vezes
e nunca exigiu ação precisa ser deletado ou reescrito. Cada um desses é uma contribuição
direta para o alert fatigue (marco 02), que é a causa nº 1 de MTTA alto.

## On-call sustentável

O plantão é uma condição de trabalho, e a saúde dele é mensurável:

- **Alertas por turno.** Mais de 2 acionamentos noturnos por semana é insustentável — e o
  sintoma aparece como rotatividade, não como reclamação.
- **Taxa de acionáveis.** Dos alertas que dispararam, quantos exigiram ação? Abaixo de ~50%
  o time começa a ignorar o pager, e a partir daí o sistema de alerta não funciona mais,
  independentemente de quão bem configurado esteja.
- **Rotação com tamanho mínimo.** Menos de 4–6 pessoas significa plantão frequente demais.
- **Compensação e folga.** Quem foi acionado de madrugada não rende no dia seguinte;
  fingir que rende é como o problema se acumula.
- **Handoff.** Passagem de turno com o que está aberto e o que foi mitigado sem resolver.

E o princípio que fecha: **o on-call precisa ter poder para consertar a causa.** Um plantão
que só mitiga e abre ticket que nunca é priorizado é um plantão que vai acionar de novo na
semana seguinte, para sempre. É aí que a error budget policy (marco 12) deixa de ser
burocracia e vira a ferramenta que dá esse poder.

## Exemplo numa fintech

O `fin-platform` com quatro alertas de pager. Quatro, não quarenta:

1. **Burn rate 14,4** (1h/5m) na iniciação de pagamento — o principal.
2. **Taxa de autorização** caiu mais de 10 pontos em 15 min, por PSP (marco 08) — pega o
   incidente silencioso que o burn rate não pega, porque ali não há erro técnico.
3. **Fila de liquidação** com item há mais de 30 min — o SLA de janela.
4. **Invariante contábil violada** — severidade máxima, sempre, sem exceção.

O resto é ticket ou dashboard. E o alerta nº 2 existe justamente porque o SLO baseado em
erro HTTP é cego para o caso em que tudo responde 200 e nada é autorizado.

Um detalhe regulatório: incidente relevante numa instituição de pagamento tem prazo de
reporte. O alerta precisa disparar cedo o bastante para que a **comunicação** caiba no
prazo — o que às vezes justifica um limiar mais sensível do que a engenharia sozinha
escolheria.

## Hands-on

**Desafio — burn rate multi-janela.**

1. Implemente as recording rules de burn rate para 5m, 30m, 1h, 6h, 1d e 3d sobre o SLI do
   marco 12.
2. Crie os quatro alertas da tabela, com severidades e runbooks.

**Invariantes testáveis** — três cenários, e cada um prova uma propriedade diferente:

1. **Pico curto:** 50% de erro por 2 minutos. O alerta crítico **não** deve disparar (não
   consome budget relevante). Se disparar, sua janela curta está dominando.
2. **Degradação lenta:** 0,5% de erro por 6 horas. O alerta crítico **não** dispara, e o
   de severidade média/baixa **sim**. Esse é o caso que um limiar fixo de 1% perderia
   completamente.
3. **Incidente agudo:** 20% de erro contínuo. O crítico dispara em **poucos minutos**.
   Cronometre — é o seu MTTD (marco 02).
4. **Recuperação:** com o incidente do cenário 3 resolvido, o alerta precisa **silenciar
   rápido**, graças ao `and` com a janela curta. Meça quanto tempo. Depois remova o `and`
   e meça de novo — a diferença é o motivo de ele existir.

**Complemento — auditoria de alertas.** Liste todos os alertas que existem hoje no seu
trabalho. Para cada um: quantas vezes disparou nos últimos 90 dias, quantas exigiram ação,
e se tem runbook. Delete ou reescreva os que têm taxa de acionável abaixo de 50%. Esse
exercício costuma remover mais da metade dos alertas.

**Complemento — o runbook.** Escreva o runbook do alerta nº 1: como confirmar o impacto,
como identificar se é seu ou do parceiro, as mitigações possíveis em ordem, e quando
escalar. Teste-o com alguém que não o escreveu.

**Checagem.** (a) Por que "erro acima de 1%" erra nos dois sentidos? (b) Para que serve o
`and` com a janela curta? (c) Um alerta disparou 40 vezes e nunca exigiu ação — o que
fazer? (d) Por que taxa de acionáveis abaixo de 50% quebra o sistema de alerta inteiro?

## Principais aprendizados

- Alerte por sintoma; a exceção é saturação preditiva com ação clara e específica.
- Burn rate multi-janela pega o incidente agudo e a degradação lenta, e o `and` com a
  janela curta é o que faz o alerta silenciar depois que passou.
- Todo alerta precisa de runbook, severidade honesta, dono e uma frase de impacto — e
  revisão periódica que deleta o que nunca exigiu ação.
- On-call sustentável se mede por acionamentos por turno e taxa de acionáveis; e o plantão
  precisa ter poder para consertar a causa.
