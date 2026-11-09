Um verbete por termo: definição em uma frase, o exemplo no `pix-status`, o erro comum associado e o
marco onde o conceito aparece na prática. O glossário completo chega com o Bloco C; os verbetes do
Bloco A já estão aqui.

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
