Um verbete por termo: definição em uma frase, o exemplo no `ledger-core`, o erro comum associado e o
marco onde o conceito aparece na prática. O Bloco A cria o vocabulário da linguagem; os blocos
seguintes o reencontram no serviço em produção.

## A linguagem

### Zero value
**Em uma frase:** o valor que toda variável recebe ao nascer — `0`, `""`, `false`, `nil` ou a struct com tudo zerado; não existe variável não inicializada.
**No ledger-core:** um `var l ledger.Ledger` já funciona, porque o mutex zerado está destravado e o mapa nasce na primeira escrita.
**Erro comum:** tentar proibir o zero value de um tipo exportado; o caminho é dar significado a ele e rejeitá-lo onde não serve.
**Onde na prática:** marco 02.

### Slice header
**Em uma frase:** os três números que um slice é — ponteiro para um array, comprimento e capacidade.
**No ledger-core:** devolver `s.lines[a:b]` do extrato entrega um cabeçalho que aponta para o array interno.
**Erro comum:** achar que copiar um slice copia os elementos; copia só os três números.
**Onde na prática:** marco 03.

### Aliasing
**Em uma frase:** dois slices olhando para o mesmo array, de modo que escrever por um muda o que o outro vê.
**No ledger-core:** o `append` de um cliente na página 0 do extrato escreveu por cima da primeira linha da página 1.
**Erro comum:** confiar que `append` sempre aloca; ele só aloca quando passa da capacidade.
**Onde na prática:** marco 03.

### Expressão de três índices
**Em uma frase:** `s[a:b:c]` limita a capacidade do slice resultante a `c-a`, forçando o próximo `append` a realocar.
**No ledger-core:** `s.lines[i:j:j]` impede que o `append` de quem chama escreva no array do extrato.
**Erro comum:** achar que ela protege contra `p[0] = x`; contra alteração direta, só a cópia.
**Onde na prática:** marco 03.

### Rune
**Em uma frase:** um ponto de código Unicode; `range` sobre string percorre runes, enquanto `len` conta bytes.
**No ledger-core:** `len("ação")` é 6, e um nome de titular cortado por bytes pode partir um caractere ao meio.
**Erro comum:** limitar o tamanho de um campo de texto com `len` achando que conta caracteres.
**Onde na prática:** marco 03.

### Method set
**Em uma frase:** o conjunto de métodos de um tipo; métodos com receiver de ponteiro pertencem a `*T`, não a `T`.
**No ledger-core:** `Email{}` não satisfaz `Notifier` quando `Notify` tem receiver `*Email`.
**Erro comum:** misturar receivers de valor e de ponteiro no mesmo tipo e descobrir na atribuição a uma interface.
**Onde na prática:** marco 04.

### Interface implícita
**Em uma frase:** um tipo satisfaz uma interface só por ter os métodos, sem declarar nada.
**No ledger-core:** o antifraude declara `Saldos` com um método, e o `ledger.Service` a satisfaz sem saber dela.
**Erro comum:** declarar interfaces gordas ao lado da implementação, à moda Java, em vez de pequenas no consumidor.
**Onde na prática:** marco 04.

### Nil tipado
**Em uma frase:** um valor de interface com tipo dinâmico e valor nil, que não é igual a `nil`.
**No ledger-core:** o repositório devolvia um `*NotFoundError` nil dentro de `error`, e toda consulta válida respondia 500.
**Erro comum:** devolver uma variável de tipo concreto no caminho de sucesso em vez do `nil` literal; o staticcheck acusa (SA4023), o `go vet` não.
**Onde na prática:** marco 04.

### Embedding
**Em uma frase:** embutir um tipo numa struct, o que promove os métodos dele; não é herança.
**No ledger-core:** um `Service` com `Audit` embutido ganha `s.Log()`, operando sobre o campo embutido.
**Erro comum:** embutir uma interface numa struct de produção e esquecer de preencher o campo: panic em tempo de execução.
**Onde na prática:** marco 04.

