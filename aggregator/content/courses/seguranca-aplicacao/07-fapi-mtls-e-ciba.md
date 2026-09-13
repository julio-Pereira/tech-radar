---
id: fapi-mtls-e-ciba
title: "FAPI, mTLS e CIBA"
summary: "OAuth2 é um framework com liberdade demais para dinheiro. FAPI é o perfil que fecha as escolhas — e o token sender-constrained é a peça que muda o que significa roubar um token. Marco crítico: quiz estendido."
estimatedMinutes: 60
references:
  - title: "OpenID Foundation — FAPI Working Group"
    url: https://openid.net/wg/fapi/
  - title: "RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens"
    url: https://datatracker.ietf.org/doc/html/rfc8705
  - title: "RFC 9126 — OAuth 2.0 Pushed Authorization Requests (PAR)"
    url: https://datatracker.ietf.org/doc/html/rfc9126
---

## Por que FAPI existe

OAuth2, por desenho, é um **framework**: define o esqueleto e deixa dezenas de escolhas
abertas para cada implementação — qual fluxo, como autenticar o client, se validar `aud`
com que rigor. Essa liberdade é uma virtude para a maioria dos casos de uso e um problema
sério quando o que está em jogo é dinheiro. **FAPI** (Financial-grade API) é o **perfil**
que fecha essas escolhas: define o que é **obrigatório**, o que é **proibido**, e — o que
o diferencia de uma boa prática documentada — o que é **testado por uma suíte de
conformidade** independente. Duas variantes: **Baseline** (o piso), e **Advanced**, que
acrescenta os requisitos que fecham as brechas mais sutis: autenticação de client mais
forte, resposta assinada, e token sender-constrained.

## Os requisitos que mais pegam na prática

Quatro exigências do FAPI Advanced concentram a maior parte do esforço de implementação:

- **Autenticação de client por `private_key_jwt` ou mTLS** — `client_secret` sozinho não
  atende ao perfil.
- **PAR obrigatório** (já apresentado no marco 05) — remove parâmetros manipuláveis do
  front-channel.
- **Resposta assinada (JARM)** — a resposta de autorização, não só o token final, vem
  assinada pelo authorization server, fechando uma superfície de manipulação que passa
  despercebida quando só o token é protegido.
- **`s_hash`** — um hash do `state` incluído no `id_token`, ligando criptograficamente a
  resposta de autorização à requisição original — mais uma camada sobre o que `state`
  sozinho oferece.
- **Token sender-constrained** — o requisito central desta seção.

## Sender-constrained é a ideia central

Um **bearer token** — o modelo padrão de OAuth2 — vale para **quem o segurar**. Se um
atacante rouba o token (de um log, de um proxy mal configurado, de um dispositivo
comprometido), ele o usa exatamente como o titular legítimo usaria; o token não sabe
diferenciar. **Token sender-constrained** resolve isso vinculando o token a algo que o
atacante não consegue copiar junto com o valor do token: o **certificado do client**
(mTLS, RFC 8705, verificado via a claim `cnf.x5t#S256` embutida no token) ou a **chave
privada do client** (**DPoP**, Demonstration of Proof-of-Possession — o client assina uma
prova a cada requisição, comprovando posse da chave sem expor o segredo). Um token
sender-constrained roubado sozinho **não vale nada**: quem o apresenta também precisa
provar posse do certificado ou da chave correspondente.

Quando usar cada um: **mTLS** onde já existe infraestrutura de certificado por cliente —
o caso natural do Open Finance, com certificados ICP-Brasil. **DPoP** onde essa
infraestrutura não existe — um client que não tem (ou não pode operar) um certificado por
instância, mas consegue gerar e guardar um par de chaves.

## mTLS de verdade, não o diagrama

"Fizemos mTLS" costuma significar bem menos do que o necessário. mTLS correto exige:

- **Validação da cadeia completa e dos emissores aceitos** — não apenas "o certificado
  existe", mas "foi emitido por uma CA que este sistema confia, e a cadeia até a raiz
  fecha".
- **Revogação** (CRL ou OCSP) — e o detalhe operacional que costuma passar despercebido:
  a verificação de revogação **falha aberta com frequência**, porque quando o serviço de
  CRL/OCSP está indisponível, muitas implementações optam por aceitar o certificado em vez
  de recusar a conexão. Decidir esse comportamento explicitamente — e não herdá-lo do
  padrão da biblioteca — é parte do desenho, não detalhe de configuração.
- **Pinning**, quando o conjunto de emissores aceitos é pequeno e conhecido — reduz a
  superfície a uma CA específica em vez de qualquer CA confiável pelo sistema operacional.
- **Terminação TLS no gateway e repasse do certificado por header** — na maioria das
  arquiteturas, o TLS termina na borda (load balancer, API gateway), e o certificado do
  client precisa ser repassado ao serviço de aplicação por um header HTTP. Esse header
  **precisa ser sanitizado na borda**: se o gateway não remove qualquer header de
  certificado que o cliente externo tenha tentado injetar diretamente, qualquer requisição
  externa pode se declarar portadora de qualquer certificado, sem jamais ter passado pela
  verificação de TLS mútuo.

