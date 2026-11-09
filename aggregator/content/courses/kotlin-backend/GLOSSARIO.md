Um verbete por termo: definição em uma frase, o exemplo no `pix-status`, o erro comum associado e o
marco onde o conceito aparece na prática.

## A linguagem

### Tipo de plataforma
**Em uma frase:** o tipo que o Kotlin dá a um valor vindo de Java sem anotação de nulidade (escrito `String!`), que o compilador deixa usar como anulável ou não.
**No pix-status:** o retorno de uma biblioteca Java de assinatura de *webhook* entra como tipo de plataforma.
**Erro comum:** atribuir o tipo de plataforma a um tipo não-nulo e receber a NPE longe da chamada.
**Onde na prática:** marco 02.

### `sealed`
**Em uma frase:** uma classe ou interface cujas subclasses diretas são todas conhecidas pelo compilador, o que torna o `when` exaustivo.
**No pix-status:** o estado do pagamento é uma `sealed interface`.
**Erro comum:** colocar um ramo `else` no `when` e perder o erro de compilação quando um estado novo entra.
**Onde na prática:** marco 03.

### `kotlin-spring`
**Em uma frase:** o plugin de compilador que abre (tira o `final` de) as classes anotadas com `@Component`, `@Transactional`, `@Async`, `@Cacheable` e as meta-anotadas com elas, e os membros delas.
**No pix-status:** a `EntregaDeWebhook`, com `@Service`, é aberta; o `FormatadorDeStatus`, sem anotação, continua `final`.
**Erro comum:** abrir a classe à mão com `open class` e esquecer o método: o `@Transactional` vira decoração, com só um `WARNING` no log.
**Onde na prática:** marco 01.

### Smart cast
**Em uma frase:** a conversão automática que o compilador faz depois de um teste de tipo ou de nulidade, quando consegue provar que o valor não mudou.
**No pix-status:** depois de `is Estado.Rejeitado`, `estado.motivo` compila sem *cast*.
**Erro comum:** esperar *smart cast* numa propriedade `var` de outro objeto; o compilador recusa, porque outra thread pode trocá-la.
**Onde na prática:** marco 01.

### Tipo anulável
**Em uma frase:** um tipo com `?` (`String?`), o único que aceita `null`; sem tratar o caso nulo, o compilador não deixa usar o valor.
**No pix-status:** o `motivo` do evento é `String?`, porque só os estados de rejeição e estorno têm motivo.
**Erro comum:** declarar tudo como anulável para "facilitar", e espalhar `?.` e `!!` pelo código.
**Onde na prática:** marco 02.

### Elvis (`?:`)
**Em uma frase:** o operador que devolve o lado direito quando o esquerdo é `null`; o lado direito pode ser `return`, `throw` ou `error(...)`.
**No pix-status:** `val base = tabela[id] ?: return 0` valida numa linha, e daí para baixo `base` é `Long`.
**Erro comum:** usar um padrão silencioso (`?: ""`) num campo obrigatório, e o erro aparecer longe.
**Onde na prática:** marco 02.

### `!!`
**Em uma frase:** o operador que afirma que um valor não é `null` e lança `NullPointerException`, sem mensagem, quando é.
**No pix-status:** uma regra de *build* com a PSI do compilador proíbe `!!` em `src/main/kotlin`.
**Erro comum:** usar `!!` para calar o compilador; o substituto é `?: error("contexto")`.
**Onde na prática:** marco 02.

### `lateinit`
**Em uma frase:** o modificador de uma `var` não-nula que vai ser preenchida depois da construção; o acesso antes disso lança `UninitializedPropertyAccessException`.
**No pix-status:** só em teste (`@BeforeEach`); nenhum DTO do `pix-status` usa `lateinit`.
**Erro comum:** usar `lateinit` num DTO de JSON: o campo ausente passa na leitura e falha no primeiro acesso.
**Onde na prática:** marco 02.

### `by lazy`
**Em uma frase:** a delegação que calcula o valor de uma `val` na primeira leitura e o guarda; sincronizada por padrão.
**No pix-status:** o mapa de regras compiladas da DSL é calculado na primeira notificação.
**Erro comum:** usar `by lazy` para algo que depende de estado que muda; o valor fica congelado na primeira leitura.
**Onde na prática:** marco 02.

