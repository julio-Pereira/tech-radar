Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira —
o Bloco A cria o vocabulário e os blocos seguintes o reencontram, sempre com o banco aberto.

## Falha e tempo

### Crash-recovery
**Em uma frase:** o modelo de falha em que o nó morre, volta e tem memória parcial do que fez.
**No fin-platform:** é o modelo real do `fin-store` — o WAL existe exatamente para o "volta" ser correto.
**Erro comum:** projetar para crash-stop, e descobrir na primeira queda que o nó voltou e reprocessou.
**Onde na prática:** marco 01.

### Falha bizantina
**Em uma frase:** o nó responde, e responde errado.
**No fin-platform:** o PSP que reporta um pagamento que nunca aconteceu.
**Erro comum:** achar que só existe em blockchain — na fronteira com o parceiro ela é rotina, e a defesa é conciliação, não consenso.
**Onde na prática:** marcos 01 e 08.

### Clock skew
**Em uma frase:** a diferença entre os relógios de parede de dois hosts, que o NTP corrige aos saltos, inclusive para trás.
**No fin-platform:** o estorno com `occurredAt` 40 segundos anterior ao débito que ele estorna.
**Erro comum:** ordenar lançamentos por timestamp de hosts diferentes — erro silencioso, nunca uma exceção.
**Onde na prática:** marco 01.

### Relógio lógico (Lamport)
**Em uma frase:** um contador propagado nas mensagens que garante que a causa tem número menor que o efeito.
**No fin-platform:** a alternativa barata ao timestamp para saber que o débito precede o estorno.
**Erro comum:** inverter a implicação — contador menor **não** prova causalidade.
**Onde na prática:** marco 01.

### Fencing token
**Em uma frase:** um número que só cresce, entregue a quem assume a liderança ou o lock, e verificado pelo storage.
**No fin-platform:** o que impede o nó pausado por GC de escrever no ledger depois de já ter perdido o lock.
**Erro comum:** confiar num timeout menor em vez do token — timeout não distingue lento de morto.
**Onde na prática:** marcos 01 e 10.

### Split-brain
**Em uma frase:** dois nós convencidos de que são o leader, ambos aceitando escrita.
**No fin-platform:** o failover automático disparado por uma pausa de rede de 20 segundos.
**Erro comum:** tratar como problema de configuração; é consequência de a detecção de falha ser um palpite.
**Onde na prática:** marcos 01 e 02.

## Replicação e distribuição

### Lag de réplica
**Em uma frase:** a distância entre o que o leader já gravou e o que a réplica já aplicou.
**No fin-platform:** 8 segundos no pico das 18h, com autovacuum ativo.
**Erro comum:** medir em bytes de WAL e alertar como se fosse tempo — ou não alertar.
**Onde na prática:** marco 02.

### Leitura não-monotônica
**Em uma frase:** duas leituras seguidas caem em réplicas com lags diferentes e o valor volta no tempo.
**No fin-platform:** o saldo que exibe R$ 1.240, depois R$ 1.180, depois R$ 1.240.
**Erro comum:** procurar o bug no cálculo do saldo, que está certo.
**Onde na prática:** marco 02.

### Read-your-writes
**Em uma frase:** a garantia de que quem escreveu enxerga a própria escrita na leitura seguinte.
**No fin-platform:** o cliente que paga, vê o extrato sem o pagamento e paga de novo.
**Erro comum:** resolver com sticky routing, que garante monotonicidade e não garante isto.
**Onde na prática:** marco 02.

### RPO
**Em uma frase:** quanto dado você aceita perder, medido em tempo de escrita.
**No fin-platform:** o número que decide entre replicação síncrona e assíncrona.
**Erro comum:** declarar RPO zero com replicação assíncrona configurada.
**Onde na prática:** marcos 02 e 12.

### RTO
**Em uma frase:** quanto tempo você aceita ficar fora até voltar a operar.
**No fin-platform:** o tempo cronometrado do ensaio de restore, não o do slide.
**Erro comum:** medir só o restore e esquecer o tempo de perceber e de decidir.
**Onde na prática:** marco 12.

### Quórum (R + W > N)
**Em uma frase:** leituras e escritas se sobrepõem em pelo menos um nó, então a leitura vê a escrita mais recente.
**No fin-platform:** a mesma aritmética do `min.insync.replicas` do `pix-stream`.
**Erro comum:** manter a fórmula na cabeça depois de ativar sloppy quorum, que a invalida.
**Onde na prática:** marco 02.

