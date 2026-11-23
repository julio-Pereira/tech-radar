Um verbete por termo: definição em uma frase, o exemplo no `fin-kv`, o erro comum associado e o marco onde
o conceito aparece na prática. Conceitos que já têm dono (*cache-aside*, *stampede*, *fencing token*,
Redlock, *token bucket*, janela deslizante, `Idempotency-Key`) são verbetes das trilhas donas e não se
repetem aqui.

## Execução

### Execução serial
**Em uma frase:** o motor executa um comando de cada vez, numa *thread* só; cada comando é atômico, e um comando lento atrasa todos os clientes.
**No fin-kv:** o `pix-gateway` e o antifraude dividem a instância, e um `KEYS` de um deles é latência para o outro.
**Erro comum:** achar que a lentidão de um comando só afeta quem o chamou.
**Onde na prática:** marco 01.

### I/O threads
**Em uma frase:** *threads* extras que leem e escrevem no *socket* e fazem o *parsing* do protocolo; a execução dos comandos continua numa *thread* só.
**No fin-kv:** ficam desligadas (`io-threads 1`) enquanto a CPU da instância não for o gargalo.
**Erro comum:** ligar as I/O threads esperando que elas aliviem um comando O(N).
**Onde na prática:** marco 01.

### RTT
**Em uma frase:** o tempo de ida e volta de uma requisição pela rede, que domina o custo de um comando O(1).
**No fin-kv:** meio milissegundo na mesma zona e uns 2 ms entre zonas, medidos com o Toxiproxy.
**Erro comum:** otimizar o servidor quando o tempo está na rede.
**Onde na prática:** marco 01.

### Pipelining
**Em uma frase:** mandar vários comandos pela mesma conexão sem esperar a resposta de cada um, pagando o
tempo de ida e volta uma vez só; não dá atomicidade.
**No fin-kv:** o `pix-gateway` junta as leituras de uma requisição num *pipeline*.
**Erro comum:** confundir com `MULTI`, que dá isolamento e não economiza o tempo de ida e volta.
**Onde na prática:** marco 01.

### Big key
**Em uma frase:** uma chave cuja estrutura cresceu a ponto de qualquer operação O(N) sobre ela, inclusive apagá-la, pesar na *thread* principal.
**No fin-kv:** um *hash* por balde de mil sessões seria uma; o `fin-kv` usa um *hash* por sessão.
**Erro comum:** descobrir a *big key* pelo `SLOWLOG` de um `DEL` ou de um `HGETALL` em produção.
**Onde na prática:** marco 01, também no marco 02.

### Hot key
**Em uma frase:** uma chave que recebe uma fração desproporcional do tráfego e, no *cluster*, concentra a carga num nó só.
**No fin-kv:** a configuração da chave Pix de um grande recebedor, lida em toda iniciação.
**Erro comum:** escalar o *cluster* quando o problema é uma chave só.
**Onde na prática:** marco 01, também no marco 11.

### SCAN
**Em uma frase:** a varredura incremental do espaço de chaves, O(1) por chamada, que devolve ao menos uma vez o que existiu do começo ao fim, podendo repetir.
**No fin-kv:** o validador de nomes e de TTL percorre o *dataset* com `SCAN`.
**Erro comum:** esperar uma foto consistente do banco, sem repetidas.
**Onde na prática:** marco 01, também no marco 02.

### Lazy free
**Em uma frase:** liberar a memória de uma chave apagada numa *thread* de fundo, em vez de na principal.
**No fin-kv:** o `fin-kv` apaga coleções grandes com `UNLINK`, que libera assim nos dois motores.
**Erro comum:** confiar no `DEL` assíncrono do Valkey (`lazyfree-lazy-user-del yes`) e travar o Redis, em que o padrão é `no`.
**Onde na prática:** marco 01.