### `Nothing`
**Em uma frase:** o tipo de uma expressão que nunca termina normalmente (`throw`, `error(...)`, `TODO()`), subtipo de todos os tipos.
**No pix-status:** é o que deixa `?: error("pagamento sem e2eId")` compilar onde se espera uma `String`.
**Erro comum:** confundir com `Unit`, o "nada de útil" que uma função comum devolve.
**Onde na prática:** marco 02.

### Variância de declaração
**Em uma frase:** a variância decidida na interface, com `out` (só produz) e `in` (só consome), em vez de em cada uso.
**No pix-status:** a `Fonte<out T>` de eventos aceita uma `Fonte<EventoPix>` onde se pede `Fonte<Evento>`.
**Erro comum:** usar `out T` num parâmetro de método; o compilador recusa, porque quebraria a segurança de tipo.
**Onde na prática:** marco 02.

### `reified`
**Em uma frase:** o parâmetro de tipo de uma função `inline` que continua disponível em tempo de execução, sem a *erasure*.
**No pix-status:** `mapper.readValue<EventoDeEstado>(json)` sabe a classe a criar sem receber o `Class`.
**Erro comum:** tentar `reified` numa função que não é `inline`; não compila.
**Onde na prática:** marco 02.

### `data class`
**Em uma frase:** a classe que gera `equals`, `hashCode`, `toString`, `componentN` e `copy` a partir das propriedades do construtor primário.
**No pix-status:** o `EventoDeEstado` e os estados com dados são `data class` só com `val`.
**Erro comum:** usar `data class` como entidade JPA: a igualdade usa o id que muda ao persistir, e o `toString` percorre associações.
**Onde na prática:** marco 03.

### `copy`
**Em uma frase:** o método gerado da `data class` que cria uma cópia trocando os campos nomeados, chamando o construtor primário direto.
**No pix-status:** `@ConsistentCopyVisibility` impede que o `copy` crie um valor negativo sem passar pela fábrica.
**Erro comum:** esquecer que o `copy` fura o construtor privado; no Kotlin 2.3 é só aviso, e na linguagem 2.5 vira erro.
**Onde na prática:** marco 03.

### `value class`
**Em uma frase:** uma classe de uma propriedade só, anotada com `@JvmInline`, que em tempo de execução é o valor de dentro, sem objeto em volta.
**No pix-status:** `PixKey` e `PaymentId` são `String`s com tipo próprio, e a `PixKey` inválida não se constrói.
**Erro comum:** esperar ganho de memória em `List<PixKey>`: em genérico, nulável ou `Any`, ela vira objeto.
**Onde na prática:** marco 03.

### When exaustivo
**Em uma frase:** o `when` usado como expressão sobre um tipo selado, que precisa cobrir todos os subtipos para compilar.
**No pix-status:** a máquina de estados não tem `else`, e um estado novo não compila até ser tratado.
**Erro comum:** pôr um `else` "por segurança", que desliga a conferência do compilador.
**Onde na prática:** marco 03.

### Extensão
**Em uma frase:** uma função declarada fora da classe que é chamada como método dela, mas é estática e escolhida pelo tipo declarado.
**No pix-status:** `fun Instant.formatoBacen()` formata a data do *webhook* sem mexer em `Instant`.
**Erro comum:** pôr regra que depende do subtipo numa extensão: a do supertipo é chamada quando o tipo declarado é o supertipo.
**Onde na prática:** marco 04.

### `inline`
**Em uma frase:** o modificador de uma função de alta ordem cujo corpo, e o das lambdas passadas, é copiado para o ponto de chamada.
**No pix-status:** as funções de coleção usadas no `pix-status` são `inline`, e não alocam objeto de lambda.
**Erro comum:** esquecer que o `return` dentro da lambda de uma função `inline` sai da função de fora.
**Onde na prática:** marco 04.

### Lambda with receiver
**Em uma frase:** uma lambda do tipo `T.() -> Unit`, em que `this` é um objeto `T`, e as chamadas dispensam o prefixo.
**No pix-status:** a DSL `regras { quando(...) { webhook(...) } }` é feita de duas lambdas assim.
**Erro comum:** aninhar blocos sem `@DslMarker` e chamar, sem perceber, a função do bloco de fora.
**Onde na prática:** marco 04.

