---
id: federacao-e-sso
title: "Federação e SSO: o IdP como broker"
summary: "Três identidades, três problemas — workforce, customer, workload. O broker que federa, o SAML que não vai embora, e o logout que quase nunca desloga de verdade."
estimatedMinutes: 60
references:
  - title: "OpenID Connect Back-Channel Logout"
    url: https://openid.net/specs/openid-connect-backchannel-1_0.html
  - title: "Keycloak — Server Administration Guide"
    url: https://www.keycloak.org/documentation
  - title: "SCIM — System for Cross-domain Identity Management"
    url: https://scim.cloud/
---

## Três identidades, três problemas

O erro estrutural que este marco existe para prevenir é tratar toda identidade como a
mesma coisa. Não são: **workforce** é o funcionário, cuja fonte de verdade é o AD
corporativo e cujo ciclo de vida termina — um dia — em desligamento. **Customer** é o
cliente, que se cadastra e **consente**; é o eixo dos marcos 05 e 08, com ciclo de vida
próprio (`consentId`, validade, revogação pelo titular). **Workload** é o serviço, que não
faz login — ele se autentica por `client_credentials`, `private_key_jwt` ou mTLS
(*reencontro:* identidade de workload é o assunto de `kubernetes/10`, não desta trilha).
**Serviço não faz SSO.** Tratar as três no mesmo realm de identidade, pela conveniência de
ter "um lugar só", é o erro que depois não se desfaz sem reescrever o modelo inteiro: cada
uma tem fonte de verdade, ciclo de vida e controle regulatório diferentes, e misturá-las
significa aplicar a política errada a pelo menos uma delas.

## O broker de identidade

Federação introduz um terceiro papel entre o **RP** (Relying Party — a aplicação que
confia) e o **IdP** (Identity Provider — quem autentica de fato): o **broker**. O RP
confia no broker; o broker confia em um ou mais IdPs upstream. Três mecânicas que só
aparecem quando existe broker:

- **Home realm discovery** — como o broker decide para qual IdP upstream rotear o
  titular, tipicamente pelo domínio do e-mail informado.
- **Account linking** — o mesmo humano chegando por dois provedores diferentes (o
  funcionário que também tem conta de cliente) precisa ser reconhecido como a mesma
  identidade, ou o sistema duplica a pessoa.
- **Confiança transitiva** — o RP confia no broker, que confia no IdP do parceiro. Isso
  significa que o RP **herda a política de senha e de MFA do IdP upstream**, gostando ou
  não. Essa herança é a premissa que quase ninguém verifica explicitamente — e ela é
  verificável: as claims `amr` (Authentication Methods References) e `acr`
  (Authentication Context Class Reference) declaram, no próprio token, quais fatores foram
  usados na autenticação original. Um RP que exige MFA para uma operação sensível pode e
  deve checar `amr`, em vez de presumir que "veio do broker" já significa "teve MFA".

## SAML sem romantismo

**SAML** não é um capítulo de história — ele continua vivo em praticamente toda
instituição financeira grande, porque fornecedor, ERP e ferramenta de RH corporativa
seguem falando SAML e não vão migrar no seu cronograma. O modelo: uma **asserção XML
assinada**, entregue via fluxo **SP-initiated** (o serviço inicia, redireciona ao IdP) ou
**IdP-initiated** (o IdP empurra a asserção sem o serviço ter pedido). As armadilhas são
próprias do formato: **XML signature wrapping** (o atacante injeta um elemento XML extra
de forma que o parser processe um nó diferente do que a assinatura efetivamente cobriu),
problemas de **canonicalização** (duas representações XML "equivalentes" que a assinatura
trata de forma inconsistente), e o **parser de XML como superfície de ataque** —
*reencontro* direto do XXE do marco 03, agora no contexto específico de asserção SAML.

A regra prática desta trilha: **não construa integração SAML nova a partir do zero; saiba
conviver com o que existe e migrar quando fizer sentido**. Comparado a OIDC, SAML ganha em
maturidade de adoção corporativa e perde em simplicidade de implementação e em superfície
de ataque (JSON sobre HTTP é uma superfície bem menor que XML assinado).

