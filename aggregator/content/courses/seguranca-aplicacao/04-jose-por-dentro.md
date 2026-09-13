---
id: jose-por-dentro
title: "JOSE por dentro: JWS, JWE, JWK"
summary: "JWT não é formato, é payload dentro de JWS ou JWE — e as falhas clássicas de validação, todas reais, todas documentadas, todas evitáveis. Marco crítico: quiz estendido."
estimatedMinutes: 60
references:
  - title: "RFC 7519 — JSON Web Token (JWT)"
    url: https://datatracker.ietf.org/doc/html/rfc7519
  - title: "RFC 7515 — JSON Web Signature (JWS)"
    url: https://datatracker.ietf.org/doc/html/rfc7515
  - title: "Auth0 — Critical Vulnerabilities in JSON Web Token Libraries"
    url: https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/
---

## JWT não é um formato

A confusão mais comum sobre JWT começa no nome: JWT (JSON Web Token) não é, por si só, um
formato de serialização — é um **payload** JSON, empacotado dentro de um envelope **JOSE**
(JSON Object Signing and Encryption). Esse envelope é **JWS** (JSON Web Signature, quando
o payload é assinado) ou **JWE** (JSON Web Encryption, quando é cifrado). Na prática de
mercado, "JWT" quase sempre significa JWS — um payload **assinado, mas não cifrado**, e
por isso **legível por qualquer um** que rode o base64url através de um decodificador.
Essa única frase, entendida de verdade, já elimina uma classe inteira de erro de design:
ninguém deveria colocar dado sensível dentro de um JWS pensando que ele está protegido —
ele está **íntegro** (ninguém alterou sem invalidar a assinatura), não **confidencial**.

## As falhas clássicas de validação

A lista a seguir não é hipotética — cada item já foi uma CVE real, em bibliotecas usadas em
produção, em mais de um ecossistema:

- **`alg: none`.** O cabeçalho do JWS declara o algoritmo. Se a implementação confia
  cegamente nesse campo, um atacante manda `"alg": "none"` e uma assinatura vazia — e
  algumas bibliotecas antigas aceitavam isso como "sem assinatura para verificar", em vez
  de rejeitar.
- **Confusão de algoritmo (RS256 → HS256).** O servidor espera um token assinado com a
  chave privada RSA do emissor (RS256, assimétrico) e verifica com a chave pública. Se a
  implementação de verificação usa o `alg` **do token recebido** para decidir o algoritmo,
  um atacante pode enviar um token assinado com HS256 (simétrico) **usando a chave pública
  RSA, que é conhecida, como se fosse o segredo HMAC**. A verificação "confirma" a
  assinatura porque, matematicamente, ela confere — o servidor nunca deveria ter deixado o
  token escolher o algoritmo de verificação.
- **`jku`/`x5u` apontando para host do atacante.** Esses cabeçalhos dizem "busque a chave
  pública de verificação nesta URL". Se a implementação busca sem restringir a lista de
  hosts confiáveis, o atacante hospeda a própria chave pública e assina o próprio token
  com ela — a verificação passa porque usa exatamente a chave que o atacante forneceu.
- **`kid` como vetor de path traversal ou injeção de SQL.** O `kid` (key ID) identifica
  qual chave usar entre várias publicadas. Se o backend usa esse valor para montar um
  caminho de arquivo ou uma query sem sanitizar, o `kid` vira `../../etc/passwd` ou um
  fragmento SQL — a mesma classe de `03-entrada-nao-confiavel`, aqui disfarçada de campo
  de protocolo.
- **Assinatura verificada depois de confiar no conteúdo.** O erro de sequência: o código lê
  claims do payload, toma decisão, e só **depois** verifica a assinatura — ou verifica em
  um caminho e usa em outro. Se existe qualquer jeito de o payload ser lido antes da
  verificação, a assinatura não está protegendo nada.

## JWKS na prática

**JWKS** (JSON Web Key Set) é o documento publicado pelo emissor com as chaves públicas de
verificação, cada uma identificada por um `kid`. Na prática, três decisões operacionais
importam mais do que o formato em si: **onde publicar** (endpoint estável, o mesmo do
`spring-boot/09` conhece como resource server), **cache com TTL sensato** (buscar a cada
requisição é lento; nunca atualizar é perigoso quando a chave é rotacionada) e, a mais
esquecida, **rotação sem invalidar token em voo**. A técnica padrão é publicar **duas
chaves simultaneamente** no JWKS — a antiga e a nova —, cada uma com seu `kid`, enquanto
tokens assinados com a antiga ainda não expiraram. O verificador lê o `kid` do token
recebido e escolhe a chave correspondente no JWKS; nenhum token em voo quebra. Esse é
exatamente o padrão que volta, com mais detalhe operacional, no marco 10.

## As claims não são opcionais

Um JWS validado (assinatura íntegra, algoritmo correto, chave certa) ainda pode ser um
token que **não deveria ser aceito ali**. As claims que fecham essa lacuna:

- **`iss`** (issuer) — quem emitiu. Sem validar, um token de outro emissor confiável para
  outro propósito pode ser aceito.
- **`aud`** (audience) — para quem o token vale. **Validar `aud` é o que impede um token
  emitido para o serviço A de valer no serviço B** — sem essa checagem, qualquer serviço
  que confie no mesmo emissor aceita token de qualquer outro serviço daquele emissor.
- **`exp`/`nbf`** (expiration / not-before) — a janela de validade temporal. A validação
  precisa de **tolerância de relógio** (alguns segundos de `leeway`) — *reencontro:* o
  clock skew de `dados-distribuidos/01` não é só um problema de ordenar lançamento, é
  também o motivo de dois hosts discordarem sobre se um token já expirou.