### Type switch
**Em uma frase:** `switch x := v.(type)` escolhe o caso pelo tipo dinâmico de uma interface.
**No ledger-core:** `Status(d Decisao)` trata `Aprovado`, `Negado` e `Revisao`, e o `gochecksumtype` cobra os três.
**Erro comum:** confiar na linguagem para a exaustividade; ela não cobra, o linter cobra.
**Onde na prática:** marco 04.

### Constraint
**Em uma frase:** a interface que limita o parâmetro de tipo de um genérico, como `comparable` ou `~int64`.
**No ledger-core:** `Sum[T Cents](xs ...T)` soma qualquer tipo cujo tipo base é `int64`.
**Erro comum:** usar generics quando o comportamento varia por tipo, o caso de interface.
**Onde na prática:** marco 04.

### Método genérico
**Em uma frase:** desde o Go 1.27, um método pode declarar os próprios parâmetros de tipo.
**No ledger-core:** `func (b *Batch[T]) Map[U any](...)` evita uma função solta no pacote.
**Erro comum:** esperar que um método genérico satisfaça um método de interface; não satisfaz.
**Onde na prática:** marco 04.

## Erros, defer e panic

### Erro sentinela
**Em uma frase:** um valor de erro fixo, comparado com `errors.Is`, que atravessa qualquer número de `%w`.
**No ledger-core:** `ErrSaldoInsuficiente` e `ErrContaNaoExiste` da taxonomia do domínio.
**Erro comum:** comparar com `==` depois de embrulhar, o que falha a partir do primeiro `%w`.
**Onde na prática:** marco 05.

### Wrapping
**Em uma frase:** embrulhar um erro com `fmt.Errorf("contexto: %w", err)`, guardando o original dentro do novo.
**No ledger-core:** `transfer acc-1 -> acc-2: saldo insuficiente`, com o sentinela ainda reconhecível.
**Erro comum:** usar `%v` em vez de `%w`, transformando o erro em texto e perdendo a inspeção.
**Onde na prática:** marco 05.

### errors.AsType
**Em uma frase:** a versão genérica de `errors.As` (Go 1.26), que procura na cadeia um erro de um tipo e o devolve tipado.
**No ledger-core:** `errors.AsType[*Domain](err)` encontra o erro de domínio e decide o status HTTP.
**Erro comum:** usar `errors.As` com um alvo que não implementa `error`; entra em pânico, e o `go vet` acusa antes.
**Onde na prática:** marco 05.

### defer
**Em uma frase:** agenda uma chamada para o fim da função, em ordem inversa, com os argumentos avaliados na hora do `defer`.
**No ledger-core:** o `Rollback` da transação só roda se o retorno nomeado `err` não for nil.
**Erro comum:** `defer tx.Rollback()` seguido de `tx.Commit()` sem checar o erro: o erro do Commit some.
**Onde na prática:** marco 05, também no marco 09.

### panic e recover
**Em uma frase:** `panic` interrompe o fluxo por bug; `recover`, só dentro de uma função adiada, retoma.
**No ledger-core:** o worker de eventos recupera na borda, registra o evento e segue para o próximo.
**Erro comum:** esquecer que um panic numa goroutine derruba o processo inteiro.
**Onde na prática:** marco 05.

## Concorrência

### Goroutine
**Em uma frase:** uma função executada de forma concorrente pelo runtime do Go, com pilha pequena que cresce sob demanda.
**No ledger-core:** cada evento do lote roda numa goroutine, limitada pelo `errgroup`.
**Erro comum:** criar uma sem pensar em como ela termina.
**Onde na prática:** marco 06.

### Channel
**Em uma frase:** canal tipado de comunicação e sincronização entre goroutines; quem fecha é quem envia.
**No ledger-core:** a fila de cada shard do processamento de lote por conta.
**Erro comum:** fechar do lado de quem recebe e causar panic no próximo envio.
**Onde na prática:** marco 06.

### Canal nil
**Em uma frase:** um channel com valor nil, em que enviar e receber bloqueiam para sempre.
**No ledger-core:** atribuir `nil` ao channel de uma fonte que terminou desliga o `case` dela no `select`.
**Erro comum:** esquecer o `make` e travar a goroutine sem erro nenhum.
**Onde na prática:** marco 06.

