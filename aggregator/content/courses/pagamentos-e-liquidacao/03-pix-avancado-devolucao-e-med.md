---
id: pix-avancado-e-med
title: "Pix avançado: agendamento, recorrência, devolução e MED"
summary: "As funções que fazem o Pix valer produto — agendar, repetir e desfazer — são onde o estado, o calendário e a fraude se encontram."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Pix"
    url: https://www.bcb.gov.br/estabilidadefinanceira/pix
---

## Pix agendado

Um **Pix agendado** registra a intenção de pagar numa data futura, não a execução imediata — o que
introduz um problema novo que o Pix instantâneo não tem: o que fazer quando a data chega e não há
saldo suficiente. A resposta correta é um **estado terminal explícito** para essa falha (algo como
"agendamento não executado por saldo insuficiente", com notificação ao pagador), nunca silêncio ou
uma nova tentativa automática indefinida sem limite.

## Recorrência e Pix Automático

Uma cobrança recorrente exige uma **autorização prévia do pagador**, específica para aquele
cobrador e, em geral, com um teto de valor — bem diferente de uma autorização genérica de conta.
O ciclo de cobrança (quando tentar, com que **antecedência de aviso** ao pagador, quantas
**novas tentativas** em caso de falha) é regido por regras que mudam com frequência — **conferir**
a versão vigente antes de implementar qualquer intervalo de tempo fixo no código.

## Saque, troco e iniciação por aproximação

**Saque** e **troco** via Pix (conceitos que permitem retirar dinheiro físico associado a uma
transação Pix) e **iniciação por aproximação** (pagar aproximando o celular, sem QR) são
extensões do mecanismo central que mudam a interface de iniciação, não a mecânica de liquidação —
**conferir** a disponibilidade e as regras vigentes de cada uma antes de assumir que estão
habilitadas em todo contexto.

## Devolução: total, parcial, e a conservação do valor

Uma **devolução** desfaz, total ou parcialmente, uma transação Pix já liquidada — e tem um
**identificador próprio**, distinto do identificador fim a fim da transação original, porque é,
estruturalmente, uma nova transação que referencia a original. A regra que nunca pode ser violada,
mesmo sob qualquer sequência concorrente de pedidos de devolução: a **soma de todas as devoluções
de uma transação nunca excede o valor original** — sem essa checagem atômica, pedidos concorrentes
de devolução parcial podem, juntos, devolver mais do que foi recebido.

## MED: o mecanismo especial de devolução

O **MED** existe para o caso em que uma transação foi genuinamente fraudulenta — a vítima notifica
a fraude, o valor é colocado em **bloqueio cautelar** na conta de destino (impedindo que o suposto
fraudador o retire enquanto a análise corre), uma análise formal ocorre, e o resultado é devolução
(total ou parcial, conforme o que ainda está disponível) ou liberação do bloqueio. O MED também
pode envolver **rastreio de fundos** entre contas, quando o valor já foi movido para além da conta
de destino original — um processo mais lento e mais caro do que qualquer devolução comum, e
justamente por isso reservado a casos de fraude investigada, não a arrependimento de compra
(**conferir** o fluxo e os prazos vigentes do MED). A detecção de padrões de fraude e abuso que
alimenta a decisão de notificar um MED é o mesmo domínio de `seguranca-aplicacao/14`, aplicado
aqui à resposta pós-fato em vez de à prevenção em tempo real.

```diagrama
pg-med
```

## Limites noturnos

Transações Pix acima de um certo valor, em horários noturnos, frequentemente enfrentam limites
reduzidos — uma medida antifraude que reconhece que boa parte das fraudes de conta comprometida
acontece fora do horário comercial. Pedidos de **aumento de limite** normalmente exigem um
**prazo de segurança** antes de entrarem em vigor (horas a dias, **conferir** o valor vigente) —
tempo suficiente para que o titular legítimo da conta perceba e cancele um pedido feito por quem
não deveria tê-lo feito.

## Responsabilidades do participante

Cada instituição participante do Pix carrega responsabilidades formais sobre a qualidade dos dados
que fornece ao DICT, sobre a velocidade de resposta a um MED, e sobre a implementação correta dos
limites e janelas de segurança — responsabilidades que existem precisamente porque o Pix distribui
a confiança entre muitos participantes, e a falha de um afeta a confiança no sistema inteiro.

## Por que irrevogabilidade torna prevenção mais importante que estorno

