---
id: boleto-ted-e-trilhos
title: "Boleto, TED e escolha de trilho"
summary: "Boleto e TED não são relíquias: movem volumes enormes, têm regras próprias, e a escolha do trilho certo é uma decisão de produto e de risco."
estimatedMinutes: 60
references:
  - title: "FEBRABAN — Portal"
    url: https://portal.febraban.org.br/
---

## Boleto de cobrança registrada

Um **boleto de cobrança registrada** não é mais um documento isolado: é uma representação visual
(código de barras e linha digitável) de um título **registrado** numa infraestrutura central de
cobrança — o registro é o que permite que qualquer banco receba o pagamento de um boleto emitido
por outro, com os dois lados vendo o mesmo estado do título. Um boleto não registrado (prática
antiga, hoje residual) não oferece essa garantia de consistência entre as partes.

## Código de barras e linha digitável

O código de barras e a **linha digitável** carregam os mesmos dados codificados de formas
diferentes — o código de barras para leitura óptica, a linha digitável para digitação manual —
incluindo banco, valor, vencimento e **dígitos verificadores** calculados por módulos de
verificação específicos (**conferir** as regras exatas no padrão vigente, nunca de memória). A
linha digitável e o código de barras de um mesmo boleto precisam, por construção, representar
exatamente os mesmos dados — se *gerar → interpretar → gerar* não devolve o mesmo resultado, há um
defeito no codec, não no boleto.

## Fator de vencimento

O **fator de vencimento** é um número que codifica a data de vencimento como contagem de dias a
partir de uma data-base — e esse campo tem um **limite de intervalo** (a contagem eventualmente
precisa ser reiniciada ou reinterpretada, e já houve uma mudança de regra documentada na forma
como essa contagem é tratada — **conferir** a data exata dessa mudança e seu impacto antes de
calcular qualquer vencimento). Um sistema que calcula o fator de vencimento sem tratar
corretamente as bordas desse intervalo gera datas erradas de forma silenciosa — o tipo de bug que
só aparece quando a data real cruza a fronteira que o código não previu.

## Registro, pagamento e baixa

**Registrar** um boleto é publicá-lo na infraestrutura central antes de ele circular; **pagar** um
boleto é liquidá-lo (em caixa físico ou canal digital); **dar baixa** é marcar formalmente o título
como liquidado, encerrando sua cobrança — um boleto pago mas sem baixa processada continua, do
ponto de vista do credor, como pendente, o que pode gerar cobrança indevida se ninguém notar a
divergência.

## Multa, juros e pagamento após o vencimento

Boletos pagos após o vencimento normalmente acumulam **multa** (valor ou percentual fixo) e
**juros** (geralmente proporcionais aos dias de atraso) — o cálculo exato de cada um é uma regra
de negócio configurável, nunca um valor fixo codificado, porque os parâmetros (percentual de
multa, taxa diária de juros) variam por credor e por contrato. Testar esse cálculo contra uma
tabela de casos nas bordas (o próprio dia do vencimento, o dia seguinte, muitos dias depois) é a
forma de garantir que a regra configurável está sendo aplicada corretamente nos extremos.

## Pagamento duplicado e boleto híbrido

Um mesmo título pago duas vezes — por exemplo, pago no caixa físico e, no mesmo dia, pago também
por um canal digital antes de a baixa do primeiro pagamento propagar — é um caso que o sistema
precisa **detectar e isolar**, não apenas processar duas liquidações como se fossem transações
independentes. O **boleto híbrido**, que combina a linha digitável tradicional com um QR Code do
Pix no mesmo documento, é uma extensão recente (**conferir** a disponibilidade e as regras
vigentes) que não muda a mecânica central deste marco, só adiciona um segundo canal de pagamento
ao mesmo título.

## TED e transferência

A **TED** (Transferência Eletrônica Disponível) move fundos entre instituições diferentes, com
regras próprias de **janela de horário** (nem todo horário permite envio), de **finalidade**
declarada, e de irrevogabilidade uma vez processada (**conferir** as regras vigentes de cada uma).
O **débito automático** é um mecanismo relacionado — autorização prévia do titular para que um
valor periódico seja debitado — conceitualmente parecido com a recorrência do Pix (marco 03), mas
operando sobre um trilho diferente, com suas próprias regras de cancelamento e aviso prévio.

