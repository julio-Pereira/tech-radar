---
id: arquitetura-modulith
title: "Arquitetura: monolito modular e a fronteira do microservice"
summary: "Spring Modulith com fronteiras verificadas por teste, hexagonal sem cerimônia, e o critério honesto de quando quebrar em microservices — e quando isso só distribui o problema."
estimatedMinutes: 40
references:
  - title: "Spring Modulith Reference"
    url: https://docs.spring.io/spring-modulith/reference/
  - title: "Alistair Cockburn — Hexagonal Architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Martin Fowler — MonolithFirst"
    url: https://martinfowler.com/bliki/MonolithFirst.html
---

## O falso dilema: monolito OU microservices

O reflexo júnior é "microservices = moderno". O reflexo senior é perguntar **o que o
negócio precisa** e reconhecer que a maioria dos sistemas vive melhor como **monolito
modular** por muito tempo — e talvez para sempre. O problema real de um monolito nunca foi
ser um processo só; foi virar um **big ball of mud**, onde tudo depende de tudo e ninguém
ousa mudar nada. Microservices "resolvem" isso trocando acoplamento de código por
acoplamento de rede — que é mais caro, não mais barato. A boa notícia: dá para ter
fronteiras rígidas **sem** pagar o preço da rede.

## Spring Modulith: fronteiras verificadas por teste

Módulos "por convenção" apodrecem — nada impede um `import` proibido. **Spring Modulith**
(2.x) torna a fronteira **verificável**: cada pacote de topo é um módulo; o que está em
subpacotes é interno e **não** pode ser importado por outro módulo. E isso é um **teste**.
As dependências vêm de um BOM próprio, com versão fora do Boot:

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.modulith</groupId>
      <artifactId>spring-modulith-bom</artifactId>
      <version>2.1.2</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<!-- em <dependencies> -->
<dependency>
  <groupId>org.springframework.modulith</groupId>
  <artifactId>spring-modulith-starter-core</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.modulith</groupId>
  <artifactId>spring-modulith-starter-test</artifactId>
  <scope>test</scope>
</dependency>
```

```java
class ModularityTests {
    static final ApplicationModules modules = ApplicationModules.of(PixGatewayApplication.class);

    @Test void respeitaFronteiras() {
        modules.verify();   // falha o build se um módulo tocar o interno de outro
    }

    @Test void documenta() {
        new Documenter(modules).writeDocumentation();  // gera diagramas C4/PlantUML
    }
}
```

`modules.verify()` quebra o build quando `payments` importa uma classe interna de
`antifraud` — o acoplamento acidental vira erro de CI, não dívida silenciosa. E a
documentação de arquitetura é **gerada do código**, sempre atualizada.

## Comunicação entre módulos: eventos internos

Módulos não devem se chamar direto como serviços acoplados. O Modulith incentiva
**eventos de aplicação**: `payments` publica `PaymentConfirmed`; `antifraud` e `audit`
**escutam**, sem `payments` conhecê-los.

```java
@ApplicationModuleListener
void on(PaymentConfirmed event) { ... }
```

`@ApplicationModuleListener` não é mágica: é a soma de três anotações do Spring que você
já conhece, cada uma com uma consequência:

- `@TransactionalEventListener` — o handler só roda **depois do commit** da transação
  que publicou o evento (fase `AFTER_COMMIT`). Se o pagamento fizer rollback, o
  antifraude nunca ouve falar dele.
- `@Async` — roda em outra thread; `payments` não espera o antifraude terminar.
- `@Transactional(propagation = REQUIRES_NEW)` — o handler ganha transação própria: o
  que o antifraude grava não depende da transação de `payments`, que já terminou.

Repare no buraco entre os dois primeiros: depois do commit e antes de o handler rodar,
o evento só existe **na memória**. Se o processo cair nesse intervalo, ou se o handler
lançar exceção, o evento se perde sem rastro. Sozinho, isso **não** é o desenho do outbox
do marco 06. Vira outbox com o **Event Publication Registry**, que grava cada publicação
numa tabela **na mesma transação** de quem publica e só a marca como concluída quando o
listener termina com sucesso:

```xml
<dependency>
  <groupId>org.springframework.modulith</groupId>
  <artifactId>spring-modulith-starter-jpa</artifactId>
