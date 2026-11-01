---
id: pix-por-dentro
title: "Pix por dentro"
summary: "O Pix por baixo do capô: um diretório de chaves, uma mensagem padronizada e um sistema de liquidação 24x7 — e cada peça tem suas regras e seus modos de falha."
estimatedMinutes: 65
references:
  - title: "Banco Central do Brasil — Pix"
    url: https://www.bcb.gov.br/estabilidadefinanceira/pix
  - title: "Banco Central do Brasil — Padrões de QR Code (BR Code)"
    url: https://www.bcb.gov.br/estabilidadefinanceira/qrcodepix
---

## Participantes diretos e indiretos, e a conta de liquidação

Um participante **direto** do Pix mantém sua própria conta de liquidação no SPI; um participante
**indireto** acessa o sistema através de um participante direto que serve de intermediário —
distinção que importa porque a responsabilidade por falhas e prazos muda conforme essa posição
(**conferir** as regras vigentes de participação). Toda conta de liquidação do Pix é um caso
específico da conta de reserva introduzida no marco 01: liquidação bruta em tempo real, movimento
individual por transação.

## O SPI como infraestrutura de liquidação

O **SPI** (Sistema de Pagamentos Instantâneos) é a infraestrutura central que liquida cada
transação Pix individualmente, 24 horas por dia, 7 dias por semana — a peça que torna o Pix uma
liquidação bruta em tempo real genuína, não uma promessa de liquidação futura. Operar 24x7 é
também a origem de boa parte da complexidade operacional que os marcos 07 e 10 tratam: não existe
"horário de manutenção" em que o sistema simplesmente para.

## O DICT como diretório de chaves

O **DICT** é o diretório que associa uma **chave Pix** (CPF/CNPJ, e-mail, telefone, ou uma chave
aleatória gerada sem relação com um dado pessoal) à conta de destino real. Uma transação Pix
iniciada por chave não conhece a conta do destinatário até consultar o DICT — o diretório é,
estruturalmente, um serviço de tradução que se interpõe entre a intenção de pagar "para essa
chave" e o fluxo de fundos real.

## Vinculação, portabilidade e reivindicação

**Vincular** uma chave a uma conta é um ato declarado, revogável; **portabilidade** é levar uma
chave já vinculada para outra instituição; **reivindicação** é o processo formal para resolver o
caso em que alguém tenta vincular uma chave já vinculada a outra conta em outra instituição — um
mecanismo deliberadamente mais lento e auditável que uma vinculação simples, exatamente porque
resolve uma disputa sobre identidade de destino (**conferir** os prazos vigentes de cada processo).

## Proteção contra enumeração de chaves

Se a consulta ao DICT não tivesse limite, um atacante poderia testar chaves em sequência (números
de telefone, por exemplo) e descobrir quais estão vinculadas a uma conta Pix — um ataque de
**enumeração**. A defesa estrutural é limitar a taxa de consultas por solicitante e nunca
diferenciar, na resposta de erro, entre "chave não existe" e "chave existe, mas consulta
recusada" — qualquer diferença observável nessas duas respostas vaza informação.

## QR Code estático × QR Code dinâmico

Um **QR estático** carrega só a chave (ou dados fixos) e pode ser reutilizado indefinidamente — o
valor a pagar é digitado pelo pagador; um **QR dinâmico** é gerado para uma cobrança específica,
com valor e identificador já embutidos, e normalmente tem validade limitada. A escolha entre os
dois é uma escolha de segurança e de atualização: um QR estático impresso não pode ser corrigido
se o preço mudar; um QR dinâmico pode expirar e ser substituído sem reimprimir nada.

## A estrutura do BR Code

O **BR Code** (o padrão de QR Code do Pix, derivado do padrão internacional EMVCo) organiza seus
dados em campos codificados como **TLV** (*tag-length-value*: um identificador do campo, o
tamanho do valor, e o valor em si) e termina com um **CRC** calculado sobre todo o conteúdo
anterior — qualquer alteração de um único caractere no payload invalida o CRC, o que torna o
código inteiro verificável sem precisar de nenhuma consulta externa antes de aceitar o QR como bem
formado. O polinômio exato do CRC e o conjunto completo de campos TLV vêm do manual vigente —
**conferir** antes de implementar, nunca de memória.

## O *payload* dinâmico hospedado pelo recebedor

Um QR dinâmico normalmente não carrega o valor e os detalhes completos da cobrança diretamente no
código — carrega uma **URL** que o aplicativo do pagador consulta para buscar o *payload* completo,
hospedado pelo recebedor (ou por seu PSP). Essa indireção é o que permite que uma cobrança dinâmica
tenha estado (pendente, paga, expirada) sem precisar regravar o QR a cada mudança.

## Mensagens, identificador fim a fim e estado

