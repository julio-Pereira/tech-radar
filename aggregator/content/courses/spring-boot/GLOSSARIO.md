Um verbete por termo: definição em uma frase, o exemplo no `pix-gateway`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira —
os marcos usam estes termos sem redefini-los a cada vez.

## O Boot e o container

### ApplicationContext
**Em uma frase:** o container do Spring — guarda as definições de bean, cria os objetos, injeta as dependências e controla o ciclo de vida de cada um.
**No fin-platform:** o contexto do pix-gateway sobe uma vez, no boot; se o `PspProperties` não validar, ele nem termina de subir.
**Erro comum:** achar que um erro de configuração vai aparecer "quando o código rodar" — com o contexto, ele aparece no deploy.
**Onde na prática:** marcos 01, 04.

### Bean
**Em uma frase:** um objeto criado e gerenciado pelo container, injetado onde for pedido; por padrão, uma instância única (*singleton*) por contexto.
**No fin-platform:** `PaymentInitiationService` é um bean singleton que atende todas as requisições ao mesmo tempo.
**Erro comum:** guardar estado de uma requisição num campo de um bean singleton — vira bug de concorrência sob carga.
**Onde na prática:** marcos 01, 04.

### Starter
**Em uma frase:** uma dependência "casca" que amarra a auto-configuração e as bibliotecas de uma capacidade numa coordenada Maven só.
**No fin-platform:** `spring-boot-starter-webmvc` traz o Tomcat, o Spring MVC e o Jackson; o `fintech-audit-spring-boot-starter` traz o filtro de correlação.
**Erro comum:** no Boot 4, esperar que um starter grande traga tudo — `RestClient`, Flyway e AOP agora pedem starter próprio.
**Onde na prática:** marcos 01, 02.

### Auto-configuração
**Em uma frase:** uma classe `@AutoConfiguration` que registra beans condicionalmente, olhando o classpath, os beans já existentes e as propriedades.
**No fin-platform:** com o driver do Postgres no classpath e `spring.datasource.url` definida, o Boot monta o `DataSource` e o pool sozinho.
**Erro comum:** registrar uma auto-configuração por *component scan* em vez de pelo arquivo `AutoConfiguration.imports`.
**Onde na prática:** marco 02.

### Condition Evaluation Report
**Em uma frase:** o relatório, impresso com `--debug`, que diz quais auto-configurações entraram ou não e por quê.
**No fin-platform:** a prova de que a `AuditAutoConfiguration` entrou porque havia servlet e a propriedade não a desligou.
**Erro comum:** depurar "por que esse bean existe?" lendo código da biblioteca em vez de ler o relatório.
**Onde na prática:** marco 02.

### @ConfigurationProperties
**Em uma frase:** a classe (de preferência um `record`) que recebe um grupo de propriedades tipadas e validadas no boot.
**No fin-platform:** `PspProperties` com `@NotBlank baseUrl` — sem a URL do PSP, a aplicação não sobe.
**Erro comum:** espalhar `@Value("${...}")` pelo código: sem validação, sem agrupamento, sem descoberta.
**Onde na prática:** marco 03.

### Profile
**Em uma frase:** um nome (`dev`, `prod`, `drill`) que ativa um conjunto de arquivos de configuração e de beans anotados com `@Profile`.
**No fin-platform:** o perfil `drill` registra o endpoint lento e o `JwtDecoder` local do exercício de shutdown; em produção, nenhum dos dois existe.
**Erro comum:** usar profile para diferença de valor (uma URL) — isso é variável de ambiente; profile é para diferença de estrutura (um bean ou outro).
**Onde na prática:** marcos 03, 12.

### Proxy (JDK e CGLIB)
**Em uma frase:** o objeto que o container injeta no lugar do seu bean para executar comportamento em volta dos métodos (transação, cache, `@Async`); no Boot, por padrão, uma subclasse gerada pelo CGLIB.
**No fin-platform:** quem recebe o `LedgerTxService` recebe o proxy, que abre e fecha a transação do estorno.
**Erro comum:** anotar um método `private` ou `final` com `@Transactional` — a subclasse não consegue sobrescrevê-lo, e o advice nunca roda.
**Onde na prática:** marco 04.

