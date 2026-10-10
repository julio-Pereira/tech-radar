---
id: caso-pix-ponta-a-ponta
title: "Caso: Pix ponta a ponta"
summary: "O desenho de um pagamento é o desenho de estados terminais únicos e de resultado desconhecido. Aplica os blocos A-C num caso completo, com tabela de falhas provada contra um fake do SPI. Marco crítico — quiz estendido."
estimatedMinutes: 70
references:
  - title: "Banco Central do Brasil — Pix"
    url: https://www.bcb.gov.br/estabilidadefinanceira/pix
  - title: "Shopify Toxiproxy"
    url: https://github.com/Shopify/toxiproxy
completion: quiz
---

## O molde dos quatro casos

Cada caso desta seção — e este é o primeiro — segue a mesma estrutura, que é também o molde do
marco 15: requisitos e perguntas de esclarecimento → números (`capacity.yaml`) → modelo C4 → fluxo
feliz → **tabela de falhas** → dados e consistência → **o que não vamos fazer** → evolução → ADRs
com gatilho de reversão. Premissas continuam declaradas como premissas; números do regulador
continuam linkados, não copiados.

## O fluxo feliz

Iniciação (o cliente pede o pagamento) → validação de limite e antifraude (síncrono, rápido) →
reserva no ledger (debita e marca como "em trânsito", dentro de uma transação local —
`dados-distribuidos/04`) → envio ao SPI (chamada externa, fora do controle do sistema) →
confirmação (o SPI responde: liquidado, rejeitado, ou nada) → liquidação (o débito deixa de estar
"em trânsito" e vira definitivo) → notificação (assíncrona, o cliente é avisado).

## Estados terminais únicos: a invariante central do caso

Um pagamento tem exatamente dois destinos possíveis: **liquidado** ou **rejeitado/revertido**.
Nunca os dois. Nunca nenhum, para sempre. O desenho inteiro deste caso gira em torno de garantir
isso sob toda falha imaginável — e a falha mais traiçoeira não é "o SPI rejeitou" (fácil: reverte a
reserva), é o **resultado desconhecido**: o SPI não respondeu dentro do prazo, e você não sabe se o
pagamento foi liquidado do lado dele ou não.

## Resultado desconhecido: consulta de status e conciliação

A resposta correta a um timeout do SPI nunca é "assumir que falhou e tentar de novo" — isso arrisca
duplicar um pagamento que na verdade já foi liquidado do outro lado. A resposta é: **consultar o
status** ativamente (se o SPI oferece esse mecanismo) até obter uma resposta definitiva, e, se a
consulta também não resolver dentro de um prazo, o pagamento entra num estado "em verificação" que
a **conciliação D+1** (o mesmo mecanismo de `dados-distribuidos/08`) resolve no pior caso — contra
o arquivo de liquidação que o SPI publica depois. Todo pagamento "em verificação" tem um prazo
declarado até o qual ele precisa ter saído desse estado, com alerta se isso não acontecer.

## Idempotência de ponta a ponta

Não basta idempotência na API de entrada (marco 05) — a mesma tentativa de pagamento, reenviada por
qualquer motivo em qualquer ponto do fluxo (o cliente, um retry automático, uma reconciliação que
encontra uma divergência), nunca pode gerar uma segunda liquidação. A chave de idempotência
atravessa o fluxo inteiro, do `POST` inicial até a chamada ao SPI, e o ledger é a última linha de
defesa: um índice único em `idempotencyKey` que torna uma segunda tentativa, mesmo que escape de
toda verificação anterior, incapaz de debitar duas vezes.

## A janela de liquidação como requisito

O Pix tem uma janela de tempo em que a liquidação precisa acontecer — **linkar a especificação do
Banco Central e conferir o valor vigente no dia da leitura**, nunca copiar o número deste texto.
Essa janela não é um detalhe de implementação: ela é um requisito de negócio com consequência
regulatória direta se violada, e o orçamento de latência do fluxo síncrono inteiro (marco 02)
precisa caber dentro dela com margem.

