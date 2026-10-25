---
id: testes-de-integracao
title: "Testes que provam alguma coisa"
summary: "A pirâmide honesta no Boot: slices, Testcontainers com @ServiceConnection para Postgres e Kafka reais, quando @MockitoBean vira mentira, e contract testing."
estimatedMinutes: 40
references:
  - title: "Spring Boot Reference — Testing"
    url: https://docs.spring.io/spring-boot/reference/testing/index.html
  - title: "Testcontainers for Java"
    url: https://java.testcontainers.org/
  - title: "Spring Boot Reference — Testcontainers @ServiceConnection"
    url: https://docs.spring.io/spring-boot/reference/testing/testcontainers.html
---

## Uma pirâmide honesta

Muito teste não prova muita coisa. A pirâmide senior não é "cobertura alta a qualquer
custo": é **cada teste no nível certo, provando o que só ele pode provar**.

- Os **unitários** cobrem a lógica de domínio pura (cálculo de tarifa, regra de saldo),
  sem Spring. São rápidos, e você tem milhares deles.
- Os **slices** (fatias) sobem só um pedaço do contexto: `@WebMvcTest` carrega só a
  camada web (rotas, serialização, validação, segurança) e `@DataJpaTest` só o JPA e os
  repositórios, com uma transação de teste. São rápidos e focados.
- Os de **integração** põem o sistema para conversar com infraestrutura real (banco,
  broker). São poucos, mas são os que pegam os bugs que importam em fintech.

## Slices: testar uma camada por vez

`@WebMvcTest(PaymentController.class)` sobe o controller, o `MockMvc` e a config de
segurança — **sem** banco nem service real (você mocka o service). Prova que
`POST /payments` valida o corpo, exige o escopo e serializa a resposta.
`@DataJpaTest` sobe só o JPA e roda cada teste numa transação revertida ao final — prova
que sua query `@EntityGraph` mata o N+1 e que o mapeamento está certo. Slices são
rápidos porque carregam pouco; use-os para o grosso da cobertura de camada.

## Testcontainers: Postgres e Kafka reais no teste

Aqui está o pulo do gato senior. Testar contra **H2** (banco em memória) é confortável e
**mentiroso**: H2 não é Postgres, nem no "modo PostgreSQL". Ele imita a sintaxe mais
comum, mas diverge em tipos, em DDL, em conversões e em detalhes de isolamento. Às vezes
a divergência é barulhenta (a migração nem roda); às vezes é silenciosa (o teste passa
gravando outra coisa). Um teste verde no H2 pode esconder um bug que só aparece no
Postgres de produção — o pior tipo de bug.

**Testcontainers** sobe um **Postgres real** (e um **Kafka real**) num container Docker,
durante o teste. Com `@ServiceConnection` (Boot), o Spring **auto-configura** o
`DataSource`/`KafkaConnectionDetails` apontando para o container — zero propriedade
manual:

```java
@SpringBootTest
@Testcontainers
class PaymentOutboxIT {

    @Container @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Container @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer("apache/kafka:4.3.1");

    @Autowired PaymentInitiationService payments;
    // ... testa initiate + outbox contra Postgres e Kafka de verdade
}
```

O teste do **outbox do marco 06** roda aqui: o pagamento é gravado no Postgres real, o
relay publica no Kafka real, e um consumidor de teste confirma a entrega. É o único teste
que prova que o fluxo funciona ponta a ponta — H2 e um mock de Kafka jamais provariam.

## Quando `@MockitoBean` vira mentira

`@MockitoBean` (o sucessor de `@MockBean`) substitui um bean do contexto por um mock.
Útil para isolar uma dependência externa (o PSP) num teste de fatia. Mas mockar **o que
você está testando** transforma o teste numa tautologia: se você mocka o repositório num
teste que deveria provar a persistência, está testando o Mockito, não o seu código.
Regra: mocke a **fronteira** (o serviço externo), nunca o **sujeito** do teste. Um teste
de outbox com repositório mockado é uma mentira verde.

## Contract testing (conceito)

