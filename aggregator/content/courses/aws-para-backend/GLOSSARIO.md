Um verbete por termo: definição em uma frase, o exemplo no `fin-aws`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos neutros (*envelope encryption*, IRSA como conceito, DLQ,
idempotência) são verbetes das trilhas donas e não se repetem aqui.

## Fundação

### Conta AWS
**Em uma frase:** a unidade de isolamento de recursos, de cobrança e de cotas na AWS; é a fronteira mais forte que existe entre dois ambientes.
**No fin-aws:** produção, homologação, *log* e segurança são contas separadas, numa organização.
**Erro comum:** separar produção e teste só por *tag* ou por VPC na mesma conta, onde um papel largo alcança os dois.
**Onde na prática:** marco 01.

### OU (unidade organizacional)
**Em uma frase:** um agrupamento de contas numa AWS Organization, ao qual se aplicam SCPs e políticas herdadas por todas as contas dentro dele.
**No fin-aws:** a OU `producao` recebe a SCP de regiões e de *tags*; a OU `sandbox`, regras mais leves.
**Erro comum:** pendurar SCPs conta por conta, sem OU, e esquecer a conta nova que nasceu fora delas.
**Onde na prática:** marco 01.

### SCP (Service Control Policy)
**Em uma frase:** uma política das AWS Organizations que limita o máximo que qualquer identidade de uma conta ou OU pode fazer; ela não concede permissão, só corta.
**No fin-aws:** a SCP das contas de produção nega qualquer ação fora das regiões aprovadas.
**Erro comum:** achar que uma SCP com `Allow` dá acesso; a identidade ainda precisa de uma política que conceda.
**Onde na prática:** marco 01.

### Região e AZ
**Em uma frase:** a região é uma área geográfica com serviços próprios; a AZ (zona de disponibilidade) é um conjunto isolado de *datacenters* dentro dela, com energia e rede próprias.
**No fin-aws:** tudo roda em três AZs de uma região; a segunda região é decisão do plano de DR.
**Erro comum:** chamar de "alta disponibilidade" um serviço em duas sub-redes da mesma AZ.
**Onde na prática:** marco 03, e também no marco 10.

### ARN (Amazon Resource Name)
**Em uma frase:** o identificador único de um recurso na AWS, com partição, serviço, região, conta e o nome do recurso.
**No fin-aws:** as políticas do `ledger-core` citam o ARN exato da tabela e da fila, nunca `*`.
**Erro comum:** escrever `Resource: "*"` porque o ARN "ainda não existe"; no Terraform ele vem da referência ao recurso.
**Onde na prática:** marco 02.

### Modelo de responsabilidade compartilhada
**Em uma frase:** a divisão em que a AWS responde pela segurança **da** nuvem (infraestrutura, *hardware*, serviço gerenciado) e o cliente pela segurança **na** nuvem (dados, identidade, configuração).
**No fin-aws:** a AWS mantém o RDS com *patch*; quem deixa o *snapshot* público é o time.
**Erro comum:** achar que "gerenciado" inclui a configuração de acesso, a criptografia e o *backup* testado.
**Onde na prática:** marco 01.

## Identidade

### Política de recurso
**Em uma frase:** uma política anexada ao recurso (fila, *bucket*, chave, segredo), que diz quem pode usá-lo, inclusive de outra conta.
**No fin-aws:** a política da fila de liquidação aceita mensagens só do tópico do Pix.
**Erro comum:** abrir o recurso a `Principal: "*"` e confiar só na política de identidade de quem chama.
**Onde na prática:** marco 02.

### *Permissions boundary*
**Em uma frase:** uma política que define o máximo de permissão que um papel ou usuário pode ter, mesmo que a política de identidade dele conceda mais.
**No fin-aws:** os papéis criados pela esteira dos times têm a *boundary* que proíbe mexer em IAM e em KMS.
**Erro comum:** tratá-la como concessão; ela só corta, como a SCP, mas no nível da identidade.
**Onde na prática:** marco 02.

### Negação explícita
**Em uma frase:** um `Deny` em qualquer política aplicável, que vence qualquer `Allow`, em qualquer camada da avaliação do IAM.
**No fin-aws:** a política do *bucket* de extratos nega qualquer acesso sem TLS, seja qual for o papel.
**Erro comum:** confundi-la com a negação implícita (a ausência de `Allow`), que um `Allow` em outra política resolve.
**Onde na prática:** marco 02.