### LWW (last write wins)
**Em uma frase:** resolução de conflito que mantém a escrita com timestamp maior e descarta a outra.
**No fin-platform:** proibido em saldo — é perda de dado sem erro, sem log e sem ninguém saber.
**Erro comum:** aceitar o default de multi-leader sem perceber que ele é isto.
**Onde na prática:** marco 02.

### Consistent hashing
**Em uma frase:** distribuir chaves num anel com nós virtuais, de modo que crescer mova só a fatia vizinha.
**No fin-platform:** como o `fin-store` cresceria de 4 para 5 shards sem remapear tudo.
**Erro comum:** usar `hash % n` e descobrir na hora de crescer que quase todo dado precisa se mover.
**Onde na prática:** marco 03.

### Chave de shard
**Em uma frase:** a coluna que decide em qual banco o dado mora — e, por consequência, quais queries ficam caras para sempre.
**No fin-platform:** `accountId`, presente em toda chave primária mesmo antes de existir shard.
**Erro comum:** escolher a data, que parece ótima e concentra 100% da escrita no shard do mês corrente.
**Onde na prática:** marco 03.

### Hot key / celebrity problem
**Em uma frase:** uma chave concentra tráfego desproporcional e satura o shard ou a partição que a hospeda.
**No fin-platform:** o marketplace que responde por 30% dos lançamentos.
**Erro comum:** confiar em cardinalidade alta como se fosse distribuição uniforme.
**Onde na prática:** marcos 03 e 09.

### Scatter-gather
**Em uma frase:** consultar todos os shards e juntar os resultados; a latência é a do shard mais lento.
**No fin-platform:** a busca por documento do cliente, quando o índice secundário é local.
**Erro comum:** colocar uma query de caminho quente atrás disso e alertar pela média.
**Onde na prática:** marco 03.

## Transações e consistência

### Write skew
**Em uma frase:** duas transações leem, validam uma condição sobre um conjunto e escrevem em linhas diferentes, violando a invariante sem colidir.
**No fin-platform:** duas transferências concorrentes contra o mesmo limite conjunto — as duas passam.
**Erro comum:** procurar um lock que resolva; não há linha em comum para colidir até você materializar o conflito.
**Onde na prática:** marco 04.

### Lost update
**Em uma frase:** duas transações leem o mesmo valor, calculam sobre ele e a segunda escrita apaga a primeira.
**No fin-platform:** `saldo = saldo - 100` em duas sessões, e um dos débitos some.
**Erro comum:** achar que `READ COMMITTED` protege — ele não protege.
**Onde na prática:** marcos 04 e 10.

### MVCC
**Em uma frase:** cada escrita cria uma nova versão da linha, e cada transação lê o snapshot que lhe cabe.
**No fin-platform:** o relatório longo que lê sem travar a autorização de pagamento.
**Erro comum:** ignorar o preço — bloat, vacuum e a transação longa que segura a limpeza do banco inteiro.
**Onde na prática:** marcos 04 e 07.

### SSI (serializable snapshot isolation)
**Em uma frase:** o `SERIALIZABLE` do Postgres, que roda como snapshot e aborta transações cujo entrelaçamento não teria ordem serial equivalente.
**No fin-platform:** o nível do fluxo de limite conjunto, com retry e teto de tentativas.
**Erro comum:** ligá-lo sem preparar a aplicação para tratar o erro de serialização.
**Onde na prática:** marco 04.

### Materializar o conflito
**Em uma frase:** criar de propósito uma linha comum para que um conflito invisível vire um conflito de escrita detectável.
**No fin-platform:** a linha `grupo_limite`, travada com `FOR UPDATE` antes da validação.
**Erro comum:** desprezar a técnica e ir direto ao `SERIALIZABLE`, pagando aborts em toda a aplicação.
**Onde na prática:** marco 04.

### Linearizabilidade
**Em uma frase:** assim que uma escrita termina, toda leitura seguinte a enxerga — é recência, e é o C do CAP.
**No fin-platform:** o que a autorização exige do saldo, e o motivo de ela não ler de réplica.
**Erro comum:** confundir com serializabilidade, que é sobre equivalência a alguma ordem serial e nada diz sobre recência.
**Onde na prática:** marco 04.

