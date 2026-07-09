---
id: seguranca-oauth2-fapi
title: "Segurança: OAuth2, OIDC e o mundo FAPI"
summary: "Spring Security 7 sem WebSecurityConfigurerAdapter, resource server JWT, method security, e o degrau Open Finance — FAPI, mTLS e certificate-bound tokens."
estimatedMinutes: 45
references:
  - title: "Spring Security Reference — OAuth2 Resource Server"
    url: https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html
  - title: "FAPI 2.0 Security Profile (OpenID Foundation)"
    url: https://openid.net/specs/fapi-2_0-security-profile.html
  - title: "OWASP API Security Top 10"
    url: https://owasp.org/API-Security/editions/2023/en/0x00-header/
---

## Spring Security 7: o modelo atual

Numa trilha "para fintech", segurança não é apêndice — é o requisito nº 1 do Open
Finance. O Spring Security 7 (que acompanha o Boot 4) consolidou o modelo baseado em
**componentes**: nada de `WebSecurityConfigurerAdapter` (removido), tudo via beans
`SecurityFilterChain` e a lambda DSL:

```java
@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers(HttpMethod.POST, "/payments").hasAuthority("SCOPE_payments:write")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
            .csrf(csrf -> csrf.disable())   // API stateless com JWT; ver marco de segurança
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .build();
    }
}
```

## Resource server: o gateway valida, não emite

O pix-gateway é um **resource server**: ele não faz login de usuário nem emite tokens —
recebe um **JWT** (Bearer) emitido por um *authorization server* (o provedor de
identidade do Open Finance) e o **valida**. Configurar é declarar de onde vêm as chaves:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://auth.openfinance.example.com
```

O Boot busca o JWKS do issuer, valida assinatura, expiração e `issuer`, e transforma os
*scopes* do token em `authorities`. A partir daí, autorização é declarativa.

## Method security: autorização perto da regra

Além das regras por URL, proteja a camada de serviço com `@PreAuthorize` — mais perto da
regra de negócio, imune a alguém adicionar um novo controller que esqueceu a regra:

```java
@PreAuthorize("hasAuthority('SCOPE_payments:write') and #req.amount <= 50000")
public PaymentResponse initiate(PaymentRequest req) { ... }
```

Habilite com `@EnableMethodSecurity`. Defesa em profundidade: URL **e** método.

## O degrau Open Finance: FAPI

Open Banking/Open Finance não aceita OAuth2 "de baunilha". Exige o perfil **FAPI**
(Financial-grade API), que endurece tudo:

- **mTLS (TLS mútuo)** — não só o servidor apresenta certificado; o **cliente** também.
  A identidade da instituição participante é o certificado, emitido pela ICP do
  ecossistema (no Brasil, a estrutura do Open Finance).
- **Certificate-bound access tokens** (RFC 8705) — o token é **amarrado** ao certificado
  do cliente (claim `cnf`/`x5t#S256`). Um token roubado é inútil sem a chave privada do
  certificado: acaba o *bearer token* que qualquer um usa.
- **`private_key_jwt`** — o cliente se autentica assinando um JWT com sua chave privada,
  em vez de um `client_secret` compartilhado.

Você **não** implementa criptografia de FAPI à mão. O Spring Security valida o JWT,
extrai o claim de confirmação e você configura o `WebServerFactory`/ingress para exigir
e repassar o certificado do cliente; o essencial é entender **por que** cada peça existe
— roubo de token e falsificação de identidade são o modelo de ameaça de quem move
dinheiro alheio.

## Actuator como superfície de ataque

Ligar o marco 10 (observabilidade) com este: os endpoints do Actuator são **poderosos** e
por isso perigosos. `env` vaza variáveis (segredos!), `heapdump` despeja a memória,
`loggers` altera comportamento em runtime. Um estudo de caso recorrente são bugs de
**bypass em health groups** — configurações onde `/actuator/health/<group>` acabava
expondo mais do que o pretendido. A lição não é paranoia: é **exponha o mínimo**
(`management.endpoints.web.exposure.include=health,prometheus`), proteja o resto com
autenticação, e trate o Actuator como parte da superfície de ataque que ele é.

## OWASP API Security Top 10 no pix-gateway

Mapeie os riscos ao produto: **BOLA** (Broken Object Level Authorization) — um cliente
consegue ver o pagamento de outro? valide *ownership*, não só autenticação.
**Broken Authentication** — JWT validado corretamente, sem endpoints esquecidos.
**Unrestricted Resource Consumption** — rate limiting (marco 08 ajuda). **Security
Misconfiguration** — o Actuator acima. Cada item é uma pergunta concreta sobre o gateway.

## Exemplo numa fintech

O **pix-gateway** vira resource server: `POST /payments` exige `SCOPE_payments:write`,
consultas exigem `payments:read`, e a regra de *ownership* garante que uma instituição só
enxergue seus próprios pagamentos (defesa contra BOLA). Em produção Open Finance, a
conexão é mTLS e o access token é certificate-bound — o gateway rejeita um token cujo
`cnf` não bate com o certificado apresentado.

## Mão na massa

**Tutorial — proteger o gateway.** Configure o pix-gateway como resource server JWT,
com regras por escopo (`payments:write` no `POST`, `payments:read` nas consultas) e
`@PreAuthorize` na camada de serviço. Escreva testes com `@WithMockJwtAuth`/tokens de
teste verificando: 401 sem token, 403 com escopo errado, 200 com o escopo certo, e que
um usuário não acessa o pagamento de outro.

## Principais aprendizados

- Spring Security 7 usa **`SecurityFilterChain`** (sem `WebSecurityConfigurerAdapter`);
  o gateway é **resource server** que valida JWT, não emite.
- Combine autorização por **URL** e por **método** (`@PreAuthorize`) — defesa em
  profundidade.
- **FAPI** = mTLS + **certificate-bound tokens** + `private_key_jwt`: entenda o modelo de
  ameaça (roubo de token, falsificação de identidade); o Spring faz o trabalho pesado.
- **Actuator é superfície de ataque**: exponha o mínimo. Percorra o **OWASP API Top 10**
  contra o produto, começando por BOLA/ownership.
