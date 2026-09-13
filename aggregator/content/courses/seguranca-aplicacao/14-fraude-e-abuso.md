---
id: fraude-e-abuso
title: "Fraude, abuso e o inimigo com CPF"
summary: "O atacante está autenticado e legítimo. Token válido, certificado dele, autorização confere — nenhum controle dos marcos 04 a 08 dispara. É a categoria que mais custa numa fintech."
estimatedMinutes: 55
references:
  - title: "OWASP Automated Threats to Web Applications"
    url: https://owasp.org/www-project-automated-threats-to-web-applications/
  - title: "NIST SP 800-63B — Authentication and Lifecycle Management"
    url: https://pages.nist.gov/800-63-3/sp800-63b.html
  - title: "FIDO Alliance — Passkeys"
    url: https://fidoalliance.org/passkeys/
---

## A premissa que muda tudo

Todos os marcos anteriores partem de uma premissa: existe um atacante tentando passar por
alguém que não é, ou acessar algo que não deveria. Este marco parte da premissa oposta, e é
por isso que ele é o mais desconfortável da trilha: **o atacante está autenticado e
legítimo**. O token é válido. Se há mTLS, o certificado é dele mesmo. A autorização
confere — ele está, de fato, acessando a própria conta. **Nenhum controle dos marcos 04 a
08 dispara**, porque nenhum deles foi violado. É a categoria que a segurança tradicional de
aplicação simplesmente não cobre, e que, numa fintech, costuma ser a que mais custa em
dinheiro direto.

## Account takeover

**Account takeover** — assumir o controle da conta de outra pessoa — acontece por caminhos
que não têm nada de sofisticado tecnicamente: **credential stuffing** (testar, em massa,
credenciais vazadas de **outro** serviço, apostando que a pessoa reusou a senha), **SIM
swap** (transferir o número de telefone da vítima para um chip do atacante, capturando SMS
de segundo fator), **engenharia social** (convencer a própria vítima, ou o suporte da
empresa, a entregar acesso). O elo mais fraco de qualquer autenticação forte, de forma
consistente, é o **fluxo de recuperação de conta** — ele existe justamente para contornar
o fator normal quando ele falha, o que o torna o caminho que um atacante procura primeiro.

Sobre MFA, uma hierarquia honesta dos fatores importa mais do que "ter MFA" como caixa
marcada: **SMS é o pior fator que ainda é aceitável** — vulnerável a SIM swap e a
interceptação, mas melhor que nenhum segundo fator. **Passkeys** (baseadas em FIDO2/WebAuthn,
com prova criptográfica vinculada ao dispositivo) mudaram o cálculo real: são resistentes a
phishing de um jeito que nenhum código digitado manualmente consegue ser, porque a prova
está amarrada à origem (domínio) que a solicitou, não a um valor que o usuário pode ser
convencido a digitar em outro lugar.

## Controles de aplicação — o escopo desta trilha

Dentro do que uma aplicação pode controlar diretamente: **step-up por risco**
(*reencontro* do marco 08 — reautenticação ou fator adicional exigido pela operação
específica, não pela sessão inteira), **limite por janela** (valor máximo movimentável num
intervalo de tempo), **velocity check** (número de operações numa janela, sinalizando
comportamento fora do padrão), e **device binding** (associar a sessão a características
do dispositivo usado historicamente). Todos esses mecanismos esbarram num **limite ético e
legal**: fingerprinting de dispositivo é dado pessoal sob a LGPD, e coletar mais sinal do
que o necessário, ou sem base legal clara, troca um risco de fraude por um risco de
conformidade — a linha entre "sinal de segurança razoável" e "vigilância excessiva" é uma
decisão de produto e de compliance, não só de engenharia.

## O golpe com a vítima cooperando

