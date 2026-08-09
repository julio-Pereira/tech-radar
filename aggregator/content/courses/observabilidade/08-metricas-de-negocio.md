---
id: metricas-de-negocio
title: "Métricas de negócio"
summary: "O sinal que pega o incidente silencioso: TPV, taxa de autorização e invariantes contábeis — o que RED e USE estruturalmente não cobrem."
estimatedMinutes: 45
references:
  - title: "Google SRE Book — Monitoring Distributed Systems"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
  - title: "Prometheus — Metric and Label Naming"
    url: https://prometheus.io/docs/practices/naming/
---

## O incidente que nenhum gráfico técnico pega

Todos os endpoints em 200. Latência p99 em 90ms. Zero erro, zero restart, CPU tranquila.
E a receita do dia está 30% abaixo do normal.

O que aconteceu: uma mudança de configuração fez o `pix-gateway` mandar o campo errado
para um dos PSPs. Ele responde **200 com recusa** — do ponto de vista de HTTP, tudo
funcionou perfeitamente. O sistema está saudável e a empresa está perdendo dinheiro.

Esse é o buraco anunciado no marco 03: **os frameworks medem transporte, não corretude.**
RED diz que as requisições foram atendidas. USE diz que nenhum recurso saturou. Nenhum dos
dois olha o *conteúdo* da resposta.

Métrica de negócio é o sinal que fecha esse buraco. E ela costuma ser a **primeira** a
detectar os incidentes mais caros, porque erro de lógica quase nunca produz erro técnico.

## As métricas que importam numa fintech

**Taxa de autorização** — o percentual de tentativas aprovadas, quebrada por **PSP,
bandeira, método e canal**. É a métrica mais valiosa da lista, por três razões: reage a
quase todo tipo de problema (seu, do parceiro, de configuração, de antifraude), tem
sazonalidade estável o bastante para o desvio ser óbvio, e é diretamente entendida pelo
negócio.

```promql
sum by (psp) (rate(payment_attempts_total{result="authorized"}[5m]))
  / sum by (psp) (rate(payment_attempts_total[5m]))
```

A quebra por PSP é o que transforma "algo está errado" em "é o parceiro X" em segundos.

**TPV por minuto** — volume financeiro processado. É o denominador de qualquer conversa
sobre impacto: minuto fora × TPV/min = o custo do incidente (marco 01).

**Fila de liquidação** — quantos pagamentos aguardam processamento, e há quanto tempo o
mais antigo espera. É saturação (marco 03) em unidade de negócio, e é **preditiva**: ela
cresce antes de o SLA furar.

**Motivos de recusa** — a distribuição de causas (saldo insuficiente, antifraude, timeout,
dado inválido). Uma queda na taxa de autorização é uma pergunta; a distribuição de motivos
é a resposta. Se "dado inválido" saltou de 0,1% para 12%, você já sabe onde procurar.

**Invariantes contábeis** — o único sinal que pega erro de cálculo:

- A soma dos lançamentos do ledger fecha em zero (double-entry, trilha `go-fintech`).
- O total liquidado no dia bate com o total autorizado, dentro da janela esperada.
- Nenhuma conta ficou com saldo negativo sem limite autorizado.

Uma invariante violada é sempre incidente — não há falso positivo aceitável. É o tipo de
alerta que quase nenhuma empresa tem e que pega a classe de erro mais cara que existe.

## Como não estragar

**Cardinalidade** (marcos 04 e 07). `psp` (5), `bandeira` (6), `resultado` (4), `canal`
(4) dá 480 séries — barato e útil. `account_id` ou `payment_id` derruba o Prometheus.
Métrica de negócio é agregada por natureza; o caso individual é log e trace.

**Dinheiro em métrica.** Prometheus trabalha com float64, e o marco 07 da trilha Kafka
alerta contra float para dinheiro. Aqui o uso é diferente e aceitável: a métrica é um
**agregado estatístico**, não o registro contábil. Ainda assim, exporte em **centavos**
(`payment_amount_cents_total`) para evitar arredondamento acumulado, e nunca use a métrica
como fonte para conciliação — a fonte é o ledger.

**Nomeação.** Siga a convenção do Prometheus: `_total` para counter, unidade explícita no
nome (`_seconds`, `_cents`), prefixo de domínio (`payment_`, `ledger_`). Uma métrica de
negócio mal nomeada é usada errado por quem não a escreveu.