## Certificado como identidade organizacional

No Open Finance, o certificado não identifica só uma máquina — ele carrega **identidade
organizacional**: no padrão ICP-Brasil, OIDs específicos no certificado codificam o papel
do participante (instituição de pagamento, iniciadora, agregadora). O `fin-idp` que lê
esses OIDs está lendo, efetivamente, "quem é esta organização e o que ela está autorizada
a fazer no ecossistema" — não apenas "este é um certificado válido". E a expiração desse
certificado não é um evento surpresa: é um **incidente previsível**, com data conhecida
com meses de antecedência, o que o marco 10 retoma como responsabilidade operacional (o
alerta com dono, não a surpresa de sábado à noite).

## CIBA: o fluxo desacoplado

**CIBA** (Client-Initiated Backchannel Authentication) resolve um problema que os fluxos
anteriores não cobrem: o **cliente inicia** a autorização, mas o **titular aprova em outro
dispositivo** — o caso de um caixa físico, um call center, ou um dispositivo IoT sem
navegador conveniente. O fluxo gera um `auth_req_id`, e a aplicação consulta o resultado
por um de três modos: **poll** (pergunta periodicamente), **ping** (o authorization server
avisa quando há resultado, e a aplicação busca o detalhe) ou **push** (o resultado chega
direto). CIBA existe em pagamento porque **o canal onde a transação nasce não é o canal
onde o titular autoriza** — um atendente inicia um Pix no sistema interno, e é o celular do
titular, em outro canal inteiramente, que recebe e aprova a solicitação.

## Exemplo numa fintech

O Open Finance Brasil adota **FAPI 1.0 Advanced** como perfil de conformidade obrigatório,
e o **Diretório de Participantes** funciona como âncora de confiança de todo o ecossistema:
é ele quem certifica quem pode emitir e validar credencial dentro do sistema, e quem
processa revogação quando um participante é suspenso. Um participante suspenso no
Diretório precisa deixar de ser aceito **imediatamente** por todos os outros participantes
— o que exige que a verificação de confiança consulte o Diretório em tempo real ou quase
real, não uma lista de participantes confiáveis cacheada por dias.

## Hands-on

**Tutorial — mTLS entre `pix-gateway` e `fin-idp` com CA local.** Gere uma CA local com
OpenSSL, emita um certificado de client para o `pix-gateway`, e configure mTLS na
comunicação com o `fin-idp` — incluindo a **sanitização do header de certificado na
borda**: configure o componente que termina o TLS para descartar qualquer header de
certificado vindo de fora antes de injetar o seu próprio, verificado.

**Desafio — emitir e provar o token vinculado ao certificado.** Emita um `access_token`
com `cnf.x5t#S256` vinculado ao certificado usado na requisição de token. Prove a
vinculação.

**Invariantes testáveis**

1. Um token apresentado junto com o certificado que o originou é aceito normalmente.
2. **O mesmo token**, apresentado por uma conexão autenticada com **outro certificado
   válido** (emitido pela mesma CA, mas para outro client), é **rejeitado**.
3. A rejeição do item 2 gera um evento no log de segurança — o mesmo log que o marco 14
   formaliza.
4. Uma requisição externa que tenta injetar diretamente o header de certificado (sem
   passar pelo handshake mTLS real) é descartada pela sanitização na borda, com teste que
   prova isso.

**Complemento.** Simule a indisponibilidade do serviço de OCSP/CRL e decida
explicitamente, com justificativa escrita, se o sistema falha aberto (aceita o
certificado) ou fechado (recusa a conexão) nesse cenário. Não deixe essa decisão implícita
no comportamento padrão da biblioteca de TLS.

**Checagem**

1. Por que FAPI é chamado de "perfil" e não apenas de "boa prática" sobre OAuth2?
2. O que significa, concretamente, um token ser "sender-constrained", e por que um bearer
   token comum não tem essa propriedade?
3. Por que o header de certificado repassado por um gateway precisa ser sanitizado na
   borda, mesmo quando o mTLS está corretamente configurado no gateway?
4. Em que situação CIBA resolve um problema que authorization code comum não resolve?

## Principais aprendizados

- FAPI fecha as escolhas que OAuth2 deixa abertas, e é verificável por suíte de
  conformidade — Baseline é o piso, Advanced fecha as brechas mais sutis.
- Token sender-constrained (mTLS ou DPoP) muda o que significa roubar um token: sem o
  certificado ou a chave correspondente, o token roubado não vale nada.
- mTLS "de verdade" exige validação de cadeia, decisão explícita sobre revogação
  indisponível, e sanitização do header de certificado repassado por qualquer gateway que
  termine o TLS antes da aplicação.
- O certificado no Open Finance carrega identidade organizacional, não só identidade de
  máquina — e sua expiração é um incidente previsível, não uma surpresa.
- CIBA existe porque o canal onde a transação nasce nem sempre é o canal onde o titular
  aprova — o Diretório de Participantes é a âncora de confiança que sustenta tudo isso.
