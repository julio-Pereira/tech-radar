Um verbete por termo: definição em uma frase, o exemplo no `fin-assist`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos que já têm dono (*gate*, métricas DORA, registro de
evidência, cadeia de suprimentos, segredo, teste de mutação, lei de Goodhart) são verbetes das trilhas
donas e não se repetem aqui.

## Delegar

### Assistente de código
**Em uma frase:** a ferramenta que sugere a próxima linha, a função ou o teste, uma sugestão de cada vez, aceita ou não por quem escreve.
**No fin-assist:** a sugestão de um caso de teste novo para o limite, revisada na hora por quem a aceitou.
**Erro comum:** tratá-lo como agente e aceitar um bloco grande sem ler, como se alguém já tivesse verificado.
**Onde na prática:** marco 01.

### Agente de código
**Em uma frase:** o programa que recebe uma tarefa e age em laço: lê o repositório, planeja, edita vários arquivos, roda comandos, observa e repete, sem determinismo e sem memória entre sessões.
**No fin-assist:** o agente roteirizado faz o papel dele nos testes, reproduzindo ações gravadas.
**Erro comum:** confiar que ele lembra do que "aprendeu" ontem sobre o repositório; o que persiste está escrito no `AGENTS.md`, na especificação e nos testes.
**Onde na prática:** marco 01, e também no marco 04.

### Laço do agente
**Em uma frase:** o ciclo planejar → agir → verificar → repetir de um agente de código, cuja qualidade depende do que ele consegue verificar a cada passo.
**No fin-assist:** os testes do limite rodam em segundos e entram no laço a cada edição.
**Erro comum:** dar ao agente só um teste lento, que fica fora do laço, e ele segue sem freio.
**Onde na prática:** marco 04.

### Custo de verificação
**Em uma frase:** o esforço para saber se o que o agente entregou está certo; é ele, e não a velocidade de escrever, que limita o ganho de delegar uma tarefa.
**No fin-assist:** a matriz de delegação põe teste e refatoração mecânica como baratos de verificar, e a regra do ledger como cara.
**Erro comum:** delegar pela facilidade de escrever, e não pela de verificar.
**Onde na prática:** marco 01.

### Matriz de delegação
**Em uma frase:** a tabela, versionada, que diz por classe de tarefa o que o agente pode fazer, como se verifica e quem aprova.
**No fin-assist:** o `delegacao.yaml`, com a classe `caminho-do-dinheiro` sem *merge* automático, e o classificador que põe cada PR na classe mais crítica dos arquivos que ele toca.
**Erro comum:** delegar por gosto de cada pessoa, sem critério escrito, e descobrir no incidente que o agente mexeu no ledger.
**Onde na prática:** marco 01.

## Especificar

### SDD (desenvolvimento guiado por especificação)
**Em uma frase:** a disciplina de escrever a especificação, o plano e as tarefas antes do código, com critérios de aceite que um teste confere.
**No fin-assist:** o limite por período, de `specs/limite-periodo/` até o decisor com relógio injetado.
**Erro comum:** aplicar a cadeia inteira a uma correção de uma linha e ensinar o time a pular o processo.
**Onde na prática:** marco 02.

### Princípios do projeto
**Em uma frase:** as regras que valem para toda tarefa do repositório (teste antes, dinheiro em centavos, relógio injetado), lidas pelo agente antes de cada uma.
**No fin-assist:** as convenções do `AGENTS.md`; no Spec Kit, a `constitution`.
**Erro comum:** repetir os princípios em cada especificação, e cada cópia envelhecer de um jeito.
**Onde na prática:** marco 02, e também no marco 03.

### Especificação
**Em uma frase:** o documento que diz o quê e por quê de uma funcionalidade, com requisitos identificados e critérios de aceite, sem dizer como.
**No fin-assist:** `specs/limite-periodo/spec.md`, com 4 requisitos e 7 critérios.
**Erro comum:** pôr detalhe de implementação ("use um `HashMap`") e amarrar o agente a uma solução talvez errada.
**Onde na prática:** marco 02.

### Plano
**Em uma frase:** o documento que diz como a especificação vai ser implementada: a abordagem e as decisões técnicas.
**No fin-assist:** o `plan.md` do limite, que escolhe a soma por janela e o relógio injetado.
**Erro comum:** misturar plano e especificação, e a especificação passar a envelhecer na velocidade do código.
**Onde na prática:** marco 02.

