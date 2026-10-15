---
id: ecossistema-e-fluxo-de-fundos
title: "Ecossistema e fluxo de fundos"
summary: "Quem são os participantes de um pagamento, o que cada um garante, e em que dia o dinheiro de fato muda de mãos — a base de qualquer trilho que vem depois."
estimatedMinutes: 55
references:
  - title: "Banco Central do Brasil — Arranjos de pagamento"
    url: https://www.bcb.gov.br/estabilidadefinanceira/arranjospagamento
---

## Participantes e papéis

Um pagamento raramente envolve só duas partes. O **instituidor do arranjo** define as regras do
jogo (um arranjo de cartão, o próprio Pix); a **bandeira** (quando existe) é a marca e a rede que
liga emissores e adquirentes; o **emissor** é quem mantém a conta ou a linha de crédito do
pagador; o **adquirente** é quem habilita o lojista a receber; **subadquirente** e **facilitador**
revendem acesso ao adquirente para lojistas menores; **instituição de pagamento** e **instituição
financeira** são categorias regulatórias distintas com permissões diferentes (**conferir** a
definição vigente de cada uma); o banco central e a infraestrutura de liquidação fecham o circuito,
garantindo que o dinheiro realmente mude de dono entre instituições. Os nomes oficiais e as
fronteiras exatas entre essas categorias vêm da regulação vigente — **conferir** antes de tratá-los
como definitivos.

## Arranjo aberto × arranjo fechado

Num **arranjo aberto**, vários emissores e adquirentes participam sob a mesma marca (o modelo
típico de cartão de bandeira); num **arranjo fechado**, uma única instituição concentra os papéis
de emissor e adquirente (um cartão de loja que só funciona numa rede própria). A diferença importa
porque um arranjo aberto precisa de regras explícitas de interoperabilidade — compensação,
disputa, tarifa — que um arranjo fechado resolve internamente, sem precisar de um "contrato" entre
partes.

## Fluxo de informação × fluxo de fundos

A distinção mais importante deste marco: o **fluxo de informação** é a mensagem que diz "esse
pagamento foi autorizado" — rápida, em milissegundos a segundos; o **fluxo de fundos** é o momento
em que o dinheiro de fato troca de conta entre instituições — pode levar segundos (Pix) ou semanas
(cartão de crédito parcelado). Tratar os dois como a mesma coisa é o erro mais comum de quem só
conhece pagamentos pela API de um PSP: a API responde rápido porque responde sobre a
**informação**, não sobre o fundo.

## Liquidação bruta em tempo real × liquidação líquida diferida

**Liquidação bruta em tempo real** movimenta o valor cheio de cada transação individualmente, no
momento em que ocorre (o modelo do Pix via SPI); **liquidação líquida diferida** acumula um
período de transações e movimenta só o saldo líquido entre as partes ao final do ciclo (comum em
arranjos de cartão, compensados em lote). A líquida diferida usa menos caixa por transação, mas
expõe as partes a mais tempo de risco de contraparte entre o momento do fluxo de informação e o do
fluxo de fundos.

## Conta de reserva e *prefunding*

Para participar de um sistema de liquidação, uma instituição mantém uma **conta de reserva** (ou
de liquidação) nessa infraestrutura — e em muitos arranjos precisa **pré-financiar** essa conta
(depositar fundos antes de poder liquidar) para que o sistema não dependa de crédito implícito
entre participantes. Ficar sem saldo nessa conta num momento de liquidação obrigatória não é um
detalhe de tesouraria: é um evento que pode impedir a instituição de cumprir compromissos — o tema
central do marco 07.

## O modelo econômico, em alto nível

Numa venda com cartão, o lojista recebe o valor menos uma **taxa de desconto** (quanto o
adquirente cobra), parte da qual vira **tarifa de intercâmbio** (paga ao emissor) e parte fica com
o arranjo — a regulação de alguns mercados impõe **tetos** a essas tarifas (**conferir** a
regulação vigente e se ela se aplica ao seu mercado). O ponto estrutural, independente dos números
exatos: um *split* de taxa entre participantes precisa **conservar o total** — a soma das partes
tem que bater exatamente com o valor bruto da transação, até o centavo, o que normalmente exige uma
regra de rateio explícita para o resto da divisão (o mesmo problema que reaparece com parcelas no
marco 05).

## Finalidade e reversibilidade por trilho

**Finalidade** é o momento em que um pagamento se torna definitivo — depois dele, desfazer exige um
processo novo (devolução, estorno, disputa), não um simples "cancelar". Cada trilho declara sua
própria postura: o Pix é desenhado para ser **irrevogável** salvo os mecanismos específicos de
devolução e MED (marco 03); o cartão tem uma janela de contestação formal via *chargeback* (marco
08); o boleto, uma vez pago, tem baixa quase sempre definitiva. Assumir que todo pagamento pode ser
"simplesmente revertido" como uma transação de banco de dados é o erro que este marco existe para
prevenir.

## Por que um erro de "dia" é mais grave do que parece