O pix-gateway depende do PSP e é dependido pelo antifraude. Testes de integração ponta a
ponta entre serviços são lentos e frágeis. **Contract testing** (ex.: Spring Cloud
Contract, Pact) verifica que consumidor e provedor concordam sobre o **contrato** (forma
das mensagens) sem subir os dois juntos: o provedor prova que honra o contrato; o
consumidor prova que trabalha contra ele. Cada lado testa rápido e isolado, e a
integração continua garantida.

> **Reencontro adiante — `arquitetura-eventos/12`.** O contract testing aplicado a evento assíncrono, e as duas suítes que uma
> arquitetura de eventos não pode deixar de ter: reprojeção determinística e idempotência.

## Exemplo numa fintech

O teste crítico do **pix-gateway** é o do outbox rodando contra **Kafka real** via
Testcontainers: prova que iniciar um pagamento grava no banco **e** entrega o evento,
atomicamente do lado do banco e com entrega efetiva no broker — a garantia que sustenta a
conciliação. Nenhum mock daria essa confiança.

## Mão na massa

**Pré-requisito do estado do pix-gateway:** o do marco 10: Actuator com Prometheus, a `Observation` de `payment.initiate` e o `FraudCheckHealthIndicator`.

**Desafio — escrever no H2 de propósito, migrar e achar a diferença.**

1. Adicione o H2 como dependência de teste (`com.h2database:h2`, versão gerenciada pelo
   Boot) e aponte um teste para ele em modo PostgreSQL:

   ```properties
   spring.datasource.url=jdbc:h2:mem:pix;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
   ```

2. **Rode o teste de débito concorrente do marco 05 nesse H2.** Ele passa: 5 sucessos, 5
   "saldo insuficiente", saldo 0. Registre isso — o H2 implementa `FOR UPDATE` com lock de
   linha, e nem toda divergência está onde se espera. Um teste verde no H2 não prova nada
   sobre o Postgres; ele só não reprovou.
3. **Agora deixe o Flyway aplicar as migrações reais do pix-gateway no H2.** A `V2` do
   marco 06 não passa: primeiro `Unknown data type: "TIMESTAMPTZ"`; trocando por
   `TIMESTAMP WITH TIME ZONE`, um erro de sintaxe em
   `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` (o H2 exige o `DEFAULT` antes do
   `PRIMARY KEY`). A tentação é manter um schema "só para o H2" — e é aí que o problema
   fica silencioso.
4. **Encontre a divergência silenciosa.** Com as tabelas criadas no H2, execute o mesmo
   SQL que o serviço de idempotência do marco 06 usa:

   ```sql
   update idempotency_keys set response_body = '{"a":1}'::jsonb where idempotency_key = 'k1';
   select response_body::text from idempotency_keys where idempotency_key = 'k1';
   ```

   No Postgres, o resultado é o objeto `{"a": 1}`. No H2, é `"{\"a\":1}"` — uma **string
   JSON** contendo o texto, não o objeto. O `UPDATE` "funciona", e a resposta gravada de
   cada pagamento passa a ser outra coisa.
5. Leve o teste de replay do marco 06 para o Postgres via `@ServiceConnection` (é o que
   ele já faz) e registre, num parágrafo, as três observações: o que o H2 aprovou sem
   provar, o que ele recusou, e o que ele aceitou errado.

```bash
mvn verify      # unitários e fatias no Surefire, *IT no Failsafe (marco 04)
```

## Principais aprendizados

- Pirâmide honesta: unitário para domínio, **slices** (`@WebMvcTest`/`@DataJpaTest`) para
  camadas, **integração** para o que importa.
- **Testcontainers + `@ServiceConnection`** dá Postgres e Kafka reais no teste; **H2
  mente** — às vezes recusando o DDL real, às vezes aceitando e gravando outra coisa.
- Mocke a **fronteira**, nunca o **sujeito**; `@MockitoBean` no lugar errado é teste
  tautológico.
- **Contract testing** garante integração entre serviços sem subir todos juntos.