- **`jti`** (JWT ID) — identificador único do token, usado para detectar replay quando o
  protocolo exige token de uso único (o mesmo padrão reaparece na verificação de webhook
  do marco 09).

Cada uma dessas claims, deixada de validar, é uma classe de ataque silenciosa — nenhuma
delas produz um erro de assinatura, porque a assinatura nunca foi o problema.

## Quando JWE importa de verdade

Se JWS não protege confidencialidade, quando usar **JWE** (o payload cifrado)? A resposta
honesta: quando o payload precisa **atravessar um intermediário não confiável** que não
deveria conseguir ler o conteúdo — por exemplo, um token que passa por um proxy de terceiro
antes de chegar ao destino final. Fora desse cenário específico, a resposta mais comum e
mais barata é melhor do que cifrar: **não coloque dado sensível no token**. Um token
minimalista (identificador de sujeito, escopo, claims de controle) resolve o mesmo
problema sem o custo operacional de mais um par de chaves para gerenciar.

## Token por referência × por valor

Um token **por valor** (o JWS que carrega as claims) não precisa de consulta ao emissor
para ser validado — o custo é que **revogar antes da expiração é estruturalmente difícil**:
o token continua criptograficamente válido até expirar, a menos que exista uma lista de
revogação consultada à parte. Um token **opaco** (por referência) exige **introspecção** —
uma chamada ao authorization server a cada validação — mas revogação é imediata: o
authorization server simplesmente para de reconhecer o token. O trade-off é revogação
contra escala (uma chamada de rede a mais por requisição validada), e fintech costuma
aceitar esse custo: a capacidade de revogar um token comprometido **agora**, não apenas no
seu vencimento natural, pesa mais do que a latência extra.

## Exemplo numa fintech

O Open Finance Brasil vai além de assinar só o token de acesso: o **request object**
assinado é o **pedido de autorização inteiro** — não apenas "aqui está meu token", mas "eu,
cliente, assino este pedido específico de consentimento, com estes parâmetros exatos,
verificável por qualquer parte". Isso fecha uma lacuna que token por si só não fecha: sem
o request object assinado, um intermediário poderia alterar parâmetros do pedido de
autorização (o valor solicitado, o escopo) entre o cliente e o authorization server, sem
que a assinatura do token final revelasse a alteração — porque o token assina o resultado,
não a intenção original.

## Hands-on

**Tutorial — validar um JWS na mão.** Sem usar biblioteca de JWT, escreva o código que: (1)
separa header, payload e assinatura pelos pontos; (2) decodifica header e payload de
base64url; (3) busca a chave correspondente ao `kid` do header no JWKS publicado pelo
`fin-idp`; (4) recalcula a assinatura sobre `header.payload` com o algoritmo **declarado no
JWKS para aquele `kid`, nunca o algoritmo do token recebido**; (5) compara em tempo
constante. Ver cada passo manualmente é o que torna as falhas da seção anterior concretas
em vez de abstratas.

**Desafio — rejeitar 6 tokens maliciosos.** Construa uma bateria de tokens de teste:
`alg: none`; algoritmo confundido (RS256 → HS256 usando a chave pública como segredo);
`kid` com path traversal; `aud` incorreta; `exp` vencida; assinatura válida, mas de outra
chave. A validação do `fin-idp`/`pix-gateway` precisa rejeitar todos os seis.

**Invariantes testáveis**

1. Um teste parametrizado cobre os 6 tokens maliciosos e um token legítimo — 6 rejeições,
   1 aceite.
2. A escolha do algoritmo de verificação vem da configuração do verificador ou do JWKS,
   nunca do campo `alg` do token recebido.
3. O `kid` recebido é validado contra uma lista de chaves conhecidas antes de qualquer uso
   em caminho de arquivo ou query.
4. `aud`, `iss`, `exp` e `nbf` são todos verificados, com tolerância de relógio
   documentada em segundos.

**Complemento.** Publique duas chaves simultaneamente no JWKS do `fin-idp` (dois `kid`
diferentes) e emita um token com cada uma. Prove que ambos são aceitos ao mesmo tempo —
essa é a mecânica exata que sustenta a rotação sem downtime do marco 10.

**Checagem**

1. Por que um JWS não deve conter dado sensível, mesmo sendo assinado corretamente?
2. Como funciona o ataque de confusão de algoritmo RS256 → HS256, e o que a implementação
   de verificação precisa fazer para não ser vulnerável a ele?
3. O que a claim `aud` impede especificamente, e o que acontece se ela não for validada?
4. Quando faz sentido pagar o custo de introspecção de um token opaco em vez de validar um
   JWS localmente?

## Principais aprendizados

- JWT não é um formato — é um payload dentro de JWS (assinado, legível por qualquer um) ou
  JWE (cifrado); a maioria do que o mercado chama de "JWT" é JWS.
- As falhas clássicas de validação (`alg: none`, confusão de algoritmo, `jku`/`x5u`
  maliciosos, `kid` como vetor de injeção, ordem de verificação errada) são todas reais,
  documentadas e evitáveis com a disciplina certa de implementação.
- JWKS com duas chaves publicadas simultaneamente, coordenadas por `kid`, é o padrão que
  permite rotacionar a chave de assinatura sem invalidar token em voo.
- `iss`, `aud`, `exp`/`nbf` e `jti` não são opcionais — cada uma fecha uma classe de ataque
  que a assinatura sozinha não fecha.
- Token por valor e por referência trocam revogação por escala; fintech costuma aceitar o
  custo da introspecção pela capacidade de revogar imediatamente.