Um sistema que marca um pagamento como "concluído" no fluxo de informação, mas calcula posição de
caixa como se o fluxo de fundos já tivesse ocorrido no mesmo instante, projeta uma liquidez que não
existe ainda. Em escala, esse erro de um dia — tratar o dia da informação como o dia da liquidação —
é o tipo de bug que só aparece como inadimplência real quando a posição de caixa projetada e a
posição de caixa real finalmente divergem o suficiente para faltar dinheiro numa liquidação
obrigatória.

## Mapeando participantes para contas do razão

Cada participante de um fluxo — o pagador, o lojista, o adquirente, o emissor, a conta de reserva
da própria instituição — corresponde a uma conta (ou conjunto de contas) num plano de contas do
razão (`ledger-e-contabilidade`, planejada). Esse mapeamento é o que permite, mais adiante, provar
que um fluxo **conserva o dinheiro**: cada lançamento de débito num participante tem um lançamento
de crédito correspondente em outro, nunca criando ou destruindo valor no caminho.

## Exemplo numa fintech

Uma venda de R$ 100 no cartão de crédito: a informação de que a compra foi aprovada chega ao
lojista em cerca de 800 ms. O dinheiro, porém, só chega à conta do lojista semanas depois, líquido
da taxa de desconto — e nesse meio-tempo o emissor, a bandeira e o adquirente já dividiram entre si
as partes da taxa, mesmo sem o lojista ter visto um centavo ainda.

## Hands-on

**Tutorial.** Construa `fluxo/` com os participantes, as contas correspondentes e quatro cenários
sintéticos: Pix, crédito à vista, crédito parcelado e boleto.

**Desafio.** Implemente o *split* de taxa de um dos cenários e o mapeamento de cada participante
para uma conta do plano de contas.

**Invariantes testáveis**

1. Em cada um dos quatro cenários, **Σ entradas = Σ saídas** por participante, incluindo todas as
   taxas envolvidas (conservação; asserção rígida sobre os dados sintéticos).
2. O *split* de taxa **conserva o total** da transação, com rateio do resto por **maior resto**
   (nenhum centavo perdido nem criado, para qualquer valor de entrada testado por propriedade).
3. Nenhum evento classificado como "fluxo de informação" aparece, na simulação, como movimento de
   fundos — um `lint` sobre os eventos gerados reprova qualquer violação.
4. Todo fluxo de fundos declara explicitamente a **regra do dia de liquidação** usada, como
   parâmetro configurável — nunca um valor fixo embutido no código.
5. Cada participante de cada cenário mapeia para exatamente uma conta de um plano de contas de
   referência (verificação de integridade: nenhum participante sem conta, nenhuma conta órfã).

**Complemento.** Desenhe, por escrito, o mapa de participantes de uma compra internacional com
cartão (emissor e adquirente em países diferentes) e identifique o participante adicional que esse
cenário introduz.

**Checagem**

1. Por que a resposta rápida de uma API de pagamento normalmente diz respeito ao fluxo de
   informação, não ao fluxo de fundos?
2. Qual é a diferença prática entre liquidação bruta em tempo real e liquidação líquida diferida, em
   termos de uso de caixa e de janela de risco de contraparte?
3. Por que um *split* de taxa que não fecha exatamente no valor bruto da transação é um defeito, não
   um arredondamento aceitável?
4. Dê um exemplo de como tratar o dia do fluxo de informação como o dia do fluxo de fundos pode gerar
   uma falsa sensação de liquidez disponível.

> **Reencontro — `dados-distribuidos/10`.** A identidade e a unicidade daquele marco são exatamente
> o que impede que o mesmo participante, ou o mesmo lançamento, seja contado duas vezes quando um
> fluxo de fundos é mapeado para múltiplas contas do razão — a base de qualquer verificação de
> conservação que esta trilha vai repetir em todo marco seguinte.

Esta trilha aprofunda a **mecânica** dos trilhos de pagamento; o caso de ponta a ponta do Pix já
resolvido em `system-design/09` — estados terminais, resultado desconhecido, idempotência, janela
de liquidação — não é reensinado aqui, e `system-design/02` já cobre como transformar um requisito
de negócio em números de capacidade, uma habilidade que esta trilha assume pronta. O domínio e o
desenho de eventos de `arquitetura-eventos/02` é o vocabulário que o restante da trilha usa sempre
que um fluxo de pagamento vira um evento de domínio.

## Principais aprendizados

- Fluxo de informação e fluxo de fundos andam em velocidades diferentes — confundir os dois é o
  erro mais comum em quem só conhece pagamentos pela API de um PSP.
- Liquidação bruta em tempo real e liquidação líquida diferida trocam uso de caixa por janela de
  risco de contraparte.
- Um *split* de taxa precisa conservar o valor total da transação exatamente, com uma regra de
  rateio explícita para o resto.
- Cada trilho declara sua própria postura de finalidade e reversibilidade — nenhum pagamento é
  "simplesmente revertido" como uma linha de banco de dados.
- Tratar o dia do fluxo de informação como o dia do fluxo de fundos é o tipo de erro que só aparece
  como inadimplência real quando já é tarde para corrigir.
