Um verbete por termo: definição em uma frase, o exemplo no `pix-core`, o erro comum associado e o
marco onde o conceito aparece na prática.

## A linguagem

### Preview
**Em uma frase:** um recurso completo da linguagem ou da API, entregue desligado e sujeito a mudar, que só compila e roda com `--enable-preview`.
**No pix-core:** padrões de tipo primitivo ainda são *preview* no Java 25, então o domínio não os usa.
**Erro comum:** ligar `--enable-preview` em produção: a classe compilada no 25 é recusada pelo JDK 27.
**Onde na prática:** marco 01.

### Contrato de equals
**Em uma frase:** `equals` precisa ser reflexivo, simétrico, transitivo e consistente, e objetos iguais precisam ter o mesmo `hashCode`.
**No pix-core:** o EqualsVerifier confere o contrato da `PaymentKey` e do `Money`.
**Erro comum:** sobrescrever `equals` sem `hashCode`; o `javac -Xlint:all` avisa com `[overrides]`.
**Onde na prática:** marco 02.

### hashCode
**Em uma frase:** o número que decide o *bucket* de um objeto num `HashMap` ou `HashSet`.
**No pix-core:** o `hashCode` gerado pelo record da `PaymentKey` usa os dois componentes.
**Erro comum:** um campo mutável no hash, que faz o objeto "sumir" do conjunto sem sair dele.
**Onde na prática:** marco 02, retomado no marco 03.

### Autoboxing
**Em uma frase:** a conversão automática entre um primitivo (`long`) e o objeto correspondente (`Long`).
**No pix-core:** o fechamento soma centavos em `LongStream`, sem embrulhar cada valor.
**Erro comum:** um `reduce` sobre `Stream<Long>`, medido 15 vezes mais lento que o `LongStream`.
**Onde na prática:** marco 02, retomado no marco 06.

### Cache de Integer
**Em uma frase:** `Integer.valueOf` devolve objetos compartilhados de −128 a 127, e objetos novos fora dessa faixa.
**No pix-core:** nenhuma comparação de `Integer` usa `==`.
**Erro comum:** comparar `Integer` com `==`, que funciona no teste com 127 e falha em produção com 128.
**Onde na prática:** marco 02.

### Record
**Em uma frase:** uma classe que declara o estado e ganha construtor, acessores, `equals`, `hashCode` e `toString` por componente.
**No pix-core:** `Money`, `PaymentKey`, `PixKey` e os estados do pagamento são records.
**Erro comum:** achar que o record é imutável por inteiro: um componente `List` ou `int[]` continua mutável.
**Onde na prática:** marco 02, retomado no marco 05.

### Construtor compacto
**Em uma frase:** o construtor de um record sem lista de parâmetros, que roda antes da atribuição dos campos.
**No pix-core:** a `PixKey` valida o CPF e o e-mail ali, e uma chave inválida não nasce.
**Erro comum:** validar fora do tipo, em cada lugar que cria o objeto.
**Onde na prática:** marco 02.

### Cópia defensiva
**Em uma frase:** copiar um componente mutável na entrada, para que quem o passou não consiga alterar o objeto depois.
**No pix-core:** o `Lote` faz `parcelas = List.copyOf(parcelas)` no construtor.
**Erro comum:** usar `Collections.unmodifiableList`, que é só uma visão sobre a lista original.
**Onde na prática:** marco 02.

### Value-based class
**Em uma frase:** uma classe cuja identidade não é garantida, como `Integer`, `LocalDate` e `Optional`.
**No pix-core:** nenhuma trava usa um desses objetos como monitor.
**Erro comum:** `synchronized` num `Integer`; o `javac` avisa com `[identity]`.
**Onde na prática:** marco 02.

### Erasure
**Em uma frase:** o compilador confere os argumentos de tipo dos generics e os apaga no bytecode.
**No pix-core:** o repositório genérico recebe uma fábrica, porque não pode fazer `new T()`.
**Erro comum:** tentar `instanceof List<String>` a partir de um `Object`, que não compila.
**Onde na prática:** marco 04.