### 2PC / XA
**Em uma frase:** protocolo de commit em duas fases entre recursos distintos, com um coordenador.
**No fin-platform:** a alternativa que a trilha compara e não adota.
**Erro comum:** subestimar a transação em dúvida — a que trava recursos e exige intervenção humana de madrugada.
**Onde na prática:** marco 08.

### Reconciliação
**Em uma frase:** o processo que compara duas fontes e aponta divergência, tornando a consistência eventual auditável.
**No fin-platform:** o job D+1 que confere lançamentos contra o extrato do parceiro.
**Erro comum:** ter reconciliação sem ação definida para a divergência encontrada.
**Onde na prática:** marco 08.

## Armazenamento e desempenho

### B-tree × LSM-tree
**Em uma frase:** duas famílias de storage engine — a primeira paga na escrita aleatória, a segunda vence na escrita e cobra na leitura e na compactação.
**No fin-platform:** o ledger é append-heavy e read-by-account, e a escolha precisa dizer por quê.
**Erro comum:** escolher por marca do banco em vez de pelo padrão de acesso.
**Onde na prática:** marco 05.

### Amplificação de escrita
**Em uma frase:** quantos bytes o disco realmente grava para cada byte que a aplicação pediu para gravar.
**No fin-platform:** a lente para prever custo de disco antes de contratá-lo.
**Erro comum:** comparar engines por benchmark de vazão e ignorar as três amplificações (escrita, leitura, espaço).
**Onde na prática:** marco 05.

### WAL e `fsync`
**Em uma frase:** o log que garante durabilidade — e a chamada de sistema que decide até onde essa garantia realmente chegou.
**No fin-platform:** `synchronous_commit` é um botão com dono e ADR, não um ajuste de desempenho.
**Erro comum:** relaxar o `fsync` para ganhar vazão sem escrever quanto dado isso passa a permitir perder.
**Onde na prática:** marco 05.

### Índice coberto (index-only scan)
**Em uma frase:** o índice contém todas as colunas da query, e o banco não precisa visitar a tabela.
**No fin-platform:** o que faz o extrato por conta e período caber no alvo de p99.
**Erro comum:** criar um índice por query nova, esquecendo que todo índice é imposto cobrado em cada `INSERT`.
**Onde na prática:** marcos 05 e 07.

### Bloat e autovacuum
**Em uma frase:** o espaço ocupado por versões mortas de linha, e o processo que as recolhe.
**No fin-platform:** o vacuum que não roda porque um relatório de duas horas está com a transação aberta.
**Erro comum:** tratar como assunto de DBA — é a causa raiz de degradações lentas que ninguém explica.
**Onde na prática:** marco 07.

### Partition pruning
**Em uma frase:** o planner descarta as partições que não podem conter o resultado.
**No fin-platform:** a consulta de extrato tocando uma partição mensal em vez de sessenta.
**Erro comum:** particionar e escrever a query sem a coluna de partição no filtro, perdendo o benefício inteiro.
**Onde na prática:** marco 07.

### Pool de conexões
**Em uma frase:** o intermediário que reaproveita conexões, porque no Postgres cada conexão é um processo.
**No fin-platform:** PgBouncer em transaction pooling entre `ledger-core` e o banco.
**Erro comum:** aumentar o pool da aplicação para resolver lentidão e piorar tudo — o mesmo erro do Hikari saturado em `observabilidade/03`.
**Onde na prática:** marco 07.

## Cache, identidade e concorrência

### Cache-aside
**Em uma frase:** a aplicação lê do cache, e no miss lê do banco e popula.
**No fin-platform:** o limite disponível, com TTL curto e verificação no momento da autorização.
**Erro comum:** usá-lo para saldo contábil — que nunca é servido de cache.
**Onde na prática:** marco 09.

### Stampede (thundering herd)
**Em uma frase:** a chave expira e todas as requisições concorrentes vão ao banco ao mesmo tempo.
**No fin-platform:** 200 autorizações simultâneas virando 200 queries um segundo após a expiração.
**Erro comum:** TTL fixo e igual para tudo; a mitigação é jitter, single-flight e refresh antecipado.
**Onde na prática:** marco 09.

### Negative caching
**Em uma frase:** cachear também a ausência do dado, para que o miss não martele o banco.
**No fin-platform:** a consulta por uma conta que não existe, repetida por um cliente com bug.
**Erro comum:** esquecer o TTL curto e passar a servir "não existe" para um dado que passou a existir.
**Onde na prática:** marco 09.

