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

- Os **starters** agrupam dependências por capacidade (`spring-boot-starter-webmvc`,
  `-data-jpa`, `-security`), com versões já testadas em conjunto: você declara *o que*
  quer, não a lista de bibliotecas compatíveis.
- A **auto-configuração** inspeciona o classpath e cria sozinha os objetos que a
  aplicação vai usar — os *beans*, gerenciados pelo container do Spring.
- O **Actuator** expõe endpoints de produção (saúde, métricas) prontos de fábrica.

Isso você já sabe. O que separa o uso senior do uso "copiei do tutorial" é entender
**o que acontece por baixo** — e é aí que começa este curso.

## O que acontece entre `run()` e "pronto"

`SpringApplication.run(...)` não é mágica; é uma sequência determinística. Conhecê-la
é o que permite depurar um startup lento ou um bean que não sobe:

1. **Cria o `ApplicationContext`** — o container que guarda e liga os beans — do tipo
   apropriado ao classpath (servlet, reativo ou nenhum).
2. **Prepara o environment**: resolve `application.yaml`, perfis, variáveis de ambiente
   e argumentos numa ordem de precedência fixa (marco 03).
3. **Registra as definições de beans**: o *component scan* (a varredura das classes
   anotadas no pacote da aplicação) e as auto-configurações dizem *quais* beans vão
   existir, mas nenhum é criado ainda.
4. **Faz o *refresh* do contexto**: instancia os *singletons* (os beans de instância
   única, o padrão), resolve dependências, aplica os `BeanPostProcessor`s e cria os
   proxies de `@Transactional`/`@Async` (marco 04). No fim do refresh o Tomcat embarcado
   **sobe e abre a porta**.
5. **Dispara os `ApplicationRunner`/`CommandLineRunner`** e publica
   `ApplicationReadyEvent`. Só depois disso o estado de *readiness* passa a
   `ACCEPTING_TRAFFIC`.

Repare na ordem dos passos 4 e 5: a porta já está aberta enquanto os runners rodam, mas a
aplicação ainda se declara *não pronta* (`REFUSING_TRAFFIC`). "Porta aberta" não quer
dizer "pronta para atender" — é por isso que o Kubernetes pergunta à *readiness probe*
(marcos 10 e 12) e não apenas se a porta responde.

Guarde esta linha: **o contexto é montado uma vez, no boot**. Erros de configuração
falham rápido, no startup, não no meio de uma transação em produção — uma propriedade
que você vai aprender a explorar.

## Panorama Spring Boot 4.x

Este curso tem baseline **Spring Boot 4.1 / Java 21**. O salto 3.x → 4.x traz mudanças
que aparecem ao longo dos marcos — não decore, só saiba que o chão mudou:

- Por baixo roda o **Spring Framework 7**, que exige **Java 17+**. Usamos o 21 pelas
  *virtual threads* (marco 07).
- O **Jakarta EE 11** consolida os pacotes `jakarta.*`; não sobra nenhum `javax.*`.
- O **Jackson 3** é o padrão de JSON, agora no namespace `tools.jackson` — relevante
  quando você customiza a serialização de valores monetários.
- O **JSpecify** padroniza as anotações de *null-safety* (`@Nullable`, `@NonNull`), e
  com elas as ferramentas apontam `NullPointerException` em tempo de compilação.
- O Spring MVC ganhou **versionamento de API** nativo, e as auto-configurações foram
  **divididas** em JARs por módulo — o classpath ficou mais explícito (marco 02). Na prática, os starters
  ficaram mais granulares: `spring-boot-starter-web` cedeu lugar a
  `spring-boot-starter-webmvc`, cada tecnologia tem seu starter de teste
  (`spring-boot-starter-webmvc-test` traz o `MockMvc`) e capacidades que antes vinham
  "de carona" pedem starter próprio (`-restclient`, `-flyway`, `-aspectj`).
  `@MockBean` foi removido — o substituto é `@MockitoBean` (marco 11).

## O produto do curso: pix-gateway

Em vez de exemplos avulsos, o curso evolui **um único produto**: o **pix-gateway**, um
serviço de **iniciação de pagamentos Open Finance** — o ecossistema regulado pelo Banco
Central em que uma instituição autorizada pelo cliente dispara um Pix a partir da conta
dele em outra instituição. Quem de fato liquida o Pix é um **PSP** (prestador de serviço
de pagamento), que o gateway chama por HTTP. Ele nasce aqui como um esqueleto
e ganha camadas marco a marco — configuração, persistência, idempotência, resiliência,
segurança, observabilidade e deploy. É o espelho Java do LedgerCore da trilha
`go-fintech`: mesmo domínio, outra stack.

O domínio impõe requisitos que moldam **toda** decisão técnica:

- A **auditoria do BACEN** (Banco Central) exige que cada release e cada transação sejam
  rastreáveis.
- A **LGPD** exige dado pessoal mascarado em log, e "apagar" um cliente quase sempre
  significa anonimizar, não deletar.
- A **idempotência** garante que um aviso do PSP reenviado (o *webhook*, uma chamada HTTP
  que ele faz de volta ao gateway) não cobre duas vezes (marco 06).
- A **precisão monetária** pede `BigDecimal` com `RoundingMode` explícito, **nunca**
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

1. Gere o projeto em [start.spring.io](https://start.spring.io) com Boot 4.1 e Java 21.

   ```bash
   curl https://start.spring.io/starter.zip \
     -d type=maven-project -d language=java -d bootVersion=4.1.0 \
     -d baseDir=pix-gateway -d groupId=com.fintech -d artifactId=pix-gateway \
     -d name=pix-gateway -d packageName=com.fintech.pixgateway \
     -d javaVersion=21 -d dependencies=web \
     -o pix-gateway.zip && unzip pix-gateway.zip -d pix-gateway
   ```

   (`dependencies=web` só — pedir `test` ao Initializr falha, porque o suporte a teste
   já vem por padrão em todo projeto gerado.)

   Confira o `pom.xml` gerado: no Boot 4 ele deve trazer `spring-boot-starter-webmvc` e
   `spring-boot-starter-webmvc-test` (escopo `test`). É o segundo que fornece o
   `MockMvc` do passo 3 — com só `spring-boot-starter-test`, o teste não encontra o bean
   `MockMvc` e falha. Se faltar, adicione:

   ```xml
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-webmvc-test</artifactId>
     <scope>test</scope>
   </dependency>
   ```
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
   import org.junit.jupiter.api.Test;
   import org.springframework.beans.factory.annotation.Autowired;
   import org.springframework.boot.test.context.SpringBootTest;
   import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc; // pacote novo no Boot 4
   import org.springframework.test.web.servlet.MockMvc;

   import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
   import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

Rode o teste e depois prove o endpoint no ar, de verdade:

```bash
cd pix-gateway
mvn test          # 2 testes verdes: o de contexto do Initializr + o seu
mvn spring-boot:run &
curl -i -X POST http://localhost:8080/payments   # HTTP/1.1 501
```

## Principais aprendizados

- Spring Boot troca configuração explícita por **convenção + override**; o valor senior
  está em saber o que ele faz por baixo.
- `SpringApplication.run` tem um ciclo determinístico: environment → definições de
  beans → refresh → *ready*. O contexto sobe uma vez, no boot; a porta abre antes de a
  aplicação se declarar pronta.
- Boot 4.x = Framework 7, Jakarta EE 11, Jackson 3, JSpecify, Java 17+.
- O **pix-gateway** é o fio-condutor; auditoria, LGPD, idempotência e `BigDecimal`
  entram desde a primeira linha, não como reforma posterior.