### Política de confiança
**Em uma frase:** a política de recurso de um papel IAM, que diz quem pode assumi-lo (`sts:AssumeRole`) e sob quais condições.
**No fin-aws:** o papel de *deploy* confia só no provedor OIDC da esteira, para o repositório e o ramo certos.
**Erro comum:** confiar na conta inteira (`arn:aws:iam::123:root`) e deixar qualquer papel dela assumir o de produção.
**Onde na prática:** marco 02.

### *Confused deputy* e `ExternalId`
**Em uma frase:** o ataque em que um serviço com permissão legítima é induzido a agir em nome de quem não deveria; o `ExternalId` na política de confiança é a defesa quando um terceiro assume o seu papel.
**No fin-aws:** o parceiro de antifraude assume o papel de leitura só com o `ExternalId` combinado.
**Erro comum:** deixar um terceiro assumir o papel só pelo número da conta dele, que outros clientes do mesmo terceiro também apresentam.
**Onde na prática:** marco 02.

### *Task role*
**Em uma frase:** o papel IAM que o código de uma tarefa ECS assume para chamar a AWS, diferente do papel de execução, que o agente usa para baixar a imagem e ler segredos.
**No fin-aws:** o `pix-gateway` tem uma *task role* que só publica no tópico do Pix.
**Erro comum:** usar o papel de execução como *task role* e dar ao código a permissão de ler todos os segredos da tarefa.
**Onde na prática:** marco 02, e também no marco 04.

### EKS Pod Identity
**Em uma frase:** o mecanismo do EKS que associa um papel IAM a uma *service account* do Kubernetes sem provedor OIDC por *cluster*, por meio de um agente em cada nó; é a recomendação atual da AWS.
**No fin-aws:** o `ledger-core` no EKS recebe o papel de acesso à fila por Pod Identity.
**Erro comum:** usá-lo onde ele não existe (Fargate, nós Windows, *cluster* fora do EKS); ali o caminho continua sendo o IRSA.
**Onde na prática:** marco 02.

### IAM Identity Center
**Em uma frase:** o serviço de acesso humano às contas de uma organização, com credencial temporária por conjunto de permissões, a partir do provedor de identidade da empresa.
**No fin-aws:** ninguém tem usuário IAM; o acesso humano à produção é por Identity Center, com sessão curta.
**Erro comum:** criar usuários IAM com chave de acesso para pessoas, chaves que vivem anos num `~/.aws/credentials`.
**Onde na prática:** marco 02.

## Rede

### *Security group*
**Em uma frase:** um *firewall* com estado, anexado à interface de rede, com regras só de permissão, que podem citar outros *security groups* como origem.
**No fin-aws:** o banco do ledger aceita a porta 5432 só do *security group* do `ledger-core`.
**Erro comum:** liberar por faixa de IP (`10.0.0.0/8`) em vez de pelo *security group* de quem chama.
**Onde na prática:** marco 03.

### NACL
**Em uma frase:** uma lista de controle de acesso sem estado, aplicada à sub-rede, com regras de permissão e de negação avaliadas em ordem.
**No fin-aws:** a NACL da sub-rede de dados nega tudo que não vem das sub-redes de aplicação.
**Erro comum:** esquecer que ela não tem estado e bloquear as portas efêmeras da resposta.
**Onde na prática:** marco 03.

### NAT Gateway
**Em uma frase:** o serviço zonal que dá às sub-redes privadas saída para a internet, cobrado por hora e por GB processado.
**No fin-aws:** um NAT por AZ, só para o que precisa sair para fora da AWS.
**Erro comum:** mandar o tráfego de S3 e DynamoDB pelo NAT em vez do *gateway endpoint* gratuito.
**Onde na prática:** marco 03, e também no marco 11.

### *Gateway endpoint*
**Em uma frase:** uma entrada na tabela de rotas que leva o tráfego para o S3 ou o DynamoDB sem sair da rede da AWS, sem custo por hora nem por GB.
**No fin-aws:** as sub-redes de aplicação chegam à tabela de idempotência pelo *endpoint*, com política restrita a ela.
**Erro comum:** criar o *endpoint* e esquecer de associar a tabela de rotas da sub-rede nova.
**Onde na prática:** marco 03, e também no marco 11.

### *Interface endpoint* (PrivateLink)
**Em uma frase:** uma interface de rede na sua sub-rede que leva a um serviço da AWS ou de um parceiro por endereço privado, cobrada por hora e por GB.
**No fin-aws:** o SQS, o KMS e o Secrets Manager são alcançados por *interface endpoint*, sem NAT.
**Erro comum:** criar o *endpoint* sem política, que aceita qualquer chamada de qualquer principal da VPC.
**Onde na prática:** marco 03.