### SLOWLOG
**Em uma frase:** o registro dos comandos cuja execução passou de `slowlog-log-slower-than` (10 ms por padrão); no Valkey 8.1+, faz parte do `COMMANDLOG`.
**No fin-kv:** o painel alerta a cada entrada nova no `SLOWLOG`.
**Erro comum:** ler o `SLOWLOG` como latência do cliente: ele mede só a execução, sem fila nem rede.
**Onde na prática:** marco 01.

## Estruturas

### Listpack
**Em uma frase:** o formato compacto de *hashes*, *sets*, *sorted sets* e nós de lista pequenos: um bloco contíguo percorrido em sequência.
**No fin-kv:** a sessão de consentimento, um *hash* de cinco campos curtos, fica em *listpack*.
**Erro comum:** pôr um valor acima de 64 bytes e converter a coleção inteira para tabela, sem volta.
**Onde na prática:** marco 02.

### Intset
**Em uma frase:** o formato compacto de um *set* só de inteiros, enquanto ele tiver até 512 membros.
**No fin-kv:** o *set* de códigos ISPB das instituições habilitadas no Pix.
**Erro comum:** gravar o ISPB com zeros à esquerda (`00360305`), que não é inteiro canônico e tira o *set* do *intset*; no laboratório, virou *listpack* nos dois motores.
**Onde na prática:** marco 02.

### Quicklist
**Em uma frase:** a representação interna das listas: uma lista ligada de nós, cada um um *listpack* de até 8 KB por padrão.
**No fin-kv:** a fila de notificações antes da migração para Streams.
**Erro comum:** usar `LRANGE 0 -1` numa lista que só cresce.
**Onde na prática:** marco 02.

### Expiração por campo
**Em uma frase:** TTL em campos individuais de um *hash* (`HEXPIRE`, `HGETEX`, `HSETEX`), disponível no Redis 7.4+ e no Valkey 9.0+.
**No fin-kv:** a modelagem C das sessões usava; a escolhida, B, usa TTL de chave.
**Erro comum:** depender dela num motor ou serviço gerenciado de versão anterior.
**Onde na prática:** marco 02.

### Sorted set
**Em uma frase:** um *set* em que cada membro tem um *score*, ordenado por ele, com busca por faixa em O(log N).
**No fin-kv:** a janela de pagadores distintos do antifraude, com o instante como *score*.
**Erro comum:** esquecer o `ZREMRANGEBYSCORE` e deixar a janela crescer sem limite.
**Onde na prática:** marco 03.

### Skiplist
**Em uma frase:** a estrutura em níveis que ordena um *sorted set* grande e dá busca e inserção em O(log N).
**No fin-kv:** a janela de uma chave Pix com 212 pagadores é uma *skiplist* de 34 KB.
**Erro comum:** esperar a memória de um *listpack* depois que o *sorted set* passou de 128 membros.
**Onde na prática:** marco 03.

### Bitmap
**Em uma frase:** uma *string* tratada como vetor de bits, com `SETBIT` em O(1) e `BITCOUNT` em O(N) nos bytes.
**No fin-kv:** presença diária de clientes, um bit por identificador numérico.
**Erro comum:** usar um identificador esparso e criar um *bitmap* enorme de zeros.
**Onde na prática:** marco 03.

### HyperLogLog
**Em uma frase:** uma estimativa de cardinalidade em até 12 KB, com erro padrão de 0,81%, que não guarda nem remove elementos.
**No fin-kv:** o painel de volume de pagadores distintos.
**Erro comum:** usar o número aproximado num relatório regulatório ou numa regra que bloqueia cliente.
**Onde na prática:** marco 03.

### Bloom filter
**Em uma frase:** um filtro que responde "não" com certeza e "talvez" com uma taxa de erro escolhida; nunca dá falso negativo.
**No fin-kv:** o pré-filtro de chaves Pix denunciadas antes da consulta ao banco.
**Erro comum:** usá-lo como registro de idempotência, em que o "talvez" descarta pedido legítimo.
**Onde na prática:** marco 03.