## Onde a sessão mora de verdade

A pergunta que a federação torna real, e que um SSO de provedor único esconde: **onde a
sessão mora?** Existe a sessão no **IdP** (ou no broker) e existe uma sessão **em cada RP**
que o titular visitou durante aquele login único. Essas sessões são independentes na
prática, o que produz uma assimetria incômoda: "eu fiz logout" pode ser **falso** — o
titular encerrou a sessão de um RP, mas a sessão no IdP e em outros RPs continua ativa.
Os parâmetros que dão controle fino sobre isso: `max_age` (força reautenticação se a
sessão no IdP for mais velha que N segundos), `prompt=login` (força reautenticação
incondicional) e `id_token_hint` (identifica a sessão específica num logout). E uma
distinção que evita confusão de vocabulário com o marco 08: **reautenticação para uma
operação sensível é step-up, não um "login novo"** — o titular já está identificado; o que
se exige é uma prova adicional para aquela ação específica.

## Logout que funciona

**RP-initiated logout** é o titular pedindo para sair a partir de um RP específico. Isso
sozinho não encerra nada nos outros RPs. **Back-channel logout** resolve isso: o IdP
notifica **cada RP**, diretamente, servidor a servidor, com um **logout token** assinado —
e o RP precisa **de fato processar esse token e invalidar a sessão local**, não apenas
recebê-lo. **Front-channel logout** (via iframe no navegador do titular) é a alternativa
mais antiga, e **quebra estruturalmente quando o navegador bloqueia cookie de terceiro** —
o que hoje é o padrão, não a exceção.

O ponto mais duro do marco, e o que mais separa quem entende sessão de quem só configurou
um exemplo: **logout não revoga um token por valor**. Um `access_token` JWS continua
criptograficamente válido até `exp`, esteja o titular deslogado ou não — o logout encerra
a *sessão de navegador*, não o token já emitido. Isso não é um bug a corrigir; é uma
**consequência de projeto que precisa ser decidida explicitamente**: ou o TTL do access
token é curto o bastante para a janela de exposição ser aceitável (com refresh token para
renovar), ou o resource server usa introspecção — *reencontro* direto do trade-off entre
token por referência e por valor do marco 04. Escolher entre essas duas respostas, e
**declarar a janela de exposição resultante em um número**, é a decisão de engenharia real
deste marco — "implementamos back-channel logout" sozinho não diz nada sobre quanto tempo
um token roubado antes do logout continua valendo.

## Provisionamento e — principalmente — desprovisionamento

**SCIM** (System for Cross-domain Identity Management) padroniza como contas são criadas,
atualizadas e desativadas entre sistemas. **JIT provisioning** (Just-In-Time) cria a conta
local no primeiro login federado, sem cadastro prévio. O lado que mais importa numa
auditoria não é provisionar — é **desprovisionar**: o funcionário desligado que continua
conseguindo entrar é, de forma consistente, **o achado de auditoria mais comum que
existe**, porque desligamento no RH raramente dispara desativação automática em todo
sistema federado. Esse ponto tem ponte direta com a revisão periódica de acesso do
marco 16 — é o mesmo problema, visto do lado do controle preventivo (SCIM automatizado) e
do lado do controle detectivo (revisão periódica que pega o que escapou).

## Keycloak na prática

Este é o único marco da trilha que sobe um **Keycloak**: realm, client, identity provider
e mappers de claim que traduzem atributo do IdP upstream em claim do token emitido pelo
broker. Keycloak resolve bem o que ninguém deveria escrever à mão — protocolo de
federação, integração LDAP/AD, administração de usuário — e **não deve receber** a
responsabilidade que não é dele: **autorização de domínio** continua sendo decisão do
`fin-idp`/`pix-gateway`, não do broker. *Reencontro* direto do marco 08: a claim de papel
que chega via Keycloak é **entrada** da decisão de autorização, nunca a decisão em si.

## Exemplo numa fintech

