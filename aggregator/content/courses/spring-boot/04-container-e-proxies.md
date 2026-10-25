---
id: container-e-proxies
title: "O container por dentro: beans, escopos e proxies"
summary: "Ciclo de vida do bean, BeanPostProcessor, escopos e — o divisor de águas — como os proxies de @Transactional funcionam e por que self-invocation silenciosamente não aplica o advice."
estimatedMinutes: 40
references:
  - title: "Spring Framework — Bean Lifecycle"
    url: https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html
  - title: "Spring Framework — Understanding AOP Proxies"
    url: https://docs.spring.io/spring-framework/reference/core/aop/proxying.html
  - title: "Spring Framework — Transaction Management with @Transactional"
    url: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html
---

## O ciclo de vida de um bean

Um bean não é só `new`. O container passa cada singleton por uma esteira, no *refresh*
do contexto:

1. **Instanciação.** O container chama o construtor. Por isso **injeção por construtor**
   é o padrão: o objeto nasce com as dependências em campos `final`, nunca existe num
   estado meio-montado e pode ser testado com um `new`, sem o container.
2. **Injeção por campo ou *setter*.** As dependências que não vieram pelo construtor são
   preenchidas agora. Com injeção por construtor, não sobra nada para este passo.
3. **Callbacks `*Aware`.** O container entrega ao bean as referências da própria
   infraestrutura que ele pediu ao implementar `BeanNameAware`,
   `ApplicationContextAware` e afins. É raro em código de aplicação e comum em
   bibliotecas.
4. **`BeanPostProcessor`, antes da inicialização.** Cada *post-processor* registrado
   recebe o bean e pode inspecioná-lo ou alterá-lo antes do passo 5.
5. **Inicialização.** Rodam os métodos `@PostConstruct` (ou `afterPropertiesSet()` de
   quem implementa `InitializingBean`): é o lugar de validar o estado ou abrir um
   recurso.
6. **`BeanPostProcessor`, depois da inicialização.** Os post-processors podem devolver
   **outro objeto** no lugar do bean — e é **aqui que nascem os proxies** (guarde isto).
7. **Uso.** O que ficou registrado — o bean ou o proxy que o embrulha — é o que os outros
   beans recebem por injeção e o que atende as requisições.
8. **Destruição.** No shutdown do contexto, rodam os métodos `@PreDestroy`.

```
  1 new ─▶ 2 injeção ─▶ 3 *Aware ─▶ 4 BPP before ─▶ 5 @PostConstruct
                                                          │
       8 @PreDestroy ◀── 7 uso ◀── 6 BPP after ◀──────────┘
                                       │
                     pode trocar o bean por um proxy:
                     quem injeta recebe  [proxy] ─▶ [seu bean]
```

Um `BeanPostProcessor` age sobre beans prontos; um `BeanFactoryPostProcessor` age antes,
sobre as *definições* de bean (o passo 3 do marco 01), quando nenhum bean foi criado
ainda. São os pontos de extensão do próprio Boot: `@ConfigurationProperties`,
`@Autowired` e a AOP (*programação orientada a aspectos*: comportamento transversal,
como transação, aplicado em volta dos seus métodos sem estar escrito neles) são todos
implementados como post-processors. Você raramente escreve um, mas saber que existem
explica *como* a anotação vira comportamento.

## Escopos

O padrão é **singleton** (uma instância por contexto) — por isso beans devem ser
*stateless*: guardar estado mutável de request num singleton é bug de concorrência
garantido. `prototype` cria uma instância por injeção; `request`/`session` (web) vivem
o tempo do request. Numa fintech, o *default* singleton + estado só em variáveis locais
é o que mantém o serviço seguro sob carga concorrente.

## Proxies dinâmicos: como a anotação vira comportamento

`@Transactional`, `@Cacheable`, `@Async` **não** são entendidas pelo compilador Java.
Elas funcionam porque, no passo 6 do ciclo de vida, o Spring **embrulha o seu bean num
proxy**. Quem chama o bean recebe, na verdade, o proxy; ele executa o *advice*
(abrir/commitar transação, consultar cache, despachar para outra thread) e **então**
delega ao seu método real.