### PECS
**Em uma frase:** *Producer Extends, Consumer Super*: `? extends T` para quem fornece, `? super T` para quem recebe.
**No pix-core:** `copiar(List<? extends T> origem, List<? super T> destino)`.
**Erro comum:** declarar `List<T>` nos dois lados e recusar uma `List<Integer>` onde cabia.
**Onde na prática:** marco 04.

### Heap pollution
**Em uma frase:** uma variável de tipo parametrizado apontando para um objeto que não é daquele tipo.
**No pix-core:** nenhum método devolve o array de um *varargs* genérico.
**Erro comum:** confiar no `@SafeVarargs` de um método que deixa o array escapar.
**Onde na prática:** marco 04.

### Raw type
**Em uma frase:** um tipo genérico usado sem argumento (`List`), que desliga a checagem.
**No pix-core:** o build usa `-Xlint:all -Werror`, e um *raw type* reprova o build.
**Erro comum:** manter *raw types* de código legado e perder a checagem em tudo o que os toca.
**Onde na prática:** marco 04.

### Sealed
**Em uma frase:** uma classe ou interface que lista quem pode estendê-la, com `permits`.
**No pix-core:** `Estado` e `Evento` do pagamento são *sealed interfaces*.
**Erro comum:** um `default` num `switch` sobre tipo selado, que esconde o caso novo.
**Onde na prática:** marco 05.

### Exaustividade
**Em uma frase:** a garantia do compilador de que um `switch` sobre tipo selado cobre todos os subtipos.
**No pix-core:** acrescentar um evento quebra a compilação da `Maquina`, e um teste prova isso.
**Erro comum:** esquecer que código não recompilado recebe o caso novo como `MatchException`.
**Onde na prática:** marco 05.

### Record pattern
**Em uma frase:** um padrão que desmonta um record no `case` ou no `instanceof`, inclusive aninhado.
**No pix-core:** `case Autorizado(var e2e) -> ...` na máquina de estados.
**Erro comum:** um caso dominado por um anterior mais geral, que o compilador recusa.
**Onde na prática:** marco 05.

### Stream preguiçoso
**Em uma frase:** operações intermediárias só descrevem o trabalho, que roda quando chega a operação terminal.
**No pix-core:** o fechamento roda inteiro no `collect` do `groupingBy`.
**Erro comum:** contar com efeito colateral num `map`: o `count()` pode nem executar o *pipeline*.
**Onde na prática:** marco 06.

### Operação terminal
**Em uma frase:** a operação que põe o *stream* para rodar e produz o resultado, como `collect`, `sum` ou `findFirst`.
**No pix-core:** `findFirst` faz curto-circuito e não lê o resto dos elementos.
**Erro comum:** montar um *stream* sem terminal e esperar que algo aconteça.
**Onde na prática:** marco 06.

### Gatherer
**Em uma frase:** uma operação intermediária definida por você (Java 24), com prontas como `windowFixed` e `mapConcurrent`.
**No pix-core:** `mapConcurrent` faz as consultas com I/O em *virtual threads*, preservando a ordem.
**Erro comum:** usar `.parallel()` para I/O, que trava o `commonPool` do processo.
**Onde na prática:** marco 06.

### Optional
**Em uma frase:** o retorno de um método que pode não ter resultado.
**No pix-core:** `porId` do repositório devolve `Optional`.
**Erro comum:** usar `Optional` como campo ou parâmetro, onde só acrescenta um objeto.
**Onde na prática:** marco 06.

### Efetivamente final
**Em uma frase:** uma variável local atribuída uma vez só, a única que uma lambda pode capturar.
**No pix-core:** as lambdas do fechamento capturam só valores que não mudam.
**Erro comum:** tentar acumular num contador local dentro de uma lambda.
**Onde na prática:** marco 06.

