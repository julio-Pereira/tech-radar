---
id: auto-config
title: "Auto-configuração e Starters — usar e escrever"
summary: "Como o Boot decide o que configurar, como escrever a sua própria auto-configuração e empacotar um starter interno de plataforma — o trabalho típico de tech lead."
estimatedMinutes: 35
references:
  - title: "Spring Boot Reference — Auto-configuration"
    url: https://docs.spring.io/spring-boot/reference/using/auto-configuration.html
  - title: "Spring Boot Reference — Creating Your Own Auto-configuration"
    url: https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html
  - title: "Spring Boot Reference — Creating Your Own Starter"
    url: https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html#features.developing-auto-configuration.custom-starter
---

## O que é auto-configuração (revisão rápida)

A auto-configuração olha para o **classpath**, para os **beans já definidos** e para as
**propriedades** e registra, condicionalmente, os beans que você provavelmente quer. Se
o driver do PostgreSQL está no classpath e existe `spring.datasource.url`, o Boot monta
um `DataSource`. A palavra-chave é **condicional**: cada classe usa `@ConditionalOnClass`,
`@ConditionalOnMissingBean`, `@ConditionalOnProperty`. Regra de ouro — **se você declara
o bean, o Boot recua**.

Para auditar o que foi decidido, suba com `--debug` e leia o **Condition Evaluation
Report**: `positive matches`, `negative matches` e o motivo de cada um. Num ambiente
regulado, explicar *por que* um bean existe é tão importante quanto tê-lo.

## O salto senior: escrever a sua própria auto-configuração

Consumir auto-config é o trabalho de todo dia. O trabalho de tech lead é **produzir**
uma — padronizar logging, segurança e métricas para N squads num único artefato que
"simplesmente funciona" ao entrar no classpath.

Uma auto-configuração é uma `@AutoConfiguration` guardada por condições:

```java
@AutoConfiguration
@ConditionalOnClass(Filter.class)
@ConditionalOnProperty(prefix = "fintech.audit", name = "enabled",
                       havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(AuditProperties.class)
public class AuditAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    CorrelationFilter correlationFilter(AuditProperties props) {
        return new CorrelationFilter(props.headerName());
    }
}
```

O Boot só descobre essa classe se ela estiver listada no arquivo de imports — **não**
via component scan (auto-configs vivem fora do pacote da aplicação de propósito):

```
# src/main/resources/META-INF/spring/
#   org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.acme.fintech.audit.AuditAutoConfiguration
```

Duas boas práticas que separam o brinquedo do artefato de produção:

- **`@ConditionalOnMissingBean` em tudo** — o squad consumidor sempre pode sobrescrever
  o seu default. Você oferece, não impõe.
- **`spring-boot-autoconfigure-processor`** no build — gera metadados de condição em
  compile time, deixando o *Condition Evaluation Report* rápido e completo.

## Um starter interno de plataforma

Um **starter** é uma casca sem código: ele só amarra a auto-configuração + as
dependências transitivas numa coordenada Maven fácil de adicionar. A convenção da
comunidade é `acme-fintech-audit-spring-boot-starter` (o prefixo do produto vem
**antes** de `spring-boot-starter`, que é reservado para os oficiais).

```
acme-fintech-audit-spring-boot-starter   (pom vazio: só depende do autoconfigure)
        └── acme-fintech-audit-autoconfigure  (a @AutoConfiguration + as classes)
```

Um squad passa a ter observabilidade de auditoria padronizada assim:

```xml
<dependency>
  <groupId>com.acme.fintech</groupId>
  <artifactId>acme-fintech-audit-spring-boot-starter</artifactId>
</dependency>
```

Zero configuração no serviço consumidor — e, quando o time de plataforma melhora o
filtro de correlação, todos os squads herdam no próximo bump de versão. É assim que se
propaga compliance por dezenas de serviços sem PR em cada repositório.

## Boot 4.x: o classpath ficou mais explícito

No Boot 4, as auto-configurações foram **divididas em JARs por módulo** em vez de um
`spring-boot-autoconfigure` monolítico. Consequência prática: a auto-config de um
recurso só está disponível se o módulo correspondente estiver no classpath — menos
"beans surgindo do nada", diagnóstico mais direto. Bom para quem escreve starters:
o grafo de dependências que você declara é o que o consumidor realmente carrega.

## Exemplo numa fintech

O **pix-gateway** vai crescer e, com ele, outros serviços do time de pagamentos
(conciliação, antifraude). Todos precisam do **mesmo** cabeçalho de correlação de
auditoria (`X-Correlation-Id`) propagado e registrado — requisito de rastreabilidade
BACEN. Em vez de copiar um `@Component` filtro entre repositórios, o time de plataforma
publica o starter de auditoria: cada serviço ganha o filtro condicionalmente, com o
nome do header configurável por `fintech.audit.header-name`.

## Mão na massa

**Desafio — extrair um `fintech-audit-spring-boot-starter`.**

1. Crie um módulo `autoconfigure` com `AuditAutoConfiguration`, uma
   `@ConfigurationProperties("fintech.audit")` (`enabled`, `headerName`) e um
   `OncePerRequestFilter` que lê/gera o `X-Correlation-Id` e o coloca no MDC do SLF4J.
2. Registre a classe em `AutoConfiguration.imports`.
3. Crie o módulo `starter` (pom só com a dependência para o autoconfigure).
4. Adicione o starter ao pix-gateway e prove com um teste que **toda** resposta traz o
   header e que declarar um `CorrelationFilter` próprio faz o default recuar
   (`@ConditionalOnMissingBean`).

## Principais aprendizados

- Auto-configuração é **condicional** e sempre cede aos seus beans explícitos; o
  *Condition Evaluation Report* é a ferramenta de auditoria.
- Escrever `@AutoConfiguration` + `AutoConfiguration.imports` (não component scan) é o
  que permite padronizar plataforma para muitos squads.
- Um **starter** é a casca que empacota auto-config + dependências numa coordenada
  única; use `@ConditionalOnMissingBean` para oferecer defaults sobrescrevíveis.
- Boot 4.x divide as auto-configs por módulo — classpath mais explícito, diagnóstico
  mais simples.