O Pix é desenhado para ser, via de regra, **irrevogável**: uma vez liquidado, não existe um botão
de "desfazer" simples — só os mecanismos formais de devolução e MED, ambos mais lentos e mais
limitados do que um estorno bancário tradicional. Essa escolha de design torna a **prevenção**
(autenticação forte, detecção de padrão suspeito antes da liquidação) estruturalmente mais
importante do que em sistemas onde um estorno fácil funciona como rede de segurança — depois que o
dinheiro saiu, recuperá-lo de volta nunca é garantido.

## Exemplo numa fintech

Um golpe de engenharia social convence a vítima a transferir R$ 5.000 via Pix. A vítima aciona o
MED imediatamente; o valor ainda não sacado é colocado em bloqueio cautelar na conta de destino; a
análise confirma a fraude; e o valor disponível é devolvido — mas a parte que o fraudador já havia
sacado ou transferido para outra conta permanece, na prática, irrecuperável por esse mecanismo.

## Hands-on

**Tutorial.** Implemente o agendador (com calendário configurável) e a recorrência, e modele o
fluxo de MED como uma máquina de estados explícita.

**Desafio.** Implemente devoluções parciais concorrentes e um rastreio simples de fundos entre
contas simuladas.

**Invariantes testáveis**

1. **Σ das devoluções de uma transação ≤ valor original**, em qualquer sequência concorrente de
   pedidos de devolução testada (asserção rígida; a versão sem verificação atômica **demonstra**
   o excesso sob concorrência).
2. O agendador gera as execuções **deterministicamente** a partir do calendário configurado, sem
   duplicar nem pular nenhuma data, para qualquer calendário testado por propriedade.
3. Um agendamento sem saldo suficiente termina em um **estado terminal explícito** e gera uma
   notificação — nunca falha silenciosamente nem tenta de novo sem limite.
4. O fluxo de MED termina em **um** estado terminal e **conserva** os fundos: valor bloqueado +
   valor devolvido + valor classificado como irrecuperável soma exatamente o valor original.
5. O limite noturno aplicado é uma **função pura** do horário configurado, testada contra uma
   tabela de casos nas bordas do intervalo.
6. Uma cobrança recorrente **sem autorização válida registrada** é rejeitada — nunca processada
   "porque já cobrou antes".

**Complemento.** Descreva, por escrito, como um sistema de antifraude distinguiria uma devolução
pedida pela própria vítima de uma tentativa do fraudador de reverter uma transação legítima.

**Checagem**

1. Por que um agendamento sem saldo suficiente precisa de um estado terminal explícito, em vez de
   simplesmente tentar de novo indefinidamente?
2. Por que a soma de devoluções de uma transação precisa de uma verificação atômica, e não apenas
   de uma checagem feita antes de cada pedido individual?
3. Por que o MED envolve bloqueio cautelar antes da análise, em vez de aguardar a conclusão da
   análise para agir?
4. Por que a irrevogabilidade do Pix torna a prevenção estruturalmente mais importante do que num
   sistema onde o estorno é fácil?

> **Reencontro — `system-design/12`.** O caso de antifraude em tempo real daquele marco é a peça
> que decide, antes da liquidação, se uma transação deveria ser bloqueada — o MED deste marco é o
> que resta fazer quando essa prevenção falhou e o dinheiro já saiu.

A distinção entre resultado desconhecido e estado terminal, já estabelecida em `system-design/09`,
se aplica diretamente ao agendamento sem saldo; e o fluxo de MED como processo de longa duração com
etapas compensáveis é o mesmo padrão de saga de `arquitetura-eventos/09`, aqui aplicado a um caso
de fraude em vez de a uma falha técnica.

## Principais aprendizados

- Um agendamento sem saldo precisa de um estado terminal explícito com notificação, nunca de
  tentativas silenciosas sem limite.
- A soma de devoluções de uma transação nunca pode exceder o valor original, mesmo sob pedidos
  concorrentes — isso exige verificação atômica, não checagem isolada por pedido.
- O MED bloqueia cautelarmente antes de concluir a análise, porque esperar permitiria ao
  fraudador sacar o valor antes de qualquer decisão.
- Uma cobrança recorrente sem autorização prévia registrada não deveria ser processada, mesmo que
  cobranças anteriores tenham sido aceitas.
- A irrevogabilidade do Pix torna prevenção estruturalmente mais importante do que em sistemas
  onde existe um estorno fácil como rede de segurança.