```
chamador → [proxy: begin tx] → seuBean.metodo() → [proxy: commit]
```

São dois mecanismos: **JDK dynamic proxy**, que implementa as interfaces do bean, e
**CGLIB**, que gera uma subclasse dele. No Spring Framework "puro", a escolha depende de
o bean implementar interface; **no Spring Boot, o default é CGLIB sempre**
(`spring.aop.proxy-target-class=true`), mesmo quando há interface — assim, injetar a
classe concreta não quebra. (Os repositórios do Spring Data são exceção: são proxies JDK
das interfaces que você declara.) O detalhe crucial é o mesmo nos dois: **o advice só
roda quando a chamada passa pelo proxy** — isto é, quando vem *de fora* do bean.

Um efeito colateral do CGLIB: ele só intercepta métodos que a subclasse consegue
sobrescrever. Método `private` ou `final` nunca passa pelo advice — mais um motivo para
o `applyRefund` abaixo não ser privado.

## O bug clássico: self-invocation

Quando um método do bean chama **outro método do mesmo bean** via `this`, a chamada
**não passa pelo proxy** — vai direto ao objeto real. O advice simplesmente **não
roda**. Nenhum erro, nenhum log. A transação que você "declarou" nunca abriu.

```java
@Service
class RefundService {

    // chamada externa passa pelo proxy → transação abre ✔
    public void processRefund(RefundRequest r) {
        validate(r);
        applyRefund(r);   // ⚠ this.applyRefund → NÃO passa pelo proxy
    }

    @Transactional
    void applyRefund(RefundRequest r) {
        ledger.debit(...);
        ledger.credit(...);   // se falhar aqui, o débito NÃO faz rollback
    }
}
```

O desenho mostra onde a chamada se perde:

```
                 ┌────────────── proxy de RefundService ──────────────┐
  controller ──▶ │  advice de processRefund: nenhum                   │
                 │        │                                           │
                 │        ▼                                           │
                 │  ┌────────────── objeto real ──────────────┐       │
                 │  │ processRefund()                         │       │
                 │  │    └─ this.applyRefund() ──┐            │       │
                 │  │                            ▼            │       │
                 │  │ applyRefund()  ◀── chega direto, sem tx │       │
                 │  └─────────────────────────────────────────┘       │
                 │  advice @Transactional de applyRefund: não roda    │
                 └────────────────────────────────────────────────────┘
```

Como `applyRefund` é invocado por `this`, o `@Transactional` é ignorado: débito e
crédito rodam **sem transação**. Se o crédito estoura, o débito já foi persistido —
saldo inconsistente, dinheiro sumido, e o log limpo. Em fintech isso é um incidente
com valor financeiro.

**Como corrigir** (em ordem de preferência):
- **Mova o método transacional para outro bean** e injete-o — a chamada vira externa e
  o proxy volta a agir. É a solução mais limpa e a que revela a fronteira transacional
  no desenho.
- Reposicione o `@Transactional` no método de entrada (`processRefund`), se a granulari-
  dade servir.
- Último recurso: `AopContext.currentProxy()` — funciona, mas acopla o código ao Spring
  e cheira a gambiarra.

Regra mental: **`@Transactional`, `@Cacheable` e `@Async` só funcionam através da
fronteira do bean**. Auto-chamada anula a anotação.

## Exemplo numa fintech

No **pix-gateway**, um estorno (`RefundService`) precisa que débito e crédito sejam
atômicos. Um refactor inocente que extrai `applyRefund` como método privado do mesmo
service quebra a atomicidade **sem quebrar nenhum teste unitário** — porque testes com
mock não exercem o proxy. Só um teste de integração com banco real, forçando falha no
segundo lançamento, expõe o rollback que nunca aconteceu.

## Mão na massa

**Pré-requisito do estado do pix-gateway:** o do marco 03 (`PspProperties` validada, perfis `dev`/`prod`, `src/test/resources/application.properties`). A partir daqui, Docker rodando para o Testcontainers.

**Tutorial — reproduzir e provar o bug de self-invocation.**