**Onde instrumentar.** No ponto onde a **decisão de negócio** acontece, não na borda HTTP.
A borda não sabe se a autorização foi concedida; o serviço de autorização sabe.

## Sazonalidade: o limiar fixo não funciona

Taxa de autorização de 94% é normal às 14h de terça e pode ser anômala às 3h de domingo.
Volume cai 80% de madrugada, sobe no fim do mês, explode na Black Friday.

Três abordagens, em ordem de custo:

1. **Comparação com o período anterior** — `payments_total` de agora contra o mesmo
   horário de 7 dias atrás (`offset 7d` no PromQL). Simples, robusto, resolve a maior
   parte dos casos.
2. **Banda estatística** — média móvel ± N desvios sobre a janela histórica. Precisa de
   cuidado com feriado.
3. **Detecção de anomalia** — vale a pena bem depois, e raramente justifica o custo antes
   de as duas primeiras estarem em uso.

E a mitigação que funciona sem nada disso: alerte pela **variação relativa** em vez do
valor absoluto. "A taxa de autorização caiu mais de 10 pontos em 15 minutos" é robusta a
sazonalidade, porque a sazonalidade é lenta e o incidente é rápido.

## Exemplo numa fintech

O painel de plantão do `fin-platform`, na ordem de leitura:

1. **TPV por minuto** com a linha de 7 dias atrás sobreposta — a leitura é instantânea.
2. **Taxa de autorização por PSP** — cinco linhas; uma se descolando é o diagnóstico.
3. **Fila de liquidação** e idade do item mais antigo.
4. **RED do `pix-gateway`** (marco 07).
5. **Saturação**: pool Hikari, lag do consumidor, throttling de CPU.

As três primeiras são de negócio, e é deliberado: elas detectam o que as duas últimas não
detectam, e são o que permite dizer ao negócio o tamanho do impacto sem tradução.

Os alertas de negócio que vão para o **pager**, e não para o dashboard:

- Taxa de autorização caiu >10 pontos em 15 min (qualquer PSP).
- Fila de liquidação com item há mais de 30 min.
- **Invariante contábil violada** — severidade máxima, sempre.

## Hands-on

**Desafio — instrumentar e provar o incidente silencioso.**

1. Instrumente o `pix-gateway`: `payment_attempts_total{psp, bandeira, result, canal}`,
   `payment_amount_cents_total{psp}`, `settlement_queue_depth` e
   `settlement_oldest_age_seconds`.
2. Construa o painel com as cinco camadas acima.
3. **Injete o incidente silencioso:** faça um dos PSPs recusar 100% das tentativas, mas
   respondendo **HTTP 200** normalmente.

**Invariantes testáveis:**

- Nenhum painel técnico (RED, USE, latência, erro) muda perceptivelmente. Prove com
  captura antes e depois.
- A taxa de autorização daquele PSP cai a zero e o **alerta dispara**.
- O TPV cai proporcionalmente à fatia daquele PSP.
- Meça o **tempo entre a injeção e o alerta** (o MTTD do marco 02). Depois calcule quanto
  TPV foi perdido nesse intervalo — esse número é o argumento para reduzir o MTTD.

4. **A invariante contábil.** Crie um alerta para "soma dos lançamentos do dia ≠ 0".
   Injete um bug que credita sem debitar e prove que **só** esse alerta pega.

**Complemento — sazonalidade.** Configure o alerta de volume com limiar fixo e deixe rodar
até a madrugada; registre o falso positivo. Reescreva com `offset 7d` e variação relativa,
e mostre que ele fica quieto de madrugada e dispara no incidente.

**Checagem.** (a) Todos os endpoints em 200 e a receita caiu — que sinal pega isso?
(b) Por que `account_id` não pode ser label de métrica de negócio? (c) Por que a taxa de
autorização é mais útil quebrada por PSP? (d) Qual alerta de negócio nunca tem falso
positivo aceitável?

## Principais aprendizados

- RED e USE medem transporte; erro de lógica não produz erro técnico, e a métrica de
  negócio é o que o detecta.
- Taxa de autorização por PSP é a métrica de maior valor diagnóstico; motivos de recusa
  são a explicação que ela pede.
- Invariante contábil violada é sempre incidente — o único sinal que pega erro de cálculo.
- Cardinalidade baixa e agregada; alerte por variação relativa e comparação com o período
  anterior, não por limiar fixo.