Uma transação Pix viaja como uma mensagem estruturada baseada num padrão internacional de
mensagens financeiras (**conferir** o conjunto exato e a versão vigente), carregando um
**identificador fim a fim** — um valor único que acompanha a transação do início ao fim e é a base
da idempotência (o mesmo identificador enviado mais de uma vez não deveria gerar dois pagamentos).
Cada mensagem tem um **estado** explícito (recebida, em processamento, liquidada, rejeitada) — e um
sistema que não modela estado intermediário tende a tratar "ainda não sei" como "falhou", o erro que
`system-design/09` já identificou como o mais caro de cometer num pagamento.

```diagrama
pg-pix
```

## Limites de tempo, horário e valor como texto decimal

Toda mensagem do SPI tem um **limite de tempo de resposta** — estourá-lo tem consequência
operacional definida pelo manual vigente, não um simples log de aviso (**conferir** os limites e
consequências exatos). Limites de valor por horário (por exemplo, limites noturnos reduzidos) são
parâmetros regulatórios que mudam com frequência — **conferir** sempre a regra vigente em vez de
reusar um valor de memória. E o **valor monetário** de uma transação Pix é tratado como texto
decimal com exatamente duas casas — tratá-lo como ponto flutuante binário é a fonte mais comum e
mais evitável de erro de centavo neste domínio inteiro.

## Exemplo numa fintech

Um cliente abre o aplicativo, lê um QR dinâmico no caixa de uma loja, e o aplicativo consulta a URL
embutida para buscar o valor exato da cobrança; em seguida consulta o DICT para resolver a chave
do lojista para a conta de destino real, monta a mensagem com um identificador fim a fim novo, e o
SPI liquida a transação em segundos.

## Hands-on

**Tutorial.** Implemente `sim-spi/` com um DICT simulado, um gerador/leitor de QR e uma mensagem
didática de pagamento.

**Desafio.** Escreva o codec do QR (gerar e interpretar) e a validação de limite de consultas por
chave no DICT simulado.

**Invariantes testáveis**

1. O **CRC** do QR é calculado e validado corretamente contra os vetores de teste do manual vigente
   (Fase 0); qualquer alteração de um único byte no payload **invalida** o CRC (propriedade).
2. *Serializar → interpretar → serializar* devolve o **mesmo** QR, para qualquer payload válido
   gerado por propriedade com semente fixa.
3. Os **dígitos verificadores** de CPF/CNPJ usados como chave são validados por propriedade e por
   vetores de teste; uma chave fora do formato esperado é **rejeitada**.
4. O DICT simulado **rejeita** consultas acima do limite configurado (usando relógio falso), sem
   que a mensagem de erro diferencie entre "chave inexistente" e "limite excedido".
5. O mesmo identificador fim a fim enviado N vezes ao SPI simulado produz **um único** pagamento —
   nunca N pagamentos.
6. Um valor com mais de duas casas decimais, ou num formato que não seja texto decimal válido, é
   **rejeitado** antes de qualquer processamento.

**Complemento.** Compare, por escrito, um QR estático e um QR dinâmico em termos de segurança e de
capacidade de atualizar o valor cobrado.

**Checagem**

1. Por que a resposta do DICT a uma chave inexistente e a uma consulta que excedeu o limite
   precisa ser indistinguível?
2. O que o identificador fim a fim garante que uma simples chave de idempotência na API de entrada,
   isoladamente, não garantiria?
3. Por que um QR dinâmico costuma carregar uma URL em vez do valor da cobrança diretamente?
4. Qual é o risco concreto de representar um valor monetário em ponto flutuante binário, em vez de
   texto decimal?
5. Por que a vinculação de uma chave e a reivindicação de uma chave já vinculada em outra
   instituição não deveriam seguir o mesmo processo, com a mesma velocidade?
6. Por que um sistema que não modela um estado intermediário explícito de uma transação tende a
   tratar "resultado ainda desconhecido" como "falhou"?

> **Reencontro — `system-design/09`.** O caso de ponta a ponta do Pix já resolveu, naquele marco, o
> problema de estados terminais e resultado desconhecido em nível de sistema; este marco mergulha
> na mecânica concreta — DICT, QR, mensagem — que gera os eventos que aquele fluxo consome.

A proteção contra enumeração de chaves no DICT se apoia no mesmo raciocínio de validação de entrada
não confiável de `seguranca-aplicacao/03`, e a ingestão idempotente de mensagens do SPI usa o mesmo
mecanismo de outbox/inbox de `arquitetura-eventos/08`.

## Principais aprendizados

- O SPI liquida cada transação Pix individualmente, 24x7 — liquidação bruta em tempo real
  genuína, não uma promessa de liquidação futura.
- O DICT traduz uma chave Pix para a conta de destino real, e precisa se proteger contra
  enumeração sem diferenciar "não existe" de "consulta recusada".
- QR estático e QR dinâmico trocam reutilização por capacidade de atualização e expiração.
- O identificador fim a fim é a base da idempotência de uma transação Pix, do início ao fim.
- Valor monetário é texto decimal com duas casas — nunca ponto flutuante binário.
