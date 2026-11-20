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

## Durabilidade

### Política de eviction
**Em uma frase:** a regra que o Redis segue para descartar chaves quando atinge o `maxmemory`, de recusar
toda escrita (`noeviction`) a descartar qualquer chave (`allkeys-lru`).
**No fin-kv:** a instância de estado usa `noeviction`, e a de cache, `allkeys-lru`.
**Erro comum:** guardar cache e estado na mesma instância com `allkeys-lru`, e perder a chave de
idempotência junto com o cache.
**Onde na prática:** marco 09.