### `@DslMarker`
**Em uma frase:** a meta-anotação que proíbe usar implicitamente o *receiver* de um bloco de fora dentro de um bloco de dentro da DSL.
**No pix-status:** um `quando` dentro de outro `quando` não compila.
**Erro comum:** marcar só um dos *builders*; a proteção vale entre os que têm a mesma anotação.
**Onde na prática:** marco 04.

### `Sequence`
**Em uma frase:** a coleção preguiçosa do Kotlin: cada elemento passa pela cadeia inteira antes do próximo, e nada roda até a operação terminal.
**No pix-status:** a busca dos dez primeiros estornos num milhão de eventos aloca 448 B com `Sequence` e 11,3 MB com `List`.
**Erro comum:** trocar toda `List` por `Sequence`; em coleção pequena, a `List` é mais rápida, e o `map` para `Long` ainda pode alocar.
**Onde na prática:** marco 04.

## Coroutines

### `suspend`
**Em uma frase:** marca uma função que pode suspender sem bloquear a *thread*; o compilador a reescreve com uma *continuation*.
**No pix-status:** a entrega de um *webhook* é uma função `suspend`.
**Erro comum:** chamar um cliente HTTP bloqueante dentro da função `suspend` e prender a *thread* do *dispatcher*.
**Onde na prática:** marco 05.

### `CancellationException`
**Em uma frase:** a exceção que sinaliza o cancelamento de uma coroutine, e que precisa ser propagada.
**No pix-status:** o cliente desiste da consulta de status, e as buscas filhas recebem o cancelamento.
**Erro comum:** um `catch (e: Exception)` que engole o cancelamento e transforma a desistência em sucesso.
**Onde na prática:** marco 06.

### Continuation
**Em uma frase:** o objeto que o compilador passa escondido a toda função `suspend`, e que sabe continuar a execução depois da suspensão.
**No pix-status:** as variáveis da entrega que atravessam o `await` viram campos da *continuation*, no heap.
**Erro comum:** achar que a coroutine parada guarda uma pilha; ela guarda um objeto, de ~370 B no caso medido.
**Onde na prática:** marco 05.

### Dispatcher
**Em uma frase:** o componente que decide em que threads uma coroutine roda: `Default` (núcleos), `IO` (até 64) ou uma vista com `limitedParallelism`.
**No pix-status:** o cliente JDBC legado roda numa vista do IO com no máximo 10 threads.
**Erro comum:** pôr chamada bloqueante no `Default`, que tem só tantas threads quanto núcleos.
**Onde na prática:** marco 05.

### `launch` e `async`
**Em uma frase:** os construtores de coroutine: `launch` devolve um `Job`, sem valor; `async` devolve um `Deferred`, com `await()`.
**No pix-status:** cada entrega é um `launch`; as buscas paralelas do status são `async`.
**Erro comum:** chamar `await()` logo depois de cada `async`, o que tira o paralelismo.
**Onde na prática:** marco 05.

### `withContext`
**Em uma frase:** troca o *dispatcher* (ou outro elemento do contexto) só para um bloco, suspende quem chamou e devolve o valor do bloco.
**No pix-status:** `withContext(Dispatchers.IO) { repositorio.buscar(id) }` isola a chamada bloqueante.
**Erro comum:** esperar concorrência; `withContext` executa o bloco e espera, sem lançar nada em paralelo.
**Onde na prática:** marco 05.

### `runBlocking`
**Em uma frase:** a ponte do mundo bloqueante para o suspenso: roda uma coroutine e bloqueia a thread que chamou até ela terminar.
**No pix-status:** só aparece no `main` de uma ferramenta de linha de comando e em testes.
**Erro comum:** usar dentro de um *controller*, que prende a thread da requisição.
**Onde na prática:** marco 05.

### Concorrência estruturada
**Em uma frase:** o modelo em que toda coroutine pertence a um escopo, que espera as filhas, cancela as filhas ao ser cancelado e recebe a falha delas.
**No pix-status:** a consulta de status não deixa nenhuma busca viva depois de responder ou de ser cancelada.
**Erro comum:** criar um escopo à mão dentro de um método, fora da árvore da requisição.
**Onde na prática:** marco 06.

### `coroutineScope`
**Em uma frase:** o escopo em que a falha de uma filha cancela as irmãs e sobe para quem chamou: tudo ou nada.
**No pix-status:** o ledger, obrigatório, roda no `coroutineScope` da consulta de status.
**Erro comum:** usá-lo para partes independentes, e perder a resposta inteira por causa de uma opcional.
**Onde na prática:** marco 06.