### Try-with-resources
**Em uma frase:** o `try (...)` que fecha cada recurso no fim do bloco, na ordem inversa da abertura.
**No pix-core:** o teste da taxonomia confere que o erro do corpo propaga.
**Erro comum:** um `try`/`finally` escrito à mão, em que a exceção do `close()` substitui a do corpo.
**Onde na prática:** marco 07.

### Exceção suprimida
**Em uma frase:** a exceção do `close()` guardada dentro da exceção principal, lida com `getSuppressed()`.
**No pix-core:** o teste exige exatamente uma suprimida, que é a do fechamento.
**Erro comum:** registrar só a mensagem da exceção principal e perder a suprimida no *log*.
**Onde na prática:** marco 07.

## Coleções

### Fator de carga
**Em uma frase:** a fração de ocupação (0,75 por padrão) a partir da qual o `HashMap` dobra a tabela.
**No pix-core:** um mapa de tamanho conhecido nasce com `HashMap.newHashMap(n)`.
**Erro comum:** criar o mapa vazio e pagar vários *resizes* ao enchê-lo.
**Onde na prática:** marco 03.

### Resize
**Em uma frase:** a troca da tabela do `HashMap` por uma do dobro do tamanho, redistribuindo as entradas.
**No pix-core:** com 12 entradas a tabela tem 16 posições, com 13 tem 32 (conferido por reflexão).
**Erro comum:** ignorar o custo do *resize* num mapa que cresce no caminho quente.
**Onde na prática:** marco 03.

### Treeification
**Em uma frase:** um *bucket* com mais de 8 entradas, numa tabela de 64 ou mais, vira uma árvore rubro-negra.
**No pix-core:** o JMH mostra a árvore limitando o estrago de um hash ruim com chave `Comparable`.
**Erro comum:** um hash constante numa chave sem `Comparable`: a busca medida foi de três a quatro ordens de grandeza mais lenta.
**Onde na prática:** marco 03.

### Fail-fast
**Em uma frase:** o iterador que lança `ConcurrentModificationException` quando a coleção muda fora dele, por melhor esforço.
**No pix-core:** remoções durante a iteração usam `removeIf`.
**Erro comum:** confiar na exceção: remover o penúltimo elemento num `for-each` não a lança.
**Onde na prática:** marco 03.

### LRU
**Em uma frase:** a política de despejar a entrada usada há mais tempo quando o cache enche.
**No pix-core:** o `CacheLru` usa `LinkedHashMap` com ordem de acesso e `removeEldestEntry`.
**Erro comum:** um cache sem limite, que vira vazamento.
**Onde na prática:** marco 03.

### ConcurrentHashMap
**Em uma frase:** o mapa concorrente com operações atômicas por chave (`compute`, `merge`) e sem `null`.
**No pix-core:** o limite diário soma com `merge`, que deu o total exato nas três rodadas medidas.
**Erro comum:** `get` seguido de `put`, que perdeu até 54% dos incrementos com 16 threads.
**Onde na prática:** marco 03.

### Coleção sequenciada
**Em uma frase:** as interfaces do Java 21 para ordem definida: `getFirst`, `getLast` e `reversed` nas coleções, `firstEntry` e `lastEntry` nos mapas.
**No pix-core:** os últimos lançamentos de uma lista são lidos com `reversed()`, sem cópia.
**Erro comum:** copiar a lista e chamar `Collections.reverse` só para ler de trás para a frente.
**Onde na prática:** marco 03.

### NavigableMap
**Em uma frase:** a interface do `TreeMap` para consultas por faixa: `floorKey`, `ceilingEntry`, `subMap`.
**No pix-core:** a tarifa vigente numa data sai de um `floorEntry`.
**Erro comum:** percorrer um `HashMap` inteiro para achar a faixa certa.
**Onde na prática:** marco 03.

## A JVM

### Frame
**Em uma frase:** o bloco que cada chamada de método empilha na pilha da thread, com as variáveis locais, os operandos e o endereço de volta.
**No pix-core:** o *frame* de `autorizar` guarda o `long` do limite e a referência ao `Pagamento`, que mora no heap.
**Erro comum:** recursão sobre entrada externa, como uma cadeia de estornos, que esgota a pilha com `StackOverflowError`.
**Onde na prática:** marco 08.

