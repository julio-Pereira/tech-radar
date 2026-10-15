---
id: cartoes-autorizacao
title: "Cartões: autorização e tokenização"
summary: "A autorização de cartão é uma conversa rápida entre quatro partes com resultado possivelmente desconhecido — e o dado do cartão é o ativo que mais amplia o seu escopo de risco."
estimatedMinutes: 65
references:
  - title: "PCI Security Standards Council — Documents Library"
    url: https://www.pcisecuritystandards.org/document_library/
  - title: "OWASP — Cheat Sheet Series"
    url: https://cheatsheetseries.owasp.org/
---

## O fluxo de quatro partes

Uma autorização de cartão viaja: **portador** → **lojista** → **adquirente** → **bandeira** →
**emissor** — e a resposta percorre o caminho inverso. Cada seta é uma chamada de rede com sua
própria latência e seu próprio modo de falha; o tempo total que o portador espera no caixa é a
soma de quatro saltos, não de um só, o que explica por que um limite de tempo de resposta
generoso em cada salto ainda produz uma experiência lenta de ponta a ponta.

## A mensagem de autorização

A mensagem de autorização tradicionalmente viaja num formato de campos estruturados com um
**bitmap** indicando quais campos estão presentes (a família de formatos conhecida como ISO 8583
é a referência histórica mais citada) — este marco usa um **subconjunto didático** desse formato,
com tipos de mensagem, campos principais e códigos de resposta simplificados; o dialeto exato de
qualquer arranjo real é **conferir** no manual específico, nunca assumido deste material.

## Estados: autorizado, negado, e resultado desconhecido

Toda autorização termina, do ponto de vista do adquirente, em um de três resultados possíveis:
**autorizado**, **negado**, ou — o caso que mais exige disciplina de engenharia —
**resultado desconhecido** quando a resposta do emissor nunca chega dentro do tempo esperado
(*timeout*). Tratar *timeout* como "negado" por padrão é um erro sutil: se o emissor, de fato,
havia autorizado e reservado o valor (um *hold* na linha de crédito do portador) antes do
*timeout*, o sistema precisa reconhecer e desfazer esse *hold* — não simplesmente seguir adiante
como se nada tivesse acontecido.

## Reversão: por que ela é obrigatória

Uma **reversão** desfaz uma autorização que, por algum motivo (timeout, erro de rede, decisão do
lojista de cancelar a venda), não deveria seguir adiante — e ela é **obrigatória**, não opcional,
precisamente porque uma autorização bem-sucedida reserva um valor na linha do portador. Sem
reversão, um *timeout* no caminho de volta deixaria esse *hold* preso indefinidamente, reduzindo o
limite disponível do portador por uma transação que, do lado dele, nunca aconteceu de fato.

## Autorização duplicada e chave de idempotência

Cada autorização carrega um **identificador de rastreio** (e uma referência da transação) que
funciona como chave de idempotência: a mesma referência retransmitida — por retentativa de rede,
por exemplo — deveria devolver o **mesmo resultado** da primeira vez, nunca gerar um segundo
*hold* na conta do portador. Esse é o mesmo princípio de idempotência que `arquitetura-eventos/08`
já formalizou para eventos — aqui aplicado a uma chamada síncrona entre quatro partes.

## *Stand-in*: quando o emissor está fora

**Stand-in** é a decisão tomada pela bandeira (ou pelo adquirente) de autorizar ou negar uma
transação **em nome do emissor**, quando o emissor está indisponível, usando regras simplificadas
previamente combinadas (limites conservadores, por exemplo). É uma decisão de continuidade de
negócio — melhor autorizar com uma regra mais cautelosa do que negar toda transação sempre que um
emissor específico está fora do ar.

## EMV, CVV e 3-D Secure

O **chip EMV** acrescenta criptografia e um segredo que não viaja em texto claro, tornando a
clonagem do chip muito mais difícil do que a da tarja magnética; o **CVV** é um código adicional de
verificação (impresso ou gerado dinamicamente); e o **3-D Secure** é uma decisão **baseada em
risco** de exigir, ou não, uma segunda etapa de autenticação do portador antes de autorizar — uma
transação de baixo risco pode passar sem fricção adicional, uma de alto risco aciona o desafio. A
decisão de quando acionar cada camada é, estruturalmente, uma função de risco calculada a partir de
sinais da transação, não uma regra fixa.

## Tokenização e o escopo de PCI

**Tokenização** substitui o número real do cartão por um token (do arranjo ou do adquirente) que só
tem significado dentro de um contexto específico — perder um token não expõe o número real do
cartão. Reduzir o número de sistemas que tocam o número real do cartão reduz diretamente o
**escopo de PCI** (quais sistemas precisam de auditoria de conformidade) — **conferir** o padrão
vigente para os requisitos exatos. Um sistema que usa só tokens em toda sua superfície, exceto um
único componente isolado, tem escopo de PCI dramaticamente menor do que um que manipula o número
real em toda parte.