A categoria mais desconfortável de todas: o **golpe em que a própria vítima autoriza a
operação**, convencida por um falso atendente, sob coação, ou por engenharia social
elaborada (o "golpe do PIX", em suas várias formas). Nenhum controle técnico distingue essa
transação de uma legítima, porque, tecnicamente, ela **é** legítima — foi o titular real
quem autorizou, sob seu próprio dispositivo, com seu próprio fator. **O controle aqui é
produto, não código**: limite de valor no período noturno, confirmação com atraso
deliberado (uma janela de alguns minutos antes de a transferência realmente sair, dando
tempo para arrependimento), canal de contestação acessível. Vale dizer isso explicitamente,
porque o reflexo de quem trabalha com engenharia é procurar uma solução técnica onde às
vezes não existe uma — a resposta certa é de desenho de produto e de política, não de mais
uma verificação no backend.

## Fronteira honesta

Esta trilha para na **superfície e no mecanismo**: como um controle de aplicação (step-up,
limite, device binding) é implementado e testado. O **modelo de risco** e a **decisão de
fraude** propriamente dita — o escore que decide se uma transação específica é suspeita o
bastante para ser bloqueada ou revisada — pertencem a `go-fintech` (ledger-core/antifraude).
A fronteira prática: aqui se constrói o **mecanismo** que aplica uma decisão; lá se
constrói o **modelo** que produz a decisão.

## Exemplo numa fintech

O **MED** (Mecanismo Especial de Devolução) do Pix formaliza uma obrigação concreta: a
aplicação precisa **registrar, no momento da transação**, o conjunto de sinais que
sustentam uma contestação **semanas depois** — dispositivo usado, velocidade da operação,
se houve step-up, qual canal originou a transação. Registrar isso **depois** do fato, a
partir de log genérico, raramente reconstrói o que é necessário; o registro precisa ser
desenhado **no momento da transação**, pensando explicitamente no que uma contestação vai
exigir. É insumo direto do log de segurança formalizado no marco 15.

## Hands-on

**Desafio — step-up disparado por valor e velocidade.** Implemente uma regra que dispara
step-up authentication quando uma transação excede um valor limite **ou** quando a
velocidade de operações (número de transações numa janela curta) ultrapassa um limiar.
Registre, de forma auditável, exatamente qual regra disparou e por quê.

**Invariantes testáveis**

1. Uma transação acima do limite de valor, sem step-up completado, é rejeitada.
2. O step-up concluído libera **apenas aquela transação específica** — não eleva o nível de
   confiança da sessão inteira para operações futuras.
3. A decisão (disparar step-up, aceitar, rejeitar) e o motivo específico ficam registrados
   no log de segurança, não apenas o resultado final.
4. Uma segunda transação, dentro da mesma sessão mas abaixo do limiar, não exige step-up —
   confirmando que o controle é por transação, não por sessão.

**Complemento.** Escreva, como exercício de produto e não de código, o desenho de uma
confirmação com atraso deliberado para transferência de alto valor: quanto tempo de
atraso, o que acontece se o titular cancelar dentro da janela, e como isso é comunicado
sem parecer fricção arbitrária.

**Checagem**

1. Por que nenhum controle dos marcos de identidade e autorização desta trilha detecta um
   account takeover bem-sucedido?
2. Por que SMS como segundo fator, apesar de fraco, ainda é considerado melhor do que
   nenhum segundo fator?
3. Onde está a fronteira entre o que esta trilha ensina sobre fraude e o que pertence a
   `go-fintech`?
4. Por que o golpe com a vítima cooperando não é resolvido por mais verificação técnica no
   backend?

## Principais aprendizados

- A premissa central deste marco é que o atacante está autenticado e legítimo — nenhum
  controle de identidade ou autorização dispara, porque nenhum foi violado.
- O elo mais fraco de qualquer autenticação forte costuma ser o fluxo de recuperação de
  conta; SMS é o pior fator ainda aceitável, e passkeys mudam o cálculo por resistir a
  phishing estruturalmente.
- Controles de aplicação (step-up por transação, limite por janela, velocity check, device
  binding) esbarram num limite legal e ético sob LGPD — mais sinal não é sempre melhor.
- O golpe com a vítima cooperando não tem solução técnica: o controle é de produto (limite
  noturno, confirmação com atraso, canal de contestação), não de código.
- Esta trilha cobre superfície e mecanismo de fraude; o modelo de risco e a decisão
  pertencem a `go-fintech` — e o registro no momento da transação sustenta o MED do Pix.
