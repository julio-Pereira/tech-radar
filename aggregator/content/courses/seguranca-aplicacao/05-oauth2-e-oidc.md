---
id: oauth2-e-oidc
title: "OAuth2 e OIDC: os fluxos e as armadilhas"
summary: "Delegação sem compartilhar credencial, os fluxos que sobreviveram, state contra nonce, e por que redirect URI validada por prefixo é uma porta aberta."
estimatedMinutes: 55
references:
  - title: "RFC 6749 — The OAuth 2.0 Authorization Framework"
    url: https://datatracker.ietf.org/doc/html/rfc6749
  - title: "OpenID Connect Core 1.0"
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: "OAuth 2.0 Security Best Current Practice (IETF)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics
---

## Os quatro papéis e o problema que o protocolo resolve

OAuth2 define quatro papéis: **resource owner** (o titular, geralmente uma pessoa),
**client** (a aplicação que quer acessar algo em nome do titular), **authorization server**
(quem autentica o titular e emite token) e **resource server** (quem serve o recurso e
confia no token). O problema que o protocolo resolve, quando entendido de verdade, faz
parar de tratar OAuth2 como "um jeito de fazer login": é **delegação sem compartilhar
credencial**. Antes de OAuth2, "dar acesso a um terceiro" significava entregar a senha. O
protocolo existe para que o titular autorize um acesso específico, com escopo definido,
sem que o client jamais veja a credencial do titular.

## Os fluxos que sobraram

Do conjunto original de fluxos, dois são efetivamente considerados encerrados hoje:
**implicit grant** (o token voltava direto na URL do navegador, exposto em histórico e
logs de proxy) e **resource owner password credentials** (o client via a senha do titular
diretamente — o problema que o protocolo inteiro existe para resolver, reintroduzido pela
porta dos fundos). Ambos ainda aparecem em tutorial desatualizado; esta trilha os trata
como mortos, não como opção legada.

O que sobrou, e por quê:

- **Authorization code com PKCE obrigatório** — inclusive em **cliente confidencial**, não
  só em client público (SPA, mobile). PKCE (Proof Key for Code Exchange) adiciona um
  segredo gerado por requisição que impede um código de autorização interceptado de ser
  trocado por token por outra parte. Tornar PKCE obrigatório sempre, e não "só quando o
  client não consegue guardar segredo", elimina uma decisão de risco por tipo de client.
- **Client credentials** — machine-to-machine, sem titular envolvido: um serviço se
  autentica diretamente para obter um token que representa a si mesmo.
- **Device code** — para dispositivos sem navegador conveniente (TV, terminal), o titular
  autoriza noutro dispositivo digitando um código curto.

## `state` × `nonce`: dois problemas diferentes

O erro mais comum do tema é confundir esses dois parâmetros — eles protegem coisas
diferentes:

- **`state`** protege contra **CSRF no redirect**: um valor opaco, gerado pelo client
  antes de redirecionar o titular para o authorization server, verificado quando o
  authorization server redireciona de volta. Sem ele, um atacante pode induzir a vítima a
  completar o fluxo de autorização do **atacante**, fazendo a vítima associar sua própria
  sessão à conta do atacante.
- **`nonce`** protege contra **replay do `id_token`**: um valor incluído na requisição de
  autorização e ecoado dentro do `id_token` (OIDC), verificado pelo client para garantir
  que aquele `id_token` específico foi emitido em resposta àquela requisição específica —
  não reaproveitado de uma sessão anterior.

Um protege o redirect; o outro protege o token de identidade. Implementar um sem o outro
deixa a outra metade do problema aberta.

## OIDC sobre OAuth2

OIDC (OpenID Connect) é uma camada de identidade sobre OAuth2, e a distinção que ela força
é a mais cara de errar em toda a trilha: **`id_token` ≠ `access_token`**. O `id_token` é
uma afirmação assinada de **quem o titular é**, destinada ao **client** — ele prova
identidade para a aplicação que iniciou o login. O `access_token` autoriza o **resource
server** a servir um recurso. Usar o `id_token` como se fosse um `access_token` (mandá-lo
para uma API validar) é o erro estrutural que nasce de tratar os dois como
intercambiáveis. A separação maior por trás disso: **autenticação (provar quem você é) não
é autorização (o que você pode fazer)** — o `id_token` resolve a primeira, o
`access_token` (com seu escopo) participa da segunda, mas nenhum dos dois é suficiente
sozinho para decidir permissão sobre um recurso específico, tema que o marco 07 aprofunda.

