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
`@ConfigurationPropertiesScan`). Ganhos: o `@Validated` faz o **contexto falhar no
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

O de cima é o *default*; o de baixo **sobrescreve**. Isso materializa o 12-factor: o
mesmo artefato roda em qualquer lugar, e o ambiente injeta o que muda. Nunca decida
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
como uma propriedade, o formato que Kubernetes *Secrets* montam. Para Vault,
`spring.config.import=vault://secret/pix-gateway`.

A regra inegociável: **segredo nunca entra no repositório nem na imagem**. Credencial
de PSP, chave de assinatura, senha de banco vêm de env var, volume montado ou cofre —
resolvidos em runtime. O código só declara *que* precisa de `pix.psp.api-key`; *de onde*
vem é decisão de deploy.

## Exemplo numa fintech

O **pix-gateway** promove **a mesma imagem** de homologação para produção — auditável,
byte a byte idêntica. Homologação aponta para o *sandbox* do PSP e produção para o
endpoint real, mas isso é só `PIX_PSP_BASE_URL` diferente injetada pelo cluster. Quando
o PSP faz **rotação de credencial**, o operador atualiza o *Secret*; com
`spring.config.import=configtree`, uma reinicialização (ou `@RefreshScope`) pega a nova
chave — **sem redeploy e sem rebuild**. A superfície de auditoria fica limpa: o binário
é sempre o mesmo; só o ambiente muda.

## Principais aprendizados

- Prefira `@ConfigurationProperties` tipadas e `@Validated` a `@Value` espalhado — o
  contexto falha no boot, não em produção.
- **Relaxed binding** deixa a mesma classe ler env, yaml e CLI; a precedência de fontes
  é fixa e o de baixo sobrescreve.
- **Profile** para diferença estrutural; **config externa** para diferença de valor.
  Uma imagem só, promovida entre ambientes (12-factor).
- Segredo fora do repo e da imagem: env var, `configtree` de volume ou Vault via
  `spring.config.import`.
