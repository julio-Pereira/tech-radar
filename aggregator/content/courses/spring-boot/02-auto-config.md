---
id: auto-config
title: "Auto-configuração e Starters"
summary: "Como o Spring Boot decide o que configurar por você — e por que isso importa numa fintech."
estimatedMinutes: 25
references:
  - title: "Spring Boot Reference — Auto-configuration"
    url: https://docs.spring.io/spring-boot/reference/using/auto-configuration.html
---

## O que é auto-configuração

A auto-configuração é o mecanismo que olha para o **classpath**, para os **beans já
definidos** e para as **propriedades** e então registra, condicionalmente, os beans
que provavelmente você quer. Se o driver do PostgreSQL está no classpath e existe uma
`spring.datasource.url`, o Boot monta um `DataSource` para você. Coloque o
`spring-boot-starter-web` e ele sobe um Tomcat embarcado com `DispatcherServlet`.

A palavra-chave é **condicional**. Cada classe de auto-configuração usa anotações
como `@ConditionalOnClass`, `@ConditionalOnMissingBean` e `@ConditionalOnProperty`.
A regra de ouro: **se você declarar o bean, o Boot recua**. Convenção que nunca
atropela a sua decisão explícita.

## Exemplo numa fintech

Pense num serviço de **conciliação de pagamentos** que lê eventos de liquidação e
precisa de um pool de conexões agressivo para aguentar o pico das janelas de
compensação. A auto-configuração do HikariCP entra por padrão, mas os números padrão
não servem para o seu SLA. Você sobrescreve só o necessário:

```properties
spring.datasource.hikari.maximum-pool-size=40
spring.datasource.hikari.connection-timeout=2000
spring.datasource.hikari.pool-name=reconciliation-pool
```

E quando precisa de um `ObjectMapper` que serialize valores monetários como
`BigDecimal` sem perder precisão, você declara o seu — e o Boot, por causa do
`@ConditionalOnMissingBean`, para de fornecer o dele:

```java
@Bean
ObjectMapper objectMapper() {
    return JsonMapper.builder()
        .disable(SerializationFeature.WRITE_BIGDECIMAL_AS_PLAIN)
        .build();
}
```

## Como inspecionar o que foi configurado

Suba a aplicação com `--debug` (ou `logging.level...`) para ver o **Condition
Evaluation Report**: ele lista o que foi aplicado (`positive matches`) e o que foi
descartado (`negative matches`), com o motivo. Num ambiente regulado, conseguir
explicar *por que* um bean existe é tão importante quanto tê-lo.

## Principais aprendizados

- Auto-configuração é **condicional** e sempre cede para os seus beans explícitos.
- Sobrescreva por propriedades quando puder; por `@Bean` quando precisar de controle.
- O relatório de avaliação de condições é a ferramenta para auditar o que o Boot fez.