### `supervisorScope`
**Em uma frase:** o escopo em que a falha de uma filha não cancela as irmãs; cada uma é tratada por quem chama `await` ou pelo *handler*.
**No pix-status:** o antifraude e o DICT, opcionais, rodam num `supervisorScope`, e a falha de um vira `null`.
**Erro comum:** esquecer de tratar a falha da filha, que então vai para o *handler* do escopo pai.
**Onde na prática:** marco 06.

### Cancelamento cooperativo
**Em uma frase:** o cancelamento que só tem efeito quando a coroutine chega a um ponto de suspensão ou confere `isActive`/`ensureActive()`.
**No pix-status:** o laço de conciliação chama `ensureActive()` a cada bloco de eventos.
**Erro comum:** um laço de CPU sem ponto de suspensão, que roda até o fim mesmo cancelado (300 ms contra os 50 ms do prazo).
**Onde na prática:** marco 06.

### `withTimeout`
**Em uma frase:** o prazo de um bloco suspenso: lança `TimeoutCancellationException` ao estourar; `withTimeoutOrNull` devolve `null`.
**No pix-status:** cada entrega de *webhook* tem `withTimeout(prazo)`, e cada fonte opcional `withTimeoutOrNull(300 ms)`.
**Erro comum:** deixar o `withTimeout` estourar dentro de `launch`: a coroutine é cancelada em silêncio, sem passar pelo *handler*.
**Onde na prática:** marco 06.

### `NonCancellable`
**Em uma frase:** o contexto que deixa um bloco suspenso rodar mesmo com a coroutine já cancelada, para limpeza.
**No pix-status:** a devolução da conexão e a gravação da auditoria no `finally` rodam em `withContext(NonCancellable)`.
**Erro comum:** chamar uma função suspensa no `finally` de uma coroutine cancelada sem ele, e receber outra `CancellationException`.
**Onde na prática:** marco 06.

### `GlobalScope`
**Em uma frase:** um escopo sem dono, que vive o processo inteiro: a coroutine lançada nele não tem pai.
**No pix-status:** nenhuma; a regra é nunca usá-lo no `pix-status`.
**Erro comum:** lançar tarefa de fundo nele; ninguém a cancela, ninguém a espera, e o erro dela só aparece como um *stack trace* do *uncaught handler*.
**Onde na prática:** marco 06.

### `Flow`
**Em uma frase:** uma sequência assíncrona fria e sequencial, em que o `emit` suspende até o coletor terminar.
**No pix-status:** as mudanças de estado chegam como um `Flow<MudancaDeEstado>` e alimentam o pipeline de *webhooks*.
**Erro comum:** achar que um `Flow` guarda o resultado; cada coletor executa o bloco de novo.
**Onde na prática:** marco 07.

### `SharedFlow`
**Em uma frase:** um fluxo quente que transmite cada valor para todos os coletores ativos, com `replay` opcional.
**No pix-status:** o fluxo de mudanças é compartilhado entre o pipeline de *webhooks* e as métricas, com `shareIn`.
**Erro comum:** criá-lo com um escopo que vive para sempre, o que é um `GlobalScope` com outro nome.
**Onde na prática:** marco 07.

### `StateFlow`
**Em uma frase:** um `SharedFlow` com valor atual e `conflate` embutido: quem coleta recebe o estado atual e as mudanças seguintes.
**No pix-status:** o último estado conhecido de cada pagamento, para a consulta rápida.
**Erro comum:** usar para eventos que não podem se perder; o `StateFlow` guarda só o último.
**Onde na prática:** marco 07.

### `buffer`
**Em uma frase:** o operador que desacopla produtor e coletor com um *buffer* limitado; cheio, o produtor suspende.
**No pix-status:** com `buffer(16)`, o produtor ficou no máximo 18 itens à frente do consumidor lento.
**Erro comum:** usar *buffer* ilimitado, que troca o *backpressure* por memória.
**Onde na prática:** marco 07.

### `conflate`
**Em uma frase:** o operador que guarda só o valor mais recente enquanto o coletor trabalha, descartando os intermediários.
**No pix-status:** o painel de status mostra o último estado e pula os intermediários (`[0, 3, 6, 9]` no teste).
**Erro comum:** usar em eventos que precisam todos ser processados, como as mudanças que viram *webhook*.
**Onde na prática:** marco 07.

