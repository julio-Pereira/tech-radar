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

1. **Instanciação** — o construtor roda. Por isso **injeção por construtor** é o padrão:
   deixa o objeto imutável (`final`), impossível de existir num estado meio-montado, e
   testável sem o container.
2. **Populate** — dependências injetadas.
3. **`BeanPostProcessor` (before)** — ganchos que interceptam *cada* bean antes da
   inicialização.
4. **Init** — `@PostConstruct`, `InitializingBean`.
5. **`BeanPostProcessor` (after)** — **aqui nascem os proxies** (guarde isto).
6. **Uso** — o bean (ou seu proxy) atende requisições.
7. **Destroy** — `@PreDestroy` no shutdown.

`BeanPostProcessor` e `BeanFactoryPostProcessor` são os pontos de extensão do próprio
Boot: `@ConfigurationProperties`, `@Autowired` e AOP são todos implementados como
post-processors. Você raramente escreve um, mas saber que existem explica *como* a
anotação vira comportamento.

## Escopos

O padrão é **singleton** (uma instância por contexto) — por isso beans devem ser
*stateless*: guardar estado mutável de request num singleton é bug de concorrência
garantido. `prototype` cria uma instância por injeção; `request`/`session` (web) vivem
o tempo do request. Numa fintech, o *default* singleton + estado só em variáveis locais
é o que mantém o serviço seguro sob carga concorrente.

## Proxies dinâmicos: como a anotação vira comportamento

`@Transactional`, `@Cacheable`, `@Async` **não** são entendidas pelo compilador Java.
Elas funcionam porque, no passo 5 do ciclo de vida, o Spring **embrulha o seu bean num
proxy**. Quem chama o bean recebe, na verdade, o proxy; ele executa o *advice*
(abrir/commitar transação, consultar cache, despachar para outra thread) e **então**
delega ao seu método real.

```
chamador → [proxy: begin tx] → seuBean.metodo() → [proxy: commit] 
```

São dois mecanismos: **JDK dynamic proxy** (se o bean implementa interface) ou **CGLIB**
(subclasse, se não implementa). O detalhe crucial é o mesmo nos dois: **o advice só roda
quando a chamada passa pelo proxy** — isto é, quando vem *de fora* do bean.

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

**Tutorial — reproduzir e provar o bug de self-invocation.**

1. Escreva `RefundService` com `processRefund` chamando `this.applyRefund` (anotado
   `@Transactional`), onde o crédito lança exceção após o débito ser gravado.
2. Escreva um teste de integração (`@SpringBootTest` + Testcontainers Postgres, marco
   11) que dispara o estorno e **verifica que o débito foi persistido** — provando que
   o rollback não ocorreu.
3. Refatore movendo `applyRefund` para um `LedgerTxService` injetado; rode o teste de
   novo e verifique que agora o saldo volta ao original. O mesmo teste, verde depois de
   vermelho, é a prova de que o advice passou a rodar.

## Principais aprendizados

- Injeção por construtor + singleton *stateless* é o default seguro sob concorrência.
- `BeanPostProcessor` (passo *after init*) é onde o Spring cria os **proxies** que dão
  vida a `@Transactional`, `@Cacheable`, `@Async`.
- O advice só roda quando a chamada **atravessa a fronteira do bean**;
  **self-invocation via `this` anula a anotação — silenciosamente**.
- Correção canônica: mover o método anotado para outro bean e injetá-lo. Só teste de
  integração pega esse bug.
