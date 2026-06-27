---
id: introducao
title: "Por que Go numa fintech"
summary: "A filosofia da linguagem e os quatro pilares de domínio financeiro que aparecem desde a primeira linha de código."
estimatedMinutes: 20
references:
  - title: "Effective Go"
    url: https://go.dev/doc/effective_go
  - title: "shopspring/decimal"
    url: https://github.com/shopspring/decimal
---

## Não escreva "Java em outra sintaxe"

O erro mais comum de quem migra para Go vindo de Java/Spring é tratar a linguagem
como uma sintaxe diferente para os mesmos hábitos. Go tem **opiniões fortes**:
composição sobre herança, simplicidade sobre abstração, e um modelo de concorrência
(CSP via channels) que não tem equivalente direto na JVM. Algumas coisas vão parecer
primitivas demais — não há `Optional`, não há exceções, não há ORM mágico de fábrica.
Outras vão parecer libertadoras: um binário único, estático, que sobe em milissegundos.

A meta deste curso não é só "saber Go", e sim **tomar decisões arquiteturais
informadas** sobre quando Go vence Java em sistemas financeiros — e quando não vence.

## Um produto que cresce: LedgerCore

Em vez de seis projetos descartáveis, o curso evolui um único produto fictício de
pagamentos, o **LedgerCore**. Ele nasce como uma CLI de carteira e termina como um
microservice observável, com antifraude por gRPC e processamento em lote. Cada fase
adiciona uma camada ao mesmo sistema — exatamente como uma fintech real cresce.

## Quatro pilares de domínio, desde o dia 1

Precisão monetária, idempotência, contabilidade e auditoria não são "adicionados
depois". Eles aparecem no menor exercício.

- **Precisão monetária** — nunca use `float64` para dinheiro. O padrão é `int64` na
  menor unidade (centavos) ou `shopspring/decimal` para fração arbitrária (juros,
  câmbio). O equivalente é o `BigDecimal` do Java, mas em Go a disciplina é cultural:
  a linguagem não te impede de errar.
- **Idempotência** — toda operação financeira precisa ser idempotente. O padrão
  `Idempotency-Key` (popularizado pela Stripe) garante que uma requisição duplicada
  retorne o resultado anterior em vez de re-executar.
- **Contabilidade double-entry** — toda movimentação tem dois lançamentos, um débito e
  um crédito que se equilibram. O total do sistema sempre soma zero, o que habilita
  reconciliação automática.
- **Auditoria e compliance** — logs estruturados, audit log imutável, mascaramento de
  dados sensíveis (LGPD/PCI-DSS). Em fintech, "deletar dados" quase sempre significa
  anonimizar: registros contábeis não podem ser apagados.

```go
// O tipo Money que acompanha o curso inteiro: centavos em int64, nunca float.
type Money struct {
    Amount   int64  // menor unidade da moeda (ex.: centavos)
    Currency string // ISO 4217, ex.: "BRL"
}
```

## Principais aprendizados

- Go não é Java com chaves diferentes — internalize composição, simplicidade e CSP.
- O produto âncora (LedgerCore) cresce organicamente; você constrói um sistema, não seis.
- Precisão monetária, idempotência, double-entry e auditoria entram desde o primeiro
  exercício — não como reforma posterior.
