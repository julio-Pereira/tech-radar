---
id: introducao
title: "Por que Spring Boot numa fintech"
summary: "O que o Spring Boot resolve e por que ele virou o padrão de backend em times de pagamentos."
estimatedMinutes: 20
references:
  - title: "Spring Boot Reference — Introducing Spring Boot"
    url: https://docs.spring.io/spring-boot/reference/using/index.html
---

## O problema que o Spring Boot resolve

Antes do Spring Boot, subir uma aplicação Spring exigia configurar XML, servidores
de aplicação e dezenas de dependências compatíveis entre si à mão. O Boot inverte
isso: ele assume **convenções razoáveis por padrão** e deixa você sobrescrever só o
que for diferente. O resultado é um JAR executável (`java -jar`) com um servidor
embarcado, pronto para rodar em qualquer lugar que tenha uma JVM.

Três pilares sustentam essa produtividade:

- **Starters** — dependências agrupadas por capacidade (`spring-boot-starter-web`,
  `-data-jpa`, `-security`), com versões já testadas em conjunto.
- **Auto-configuração** — o Boot inspeciona o classpath e configura beans sozinho.
- **Actuator** — endpoints de produção (health, métricas) prontos de fábrica.

## Exemplo numa fintech

Imagine o time responsável pela **API de iniciação de pagamentos** (Open Finance).
O serviço precisa subir rápido, escalar horizontalmente e expor métricas para o time
de SRE acompanhar a latência de cada transação. Com o Boot, esse serviço nasce como
um único artefato versionado, idêntico em homologação e produção — o que é essencial
quando o ambiente é auditado pelo BACEN e cada release precisa ser rastreável.

```java
@SpringBootApplication
public class PaymentInitiationApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentInitiationApplication.class, args);
    }
}
```

Uma única anotação (`@SpringBootApplication`) liga component scanning,
auto-configuração e configuração baseada em propriedades.

## Principais aprendizados

- Spring Boot troca configuração explícita por **convenção + override**.
- Starters garantem um conjunto de dependências coerente e testado.
- O artefato único e reproduzível facilita auditoria e rollback — requisitos
  típicos de um ambiente regulado.
