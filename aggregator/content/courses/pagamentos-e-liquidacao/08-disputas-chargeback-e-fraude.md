---
id: disputas-e-chargeback
title: "Disputas, chargeback e fraude"
summary: "Uma disputa é um processo com prazo, evidência e dinheiro em jogo — e cada trilho tem o seu: o cartão tem chargeback, o Pix tem MED, o boleto tem pouco."
estimatedMinutes: 60
references:
  - title: "PCI Security Standards Council — Documents Library"
    url: https://www.pcisecuritystandards.org/document_library/
---

## O ciclo de *chargeback*

Um **chargeback** começa com a **contestação** do portador (direto ou pelo emissor); o lojista
pode responder com **representação** (evidência de que a transação é legítima); se ainda houver
desacordo, o processo pode escalar a **pré-arbitragem** e **arbitragem** entre adquirente e
emissor, com a bandeira decidindo (**conferir** o regulamento específico do arranjo — o processo
exato varia). Em cada etapa, o relógio corre: perder um prazo de resposta geralmente decide o
caso automaticamente contra quem perdeu o prazo, independente do mérito.

## Códigos de motivo

Todo chargeback é aberto com um **código de motivo**, agrupável em categorias amplas: **fraude**
(a transação não foi autorizada pelo portador legítimo), **serviço** (produto não entregue,
diferente do descrito) e **processamento** (erro técnico, cobrança duplicada). A categoria do
motivo determina, em boa parte, qual evidência é relevante — provar entrega física responde a um
chargeback de serviço, mas não ajuda em nada contra um de fraude genuína.

## Prazos e quem arca com o custo

Cada etapa do ciclo de chargeback tem um **prazo** formal (**conferir** os prazos vigentes do
arranjo), e o resultado final determina quem arca com o valor: o lojista (se perder a disputa), o
emissor, ou, em alguns casos, fica absorvido pelo adquirente. Um lojista que não responde dentro
do prazo perde por padrão, mesmo que tivesse evidência suficiente para vencer — a disciplina de
prazo, aqui, é tão decisiva quanto o mérito da disputa.

## Evidências que importam

Para um chargeback de **serviço**, evidência de entrega (rastreamento, assinatura de recebimento)
é central; para um de **processamento**, o registro técnico da transação (prova de que não houve
cobrança duplicada, por exemplo) resolve o caso; para um de **fraude**, evidência de que o próprio
portador autorizou a transação (padrão de uso consistente, 3DS bem-sucedido) é o que pesa. Reunir a
evidência certa para a categoria certa de motivo, de forma automatizada quando possível, é o que
separa uma resposta de disputa eficiente de uma reativa e improvisada.

## Fraude amigável × fraude real

**Fraude amigável** é quando o próprio portador contesta uma transação legítima (esqueceu que fez
a compra, está insatisfeito com o produto mas usa o caminho de fraude em vez do de devolução, ou
age de má-fé sabendo que a transação é válida); **fraude real** é quando a transação de fato não
foi autorizada pelo portador legítimo. Tratar os dois casos com a mesma resposta automática é
ineficiente — fraude amigável responde melhor a evidência de comportamento consistente do portador;
fraude real exige investigação e, frequentemente, ação preventiva sobre o método de pagamento
comprometido.

## *Dispute* no Pix e no boleto: um comparativo de garantias

O Pix não tem chargeback — tem o **MED** (já estudado no marco 03), um processo diferente,
reservado a fraude investigada, não a insatisfação com produto ou serviço. O boleto, uma vez pago
e com baixa processada, tem poucos mecanismos formais de disputa — a reversão de um boleto pago
depende quase inteiramente de acordo direto entre as partes, não de um processo padronizado como
o chargeback de cartão. Comparar as garantias dos três trilhos lado a lado é o que permite
recomendar o trilho certo (marco 06) também em função de qual proteção o pagador tem se algo der
errado.

## Taxa de chargeback como indicador de risco

A **taxa de chargeback** de um lojista (chargebacks por volume de transações) é um indicador de
risco observado pelos adquirentes e bandeiras — uma taxa consistentemente alta pode gerar
penalidades, exigência de reservas financeiras, ou até desligamento do lojista do arranjo. Medir
essa taxa continuamente, por lojista, permite agir antes que ela ultrapasse limites que disparam
consequências automáticas.