### UUIDv7
**Em uma frase:** identificador único ordenável no tempo, que preserva a locality do índice B-tree.
**No fin-platform:** a chave dos lançamentos, escolhida com a fragmentação medida contra UUIDv4.
**Erro comum:** usar UUIDv4 em tabela de altíssima inserção e pagar em fragmentação e cache miss.
**Onde na prática:** marco 10.

### Lease com fencing
**Em uma frase:** lock distribuído com prazo e número crescente, verificado por quem escreve.
**No fin-platform:** o que protege o job de fechamento de rodar duas vezes em paralelo.
**Erro comum:** confiar no Redlock puro, cuja crítica é justamente a ausência do token.
**Onde na prática:** marcos 01 e 10.

## Operar e evoluir

### Expand/contract
**Em uma frase:** migrar schema em quatro fases compatíveis — adicionar, escrever nos dois, migrar e verificar, ler do novo e remover o antigo.
**No fin-platform:** trocar a representação da coluna monetária sem parar a autorização.
**Erro comum:** juntar duas fases num deploy só e perder a reversibilidade.
**Onde na prática:** marco 11.

### Backfill
**Em uma frase:** preencher em lote o dado novo para as linhas antigas, de forma retomável e idempotente.
**No fin-platform:** 5 milhões de linhas, paginadas por chave e com throttle pelo lag de réplica.
**Erro comum:** paginar por `OFFSET` e ver o job ficar mais lento a cada página.
**Onde na prática:** marco 11.

### `ACCESS EXCLUSIVE`
**Em uma frase:** o lock que um `ALTER TABLE` pede e que enfileira atrás de qualquer transação aberta — travando também a leitura.
**No fin-platform:** o DDL de sexta que parou a autorização por sete minutos.
**Erro comum:** rodar DDL sem `lock_timeout` e sem retry.
**Onde na prática:** marco 11.

### PITR (point-in-time recovery)
**Em uma frase:** restaurar o banco para um instante exato, combinando backup base e WAL arquivado.
**No fin-platform:** voltar para cinco minutos antes do `DELETE` sem `WHERE`.
**Erro comum:** confiar na réplica como se fosse backup — ela replica a corrupção lógica com perfeição.
**Onde na prática:** marco 12.

### Crypto-shredding
**Em uma frase:** apagar a chave em vez do dado, tornando o registro criptografado irrecuperável.
**No fin-platform:** atender ao direito ao esquecimento sem violar a retenção regulatória de cinco anos.
**Erro comum:** aplicar sem inventário de onde a chave foi usada — e descobrir que ela também abria outra coisa.
**Onde na prática:** marco 13.

### Tokenização
**Em uma frase:** substituir o dado sensível por um token sem valor fora do cofre que o emitiu.
**No fin-platform:** o PAN do cartão que nunca chega ao `fin-store`, reduzindo o escopo de PCI.
**Erro comum:** guardar o token e também um "últimos quatro dígitos + bandeira + validade" que, somados, remontam o risco.
**Onde na prática:** marco 13.

### CDC (change data capture)
**Em uma frase:** ler o log de mudanças do banco e publicá-lo como fluxo, em vez de consultar a tabela.
**No fin-platform:** a ponte entre o `fin-store` transacional e o store analítico.
**Erro comum:** substituir por um `SELECT` periódico com `updated_at` — que perde deleções e escritas concorrentes.
**Onde na prática:** marco 14.

### Data contract
**Em uma frase:** o acordo versionado entre quem produz uma tabela ou fluxo e quem a consome, com schema, semântica e SLO.
**No fin-platform:** o mesmo raciocínio do contrato de evento de `arquitetura-eventos/05`, aplicado ao analítico.
**Erro comum:** tratar o consumo analítico como leitura livre do banco transacional — o acoplamento mais forte que existe.
**Onde na prática:** marco 14.

### Freshness (SLO)
**Em uma frase:** o atraso máximo aceitável entre o fato acontecer e ele aparecer no destino analítico, com número e dono.
**No fin-platform:** o painel de TPV que a diretoria olha às 8h.
**Erro comum:** "o dashboard está atrasado" como reclamação no Slack, sem limiar nem alerta.
**Onde na prática:** marco 14.
