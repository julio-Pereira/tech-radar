Um verbete por termo: definição em uma frase, o exemplo no `fin-iac`, o erro comum associado e o marco
onde o conceito aparece na prática. Os termos básicos (estado, *plan* como artefato, *drift*, política
sobre o plano) são verbetes do glossário de `entrega-continua-e-devops` e não se repetem aqui.

## O grafo e o ciclo de vida

### Grafo de dependências
**Em uma frase:** a estrutura que o Terraform monta antes de planejar, com recursos, *data sources*, módulos e provedores como nós e "precisa existir antes" como arestas.
**No fin-iac:** o *grant* do papel de aplicação depende do banco do ledger, e o `terraform graph -format=mermaid` mostra a aresta no PR.
**Erro comum:** achar que a ordem dos blocos no arquivo define a ordem de criação.
**Onde na prática:** marco 01.

### Dependência implícita
**Em uma frase:** a aresta do grafo criada por uma referência a um atributo de outro recurso, que o Terraform deduz sozinho.
**No fin-iac:** o `postgresql_grant` usa `postgresql_database.ledger.name` e por isso espera o banco.
**Erro comum:** trocar a referência por um nome literal e perder a ordem sem perceber.
**Onde na prática:** marco 01.

### `depends_on`
**Em uma frase:** a dependência explícita, para o que o código não mostra; é larga (o recurso inteiro) e fica como último recurso.
**No fin-iac:** não há nenhum; o único candidato virou referência a um atributo.
**Erro comum:** usá-lo num *data source*, que passa a ser lido só no `apply` e enche o plano de `(known after apply)`.
**Onde na prática:** marco 01.

### Substituição forçada
**Em uma frase:** a troca de um recurso por destruição e criação, porque o atributo mudado não aceita alteração no lugar (*ForceNew*); o plano marca `# forces replacement`.
**No fin-iac:** mudar `lc_collate` do banco do ledger faz o plano dizer `must be replaced`.
**Erro comum:** aprovar o PR olhando o *diff* do código, sem ler `1 to destroy` no plano.
**Onde na prática:** marco 01.

### `prevent_destroy`
**Em uma frase:** a opção de `lifecycle` que faz o `plan` falhar se ele pedir a destruição do recurso.
**No fin-iac:** os bancos de produção têm `prevent_destroy`, e o plano destrutivo falha com `Instance cannot be destroyed`.
**Erro comum:** confiar nele contra a remoção do bloco `resource`: apagado o bloco, a proteção some junto.
**Onde na prática:** marco 01.

### `create_before_destroy`
**Em uma frase:** a opção de `lifecycle` que cria o substituto antes de destruir o original numa substituição forçada.
**No fin-iac:** só é usada em recursos com nome gerado, que podem existir em dobro por um momento.
**Erro comum:** usá-la com nome fixo; medido, o banco novo falhou com `already exists`.
**Onde na prática:** marco 01.

### `ignore_changes`
**Em uma frase:** a opção de `lifecycle` que faz o Terraform ignorar diferenças num atributo.
**No fin-iac:** só entra com um comentário `# motivo:`, verificado por análise estática.
**Erro comum:** usá-la para calar um *drift* que devia ser investigado.
**Onde na prática:** marco 01.

### Pré-condição
**Em uma frase:** uma regra num bloco `precondition` que precisa valer antes de o Terraform agir sobre o recurso; se falha, o `plan` para com a mensagem escrita.
**No fin-iac:** o banco do ledger exige retenção de pelo menos 1825 dias.
**Erro comum:** não testá-la; com `mock_provider` e `expect_failures`, o teste roda sem banco.
**Onde na prática:** marco 01.

### Bloco `check`
**Em uma frase:** uma verificação contínua da infraestrutura que avisa sem bloquear o `apply` (Terraform 1.5).
**No fin-iac:** confere se o certificado de um *endpoint* vence em mais de 30 dias.
**Erro comum:** usá-lo para uma regra que deveria barrar a mudança; para isso serve a pré-condição.
**Onde na prática:** marco 01.

## Estado