## O que é síncrono, e onde entra a saga

Iniciação, validação e reserva são síncronos e locais (uma transação, um agregado —
`arquitetura-eventos/04`). A partir do envio ao SPI, o fluxo é inerentemente uma **saga**: múltiplos
passos, cada um podendo falhar independentemente, sem uma transação global que os amarre
(`dados-distribuidos/08`). A reversão da reserva, se o SPI rejeitar, é a compensação dessa saga.

> **Reencontro — `arquitetura-eventos/08`, `/09` e `spring-boot/06`.** Outbox, inbox e idempotência
> daquele bloco são o mecanismo que implementa a saga deste caso; `spring-boot/06` já ensinou
> idempotência e outbox do lado Java — aqui eles são costurados num fluxo de ponta a ponta
> completo, não um padrão isolado.

## Exemplo numa fintech

Débito feito, SPI sem resposta por 8 segundos (acima do timeout configurado): o cliente vê "pagamento
em processamento", nunca "falhou" nem "concluído" — porque nenhum dos dois é verdade ainda. O
ledger registra o lançamento como "em trânsito", não some, não duplica. A conciliação D+1 confere no
pior caso: se o arquivo do SPI mostra que liquidou, o estado "em trânsito" vira "liquidado" e o
cliente é notificado tardiamente; se mostra que não liquidou, vira "revertido" e o valor volta.

## Hands-on

**Tutorial.** Escreva o documento de design completo do Pix ponta a ponta, no molde desta seção.

**Desafio.** Tabela de 8 pontos de falha (queda do SPI depois do débito, timeout sem resposta,
resposta duplicada, resposta fora de ordem, queda do próprio serviço entre passos, falha de rede na
notificação, divergência encontrada só na conciliação, e um de sua escolha), cada um provado contra
um **fake do SPI** controlado por **Toxiproxy** (latência injetada, conexão derrubada, resposta
corrompida).

**Invariantes testáveis**

1. Nenhum pagamento, em nenhum dos 8 cenários de falha testados, chega a dois estados terminais
   diferentes.
2. **Conservação**: a soma de débitos registrados é igual à soma de créditos mais o valor em
   trânsito, em todo instante observado durante o teste.
3. Reexecutar o mesmo evento de confirmação do SPI duas vezes não altera o resultado (idempotência
   de ponta a ponta comprovada).
4. Todo pagamento que entra em "resultado desconhecido" termina em um estado terminal depois da
   conciliação — nenhum fica "em verificação" para sempre no teste.

**Complemento.** Modele o fluxo em **TLA+** (uma especificação mínima dos estados e transições) e
deixe o verificador de modelo procurar uma intercalação que viole a invariante de estado terminal
único — documente o que ele encontra, mesmo que seja "nenhuma violação nas condições modeladas".

**Checagem**

1. Por que "assumir falha e tentar de novo" é a resposta errada a um timeout do SPI?
2. Quais são os dois únicos estados terminais de um pagamento, e o que a conciliação D+1 resolve
   que a consulta de status em tempo real não resolve?
3. Por que a idempotência de ponta a ponta precisa de um índice único no ledger, não só de uma
   chave na API de entrada?
4. O que a janela de liquidação do regulador exige do orçamento de latência do fluxo síncrono?

## Principais aprendizados

- Um pagamento tem exatamente dois estados terminais possíveis, nunca mais, nunca nenhum — o
  desenho inteiro existe para garantir isso sob qualquer falha.
- Resultado desconhecido (timeout sem resposta) nunca deve ser tratado como falha presumida — a
  resposta é consultar status e, no limite, deixar a conciliação D+1 resolver.
- Idempotência de ponta a ponta exige um índice único no ledger como última linha de defesa, não
  só uma chave verificada na borda da API.
- Janela de liquidação do regulador é requisito de negócio com consequência real, não detalhe de
  implementação — o orçamento de latência do fluxo precisa caber nela com margem.
- A partir do envio ao SPI, o fluxo é saga por natureza — múltiplos passos sem transação global,
  com compensação explícita quando um passo falha.