## O `cofre`: o único componente que vê o número

A decisão arquitetural central deste marco: **um único componente** (`cofre/`) tem acesso ao número
real do cartão; todo o resto do sistema — incluindo o orquestrador, os logs, as métricas — só vê
tokens. Essa fronteira é testável por **arquitetura** (nenhum tipo que represente o número real
escapa do `cofre/`) e por **varredura** (nenhum padrão de número de cartão aparece em log, arquivo
ou teste fora dele).

## Luhn e faixas de teste

O algoritmo de **Luhn** valida que um número de cartão tem a estrutura correta — é uma checagem de
formato, não uma prova de que o cartão existe ou tem saldo. Para qualquer teste ou simulação, usar
exclusivamente **faixas de números reservadas para teste** (publicadas pelos próprios arranjos)
evita qualquer ambiguidade entre "número de teste" e "número real que por acaso parece de teste".

## Exemplo numa fintech

A autorização de uma compra chega ao emissor e é aprovada, mas a resposta se perde na rede de
volta; o adquirente, ao perceber o *timeout*, envia uma reversão; o *hold* na linha de crédito do
portador é liberado — e, graças à chave de idempotência, mesmo que a reversão seja reenviada por
segurança, o *hold* é liberado **exatamente uma vez**, nunca duas.

## Hands-on

**Tutorial.** Implemente `sim-cartoes/` com um autorizador simulado e um codec de mensagem
didático (subconjunto de campos e *bitmap*).

**Desafio.** Implemente o fluxo de *timeout* e reversão, e o `cofre/` como único componente com
acesso ao número do cartão.

**Invariantes testáveis**

1. O codec faz *encode → decode → encode* e produz a mensagem **idêntica** à original, para
   qualquer mensagem válida gerada por propriedade (incluindo o *bitmap*).
2. Um **timeout** simulado gera **uma** reversão, e o *hold* correspondente é liberado
   **exatamente uma vez** — mesmo quando a reversão é retransmitida por segurança.
3. A mesma autorização retransmitida (mesma referência de rastreio) devolve **o mesmo resultado**
   da primeira vez e **não cria** um segundo *hold*.
4. O número do cartão **só existe** dentro do pacote `cofre/` — um teste de arquitetura reprova
   qualquer outro pacote que declare um tipo capaz de representá-lo, e uma **varredura** automática
   não encontra padrões de número de cartão em log, arquivo ou teste fora do `cofre/`.
5. O algoritmo de **Luhn** é validado por propriedade e por vetores de teste; e números de teste são
   aceitos **somente** quando o ambiente simulado está explicitamente marcado como ambiente de
   teste.
6. As decisões de **stand-in** e de **3-D Secure** são funções puras testadas contra uma tabela de
   casos (sinais de risco de entrada, decisão esperada de saída).

**Complemento.** Desenhe, por escrito, como o escopo de PCI do lojista mudaria se ele passasse a
usar tokens do adquirente em vez de manipular qualquer dado de cartão diretamente.

**Checagem**

1. Por que um *timeout* na resposta de autorização não deveria ser tratado automaticamente como
   "negado"?
2. Por que a reversão de uma autorização é obrigatória, e não uma conveniência operacional?
3. O que garante que uma autorização retransmitida por retentativa de rede não produza um segundo
   *hold* na conta do portador?
4. Por que isolar o acesso ao número real do cartão num único componente reduz o escopo de PCI do
   restante do sistema?

> **Reencontro — `seguranca-aplicacao/09`, `/10`.** A criptografia aplicada e a gestão de segredos
> e chaves daqueles marcos são exatamente o que protege o `cofre/` deste marco — tokenização sem
> uma base sólida de criptografia e gestão de chave é só uma ilusão de segurança.

A resiliência de cliente de `spring-boot/08` (timeout, *circuit breaker*) é o padrão que o
orquestrador do marco 09 aplicará a cada chamada entre as quatro partes deste fluxo, e a detecção
de fraude de `go-fintech/05` é o sinal de risco que alimenta a decisão de acionar 3-D Secure.

## Principais aprendizados

- Uma autorização de cartão é uma cadeia de quatro saltos de rede, cada um com sua própria
  latência e seu próprio modo de falha.
- *Timeout* não é "negado" — é resultado desconhecido, e pode exigir reversão de um *hold* já
  concedido.
- A chave de idempotência da autorização garante que uma retransmissão nunca produza um segundo
  *hold*.
- Tokenização e isolamento num único componente (`cofre/`) reduzem drasticamente o escopo de PCI
  do restante do sistema.
- *Stand-in* e 3-D Secure são decisões baseadas em risco, não regras fixas de tudo ou nada.
