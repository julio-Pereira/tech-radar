---
id: fetcher-concorrente-limitado
titulo: "Busca concorrente com limite, cancelamento e prazo, em Go"
tipo: lld
nivel: senior
duracaoMin: 40
prerequisitos:
  - go-fintech/06
  - go-fintech/07
conceitos: []
parametros: {}
decisoes:
  - pergunta: "Onde a goroutine adquire a vaga do limite de chamadas em voo?"
    opcoes:
      - "Dentro da goroutine, antes de chamar a busca, com uma goroutine criada para cada id"
      - "No laço que lança as goroutines, antes de criar cada uma, esperando vaga no canal"
      - "Em lugar nenhum: o runtime do Go já limita as goroutines ao número de núcleos"
      - "Num pool fixo de goroutines criado no início, lendo os ids de um canal sem buffer"
    correta: 1
    explicacao: "Adquirir a vaga no laço, antes do go, limita as goroutines vivas e não só as chamadas, e deixa o laço parar de lançar assim que o contexto é cancelado. Adquirir dentro da goroutine cria uma por id de uma vez: o pico de chamadas fica certo, mas as goroutines esperando a vaga ainda começam chamadas depois do primeiro erro, e o teste reprova. O pool fixo também funciona, com mais código. O runtime não limita goroutines."
  - pergunta: "O que acontece com as chamadas em voo quando uma delas falha?"
    opcoes:
      - "Elas continuam até o fim, e o Buscar descarta os resultados que chegarem depois"
      - "O Buscar mata as goroutines em voo, como o Go permite com um sinal de interrupção"
      - "O contexto filho é cancelado, e as chamadas que olham o ctx voltam na hora"
      - "O Buscar devolve o erro na hora e deixa as goroutines terminarem em segundo plano"
    correta: 2
    explicacao: "Go não mata goroutine: o cancelamento é cooperativo, pelo context.Context que cada chamada recebe. O primeiro erro cancela o contexto filho, as chamadas que olham ctx.Done() voltam na hora, e o laço para de lançar. Devolver antes de esperar as goroutines deixa vazamento, e o goleak reprova; esperar até o fim sem cancelar mantém o PSP ocupado por resultados que ninguém vai ler."
  - pergunta: "Como o teste prova que nenhuma goroutine sobreviveu ao retorno de Buscar?"
    opcoes:
      - "Contando runtime.NumGoroutine antes e depois, e exigindo os dois números iguais"
      - "Com goleak.VerifyTestMain, que falha se sobrar goroutine ao fim dos testes"
      - "Com um time.Sleep de um segundo no fim de cada teste, para as goroutines morrerem"
      - "Não precisa: o garbage collector recolhe as goroutines que ninguém referencia mais"
    correta: 1
    explicacao: "O goleak lista as goroutines vivas ao fim e falha mostrando a pilha de cada uma que sobrou, ignorando as do runtime e do próprio teste. Comparar NumGoroutine é frágil (outras goroutines do runtime vêm e vão), o sleep só esconde o problema, e o GC não recolhe goroutine bloqueada: ela fica viva para sempre. Na referência, tirar o wg.Wait do fim faz o goleak reprovar."
entregavel:
  secoesObrigatorias: [Decisoes, Testes]
rubrica:
  - "Todos os testes passam com -race, e o goleak não acusa nada"
  - "O pico de chamadas em voo é exatamente o limite, e os resultados vêm na ordem dos ids"
  - "No primeiro erro, as chamadas em voo são canceladas e nenhuma nova começa"
  - "O prazo do chamador é respeitado, e o erro devolvido é context.DeadlineExceeded"
  - "Explicou por que a vaga é adquirida antes do go, e não dentro da goroutine"
---
## Enunciado

Implemente `Buscar`: dado uma lista de ids de pagamento, chama a função de busca (um PSP, o DICT) para
cada um, em paralelo, com **no máximo `limite` chamadas em voo**, e devolve os resultados na ordem dos
ids. No **primeiro erro**, as chamadas em voo recebem o cancelamento, nenhuma nova começa, e `Buscar`
devolve esse erro. Se o prazo do chamador vencer, devolve `context.DeadlineExceeded`. Quando `Buscar`
retorna, nenhuma goroutine criada por ele continua viva.

O esqueleto e os testes estão em `aggregator/content/desafios/fetcher-concorrente-limitado/go/`. Os
testes falham até a implementação estar certa.

- Go: `cd go && go test -race ./...`

## Dicas

- `go-fintech/06` tem o `errgroup` com limite e o `context` como árvore de cancelamento;
  `go-fintech/07`, o vazamento de goroutine e o `goleak`.
- Um canal com `limite` posições é um semáforo: mandar para ele ocupa uma vaga, receber libera.
- Escreva primeiro a versão sem erro e sem prazo, só com o limite e a ordem. Depois acrescente o
  cancelamento.
- O teste do primeiro erro faz o id `P003` falhar enquanto as outras quatro chamadas da primeira leva
  esperam 2 s ou o cancelamento: se `Buscar` levar segundos, o cancelamento não chegou a elas.

## Gabarito comentado

A referência tem quatro peças:

- um `context.WithCancel` filho do contexto do chamador;
- um canal com `limite` posições como semáforo;
- um `sync.WaitGroup`;
- um `sync.Once` para guardar o primeiro erro e cancelar o contexto.

O laço que percorre os ids **adquire a vaga antes de criar a goroutine**, num `select` com
`ctx.Done()`. Assim ele para de lançar assim que o contexto é cancelado, e nunca há mais goroutines
vivas que o limite. Cada goroutine devolve a vaga num `defer`, grava o resultado na posição `i` do
slice (sem trava, porque cada posição tem um só escritor) e, se falhar, chama a função que cancela.
O `wg.Wait()` no fim é o que garante que nada sobrevive ao retorno.

Os erros mais comuns, e o teste que pega cada um:

- adquirir a vaga **dentro** da goroutine, com uma goroutine por id: o pico de chamadas fica certo, mas
  as goroutines que esperavam a vaga começam chamadas depois do primeiro erro, e o teste do erro
  reprova;
- devolver o erro sem esperar as goroutines: o `goleak` mostra as que sobraram;
- não passar o `ctx` para a busca, ou a busca não olhar `ctx.Done()`: o cancelamento não chega, e o
  teste de prazo estoura;
- usar `append` num slice compartilhado: a ordem se perde, e o `-race` acusa.

O `errgroup.Group` com `SetLimit` do `golang.org/x/sync` faz quase tudo isso pronto. Saber escrever
sem ele é o que a entrevista mede; usá-lo em produção é o certo (`go-fintech/06`).