### Tarefa
**Em uma frase:** o passo pequeno e independente da implementação, que referencia um requisito e declara o comando que verifica o seu "pronto".
**No fin-assist:** "T-002 [RF-002, RF-003] janela com relógio injetado e fuso — verificação: `go test ./limite -run TestJanela`".
**Erro comum:** tarefa do tamanho da funcionalidade ("implementar o limite"), sem escopo nem verificação.
**Onde na prática:** marco 02.

### Critério de aceite executável
**Em uma frase:** a condição de pronto de um requisito escrita de forma que um comando a verifique, como um teste ou uma regra sobre o código.
**No fin-assist:** cada requisito do limite por período tem um teste anotado com o identificador dele.
**Erro comum:** escrever o critério em prosa ("o limite deve funcionar à noite") e deixar o agente decidir o que isso quer dizer.
**Onde na prática:** marco 02.

### Ambiguidade aberta
**Em uma frase:** a dúvida registrada na especificação, com dono e prazo, em vez de deixada para o agente decidir.
**No fin-assist:** "o limite é por conta ou por CPF?", marcado `[ABERTA]`; no Spec Kit, `[NEEDS CLARIFICATION]`.
**Erro comum:** escrever "conforme necessário" e esperar que o agente adivinhe; na classe crítica, o `speclint` reprova a especificação com ambiguidade aberta.
**Onde na prática:** marco 02, e também no marco 03.

### Rastreabilidade
**Em uma frase:** a ligação requisito → critério → teste → tarefa, conferida nos dois sentidos: todo critério tem teste, e todo teste aponta para um critério.
**No fin-assist:** a anotação `// spec: CA-002-3` no teste, cruzada pelo `speclint`.
**Erro comum:** conferir só um sentido, e o teste que o agente escreveu para o que o código faz passar sem apontar para nada pedido.
**Onde na prática:** marco 02.

### Deriva de especificação
**Em uma frase:** o código muda e a especificação não acompanha, até que ninguém confia nela e o agente lê um sistema que não existe mais.
**No fin-assist:** o time escolhe por escrito se a especificação é a fonte da verdade (e o `speclint` reprova o código que muda sem ela) ou vira histórico datado.
**Erro comum:** a especificação "viva" que ninguém atualiza.
**Onde na prática:** marco 02.

### Spec Kit
**Em uma frase:** a ferramenta de SDD de código aberto do GitHub, com a CLI `specify` e os comandos do fluxo (`constitution`, `specify`, `clarify`, `plan`, `checklist`, `tasks`, `analyze`, `implement`, `converge`) executados dentro do agente.
**No fin-assist:** a versão 1.4.0, fixada em `ferramentas.lock`, e o conversor que leva a especificação para o formato dele e volta.
**Erro comum:** instalar da `main` na esteira, e a CLI mudar de forma incompatível numa segunda-feira.
**Onde na prática:** marco 03.

## Agente no fluxo

### Arquivo de instruções do repositório
**Em uma frase:** o arquivo que o agente lê para saber os comandos de *build* e de teste, as convenções e os limites do repositório; o formato aberto mais adotado é o `AGENTS.md`.
**No fin-assist:** o `AGENTS.md`, cujos três comandos um teste executa.
**Erro comum:** pôr segredo, texto longo ou comando que não funciona; o agente confia no que está escrito.
**Onde na prática:** marco 04.

### Janela de contexto
**Em uma frase:** o conjunto de texto que o agente recebe numa sessão (instruções, arquivos, saídas de ferramenta), e que pode sair dele por resposta, *log* ou injeção.
**No fin-assist:** o contexto montado pelo portão, sem `.env`, chave nem valor de segredo copiado.
**Erro comum:** passar segredo no contexto "porque o agente precisa", em vez de uma credencial de curta duração fora dele.
**Onde na prática:** marco 06.

### Agente roteirizado
**Em uma frase:** um programa determinístico que reproduz, em ordem fixa, ações gravadas de um agente de código, para testar o controle em volta dele sem depender de um modelo.
**No fin-assist:** o roteiro do conteúdo injetado tenta a exfiltração, e o teste afirma que o portão bloqueou.
**Erro comum:** concluir que o controle funciona porque um agente real "se comportou" num teste.
**Onde na prática:** marco 04, e também no marco 06.

### Harness de aceitação
**Em uma frase:** o programa que aplica o patch do agente numa cópia do repositório e decide se o PR entra, pelo escopo, pelo tamanho, pelas asserções, pela mutação e pela evidência.
**No fin-assist:** o `harness/`, que recusou o patch fora do escopo, o PR de 311 linhas e a autoaprovação.
**Erro comum:** rodar `go test ./...` dentro da cópia e executar o próprio *harness* em recursão.
**Onde na prática:** marco 04.