### Bloqueio de estado
**Em uma frase:** o mecanismo do *backend* que deixa um só processo gravar o estado por vez; o outro falha com `Error acquiring the state lock`.
**No fin-iac:** todo estado tem bloqueio, e um teste dispara dois `apply` e exige que um falhe.
**Erro comum:** guardar o estado num lugar sem bloqueio porque "nunca rodamos ao mesmo tempo".
**Onde na prática:** marco 02.

### Bloqueio nativo do S3
**Em uma frase:** o bloqueio de estado do *backend* `s3` feito por um objeto `.tflock` gravado com escrita condicional, sem tabela DynamoDB; o argumento é `use_lockfile` (Terraform 1.10 em teste, 1.11 estável).
**No fin-iac:** o estado da rede do Pix fica no *bucket* `fin-tfstate`, com `use_lockfile = true` e versionamento ligado.
**Erro comum:** manter só o `dynamodb_table`, obsoleto desde a 1.11, ou apontar para um servidor compatível com S3 que ignora a escrita condicional, e ficar sem bloqueio nenhum.
**Onde na prática:** marco 02.

### `force-unlock`
**Em uma frase:** o comando que libera um bloqueio de estado pelo ID, para quando o dono do bloqueio morreu.
**No fin-iac:** um *runbook* exige confirmar que o *job* dono morreu antes de usá-lo.
**Erro comum:** destravar um bloqueio vivo para "andar mais rápido", permitindo a corrida que o bloqueio impedia.
**Onde na prática:** marco 02.

### Versionamento do estado
**Em uma frase:** o histórico de versões do objeto de estado no armazenamento (*bucket* ou *blob* versionado), que funciona como *backup*.
**No fin-iac:** o estado corrompido de propósito volta pela versão anterior, e o plano seguinte sai vazio.
**Erro comum:** ligar o bloqueio e esquecer o versionamento; aí a recuperação é reimportar tudo.
**Onde na prática:** marco 02.

### `terraform_remote_state`
**Em uma frase:** o *data source* que lê as saídas de outro estado, exigindo permissão de leitura sobre o estado inteiro do vizinho.
**No fin-iac:** nenhum estado de ambiente lê o estado de outro; as saídas compartilhadas são publicadas num parâmetro.
**Erro comum:** usá-lo e dar à esteira da aplicação acesso aos segredos do estado de dados.
**Onde na prática:** marco 02.

### Migração de *backend*
**Em uma frase:** a cópia do estado para outro *backend* com `terraform init -migrate-state`.
**No fin-iac:** a migração de `local` para `pg` é provada com o mesmo `state list` antes e depois.
**Erro comum:** deixar o `terraform.tfstate` local no disco depois da migração, e alguém usá-lo de novo.
**Onde na prática:** marco 02.

### Criptografia de estado no cliente
**Em uma frase:** a cifra do estado e do plano antes de sair da máquina, recurso do OpenTofu desde a 1.7 que o Terraform não tem.
**No fin-iac:** citada no ADR de ferramenta; o `fin-iac` usa Terraform e protege o estado por acesso.
**Erro comum:** achar que ela dispensa tirar o segredo do estado; o segredo continua lá dentro, cifrado.
**Onde na prática:** marco 02.

## Segredos

### Valor efêmero
**Em uma frase:** uma variável, saída ou recurso marcado como efêmero, que existe só durante uma execução e não é gravado no estado nem no plano (Terraform 1.10).
**No fin-iac:** a senha do papel de aplicação é lida do cofre por um `ephemeral "aws_secretsmanager_secret_version"`.
**Erro comum:** tentar usá-lo num argumento comum; ele só entra em contextos efêmeros, como um argumento *write-only*.
**Onde na prática:** marco 03.

### Argumento *write-only*
**Em uma frase:** um argumento de recurso que o provedor recebe durante o `apply` e que o Terraform não grava no estado nem no plano (Terraform 1.11).
**No fin-iac:** a senha do papel `ledger_app` no Postgres entra por `password_wo`, com `password_wo_version` para forçar a troca.
**Erro comum:** achar que `sensitive = true` tem o mesmo efeito; ele só esconde o valor da tela, e o estado continua com o texto claro.
**Onde na prática:** marco 03.

