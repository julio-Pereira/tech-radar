---
id: caso-extrato-e-notificacoes
title: "Caso: extrato, saldo e notificações"
summary: "Em sistemas de leitura intensa a decisão é onde pagar o custo: na escrita ou na leitura. Fan-out, o problema do cliente famoso, e entrega de webhook pelo menos uma vez."
estimatedMinutes: 60
references:
  - title: "Designing Data-Intensive Applications"
    url: https://dataintensive.net/
---

## Projeção materializada: pagar na escrita para economizar na leitura

Um extrato é, por natureza, uma leitura que agrega e ordena lançamentos — calcular isso a cada
consulta, a partir do ledger bruto, funciona até o volume crescer. **Projeção materializada**:
manter uma estrutura já no formato de leitura, atualizada a cada lançamento novo (via outbox/CDC,
`arquitetura-eventos/06`), paga o custo de manutenção na escrita para que a leitura seja barata e
previsível — a mesma troca de CQRS do marco 07, aqui aplicada a um caso concreto de alto volume de
leitura.

## Fan-out na escrita × na leitura × híbrido

**Fan-out na escrita**: cada lançamento, ao acontecer, já atualiza a projeção de todo mundo que
precisa vê-lo — leitura instantânea, escrita cara quando há muitos "seguidores" de um mesmo evento
(o problema do cliente famoso abaixo). **Fan-out na leitura**: a projeção é montada só quando
alguém pede — escrita barata, leitura mais cara e mais lenta. **Híbrido**: a maioria dos casos usa
fan-out na escrita (poucos "seguidores" por evento), e casos excepcionais (muitos) caem para
fan-out na leitura sob demanda — a decisão não é global, é **por caso**, com o ponto de cruzamento
de custo entre as duas estratégias medido, não estimado.

## O problema do cliente famoso

Um lojista com 2 milhões de transações por dia tem uma projeção de extrato que **não pode** ser a
mesma estrutura de dados que serve o cliente comum de 5 transações por mês — é o mesmo *celebrity
problem*/chave quente do marco 07 e do particionamento (`dados-distribuidos/03`), aqui manifestado
como volume de fan-out: atualizar a projeção dele a cada lançamento, na mesma estrutura compartilhada
que serve todo mundo, cria um ponto quente que degrada a experiência de todos os outros clientes
que dividem a mesma infraestrutura.

## Paginação e *read-your-writes*

Paginação por cursor (marco 05) evita o problema de `OFFSET` sob inserção concorrente — crucial
num extrato, que recebe lançamentos novos constantemente. **Read-your-writes**: o cliente que
acabou de fazer um Pix espera ver esse lançamento no extrato imediatamente — se a projeção está
alguns segundos atrás (fan-out assíncrono), essa expectativa quebra. A mitigação é a mesma do
`dados-distribuidos/02`: ler o próprio lançamento recente do modelo de escrita por uma janela curta,
ou propagar um token de versão que a leitura espera alcançar.

## Entrega de webhook: pelo menos uma vez, nunca exatamente uma

Notificar um sistema externo (um ERP do cliente, por exemplo) via webhook nunca garante entrega
**exatamente uma vez** de ponta a ponta — a rede pode perder a confirmação mesmo que o destino
tenha recebido. O desenho correto assume **pelo menos uma vez** do lado de quem envia, com:
**assinatura** (o destino verifica que o webhook veio de fato da fintech, não de um impostor),
**backoff** nas tentativas de reenvio, **ordem por conta** preservada (lançamentos da mesma conta
chegam na ordem em que aconteceram, mesmo que retries desordenem a entrega global), e
**deduplicação no receptor** via um `event_id` que o destino usa para ignorar reentregas — a
mesma disciplina de idempotência do marco 05, agora do lado de quem recebe, não de quem processa.

> **Reencontro — `arquitetura-eventos/06`; `dados-distribuidos/06` e `/09`; `kafka/06`.** CQRS e
> projeção são daquele marco; a escolha de store para a projeção (coluna larga? documento?
> relacional com índice coberto?) usa o critério de `dados-distribuidos/06`, e cache do saldo
> exibido usa o de `/09`. A ordem por conta preservada na entrega de webhook é o mesmo particionamento
> por chave que `kafka/06` ensina para ordem dentro de uma partição.

## Exemplo numa fintech

O lojista de 2 milhões de transações/dia tem sua própria projeção, numa partição dedicada,
atualizada com um orçamento de latência relaxado (segundos, não milissegundos, porque ninguém olha
o extrato dele em tempo real) — o híbrido na prática: a maioria dos clientes usa fan-out na escrita
compartilhado e rápido; o lojista excepcional usa um caminho separado, dimensionado para o volume
dele especificamente.

## Hands-on

**Tutorial.** Documento de design completo no molde do marco 09, para extrato e notificações.

**Desafio.** Simulador de custo de fan-out (escrita × leitura × híbrido, com o número de
"seguidores" por evento como parâmetro) e um simulador de entrega de webhook com falhas de rede
injetadas.

**Invariantes testáveis**

1. O simulador encontra o ponto de cruzamento de custo entre fan-out na escrita e na leitura, e a
   estratégia híbrida testada respeita esse ponto (usa escrita abaixo dele, leitura acima).
2. Com 20% de falha simulada em 1.000 eventos de webhook, todos os 1.000 são entregues pelo menos
   uma vez, e o receptor (simulado) processa cada `event_id` **exatamente** uma vez, graças à
   deduplicação.
3. A ordem de entrega dos lançamentos de uma mesma conta é preservada no receptor, mesmo com
   retries desordenando a entrega entre contas diferentes.
4. Uma assinatura de webhook inválida (adulterada no teste) é rejeitada pelo receptor simulado.

**Complemento.** Calcule o custo de armazenamento da projeção de extrato por 5 anos (requisito de
retenção regulatória comum em fintech), para o cliente comum e para o cliente famoso, separadamente.

**Checagem**

1. Qual é a troca entre fan-out na escrita e fan-out na leitura, e o que decide qual usar para um
   caso específico?
2. Por que o problema do cliente famoso exige uma estrutura separada, não só mais capacidade na
   estrutura compartilhada?
3. O que "pelo menos uma vez" exige do receptor de um webhook, já que o remetente não garante
   exatamente uma vez?
4. Por que read-your-writes é uma expectativa particularmente sensível num extrato, mais que em
   outras leituras do sistema?

## Principais aprendizados

- Projeção materializada paga o custo de manutenção na escrita para tornar a leitura barata e
  previsível — a mesma troca de CQRS, aplicada a um caso concreto de alto volume.
- Fan-out na escrita, na leitura, ou híbrido é decisão por caso, no ponto de cruzamento de custo
  medido — não uma escolha global única para o sistema inteiro.
- O cliente famoso (celebrity problem) exige estrutura separada e orçamento de latência próprio,
  porque compartilhar a estrutura comum degrada todo mundo que a divide com ele.
- Webhook é sempre "pelo menos uma vez" do lado de quem envia; o receptor precisa de assinatura,
  deduplicação por `event_id` e tolerância a reentrega para ser seguro de verdade.
- Read-your-writes quebra a confiança do cliente de forma imediata e visível num extrato — é
  onde a janela de inconsistência, se mal desenhada, vira reclamação instantânea.