### GC root
**Em uma frase:** uma referência de onde o GC começa a marcação: variáveis dos *frames* vivos, campos estáticos e referências globais de JNI.
**No pix-core:** o campo estático que segura o cache de chaves DICT é uma raiz, e tudo o que o cache alcança está vivo.
**Erro comum:** achar que um ciclo de objetos vaza; sem caminho a partir de uma raiz, o ciclo é coletado.
**Onde na prática:** marco 08.

### Compactação
**Em uma frase:** mover os objetos vivos para juntá-los e atualizar as referências, acabando com a fragmentação que a varredura deixa.
**No pix-core:** o G1 evacua as regiões do heap do serviço durante a pausa, e o ZGC faz o mesmo com a aplicação rodando.
**Erro comum:** achar que mais lixo deixa a coleta jovem mais lenta; copiar e compactar custam proporcionalmente ao que está vivo.
**Onde na prática:** marco 08.

### Heap
**Em uma frase:** a área de memória dos objetos Java, limitada por `-Xmx` e dividida em gerações.
**No pix-core:** o README dimensiona o heap em 60% do limite do contêiner.
**Erro comum:** achar que o `-Xmx` é a memória do processo.
**Onde na prática:** marco 08.

### Metaspace
**Em uma frase:** a memória fora do heap com os metadados das classes carregadas.
**No pix-core:** o serviço fixa `-XX:MaxMetaspaceSize` no cálculo de memória.
**Erro comum:** um *classloader* que vaza e esgota o *metaspace* (`OutOfMemoryError: Metaspace`).
**Onde na prática:** marco 08.

### TLAB
**Em uma frase:** o pedaço do *eden* exclusivo de cada thread, em que alocar é empurrar um ponteiro.
**No pix-core:** os objetos de uma validação são alocados na TLAB e morrem jovens.
**Erro comum:** achar que alocar em Java é caro; o caro é o que sobrevive.
**Onde na prática:** marco 08.

### Hipótese geracional
**Em uma frase:** a maioria dos objetos morre jovem, e por isso o GC coleta a geração jovem com mais frequência.
**No pix-core:** os objetos de uma validação de pagamento morrem antes da próxima coleta jovem.
**Erro comum:** um cache sem limite que promove tudo para a geração velha.
**Onde na prática:** marco 08.

### G1
**Em uma frase:** o coletor padrão, com o heap em regiões e uma pausa alvo (200 ms por padrão).
**No pix-core:** o melhor equilíbrio na carga medida com 2 CPUs: ~33 milhões de operações e 1,7 ms de pausa p99.
**Erro comum:** achar que ele é sempre o escolhido: abaixo de 2 CPUs ou 1792 MiB, a JVM usa o Serial.
**Onde na prática:** marco 08.

### ZGC
**Em uma frase:** o coletor quase todo concorrente, com pausas de microssegundos, só geracional desde o Java 24.
**No pix-core:** 0,04 ms de pausa p99 na carga medida, com menos *throughput* que o G1 em 2 CPUs.
**Erro comum:** olhar só a pausa e ignorar o tempo para chegar ao *safepoint* e a CPU que ele consome.
**Onde na prática:** marco 08.

### MaxRAMPercentage
**Em uma frase:** a porcentagem da memória do contêiner usada como heap máximo, 25 por padrão.
**No pix-core:** o serviço usa 60%, deixando o resto para o que não é heap.
**Erro comum:** deixar o padrão e usar só um quarto do contêiner como heap.
**Onde na prática:** marco 08.

### OOMKilled
**Em uma frase:** o kernel matando o processo que passou do limite do contêiner, com código 137 e sem exceção.
**No pix-core:** reproduzido com o heap em 60% e a memória direta sem limite.
**Erro comum:** confundir com `OutOfMemoryError` e aumentar o `-Xmx`, o que piora.
**Onde na prática:** marco 08.