## Redirect URI: onde o desenho vira vulnerabilidade

A validação da **redirect URI** — para onde o authorization server devolve o código de
autorização — é o ponto onde uma escolha de implementação aparentemente inofensiva vira
brecha. **Matching por prefixo** (`https://app.exemplo.com/*` aceita qualquer coisa que
comece assim) parece flexível e é perigoso: qualquer path adicional sob esse prefixo passa
a ser um destino válido, inclusive um path que o próprio app não controla mais (um
subdomínio esquecido, um endpoint de redirecionamento aberto dentro da própria aplicação).
**Matching exato** é a defesa — a URI registrada e a URI usada precisam ser
byte-a-byte idênticas.

Duas variações do mesmo problema: **open redirect encadeado** (a redirect URI é válida,
mas aponta para um endpoint da própria aplicação que por sua vez redireciona para fora,
vazando o código) e o **mix-up attack** (quando um client fala com múltiplos
authorization servers, e é induzido a enviar o código recebido de um para o servidor
errado). O remédio estrutural para boa parte desses problemas é **PAR** (Pushed
Authorization Request): em vez de montar a requisição de autorização inteira como
parâmetros de URL — manipuláveis no navegador do usuário —, o client a envia
antecipadamente, por back-channel, e recebe uma referência opaca para usar no redirect.
Menos superfície manipulável no front-channel, menos classe de ataque inteira.

## Refresh token: rotação e detecção de reuso

Um refresh token de vida longa é um alvo valioso. A prática atual é **rotação a cada
uso**: cada troca de refresh token por novo access token emite também um **novo** refresh
token, invalidando o anterior. Isso abre a porta para **detecção de reuso**: se um refresh
token já usado (e portanto já invalidado) reaparecer numa requisição, é sinal de que ele
foi roubado e replicado — a resposta correta não é só recusar aquela requisição, é
**invalidar a família inteira** de refresh tokens descendente daquele, forçando o titular
a autenticar de novo. Um token comprometido usado silenciosamente uma vez é dano contido;
usado repetidamente sem detecção é uma sessão permanente do atacante.

## Autenticação do cliente

Como o client prova sua própria identidade ao authorization server tem três respostas, em
ordem crescente de robustez: **`client_secret`** (um segredo compartilhado — o mais fraco,
sujeito a vazamento como qualquer segredo estático), **`private_key_jwt`** (o client assina
uma asserção com chave privada própria, verificada pela pública) e **mTLS** (o certificado
do client na própria camada de transporte). Esta trilha não fecha essa escolha aqui — o
degrau completo, com mTLS de verdade (validação de cadeia, revogação, sanitização de
header), é o marco 06.

## Exemplo numa fintech

Escopo diz o que o **client** está autorizado a pedir; **consentimento** diz o que **este
titular**, especificamente, autorizou. O Open Finance Brasil trata consentimento como
**recurso de primeira classe**, com um `consentId` que carrega: sobre quais dados, até
qual data, com qual finalidade. A diferença é sutil e cara de ignorar: um client pode ter
escopo `payments:write` de forma genérica, mas isso não autoriza nenhuma transação
específica sem um consentimento válido, vigente e sobre aquela conta exata. Sistemas que
tratam escopo e consentimento como a mesma coisa — "se o token tem o escopo, pode fazer" —
falham na primeira auditoria regulatória, porque não conseguem provar que o titular
consentiu com **aquela** operação, **naquela** data.

## Ponte para o próximo marco

Tudo até aqui é o **mecanismo**: o protocolo que move código e token entre as partes. Três
perguntas ficam deliberadamente de fora, porque merecem tratamento próprio: **onde a
identidade nasce** (um IdP corporativo, um broker, um provedor SAML legado), **onde a
sessão realmente mora** (no IdP, em cada aplicação que confia nele, ou nos dois) e **o que
o logout de fato encerra**. É o assunto do marco 06.

## Hands-on

**Tutorial — authorization code + PKCE ponta a ponta.** Suba o `fin-idp` e execute o fluxo
completo contra o `pix-gateway`: gere o `code_verifier` e o `code_challenge`, monte a
requisição de autorização, capture o código, troque por token, e **inspecione cada
parâmetro** em cada etapa — `state`, `code_challenge_method`, o `id_token` decodificado, o
`access_token`. O objetivo é ver o protocolo, não só fazer o login funcionar.