### `flowOn`
**Em uma frase:** o operador que muda o *dispatcher* da parte do fluxo que vem antes dele; o coletor fica onde estava.
**No pix-status:** a leitura do *broker* roda no IO com `flowOn`, e o pipeline coleta no seu próprio contexto.
**Erro comum:** usar `withContext` dentro do `flow { }`, que lança `Flow invariant is violated`.
**Onde na prática:** marco 07.

## No servidor

### `kotlin-jpa`
**Em uma frase:** o plugin de compilador que gera um construtor sem argumentos para as classes com `@Entity`, `@Embeddable` e `@MappedSuperclass`.
**No pix-status:** não há entidade JPA no `pix-status`; o plugin aparece no marco 02, no caso do JSON que nasce com `null`.
**Erro comum:** achar que ele abre a classe; para o *lazy loading* por proxy, a entidade também precisa do `all-open`.
**Onde na prática:** marco 08.

### `@Transactional` em `suspend`
**Em uma frase:** a anotação de transação numa função `suspend`, que o Spring trata como chamada reativa e só transaciona com um `ReactiveTransactionManager`.
**No pix-status:** com R2DBC, a falha entre as duas gravações deixa zero linhas.
**Erro comum:** usá-la com JDBC: a transação fecha antes do corpo rodar, e nada é desfeito, sem aviso.
**Onde na prática:** marco 08.

### `BeanRegistrarDsl`
**Em uma frase:** a DSL Kotlin do `BeanRegistrar` do Spring 7, que registra *beans* com código comum em vez de métodos `@Bean`.
**No pix-status:** o `RelogioDeNegocio` é registrado por um `BeanRegistrarDsl` importado na aplicação.
**Erro comum:** usar a DSL para o que um `@Component` resolve; ela compensa quando o registro tem `if` ou `for`.
**Onde na prática:** marco 08.

### Propagação de contexto em coroutines
**Em uma frase:** o mecanismo que leva o MDC e o *trace* através das trocas de thread de uma coroutine, ligado no Boot 4 por `spring.reactor.context-propagation=auto`.
**No pix-status:** a linha de log escrita depois do `delay` sai com o mesmo `trace_id` de antes.
**Erro comum:** esperar que o `ThreadLocal` do MDC sobreviva sozinho à troca de thread.
**Onde na prática:** marco 08.

### Ktor
**Em uma frase:** o *framework* de servidor da JetBrains, em Kotlin e com coroutines na base: *plugins*, rotas `suspend` e *engine*, sem container nem proxy.
**No pix-status:** a versão Ktor do `pix-status` passa o mesmo contrato HTTP da versão Spring.
**Erro comum:** escolhê-lo onde o time precisa de transação declarativa, segurança e Actuator prontos.
**Onde na prática:** marco 09.

### `@JvmStatic`
**Em uma frase:** a anotação que gera um método estático na classe para uma função do `companion object` ou de um `object`.
**No pix-status:** o Java escreve `ConsultaStatus.emMemoria()`, sem `Companion`.
**Erro comum:** esquecê-la numa biblioteca usada por Java, e obrigar os clientes a escrever `Classe.Companion.metodo()`.
**Onde na prática:** marco 09.

### `@JvmOverloads`
**Em uma frase:** a anotação que gera uma sobrecarga Java para cada parâmetro com valor padrão, a partir do último.
**No pix-status:** o Java chama `consultar("P1")` sem o segundo argumento.
**Erro comum:** removê-la numa versão nova da biblioteca, e quebrar a compilação dos clientes Java.
**Onde na prática:** marco 09.

### `@Throws`
**Em uma frase:** a anotação que declara, para o Java, as exceções verificadas que uma função Kotlin lança.
**No pix-status:** o `catch (PagamentoNaoEncontrado e)` do teste Java só compila por causa dela.
**Erro comum:** omiti-la: o Java não consegue capturar a exceção (`never thrown in body of corresponding try statement`).
**Onde na prática:** marco 09.

### Teste de contrato
**Em uma frase:** um teste que fixa a resposta de uma interface (status, cabeçalhos, corpo) e roda igual contra cada implementação.
**No pix-status:** o mesmo arquivo de contrato compara byte a byte os corpos do Spring e do Ktor.
**Erro comum:** testar só o domínio e supor que a borda HTTP é igual nas duas pilhas.
**Onde na prática:** marco 09.