## Tabela de trilhos e escolha do trilho certo

Cada trilho (Pix, cartão, boleto, TED) tem um perfil diferente de **finalidade**, **tempo**,
**custo**, **reversibilidade**, **horário** e **limite** — e escolher qual oferecer, ou qual usar
internamente para mover um valor específico, é uma decisão de produto e de risco, não só uma
preferência técnica. Modelar essa escolha como uma **função pura** (entrada: valor, urgência,
horário, talvez o perfil de risco do destinatário; saída: o trilho recomendado) torna a decisão
testável e auditável, em vez de uma lógica implícita espalhada pelo código.

## Exemplo numa fintech

Um boleto vencido há cinco dias é pago com multa e juros calculados corretamente; no mesmo dia, o
sistema do credor recebe **duas** notificações de liquidação do mesmo título — uma do canal
original, outra de um canal de conciliação atrasado — e precisa reconhecer que é o mesmo
pagamento, não contabilizar duas vezes a entrada de caixa.

## Hands-on

**Tutorial.** Implemente `sim-boleto/` com geração, interpretação (*parsing*) e pagamento de
boletos sintéticos.

**Desafio.** Implemente a detecção de pagamento duplicado e a função de escolha de trilho.

**Invariantes testáveis**

1. *Gerar → interpretar → gerar* devolve a **mesma** linha digitável, com **dígitos
   verificadores** corretos, validados contra vetores de teste do padrão vigente (Fase 0).
2. A alteração de **qualquer** dígito na linha digitável é **detectada** pela validação (teste de
   propriedade: nenhuma alteração de um único caractere passa sem ser notada).
3. O **fator de vencimento** é calculado e interpretado corretamente nas bordas do intervalo —
   testado com uma tabela de casos usando uma data fictícia de virada de contagem.
4. Multa e juros reproduzem a **tabela de casos** esperada para diferentes dias de atraso, com o
   calendário configurado.
5. A segunda liquidação do mesmo título (pagamento duplicado) é **detectada e isolada** — uma
   asserção rígida reprova qualquer versão que simplesmente processe as duas como independentes.
6. A função de **escolha de trilho** é pura, e a tabela de decisão cobre todos os cruzamentos
   testados de valor × urgência × horário.

**Complemento.** Descreva, por escrito, o que mudaria operacionalmente ao oferecer um boleto
híbrido com QR Pix, do ponto de vista de conciliação de pagamentos.

**Checagem**

1. Por que a linha digitável e o código de barras de um mesmo boleto precisam representar
   exatamente os mesmos dados codificados?
2. O que pode acontecer se um sistema calcula o fator de vencimento sem tratar corretamente as
   bordas do intervalo de contagem?
3. Por que um boleto pago, mas sem baixa processada, continua pendente do ponto de vista do
   credor?
4. Que fatores, além do custo, deveriam entrar na função de escolha de trilho entre Pix, cartão,
   boleto e TED?

> **Reencontro — `spring-boot/06`.** A idempotência e o padrão de *outbox* daquele marco são o
> mesmo mecanismo que garante que uma notificação de liquidação de boleto processada mais de uma
> vez produza o efeito de uma única baixa, não de duas entradas de caixa duplicadas.

A validação de entrada não confiável de `seguranca-aplicacao/03` se aplica diretamente ao parser da
linha digitável — nenhum dado de um boleto deveria ser processado sem validação estrutural antes
de qualquer cálculo de valor. E o contrato explícito de API de `system-design/05` é o modelo que a
função de escolha de trilho, exposta como decisão testável e auditável, deveria seguir.

## Principais aprendizados

- Um boleto registrado garante que qualquer banco veja o mesmo estado do título — a infraestrutura
  de registro é o que torna isso possível.
- O fator de vencimento tem bordas de intervalo que precisam de tratamento explícito, não cálculo
  de memória.
- Um boleto pago sem baixa processada continua pendente do ponto de vista do credor.
- Pagamento duplicado precisa ser detectado e isolado, nunca processado como duas transações
  independentes.
- Escolher o trilho certo (Pix, cartão, boleto, TED) é uma decisão de produto e de risco, melhor
  modelada como função pura e testável.
