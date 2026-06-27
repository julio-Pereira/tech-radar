---
id: java-vs-go
title: "Decisão arquitetural: Java vs Go em Fintech"
summary: "O resultado prático do curso: escolher a tecnologia com fundamento, sabendo onde Go ganha, onde Java continua forte e onde dá empate."
estimatedMinutes: 25
references:
  - title: "Designing Data-Intensive Applications — Martin Kleppmann"
    url: https://dataintensive.net/
---

## O entregável final é uma decisão, não um framework

Tudo o que o LedgerCore exercitou converge para uma única capacidade: **decidir
tecnologia com fundamento**. Não existe "Go é melhor que Java" — existe contexto.

## Onde Go ganha em fintech

- **Gateways e BFFs** — alto fan-out, baixa latência, footprint pequeno. A Stripe usa Go
  pesado nessa camada.
- **Processamento de transações de alto throughput** com lógica não muito complexa:
  autorizações, validações, roteamento de pagamentos.
- **Ferramentas internas** — CLIs de operação, scripts de reconciliação, migração. O
  binário único domina aqui.
- **Cloud-native** — operators de K8s, sidecars, plugins de service mesh: ecossistema
  nativamente Go.
- **Cold start importa** — serverless, webhook handlers, scale-to-zero.

## Onde Java continua forte

- **Core bancário e motores de cálculo complexos** — derivativos, motores de risco, com
  bibliotecas maduras (Joda-Money, Strata).
- **Batch pesado** — Spring Batch é o padrão de mercado para fim-de-dia, settlement,
  conciliação massiva.
- **Streaming complexo** — Kafka Streams, Flink: o ecossistema Java é referência.
- **Integrações corporativas** — ISO 8583, ISO 20022, SWIFT têm libs Java battle-tested;
  em Go você implementaria mais coisa do zero.
- **Domínios com regras intricadas** — crédito, seguro: records, sealed types e pattern
  matching do Java moderno expressam melhor.

## Empate técnico

Para APIs de produto comuns — cadastro, KYC simples, consulta de saldo, extrato — decide
a infraestrutura existente, a expertise do time e o custo operacional. Aí a escolha é
organizacional, não técnica.

## O padrão emergente em fintechs maduras

```text
Go            → borda e serviços de alto throughput
Java/Kotlin   → core de domínio complexo
Python        → data / ML
Rust          → nichos de performance crítica
```

Saber Go bem coloca você exatamente na camada que mais cresce — a da borda e do alto
throughput. Mas o valor real do curso é conseguir desenhar essa tabela para o **seu**
sistema e defender cada linha.

## Principais aprendizados

- Go vence na borda, no throughput e nas ferramentas; Java segue forte no core complexo
  e no batch pesado.
- Em APIs de produto comuns, a decisão é de time e infraestrutura, não de linguagem.
- O entregável do curso não é código: é a capacidade de justificar a escolha tecnológica.
