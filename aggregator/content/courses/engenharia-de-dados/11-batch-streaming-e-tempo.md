---
id: batch-streaming-e-tempo
title: "Batch, streaming e tempo"
summary: "Streaming só vale quando a latência da decisão vale; e tempo de evento ≠ tempo de processamento. Janelas, watermark, e dado atrasado virando correção auditável."
estimatedMinutes: 60
references:
  - title: "The Dataflow Model (Akidau et al.)"
    url: https://research.google/pubs/the-dataflow-model-a-practical-approach-to-balancing-correctness-latency-and-cost-in-massive-scale-unbounded-out-of-order-data-processing/
---

## A pergunta que decide: a latência da decisão vale o investimento?

Streaming custa mais para construir e operar que batch diário — estado persistente, *checkpoint*,
a complexidade inteira de tempo de evento *versus* tempo de processamento (abaixo). Vale a pena
quando a **decisão** que consome o dado precisa dele em segundos, não em horas: uma oferta
contextual que reage ao comportamento recente do cliente. Não vale quando um relatório de
fechamento, consultado uma vez por dia, recebe a mesma resposta de negócio processando a cada hora
ou a cada minuto — a mesma pergunta de "a latência importa de verdade aqui?" de `system-design/08`,
agora aplicada a pipeline de dado em vez de chamada síncrona.

## Janelas: fixas, deslizantes, por sessão

**Tumbling** (fixa): intervalos não sobrepostos — "todo minuto é uma janela própria". **Sliding**
(deslizante): intervalos sobrepostos, recalculados a cada novo evento — "a soma dos últimos 5
minutos, atualizada a cada segundo". **Sessão**: a janela é delimitada por um período de
inatividade — "agrupe eventos enquanto eles continuarem chegando com menos de 30 minutos de
intervalo entre si". A escolha da janela é uma decisão de negócio tanto quanto técnica: o que
"recente" significa para a decisão que consome esse agregado.

## Tempo de evento ≠ tempo de processamento, e por que a distinção importa

**Tempo de evento**: quando o fato aconteceu de verdade (a transação foi efetivada na transmissora
às 14h32). **Tempo de processamento**: quando o seu pipeline de fato processou esse evento (pode
ser 14h32, pode ser 14h40 se houve atraso de rede, pode ser três dias depois se a transmissora
reemitiu). Agregar por tempo de **processamento** é mais simples de implementar e produz resultados
**errados** sempre que há qualquer atraso — o agregado "transações das 14h" passaria a incluir
coisas que chegaram atrasadas e excluir o que ainda não tinha chegado no momento do cálculo.
Agregar por tempo de **evento** é correto, e exige decidir até quando esperar antes de "fechar" uma
janela.

## *Watermark*: a declaração explícita de até quando esperar

Um ***watermark*** é a declaração "não espero mais nenhum evento com tempo de evento anterior a
X" — uma aposta explícita sobre atraso máximo tolerado. Eventos que chegam **dentro** do watermark
entram na agregação normalmente; eventos que chegam **depois** do watermark já ter passado (mais
atrasados do que a aposta previa) não podem simplesmente ser descartados em silêncio — viram uma
**correção auditável**: um ajuste explícito e registrado ao agregado que já tinha sido fechado e
publicado, nunca uma perda silenciosa de dado.

## Efeito exatamente-uma-vez com *sink* idempotente

A mesma lição do marco 01, aplicada a streaming: o transporte garante no máximo pelo-menos-uma-vez;
o efeito exatamente-uma-vez vem de o destino (*sink*) da agregação ser idempotente — escrever o
resultado de uma janela de um jeito que reprocessar a mesma janela (por reinício do checkpoint, por
exemplo) produz o mesmo resultado, não um resultado somado em dobro.

## Lambda, Kappa, e a crítica a ambos

