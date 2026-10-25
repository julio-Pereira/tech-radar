---
id: configuracao-e-perfis
title: "Configuração, perfis e segredos"
summary: "Propriedades tipadas e validadas, precedência de fontes, profiles vs env vars no estilo 12-factor, e segredos fora do repositório."
estimatedMinutes: 30
references:
  - title: "Spring Boot Reference — Externalized Configuration"
    url: https://docs.spring.io/spring-boot/reference/features/external-config.html
  - title: "Spring Boot Reference — Type-safe Configuration Properties"
    url: https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties
  - title: "The Twelve-Factor App — Config"
    url: https://12factor.net/config
---

## Propriedades tipadas, não `@Value` espalhado

`@Value("${...}")` espalhado pelo código é dívida técnica: sem validação, sem
descoberta, sem agrupamento. O padrão senior é **`@ConfigurationProperties` tipadas**,
idealmente como `record` imutável, validadas na subida:

```java
@ConfigurationProperties(prefix = "pix.psp")
@Validated
public record PspProperties(
    @NotBlank String baseUrl,
    @NotNull Duration connectTimeout,
    @NotNull Duration readTimeout,
    @Positive int maxRetries
) {}
```

Ativada com `@EnableConfigurationProperties(PspProperties.class)` (ou
`@ConfigurationPropertiesScan`). As anotações `@NotBlank`/`@Positive` vêm do Bean
Validation, que **não** está no projeto gerado no marco 01 — sem a dependência abaixo, o
código nem compila (`jakarta.validation.constraints` não existe):

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

Ganhos: o `@Validated` faz o **contexto falhar no
boot** se `pix.psp.base-url` estiver ausente — erro no deploy, não numa transação às
23h59. E o **relaxed binding** aceita `PIX_PSP_BASE_URL` (env), `pix.psp.base-url`
(yaml) e `pix.psp.baseUrl` como a mesma chave, então a mesma classe serve para todos
os ambientes.

## Precedência de fontes: quem ganha de quem

O Boot resolve propriedades numa ordem fixa (da menor para a maior prioridade,
simplificada):

1. `application.yaml` empacotado no JAR
2. `application-<profile>.yaml`
3. Variáveis de ambiente do SO
4. Argumentos de linha de comando (`--pix.psp.read-timeout=5s`)

O de cima é o *default*; o de baixo **sobrescreve**. Isso materializa o *12-factor* — o conjunto de
doze práticas para aplicações de nuvem cujo fator III manda guardar a configuração no
ambiente, fora do código: o mesmo artefato roda em qualquer lugar, e o ambiente injeta o que muda. Nunca decida
comportamento com `if (profile == "prod")` no código — deixe a configuração externa
decidir.

## Profiles vs env vars — e o perfil do autor

**Profiles** (`@Profile`, `spring.profiles.active`) trocam *conjuntos* de beans e
arquivos: um `LocalPspClient` fake em `dev`, o real em `prod`. **Env vars** trocam
*valores* de uma mesma configuração. A regra prática:

- Use **profile** para diferença estrutural (bean A ou bean B; um `@Bean` de fila
  in-memory vs Kafka).
- Use **env var / config externa** para diferença de valor (URL, timeout, tamanho de
  pool) — porque o 12-factor pede *uma imagem*, promovida sem recompilar.

O antipadrão comum é um perfil `homolog` e um `prod` com imagens diferentes: perde-se a
garantia de que "o que passou em homolog é exatamente o que sobe". Prefira **a mesma
imagem** parametrizada por ambiente.

## `spring.config.import` e segredos fora do repo

`spring.config.import` puxa configuração externa de forma declarativa —
`spring.config.import=optional:configtree:/etc/secrets/` lê cada arquivo de um volume
como uma propriedade, o formato que Kubernetes *Secrets* montam. Para o HashiCorp
Vault (um cofre de segredos com controle de acesso e auditoria),
`spring.config.import=vault://secret/pix-gateway` — esse prefixo vem do Spring Cloud
Vault, não do Boot.

A regra inegociável: **segredo nunca entra no repositório nem na imagem**. Credencial
de PSP, chave de assinatura, senha de banco vêm de env var, volume montado ou cofre —
resolvidos em runtime. O código só declara *que* precisa de `pix.psp.api-key`; *de onde*
vem é decisão de deploy.