### select
**Em uma frase:** espera o primeiro de vários channels pronto; com vários prontos, sorteia.
**No ledger-core:** o hedging espera a resposta do PSP, o timer do hedge ou o cancelamento do cliente.
**Erro comum:** achar que a ordem dos `case` define prioridade.
**Onde na prática:** marco 06, também no marco 07.

### context
**Em uma frase:** a árvore de cancelamento e prazo que atravessa as chamadas de uma requisição.
**No ledger-core:** o deadline do cliente chega ao banco, ao PSP e ao antifraude pelo mesmo `ctx`.
**Erro comum:** usar `context.Value` como injeção de dependência.
**Onde na prática:** marco 06.

### errgroup
**Em uma frase:** um `WaitGroup` que propaga o primeiro erro, cancela o contexto do grupo e limita a concorrência com `SetLimit`.
**No ledger-core:** o lote de 100 mil eventos com no máximo 8 em voo.
**Erro comum:** achar que "para no primeiro erro" é instantâneo; o cancelamento chega quando a função com erro retorna.
**Onde na prática:** marco 06.

### Worker pool
**Em uma frase:** um número fixo de goroutines consumindo uma fila de trabalho.
**No ledger-core:** impede que um lote de 100 mil itens vire 100 mil conexões ao banco.
**Erro comum:** uma goroutine por item, sem limite.
**Onde na prática:** marco 06.

### Vazamento de goroutine
**Em uma frase:** uma goroutine bloqueada para sempre, que segura a pilha e tudo o que referencia.
**No ledger-core:** a chamada perdedora do hedging, parada no envio de um channel sem buffer.
**Erro comum:** culpar `time.After` em laço; desde o Go 1.23 o timer é coletado, e o vazamento real é o envio sem leitor.
**Onde na prática:** marco 07.

### goleak
**Em uma frase:** biblioteca que falha um teste se sobrar goroutine que não existia no início.
**No ledger-core:** `goleak.VerifyTestMain` na suíte do cliente de PSP.
**Erro comum:** só olhar a métrica de goroutines em produção, depois do incidente.
**Onde na prática:** marco 07.

### synctest
**Em uma frase:** o pacote `testing/synctest` (estável no Go 1.25) roda o teste numa bolha com relógio falso.
**No ledger-core:** o timeout de 200 ms do hedging termina em exatamente 200 ms no relógio da bolha.
**Erro comum:** testar tempo com `time.Sleep`, lento e intermitente.
**Onde na prática:** marco 07, também no marco 11.

### sync.Map
**Em uma frase:** um map concorrente que ganha de map com mutex em dois casos: chave escrita uma vez e lida muitas, ou chaves disjuntas por goroutine.
**No ledger-core:** o cache de configuração por tenant.
**Erro comum:** usá-lo como "map concorrente melhor" para um contador escrito o tempo todo.
**Onde na prática:** marco 07.

## O serviço

### ServeMux
**Em uma frase:** o roteador HTTP da stdlib, com método e curinga no padrão desde o Go 1.22.
**No ledger-core:** `mux.HandleFunc("GET /accounts/{id}/balance", h)` e `r.PathValue("id")`.
**Erro comum:** adicionar um framework só para ter rota com parâmetro.
**Onde na prática:** marco 08.

### ReadHeaderTimeout
**Em uma frase:** o prazo para o cliente terminar de mandar o cabeçalho HTTP.
**No ledger-core:** 2 s no `payments-api`; o teste de Slowloris prova que a conexão lenta cai.
**Erro comum:** subir um `http.Server{}` sem timeout nenhum, que é o padrão; o `gosec` acusa (G112).
**Onde na prática:** marco 08.

### Problem Details
**Em uma frase:** o formato de erro HTTP da RFC 9457, com `type`, `title`, `status`, `detail` e `instance`.
**No ledger-core:** `application/problem+json` com o `type` vindo da taxonomia do marco 05.
**Erro comum:** o cliente decidir pelo texto do `title` em vez do `type`.
**Onde na prática:** marco 08.