### Self-invocation
**Em uma frase:** a chamada de um método do bean a outro método do mesmo bean via `this`, que não passa pelo proxy e por isso ignora `@Transactional`, `@Cacheable` e `@Async`.
**No fin-platform:** `processRefund` chamando `this.applyRefund` gravou o débito sem transação — e o crédito que falhou não o desfez.
**Erro comum:** confiar em teste com mock para pegar o problema; só um teste de integração com banco real mostra o rollback que não aconteceu.
**Onde na prática:** marco 04.

## Persistência e transações

### Propagation
**Em uma frase:** a regra que decide o que acontece quando um método transacional chama outro — juntar-se à transação corrente (`REQUIRED`), abrir uma nova (`REQUIRES_NEW`) ou um savepoint (`NESTED`).
**No fin-platform:** a auditoria de uma tentativa que falhou usa `REQUIRES_NEW` para sobreviver ao rollback do pagamento.
**Erro comum:** usar `REQUIRES_NEW` sob carga com pool pequeno — cada requisição segura duas conexões, e o pool trava.
**Onde na prática:** marco 05.

### Lost update
**Em uma frase:** a anomalia em que duas transações leem o mesmo valor, calculam em cima dele e a segunda gravação apaga a primeira.
**No fin-platform:** dois débitos de 80 numa conta com 100, ambos lendo 100 e gravando 20 — saíram 160.
**Erro comum:** achar que `@Transactional` sozinho protege; o default `READ_COMMITTED` do Postgres deixa isso acontecer.
**Onde na prática:** marco 05.

### Locking otimista
**Em uma frase:** detectar o conflito no commit por uma coluna de versão (`@Version`) e repetir a operação, sem travar nada no banco.
**No fin-platform:** serve para contas pouco movimentadas, onde o conflito é raro.
**Erro comum:** usar numa conta quente — quase toda transação falha e repete, e o retry vira tempestade.
**Onde na prática:** marco 05.

### Locking pessimista
**Em uma frase:** travar a linha na leitura (`SELECT ... FOR UPDATE`) até o fim da transação, fazendo os concorrentes esperarem.
**No fin-platform:** a escolha para a conta corporativa que recebe muitos débitos ao mesmo tempo.
**Erro comum:** segurar o lock enquanto chama o PSP — a linha fica travada pelo tempo da rede.
**Onde na prática:** marco 05.

### N+1
**Em uma frase:** carregar uma lista com uma query e depois disparar mais uma query por item ao acessar uma associação *lazy*.
**No fin-platform:** listar 10 mil pagamentos e acessar `getPsp()` em cada um vira 10 001 queries.
**Erro comum:** não perceber em teste — com 2 registros, são só 3 queries.
**Onde na prática:** marco 05.

### Migração Flyway
**Em uma frase:** um script SQL versionado (`V1__...`, `V2__...`) aplicado em ordem no startup, que faz do schema código auditável.
**No fin-platform:** `V2__idempotency_and_outbox.sql` cria as tabelas do marco 06 em todo ambiente, na mesma ordem.
**Erro comum:** no Boot 4, ter só o `flyway-core` — sem o `spring-boot-starter-flyway`, nenhuma migração roda e nada avisa.
**Onde na prática:** marcos 05, 12.

## Idempotência e eventos

### Idempotency-Key
**Em uma frase:** a chave única por intenção que o cliente envia num header para que repetir a requisição não repita o efeito.
**No fin-platform:** o mesmo `POST /payments` enviado duas vezes com a mesma chave gera um pagamento e devolve a mesma resposta.
**Erro comum:** consultar a chave antes de gravar — duas requisições simultâneas não acham nada e as duas processam.
**Onde na prática:** marcos 06, 08.

