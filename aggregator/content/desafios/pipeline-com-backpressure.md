---
id: pipeline-com-backpressure
titulo: "Pipeline de eventos com backpressure, ordem por chave e DLQ, em Go"
tipo: lld
nivel: senior
duracaoMin: 45
prerequisitos:
  - go-fintech/06
  - kotlin-backend/07
conceitos: []
parametros: {}
decisoes:
  - pergunta: "Como manter a ordem dos eventos de um pagamento e ainda processar pagamentos diferentes em paralelo?"
    opcoes:
      - "Uma goroutine por evento, ordenando os resultados pela sequência no fim do lote"
      - "Uma fila por partição, escolhida pelo hash da chave, com uma goroutine por fila"
      - "Uma fila só, com várias goroutines lendo dela e um mutex por chave de pagamento"
      - "Processar tudo numa goroutine só, que é o único jeito de garantir a ordem"
    correta: 1
    explicacao: "O hash da chave manda os eventos de um pagamento sempre para a mesma fila, e uma goroutine por fila os processa em ordem; filas diferentes andam em paralelo. É o desenho das partições do Kafka. Uma goroutine por evento perde a ordem (o teste mostra P06 embaralhado); várias goroutines numa fila com mutex por chave ainda deixam dois eventos da mesma chave disputarem a trava fora de ordem; uma goroutine só é correta e sem paralelismo."
  - pergunta: "O que faz o backpressure neste pipeline?"
    opcoes:
      - "Um rate limiter na entrada, que descarta eventos acima de uma taxa configurada"
      - "Um buffer grande em cada fila, para que o produtor nunca precise esperar"
      - "Filas de tamanho fixo: o envio para a fila cheia bloqueia a leitura da entrada"
      - "Um contador de pendentes que, acima do limite, devolve erro para o produtor"
    correta: 2
    explicacao: "O canal com Buffer posições bloqueia quem envia quando enche, e o laço que lê a entrada para de ler: o produtor espera o consumidor, sem perder nada. Com um buffer enorme, o produtor ficou 392 eventos à frente, contra o máximo de 37 do teste; descartar ou devolver erro perde eventos que viram webhook."
  - pergunta: "Um evento recebe 410 do recebedor. O que o pipeline faz?"
    opcoes:
      - "Repete com backoff até o limite de tentativas, como qualquer outro erro"
      - "Manda para a DLQ na primeira vez e segue com os próximos eventos"
      - "Para a partição inteira até alguém olhar o erro, para não perder a ordem"
      - "Descarta o evento e registra um log, já que o recebedor recusou de vez"
    correta: 1
    explicacao: "Erro permanente (410, 422) não melhora com repetição: vai direto para a DLQ, onde alguém trata, e o fluxo segue. Erro transitório (503, timeout) repete até o limite e só então vai para a DLQ. Parar a partição trava todos os pagamentos que caem nela por causa de um; descartar perde a notificação sem rastro."
entregavel:
  secoesObrigatorias: [Decisoes, Testes]
rubrica:
  - "Todos os testes passam com -race, e o goleak não acusa nada"
  - "O produtor nunca fica mais que Particoes*(Buffer+1)+1 eventos à frente"
  - "Cada pagamento sai em ordem, e pagamentos diferentes processam em paralelo"
  - "Erro permanente vai para a DLQ com uma tentativa; transitório repete até o limite"
  - "O cancelamento do ctx encerra todas as goroutines antes do retorno"
---
## Enunciado

Implemente o pipeline que transforma mudanças de estado de pagamentos em *webhooks*. `Processar`
consome a entrada até ela fechar e cumpre quatro exigências:

- **Ordem por pagamento:** os eventos de um mesmo pagamento (`Chave`) são processados na ordem em
  que chegaram.
- **Paralelismo:** pagamentos diferentes processam em paralelo, até `Particoes` ao mesmo tempo.
- ***Backpressure*:** cada partição tem uma fila de `Buffer` posições, e com o consumidor lento o
  produtor espera em vez de acumular.
- **Erro não para o fluxo:** um erro permanente vai para a DLQ na primeira vez; um transitório se
  repete até `Tentativas` e só então vai para a DLQ.

O cancelamento do `ctx` encerra tudo, sem goroutine viva.

O esqueleto e os testes estão em `aggregator/content/desafios/pipeline-com-backpressure/go/`. Os
testes falham até a implementação estar certa.

- Go: `cd go && go test -race ./...`

## Dicas

- `go-fintech/06` tem o *pipeline* com canais e quem fecha cada um. A versão Kotlin deste desafio é o
  Desafio do marco `kotlin-backend/07`, com `Channel` e `Flow`.
- O hash da chave (`hash/fnv`) escolhe a partição. Um canal com `Buffer` posições por partição já é a
  fila limitada.
- Fechar as filas é responsabilidade de quem as alimenta: o laço de leitura fecha todas quando a
  entrada termina, e espera as goroutines antes de retornar.

## Gabarito comentado

A referência cria uma fila (canal com `Buffer` posições) e uma goroutine por partição. O laço
principal lê a entrada num `select` com `ctx.Done()`, calcula a partição pelo hash da chave e envia
para a fila dela, também num `select` com `ctx.Done()`. Quando a fila está cheia, o envio bloqueia, o
laço para de ler a entrada, e o produtor espera: esse bloqueio **é** o *backpressure*. Com a entrada
fechada ou o contexto cancelado, o laço fecha todas as filas e faz `wg.Wait()`.

Cada goroutine de partição entrega seus eventos em ordem. A entrega tenta até `Tentativas` vezes,
para na primeira se o erro for `ErrPermanente` (`errors.Is`, que atravessa o `%w`) e, se não deu
certo, chama a DLQ. Os erros mais comuns, e o teste que pega cada um:

- distribuir por evento em vez de por chave: um pagamento sai fora de ordem;
- fila sem limite, ou com um *buffer* gigante: o pico de pendentes estoura (392 contra 37 no teste);
- repetir o erro permanente: o teste conta as tentativas;
- retornar sem fechar as filas e esperar as goroutines: o `goleak` mostra as que sobraram.

Um ponto para a conversa: a ordem por chave depende de a mesma chave cair sempre na mesma partição. Se
o número de partições mudar com eventos em trânsito, a ordem de um pagamento pode quebrar na
transição. É o mesmo problema de reparticionar um tópico do Kafka (`kafka/06`).