### Graceful shutdown
**Em uma frase:** encerrar o servidor recusando conexões novas e esperando as requisições em voo.
**No ledger-core:** readiness falsa, depois `srv.Shutdown(ctx)`, depois a saída do processo.
**Erro comum:** chamar `Close`, que fecha tudo na hora, ou sair direto no `SIGTERM`.
**Onde na prática:** marco 08, também no marco 12.

### Interceptor
**Em uma frase:** o middleware do gRPC, que envolve cada chamada no cliente ou no servidor.
**No ledger-core:** o interceptor do antifraude recusa chamada sem deadline.
**Erro comum:** espalhar log e auth em cada handler em vez de um interceptor.
**Onde na prática:** marco 10.

### Deadline do gRPC
**Em uma frase:** o prazo absoluto do cliente, transmitido no cabeçalho e entregue ao servidor no `ctx`.
**No ledger-core:** os 200 ms do checkout chegam ao antifraude e dele ao modelo de score.
**Erro comum:** repetir um débito depois de `DeadlineExceeded`, que não prova que o débito não aconteceu.
**Onde na prática:** marco 10.

## Dados e testes

### Pool de conexões
**Em uma frase:** o conjunto de conexões que o `*sql.DB` mantém e empresta, limitado por `SetMaxOpenConns`.
**No ledger-core:** 10 conexões para 32 workers do lote, com as esperas medidas em `db.Stats()`.
**Erro comum:** esquecer `rows.Close()` e esgotar o pool.
**Onde na prática:** marco 09.

### FOR UPDATE
**Em uma frase:** a cláusula que trava as linhas lidas até o fim da transação.
**No ledger-core:** as duas contas da transferência, travadas sempre em ordem de ID.
**Erro comum:** travar na ordem do pedido e produzir deadlock (`40P01`).
**Onde na prática:** marco 09.

### Falha de serialização
**Em uma frase:** o SQLSTATE `40001`, com que o Postgres pede para repetir a transação inteira.
**No ledger-core:** o retry da transferência repete `40001` e `40P01` até 5 vezes, depois devolve `ErrConcorrencia`.
**Erro comum:** repetir só o último comando, reaproveitando leituras velhas.
**Onde na prática:** marco 09.

### sqlc
**Em uma frase:** gerador de código Go tipado a partir de SQL escrito à mão.
**No ledger-core:** as queries do repositório revisáveis com `EXPLAIN` e conferidas na compilação.
**Erro comum:** escolher um ORM e descobrir o N+1 em produção.
**Onde na prática:** marco 09.

### Teste de tabela
**Em uma frase:** uma slice de casos percorrida com um `t.Run` nomeado por caso.
**No ledger-core:** os casos do `Parse` do evento, cada um isolável com `-run`.
**Erro comum:** um teste por caso copiado e colado, que diverge com o tempo.
**Onde na prática:** marco 11.

### Fuzzing
**Em uma frase:** teste que muta entradas guiado por cobertura procurando uma que falhe ou entre em pânico.
**No ledger-core:** o fuzz achou em centésimos de segundo o pânico do parser antigo de eventos.
**Erro comum:** não commitar o corpus de `testdata/fuzz/`, que vira teste de regressão.
**Onde na prática:** marco 11.

### Golden file
**Em uma frase:** a saída esperada guardada em `testdata/x.golden` e comparada pelo teste, regravada com `-update`.
**No ledger-core:** o arquivo de conciliação gerado, conferido byte a byte.
**Erro comum:** regravar o golden sem olhar o diff.
**Onde na prática:** marco 11.

### Teste de mutação
**Em uma frase:** mede se a suíte percebe quando o código é estragado de propósito.
**No ledger-core:** no `Allocate`, 13 mutantes mortos e 1 vivo, equivalente.
**Erro comum:** perseguir 100% de mutantes mortos sem ler os vivos.
**Onde na prática:** marco 11.

## Produção

### slog.LogValuer
**Em uma frase:** a interface que deixa o tipo decidir como aparece no log.
**No ledger-core:** o `CPF` sai sempre como `***.***.***-09`.
**Erro comum:** mascarar só no log e esquecer os atributos de span.
**Onde na prática:** marco 12.