### Plano salvo
**Em uma frase:** o arquivo gerado por `plan -out`, que o `apply` executa exatamente e que contém os valores dos atributos, inclusive os sensíveis.
**No fin-iac:** é o artefato do PR, com acesso restrito, retenção curta e *hash* conferido no *merge*.
**Erro comum:** publicar o plano salvo como artefato aberto da esteira; medido, a senha `sensitive` apareceu 2 vezes nele.
**Onde na prática:** marco 03.

## Módulos e versões

### Módulo raiz
**Em uma frase:** o diretório onde se roda o Terraform, que configura os provedores, fixa as versões e chama os módulos.
**No fin-iac:** cada pasta de `estados/<fronteira>/<ambiente>/` é um módulo raiz.
**Erro comum:** escrever recursos diretamente no módulo raiz de cada ambiente, duplicando código.
**Onde na prática:** marco 04.

### Contrato de módulo
**Em uma frase:** as variáveis, as saídas e os endereços internos dos recursos de um módulo, que quem o chama passa a depender.
**No fin-iac:** o `postgres-servico` tem um teste de contrato com `terraform test` e `mock_provider`.
**Erro comum:** tratar o endereço interno como detalhe e renomeá-lo numa versão menor.
**Onde na prática:** marco 04.

### `validation`
**Em uma frase:** um bloco numa variável com uma condição e uma mensagem de erro, avaliado antes do plano.
**No fin-iac:** `conexoes.limite_app` só aceita de 1 a 200, com a mensagem dizendo a faixa.
**Erro comum:** escrever uma mensagem que diz só "valor inválido", sem dizer o que fazer.
**Onde na prática:** marco 04.

### *Lock file*
**Em uma frase:** o `.terraform.lock.hcl`, que grava a versão escolhida de cada provedor e os *hashes* dos pacotes por plataforma.
**No fin-iac:** fica no Git em cada módulo raiz, com *hashes* para `linux_amd64` e `darwin_arm64`.
**Erro comum:** gerá-lo só no Linux da esteira e ver o `init` falhar no Mac.
**Onde na prática:** marco 04.

### Restrição de versão
**Em uma frase:** a faixa de versões aceita para o Terraform (`required_version`) ou para um provedor (`version` em `required_providers`).
**No fin-iac:** os módulos declaram faixa (`>= 1.26, < 2.0`), e os módulos raiz fixam a versão exata.
**Erro comum:** fixar versão exata dentro de um módulo filho e prender todos os chamadores a ela.
**Onde na prática:** marco 04.

## Ambientes

### *Workspace*
**Em uma frase:** um estado a mais para o mesmo diretório de código, escolhido por um seletor (`terraform workspace select`).
**No fin-iac:** não é usado para ambientes; cada ambiente é um diretório com estado próprio.
**Erro comum:** rodar `apply` sem plano salvo com o *workspace* errado selecionado, que vai direto para outro ambiente.
**Onde na prática:** marco 05.

### Diretório por ambiente
**Em uma frase:** a organização em que cada ambiente é uma pasta com a mesma chamada de módulo, o próprio `backend.tf` e o próprio `tfvars`.
**No fin-iac:** os três `main.tf` de cada fronteira têm o mesmo *hash*, conferido por teste.
**Erro comum:** deixar os `main.tf` divergirem "só um pouco" em produção.
**Onde na prática:** marco 05.

### `tfvars`
**Em uma frase:** o arquivo de valores das variáveis de um módulo raiz, a única coisa que muda entre ambientes.
**No fin-iac:** o `tfvars` de produção pede retenção e réplicas, e a política barra valores abaixo do mínimo.
**Erro comum:** colocar segredos num `tfvars` versionado.
**Onde na prática:** marco 05.

### Terragrunt
**Em uma frase:** uma ferramenta de código aberto (MIT) que gera *backend* e chamadas por ambiente a partir de um arquivo e roda vários estados em ordem.
**No fin-iac:** avaliada no Complemento do marco 05, adotada só por ADR.
**Erro comum:** adotá-la antes de a repetição do diretório por ambiente virar problema real.
**Onde na prática:** marco 05.

### Terraform Stacks
**Em uma frase:** o recurso do HCP Terraform que declara componentes e implantações num só lugar e orquestra a ordem entre eles, estável desde a HashiConf 2025.
**No fin-iac:** fora, porque exige o HCP Terraform; entra no ADR como alternativa.
**Erro comum:** achar que é um recurso da CLI aberta; a CLI `terraform stacks` só fala com o serviço.
**Onde na prática:** marco 05.