### Count-Min Sketch
**Em uma frase:** a frequência aproximada de cada item, que pode superestimar e nunca subestima; vem no Redis 8 e não existe no Valkey Bundle.
**No fin-kv:** a frequência de tentativas por dispositivo no painel de abuso, só no Redis.
**Erro comum:** contar com ele no Valkey, em que o módulo `bf` só traz o Bloom.
**Onde na prática:** marco 03.

## Atomicidade e padrões

### MULTI/EXEC
**Em uma frase:** enfileira comandos e os executa juntos, sem intercalação de outros clientes; não desfaz nada quando um comando falha na execução.
**No fin-kv:** o primeiro desenho do débito de limite, abandonado pelo script.
**Erro comum:** acreditar que um erro no segundo comando desfaz o primeiro: só o erro de enfileiramento aborta o `EXEC`.
**Onde na prática:** marco 04.

### WATCH
**Em uma frase:** vigia chaves e faz o `EXEC` não executar nada se alguma mudou desde o `WATCH`; é concorrência otimista, com o servidor como árbitro.
**No fin-kv:** a alternativa documentada no ADR para um motor sem Lua, com retry limitado e métrica de abortos.
**Erro comum:** usar sob contenção alta sem limite de tentativas: no laboratório, mais de 30 abortos por débito.
**Onde na prática:** marco 04.

### Script Lua
**Em uma frase:** um programa que roda dentro do servidor com o isolamento de um comando só, lendo, decidindo e escrevendo sem ida e volta.
**No fin-kv:** o débito do limite, a janela por *log* e o limite multidimensional.
**Erro comum:** escrever antes de validar: um erro depois da primeira escrita não a desfaz.
**Onde na prática:** marco 04, também no marco 06.

### Function
**Em uma frase:** uma biblioteca de scripts com nome, carregada com `FUNCTION LOAD` e chamada com `FCALL`, persistida e replicada pelo servidor.
**No fin-kv:** `finkv.debitar_limite`, carregada no *deploy* com `FUNCTION LOAD REPLACE`.
**Erro comum:** achar que ela bloqueia menos que um script: o custo de execução é o mesmo.
**Onde na prática:** marco 04.

### KEYS[]
**Em uma frase:** o argumento pelo qual o script recebe todas as chaves que toca; o cliente usa essa lista para saber em que nó do *cluster* rodar.
**No fin-kv:** um teste lê todos os scripts do repositório e falha se algum recebe a chave por outro caminho.
**Erro comum:** montar a chave dentro do script (`'pix:lim:' .. ARGV[1]`) e quebrar no *cluster*.
**Onde na prática:** marco 04, também no marco 11.

### BUSY
**Em uma frase:** a resposta que todos os clientes recebem enquanto um script passa de `busy-reply-threshold` (5.000 ms por padrão).
**No fin-kv:** o teste derruba o limiar para 100 ms e prova que um segundo cliente recebe `BUSY`.
**Erro comum:** contar com o `SCRIPT KILL`: o script que já escreveu responde `UNKILLABLE`.
**Onde na prática:** marco 04.

### Reserva de idempotência
**Em uma frase:** o `SET chave EM_PROCESSAMENTO NX PX` que dá a uma só requisição o direito de executar; o banco continua sendo a garantia.
**No fin-kv:** `pix:idem:<chave>`, com prazo curto em processamento e 25 h depois de concluída.
**Erro comum:** usá-la como único guardião e duplicar o pagamento quando a chave some por TTL, *eviction*, *failover* ou *restart*.
**Onde na prática:** marco 05.

### GCRA
**Em uma frase:** um algoritmo de limite de taxa que guarda, por chave, só o instante teórico da próxima chegada permitida.
**No fin-kv:** não usado; os limites do `fin-kv` usam janela por *log* e janela fixa.
**Erro comum:** esperar o comando nativo: no Redis 8.10 ele existe no código, mas vem desligado no *build*.
**Onde na prática:** marco 06.

