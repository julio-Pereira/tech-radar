---
id: servidor-de-autorizacao-fapi
title: "Servidor de autorização no perfil FAPI"
summary: "Implementar o servidor é um exercício de dizer não com precisão: cada parâmetro que o perfil proíbe é um teste."
estimatedMinutes: 65
references:
  - title: "RFC 9126 — Pushed Authorization Requests (PAR)"
    url: https://datatracker.ietf.org/doc/html/rfc9126
  - title: "RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens"
    url: https://datatracker.ietf.org/doc/html/rfc8705
---

## *Pushed authorization request* (PAR) e *request object*

Em vez de enviar os parâmetros de uma requisição de autorização diretamente na URL (visível,
manipulável pelo navegador), o perfil exige **PAR**: o cliente empurra os parâmetros, antecipadamente,
para um endpoint dedicado do servidor, recebendo em troca uma referência opaca que é, aí sim,
usada no redirecionamento. O **request object** — os parâmetros de autorização empacotados e
**assinados** — é o que viaja nesse empurrão, permitindo ao servidor verificar a integridade do
pedido antes mesmo de iniciar qualquer interação com o usuário.

## Autenticação do cliente: `private_key_jwt` ou mTLS

O cliente (o TPP) se autentica perante o servidor de autorização por um de dois mecanismos
equivalentes em força — `private_key_jwt` (o cliente assina uma afirmação com sua chave privada)
ou **mTLS** (o cliente apresenta um certificado na própria conexão TLS) — **conferir** qual é
exigido ou permitido pelo perfil vigente. Nenhum dos dois é "senha de cliente" (`client_secret`)
tradicional — ambos provam posse de uma chave ou certificado, não conhecimento de um segredo
compartilhado que poderia ter sido vazado.

## Token vinculado ao certificado

Um **token vinculado ao certificado** (*certificate-bound token*) carrega, no próprio token, uma
referência criptográfica ao certificado TLS usado para obtê-lo — e o servidor de recursos, ao
receber esse token numa chamada posterior, verifica que o certificado da conexão **atual** é o
mesmo que o vinculado. Essa vinculação é o que torna um token roubado (copiado de algum lugar)
inútil para quem não também possui a chave privada correspondente ao certificado — um reforço
estrutural contra o cenário mais comum de abuso de token.

## `redirect_uri` exata, PKCE, `state` e `nonce`

O **`redirect_uri`** de um fluxo precisa casar **exatamente** com um valor pré-registrado — não
uma correspondência por prefixo ou por padrão, que abriria espaço para um atacante registrar uma
variação maliciosa. **PKCE** (*Proof Key for Code Exchange*) impede que um código de autorização
interceptado seja trocado por quem não originou a requisição. **`state`** protege contra
falsificação de requisição entre sites; **`nonce`** garante que a resposta de autenticação
corresponde à requisição específica que a originou — cada um protegendo contra uma ameaça
distinta, nenhum substituindo o outro.

## Expiração curta e rotação de *refresh* com detecção de reuso

Códigos de autorização e tokens de acesso têm **expiração curta** deliberadamente — uma janela
pequena limita o dano de uma interceptação. Um **refresh token**, ao ser usado, é **rotacionado**
(o antigo se torna inválido, um novo é emitido) — e se o **token antigo for reutilizado** depois
dessa rotação, isso é sinal forte de que ele foi comprometido (alguém mais, além do dono legítimo,
também o possui), e a resposta correta é revogar **toda a família** de tokens derivados dele, não
só negar essa tentativa específica.

## `jti` e proteção contra *replay*

O **`jti`** (*JWT ID*) é um identificador único de uma instância específica de token ou de
*request object* — reutilizar o mesmo `jti` é o padrão clássico de ataque de **replay** (capturar
uma mensagem válida e reenviá-la depois). Rejeitar um `jti` já visto, inclusive sob tentativas
**concorrentes** (múltiplas requisições simultâneas com o mesmo `jti`, das quais só uma deveria
ser aceita), é uma invariante que precisa sobreviver a condições de corrida, não só a chamadas
sequenciais.

## Erro padronizado e o teste negativo como método

Cada violação específica do perfil (um parâmetro ausente, um valor fora do permitido, uma
assinatura inválida) deveria produzir uma **resposta de erro padronizada e específica** — não um
erro genérico "requisição inválida" que obriga o cliente a adivinhar o que deu errado. O método
central deste marco: para **cada** "deve" do perfil de segurança, escrever a requisição que viola
exatamente aquele "deve" e confirmar que a recusa (com o código certo) realmente ocorre — o
**teste negativo** é tão parte da especificação quanto o fluxo feliz.

