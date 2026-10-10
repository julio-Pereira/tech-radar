Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Taxonomia

### Data race
**Em uma frase:** acesso concorrente à mesma posição de memória, pelo menos uma escrita, sem happens-before entre os acessos.
**No fin-platform:** `limiteUsado += valor` sem sincronização no contador de limite diário.
**Erro comum:** achar que "rodou sem erro mil vezes" prova ausência de data race.
**Onde na prática:** marco 01.

### Race condition
**Em uma frase:** o resultado depende da intercalação das operações — pode existir sem nenhum data race.
**No fin-platform:** ler e depois escrever num `ConcurrentHashMap` sem a sequência ser atômica.
**Erro comum:** confiar que uma coleção thread-safe torna toda sequência de operações sobre ela segura.
**Onde na prática:** marco 01.

### Check-then-act (TOCTOU)
**Em uma frase:** ler um valor, decidir com base nele, e escrever depois, sem que a sequência inteira seja atômica.
**No fin-platform:** verificar o limite disponível e só então debitar, com outra thread no meio.
**Erro comum:** proteger a leitura e a escrita separadamente, achando que isso protege a decisão entre elas.
**Onde na prática:** marcos 01 e 03.

### Estado compartilhado mutável
**Em uma frase:** a origem de todo bug desta trilha — dado que mais de uma thread pode ler e escrever ao mesmo tempo.
**No fin-platform:** o saldo em memória, disputado por N requisições simultâneas.
**Erro comum:** tratar concorrência como problema de "threads", quando o problema é sempre o estado que elas compartilham.
**Onde na prática:** marco 01 e toda a trilha.

### Atomicidade
**Em uma frase:** a garantia de que uma operação acontece por inteiro ou não acontece — nunca pela metade, visível a outra thread.
**No fin-platform:** `compareAndSet` sendo atômico mesmo quando `contador++` não é.
**Erro comum:** achar que `volatile` torna uma operação composta atômica.
**Onde na prática:** marcos 01 e 02.

### Visibilidade e ordenação
**Em uma frase:** se uma thread vê a escrita de outra (visibilidade), e se vê várias escritas na ordem em que aconteceram (ordenação).
**No fin-platform:** a flag `ativo` que uma thread nunca vê mudar sem `volatile`.
**Erro comum:** achar que "funcionou no meu teste" garante visibilidade em qualquer hardware.
**Onde na prática:** marco 02.

## Escalabilidade

### Concorrência × paralelismo
**Em uma frase:** concorrência é lidar com várias coisas ao mesmo tempo; paralelismo é executá-las de fato simultaneamente.
**No fin-platform:** mil goroutines esperando I/O é concorrência; oito delas rodando em oito núcleos é paralelismo.
**Erro comum:** achar que mais threads sempre significa mais paralelismo real.
**Onde na prática:** marco 01.

### Lei de Amdahl
**Em uma frase:** o teto de speedup de um programa paralelo é limitado pela fração que só roda em série.
**No fin-platform:** com 25% de seção crítica serial, o teto de speedup é 4×, não importa quantos workers.
**Erro comum:** pedir mais threads sem medir a fração serial primeiro.
**Onde na prática:** marco 01.

### USL (Universal Scalability Law)
**Em uma frase:** acrescenta à lei de Amdahl o custo de coerência entre workers, que pode fazer o throughput cair com mais workers.
**No fin-platform:** o ponto em que adicionar threads piora a vazão em vez de melhorar.
**Erro comum:** assumir que o throughput apenas satura, nunca cai, além de um certo número de workers.
**Onde na prática:** marco 01.

### Fração serial
**Em uma frase:** a parte do trabalho que não pode ser paralelizada, usada como `s` na fórmula de Amdahl.
**No fin-platform:** o tempo gasto dentro da seção crítica do débito, medido antes de dimensionar.
**Erro comum:** estimar `s` de cabeça em vez de medir o tempo real em seção crítica.
**Onde na prática:** marco 01.

### False sharing
**Em uma frase:** duas variáveis independentes, em posições de memória próximas, disputando a mesma linha de cache entre núcleos.
**No fin-platform:** dois contadores atômicos de contas diferentes, vizinhos na memória, competindo por cache sem nenhuma relação lógica.
**Erro comum:** não perceber que o custo de contenção vem do layout de memória, não da lógica do programa.
**Onde na prática:** marco 03.

## Memória