### Política de falha do limite
**Em uma frase:** o que cada limite faz quando o Redis não responde (falha fechada, sinal ausente ou limite local), escrita no mapa de estado.
**No fin-kv:** o limite Pix noturno falha fechado, e a capacidade da API degrada para 10 por segundo por instância.
**Erro comum:** decidir no código, sem dono, e descobrir na queda que o limite regulatório falhou aberto.
**Onde na prática:** marco 06.

### Lease
**Em uma frase:** um lock com prazo, adquirido com `SET chave token NX PX`; resolve o dono morto e cria o dono vivo que perdeu o direito sem saber.
**No fin-kv:** `job:lease:conc-<dia>`, com o fencing token emitido no mesmo script.
**Erro comum:** liberar com `DEL` sem comparar o token e apagar o lease que já é de outro.
**Onde na prática:** marco 07.

### Watchdog
**Em uma frase:** a rotina que renova o lease a cada fração do prazo, só se ele ainda for do mesmo dono (`SET ... IFEQ token PX`).
**No fin-kv:** renova a cada terço do prazo e marca a perda quando o `IFEQ` devolve nulo.
**Erro comum:** achar que ele protege da pausa: ele congela junto com o processo.
**Onde na prática:** marco 07.

## Mensagens

### Pub/Sub
**Em uma frase:** entrega a mensagem a quem assina o canal naquele instante, sem histórico nem confirmação: no máximo uma vez.
**No fin-kv:** só para invalidar cache local; perder uma invalidação custa uma leitura velha até o TTL.
**Erro comum:** notificar "Pix recebido" por Pub/Sub e perder as mensagens publicadas durante um *deploy*.
**Onde na prática:** marco 08.

### Sharded Pub/Sub
**Em uma frase:** o Pub/Sub ligado a um *slot* do *cluster* (`SSUBSCRIBE`, `SPUBLISH`), em vez de repassado a todos os nós.
**No fin-kv:** nenhum uso; o Pub/Sub do `fin-kv` roda numa instância só.
**Erro comum:** esperar dele outra garantia de entrega: continua no máximo uma vez.
**Onde na prática:** marco 08, também no marco 11.

### Stream
**Em uma frase:** um *log* dentro de uma chave, com ids crescentes, corte por `MAXLEN` ou `MINID` e grupos de consumo.
**No fin-kv:** `ntf:pix`, a fila de trabalho das notificações; a fonte é o tópico Kafka.
**Erro comum:** usá-lo como fonte da verdade: a durabilidade dele é a do Redis.
**Onde na prática:** marco 08.

### Grupo de consumo
**Em uma frase:** um conjunto de consumidores que dividem um stream, cada entrada entregue a um deles e confirmada com `XACK`.
**No fin-kv:** o grupo `app` dos notificadores.
**Erro comum:** esperar que o grupo segure o corte do que ainda não leu.
**Onde na prática:** marco 08.

### PEL
**Em uma frase:** a lista de entradas entregues e ainda não confirmadas de um grupo, com o consumidor, o instante e a contagem de entregas.
**No fin-kv:** a contagem de entregas da PEL decide a ida para a *dead-letter*.
**Erro comum:** deixar a PEL crescer sem um *job* de `XAUTOCLAIM`.
**Onde na prática:** marco 08.

### XAUTOCLAIM
**Em uma frase:** transfere para outro consumidor as entradas da PEL ociosas há mais que um tempo mínimo, incrementando a contagem de entregas.
**No fin-kv:** recupera as notificações de um consumidor que morreu antes do `XACK`.
**Erro comum:** processar a entrada reivindicada sem idempotência e duplicar o efeito.
**Onde na prática:** marco 08.

