---
id: cobranca-e-recuperacao
title: "Cobrança e recuperação"
summary: "Cobrança eficaz é a regra certa no dia certo, dentro dos limites — e o limite (de contato e de dignidade) é requisito, não polimento."
estimatedMinutes: 60
---

## Faixas de atraso

O atraso se organiza em **faixas** (*buckets*): 1–30, 31–60, 61–90 e acima de 90 dias, por
exemplo. A faixa não é só um rótulo de relatório: ela decide **o que acontece** com o contrato — que
passo da régua roda, que provisão se faz (marco 09), quando o contrato vira candidato a
renegociação ou a baixa. Por isso o cálculo de "dias de atraso" precisa ser **um só** em todo o
sistema, com regra declarada para fim de semana, feriado e pagamento parcial.

```diagrama
cr-buckets
```

## A régua de cobrança

A **régua** é a sequência de ações por faixa e por dia: lembrete **antes** do vencimento, contato no
atraso, oferta de negociação, e, mais adiante, restrição cadastral (**conferir** regras, prazos e
avisos prévios exigidos). Cada passo é um evento agendado de uma **saga de cobrança**
(`arquitetura-eventos/09`), e cada passo é **idempotente**: a retentativa do agendador não manda
duas mensagens. A régua roda com um **relógio injetável** — é assim que se testa um mês de cobrança
em um segundo.

## Janela, frequência e consentimento de contato

O limite de contato é **requisito**: horário permitido, canais permitidos, **limite diário** de
tentativas e respeito ao consentimento do cliente sobre canais (**conferir** a regulação aplicável e
o código de defesa do consumidor). O jeito de garantir isso é ter **um único portão de saída**: toda
mensagem, de qualquer passo da régua, passa por uma verificação que checa proteção, canal, janela e
limite antes de sair. Mensagem fora da janela não é descartada: é **adiada** para a próxima janela
válida, e o adiamento fica registrado.

```diagrama
cr-portao-contato
```

## Promessa de pagamento

O cliente promete pagar na sexta. A **promessa** suspende a régua até a data prometida (mais uma
tolerância declarada). Se o pagamento chega, a régua para; se a promessa **quebra**, a régua avança
**exatamente um passo** — a quebra é um evento, processado uma vez, mesmo que o verificador rode
três vezes no sábado.

## Renegociação e o risco de mascarar inadimplência

Renegociar (reparcelar, dar desconto, conceder carência) é legítimo e, muitas vezes, a melhor
recuperação. O risco é a **cura artificial**: o contrato renegociado "volta a estar em dia" e some
dos relatórios de atraso, enquanto o risco do cliente não mudou. Por isso: a renegociação **conserva
o total devido** (o desconto, se houver, é um lançamento próprio, como no marco 03), e o
**histórico de atraso** não é zerado para fins de provisão e de reclassificação (**conferir** a
regra de reclassificação aplicável).

## Recuperação, baixa e recuperação posterior

Quando a cobrança interna não resolve, a recuperação pode passar a uma **assessoria** ou a
**cessão** da carteira (venda dos créditos a terceiros) — nesta trilha, só como conceito. Em algum
momento o crédito vai para **baixa para prejuízo** (*write-off*): o saldo sai do ativo contra a
provisão já constituída (marco 09). Se depois o cliente paga, isso é **recuperação posterior** — um
**lançamento novo**, de receita de recuperação, **nunca** a reversão da baixa: a baixa aconteceu e
continua no histórico.

## Superendividamento e proteção do consumidor

Há clientes que não conseguem pagar sem comprometer o mínimo para viver, e a legislação prevê
tratamento específico para o superendividamento (**conferir** a lei e a regulamentação vigentes).
Para o sistema, isso vira estado: um cliente **em proteção** (negociação global em curso, por
exemplo) **não recebe cobrança ativa**, e essa regra fica no mesmo portão de contato, não espalhada
por cada passo da régua.

## Exemplo numa fintech

O cliente, com 12 dias de atraso, promete pagar na sexta. O `fin-lend` registra a promessa e
suspende a régua; uma mensagem agendada para quinta às 20h30, fora da janela de contato, é adiada
para sexta às 9h e depois descartada porque a promessa a suspende. O pagamento não chega; no sábado,
o verificador de promessas roda três vezes, e a quebra avança a régua uma única vez, para "oferta de
negociação" — com cada evento registrado.

## Hands-on

**Tutorial.** Implemente `cobranca/` com faixas, régua e um **relógio falso** injetado.

**Desafio.** Implemente a renegociação com desconto e a regra declarada de reclassificação do atraso.

**Invariantes testáveis**

1. A **faixa** de cada contrato bate com a **tabela de casos** por dias de atraso, incluindo fim de
   semana, feriado e pagamento parcial.
2. **Nenhum contato** sai fora da janela, acima do limite diário ou sem consentimento do canal —
   teste com o relógio falso varrendo 30 dias.
3. A renegociação **conserva o total devido**, salvo desconto explícito lançado à parte.
4. Renegociar **não zera** o histórico de atraso para o cálculo de provisão (propriedade com a regra
   declarada).
5. Uma promessa quebrada **avança a régua exatamente uma vez**, mesmo com o verificador rodando
   várias vezes (idempotência).
6. A baixa move o saldo para a conta correta, e a **recuperação posterior** é um lançamento novo,
   nunca a reversão da baixa.
7. Um cliente **em proteção** não recebe nenhuma cobrança ativa.

**Complemento.** Revise a régua de cobrança do seu produto contra o que a regulação permite e contra
o que é decente — e escreva as diferenças.

**Checagem**

1. Por que o cálculo de dias de atraso precisa ser um só em todo o sistema?
2. Por que todas as mensagens passam por um único portão de contato?
3. O que é cura artificial, e como o sistema a evita?
4. Por que a recuperação posterior não reverte a baixa?

> **Reencontro — `arquitetura-eventos/09` e `/08`.** A régua é uma saga longa com passos agendados e
> idempotentes, publicada com a mesma garantia do outbox; aqui o relógio injetável é o que a torna
> testável.

A governança de PII de `dados-distribuidos/13` define o que a cobrança pode guardar e mostrar sobre
o cliente; e os alertas com runbook de `observabilidade/13` são o molde para o alarme de "mensagem
enviada fora da janela", que, se disparar, é um incidente, não um aviso.

## Principais aprendizados

- A faixa de atraso decide a régua, a provisão e a renegociação; o cálculo de atraso é um só.
- A régua é uma saga agendada e idempotente, testada com relógio injetável.
- Todo contato passa por um único portão: proteção, canal, janela e limite diário.
- Renegociação conserva o devido e não zera o histórico de atraso: nada de cura artificial.
- Recuperação posterior é um lançamento novo; a baixa continua no histórico.