### Happens-before
**Em uma frase:** a única relação que garante que uma leitura veja uma escrita anterior — sem ela, nada é garantido.
**No fin-platform:** o `Unlock` de um mutex happens-before o próximo `Lock` do mesmo mutex.
**Erro comum:** assumir visibilidade implícita entre threads sem nenhuma relação de sincronização estabelecida.
**Onde na prática:** marco 02.

### `volatile`
**Em uma frase:** garante visibilidade e ordenação de um campo — não atomicidade de operações compostas sobre ele.
**No fin-platform:** a flag `ativo` do processo de conciliação, lida em loop por outra thread.
**Erro comum:** usar `volatile` para proteger `contador++` e achar que o incremento virou atômico.
**Onde na prática:** marco 02.

### Publicação segura
**Em uma frase:** garantir que um objeto só fica visível a outras threads depois de totalmente construído.
**No fin-platform:** o objeto de configuração publicado só depois de todos os campos `final` definidos no construtor.
**Erro comum:** publicar a referência antes do construtor terminar, deixando o objeto "existir" pela metade.
**Onde na prática:** marco 02.

### Double-checked locking
**Em uma frase:** verificar duas vezes se um singleton existe, uma sem lock e outra com, para evitar lock em todo acesso.
**No fin-platform:** a inicialização preguiçosa de um cliente caro, compartilhado entre requisições.
**Erro comum:** esquecer o `volatile` no campo, permitindo que outra thread veja o objeto parcialmente construído.
**Onde na prática:** marco 02.

### Litmus test
**Em uma frase:** um programa mínimo desenhado para expor um comportamento específico do modelo de memória, como store-buffering.
**No fin-platform:** `x=1; r1=y` numa thread e `y=1; r2=x` na outra, rodado milhões de vezes em jcstress.
**Erro comum:** rodar o litmus test poucas vezes e concluir ausência de bug pela falta de ocorrência.
**Onde na prática:** marco 02.

### TSO (Total Store Order)
**Em uma frase:** o modelo de memória relativamente forte do x86, que esconde boa parte das reordenações que quebrariam código sem sincronização.
**No fin-platform:** o bug de memória que nunca apareceu no laptop x86 e quebrou no primeiro dia num servidor ARM.
**Erro comum:** validar concorrência só em x86 e assumir que o resultado vale em qualquer arquitetura.
**Onde na prática:** marco 02.

## Sincronização

### Mutex
**Em uma frase:** mecanismo de exclusão mútua — só uma thread/goroutine por vez dentro da seção protegida.
**No fin-platform:** o lock por conta do débito em memória.
**Erro comum:** copiar um `sync.Mutex` por valor em Go, invalidando a proteção silenciosamente.
**Onde na prática:** marco 03.

### Lock reentrante
**Em uma frase:** um lock que a mesma thread pode readquirir sem travar — propriedade de `synchronized`/`ReentrantLock` em Java, ausente em `Mutex` de Go.
**No fin-platform:** um método que chama a si mesmo recursivamente segurando o mesmo lock.
**Erro comum:** portar esse padrão de Java para Go sem perceber que `Mutex` não é reentrante.
**Onde na prática:** marco 03.

### Read-write lock
**Em uma frase:** separa leitores (que podem coexistir) de escritores (exclusivos) — `ReadWriteLock`/`StampedLock` em Java, `RWMutex` em Go.
**No fin-platform:** a configuração de limites, lida com frequência e escrita raramente.
**Erro comum:** não perceber o writer starvation quando o fluxo de leitores nunca para.
**Onde na prática:** marco 03.

### CAS (compare-and-set)
**Em uma frase:** ler, comparar com um valor esperado, e só escrever se ainda bate — tudo numa instrução, sem lock.
**No fin-platform:** o retry loop do contador de limite implementado sem `synchronized`.
**Erro comum:** compor vários CAS sem seção crítica e recriar a race condition que o CAS individual não tinha.
**Onde na prática:** marco 03.

### ABA
**Em uma frase:** o valor lido era `A`, virou `B` e voltou para `A` — o CAS sucede achando que nada mudou.
**No fin-platform:** uma estrutura lock-free que reusa referências e pode confundir "voltou ao mesmo valor" com "nada aconteceu".
**Erro comum:** ignorar o risco em qualquer estrutura além de um contador simples de inteiro.
**Onde na prática:** marco 03.