### MAXLEN
**Em uma frase:** o corte do stream pelo número de entradas; com `~`, corta nós inteiros e guarda pelo menos o pedido.
**No fin-kv:** `MAXLEN ~ 100000` em `ntf:pix`.
**Erro comum:** esquecer que o corte é a janela de *replay*: o consumidor atrasado perde o que foi cortado.
**Onde na prática:** marco 08.

## Durabilidade

### Política de eviction
**Em uma frase:** a regra que o Redis segue para descartar chaves quando atinge o `maxmemory`, de recusar
toda escrita (`noeviction`) a descartar qualquer chave (`allkeys-lru`).
**No fin-kv:** a instância de estado usa `noeviction`, e a de cache, `allkeys-lru`.
**Erro comum:** guardar cache e estado na mesma instância com `allkeys-lru`, e perder a chave de
idempotência junto com o cache.
**Onde na prática:** marco 09.

### RDB
**Em uma frase:** o *snapshot* do conjunto de dados inteiro, gerado por `fork` (`BGSAVE`), que perde tudo o que veio depois dele.
**No fin-kv:** nenhum uso como persistência do estado; o `kv-estado` usa AOF.
**Erro comum:** confiar no RDB para estado e perder até um intervalo inteiro de `save`: 4,5 s no laboratório, com `save 5 1`.
**Onde na prática:** marco 09.

### AOF
**Em uma frase:** o *log* de comandos de escrita, reexecutado no *restart*; desde o 7.0, um base mais incrementais e um manifesto.
**No fin-kv:** o `kv-estado` usa AOF com `appendfsync everysec`.
**Erro comum:** achar que o AOF sozinho fecha a janela da queda do *host*.
**Onde na prática:** marco 09.

### appendfsync
**Em uma frase:** quando o servidor chama `fsync` no AOF: `always` (a cada escrita), `everysec` (padrão, uma vez por segundo) ou `no` (o sistema operacional decide).
**No fin-kv:** `everysec`, com `WAITAOF` para as escritas que não aceitam a janela do *host*.
**Erro comum:** confundir a janela do `everysec` com a do `kill -9`: o processo morto quase não perdeu nada no laboratório (no máximo 4 ms), e o *host* derrubado perde até 1 a 2 s.
**Onde na prática:** marco 09.

### Copy-on-write
**Em uma frase:** depois do `fork`, o kernel só duplica uma página quando alguém escreve nela; a memória cresce com a escrita durante o *save*.
**No fin-kv:** o `maxmemory` fica em 40% do limite do contêiner para caber o pico.
**Erro comum:** dimensionar a memória pelo dataset e ter o processo morto no meio do `BGSAVE`: o pico medido foi de 91% a 102% do dataset.
**Onde na prática:** marco 09.

### maxmemory
**Em uma frase:** o limite do dataset; ao atingi-lo, a política de *eviction* decide entre despejar e recusar.
**No fin-kv:** 30 MB por instância no laboratório; em produção, 40% do limite do contêiner.
**Erro comum:** deixar sem limite e descobrir o tamanho pelo OOM killer do sistema operacional.
**Onde na prática:** marco 09.

### Fragmentação
**Em uma frase:** a diferença entre a memória que o processo ocupa e a do dataset, vista em `mem_fragmentation_ratio`.
**No fin-kv:** o painel alerta acima de 1,5.
**Erro comum:** ler `used_memory` e ignorar o RSS real do processo.
**Onde na prática:** marco 09.

### PSYNC
**Em uma frase:** a sincronização parcial: a réplica que reconecta pede só o que falta, a partir do *replication backlog*.
**No fin-kv:** o *backlog* é dimensionado pela pior desconexão aceita vezes a taxa de escrita.
**Erro comum:** um *backlog* pequeno que transforma cada desconexão curta numa sincronização completa, com `fork`.
**Onde na prática:** marco 10.