## Exemplo numa fintech

O **pix-gateway** promove **a mesma imagem** de homologação para produção — auditável,
byte a byte idêntica. Homologação aponta para o *sandbox* do PSP e produção para o
endpoint real, mas isso é só `PIX_PSP_BASE_URL` diferente injetada pelo cluster. Quando
o PSP faz **rotação de credencial**, o operador atualiza o *Secret*; com
`spring.config.import=configtree`, uma reinicialização do pod pega a nova chave — **sem
redeploy e sem rebuild**. (Recarregar *sem* reiniciar, com `@RefreshScope`, não é do
Spring Boot: é do **Spring Cloud** (`spring-cloud-context`), outra dependência com
outro ciclo de versões. Para a maioria dos serviços, reiniciar o pod é mais simples e
mais previsível.) A superfície de auditoria fica limpa: o binário
é sempre o mesmo; só o ambiente muda.

## Mão na massa

**Desafio — subir os dois perfis sem recompilar.** Crie `application.yaml` (defaults),
`application-dev.yaml` e `application-prod.yaml` no `pix-gateway`, cada um só com o
que muda (`pix.psp.base-url` apontando para sandbox em `dev`, para o endpoint real em
`prod`). Empacote **uma vez**:

```bash
mvn -DskipTests package
```

Para enxergar qual valor venceu, não use `/actuator/env`: desde o Boot 3 ele **mascara**
todos os valores por padrão (`"value": "******"`) — justamente para não vazar segredo.
Crie um endpoint de diagnóstico que devolve só esta propriedade, que não é sensível:

```java
@RestController
class PspDiagnosticsController {
    private final PspProperties psp;
    PspDiagnosticsController(PspProperties psp) { this.psp = psp; }

    // diagnóstico do exercício: expõe só a URL do PSP, nunca credenciais
    @GetMapping("/diag/psp-base-url")
    String baseUrl() { return psp.baseUrl(); }
}
```

Suba os dois perfis a partir do **mesmo** jar, sem recompilar entre um e outro:

```bash
java -jar target/pix-gateway-0.0.1-SNAPSHOT.jar --spring.profiles.active=dev &
curl localhost:8080/diag/psp-base-url    # mostra o valor de dev

# derrube o processo dev, suba prod
kill %1
java -jar target/pix-gateway-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod &
curl localhost:8080/diag/psp-base-url    # mostra o valor de prod, mesmo jar
```

**Invariante testável.** Sobrescreva um valor por variável de ambiente, sem tocar em
nenhum `.yaml`, e prove que ela vence o perfil (a ordem de precedência do marco):

```bash
PIX_PSP_BASE_URL=http://override.local \
  java -jar target/pix-gateway-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
curl localhost:8080/diag/psp-base-url    # http://override.local, não o de prod.yaml
```

E a validação do início do marco: suba sem nenhum perfil, com `pix.psp.base-url` ausente,
e veja o contexto recusar o boot — `APPLICATION FAILED TO START`, com a mensagem
`must not be blank` apontando para `pix.psp.baseUrl`.

A mesma validação vale nos testes: o `@SpringBootTest` do marco 01 roda sem perfil e
passa a falhar no boot. Dê aos testes um valor próprio em
`src/test/resources/application.properties`:

```properties
pix.psp.base-url=http://localhost:9999
```

O nome diferente é proposital: no classpath de teste, esse arquivo é lido **junto** com o
`application.yaml` de `src/main/resources` (que continua fornecendo os timeouts). Um
`src/test/resources/application.yaml` esconderia o principal.

**Checagem.** (a) Por que a mesma imagem promovida de homolog para prod é mais
auditável que builds separados por ambiente? (b) O que muda se você usar `@Profile`
em vez de uma propriedade para o exemplo acima?

## Principais aprendizados

- Prefira `@ConfigurationProperties` tipadas e `@Validated` a `@Value` espalhado — o
  contexto falha no boot, não em produção.
- **Relaxed binding** deixa a mesma classe ler env, yaml e CLI; a precedência de fontes
  é fixa e o de baixo sobrescreve.
- **Profile** para diferença estrutural; **config externa** para diferença de valor.
  Uma imagem só, promovida entre ambientes (12-factor).
- Segredo fora do repo e da imagem: env var, `configtree` de volume ou Vault via
  `spring.config.import`.