### LongAdder
**Em uma frase:** estrutura de contador feita para alta contenção, somando células internas na leitura em vez de disputar uma única posição.
**No fin-platform:** o contador de TPV do dia, incrementado por milhares de threads ao mesmo tempo.
**Erro comum:** usar `LongAdder` em baixa contenção, onde o overhead extra não compensa.
**Onde na prática:** marco 03.

### Ator / single-writer
**Em uma frase:** uma única thread/goroutine é a dona do estado; o resto manda mensagem em vez de disputar lock.
**No fin-platform:** uma goroutine por conta, processando débitos em sequência pela fila de mensagens recebida.
**Erro comum:** achar que ator elimina contenção — ele a move para a fila de mensagens.
**Onde na prática:** marco 03.

### Lock striping
**Em uma frase:** dividir um espaço grande de chaves em N locks fixos por hash, meio-termo entre lock global e lock por chave.
**No fin-platform:** 64 locks cobrindo milhões de contas, em vez de um lock por conta ou um lock só.
**Erro comum:** escolher N pequeno demais, concentrando chaves distintas no mesmo lock sem ganho real.
**Onde na prática:** marco 03.

## Enrosco

### Deadlock
**Em uma frase:** duas ou mais threads/transações esperando, cada uma, um recurso que a outra segura — nenhuma progride.
**No fin-platform:** `transfer(A→B)` e `transfer(B→A)` simultâneas, cada uma travada no lock da outra.
**Erro comum:** achar que deadlock é raro — toda transferência entre duas entidades é candidata.
**Onde na prática:** marco 04.

### Condições de Coffman
**Em uma frase:** exclusão mútua, posse e espera, não-preempção e espera circular — as quatro condições necessárias para um deadlock.
**No fin-platform:** a espera circular é a que a ordem total de aquisição quebra.
**Erro comum:** tentar eliminar deadlock sem identificar qual condição está sendo quebrada.
**Onde na prática:** marco 04.

### Ordem total de aquisição
**Em uma frase:** adquirir locks sempre na mesma ordem relativa (ex.: por id crescente), eliminando ciclos de espera.
**No fin-platform:** sempre travar a conta de id menor primeiro, não a de origem primeiro.
**Erro comum:** definir a ordem pela ordem dos parâmetros da chamada em vez de por um critério global estável.
**Onde na prática:** marco 04.

### Livelock
**Em uma frase:** threads ativas reagindo uma à outra sem nenhuma progredir — ao contrário de deadlock, ninguém está parado.
**No fin-platform:** dois processos que recuam ao perceber contenção, e recuam ao mesmo tempo, para sempre.
**Erro comum:** confundir com deadlock e aplicar a correção errada (ordem de aquisição não resolve livelock).
**Onde na prática:** marco 04.

### Starvation (writer starvation)
**Em uma frase:** uma thread específica nunca consegue o recurso porque outras sempre chegam primeiro.
**No fin-platform:** um escritor que nunca entra num `RWMutex` porque o fluxo de leitores nunca para.
**Erro comum:** medir só a vazão agregada e não perceber que um participante específico nunca é servido.
**Onde na prática:** marco 04.

### `40P01`
**Em uma frase:** o código de erro do Postgres para deadlock detectado entre transações.
**No fin-platform:** o erro esperado quando duas transferências cruzadas colidem, mesmo com ordem de aquisição imperfeita.
**Erro comum:** tratar `40P01` como falha fatal em vez de capturar e repetir a transação.
**Onde na prática:** marco 04.

### Deadlock de pool
**Em uma frase:** uma unidade de trabalho segura uma conexão e pede uma segunda do mesmo pool antes de devolver a primeira.
**No fin-platform:** `REQUIRES_NEW` chamado de dentro de uma transação já aberta, com pool pequeno demais.
**Erro comum:** procurar um lock de memória quando o impasse real é por conexões, não por seção crítica.
**Onde na prática:** marcos 04 e 07.

### Deadlock distribuído
**Em uma frase:** serviço A espera resposta de B que está esperando resposta de A — sem detecção de ciclo possível sem coordenador global.
**No fin-platform:** duas chamadas síncronas entre dois serviços, cada uma esperando a outra terminar.
**Erro comum:** achar que `async` ou virtual thread eliminam o risco — eles só baratam manter a chamada pendente.
**Onde na prática:** marco 04.

## Pools e filas