### Asserção enfraquecida
**Em uma frase:** a verificação de teste que continua lá mas não verifica mais o que verificava, como `||` trocado por `&&` ou `assertEquals` trocado por `assertNotNull`.
**No fin-assist:** o patch que manteve a contagem de asserções e derrubou a pontuação de mutação de 6/9 para 5/9.
**Erro comum:** contar só as asserções, que não mudam, e aprovar o PR verde.
**Onde na prática:** marco 04.

### Escopo de arquivos
**Em uma frase:** os prefixos de caminho que a tarefa permite o agente tocar, declarados antes e conferidos no PR.
**No fin-assist:** a tarefa T-001 com escopo `limite/`; o patch que também mexeu no `speclint/` foi recusado.
**Erro comum:** aceitar a "melhoria de passagem" em outro módulo como proatividade do agente.
**Onde na prática:** marco 04.

## MCP

### MCP (Model Context Protocol)
**Em uma frase:** o protocolo aberto que padroniza como um agente descobre e chama ferramentas, lê recursos e usa *prompts* que um servidor expõe; a revisão vigente, 2026-07-28, é sem estado.
**No fin-assist:** o servidor de leitura em Go, que só negocia a 2026-07-28 com o *handler* sem estado ligado.
**Erro comum:** tratar o servidor como integração interna, e não como API pública para um cliente que obedece a qualquer texto.
**Onde na prática:** marco 05.

### Ferramenta MCP
**Em uma frase:** a função que um servidor MCP expõe ao modelo, com nome, descrição e esquema de entrada; o modelo a escolhe pela descrição.
**No fin-assist:** `consultar_lancamento`, estreita, só de leitura e com o identificador validado por padrão.
**Erro comum:** uma ferramenta larga ("executar consulta") com descrição vaga, que o modelo usa para o que ninguém previu.
**Onde na prática:** marco 05.

### Recurso MCP
**Em uma frase:** o dado que um servidor MCP oferece para o cliente ler por URI, sem ser uma chamada de função.
**No fin-assist:** fica de fora do laboratório; as duas capacidades expostas são ferramentas de leitura.
**Erro comum:** expor um recurso amplo (o arquivo de configuração inteiro) e levar o segredo dele para o contexto do agente.
**Onde na prática:** marco 05.

### Servidor MCP
**Em uma frase:** o serviço que expõe ferramentas, recursos e *prompts* pelo MCP, por stdio ou Streamable HTTP; numa empresa, é infraestrutura compartilhada que a plataforma oferece como modelo.
**No fin-assist:** `mcp/`, atrás do verificador de *token*, com auditoria e limite de tamanho.
**Erro comum:** escrever um servidor para embrulhar um comando que o agente já roda com `--help`.
**Onde na prática:** marco 05.

### Audiência do token
**Em uma frase:** o destinatário para o qual um *token* foi emitido (RFC 8707); um servidor MCP só aceita o *token* emitido para ele, e não repassa o que recebeu para outra API.
**No fin-assist:** o *token* emitido para o `ledger-core` foi recusado pelo servidor MCP antes de qualquer leitura.
**Erro comum:** aceitar qualquer *token* válido do provedor de identidade, e um *token* vazado de qualquer serviço abrir as ferramentas.
**Onde na prática:** marco 05.

## Segurança

### Injeção de prompt
**Em uma frase:** a instrução maliciosa num texto que o agente trata como ordem; é direta quando quem usa o agente a escreve.
**No fin-assist:** a defesa testada é o portão, que funciona com o agente enganado.
**Erro comum:** confiar num *prompt* de sistema que diga ao modelo para não obedecer.
**Onde na prática:** marco 06.

### Injeção indireta de prompt
**Em uma frase:** a instrução escondida num conteúdo que o agente lê (issue, comentário, README, saída de ferramenta), e não digitada por quem usa o agente.
**No fin-assist:** um comentário escondido numa issue pede para ler o `.env` e enviar para fora.
**Erro comum:** tratar o problema como de *prompt* do sistema, quando a defesa que se testa é o controle de permissão e de saída.
**Onde na prática:** marco 06.

### Canal de saída
**Em uma frase:** qualquer caminho pelo qual o agente manda dado para fora da sessão: rede, comentário público, e-mail, até um link numa resposta.
**No fin-assist:** a saída de rede, limitada aos destinos da lista; o coletor do roteiro injetado ficou de fora.
**Erro comum:** liberar a rede "para buscar documentação" numa sessão que também lê segredo e conteúdo externo.
**Onde na prática:** marco 06.