### Transit Gateway
**Em uma frase:** um roteador regional gerenciado que liga muitas VPCs e redes locais num modelo de hub, com tabelas de rotas próprias.
**No fin-aws:** as VPCs dos domínios se ligam pelo Transit Gateway, e a de inspeção fica no meio.
**Erro comum:** usar uma única tabela de rotas para todos os anexos e deixar qualquer VPC falar com qualquer outra.
**Onde na prática:** marco 03.

### VPC Flow Logs
**Em uma frase:** o registro dos fluxos de rede aceitos e rejeitados nas interfaces, sub-redes ou VPCs, sem o conteúdo dos pacotes.
**No fin-aws:** os *flow logs* da VPC de produção vão para a conta de *log*, com retenção definida.
**Erro comum:** ligá-los só depois do incidente, quando a pergunta "quem falou com quem" já não tem resposta.
**Onde na prática:** marco 03.

## Computação e funções

### Fargate
**Em uma frase:** o modo de computação do ECS e do EKS em que a AWS gerencia a máquina por baixo de cada tarefa, cobrado por vCPU e memória por hora.
**No fin-aws:** o `pix-gateway` roda em Fargate, sem nós para atualizar.
**Erro comum:** esperar recursos de nó (*DaemonSet*, acesso ao *host*) que o Fargate não oferece.
**Onde na prática:** marco 04.

### Graviton
**Em uma frase:** os processadores ARM da AWS, oferecidos em instâncias, no Fargate e no Lambda.
**No fin-aws:** o `ledger-core` (Go) e o `pix-gateway` (JVM) rodam em ARM com imagem multiarquitetura.
**Erro comum:** trocar a arquitetura sem uma imagem multiarquitetura, e descobrir no *deploy* que a dependência nativa não existe para ARM.
**Onde na prática:** marco 04, e também no marco 11.

### *Event source mapping*
**Em uma frase:** o recurso do Lambda que faz o *polling* de uma fila ou *stream* e invoca a função em lotes, com a semântica de *retry* da fonte.
**No fin-aws:** o lote de liquidação consome a fila por um *event source mapping* com concorrência máxima.
**Erro comum:** deixá-lo sem concorrência máxima e ver centenas de ambientes abrindo conexão ao banco.
**Onde na prática:** marco 06.

### *Cold start*
**Em uma frase:** o tempo de `init` de um ambiente novo de execução do Lambda, pago antes do primeiro evento que ele atende.
**No fin-aws:** a função síncrona de consulta de saldo em Java usa SnapStart para cortar o *cold start*.
**Erro comum:** medir só a média e não ver o *cold start* na cauda (*p99*).
**Onde na prática:** marco 06.

### SnapStart
**Em uma frase:** o recurso do Lambda que restaura um *snapshot* do ambiente já inicializado, em vez de rodar o `init` a cada ambiente novo.
**No fin-aws:** as funções em Java ligam o SnapStart e fazem o *priming* do cliente HTTP antes do *snapshot*.
**Erro comum:** guardar no *snapshot* um estado que deveria ser único por ambiente, como uma semente aleatória ou uma conexão aberta.
**Onde na prática:** marco 06.

### Concorrência reservada
**Em uma frase:** o número de execuções simultâneas garantido para uma função, que é também o teto dela.
**No fin-aws:** a concorrência reservada do lote vem do dimensionamento do *pool* do banco.
**Erro comum:** deixá-la menor que a soma das concorrências máximas das fontes SQS, e o Lambda passa a estrangular mensagens.
**Onde na prática:** marco 06.

### *Partial batch response*
**Em uma frase:** a resposta da função que lista só as mensagens do lote que falharam (`batchItemFailures`), para que só elas voltem à fila.
**No fin-aws:** o processador de liquidação devolve os `itemIdentifier` das linhas com erro.
**Erro comum:** ligar `ReportBatchItemFailures` e lançar exceção no *handler*, o que faz o lote inteiro voltar.
**Onde na prática:** marco 06.

### Step Functions
**Em uma frase:** o serviço de máquinas de estado gerenciadas, que orquestra etapas, esperas, *retries* e compensações fora do código.
**No fin-aws:** o estorno com várias etapas é uma máquina de estados, não uma cadeia de funções.
**Erro comum:** encadear funções que se chamam e perder o estado no meio, somando os *timeouts*.
**Onde na prática:** marco 06.

## Mensageria