### Dual-write
**Em uma frase:** gravar em dois sistemas sem transação comum (banco e Kafka) e torcer para os dois darem certo.
**No fin-platform:** commitar o pagamento e o `send` do evento falhar — o antifraude nunca fica sabendo.
**Erro comum:** achar que "chamar os dois em sequência" é suficiente porque funciona em teste.
**Onde na prática:** marco 06.

### Relay do outbox
**Em uma frase:** o processo de fundo que lê os eventos pendentes da tabela de outbox, publica no broker e só então os marca como publicados.
**No fin-platform:** o `@Scheduled` que publica `PaymentInitiated` no Kafka a cada 500 ms, esperando o ack de cada envio.
**Erro comum:** marcar como publicado sem esperar o ack, ou segurar uma transação aberta enquanto espera o broker.
**Onde na prática:** marco 06.

### At-least-once
**Em uma frase:** a garantia de entrega em que nenhuma mensagem se perde, mas alguma pode chegar duplicada.
**No fin-platform:** o relay pode cair entre o ack e a marcação e reenviar o evento — o antifraude precisa ignorar a repetição.
**Erro comum:** assumir exactly-once no consumidor e processar duas vezes a mesma mensagem.
**Onde na prática:** marco 06.

## Runtime e resiliência

### Virtual thread
**Em uma frase:** uma thread leve gerenciada pela JVM que, ao bloquear em I/O, sai da thread do sistema operacional que a executava e libera essa thread para outra.
**No fin-platform:** com `spring.threads.virtual.enabled=true`, cada requisição ao gateway roda numa virtual thread, e o fan-out para 3 PSPs deixa de prender threads.
**Erro comum:** esperar ganho com uma transação aberta em volta do I/O — a fila só muda das threads para o pool de conexões.
**Onde na prática:** marco 07.

### Carrier thread
**Em uma frase:** a thread de plataforma sobre a qual a JVM monta uma virtual thread para executá-la.
**No fin-platform:** poucas carriers atendem as milhares de virtual threads das requisições ao gateway.
**Erro comum:** dimensionar o serviço pelo número de carriers, como se fossem as threads do Tomcat.
**Onde na prática:** marco 07.

### Pinning
**Em uma frase:** a virtual thread que bloqueia sem conseguir desmontar e, por isso, prende a carrier até o bloqueio acabar.
**No fin-platform:** no Java 21, um `synchronized` em volta de uma chamada ao PSP prende a carrier; o Java 24 resolveu esse caso (JEP 491).
**Erro comum:** procurar pinning sem medir — o evento `jdk.VirtualThreadPinned` do JFR mostra exatamente onde ele acontece.
**Onde na prática:** marco 07.

### Pool de conexões
**Em uma frase:** o conjunto fixo de conexões abertas com o banco (o HikariCP, no Boot) que as transações tomam emprestado e devolvem.
**No fin-platform:** com 5 conexões e a transação segurando cada uma durante o I/O, o gauge `hikaricp.connections.pending` subiu para 190.
**Erro comum:** aumentar o pool para "resolver" a espera, em vez de tirar o I/O de dentro da transação.
**Onde na prática:** marcos 05, 07.

### Retry com backoff e jitter
**Em uma frase:** repetir uma chamada que falhou esperando cada vez mais (backoff) e com um pouco de aleatoriedade (jitter), para não sincronizar os clientes.
**No fin-platform:** a confirmação no PSP é repetida até 3 vezes — e só porque leva `Idempotency-Key`.
**Erro comum:** repetir uma escrita sem chave de idempotência e debitar duas vezes.
**Onde na prática:** marco 08.

### Circuit breaker
**Em uma frase:** o mecanismo que, ao ver a taxa de falha de uma dependência passar de um limite, para de chamá-la por um tempo e falha rápido, testando de novo depois.
**No fin-platform:** com o PSP devolvendo 500 em sequência, o circuito abre e a iniciação vai direto para o fallback, sem tocar no PSP.
**Erro comum:** com Resilience4j, pôr o fallback no `@CircuitBreaker` — ele captura a primeira falha e o `@Retry` nunca repete.
**Onde na prática:** marco 08.