### Combinação perigosa
**Em uma frase:** dado privado, conteúdo não confiável e canal de saída na mesma sessão de agente, o que permite a exfiltração (a *lethal trifecta* de Willison); a regra das duas da Meta permite no máximo duas por sessão.
**No fin-assist:** o validador recusa a sessão com as três, e aceita qualquer uma com duas.
**Erro comum:** configurar o agente de triagem com as três "porque é só para issues".
**Onde na prática:** marco 06.

### Portão de política
**Em uma frase:** a função pura e determinística entre o agente e o mundo, que decide cada ação (comando, arquivo, rede, ferramenta) pela sessão e registra a decisão.
**No fin-assist:** `portao/`, com `Permitir(sessao, acao)` e o registro encadeado por *hash*.
**Erro comum:** defesa em camadas sem um teste por camada; no laboratório, a lista de arquivos encobria a falta de teste da regra de segredo.
**Onde na prática:** marco 06.

### Ambiente isolado
**Em uma frase:** o lugar onde o agente roda sem credencial de produção, com sistema de arquivos próprio e rede restrita.
**No fin-assist:** a sessão de laboratório, sem segredo de verdade e com saída só para o *proxy* de módulos.
**Erro comum:** rodar o agente na máquina de quem tem acesso à produção, com o *token* de nuvem carregado no terminal.
**Onde na prática:** marco 06.

### Pacote inexistente
**Em uma frase:** o nome de dependência plausível que um modelo sugere e que não existe, e que um atacante pode registrar para receber a instalação.
**No fin-assist:** `github.com/fin-platform/ledger-helpers`, negado pelo registro espelhado mesmo estando na lista por engano.
**Erro comum:** aceitar a dependência sugerida porque "o `go get` falharia se não existisse".
**Onde na prática:** marco 06.

### Lista permitida
**Em uma frase:** a relação explícita do que o agente pode usar (comandos, destinos, dependências, ferramentas); o que não está nela é negado.
**No fin-assist:** a sessão do portão, com a lista de dependências e o registro espelhado como segunda checagem.
**Erro comum:** lista de bloqueio no lugar de lista permitida, e o caso que ninguém previu passar.
**Onde na prática:** marco 06.

### Ação irreversível
**Em uma frase:** a ação que não se desfaz (*deploy* em produção, migração, estorno, exclusão), que só passa com a aprovação registrada de uma pessoa diferente da responsável pela sessão.
**No fin-assist:** `make deploy-producao`, negado sem aprovação, com a da própria responsável e com a de outra ação.
**Erro comum:** aceitar a confirmação do próprio agente, que pode estar repetindo o que leu.
**Onde na prática:** marco 06.

## Medir

### Métrica de vaidade
**Em uma frase:** o número que sobe com o uso da ferramenta e não diz se a entrega melhorou, como linhas geradas, sugestões aceitas e horas declaradas.
**No fin-assist:** o relatório de medição não calcula nenhuma; ele recusa mostrar velocidade sem estabilidade e retrabalho.
**Erro comum:** apresentar "40% das sugestões aceitas" como resultado do piloto.
**Onde na prática:** marco 07.

### Retrabalho de código
**Em uma frase:** as linhas que um PR adicionou e outro PR reescreveu ou reverteu dentro de uma janela de dias; não é o retrabalho de *deploy* do DORA, que conta *deploys* não planejados por incidente.
**No fin-assist:** 6 de 20 linhas do piloto refeitas em 14 dias, contra 1 de 12 no grupo de comparação.
**Erro comum:** medir só o retrabalho de *deploy*, que sobe depois, quando o código já virou incidente.
**Onde na prática:** marco 07.

### Defeito escapado
**Em uma frase:** o defeito que passou pela revisão e pelos testes e só apareceu em produção.
**No fin-assist:** entra no relatório do piloto ao lado da taxa de falha e do retrabalho.
**Erro comum:** contar só os defeitos que a esteira pegou, e concluir que o agente não introduz erro.
**Onde na prática:** marco 07.

### Grupo de comparação
**Em uma frase:** o time ou conjunto de PRs que não adotou o agente, medido no mesmo período, para separar o efeito do agente do resto do que mudou.
**No fin-assist:** o grupo "controle" da massa sintética, comparado pela variação, e não pelo valor absoluto.
**Erro comum:** comparar o mesmo time antes e depois, misturando o agente com o projeto, a época e a pessoa nova.
**Onde na prática:** marco 07.
