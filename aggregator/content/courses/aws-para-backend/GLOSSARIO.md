Um verbete por termo: definição em uma frase, o exemplo no `fin-aws`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos neutros (*envelope encryption*, IRSA como conceito, DLQ,
idempotência) são verbetes das trilhas donas e não se repetem aqui.

## Fundação

### SCP (Service Control Policy)
**Em uma frase:** uma política das AWS Organizations que limita o máximo que qualquer identidade de uma conta ou OU pode fazer; ela não concede permissão, só corta.
**No fin-aws:** a SCP das contas de produção nega qualquer ação fora das regiões aprovadas.
**Erro comum:** achar que uma SCP com `Allow` dá acesso; a identidade ainda precisa de uma política que conceda.
**Onde na prática:** marco 01.

## Identidade

### EKS Pod Identity
**Em uma frase:** o mecanismo do EKS que associa um papel IAM a uma *service account* do Kubernetes sem provedor OIDC por *cluster*, por meio de um agente em cada nó; é a recomendação atual da AWS.
**No fin-aws:** o `ledger-core` no EKS recebe o papel de acesso à fila por Pod Identity.
**Erro comum:** usá-lo onde ele não existe (Fargate, nós Windows, *cluster* fora do EKS); ali o caminho continua sendo o IRSA.
**Onde na prática:** marco 02.

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
