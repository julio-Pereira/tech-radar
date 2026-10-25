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
`SecurityFilterChain` e a lambda DSL. No Boot 4, o starter do resource server tem nome
novo:

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security-oauth2-resource-server</artifactId>
</dependency>
```

```java
@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health/**", "/actuator/prometheus").permitAll() // marco 10
                .requestMatchers(HttpMethod.POST, "/payments").hasAuthority("SCOPE_payments:write")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
            .csrf(csrf -> csrf.disable())   // seguro aqui: o token vai no header, não em cookie
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .build();
    }
}
```

Desligar CSRF assusta, então vale o porquê. O ataque de CSRF depende de o **navegador
anexar sozinho** a credencial a uma requisição forjada por outro site — e o navegador só
faz isso com cookies. O pix-gateway não usa cookie nem sessão: a credencial é um
`Authorization: Bearer` que o cliente precisa colocar explicitamente em cada chamada, e
que um site malicioso não consegue anexar. Sem credencial automática, não há o que
forjar. No dia em que a API aceitar sessão por cookie, o CSRF volta a ser obrigatório.

As duas URLs liberadas no `permitAll` são as que o Kubernetes (probes) e o Prometheus
(coleta) chamam sem token — o marco 10 as usa. O `/**` importa: só
`"/actuator/health"` deixaria `/actuator/health/liveness` e `/readiness` atrás de
autenticação, e as probes receberiam `401`. Liberar `/actuator/prometheus` sem token só
é aceitável se ele não for alcançável de fora do cluster: o ingress publica apenas as
rotas da API (ou o Actuator vai para uma `management.server.port` que não é publicada).

## Resource server: o gateway valida, não emite

O pix-gateway é um **resource server**: ele não faz login de usuário nem emite tokens —
recebe um **JWT** (*JSON Web Token*: um JSON assinado que diz quem é o cliente, o que ele
pode fazer e até quando), enviado como *Bearer token* no header `Authorization` e emitido
por um *authorization server* (o provedor de identidade do Open Finance), e o
**valida**. Configurar é declarar de onde vêm as chaves:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://auth.openfinance.example.com
```

O Boot busca o JWKS do issuer (o conjunto de chaves públicas que ele publica para quem
precisa verificar suas assinaturas), valida assinatura, expiração e `issuer`, e
transforma os *scopes* do token — as permissões que ele carrega, como `payments:write` —
em `authorities`, o nome que o Spring Security dá às permissões. A partir daí, autorização é declarativa. A busca é
preguiçosa — acontece na primeira requisição com token, não no boot —, mas a
propriedade é obrigatória: sem ela (ou outra fonte de chaves), o contexto não sobe por
falta de um bean `JwtDecoder`.

## Method security: autorização perto da regra

Além das regras por URL, proteja a camada de serviço com `@PreAuthorize` — mais perto da
regra de negócio, imune a alguém adicionar um novo controller que esqueceu a regra:

```java
@PreAuthorize("hasAuthority('SCOPE_payments:write') and #req.amount <= 50000")
public PaymentResponse initiate(PaymentRequest req) { ... }
```

Habilite com `@EnableMethodSecurity`. Defesa em profundidade: URL **e** método. O
`#req.amount` funciona com o `record` e o `BigDecimal` do pix-gateway: a SpEL lê o
componente do record e compara o `BigDecimal` numericamente (`50000.00` passa,
`50000.01` é negado com `AuthorizationDeniedException`).

## O degrau Open Finance: FAPI

Open Banking/Open Finance não aceita OAuth2 "de baunilha". Exige o perfil **FAPI**
(Financial-grade API), que endurece tudo:

- No **mTLS** (TLS mútuo), não só o servidor apresenta certificado: o **cliente** também.
  A identidade da instituição participante é o certificado, emitido pela ICP
  (infraestrutura de chaves públicas) do ecossistema — no Brasil, a do Open Finance.
- Os **certificate-bound access tokens** (RFC 8705) ficam **amarrados** ao certificado do
  cliente: o token traz no *claim* (campo) `cnf` o hash do certificado (`x5t#S256`). Um
  token roubado é inútil sem a chave privada daquele certificado — acaba o *bearer
  token* que qualquer um que o tenha pode usar.
- Com **`private_key_jwt`**, o cliente se autentica no authorization server assinando um
  JWT com sua chave privada, em vez de enviar um `client_secret` compartilhado.

Você **não** implementa criptografia de FAPI à mão. O Spring Security valida o JWT,
extrai o claim de confirmação e você configura o `WebServerFactory`/ingress para exigir
e repassar o certificado do cliente; o essencial é entender **por que** cada peça existe
— roubo de token e falsificação de identidade são o modelo de ameaça de quem move
dinheiro alheio.

> **Reencontro adiante — `seguranca-aplicacao/07`.** Os requisitos do FAPI que mais pegam na prática, o token *sender-constrained* e o
> mTLS de verdade, do lado de quem configura o servidor de autorização. Os fluxos OAuth2 e
> OIDC por baixo estão em `seguranca-aplicacao/05`, e a cripto-agilidade — inclusive a
> transição para algoritmos pós-quânticos — em `seguranca-aplicacao/09`.

## Actuator como superfície de ataque

Ligar o marco 10 (observabilidade) com este: os endpoints do Actuator são **poderosos** e
por isso perigosos. `env` vaza variáveis (segredos!), `heapdump` despeja a memória,
`loggers` altera comportamento em runtime. Um estudo de caso recorrente são bugs de
**bypass em health groups** — configurações onde `/actuator/health/<group>` acabava
expondo mais do que o pretendido. A lição não é paranoia: é **exponha o mínimo**
(`management.endpoints.web.exposure.include=health,prometheus`), proteja o resto com
autenticação, e trate o Actuator como parte da superfície de ataque que ele é.

## OWASP API Security Top 10 no pix-gateway

Mapeie os riscos ao produto, um por um, como perguntas concretas sobre o gateway:

- **BOLA** (*Broken Object Level Authorization*): um cliente consegue ver o pagamento de
  outro trocando o id na URL? Valide que o pagamento pertence a quem pede (*ownership*),
  não só que o token é válido.
- **Broken Authentication**: todo endpoint valida o JWT, ou sobrou algum esquecido fora
  da `SecurityFilterChain`?
- **Unrestricted Resource Consumption**: um cliente consegue disparar requisições sem
  limite? Isso pede limite de taxa por cliente (no gateway de API ou na aplicação); o
  bulkhead do marco 08 protege as dependências, não a sua porta de entrada.
- **Security Misconfiguration**: o Actuator está exposto como na seção acima?

## A negativa também deixa rastro

Uma auditoria não pergunta só "quem pagou"; pergunta também "quem **tentou** e foi barrado".
O Spring Security publica um evento a cada negativa, e um listener transforma isso num
log de auditoria com o id de correlação do marco 02 — que já está no MDC, porque o filtro
de correlação roda antes da segurança:

```java
@Component
class SecurityAuditListener {
    private static final Logger audit = LoggerFactory.getLogger("AUDIT");

    @EventListener
    void denied(AuthorizationDeniedEvent<?> event) {      // 401 sem token, 403 com escopo errado
        audit.warn("acesso negado principal={} correlationId={}",
                event.getAuthentication().get().getName(), MDC.get("correlationId"));
    }

    @EventListener
    void authenticationFailed(AbstractAuthenticationFailureEvent event) {   // token inválido ou expirado
        audit.warn("autenticação falhou motivo=\"{}\" correlationId={}",
                event.getException().getMessage(), MDC.get("correlationId"));
    }
}
```

São dois eventos porque são duas falhas diferentes. Um token **inválido ou expirado** nem
chega a virar identidade: é uma falha de autenticação. Uma requisição **sem token** ou com
**escopo errado** tem identidade (anônima, no primeiro caso) e é negada na autorização.
Um logger dedicado (`AUDIT`) permite mandar esse fluxo para um destino separado e
retido por mais tempo que o log da aplicação.

## Exemplo numa fintech

O **pix-gateway** vira resource server: `POST /payments` exige `SCOPE_payments:write`,
consultas exigem `payments:read`, e a regra de *ownership* garante que uma instituição só
enxergue seus próprios pagamentos (defesa contra BOLA). Em produção Open Finance, a
conexão é mTLS e o access token é certificate-bound — o gateway rejeita um token cujo
`cnf` não bate com o certificado apresentado.

## Mão na massa

**Pré-requisito do estado do pix-gateway:** o do marco 08: cliente do PSP com timeout, `@Retry` com fallback e `@CircuitBreaker`.

**Tutorial — proteger o gateway.** Configure o pix-gateway como resource server JWT,
com regras por escopo (`payments:write` no `POST`, `payments:read` nas consultas) e
`@PreAuthorize` na camada de serviço. Escreva testes simulando o JWT com o
`RequestPostProcessor` `jwt()` do `spring-security-test` — nada de lib de terceiros; no
Boot 4 ele chega pelo starter de teste da segurança:

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security-test</artifactId>
  <scope>test</scope>
</dependency>
```

Verifique: 401 sem token, 403 com escopo errado, 201 com o escopo certo (o status que o
controller devolve desde o marco 06), e que um usuário não acessa o pagamento de outro.
Um teste de fatia basta — `@WebMvcTest` sobe só o controller e a segurança, com o
service trocado por um mock:

```java
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@WebMvcTest(PaymentController.class)   // org.springframework.boot.webmvc.test.autoconfigure
@Import(SecurityConfig.class)
class PaymentSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean PaymentInitiationService service;
    String paymentJson = "{\"amount\": 100.00}";

    @Test
    void initiate_withCorrectScope_returns201() throws Exception {
        when(service.initiate(any(), any())).thenReturn(new PaymentResponse(UUID.randomUUID(), "INITIATED"));
        mvc.perform(post("/payments")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(jwt().jwt(j -> j.claim("scope", "payments:write")))
                .contentType(MediaType.APPLICATION_JSON)
                .content(paymentJson))
            .andExpect(status().isCreated());
    }

    @Test
    void initiate_withWrongScope_returns403() throws Exception {
        mvc.perform(post("/payments")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .with(jwt())   // token válido, mas o jwt() padrão só traz o escopo "read"
                .contentType(MediaType.APPLICATION_JSON)
                .content(paymentJson))
            .andExpect(status().isForbidden());
    }

    @Test
    void initiate_withoutToken_returns401() throws Exception {
        mvc.perform(post("/payments")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(paymentJson))
            .andExpect(status().isUnauthorized());
    }
}
```

Com a segurança ligada, os testes `@SpringBootTest` dos marcos anteriores que chamam
`/payments` sem token passam a receber `401`. O de correlação do marco 02 continua verde
— o filtro roda antes da segurança, e a resposta `401` também sai com o header. Os que
precisam chegar ao controller ganham `.with(jwt().jwt(j -> j.claim("scope",
"payments:write")))`.

O `@PreAuthorize` também alcança quem chama o service **direto**, como o teste de replay
do marco 06: sem autenticação, ele falha com `AuthenticationCredentialsNotFoundException`.
Anote o teste com `@WithMockUser(authorities = "SCOPE_payments:write")` e, como ele
dispara as chamadas em outras threads, leve o contexto junto — o `SecurityContext` é
guardado por thread:

```java
pool.submit(new DelegatingSecurityContextCallable<>(call));
```

**Invariantes testáveis.** Com o `SecurityAuditListener` registrado, um teste
`@SpringBootTest` com `MockMvc` e um `JwtDecoder` de teste (chave RSA gerada no próprio
teste, como o `DrillJwtConfig` do marco 12) envia três requisições a `POST /payments`:

| Requisição | Status | Linha no logger `AUDIT` |
| --- | --- | --- |
| sem token | `401` | `acesso negado principal=anonymousUser correlationId=...` |
| token com `payments:read` | `403` | `acesso negado principal=<sub do token> correlationId=...` |
| token expirado | `401` | `autenticação falhou motivo="... Jwt expired at ..." correlationId=...` |

Cada linha traz o mesmo id de correlação que voltou no header da resposta.

## Principais aprendizados

- Spring Security 7 usa **`SecurityFilterChain`** (sem `WebSecurityConfigurerAdapter`);
  o gateway é **resource server** que valida JWT, não emite.
- Combine autorização por **URL** e por **método** (`@PreAuthorize`) — defesa em
  profundidade.
- **FAPI** = mTLS + **certificate-bound tokens** + `private_key_jwt`: entenda o modelo de
  ameaça (roubo de token, falsificação de identidade); o Spring faz o trabalho pesado.
- Toda negativa vira evento: `AuthorizationDeniedEvent` (sem token, escopo errado) e
  `AbstractAuthenticationFailureEvent` (token inválido ou expirado). Um listener as leva
  para um log de auditoria com o id de correlação.
- **Actuator é superfície de ataque**: exponha o mínimo. Percorra o **OWASP API Top 10**
  contra o produto, começando por BOLA/ownership.
