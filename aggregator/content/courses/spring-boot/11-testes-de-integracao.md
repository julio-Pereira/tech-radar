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

- **Unitários** — lógica de domínio pura (cálculo de tarifa, regra de saldo) sem Spring.
  Rápidos, milhares deles.
- **Slices** — sobem só uma fatia do contexto. `@WebMvcTest` (só a camada web: rotas,
  serialização, validação, segurança) e `@DataJpaTest` (só JPA/repos com transação de
  teste). Rápidos e focados.
- **Integração** — o sistema conversando com infra real (banco, broker). Poucos, mas
  são os que pegam os bugs que importam em fintech.

## Slices: testar uma camada por vez

`@WebMvcTest(PaymentController.class)` sobe o controller, o `MockMvc` e a config de
segurança — **sem** banco nem service real (você mocka o service). Prova que
`POST /payments` valida o corpo, exige o escopo e serializa a resposta.
`@DataJpaTest` sobe só o JPA e roda cada teste numa transação revertida ao final — prova
que sua query `@EntityGraph` mata o N+1 e que o mapeamento está certo. Slices são
rápidos porque carregam pouco; use-os para o grosso da cobertura de camada.

## Testcontainers: Postgres e Kafka reais no teste

Aqui está o pulo do gato senior. Testar contra **H2** (banco em memória) é confortável e
**mentiroso**: H2 não é Postgres. Ele não tem o mesmo comportamento de `SELECT ... FOR
UPDATE`, de tipos, de constraints, de isolamento. Um teste verde no H2 pode esconder um
bug que só aparece no Postgres de produção — o pior tipo de bug.

**Testcontainers** sobe um **Postgres real** (e um **Kafka real**) num container Docker,
durante o teste. Com `@ServiceConnection` (Boot), o Spring **auto-configura** o
`DataSource`/`KafkaConnectionDetails` apontando para o container — zero propriedade
manual:

```java
@SpringBootTest
@Testcontainers
class PaymentOutboxIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Container @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer("apache/kafka:3.7.0");

    @Autowired PaymentService payments;
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

## Exemplo numa fintech

O teste crítico do **pix-gateway** é o do outbox rodando contra **Kafka real** via
Testcontainers: prova que iniciar um pagamento grava no banco **e** entrega o evento,
atomicamente do lado do banco e com entrega efetiva no broker — a garantia que sustenta a
conciliação. Nenhum mock daria essa confiança.

## Mão na massa

**Desafio — migrar de H2 para Testcontainers e capturar um bug.** Pegue um teste de
locking (marco 05) escrito contra H2 que passa "verde" e migre-o para Postgres via
`@ServiceConnection`. Observe o comportamento de `SELECT ... FOR UPDATE` mudar: o H2
escondia a real contenção entre as threads concorrentes. Documente o bug que o H2
mascarava e prove, no Postgres real, que o saldo nunca fica negativo.

## Principais aprendizados

- Pirâmide honesta: unitário para domínio, **slices** (`@WebMvcTest`/`@DataJpaTest`) para
  camadas, **integração** para o que importa.
- **Testcontainers + `@ServiceConnection`** dá Postgres e Kafka reais no teste; **H2
  mente** e esconde bugs de produção.
- Mocke a **fronteira**, nunca o **sujeito**; `@MockitoBean` no lugar errado é teste
  tautológico.
- **Contract testing** garante integração entre serviços sem subir todos juntos.