### `MessageGroupId`
**Em uma frase:** o atributo de uma mensagem de fila FIFO do SQS que define a unidade de ordem: mensagens do mesmo grupo saem em ordem, e o grupo fica bloqueado enquanto uma delas está em voo.
**No fin-aws:** o grupo é a conta do cliente, para que dois lançamentos da mesma conta nunca sejam processados ao mesmo tempo.
**Erro comum:** usar um grupo só para a fila inteira e transformar a fila numa fila de um consumidor; ou um grupo por mensagem, e perder a ordem.
**Onde na prática:** marco 05.

### *Visibility timeout*
**Em uma frase:** o tempo em que uma mensagem recebida do SQS fica invisível para outros consumidores; se ela não for apagada nesse prazo, volta para a fila.
**No fin-aws:** o *timeout* da fila de liquidação é maior que o tempo máximo de processamento, com folga.
**Erro comum:** deixá-lo menor que o processamento e ver a mesma mensagem processada duas vezes, em paralelo.
**Onde na prática:** marco 05.

### *Redrive*
**Em uma frase:** a devolução das mensagens de uma DLQ para a fila de origem (`StartMessageMoveTask`), depois que a causa da falha foi corrigida.
**No fin-aws:** o *redrive* da liquidação roda depois da correção, com o consumidor idempotente pela chave de negócio.
**Erro comum:** usar o contador de recebimentos para decidir "já processei", sem saber que o *redrive* o devolve a 1.
**Onde na prática:** marco 05.

### EventBridge
**Em uma frase:** o barramento de eventos da AWS, que roteia eventos por regras sobre o conteúdo para dezenas de tipos de alvo, entre contas, com *archive* e *replay*.
**No fin-aws:** o evento `EstornoSolicitado` chega ao domínio de disputas por uma regra no barramento.
**Erro comum:** montar um processo de várias etapas como uma cadeia de regras, em vez de uma saga.
**Onde na prática:** marco 05.

## Dados e chaves

### Multi-AZ (RDS)
**Em uma frase:** a configuração do RDS com uma *standby* síncrona em outra AZ (instância) ou duas *standby* legíveis (*cluster*), para *failover* automático.
**No fin-aws:** o banco do ledger é Multi-AZ, e a política sobre o plano reprova o que não for.
**Erro comum:** achar que a *standby* do Multi-AZ de instância atende leitura; para isso existe a réplica de leitura.
**Onde na prática:** marco 07, e também no marco 10.

### RDS Proxy
**Em uma frase:** um *proxy* gerenciado entre a aplicação e o RDS que mantém um *pool* de conexões e segura os clientes durante o *failover*.
**No fin-aws:** as funções do lote falam com o ledger pelo RDS Proxy.
**Erro comum:** colocá-lo na frente e manter, em cada função, um *pool* grande como se o banco estivesse direto.
**Onde na prática:** marco 06, e também no marco 07.

### Partição quente
**Em uma frase:** a partição do DynamoDB que concentra o tráfego por causa da chave escolhida, e é estrangulada mesmo com a tabela longe da capacidade total.
**No fin-aws:** o índice de idempotência usa o identificador fim a ponta do Pix como chave, não o dia.
**Erro comum:** escolher a chave pelo relatório (data, *status*) em vez de pelo acesso de escrita.
**Onde na prática:** marco 07.

### *Global table*
**Em uma frase:** uma tabela do DynamoDB replicada entre regiões, com escrita em todas; no modo eventual, a última escrita vence, e no modo forte (MRSC) são três regiões, sem transações.
**No fin-aws:** o catálogo de chaves Pix é *global table*; o saldo, não.
**Erro comum:** usá-la para saldo com escrita nas duas regiões e perder dinheiro na última escrita que vence.
**Onde na prática:** marco 07, e também no marco 10.

### *Block Public Access*
**Em uma frase:** as quatro chaves do S3 que impedem ACLs e políticas públicas, aplicáveis à conta e a cada *bucket*, com o mais restritivo vencendo.
**No fin-aws:** as quatro chaves ligadas na conta, e uma SCP impede desligar.
**Erro comum:** confiar no padrão dos *buckets* novos e esquecer os antigos, criados antes de abr 2023.
**Onde na prática:** marco 08.

### Object Lock
**Em uma frase:** a retenção do S3 por versão de objeto que impede apagar ou sobrescrever até uma data; no modo *compliance*, nem o *root* desfaz.
**No fin-aws:** o arquivo da conciliação e a trilha do CloudTrail ficam em *buckets* com Object Lock.
**Erro comum:** ligar o modo *compliance* com o prazo errado em produção, sem testar antes em governança.
**Onde na prática:** marco 08, e também no marco 09.