### Thread pool
**Em uma frase:** um conjunto fixo (ou elástico) de threads reutilizadas para executar tarefas, evitando o custo de criar uma thread por tarefa.
**No fin-platform:** o pool que chama o PSP, dimensionado pela proporção espera/computação.
**Erro comum:** usar `newFixedThreadPool` e esquecer que a fila atrás dele é ilimitada por padrão.
**Onde na prática:** marco 05.

### Fila limitada e política de rejeição
**Em uma frase:** um teto no tamanho da fila de um executor, com uma regra explícita (`AbortPolicy`, `CallerRunsPolicy`) para quando ela enche.
**No fin-platform:** a fila do pool do PSP, limitada para rejeitar em vez de acumular sob degradação.
**Erro comum:** deixar a fila ilimitada e descobrir o limite quando a memória do processo esgota.
**Onde na prática:** marco 05.

### CallerRunsPolicy
**Em uma frase:** quando a fila está cheia, a própria thread que submeteu a tarefa a executa, criando contrapressão natural.
**No fin-platform:** o pool do PSP sob sobrecarga, desacelerando quem está produzindo trabalho demais.
**Erro comum:** achar que `CallerRunsPolicy` descarta trabalho — ele executa, só que na thread errada de propósito.
**Onde na prática:** marco 05.

### `commonPool`
**Em uma frase:** o `ForkJoinPool` compartilhado por toda a JVM, usado por padrão por `parallelStream`.
**No fin-platform:** uma chamada de rede dentro de um `parallelStream`, roubando capacidade de todo outro uso concorrente de `parallelStream`.
**Erro comum:** usar `parallelStream` para I/O, nunca pensado para isso.
**Onde na prática:** marco 05.

### Lei de Little
**Em uma frase:** concorrência média = taxa de chegada × tempo médio de permanência no sistema.
**No fin-platform:** a fórmula que conecta TPS e tempo de retenção ao tamanho necessário de um pool ou executor.
**Erro comum:** dimensionar por intuição em vez de medir taxa e tempo de permanência.
**Onde na prática:** marcos 05 e 07.

### Tempo de retenção
**Em uma frase:** quanto tempo uma unidade de trabalho segura um recurso finito (thread, conexão) antes de devolvê-lo.
**No fin-platform:** o tempo de uma transação que faz uma chamada HTTP no meio, multiplicando a retenção da conexão.
**Erro comum:** medir só o tempo de query, esquecendo o tempo de transação inteiro, inclusive I/O externo dentro dela.
**Onde na prática:** marco 07.

### Connection pool e vazamento de conexão
**Em uma frase:** o conjunto de conexões reutilizáveis a um banco; vazamento é uma conexão emprestada e nunca devolvida.
**No fin-platform:** uma conexão aberta num caminho de erro que não passa pelo `finally`/`defer` de devolução.
**Erro comum:** não ligar `leakDetectionThreshold` (Hikari) ou não monitorar `InUse` (`database/sql`) antes de produção.
**Onde na prática:** marco 07.

### `maxLifetime` e `connectionTimeout`
**Em uma frase:** por quanto tempo uma conexão vive antes de ser reciclada, e por quanto tempo uma requisição espera por uma conexão livre.
**No fin-platform:** `connectionTimeout` menor que o timeout da transação, para nunca esperar mais do que o cliente já desistiu de esperar.
**Erro comum:** inverter a hierarquia de timeouts, deixando o timeout do pool maior que o da requisição.
**Onde na prática:** marco 07.

### `max_connections`
**Em uma frase:** o teto de conexões simultâneas que o banco aceita, compartilhado por todas as réplicas da aplicação.
**No fin-platform:** 400 conexões pedidas (20 réplicas × pool de 20) contra um `max_connections` de 100.
**Erro comum:** dimensionar o pool de cada réplica sem considerar `maxReplicas × pool` contra esse teto.
**Onde na prática:** marco 07.

## Moderno

### Virtual thread
**Em uma frase:** thread leve, gerenciada pela JVM, multiplexada sobre um número menor de threads de plataforma (JEP 444).
**No fin-platform:** milhares de requisições concorrentes, cada uma numa virtual thread, sem esgotar threads de sistema operacional.
**Erro comum:** dimensionar um pool de virtual threads como se threads continuassem sendo o recurso escasso.
**Onde na prática:** marco 06.

### Pinning
**Em uma frase:** quando uma virtual thread bloqueada prende sua thread de plataforma carregadora, em vez de liberá-la.
**No fin-platform:** uma virtual thread bloqueada dentro de `synchronized` em JDK 21, antes do JEP 491.
**Erro comum:** assumir que pinning foi eliminado em qualquer versão do JDK, sem checar: só é GA a partir do JDK 24.
**Onde na prática:** marco 06.