### govulncheck
**Em uma frase:** a ferramenta do time do Go que cruza dependências com a base de vulnerabilidades por alcançabilidade.
**No ledger-core:** código 3 no CI quando o código chama uma função vulnerável.
**Erro comum:** tratar como lista de CVEs por versão; ele só reprova o que o código alcança.
**Onde na prática:** marco 13.

### Checksum database
**Em uma frase:** o log público (`sum.golang.org`) com o hash de cada versão publicada de módulo.
**No ledger-core:** garante que todos que baixam uma versão de dependência recebem o mesmo código.
**Erro comum:** achar que ela diz se o código é seguro; diz só que é o mesmo para todos.
**Onde na prática:** marco 13.

### os.Root
**Em uma frase:** a API do Go 1.24 que confina operações de arquivo a um diretório.
**No ledger-core:** a leitura de arquivos de extrato recusa `../../etc/passwd`.
**Erro comum:** validar o caminho com `strings.Contains(nome, "..")`.
**Onde na prática:** marco 13.

### -trimpath
**Em uma frase:** a flag de build que remove do binário o caminho da máquina de build.
**No ledger-core:** com ela, o mesmo commit gera o mesmo SHA-256 em qualquer diretório.
**Erro comum:** publicar binário que vaza a estrutura de diretórios do build.
**Onde na prática:** marco 13.

### GOMEMLIMIT
**Em uma frase:** limite suave de memória (Go 1.19) que faz o GC rodar mais perto dele.
**No ledger-core:** evita o OOM no contêiner de 64 MiB, trocando memória por CPU de GC.
**Erro comum:** defini-lo igual ao limite do contêiner, sem folga.
**Onde na prática:** marco 14.

### GOMAXPROCS
**Em uma frase:** quantas goroutines rodam código Go ao mesmo tempo; desde o Go 1.25, respeita o limite de CPU do cgroup.
**No ledger-core:** num contêiner com 2 CPUs, o runtime usa 2, não os núcleos do nó.
**Erro comum:** fixá-lo à mão e desligar o ajuste automático.
**Onde na prática:** marco 14.

### Escape analysis
**Em uma frase:** a análise do compilador que decide o que fica na pilha e o que escapa para o heap.
**No ledger-core:** o argumento de `fmt.Sprintf` escapa; `strconv.AppendInt` num buffer não.
**Erro comum:** otimizar alocação no escuro, sem `-gcflags=-m`.
**Onde na prática:** marco 14.

### benchstat
**Em uma frase:** compara rodadas de benchmark e diz se a diferença é estatisticamente significativa.
**No ledger-core:** o recibo caiu de 12 para 1 alocação por operação, com `p=0,000`.
**Erro comum:** concluir a partir de uma rodada só.
**Onde na prática:** marco 14.

### PGO
**Em uma frase:** otimização guiada por perfil: um `default.pgo` de produção no pacote `main` orienta o compilador.
**No ledger-core:** o perfil de CPU sob carga, salvo em `cmd/ledger/default.pgo`.
**Erro comum:** gerar o perfil num ambiente que não representa a produção.
**Onde na prática:** marco 14.

## Arquitetura

### Pacote internal
**Em uma frase:** código sob um diretório `internal/` só pode ser importado pela árvore que o contém.
**No ledger-core:** `ledger/internal/regras` é invisível para `extrato` e `antifraude`.
**Erro comum:** mover a regra para um `pkg/util` compartilhado quando o compilador recusa o import.
**Onde na prática:** marco 15.

### Monolito modular
**Em uma frase:** um só binário e um só deploy com módulos de negócio de fronteira explícita.
**No ledger-core:** `ledger`, `antifraude` e `extrato`, cada um com a API pública e o seu `internal/`.
**Erro comum:** fronteiras só por convenção, que o primeiro prazo apertado atravessa.
**Onde na prática:** marco 15.

### Injeção manual
**Em uma frase:** montar as dependências no `main`, criando cada peça e passando adiante.
**No ledger-core:** o `main` cria o repositório, o serviço e o handler, e é o único que importa adaptadores.
**Erro comum:** variáveis globais preenchidas em `init()`.
**Onde na prática:** marco 15.