## O que o framework entrega × o que você escreve

Um framework maduro de OAuth2/OIDC já implementa boa parte da mecânica genérica (fluxo de
autorização, emissão de token, validação básica) — o que resta, especificamente para o perfil
FAPI, costuma ser PAR, vinculação de token ao certificado, e a suíte negativa específica deste
perfil. `spring-boot/09` já documentou essa mesma divisão do lado Java; aqui, a tabela equivalente
para o stack Go usado no `fin-opengate` é construída e mantida pelo próprio leitor.

## O servidor de autorização não é o servidor de recurso

Uma distinção estrutural que vale repetir: o **servidor de autorização** emite tokens (o que este
marco constrói); o **servidor de recurso** (as APIs de dados e pagamento, marcos 05 e 07) **aceita**
tokens e decide, com base neles e no consentimento, o que devolver. Confundir os dois papéis no
mesmo componente, sem uma fronteira clara, torna difícil raciocinar sobre qual parte do sistema é
responsável por qual decisão de segurança.

## Exemplo numa fintech

Três tentativas de autorização chegam ao servidor: um TPP envia um *request object* sem o campo
`exp`; outro reutiliza um `jti` já visto; um terceiro troca o certificado TLS entre a obtenção do
token e sua utilização. As três são recusadas — cada uma com um código de erro diferente,
correspondente exatamente à violação específica cometida.

## Hands-on

**Tutorial.** Implemente o `transmissor/` com suporte a PAR, *request object* assinado, e emissão
de token vinculado ao certificado.

**Desafio.** Construa a suíte negativa do perfil FAPI: uma linha de teste por requisito do perfil,
cada uma com a violação correspondente.

**Invariantes testáveis**

1. Cada violação listada na suíte negativa recebe a **recusa e o código de erro especificados** —
   verificado linha a linha contra uma tabela que cobre todos os requisitos testados.
2. Um token usado com um **certificado diferente** do que o obteve é **recusado** pelo servidor de
   recurso simulado.
3. Um **`jti` repetido** é recusado — inclusive sob **N tentativas concorrentes simultâneas**, das
   quais exatamente **uma** é aceita.
4. O **código de autorização** é de **uso único** e expira dentro do prazo configurado, verificado
   com relógio falso avançando além da expiração.
5. Um **refresh token reutilizado** depois de já ter sido rotacionado **revoga toda a família** de
   tokens derivados dele, não apenas a tentativa específica.
6. **Demonstração do limite:** removendo deliberadamente a checagem de vinculação ao certificado,
   um token "roubado" (copiado para outra conexão) passa a ser aceito — reproduzido para evidenciar
   por que a vinculação é necessária.

**Complemento.** Preencha, para o seu próprio stack, a tabela "o que o framework entrega" × "o que
eu preciso escrever" para implementar o perfil FAPI completo.

**Checagem**

1. Por que PAR move os parâmetros de autorização para fora da URL visível ao navegador?
2. O que a vinculação de token ao certificado impede especificamente, que a posse só do token (sem
   o certificado) não impediria?
3. Por que a reutilização de um refresh token já rotacionado deveria revogar toda a família de
   tokens, não só negar essa tentativa?
4. Por que um erro genérico "requisição inválida" é insuficiente como resposta a uma violação
   específica do perfil de segurança?

> **Reencontro — `seguranca-aplicacao/05`, `/07`.** O OAuth2/OIDC do primeiro marco é a base
> mecânica que o perfil FAPI, já detalhado no segundo, estende com PAR, vinculação de token e a
> disciplina de teste negativo que este marco implementa de fato.

A tabela comparativa com a implementação Spring de `spring-boot/09` é o que evita reensinar, aqui,
a mecânica genérica de segurança OAuth2/FAPI já coberta do lado Java; e o JOSE por dentro de
`seguranca-aplicacao/04` continua sendo o mecanismo de assinatura que sustenta tanto o *request
object* quanto a verificação de `jti` e expiração deste marco.

## Principais aprendizados

- PAR move os parâmetros de autorização para fora da URL visível, empurrando-os antecipadamente
  para um endpoint dedicado.
- Token vinculado ao certificado torna um token copiado inútil para quem não possui também a
  chave privada correspondente.
- `redirect_uri` exata, PKCE, `state` e `nonce` protegem contra ameaças distintas — nenhum
  substitui o outro.
- Reutilização de refresh token após rotação é sinal de comprometimento e revoga toda a família de
  tokens, não só a tentativa específica.
- O teste negativo — a requisição que viola um requisito específico e a recusa esperada — é tão
  parte da especificação quanto o fluxo feliz.