Um operador de backoffice entra pelo AD corporativo, através do broker, e recebe um token
com uma claim de papel (`role: operador-senior`, por exemplo). Essa claim **não pode ser a
fonte de autorização do `pix-gateway`** — ela é um dado de entrada que a matriz do marco 08
consome, sujeito à mesma verificação de qualquer outro atributo. Um fornecedor
terceirizado com acesso por prazo determinado é outro caso concreto: o prazo precisa estar
no provisionamento (SCIM com data de expiração), não numa planilha que alguém lembra de
consultar. E a segregação entre identidade de funcionário e identidade de cliente é
inegociável: nenhum caminho de federação deveria permitir que uma credencial workforce
autentique como se fosse customer, ou vice-versa.

## Hands-on

**Tutorial — o broker.** Suba um Keycloak no `fin-platform`, crie um realm
`fin-workforce`, federe-o a um IdP upstream simulado (um segundo realm Keycloak funciona
como estande-in), registre o backoffice do `pix-gateway` como RP, mapeie a claim de papel
do upstream para uma claim do token do broker, e execute o login ponta a ponta,
inspecionando o `id_token` recebido — em particular `amr`/`acr` e a claim de papel
mapeada.

**Desafio — o logout que realmente desloga.** Implemente back-channel logout no RP:
receba e processe o logout token do Keycloak, invalidando a sessão local. Declare por
escrito a estratégia de revogação do access token (TTL curto com refresh, ou
introspecção), com a **janela de exposição em número**.

**Invariantes testáveis**

1. Logout iniciado no IdP encerra a sessão do RP **sem** o usuário passar pelo RP
   (back-channel funcionando de fato, não apenas configurado).
2. Um access token emitido **antes** do logout deixa de ser aceito dentro da janela
   declarada — e existe um teste que **mede** essa janela, não apenas afirma o valor.
3. Um usuário removido no IdP upstream perde acesso no ciclo seguinte de sincronização, e
   isso gera um registro no log de segurança (marco 15).
4. Uma claim de papel forjada num token (alterada sem re-assinar) não muda o resultado da
   decisão de autorização — a verificação de assinatura do marco 04 continua sendo a
   primeira linha de defesa, mesmo com federação no meio.

**Complemento.** Troque o IdP upstream simulado por um provedor SAML (o próprio Keycloak
consegue atuar como IdP SAML) e configure o broker para traduzir SAML → OIDC. Observe
explicitamente o que se perde na tradução — tipicamente, granularidade de claim e
mecanismo de logout.

**Checagem**

1. Por que tratar identidade workforce, customer e workload no mesmo realm é um erro que
   não se desfaz facilmente depois?
2. O que a claim `amr` permite verificar que "o login veio do broker" sozinho não garante?
3. Por que "o usuário clicou em sair" não significa que o token de acesso emitido antes
   disso deixou de funcionar?
4. Qual é o achado de auditoria mais comum relacionado a identidade federada, e por que
   SCIM automatizado ajuda a evitá-lo?

## Principais aprendizados

- Workforce, customer e workload são três identidades com fontes de verdade e ciclos de
  vida diferentes; serviço não faz SSO, e misturar os três realms é um erro estrutural.
- Um broker introduz confiança transitiva: o RP herda a política de senha e MFA do IdP
  upstream, e `amr`/`acr` são o jeito de verificar isso em vez de presumir.
- SAML continua vivo em toda instituição financeira grande; a regra é conviver e migrar,
  não reconstruir — e suas armadilhas (XML signature wrapping, canonicalização) reencontram
  o XXE do marco 03.
- Sessão no IdP e sessão em cada RP são independentes; "fiz logout" pode ser falso sem
  back-channel logout implementado e processado de verdade pelo RP.
- Logout não revoga token por valor — a janela de exposição precisa ser uma decisão
  explícita (TTL curto ou introspecção) e um número declarado, não um detalhe implícito.
- O achado de auditoria mais comum é o desligado que continua entrando; SCIM e
  desprovisionamento automatizado são a defesa estrutural, não a revisão manual.