## O impacto no razão e a ligação com antifraude

Cada etapa de um chargeback — retenção do valor em disputa, estorno se o lojista perder,
reapresentação se o lojista ganhar — precisa de um lançamento correspondente no razão
(`ledger-e-contabilidade`, planejada), com os mesmos fundos conservados do início ao fim do
processo. E a decisão de contestar uma disputa (vale o custo do processo em relação ao valor em
jogo e à probabilidade de sucesso?) se apoia nos mesmos sinais de risco que a detecção de fraude
de aplicação já calcula antes da transação ocorrer.

## Exemplo numa fintech

Um portador contesta uma compra de R$ 800 alegando que nunca a autorizou; o lojista tem 10 dias
para responder com evidência (recibo de entrega assinado, endereço de IP compatível com o
cadastro, autenticação 3DS bem-sucedida na transação original); enquanto a disputa corre, o valor
fica retido — nem o lojista o recebe de volta, nem o portador o tem de volta, até a decisão final.

## Hands-on

**Tutorial.** Implemente a máquina de estados de uma disputa de chargeback com prazos
configuráveis.

**Desafio.** Implemente os lançamentos de retenção, estorno e reapresentação, e a função de
decisão de contestar.

**Invariantes testáveis**

1. **Nenhuma ação fora do prazo** é aceita pelo sistema simulado — testado com relógio falso
   avançando além de cada prazo configurado.
2. Os lançamentos de disputa (retenção, estorno, reapresentação) **conservam os fundos** e cada
   disputa simulada termina em **um** estado terminal.
3. A mesma notificação de abertura de disputa processada **N vezes** tem o efeito de **uma só**
   (idempotência de ingestão).
4. A decisão de **contestar** uma disputa é uma função pura de custo do processo, valor em jogo e
   probabilidade de sucesso estimada — testada contra uma tabela de casos.
5. A **taxa de chargeback** do lojista, calculada sobre uma massa sintética de transações e
   disputas, dispara o alerta configurado exatamente no limite esperado.

**Complemento.** Compare, por escrito, as garantias do portador em cartão (chargeback), Pix (MED)
e boleto, para o mesmo cenário hipotético de produto não entregue.

**Checagem**

1. Por que perder um prazo de resposta numa disputa de chargeback geralmente decide o caso
   independentemente do mérito da evidência?
2. Por que a evidência relevante para um chargeback de "serviço" é diferente da relevante para um
   de "fraude"?
3. Qual é a diferença prática entre fraude amigável e fraude real, e por que a resposta a cada uma
   deveria ser diferente?
4. Por que o Pix não tem um mecanismo equivalente ao chargeback de cartão, e o que o MED cobre em
   vez disso?

> **Reencontro — `seguranca-aplicacao/14`, `go-fintech/05`.** A detecção de fraude e abuso daqueles
> marcos é o sinal que alimenta tanto a decisão de contestar uma disputa quanto a classificação
> entre fraude amigável e fraude real — a antifraude de aplicação e a resposta a disputas são dois
> lados do mesmo risco.

O caso de antifraude em tempo real de `system-design/12` decide, antes da autorização, se uma
transação deveria ser bloqueada; este marco trata do que acontece quando essa decisão prévia não
impediu a fraude e ela já precisa ser disputada depois do fato. E o processo de disputa de longa
duração, com etapas compensáveis (retenção, estorno, reapresentação), é o mesmo padrão de saga já
formalizado em `arquitetura-eventos/09`.

## Principais aprendizados

- Perder um prazo de resposta numa disputa de chargeback decide o caso, independentemente do
  mérito da evidência disponível.
- A evidência certa depende da categoria do motivo — serviço, processamento e fraude exigem provas
  diferentes.
- Fraude amigável e fraude real exigem respostas diferentes, mesmo compartilhando o mesmo canal de
  disputa.
- O Pix não tem chargeback — tem o MED, reservado a fraude investigada, não a insatisfação com
  produto ou serviço.
- A taxa de chargeback de um lojista é um indicador de risco observado continuamente, com
  consequências automáticas em limites definidos.