**Arquitetura Lambda**: mantém dois caminhos paralelos, um batch (correto, lento) e um de
velocidade (rápido, aproximado), reconciliados depois. **Kappa**: um único caminho de streaming,
tratando batch como um caso especial de streaming sobre um intervalo fechado. A crítica prática a
Lambda é a duplicação de lógica (a mesma regra de negócio implementada duas vezes, em dois
sistemas, com risco real de divergir); a crítica a Kappa é que nem toda carga de trabalho se
encaixa bem num modelo de streaming puro, e forçar tudo nesse molde pode ser mais caro que manter
um batch simples para o que não precisa de latência baixa.

> **Reencontro — `kafka/05` e `/09`; `arquitetura-eventos/04`.** Semântica de entrega (pelo menos
> uma vez, efeito exatamente uma vez via idempotência) já foi ensinada naquele marco — aqui é a
> mesma disciplina aplicada à agregação de dado, não só à entrega de mensagem. `arquitetura-eventos/04`
> trata consistência eventual com janela declarada — o *watermark* é exatamente esse conceito,
> com um nome específico de processamento de stream.

## Exemplo numa fintech

Um agregado "gasto por categoria, últimos 30 minutos" alimenta uma oferta contextual em tempo
quase real. Uma transação chega 40 minutos atrasada (acima do watermark configurado de 15 minutos).
Em vez de descartá-la silenciosamente, o pipeline emite uma **correção**: o agregado da janela já
fechada é ajustado, registrado como correção (não como se tivesse sido assim desde o início), e
qualquer consumidor que já tinha lido o valor original sabe, pelo evento de correção, que precisa
atualizar sua própria visão.

## Hands-on

**Tutorial.** Implemente uma agregação em janela (tumbling) sobre um fluxo de eventos simulado
(Kafka local ou arquivo lido incrementalmente), com watermark configurável.

**Desafio.** Trate dado atrasado (além do watermark) como correção auditável, e reconcilie o
resultado do streaming com o resultado de um cálculo batch sobre o mesmo dia.

**Invariantes testáveis**

1. Para o mesmo dia completo, o resultado do **streaming** (watermark suficientemente largo para
   capturar os atrasos simulados) é **igual** ao resultado do **batch** sobre o mesmo dado-fonte —
   reconciliação exata.
2. Um evento que chega além do watermark vira uma **correção registrada e auditável**, nunca um
   descarte silencioso — verificado pela presença do evento de correção no log/registro.
3. Reexecutar a partir de um *checkpoint* salvo **não duplica** nenhum valor no agregado de
   destino (efeito exatamente-uma-vez via *sink* idempotente).
4. A latência fim a fim (do tempo de evento até o agregado estar disponível) fica dentro do
   orçamento declarado, medida sob carga simulada.

**Complemento.** Compare o custo de manter o estado de uma janela deslizante de 30 minutos
atualizada a cada segundo, contra o custo de uma janela tumbling de 1 minuto.

**Checagem**

1. Por que agregar por tempo de processamento produz resultado errado sob qualquer atraso de
   chegada?
2. O que um *watermark* declara, e o que acontece com um evento que chega depois dele ter passado?
3. Qual é a crítica prática à arquitetura Lambda, e qual é a crítica à Kappa?
4. Quando a latência de uma decisão justifica o investimento em streaming, e quando batch diário já
   basta?

## Principais aprendizados

- Streaming só vale quando a latência da decisão que consome o agregado justifica o custo extra de
  construir e operar — não é um upgrade automático sobre batch.
- Tempo de evento é o que importa para correção; tempo de processamento é mais simples, mas produz
  resultado errado sob qualquer atraso de chegada.
- *Watermark* é uma aposta explícita sobre atraso máximo; evento além dela vira correção auditável,
  nunca descarte silencioso.
- Efeito exatamente-uma-vez em streaming vem do *sink* idempotente, a mesma lição de pipeline
  batch do marco 01 — o transporte garante só pelo-menos-uma-vez.
- Lambda duplica lógica de negócio em dois caminhos paralelos com risco de divergência; Kappa
  força tudo num molde de streaming que nem toda carga de trabalho precisa.