### Replication backlog
**Em uma frase:** o *buffer* circular com as escritas recentes do primário, de onde sai a sincronização parcial; 1 MB no Redis e 10 MB no Valkey, por padrão.
**No fin-kv:** ajustado no `kv-estado` pelo pico de escrita.
**Erro comum:** assumir o mesmo padrão nos dois motores.
**Onde na prática:** marco 10.

### WAIT
**Em uma frase:** bloqueia o cliente até N réplicas receberem as escritas anteriores da conexão, ou até o prazo; confirma recebimento, não persistência.
**No fin-kv:** `WAIT 1 100` nas escritas críticas: perda zero medida, com o dobro da latência no mesmo *host*.
**Erro comum:** tratar como garantia: a réplica promovida pode ser a que não recebeu.
**Onde na prática:** marco 10.

### min-replicas-to-write
**Em uma frase:** faz o primário recusar escrita (`NOREPLICAS`) quando tem menos réplicas saudáveis que o pedido, com atraso até `min-replicas-max-lag`.
**No fin-kv:** `1`, com `max-lag 2`: o primário isolado parou em cerca de 3 s.
**Erro comum:** achar que zera a perda: o que foi confirmado antes do freio atuar continua perdido.
**Onde na prática:** marco 10.

### Sentinel
**Em uma frase:** o processo que monitora primário e réplicas, decide quando o primário caiu e promove uma réplica; o cliente pergunta a ele quem é o primário.
**No fin-kv:** três sentinelas, `down-after-milliseconds` ajustado para baixo do padrão de 30 s.
**Erro comum:** confundir disponibilidade com ausência de perda.
**Onde na prática:** marco 10.

### Quórum
**Em uma frase:** o número de sentinelas que precisam concordar que o primário caiu para começar o *failover*.
**No fin-kv:** 2 de 3.
**Erro comum:** achar que ele torna a escrita consensual: só a detecção passa por ele.
**Onde na prática:** marco 10.


## Cluster e operação

### Hash slot
**Em uma frase:** uma das 16.384 partições do *cluster*; o *slot* de uma chave é `CRC16(chave) & 0x3FFF`.
**No fin-kv:** 3 primários, cerca de 5.461 *slots* cada.
**Erro comum:** esperar operação multichave entre *slots*: `CROSSSLOT`.
**Onde na prática:** marco 11.

### Hash tag
**Em uma frase:** o trecho entre `{}` numa chave, que é o único que entra no CRC16, pondo chaves diferentes no mesmo *slot*.
**No fin-kv:** `{conta:<id>}` no débito, `{cpf:<id>}` no limite noturno, `{<job>}` no *lease*.
**Erro comum:** `{pix}` em tudo: 100 mil chaves num nó só, no laboratório.
**Onde na prática:** marco 11.

### MOVED
**Em uma frase:** o redirecionamento de um nó que não é dono do *slot*: o cliente atualiza o mapa e repete no dono.
**No fin-kv:** tratado pelo cliente de *cluster*.
**Erro comum:** usar um cliente comum num *cluster* e ver `MOVED` como erro.
**Onde na prática:** marco 11.

### ASK
**Em uma frase:** o redirecionamento durante a migração de um *slot*: vale só para o comando, precedido de `ASKING`, sem mudar o mapa.
**No fin-kv:** tratado pelo cliente; nenhum erro visível em 1.000 *slots* migrados sob carga.
**Erro comum:** atualizar o mapa num `ASK` e perder a migração de vista.
**Onde na prática:** marco 11.

### Resharding
**Em uma frase:** mover *slots* entre primários: chave a chave com `MIGRATE`, ou atomicamente (`CLUSTER MIGRATION` no Redis 8.4+, `CLUSTER MIGRATESLOTS` no Valkey 9.0+).
**No fin-kv:** feito sob carga, com o invariante do débito verificado depois.
**Erro comum:** esquecer o `TRYAGAIN` dos comandos multichave com chaves dos dois lados da migração.
**Onde na prática:** marco 11.

