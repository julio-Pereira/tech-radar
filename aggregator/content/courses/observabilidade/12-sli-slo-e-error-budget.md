---
id: sli-slo-error-budget
title: "SLI, SLO e error budget"
summary: "Onde o vocabulário do marco 02 vira recording rule: escolher o SLI que reflete a experiência, e o que fazer com a dependência que você não controla."
estimatedMinutes: 55
references:
  - title: "Google SRE Workbook — Implementing SLOs"
    url: https://sre.google/workbook/implementing-slos/
  - title: "Google SRE Book — Service Level Objectives"
    url: https://sre.google/sre-book/service-level-objectives/
  - title: "Prometheus — Recording Rules"
    url: https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/
---

## Do vocabulário à implementação

O marco 02 definiu SLI, SLO e error budget. Este marco os transforma em consulta,
recording rule e painel — e é aqui que as definições encontram os problemas reais.

> **Reencontro:** SLI é a razão entre eventos bons e eventos válidos; SLO é a meta com
> janela explícita; error budget é o complemento, para gastar.

## Escolher o SLI

A maior parte do trabalho está aqui, não na matemática.

**Um bom SLI reflete a experiência do usuário.** "O processo está de pé" é trivial e
inútil. "O cliente consegue concluir um pagamento" é difícil e significa alguma coisa.

Três formas de medir, com um viés cada:

- **No servidor** — barato, completo, e **cego** ao que não chegou até você. Se o
  balanceador devolve 502, seu SLI fica perfeito.
- **No cliente/RUM** — reflete a realidade, inclui rede e dispositivo, e mistura problemas
  que não são seus (o 4G ruim do usuário conta contra você?).
- **Sintético** (marco 01) — consistente, controlado, e mede um caminho artificial que pode
  não representar o tráfego real.

O desenho maduro usa servidor como SLI principal e sintético como rede de segurança para o
que não chega.

**Definir "evento válido" é onde mais se erra.** Um 4xx causado por payload inválido do
cliente deve contar como falha sua? Em geral não — mas se **todos** os clientes passaram a
receber 400 depois do seu deploy, é falha sua e o SLI ficou verde. A saída honesta é
excluir 4xx do numerador de erro e ter um **alerta separado** para variação anômala de
4xx, senão você fica cego para uma classe real de incidente.

Dois tipos de SLI, e a maioria dos serviços precisa dos dois:

```promql
# Disponibilidade: proporção de requisições sem erro do servidor
sum(rate(http_server_requests_total{route="/payments", status!~"5.."}[5m]))
  / sum(rate(http_server_requests_total{route="/payments"}[5m]))

# Latência: proporção de requisições dentro do limiar
sum(rate(http_server_request_duration_seconds_bucket{route="/payments", le="0.5"}[5m]))
  / sum(rate(http_server_request_duration_seconds_count{route="/payments"}[5m]))
```

Repare que o SLI de latência é **uma razão**, não um percentil. "p99 < 500ms" e "99% das
requisições abaixo de 500ms" parecem o mesmo e não são: o primeiro é uma estatística sobre
uma janela, o segundo é contável e composta com o error budget de forma natural. Meça a
proporção — e ela sai direto do bucket do histograma (marco 07).

## Recording rules

O burn rate consulta janelas longas. Sem pré-cálculo, cada avaliação de alerta faz uma
consulta pesada, e o Prometheus fica lento justamente durante o incidente.

```yaml
groups:
  - name: slo-pix-gateway
    interval: 30s
    rules:
      - record: sli:payments_availability:ratio_rate5m
        expr: |
          sum(rate(http_server_requests_total{route="/payments", status!~"5.."}[5m]))
            / sum(rate(http_server_requests_total{route="/payments"}[5m]))
      - record: sli:payments_availability:ratio_rate1h
        expr: # mesma expressão com [1h]
      - record: sli:payments_availability:ratio_rate6h
        expr: # mesma expressão com [6h]
```

A convenção de nome (`nível:métrica:operação`) importa mais do que parece: alguém vai ler
essas regras daqui a um ano.

**Error budget consumido** na janela de 30 dias:

```promql
(1 - sli:payments_availability:ratio_rate30d) / (1 - 0.999)
```

Resultado 0,5 significa metade do orçamento gasto. É esse número — não a disponibilidade
bruta — que vai para o painel, porque é ele que dispara decisão.

## SLO composto e a dependência que você não controla

O marco 02 mostrou que dependências em série multiplicam. Aqui aparece a consequência
prática e desconfortável: **o SLO da autorização inclui o PSP, e você não controla o PSP.**

Três abordagens, e nenhuma é indolor:

1. **Excluir a falha do parceiro do SLI.** Honesto sobre o que você controla, e **cega**
   sobre o que o cliente sente — que não distingue de quem é a culpa. Se escolher isso,
   tenha um SLI separado para o parceiro, ou você vai relatar 99,95% enquanto o cliente não
   consegue pagar.