### Política de chave (KMS)
**Em uma frase:** a política de recurso de uma chave KMS, primeiro filtro de qualquer uso; sem ela permitir, nenhuma política de IAM basta.
**No fin-aws:** `kms:*` só para o papel `kms-admin`; os serviços só cifram e decifram com a condição do contexto.
**Erro comum:** dar `kms:*` a todos os papéis de aplicação "para simplificar".
**Onde na prática:** marco 08.

### Contexto de criptografia
**Em uma frase:** pares chave-valor não secretos enviados ao KMS na cifragem, autenticados junto com o dado; decifrar exige o mesmo contexto.
**No fin-aws:** o serviço de extratos cifra com `servico=extratos`, e a política da chave exige esse contexto.
**Erro comum:** colocar dado sensível no contexto, que fica em claro no CloudTrail.
**Onde na prática:** marco 08.

### Secrets Manager
**Em uma frase:** o serviço de segredos da AWS com rotação nativa, cobrado por segredo e por chamada.
**No fin-aws:** a senha do Postgres do ledger fica no Secrets Manager, com rotação por usuário alternado.
**Erro comum:** copiar o valor do segredo para uma variável do Terraform e deixá-lo no *state*.
**Onde na prática:** marco 08.

## Operar

### CloudTrail
**Em uma frase:** o registro das chamadas de API à AWS, com quem fez, de onde e quando; é auditoria, não telemetria da aplicação.
**No fin-aws:** a trilha de organização, multirregião, grava na conta de *log* com Object Lock e validação de arquivo.
**Erro comum:** ligar a trilha só na região em uso, deixando sem registro a região onde um atacante cria recursos.
**Onde na prática:** marco 09.

### ADOT (AWS Distro for OpenTelemetry)
**Em uma frase:** a distribuição do OpenTelemetry mantida pela AWS, com SDKs e Collector que incluem os componentes para CloudWatch e X-Ray.
**No fin-aws:** o Collector do ADOT exporta o mesmo *trace* para o X-Ray e para o Tempo.
**Erro comum:** ligar o Application Signals no SDK e também exportar pelo Collector, e pagar o mesmo dado duas vezes.
**Onde na prática:** marco 09.

### Estabilidade estática
**Em uma frase:** a propriedade de um sistema que continua funcionando na falha sem precisar mudar nada: sem escalar, sem criar recursos, sem depender do plano de controle.
**No fin-aws:** o `pix-gateway` tem, em cada AZ, capacidade para a metade do pico, e a perda de uma AZ não exige escalar.
**Erro comum:** contar com o *auto scaling* na falha da AZ, quando todo mundo tenta criar capacidade ao mesmo tempo.
**Onde na prática:** marco 10.

### *Pilot light*
**Em uma frase:** a estratégia de DR em que os dados estão replicados na região secundária e a computação fica desligada ou mínima, para ser criada na falha.
**No fin-aws:** a API de consulta de extratos usa *pilot light*: o RTO dela, de uma hora, cabe na estratégia.
**Erro comum:** declarar RTO de minutos com *pilot light*, sem contar o tempo de escalar e as cotas da secundária.
**Onde na prática:** marco 10.

### *Warm standby*
**Em uma frase:** a estratégia de DR em que uma versão menor do serviço já roda na região secundária e escala na falha.
**No fin-aws:** o `pix-gateway` mantém 15% da capacidade na secundária, com o tempo para escalar medido.
**Erro comum:** não medir o tempo para escalar a secundária, e descobrir no exercício que ele passa do RTO.
**Onde na prática:** marco 10.

### *Savings Plans*
**Em uma frase:** o compromisso de gasto por hora em computação, por 1 ou 3 anos, em troca de desconto; o de computação cobre EC2, Fargate e Lambda.
**No fin-aws:** o compromisso cobre a base estável do `pix-gateway`, depois do *rightsizing*.
**Erro comum:** comprar o compromisso antes do *rightsizing* e travar o desperdício por três anos.
**Onde na prática:** marco 11.

### *Spot*
**Em uma frase:** a capacidade ociosa da AWS com desconto, que pode ser tomada de volta com um aviso de dois minutos.
**No fin-aws:** o reprocessamento de lote e o CI rodam em *spot*; o caminho do pagamento, não.
**Erro comum:** usar *spot* para um trabalho que não é idempotente ou não pode ser refeito.
**Onde na prática:** marco 11.

### Tráfego entre AZs
**Em uma frase:** a transferência de dados entre AZs da mesma região, cobrada por GB nos dois sentidos.
**No fin-aws:** o modelo de custo tem uma linha para ele, e o roteamento por zona é decisão de ADR.
**Erro comum:** espalhar chamadas síncronas entre AZs sem contar o custo, e só vê-lo na fatura.
**Onde na prática:** marco 11.
