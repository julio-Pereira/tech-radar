---
id: cache-lru-ttl
titulo: "Cache LRU com TTL para a consulta DICT, em Java e Go"
tipo: lld
nivel: senior
duracaoMin: 45
prerequisitos:
  - java-e-jvm/03
  - concorrencia-e-recursos/08
conceitos: []
parametros: {}
decisoes:
  - pergunta: "Qual estrutura dá o despejo do menos usado em O(1), com o mínimo de código?"
    opcoes:
      - "Um HashMap mais uma lista de chaves, removendo do meio da lista a cada get"
      - "Um LinkedHashMap com accessOrder = true e removeEldestEntry sobrescrito"
      - "Um TreeMap ordenado pelo instante do último acesso de cada entrada"
      - "Uma PriorityQueue de entradas, ordenada pelo contador de acessos"
    correta: 1
    explicacao: "O LinkedHashMap com ordem de acesso move a entrada para o fim a cada get, e o removeEldestEntry, chamado depois de cada put, despeja a mais antiga: tudo em O(1). A lista separada paga O(n) para tirar do meio; o TreeMap e a PriorityQueue pagam O(log n) e reordenam a cada acesso; contar acessos é LFU, não LRU."
  - pergunta: "Como o cache decide que uma entrada venceu?"
    opcoes:
      - "Uma thread de limpeza percorre o mapa a cada segundo e remove as vencidas"
      - "Cada entrada guarda o vencimento, conferido no get com o relógio injetado"
      - "O get compara o instante atual com o do último acesso da entrada"
      - "Um ScheduledExecutorService agenda a remoção de cada entrada no put"
    correta: 1
    explicacao: "Guardar o vencimento na entrada e conferir no get é exato, não precisa de thread e é testável com relógio injetado. A thread de limpeza devolve entradas vencidas entre duas passadas; o último acesso mede ociosidade, não validade; agendar uma tarefa por entrada custa memória e uma fila no executor por put."
  - pergunta: "O cache é usado por todas as threads do serviço. Qual a proteção mínima correta?"
    opcoes:
      - "Nenhuma: o LinkedHashMap é seguro para leitura concorrente sem trava"
      - "Um synchronized em get, put e size, porque o get também escreve"
      - "Um ReadWriteLock, com a trava de leitura no get e a de escrita no put"
      - "Um ConcurrentHashMap no lugar do LinkedHashMap, mantendo o resto igual"
    correta: 1
    explicacao: "Com accessOrder = true, o get reordena a lista ligada: é uma escrita. Por isso a trava de leitura de um ReadWriteLock não serve, e o LinkedHashMap sem trava se corrompe. O ConcurrentHashMap não mantém ordem de acesso, então o LRU deixa de existir. O synchronized em tudo é o ponto de partida honesto; dividir em segmentos é otimização medida depois."
entregavel:
  secoesObrigatorias: [Decisoes, Testes]
rubrica:
  - "Todos os testes passam, inclusive as 5 repetições do teste com 16 threads"
  - "O tamanho nunca passa da capacidade, verificado depois de cada put"
  - "Uma entrada não volta no instante do vencimento nem depois, e o put recomeça a validade"
  - "O relógio é injetado: nenhum teste depende de sleep"
  - "Explicou por que o get é uma escrita num LinkedHashMap com ordem de acesso"
---
## Enunciado

Implemente o cache do resultado da consulta DICT: guarda no máximo `capacidade` entradas, despeja a
usada há mais tempo quando enche, e cada entrada vale por `ttl` a partir do `put`. Uma entrada nunca é
devolvida no instante do vencimento ou depois. O cache é usado por todas as threads do serviço.

O esqueleto e os testes estão em `aggregator/content/desafios/cache-lru-ttl/`, em `java/` e em `go/`.
Escolha a linguagem da vaga. Os testes falham até a implementação estar certa.

- Java: `cd java && mvn -q test`
- Go: `cd go && go test -race ./...`

## Dicas

- Comece pelo teste de capacidade e pelo de ordem de despejo, sem concorrência.
- A validade é por entrada: guarde o instante de vencimento junto do valor.
- O teste com 16 threads congela o relógio durante cada fase; leia o comentário dele para entender
  por que um teste concorrente também precisa estar certo.
- `java-e-jvm/03` tem o `HashMap` e o `LinkedHashMap` por dentro; `concorrencia-e-recursos/08`, o teste
  de concorrência.
- Em Go não há `LinkedHashMap`: o par clássico é um `map` para achar e um `container/list` para a ordem
  de uso. `go-fintech/03` explica por que o `map` não é seguro entre goroutines.

## Gabarito comentado

A estrutura é um `LinkedHashMap` criado com `accessOrder = true`, com `removeEldestEntry` devolvendo
`size() > capacidade`. Cada valor vai num record com o instante de vencimento, calculado no `put` como
`agora + ttl`. No `get`, se `agora - expiraEm >= 0`, a entrada é removida e o resultado é vazio:
comparar pela diferença é o jeito certo com `nanoTime`, que pode dar a volta.

A trava é um `synchronized` em `get`, `put` e `size`, porque o `get` reordena a lista e é, portanto,
uma escrita. Os erros mais comuns: um `ReadWriteLock` com a trava de leitura no `get`, que corrompe a
lista sob concorrência; trocar por `ConcurrentHashMap` e perder a ordem de acesso; e testar com o
relógio real e `sleep`, o que deixa os testes lentos e instáveis.

Em Go, o mesmo desenho vem em duas peças: `map[K]*list.Element` para achar em O(1) e um
`*list.List` com a entrada mais recente na frente. O `Get` faz `MoveToFront`, o `Put` faz `PushFront`
e despeja o `Back()` quando passa da capacidade, e o vencimento é conferido com
`!agora().Before(expiraEm)`. Um `sync.Mutex` protege as duas estruturas. O `sync.RWMutex` tem a mesma
armadilha do `ReadWriteLock`, porque o `Get` escreve. Sem a trava, o teste de 16 goroutines com
`-race` acusa *data race* na primeira execução.

Com muito tráfego, o monitor único vira gargalo. As saídas são segmentar o cache por hash da chave
(cada segmento com sua trava e uma fração da capacidade) ou usar uma biblioteca como o Caffeine, que
aproxima o LRU com *buffers* de leitura. As duas trocam um pouco de precisão no despejo por vazão, e
a troca só se justifica medida.