</dependency>
```

Com Flyway e `ddl-auto=none`, a tabela do registro é sua responsabilidade — sem ela, a
própria **publicação** falha (`relation "event_publication" does not exist`) e derruba
a transação de `payments`. O schema para Postgres vem no jar
`spring-modulith-events-jdbc` (`schemas/v2/schema-postgresql.sql`):

```sql
-- V4__event_publication.sql
CREATE TABLE IF NOT EXISTS event_publication (
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
```

Agora, se o listener do antifraude falha, a linha fica com `status = FAILED` e
`completion_date` nula — pendente, pronta para ser republicada, exatamente como um
evento do outbox que o relay ainda não entregou. É **esse** conjunto (listener + registro)
que tem o mesmo desenho do outbox, só que in-process — e por isso, no dia em que um
módulo virar microservice, o evento já existe: troca-se o barramento in-process pelo
Kafka, e os *listeners* mal percebem.

## Hexagonal sem cerimônia

*Ports and adapters* (hexagonal) mantém o **domínio no centro**, sem saber que existe
Spring, JPA ou HTTP. O domínio define **ports** (interfaces: `PspGateway`,
`PaymentRepository`); a infraestrutura fornece **adapters** (`RestClientPspGateway`,
`JpaPaymentRepository`). Você testa o domínio sem subir nada e troca o adapter sem tocar a
regra. A armadilha é a **cerimônia**: cinco camadas e vinte interfaces para um CRUD é
overengineering. Aplique a inversão onde a fronteira **importa** (integrações externas,
regra de negócio central); no resto, um service direto basta. Arquitetura é sobre onde
gastar complexidade, não sobre gastá-la em tudo.

## Quando quebrar em microservices

Extraia um serviço quando houver uma razão **concreta**, não estética:

- **Escala independente:** o antifraude consome GPU e precisa escalar num ritmo diferente
  do resto.
- **Cadência de deploy independente:** um módulo muda 10× por dia e não pode esperar o
  release do monolito.
- **Fronteira organizacional:** um time separado é dono daquele domínio, e a estrutura do
  sistema tende a espelhar a da organização (Lei de Conway).
- **Isolamento de falha ou de tecnologia:** o módulo precisa de outra linguagem, ou não
  pode derrubar o resto quando cair.

Se nenhuma se aplica, quebrar só **distribui o problema**: você troca uma chamada de
método (rápida, transacional, tipada) por uma chamada de rede (lenta, sem transação
distribuída fácil, que falha de formas novas) e ganha um pipeline de deploy a mais para
manter. Um Modulith com fronteiras verificadas te dá 90% do benefício de microservices
por 10% do custo — e deixa a extração barata *quando* a razão concreta chegar.

## Exemplo numa fintech

O **pix-gateway** vive como um **Modulith** com três módulos: `payments` (iniciação,
saldo, outbox), `antifraud` (análise de risco) e `audit` (trilha imutável BACEN). As
fronteiras são verificadas por `ApplicationModules.verify()` no CI; a comunicação é por
eventos (`PaymentInitiated` → `antifraud`/`audit`). O critério para extrair o
**antifraude** primeiro é escala independente (modelo pesado, ritmo próprio) — e, como já
conversa por eventos, a extração é trocar o barramento in-process por Kafka, não reescrever
a integração. (Ponte com o marco *java-vs-go* da trilha `go-fintech` e com o spike de
visualizações de arquitetura.)

## Mão na massa

**Desafio — fronteira verificada.** Estruture o pix-gateway em três módulos Spring
Modulith e escreva o teste `ApplicationModules.verify()`. Depois, introduza de propósito
um `import` de uma classe **interna** de `antifraud` dentro de `payments` e veja o teste
**falhar** — provando que o acoplamento ilegal é pego pelo build, não descoberto em
produção. Gere a documentação com `Documenter` e observe o diagrama de módulos.

```bash
mvn test -Dtest=ModularityTests
# o teste documenta() gera os diagramas em target/spring-modulith-docs/
```

Os módulos precisam estar em `src/main/java`: o `ApplicationModules.of(...)` analisa só
classes de produção, e uma aplicação de exemplo montada em `src/test` falha com
`No classes found in packages`.

**Invariantes testáveis.**

- Com as fronteiras respeitadas, `verify()` passa e `target/spring-modulith-docs/` traz
  `components.puml` e um `module-<nome>.puml` por módulo.
- Com o `import` ilegal, `verify()` falha com
  `Module 'payments' depends on non-exposed type ...antifraud.internal...` — e, se
  `antifraud` já escuta eventos de `payments`, também com o ciclo entre os dois.
- Com o Event Publication Registry, um listener que lança exceção deixa a publicação com
  `status = FAILED` e `completion_date` nula na tabela `event_publication`.

## Principais aprendizados

- O inimigo nunca foi o monolito; foi o **big ball of mud**. **Modulith** dá fronteiras
  rígidas sem o custo de rede.
- `ApplicationModules.verify()` transforma fronteira em **teste**; eventos internos
  desacoplam módulos. `@ApplicationModuleListener` = `@TransactionalEventListener` +
  `@Async` + `@Transactional(REQUIRES_NEW)`; só com o **Event Publication Registry** ele
  tem a garantia do outbox.
- **Hexagonal** onde a fronteira importa; sem cerimônia no resto.
- Quebre em microservice por razão **concreta** (escala, cadência, time, isolamento) —
  senão você só **distribui o problema**. O Modulith deixa a extração barata quando a
  hora chegar.

## Capstone

O `pix-gateway` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `POST /payments` com validação, persistência e idempotência por chave de negócio
- [ ] Tabela de outbox, com o evento saindo na mesma transação do pagamento
- [ ] Perfis por ambiente, segredo fora do artefato, configuração externalizada
- [ ] Circuit breaker, timeout e retry com backoff no cliente do PSP
- [ ] OAuth2 resource server no padrão FAPI, com escopo por operação
- [ ] Actuator com métricas de negócio e readiness que não depende de terceiro
- [ ] Suíte de integração com Testcontainers (Postgres e Kafka)
- [ ] Imagem OCI sem root, migração expand/contract e rollback exercitado
- [ ] Os três módulos com `ApplicationModules.verify()` no CI

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] A mesma requisição enviada 100 vezes em paralelo gera **um** pagamento e **um** evento
- [ ] Nenhum dual-write: derrubar o broker não produz pagamento sem evento nem o contrário
- [ ] Um `import` de classe interna de outro módulo faz o build falhar
- [ ] Token sem o escopo correto recebe 403, e a negativa aparece em log auditável
- [ ] Com o PSP devolvendo 100% de erro, o circuit breaker abre antes de o pool esgotar
- [ ] A versão anterior da aplicação continua funcionando com o schema já migrado
- [ ] `mvn verify` roda do zero em máquina limpa, sem serviço pré-instalado
- [ ] Uma ADR por bloco: fronteira transacional, idempotência, resiliência, segurança

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma
página — inclusive se nada tiver quebrado.