### ScopedValue
**Em uma frase:** dado imutável compartilhado com uma árvore de tarefas, com escopo bem definido — alternativa mais barata a `ThreadLocal` (JEP 506).
**No fin-platform:** o id de correlação de uma requisição, propagado para todas as chamadas filhas sem um mapa por thread.
**Erro comum:** usar em JDK 21 sem `--enable-preview`, ou assumir que já é final em toda versão 21-24.
**Onde na prática:** marco 06.

### Vazamento de goroutine
**Em uma frase:** uma goroutine que nunca termina — presa num envio sem receptor, um `Ticker` esquecido, ou um `select` sem `ctx.Done()`.
**No fin-platform:** mil requisições canceladas, mas a contagem de goroutines nunca volta à linha de base.
**Erro comum:** não testar cancelamento sob carga, só o caminho feliz.
**Onde na prática:** marco 06.

### `context.Context`
**Em uma frase:** o mecanismo de Go para propagar cancelamento, deadline e valores de requisição por uma árvore de chamadas.
**No fin-platform:** o contexto do pedido de extrato, cancelado quando o usuário fecha o app antes da resposta.
**Erro comum:** não propagar o `context` recebido para as chamadas filhas, quebrando a propagação do cancelamento.
**Onde na prática:** marco 06.

### Cancelamento cooperativo
**Em uma frase:** o sinal de cancelamento (`interrupt()`, `ctx.Done()`) só marca um estado — o código precisa checar e reagir.
**No fin-platform:** uma chamada que ignora `ctx.Done()` e continua rodando até o fim, mesmo após o cliente desistir.
**Erro comum:** achar que "cancelar" para a execução sozinho, sem nenhuma checagem no código.
**Onde na prática:** marco 06.

## Provar e ver

### jcstress
**Em uma frase:** harness da OpenJDK que roda operações concorrentes milhões de vezes, forçando intercalações diferentes a cada rodada.
**No fin-platform:** o teste de litmus de store-buffering, rodado até expor (ou não) o resultado proibido.
**Erro comum:** rodar poucas iterações e concluir correção pela ausência de falha.
**Onde na prática:** marco 02 e 08.

### Detector de race
**Em uma frase:** instrumentação que acusa um data race que de fato ocorreu numa execução — não prova ausência geral.
**No fin-platform:** `go test -race` sobre a suíte do `fin-contention`.
**Erro comum:** achar que "zero race reportado" prova que não há race condition lógica nenhuma.
**Onde na prática:** marcos 01 e 08.

### Linearizabilidade
**Em uma frase:** existe uma ordem sequencial legal, respeitando os intervalos de tempo de cada operação, que explica os resultados observados.
**No fin-platform:** o verificador de histórico do `debit()`, buscando essa ordem para até 8 operações.
**Erro comum:** confundir com "a ordem real de execução foi esta" — linearizabilidade é sobre existência de uma ordem possível.
**Onde na prática:** marco 08.

### Teste de mutação
**Em uma frase:** remover deliberadamente uma proteção e confirmar que a suíte de testes falha — prova de que o teste testa o que acha que testa.
**No fin-platform:** remover o lock de um caminho de escrita do débito e ver se o CI fica vermelho.
**Erro comum:** confiar numa suíte verde sem nunca ter provado que ela detectaria a ausência da proteção.
**Onde na prática:** marcos 08 e 10.

### Thread dump
**Em uma frase:** um instantâneo do estado de todas as threads de um processo Java num dado momento (`jstack`, `jcmd Thread.print`).
**No fin-platform:** duzentas threads em `BLOCKED` no mesmo monitor, revelando o lock disputado.
**Erro comum:** tirar um único dump e concluir a causa, sem olhar a evolução ao longo do tempo.
**Onde na prática:** marco 09.

### Perfil de mutex e block
**Em uma frase:** perfis do `pprof` que mostram onde um programa Go espera por locks (mutex) ou por qualquer sincronização (block).
**No fin-platform:** o perfil de mutex apontando a seção crítica do débito como o ponto de maior espera.
**Erro comum:** olhar só o perfil de CPU quando o sintoma é CPU baixa — a pergunta certa precisa de outro perfil.
**Onde na prática:** marco 09.
