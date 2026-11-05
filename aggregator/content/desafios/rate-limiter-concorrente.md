---
id: rate-limiter-concorrente
titulo: "Rate limiter concorrente: token bucket em Java e Go"
tipo: lld
nivel: senior
duracaoMin: 40
prerequisitos:
  - concorrencia-e-recursos/03
  - concorrencia-e-recursos/08
  - system-design/04
conceitos: []
parametros: {}
decisoes:
  - pergunta: "Como proteger o estado do bucket com muitas threads chamando tryAcquire?"
    opcoes:
      - "Sem proteção: cada leitura e escrita de double já é atômica no hardware"
      - "Um lock em torno de repor e consumir, ou um CAS sobre o estado inteiro"
      - "Um contador atômico só para as fichas, repondo numa thread separada"
      - "Uma cópia do bucket por thread, somando as fichas no fim de cada segundo"
    correta: 1
    explicacao: "Repor e consumir lêem e escrevem fichas e último instante juntos: a operação inteira precisa ser atômica, com lock ou com CAS sobre um estado imutável. Sem proteção há venda acima da capacidade; o contador atômico isolado deixa a reposição correr com o consumo; cópias por thread não respeitam o limite global."
  - pergunta: "Como repor as fichas com o passar do tempo?"
    opcoes:
      - "Uma goroutine ou thread que soma fichas a cada milissegundo, para sempre"
      - "Calcular a reposição na hora do pedido, pelo tempo desde a última"
      - "Repor a capacidade inteira a cada segundo cheio do relógio da máquina"
      - "Pedir ao cliente que informe quantas fichas passaram desde a última chamada"
    correta: 1
    explicacao: "Reposição preguiçosa no pedido não precisa de thread, é exata para qualquer intervalo e testável com relógio injetado. A thread periódica gasta CPU e erra na granularidade; repor tudo por segundo cria rajadas na virada; confiar no cliente quebra o limite."
  - pergunta: "O serviço roda em 8 réplicas e o limite é por cliente, global. Onde fica o estado?"
    opcoes:
      - "Em cada réplica, com o limite dividido por 8 e balanceamento por cliente"
      - "Num armazenamento central com operação atômica, como um script no Redis"
      - "Em cada réplica, sem divisão: o balanceador já distribui de forma justa"
      - "No banco relacional, com uma transação serializável a cada requisição"
    correta: 1
    explicacao: "Limite global exige estado compartilhado com atualização atômica; um script atômico no Redis é o padrão. Dividir por 8 só funciona com afinidade perfeita; sem divisão o limite real vira 8×; transação serializável no banco não aguenta o volume de checagens."
entregavel:
  secoesObrigatorias: [Decisoes, Testes]
rubrica:
  - "Todos os testes passam, inclusive com go test -race"
  - "A operação de repor e consumir é atômica, sem janela entre ler e escrever"
  - "O relógio é injetado: nenhum teste depende de sleep"
  - "Um pedido negado não consome fichas"
  - "Explicou como o desenho mudaria com várias réplicas do serviço"
---
## Enunciado

Implemente um **token bucket** seguro para uso concorrente: guarda até `capacity` fichas, repõe
`refillPerSecond` fichas por segundo de forma contínua e começa cheio. `tryAcquire(n)` consome `n`
fichas se houver, sem bloquear, e devolve `false` sem consumir nada caso contrário.

O esqueleto e os testes estão em `aggregator/content/desafios/rate-limiter-concorrente/`, em `go/`
e em `java/`. Escolha uma linguagem (ou as duas): os testes falham até a implementação estar certa.

- Go: `cd go && go test -race ./...`
- Java: `cd java && mvn -q test`

## Dicas

- Comece pelo teste de reposição contínua: meio segundo a 10 fichas/s são 5 fichas.
- O teste concorrente não usa reposição (relógio parado): exatamente 1.000 pedidos podem vencer.
- `concorrencia-e-recursos/03` compara lock e CAS; `concorrencia-e-recursos/08` mostra por que o
  relógio injetado vale mais que `sleep`.

## Gabarito comentado

O estado mínimo é a quantidade de fichas (fracionária) e o instante da última reposição. A cada
pedido, dentro de uma seção atômica: calcule o tempo decorrido, some `decorrido × taxa` sem passar
da capacidade, atualize o instante e só então decida. Um `synchronized`/`sync.Mutex` resolve; um
CAS sobre um par imutável (fichas, instante) evita o lock ao custo de mais código.

Os erros mais comuns: repor numa thread separada (reposição corre com o consumo), consumir antes de
checar (pedido negado gasta fichas) e usar o relógio real nos testes (testes lentos e instáveis).

Com várias réplicas, o estado vai para um armazenamento central com operação atômica (um script no
Redis), e o bucket local vira cache opcional com limite reduzido.
