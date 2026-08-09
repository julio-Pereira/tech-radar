---
id: introducao
title: "Por que Spring Boot numa fintech"
summary: "O que o Boot resolve, o ciclo de vida do ApplicationContext, o panorama Boot 4.x e a apresentação do pix-gateway — o produto que evolui o curso inteiro."
estimatedMinutes: 30
references:
  - title: "Spring Boot Reference — Introducing Spring Boot"
    url: https://docs.spring.io/spring-boot/reference/using/index.html
  - title: "Spring Framework — The IoC Container"
    url: https://docs.spring.io/spring-framework/reference/core/beans.html
  - title: "Spring Boot 4.0 Release Notes"
    url: https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Release-Notes
---

## O problema que o Spring Boot resolve

Antes do Spring Boot, subir uma aplicação Spring exigia configurar XML, servidores
de aplicação e dezenas de dependências compatíveis entre si à mão. O Boot inverte
isso: assume **convenções razoáveis por padrão** e deixa você sobrescrever só o que
for diferente. O resultado é um JAR executável (`java -jar`) com servidor embarcado,
pronto para rodar em qualquer lugar com uma JVM.

Três pilares sustentam a produtividade:

- **Starters** — dependências agrupadas por capacidade (`spring-boot-starter-web`,
  `-data-jpa`, `-security`), com versões já testadas em conjunto.
- **Auto-configuração** — o Boot inspeciona o classpath e configura beans sozinho.
- **Actuator** — endpoints de produção (health, métricas) prontos de fábrica.

Isso você já sabe. O que separa o uso senior do uso "copiei do tutorial" é entender
**o que acontece por baixo** — e é aí que começa este curso.

## O que acontece entre `run()` e "pronto"

`SpringApplication.run(...)` não é mágica; é uma sequência determinística. Conhecê-la
é o que permite depurar um startup lento ou um bean que não sobe:

1. **Cria o `ApplicationContext`** apropriado ao classpath (servlet, reativo ou nenhum).
2. **Prepara o environment** — resolve `application.yaml`, perfis, variáveis de
   ambiente e argumentos numa ordem de precedência fixa (marco 03).
3. **Faz o *bean definition scanning*** — component scan e as auto-configurações
   registram *definições* de beans (ainda não instâncias).
4. **Refresh do contexto** — instancia os *singletons*, resolve dependências, aplica
   os `BeanPostProcessor`s e cria os proxies de `@Transactional`/`@Async` (marco 04).
5. **Dispara os `ApplicationRunner`/`CommandLineRunner`** e publica
   `ApplicationReadyEvent`. Só então o Tomcat aceita tráfego.

Guarde esta linha: **o contexto é montado uma vez, no boot**. Erros de configuração
falham rápido, no startup, não no meio de uma transação em produção — uma propriedade
que você vai aprender a explorar.

## Panorama Spring Boot 4.x

Este curso tem baseline **Spring Boot 4.1 / Java 21**. O salto 3.x → 4.x traz mudanças
que aparecem ao longo dos marcos — não decore, só saiba que o chão mudou:

- **Spring Framework 7** por baixo, exigindo **Java 17+** (usamos 21 pelas *virtual
  threads*, marco 07).
- **Jakarta EE 11** — pacotes `jakarta.*` já consolidados (nada de `javax.*`).
- **Jackson 3** como padrão (namespace `tools.jackson`), relevante quando você
  customiza serialização monetária.
- **JSpecify** para *null-safety* anotada, ajudando ferramentas a pegar NPE em compile
  time.
- **API versioning** nativo no Spring MVC e **split das auto-configurações** em JARs
  por módulo — o classpath ficou mais explícito (marco 02).

## O produto do curso: pix-gateway

Em vez de exemplos avulsos, o curso evolui **um único produto**: o **pix-gateway**, um
serviço de **iniciação de pagamentos Open Finance**. Ele nasce aqui como um esqueleto
e ganha camadas marco a marco — configuração, persistência, idempotência, resiliência,
segurança, observabilidade e deploy. É o espelho Java do LedgerCore da trilha
`go-fintech`: mesmo domínio, outra stack.

O domínio impõe requisitos que moldam **toda** decisão técnica:

- **Auditoria BACEN** — cada release e cada transação precisam ser rastreáveis.
- **LGPD** — dado pessoal mascarado em log; "apagar" quase sempre é anonimizar.
- **Idempotência** — um webhook de PSP reenviado não pode cobrar duas vezes (marco 06).
- **Precisão monetária** — `BigDecimal` com `RoundingMode` explícito, **nunca**
  `double`. O equivalente Go é `int64`/`decimal`; aqui a JVM te dá o tipo certo, basta
  não trair ele.

```java
@SpringBootApplication
public class PixGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(PixGatewayApplication.class, args);
    }
}
```

Uma anotação (`@SpringBootApplication`) liga component scanning, auto-configuração e
binding de propriedades. Simples na superfície; nos próximos marcos abrimos a caixa.

## Mão na massa

**Tutorial — nascer o pix-gateway.**

1. Gere o projeto em [start.spring.io](https://start.spring.io) com Boot 4.1, Java 21 e
   os starters `web` e `test`.
2. Crie o endpoint mínimo, deliberadamente **não implementado** — sinceridade de API
   vale mais que um `200` mentiroso:

   ```java
   @RestController
   @RequestMapping("/payments")
   class PaymentController {
       @PostMapping
       ResponseEntity<Void> initiate() {
           return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build(); // 501
       }
   }
   ```

3. Prove com um teste de contexto real:

   ```java
   @SpringBootTest
   @AutoConfigureMockMvc
   class PaymentControllerTest {
       @Autowired MockMvc mvc;

       @Test void initiate_returns501() throws Exception {
           mvc.perform(post("/payments")).andExpect(status().isNotImplemented());
       }
   }
   ```

O `@SpringBootTest` sobe o `ApplicationContext` inteiro — se algum bean não montar, o
teste falha no boot, exatamente como a produção falharia.

## Principais aprendizados

- Spring Boot troca configuração explícita por **convenção + override**; o valor senior
  está em saber o que ele faz por baixo.
- `SpringApplication.run` tem um ciclo determinístico: environment → definições de
  beans → refresh → *ready*. O contexto sobe uma vez, no boot.
- Boot 4.x = Framework 7, Jakarta EE 11, Jackson 3, JSpecify, Java 17+.
- O **pix-gateway** é o fio-condutor; auditoria, LGPD, idempotência e `BigDecimal`
  entram desde a primeira linha, não como reforma posterior.