## Infraestrutura existente

### Bloco `import`
**Em uma frase:** a declaração, no código, de que um objeto existente deve entrar no estado num endereço; passa pelo `plan` e pela revisão (Terraform 1.5).
**No fin-iac:** os papéis do Postgres do ledger entram com um `import` com `for_each`.
**Erro comum:** usar o comando `terraform import`, que grava no estado na hora, sem plano.
**Onde na prática:** marco 06.

### Configuração gerada
**Em uma frase:** o bloco `resource` escrito por `plan -generate-config-out` para um objeto importado, ainda experimental na 1.17.
**No fin-iac:** um teste reprova qualquer `.tf` com o cabeçalho `# __generated__ by Terraform`.
**Erro comum:** usá-la como código final; medido, ela veio com ruído de valores padrão e, numa tabela DynamoDB, com um valor que nem valida.
**Onde na prática:** marco 06.

### Consulta de listagem
**Em uma frase:** um bloco `list` num arquivo `.tfquery.hcl` que o `terraform query` usa para descobrir recursos existentes de um tipo, com a opção de gerar os blocos `import` e `resource` (Terraform 1.14).
**No fin-iac:** a consulta `aws_s3_bucket` no `moto` encontra o *bucket* de conciliação criado no console.
**Erro comum:** tratar a configuração gerada como código final; ela vem cheia de valores padrão explícitos e precisa de revisão.
**Onde na prática:** marco 06.

### Bloco `moved`
**Em uma frase:** a declaração de que um objeto mudou de endereço sem mudar de identidade, dentro do mesmo estado.
**No fin-iac:** leva o banco e os papéis de conciliação para `module.conciliacao`, sem nenhuma ação no plano (no JSON, só `no-op`).
**Erro comum:** removê-lo do módulo antes de todos os chamadores passarem pela versão que o trouxe.
**Onde na prática:** marco 06.

### Bloco `removed`
**Em uma frase:** a declaração, no código, de que um recurso deixou de ser gerenciado, com `lifecycle { destroy = false }` para tirá-lo do estado sem destruí-lo (Terraform 1.7).
**No fin-iac:** o *bucket* e a tabela da conciliação saem do estado de dados com `removed` e entram no de AWS com `import`.
**Erro comum:** apagar o bloco `resource` sem o `removed`: o `plan` seguinte propõe destruir o objeto real.
**Onde na prática:** marco 06.

### `state mv`
**Em uma frase:** o comando que muda um endereço direto no arquivo de estado, sem plano e sem revisão.
**No fin-iac:** só em emergência, depois de um *backup* do estado; o caminho normal é `moved`, ou `removed` + `import`.
**Erro comum:** usá-lo em rotina de refatoração, onde ninguém revisa o que mudou.
**Onde na prática:** marco 06.

## Esteira

### Análise estática
**Em uma frase:** a verificação do código sem executá-lo, dividida entre linguagem (`tflint`), segurança conhecida (Checkov) e regra do negócio (política própria).
**No fin-iac:** as três rodam em todo PR, cada uma com as suas *fixtures* violadoras.
**Erro comum:** repetir a mesma regra em duas ferramentas e manter cada exceção em dois lugares.
**Onde na prática:** marco 07.

### `tflint`
**Em uma frase:** o *linter* do Terraform (MPL 2.0), com regras de linguagem e convenção e *rulesets* por provedor.
**No fin-iac:** roda com o *preset* `recommended`; medido, aponta variável sem tipo e declaração não usada.
**Erro comum:** esperar que ele pegue configuração insegura; isso é do analisador de segurança.
**Onde na prática:** marco 07.

### Plano comentado no PR
**Em uma frase:** o resumo do `plan` publicado como comentário no PR, para o revisor aprovar a mudança na infraestrutura, não só no código.
**No fin-iac:** o *job* de `apply` só roda no *merge* e aplica o plano salvo daquele PR, conferido por *hash*.
**Erro comum:** gerar um plano novo no *merge*; ele pode ser diferente do revisado.
**Onde na prática:** marco 07.