### Bulkhead
**Em uma frase:** isolar a concorrência dedicada a cada dependência num limite próprio, para que uma dependência lenta não consuma os recursos das outras.
**No fin-platform:** o PSP-A lento esgota só o seu compartimento; as chamadas ao PSP-B seguem atendidas.
**Erro comum:** confundir com limite de taxa da API — o bulkhead protege as dependências, não a porta de entrada.
**Onde na prática:** marco 08.

### Fallback honesto
**Em uma frase:** a resposta alternativa que diz a verdade sobre a degradação — dado rotulado como desatualizado, ou "aceito, vou processar" (`202`) com a intenção numa fila durável.
**No fin-platform:** com o circuito aberto, a iniciação vai para o outbox e o cliente recebe `202 Accepted`.
**Erro comum:** devolver `200` com um resultado inventado — em pagamento, é fraude acidental.
**Onde na prática:** marco 08.

## Segurança

### Resource server
**Em uma frase:** a aplicação que não emite tokens — só valida os que recebe de um authorization server e decide o que cada um pode fazer.
**No fin-platform:** o pix-gateway valida o JWT do provedor de identidade do Open Finance a cada requisição.
**Erro comum:** deixar o contexto subir sem `issuer-uri` (ou outra fonte de chaves) e descobrir no boot que não há `JwtDecoder`.
**Onde na prática:** marco 09.

### Scope e authority
**Em uma frase:** o *scope* é a permissão que o token carrega (`payments:write`); a *authority* é como o Spring Security a representa (`SCOPE_payments:write`).
**No fin-platform:** `POST /payments` exige `SCOPE_payments:write`; consultas exigem `SCOPE_payments:read`.
**Erro comum:** escrever `hasAuthority('payments:write')` e negar todo mundo — falta o prefixo `SCOPE_`.
**Onde na prática:** marco 09.

### Method security
**Em uma frase:** a autorização declarada no método de serviço com `@PreAuthorize`, perto da regra de negócio, além da regra por URL.
**No fin-platform:** `initiate` exige o escopo de escrita e recusa valores acima de 50 mil, mesmo que um controller novo esqueça a regra.
**Erro comum:** esquecer que ela vale para quem chama o serviço direto — inclusive os testes, que passam a precisar de um usuário autenticado.
**Onde na prática:** marco 09.

### BOLA
**Em uma frase:** *Broken Object Level Authorization* — o cliente autenticado acessa um objeto que não é dele trocando o id na requisição.
**No fin-platform:** uma instituição lendo o pagamento de outra por `GET /payments/{id}`.
**Erro comum:** validar só que o token é válido, sem conferir que o objeto pertence a quem pede.
**Onde na prática:** marco 09.

## Observabilidade e produção

### Liveness
**Em uma frase:** a probe que responde "estou vivo ou preciso ser reiniciado?"; quando falha, o Kubernetes reinicia o pod.
**No fin-platform:** só cai por estado interno irrecuperável, nunca porque o antifraude saiu do ar.
**Erro comum:** ligar a liveness a uma dependência externa — ela oscila e a frota inteira entra em reinício.
**Onde na prática:** marcos 10, 12.

### Readiness
**Em uma frase:** a probe que responde "posso atender agora?"; quando falha, o pod sai do balanceador mas continua vivo.
**No fin-platform:** sai de "pronto" no início do shutdown, antes de o graceful shutdown drenar as requisições em voo.
**Erro comum:** incluir uma dependência compartilhada — com ela fora, todos os pods saem do balanceador juntos.
**Onde na prática:** marcos 01, 10, 12.

### Health group
**Em uma frase:** um conjunto nomeado de indicadores de saúde exposto num endpoint próprio, como `/actuator/health/readiness`.
**No fin-platform:** o grupo de readiness contém só o estado interno; o indicador do antifraude fica no `/actuator/health` agregado.
**Erro comum:** escrever um `HealthIndicator` e achar que ele já afeta a readiness — sem `include`, não afeta.
**Onde na prática:** marco 10.

