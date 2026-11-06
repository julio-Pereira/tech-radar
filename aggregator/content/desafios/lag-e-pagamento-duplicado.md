---
id: lag-e-pagamento-duplicado
titulo: "Incidente: lag no consumidor de liquidação e Pix pagos em dobro"
tipo: incidente
nivel: senior
duracaoMin: 45
prerequisitos:
  - kafka/04
  - kafka/05
  - arquitetura-eventos/08
  - observabilidade/15
conceitos: [idempotencia, outbox, slo]
parametros:
  lagMax: { min: 50000, max: 400000, passo: 50000 }
  taxaEntrada: { min: 2000, max: 8000, passo: 1000 }
  taxaConsumo: { valores: [1000, 1500] }
esclarecimentos:
  - pergunta: "Desde quando o lag cresce?"
    revela: "Desde o deploy das 14h10 do consumidor de liquidação."
    chave: true
  - pergunta: "O que mudou nesse deploy?"
    revela: "Um enriquecimento novo chama a API de limites para cada mensagem, com timeout de 5 s."
    chave: true
  - pergunta: "Como os pagamentos em dobro foram descobertos?"
    revela: "A conciliação achou 37 Pix liquidados duas vezes, todos entre 14h20 e 14h50."
    chave: true
  - pergunta: "Houve rebalance do grupo de consumidores?"
    revela: "Sim: 11 rebalances em 30 minutos; max.poll.interval.ms está no valor padrão."
    chave: true
  - pergunta: "Qual a taxa de entrada agora?"
    revela: "{taxaEntrada} mensagens por segundo, normal para o horário."
    chave: true
  - pergunta: "Quem está de plantão no fornecedor da API de limites?"
    revela: "Ninguém de fora: a API de limites é interna, de outro time."
    chave: false
estimativas:
  - id: crescimento-lag
    enunciado: "Quanto o lag cresce por minuto com as taxas atuais"
    unidade: mensagens/min
    formula: "(taxaEntrada - taxaConsumo) * 60"
  - id: tempo-para-drenar
    enunciado: "Minutos para zerar o lag de pico depois de escalar o consumo para o dobro da taxa de entrada"
    unidade: min
    formula: "lagMax / taxaEntrada / 60"
decisoes:
  - pergunta: "Qual a causa mais provável do lag?"
    opcoes:
      - "Falta de partições no tópico, que limita o paralelismo do consumo"
      - "Processamento lento estoura max.poll.interval, gera rebalance e reentrega"
      - "Bug no produtor, que passou a publicar cada mensagem duas vezes"
      - "Disco cheio no broker, que atrasa a gravação das mensagens novas"
    correta: 1
    explicacao: "O deploy pôs uma chamada lenta por mensagem; o lote passa do max.poll.interval, o consumidor sai do grupo, há rebalance e o lote sem commit é reentregue. As partições não mudaram, o produtor não foi alterado e o broker não mostra sintoma."
  - pergunta: "Por que a reentrega virou pagamento em dobro?"
    opcoes:
      - "O Kafka garante entrega exatamente uma vez por padrão, então o erro só pode ser do banco"
      - "O consumidor efetiva o pagamento sem checar se aquela mensagem já foi processada"
      - "O SPI processa em dobro qualquer mensagem que chega duas vezes no mesmo segundo"
      - "O cliente apertou duas vezes o botão de pagar e o app mandou as duas ordens"
    correta: 1
    explicacao: "Com entrega pelo menos uma vez, a reentrega é esperada: o consumidor precisa de inbox ou chave de idempotência antes do efeito. O Kafka não garante exatamente uma vez para o efeito no seu banco; o SPI e o app não explicam duplicatas concentradas na janela do rebalance."
  - pergunta: "Qual a mitigação imediata?"
    opcoes:
      - "Tirar a chamada lenta do loop e ajustar max.poll.interval ao lote real"
      - "Reiniciar os consumidores a cada cinco minutos até o lag diminuir"
      - "Apagar e recriar o tópico, descartando as mensagens acumuladas no lag"
      - "Dobrar as partições na hora, sem mudar nada no código do consumidor"
    correta: 0
    explicacao: "Parar o rebalance é o primeiro passo: a chamada lenta sai do caminho (ou ganha timeout curto) e o intervalo combina com o lote. Reiniciar gera mais rebalance; apagar o tópico perde pagamentos; mais partições não resolvem um consumidor lento por mensagem."
reviravolta:
  momentoPct: 65
  texto: "Corrigido o rebalance, o lag cai — e volta a crescer às 23h, sem deploy. Os logs mostram timeouts da API de limites só nessa hora. O que mais está acontecendo?"
  rubrica:
    - "Segunda causa: a dependência fica lenta numa janela própria (um processo noturno da API de limites)"
    - "Proteção no consumidor: timeout curto, circuit breaker ou fila de reprocesso"
    - "Post-mortem sem culpados com as duas causas e ações com dono"
entregavel:
  secoesObrigatorias: [LinhaDoTempo, Diagnostico, CausasRaiz, Mitigacao, Acoes]
rubrica:
  - "Montou a linha do tempo antes de propor causa"
  - "Ligou rebalance a reentrega e reentrega a duplicidade"
  - "Separou mitigação imediata de correção definitiva"
  - "Tratou os 37 Pix em dobro: estorno, comunicação e conciliação"
  - "Escreveu ações com dono e prazo, sem culpar pessoas"
---
## Enunciado

São 15h. O consumidor de liquidação de Pix tem lag de {lagMax} mensagens e consome
{taxaConsumo} mensagens por segundo. A conciliação acabou de achar pagamentos liquidados duas
vezes. Você é a pessoa de plantão.

Sinais disponíveis agora:

```text
14:10 deploy liquidacao-consumer v2.31 (enriquecimento via api-limites)
14:18 WARN  consumer group liquidacao: member left group (max.poll.interval.ms exceeded)
14:18 INFO  consumer group liquidacao: rebalance started
14:19 WARN  commit failed: CommitFailedException (group rebalanced)
...  11 rebalances entre 14:18 e 14:48
15:00 conciliacao: 37 pagamentos com liquidação em dobro (14:20–14:50)
```

Pergunte o que precisar, diagnostique e proponha mitigação e correção.

## Dicas

- `kafka/04` explica o que acontece quando um consumidor demora entre dois polls.
- `arquitetura-eventos/08` é o lugar da defesa contra reentrega.

## Gabarito comentado

**Linha do tempo.** Deploy às 14h10; a partir de 14h18, lotes passam do max.poll.interval por causa
da chamada de 5 s por mensagem; rebalance, commit falho e reentrega; duplicatas na mesma janela.

**Causas.** A chamada síncrona lenta no loop do consumidor (gatilho) e a falta de idempotência no
efeito do pagamento (o que transformou reentrega em dinheiro duplicado).

**Mitigação.** Tirar ou limitar a chamada lenta e ajustar o intervalo; escalar o consumo para drenar
o lag; congelar a liquidação automática dos itens duplicados.

**Correção.** Inbox ou chave de idempotência antes do efeito; timeout curto e circuit breaker para a
API de limites; alerta de rebalance e de lag com runbook.

**Reviravolta.** A API de limites tem uma janela noturna lenta (outra causa, sem deploy): o consumidor
precisa se proteger de dependência lenta por si, e o post-mortem registra as duas causas.