### JIT
**Em uma frase:** o compilador que transforma em código de máquina os métodos que rodam muito, enquanto a aplicação roda.
**No pix-core:** o `PrintCompilation` mostra `Tier::total` subindo do nível 3 para o 4.
**Erro comum:** medir com um laço à mão, que mede o interpretador ou mede nada.
**Onde na prática:** marco 09.

### C1 e C2
**Em uma frase:** o compilador rápido com coleta de perfil (C1) e o otimizador que usa o perfil (C2).
**No pix-core:** o C2 faz *inline* da tarifa quando só um tipo chega.
**Erro comum:** achar que o código compilado é definitivo: a aposta do C2 pode falhar.
**Onde na prática:** marco 09.

### Desotimização
**Em uma frase:** descartar o código compilado quando a aposta do perfil falha, voltar ao interpretador e recompilar.
**No pix-core:** a troca de tipo de tarifa gera `made not entrant: uncommon trap` no log.
**Erro comum:** um caminho quente que alterna tipos e vive desotimizando.
**Onde na prática:** marco 09.

### OSR
**Em uma frase:** *on-stack replacement*: trocar um laço que já está rodando por código compilado no meio da execução.
**No pix-core:** aparece com `%` no `PrintCompilation` do laço de 2 milhões de iterações.
**Erro comum:** concluir que um laço longo nunca é compilado.
**Onde na prática:** marco 09.

### CDS
**Em uma frase:** *Class Data Sharing*: as classes do JDK pré-carregadas num arquivo mapeado em memória, ligado por padrão.
**No pix-core:** sem CDS, o *driver* levou de 234 a 295 ms até o primeiro 200; com o padrão, de 165 a 200 ms.
**Erro comum:** desligar com `-Xshare:off` sem saber o que perde.
**Onde na prática:** marco 09.

### Cache AOT
**Em uma frase:** o arquivo do Java 24 e 25 com as classes da aplicação carregadas, ligadas e com perfil, gerado num treino.
**No pix-core:** cortou a subida do *driver* para 122 a 143 ms.
**Erro comum:** gerar com diretórios no *classpath*: a criação falha com `non-empty directory`.
**Onde na prática:** marco 09.

### Warmup
**Em uma frase:** o tempo até o código atingir o desempenho de regime, depois que o JIT compilou os caminhos quentes.
**No pix-core:** ~1,4 ms nas primeiras requisições e ~0,4 ms depois de 2.000.
**Erro comum:** dar tráfego cheio a uma réplica que acabou de subir.
**Onde na prática:** marco 09.

### Safepoint
**Em uma frase:** o ponto em que todas as threads da aplicação param para a JVM fazer uma operação global.
**No pix-core:** `-Xlog:safepoint` separou a pausa do GC das paradas de `PrintThreads`.
**Erro comum:** medir só o tempo parado e esquecer o tempo para chegar ao *safepoint*.
**Onde na prática:** marco 08, retomado no marco 10.

### JFR
**Em uma frase:** o *Flight Recorder*, que grava eventos da JVM e da aplicação continuamente, para ler no JMC ou com `jfr view`.
**No pix-core:** o `memory-leaks-by-site` apontou o vazamento da *fixture*.
**Erro comum:** tirar o *dump* depois que o processo morreu: com OOM, a gravação ficou vazia.
**Onde na prática:** marco 10.

### Heap dump
**Em uma frase:** o heap inteiro gravado num arquivo `.hprof`, com cada objeto e cada `String`.
**No pix-core:** o *dump* da *fixture* tinha 32.011 CPFs legíveis.
**Erro comum:** mandar o *dump* de produção para fora do ambiente controlado.
**Onde na prática:** marco 10.

### jcmd
**Em uma frase:** o comando que fala com uma JVM em execução: histograma, NMT, JFR, *heap dump*, *thread dump*.
**No pix-core:** `GC.class_histogram` mostrou 838 MB em `byte[]` antes de qualquer outra ferramenta.
**Erro comum:** reiniciar o serviço para diagnosticar e perder o estado do incidente.
**Onde na prática:** marco 10.