2. **Incluir e assumir um SLO menor.** Reflete a experiência real e transforma o seu
   número numa métrica sobre terceiro.
3. **Remover a dependência do caminho crítico** — segundo PSP com failover, ou modo
   degradado (aceitar o pagamento e liquidar depois). É caro e é a única que **melhora** o
   número em vez de escolher como reportá-lo.

A escolha é de negócio. O trabalho de engenharia é apresentar as três com a conta feita —
e não deixar a decisão virar um SLI ambíguo que ninguém entende seis meses depois.

## Error budget policy

SLO sem policy é relatório. A policy diz o que **muda**:

| Budget consumido | Consequência |
| --- | --- |
| < 50% | ritmo normal |
| 50–90% | revisão de risco antes de mudança grande; nada de deploy sexta |
| > 90% | congela feature; time prioriza confiabilidade |
| esgotado | postmortem obrigatório e plano com prazo antes de retomar |

Ela precisa estar **acordada com o negócio antes do incidente**. Negociar congelamento de
feature no meio da crise não funciona, e é onde a maioria das iniciativas de SLO morre.

Duas armadilhas: **budget nunca gasto** significa SLO conservador demais (marco 02) — você
está deixando velocidade na mesa. E **budget sempre estourado** significa SLO irreal ou
sistema que precisa de investimento; manter a meta impossível só ensina o time a ignorá-la.

## Exemplo numa fintech

O `fin-platform` com três SLOs, e a escolha dos números é deliberada:

| Fluxo | SLI | SLO | Justificativa |
| --- | --- | --- | --- |
| Iniciação de pagamento | disponibilidade, servidor | 99,9% / 30d | caminho do dinheiro |
| Iniciação de pagamento | latência < 500ms | 99% / 30d | percebido pelo cliente |
| Consulta de saldo | disponibilidade | 99,5% / 30d | tolera degradação |
| Liquidação (batch) | conclusão até 06h | 99% / 30d | SLI baseado em prazo, não em requisição |

O último é o interessante: nem todo SLI é sobre requisição HTTP. Para um processo em lote,
o evento válido é "a execução do dia" e o evento bom é "concluiu dentro da janela".

E o SLA com o PSP (99,5%) é mais frouxo que o SLO interno de 99,9% — o que só é honesto
porque existe um segundo PSP no caminho crítico. Sem ele, o SLO de 99,9% seria uma promessa
que a aritmética do marco 02 já mostrou ser impossível.

## Hands-on

**Desafio — do SLI ao painel de error budget.**

1. Defina os SLIs de disponibilidade e latência do `pix-gateway` como **razões**, medidas
   no servidor.
2. Escreva as recording rules para 5m, 1h, 6h e 30d.
3. Construa o painel: SLI atual, SLO como linha de referência, **error budget restante em
   minutos** e a taxa de consumo.

**Invariantes testáveis:**

1. Injete exatamente **1%** de erro por **10 minutos** com tráfego constante. Calcule à mão
   quanto do budget de 30 dias isso deveria consumir e **compare com o painel**. Se
   divergir, sua janela ou seu denominador estão errados — e é melhor descobrir agora.
2. Com o serviço saudável, o budget consumido deve ficar **estável**, não subindo devagar.
   Subida constante em serviço saudável significa que o SLI está contando algo que não
   deveria (health check, 4xx legítimo, tráfego de bot).
3. Reinicie um pod: o painel **não** deve mostrar consumo de budget se nenhuma requisição
   falhou (marco 06 da trilha Kubernetes).

**Complemento — a dependência externa.** Implemente as três abordagens da seção para a
dependência do PSP e construa os três painéis lado a lado, com dados reais de um período
em que o PSP degradou. Depois escreva meia página: qual você defenderia na reunião com o
negócio e por quê. O critério de qualidade é reconhecer o que a sua escolha esconde.

**Complemento — a policy.** Escreva a error budget policy do `fin-platform` com os quatro
níveis. Leve para uma pessoa de produto e obtenha concordância **por escrito**. A parte
difícil deste exercício não é técnica.

**Checagem.** (a) Por que medir "proporção de requisições abaixo de 500ms" é melhor que
"p99 < 500ms"? (b) Você excluiu 4xx do SLI — do que ficou cego, e como cobre isso? (c) O
budget sobe devagar com o serviço saudável: o que provavelmente está errado? (d) Por que a
error budget policy precisa ser acordada antes do incidente?

## Principais aprendizados

- O trabalho está em escolher o SLI e definir "evento válido", não na matemática; meça
  proporções, que compõem com o budget e saem do histograma.
- Recording rules pré-calculam as janelas do burn rate — sem elas o Prometheus fica lento
  durante o incidente.
- A dependência externa não tem solução indolor: excluir cega, incluir importa o problema
  do terceiro, e só remover do caminho crítico melhora o número.
- SLO sem error budget policy é relatório; budget nunca gasto é SLO conservador, sempre
  estourado é meta irreal.