```bash
# 1. gere code_verifier (43-128 chars, base64url) e o code_challenge (S256)
CODE_VERIFIER=$(openssl rand -base64 96 | tr -d '=+/\n' | cut -c1-64)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '/+' '_-')
STATE=$(openssl rand -hex 16)

# 2. monte a URL de autorização e abra no navegador (o login é interativo)
echo "http://localhost:9000/oauth2/authorize?response_type=code&client_id=pix-gateway&redirect_uri=http://localhost:8080/callback&scope=openid%20payments:read&state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256"

# 3. depois do login, copie o "code" da query string do redirect e troque por token
AUTH_CODE="<cole o code aqui>"
curl -s -X POST http://localhost:9000/oauth2/token \
  -u "pix-gateway:$(cat client-secret.txt)" \
  -d "grant_type=authorization_code" \
  -d "code=${AUTH_CODE}" \
  -d "redirect_uri=http://localhost:8080/callback" \
  -d "code_verifier=${CODE_VERIFIER}" | jq .

# 4. inspecione o id_token (JWS: header.payload.signature) sem verificar assinatura,
#    só para ler as claims
ID_TOKEN="<cole o id_token da resposta acima>"
echo "$ID_TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | jq .
```

**Desafio — corrigir redirect URI validada por prefixo.** Configure (ou identifique) uma
redirect URI validada por prefixo no `fin-idp`. Demonstre que um path adicional sob esse
prefixo, não previsto, permite exfiltrar o código de autorização para fora do controle do
client legítimo. Corrija para matching exato e prove, com teste, que a URI antiga (com
prefixo) deixa de ser aceita.

Para demonstrar a exfiltração, registre `http://localhost:8080/callback` como prefixo
aceito e tente autorizar com um path adicional que o client não controla:

```bash
curl -i "http://localhost:9000/oauth2/authorize?response_type=code&client_id=pix-gateway&redirect_uri=http://localhost:8080/callback/../../attacker-controlled&scope=openid&state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256"
# com matching por prefixo: 302 para o destino não previsto
# depois da correção (matching exato): 400 invalid_redirect_uri
```

**Invariantes testáveis**

1. Existe um teste que demonstrava a exfiltração via prefixo e que falha (a exploração não
   funciona mais) depois da correção.
2. A redirect URI é comparada byte-a-byte contra o valor registrado — nenhuma lógica de
   prefixo ou wildcard permanece.
3. O fluxo completo com PKCE é executado por um teste automatizado, não só manualmente.
4. `state` é gerado por requisição e verificado no retorno; sua ausência ou reuso é
   rejeitada com teste.

**Complemento.** Implemente a detecção de reuso de refresh token: use um refresh token já
trocado por um novo, e prove que a segunda tentativa não só falha como invalida toda a
família de tokens descendente daquele.

**Checagem**

1. Por que PKCE deveria ser obrigatório mesmo em client confidencial, e não só em client
   público?
2. Qual problema `state` resolve e qual problema `nonce` resolve — e por que um não
   substitui o outro?
3. Por que usar o `id_token` para autorizar uma chamada de API é um erro estrutural, não
   apenas uma prática não recomendada?
4. O que PAR resolve que matching exato de redirect URI, sozinho, não resolve?

## Principais aprendizados

- OAuth2 resolve delegação sem compartilhar credencial; tratá-lo como "jeito de logar" é
  perder o problema que ele existe para resolver.
- Implicit e password grant estão mortos; o que sobrou é authorization code com PKCE
  sempre obrigatório, client credentials e device code.
- `state` protege o redirect contra CSRF; `nonce` protege o `id_token` contra replay — são
  proteções independentes.
- `id_token` é para o client, `access_token` é para o resource server; confundir os dois é
  o erro mais caro do marco, e autenticação não é autorização.
- Redirect URI precisa de matching exato, nunca por prefixo; PAR remove parâmetros
  manipuláveis do front-channel de forma estrutural.
- Escopo é o que o client pode pedir; consentimento é o que o titular autorizou sobre
  dados e prazo específicos — tratar os dois como a mesma coisa falha auditoria.