### Observation
**Em uma frase:** a instrumentação única da Micrometer Observation API, da qual saem métrica, span de trace e log correlacionados.
**No fin-platform:** `payment.initiate` gera `payment_initiate_seconds_*` com o label `psp` e o span com o `paymentId`.
**Erro comum:** pôr um valor de alta cardinalidade (`paymentId`) como `lowCardinalityKeyValue` e explodir o Prometheus.
**Onde na prática:** marco 10.

### Testcontainers
**Em uma frase:** a biblioteca que sobe dependências reais (Postgres, Kafka) em containers Docker durante o teste; com `@ServiceConnection`, o Boot aponta a aplicação para elas sozinho.
**No fin-platform:** o teste de replay de idempotência prova um pagamento e um evento contra Postgres e Kafka de verdade.
**Erro comum:** testar contra H2 "em modo PostgreSQL" — ele recusa o DDL real ou aceita e grava outra coisa.
**Onde na prática:** marcos 04, 06, 11.

### Slice test
**Em uma frase:** o teste que sobe só uma camada do contexto — `@WebMvcTest` para a web, `@DataJpaTest` para o JPA — e por isso é rápido e focado.
**No fin-platform:** `PaymentSecurityTest` prova 401, 403 e 201 com o controller, a segurança e o serviço trocado por mock.
**Erro comum:** mockar o sujeito do teste em vez da fronteira — o teste vira tautologia.
**Onde na prática:** marcos 09, 11.

### Graceful shutdown
**Em uma frase:** ao receber o sinal de parada, o servidor recusa requisições novas e espera as em andamento terminarem, até um limite.
**No fin-platform:** um `docker stop` no meio de uma iniciação de 5 s espera ela responder `200` antes de encerrar.
**Erro comum:** confiar só na aplicação — sem `preStop` e o tempo de término do pod alinhados, o Kubernetes ainda manda tráfego.
**Onde na prática:** marco 12.

### Expand/contract
**Em uma frase:** mudar o schema em duas etapas — primeiro só acrescentar (coluna nova nullable), depois de todas as versões migrarem, remover o antigo.
**No fin-platform:** a coluna `channel` entra na V3; a v1 continua funcionando com ela no banco, e o rollback não exige reverter a migração.
**Erro comum:** acrescentar a coluna já `NOT NULL` sem default — a versão anterior quebra no primeiro `INSERT`.
**Onde na prática:** marco 12.

### Native image
**Em uma frase:** a aplicação compilada antes de rodar (AOT) pela GraalVM num binário nativo, com startup em milissegundos e menos memória.
**No fin-platform:** uma opção para um serviço de escala agressiva; não é o padrão do gateway.
**Erro comum:** tratar como "ligar uma flag" — reflexão, proxies e recursos precisam ser conhecidos no build, e agentes de APM deixam de funcionar.
**Onde na prática:** marco 12.

## Arquitetura

### Modulith
**Em uma frase:** um monolito dividido em módulos cujas fronteiras são verificadas por teste — no Spring Modulith, cada pacote de topo é um módulo e seus subpacotes são internos.
**No fin-platform:** `payments`, `antifraud` e `audit` no mesmo processo, com `ApplicationModules.verify()` no CI.
**Erro comum:** confiar em "módulo por convenção" — nada impede o `import` proibido até o teste existir.
**Onde na prática:** marco 13.

### Event Publication Registry
**Em uma frase:** a tabela do Spring Modulith onde cada evento publicado é gravado na mesma transação de quem publica e só é marcado como concluído quando o listener termina com sucesso.
**No fin-platform:** se o listener do antifraude falha, a publicação fica `FAILED` e pode ser republicada — o outbox in-process.
**Erro comum:** usar `@ApplicationModuleListener` sem o registro e achar que tem a garantia do outbox; um crash depois do commit perde o evento.
**Onde na prática:** marco 13.