1. Escreva `RefundService` com `processRefund` chamando `this.applyRefund` (anotado
   `@Transactional`), onde o crédito lança exceção após o débito ser gravado.
2. Escreva um teste de integração (`@SpringBootTest` + Testcontainers Postgres, marco
   11) que dispara o estorno e **verifica que o débito foi persistido** — provando que
   o rollback não ocorreu. O pix-gateway passa a ter JPA e o driver do Postgres; o
   Testcontainers 2 usa um artefato por módulo, e o `PostgreSQLContainer` mudou de pacote
   e deixou de ser genérico:

   ```xml
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-data-jpa</artifactId>
   </dependency>
   <dependency>
     <groupId>org.postgresql</groupId>
     <artifactId>postgresql</artifactId>
     <scope>runtime</scope>
   </dependency>
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-testcontainers</artifactId>
     <scope>test</scope>
   </dependency>
   <dependency>
     <groupId>org.testcontainers</groupId>
     <artifactId>testcontainers-junit-jupiter</artifactId>
     <scope>test</scope>
   </dependency>
   <dependency>
     <groupId>org.testcontainers</groupId>
     <artifactId>testcontainers-postgresql</artifactId>
     <scope>test</scope>
   </dependency>
   ```

   ```java
   import org.testcontainers.postgresql.PostgreSQLContainer;   // não mais org.testcontainers.containers

   // o Flyway só chega no marco 05; até lá o Hibernate cria as tabelas do teste
   @SpringBootTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
   @Testcontainers
   class RefundServiceIT {
       @Container @ServiceConnection
       static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
       // ...
   }
   ```

   Com JPA no classpath, **todo** `@SpringBootTest` passa a precisar de um banco —
   inclusive o teste de contexto do Initializr e os dos marcos 01 e 02, que agora falham
   com `Failed to determine a suitable driver class`. Dê a eles um Postgres compartilhado
   numa configuração de teste e importe-a em cada um:

   ```java
   @TestConfiguration(proxyBeanMethods = false)
   public class TestcontainersConfiguration {
       @Bean @ServiceConnection
       PostgreSQLContainer postgres() { return new PostgreSQLContainer("postgres:17-alpine"); }
   }
   ```

   ```java
   @SpringBootTest
   @Import(TestcontainersConfiguration.class)
   class PixGatewayApplicationTests { @Test void contextLoads() {} }
   ```
3. Refatore movendo `applyRefund` para um `LedgerTxService` injetado; rode o teste de
   novo e verifique que agora o saldo volta ao original. O mesmo teste, verde depois de
   vermelho, é a prova de que o advice passou a rodar.

   ```bash
   mvn test -Dtest=RefundServiceIT
   ```

   O `-Dtest` é necessário: por convenção, testes com sufixo `IT` são de integração e
   **não** rodam no `mvn test` — o Surefire só pega `*Test` e `*Tests`. Quem os executa é
   o Failsafe, na fase `verify`. O `spring-boot-starter-parent` já configura o plugin,
   mas ele só entra no build quando declarado:

   ```xml
   <build>
     <plugins>
       <plugin>
         <groupId>org.apache.maven.plugins</groupId>
         <artifactId>maven-failsafe-plugin</artifactId>
       </plugin>
       <!-- o spring-boot-maven-plugin continua aqui -->
     </plugins>
   </build>
   ```

   A partir daqui, `mvn verify` roda as duas suítes: unitários e fatias primeiro, depois
   os `*IT`. Sem o Failsafe, um `*IT` vermelho nunca derruba o build.

## Principais aprendizados

- Injeção por construtor + singleton *stateless* é o default seguro sob concorrência.
- `BeanPostProcessor` (passo *after init*) é onde o Spring cria os **proxies** que dão
  vida a `@Transactional`, `@Cacheable`, `@Async` — no Boot, por padrão, proxies CGLIB.
- O advice só roda quando a chamada **atravessa a fronteira do bean**;
  **self-invocation via `this` anula a anotação — silenciosamente**.
- Correção canônica: mover o método anotado para outro bean e injetá-lo. Só teste de
  integração pega esse bug.
