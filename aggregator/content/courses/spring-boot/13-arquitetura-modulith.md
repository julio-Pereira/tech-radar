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
subpacotes é interno e **não** pode ser importado por outro módulo. E isso é um **teste**:

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
**escutam**, sem `payments` conhecê-los. `@ApplicationModuleListener` roda o handler de
forma transacional e assíncrona. Repare que é o **mesmo desenho do outbox** (marco 06),
só que in-process — e por isso, no dia em que um módulo virar microservice, o evento já
existe: troca-se o barramento in-process pelo Kafka, e os *listeners* mal percebem.

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

- **Escala independente** — o antifraude consome GPU e escala num ritmo diferente do
  resto.
- **Cadência de deploy independente** — um módulo muda 10× por dia e não pode esperar o
  release do monolito.
- **Fronteira organizacional** — um time separado é dono daquele domínio (Lei de Conway).
- **Isolamento de falha/tecnologia** — precisa de outra linguagem, ou não pode derrubar o
  resto ao cair.

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

## Principais aprendizados

- O inimigo nunca foi o monolito; foi o **big ball of mud**. **Modulith** dá fronteiras
  rígidas sem o custo de rede.
- `ApplicationModules.verify()` transforma fronteira em **teste**; eventos internos
  desacoplam módulos (mesmo desenho do outbox, in-process).
- **Hexagonal** onde a fronteira importa; sem cerimônia no resto.
- Quebre em microservice por razão **concreta** (escala, cadência, time, isolamento) —
  senão você só **distribui o problema**. O Modulith deixa a extração barata quando a
  hora chegar.
