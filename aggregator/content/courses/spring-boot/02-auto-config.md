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

**Desafio — extrair um `fintech-audit-spring-boot-starter`.** Um reator Maven de 2
módulos, num diretório `fintech-audit-starter/` ao lado do `pix-gateway`:

`fintech-audit-starter/pom.xml` (parent, packaging `pom`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.fintech</groupId>
    <artifactId>fintech-audit-starter-build</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <packaging>pom</packaging>
    <properties>
        <maven.compiler.release>17</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <spring-boot.version>4.1.0</spring-boot.version>
    </properties>
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring-boot.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    <build>
        <pluginManagement>
            <plugins>
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-surefire-plugin</artifactId>
                    <version>3.5.2</version>
                </plugin>
            </plugins>
        </pluginManagement>
    </build>
    <modules>
        <module>fintech-audit-autoconfigure</module>
        <module>fintech-audit-spring-boot-starter</module>
    </modules>
</project>
```

> **Por que o `pluginManagement` do surefire está aí:** sem ele, o Maven usa a versão
> default antiga do surefire, que não roda testes JUnit 5 — os testes "passam" com
> `Tests run: 0`, silenciosamente. Pegamos esse bug ao vivo. Não pule esse bloco.

`fintech-audit-starter/fintech-audit-autoconfigure/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.fintech</groupId>
        <artifactId>fintech-audit-starter-build</artifactId>
        <version>0.0.1-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>
    <artifactId>fintech-audit-autoconfigure</artifactId>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-autoconfigure</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-web</artifactId>
        </dependency>
        <dependency>
            <groupId>jakarta.servlet</groupId>
            <artifactId>jakarta.servlet-api</artifactId>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
```

`AuditProperties.java` (record com defaults via `@DefaultValue` — o jeito idiomático
de dar default a um record de configuração no Boot):

```java
package com.fintech.audit.autoconfigure;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("fintech.audit")
public record AuditProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("X-Correlation-Id") String headerName) {
}
```

`CorrelationFilter.java`:

```java
package com.fintech.audit.autoconfigure;

import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

public class CorrelationFilter extends OncePerRequestFilter {
    private static final String MDC_KEY = "correlationId";
    private final String headerName;

    public CorrelationFilter(String headerName) { this.headerName = headerName; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String correlationId = request.getHeader(headerName);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }
        response.setHeader(headerName, correlationId);
        MDC.put(MDC_KEY, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
```

`AuditAutoConfiguration.java`:

```java
package com.fintech.audit.autoconfigure;

import jakarta.servlet.Filter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(Filter.class)
@ConditionalOnProperty(prefix = "fintech.audit", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(AuditProperties.class)
public class AuditAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    CorrelationFilter correlationFilter(AuditProperties props) {
        return new CorrelationFilter(props.headerName());
    }
}
```

`src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
(o Boot só descobre a classe por este arquivo — nunca por component scan):

```
com.fintech.audit.autoconfigure.AuditAutoConfiguration
```

Teste da auto-configuração, com `ApplicationContextRunner` (a ferramenta certa para
testar auto-config isolada, sem subir um Boot app inteiro):

```java
package com.fintech.audit.autoconfigure;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class AuditAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(AuditAutoConfiguration.class));

    @Test
    void registersFilterByDefault() {
        contextRunner.run(context -> assertThat(context).hasSingleBean(CorrelationFilter.class));
    }

    @Test
    void disappearsWhenDisabledByProperty() {
        contextRunner.withPropertyValues("fintech.audit.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean(CorrelationFilter.class));
    }

    @Test
    void backsOffWhenConsumerDeclaresOwnFilter() {
        contextRunner.withUserConfiguration(CustomFilterConfig.class)
                .run(context -> {
                    assertThat(context).hasSingleBean(CorrelationFilter.class);
                    assertThat(context.getBean(CorrelationFilter.class))
                            .isSameAs(context.getBean(CustomFilterConfig.class).customFilter);
                });
    }

    @Configuration
    static class CustomFilterConfig {
        final CorrelationFilter customFilter = new CorrelationFilter("X-Custom-Correlation-Id");
        @Bean
        CorrelationFilter correlationFilter() { return customFilter; }
    }
}
```

`fintech-audit-starter/fintech-audit-spring-boot-starter/pom.xml` (a casca vazia):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.fintech</groupId>
        <artifactId>fintech-audit-starter-build</artifactId>
        <version>0.0.1-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>
    <artifactId>fintech-audit-spring-boot-starter</artifactId>
    <dependencies>
        <dependency>
            <groupId>com.fintech</groupId>
            <artifactId>fintech-audit-autoconfigure</artifactId>
            <version>${project.version}</version>
        </dependency>
    </dependencies>
</project>
```

Rode `mvn install` no reator (`fintech-audit-starter/`) — 3 testes verdes, os jars vão
para o `~/.m2` local. Adicione ao `pom.xml` do `pix-gateway`:

```xml
<dependency>
  <groupId>com.fintech</groupId>
  <artifactId>fintech-audit-spring-boot-starter</artifactId>
  <version>0.0.1-SNAPSHOT</version>
</dependency>
```

E prove com um teste no `pix-gateway` que **toda** resposta traz o header:

```java
@SpringBootTest
@AutoConfigureMockMvc
class CorrelationAuditTest {
    @Autowired MockMvc mvc;
    @Test void everyResponseCarriesTheCorrelationHeader() throws Exception {
        mvc.perform(post("/payments")).andExpect(header().exists("X-Correlation-Id"));
    }
}
```

Suba com `--debug` e leia o *Condition Evaluation Report* para ver as duas condições
da `AuditAutoConfiguration` batendo:

```bash
mvn spring-boot:run -Dspring-boot.run.arguments=--debug | grep -A3 AuditAutoConfiguration
```

## Principais aprendizados

- Auto-configuração é **condicional** e sempre cede aos seus beans explícitos; o
  *Condition Evaluation Report* é a ferramenta de auditoria.
- Escrever `@AutoConfiguration` + `AutoConfiguration.imports` (não component scan) é o
  que permite padronizar plataforma para muitos squads.
- Um **starter** é a casca que empacota auto-config + dependências numa coordenada
  única; use `@ConditionalOnMissingBean` para oferecer defaults sobrescrevíveis.
- Boot 4.x divide as auto-configs por módulo — classpath mais explícito, diagnóstico
  mais simples.
