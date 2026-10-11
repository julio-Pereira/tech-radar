Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Fluxo

### Fluxo de valor
**Em uma frase:** o caminho completo de uma mudança, da ideia à produção, com cada passo medido em trabalho e espera.
**No fin-platform:** o mapa de uma mudança típica do `fin-pipeline`, do commit ao deploy.
**Erro comum:** mapear só os passos automatizados, ignorando a espera por aprovação humana no meio.
**Onde na prática:** marco 01.

### Eficiência de fluxo
**Em uma frase:** trabalho dividido por trabalho mais espera, numa mudança típica.
**No fin-platform:** calculada a partir do mapa de fluxo de valor do `fin-pipeline`.
**Erro comum:** a intuição subestima drasticamente quanto do tempo total é espera, não trabalho.
**Onde na prática:** marco 01.

### Tamanho de lote
**Em uma frase:** quanto muda numa única integração — menor é mais fácil de revisar, testar e diagnosticar se falhar.
**No fin-platform:** o simulador de lote do marco 01, mostrando lote menor implicando *lead time* menor.
**Erro comum:** medir só velocidade de entrega, sem notar que lote pequeno também reduz candidatos a causa quando algo falha.
**Onde na prática:** marco 01.

### Métricas DORA
**Em uma frase:** frequência de implantação, *lead time*, taxa de falha de mudança e tempo de recuperação.
**No fin-platform:** calculadas por `dora/` a partir de um histórico sintético de eventos.
**Erro comum:** citar nomes ou valores de referência sem conferir a edição vigente da pesquisa.
**Onde na prática:** marco 01.

### Lei de Goodhart
**Em uma frase:** uma medida usada como alvo tende a ser manipulada e deixa de informar o que deveria.
**No fin-platform:** commits fatiados artificialmente para inflar frequência de implantação sem valor real.
**Erro comum:** olhar uma métrica de velocidade isolada, sem a métrica de estabilidade correspondente ao lado.
**Onde na prática:** marco 01.

## Pipeline

### Gate
**Em uma frase:** um critério objetivo, automático e com dono que bloqueia o avanço de um build.
**No fin-platform:** o *gate* de mutação sobre o módulo `Money`, com pontuação mínima declarada.
**Erro comum:** um "critério" que só existe em prosa, verificado manualmente — isso não é um *gate*.
**Onde na prática:** marco 04.

### Falhar cedo (ordem de estágios)
**Em uma frase:** rodar primeiro o estágio mais barato e rápido, para não desperdiçar tempo de um estágio caro.
**No fin-platform:** lint antes do teste de integração de 12 minutos, na pipeline do `fin-pipeline`.
**Erro comum:** ordenar estágios por convenção ou hábito, em vez de pelo custo declarado de cada um.
**Onde na prática:** marco 02.

### Chave de cache
**Em uma frase:** o identificador que decide se um cache de dependências ainda é válido — precisa incluir o hash do lockfile.
**No fin-platform:** a chave de cache do `ci/`, recalculada a cada mudança de lockfile.
**Erro comum:** usar uma chave baseada no nome do branch, servindo cache desatualizado silenciosamente.
**Onde na prática:** marco 02.

### Pipeline como código fino
**Em uma frase:** toda decisão vive em função testável; o YAML só orquestra, chamando os scripts na ordem certa.
**No fin-platform:** as regras de `ci/` escritas como funções Go testáveis, nunca como `run:` com lógica embutida.
**Erro comum:** um `run:` de 30 linhas com lógica condicional, impossível de testar sem rodar a pipeline inteira.
**Onde na prática:** marco 02.

### Pinning por SHA
**Em uma frase:** fixar uma *action* de terceiros pelo hash completo do commit, nunca por tag móvel.
**No fin-platform:** toda *action* usada nos *workflows* do `fin-pipeline` fixada por SHA, não por `v2` ou `latest`.
**Erro comum:** confiar numa *action* hoje e nunca reconsiderar que a tag pode ser repontada sem aviso.
**Onde na prática:** marco 02.

### Permissões mínimas
**Em uma frase:** o token da pipeline declara explicitamente só o que precisa, nunca `write-all` por padrão.
**No fin-platform:** cada job do `fin-pipeline` com `permissions` declaradas e verificadas por script.
**Erro comum:** usar a permissão ampla padrão "por comodidade", ampliando o raio de explosão de qualquer comprometimento.
**Onde na prática:** marco 02.

### Teste instável (*flaky*)
**Em uma frase:** um teste que passa e falha sobre o mesmo código, sem nenhuma mudança real.
**No fin-platform:** detectado por resultado misto no mesmo commit, e colocado em quarentena com dono e prazo.
**Erro comum:** "rodar de novo até passar" — mascara o problema indefinidamente, em vez de corrigi-lo.
**Onde na prática:** marco 02.

### Workflow reutilizável
**Em uma frase:** um conjunto de estágios compartilhado entre repositórios, mudado num lugar e propagado.
**No fin-platform:** o modelo de pipeline conforme do marco 10, usado por todo serviço novo do `fin-platform`.
**Erro comum:** copiar e colar a mesma pipeline em cada repositório, deixando cada cópia divergir silenciosamente.
**Onde na prática:** marcos 02 e 10.

## Integração

### Trunk-based development
**Em uma frase:** integrar no tronco principal com frequência, em lotes pequenos, por desenho.
**No fin-platform:** a prática que o `fin-pipeline` adota, em oposição a ramos de feature de duas semanas.
**Erro comum:** achar que ter CI automatizado já é praticar integração contínua, mesmo com ramos longos.
**Onde na prática:** marco 03.

### Feature flag
**Em uma frase:** um interruptor que separa integrar código (no tronco) de ativá-lo (visível a usuários).
**No fin-platform:** usada para integrar trabalho incompleto de uma nova funcionalidade sem expô-la ainda.
**Erro comum:** confundir feature flag com uma simples variável de configuração sem disciplina de limpeza.
**Onde na prática:** marco 03.

### Fila de merge
**Em uma frase:** testa o resultado da fusão de PRs antes de aplicá-la, não cada PR isolado.
**No fin-platform:** garante que dois PRs, cada um passando sozinho, não quebrem a `main` juntos.
**Erro comum:** confiar que "cada PR passou nos testes" basta — sem fila, a combinação nunca foi testada.
**Onde na prática:** marco 03.

### Filtro de caminho
**Em uma frase:** decide quais partes da pipeline rodam, a partir de quais arquivos mudaram.
**No fin-platform:** uma mudança só em `docs/` não dispara o build do serviço Java ou Go.
**Erro comum:** rodar tudo sempre "para garantir", desperdiçando tempo de CI de forma crescente.
**Onde na prática:** marco 03.

## Artefato

### Digest
**Em uma frase:** o hash de conteúdo que identifica um artefato de forma imutável e verificável.
**No fin-platform:** o identificador que garante que o artefato em produção é exatamente o testado em homologação.
**Erro comum:** identificar artefatos por tag mutável (`v1.2.3` reconstruída), perdendo a garantia de imutabilidade.
**Onde na prática:** marco 05.

### Promoção sem reconstruir
**Em uma frase:** mover a referência do mesmo *digest* entre ambientes, nunca recompilar o código numa etapa separada.
**No fin-platform:** o *workflow* de promoção do `fin-pipeline` não contém nenhuma etapa de build.
**Erro comum:** reconstruir "só essa vez" num *hotfix*, arriscando uma dependência transitiva diferente da testada.
**Onde na prática:** marco 05.

### Ambiente efêmero
**Em uma frase:** um ambiente criado para um PR específico, destruído automaticamente quando ele fecha.
**No fin-platform:** o ambiente de teste de PR do `fin-pipeline`, com *teardown* verificado.
**Erro comum:** um *teardown* que falha silenciosamente, deixando recurso órfão gerando custo permanente.
**Onde na prática:** marco 05.

### Versão semântica calculada
**Em uma frase:** `major.minor.patch` derivado automaticamente do tipo de cada commit estruturado.
**No fin-platform:** o *changelog* do `fin-pipeline`, gerado sem decisão manual a cada release.
**Erro comum:** calcular versão sem convenção de commit estruturada, exigindo decisão manual sujeita a esquecimento.
**Onde na prática:** marco 05.

## IaC

### Estado (Terraform)
**Em uma frase:** o registro de qual recurso real corresponde a qual bloco de configuração.
**No fin-platform:** o estado do módulo `infra/`, nunca versionado em texto puro no Git.
**Erro comum:** esquecer que o estado costuma conter segredos em texto claro, mesmo de variáveis marcadas como sensíveis.
**Onde na prática:** marco 06.

### Plan como artefato de revisão
**Em uma frase:** a previsão do que vai mudar, revisável por humano e por política antes do `apply`.
**No fin-platform:** o plano exportado em JSON e avaliado pelo motor de política antes de qualquer `apply`.
**Erro comum:** aplicar direto sem revisar o plano, perdendo a chance de pegar um erro antes que ele aconteça de verdade.
**Onde na prática:** marco 06.

### Drift (infraestrutura)
**Em uma frase:** a diferença entre o estado real e o declarado, geralmente causada por mudança manual fora do fluxo.
**No fin-platform:** detectado pelo próximo `plan` depois de uma edição manual num recurso gerenciado.
**Erro comum:** não ter nenhuma verificação periódica de *drift*, descobrindo a divergência só quando algo quebra.
**Onde na prática:** marco 06.

### Raio de explosão (estado único)
**Em uma frase:** o alcance de um erro de configuração, proporcional ao tamanho do estado Terraform compartilhado.
**No fin-platform:** a justificativa para dividir o estado do `fin-platform` por fronteira de sistema ou ambiente.
**Erro comum:** colocar todos os recursos no mesmo estado "para simplificar", ampliando o alcance de qualquer erro.
**Onde na prática:** marco 06.

### Política sobre o plano
**Em uma frase:** avaliação automática do plano (em JSON) contra regras, antes do `apply`.
**No fin-platform:** nega um plano que cria recurso sem a *tag* `owner` obrigatória.
**Erro comum:** depender só de revisão humana para pegar violação de política, sem verificação automática exaustiva.
**Onde na prática:** marco 06.

## Release

### Deploy × release
**Em uma frase:** *deploy* é código rodando no ambiente; *release* é código visível ao cliente.
**No fin-platform:** uma *feature flag* separa os dois, permitindo deploy frequente sem lançar tudo de uma vez.
**Erro comum:** tratar os dois como sinônimos, forçando toda mudança implantada a ser imediatamente visível.
**Onde na prática:** marco 07.

### Canário (release)
**Em uma frase:** uma fração pequena do tráfego real vai para a versão nova, com o resto na versão estável.
**No fin-platform:** 5% do tráfego do `fin-pipeline` validando uma versão nova antes da promoção completa.
**Erro comum:** liberar o canário sem janela e tolerância declaradas, decidindo por impressão subjetiva.
**Onde na prática:** marco 07.

### Rollback × roll-forward
**Em uma frase:** voltar à versão anterior, versus corrigir com uma versão nova em vez de voltar.
**No fin-platform:** rollback complicado por uma migração de schema que já rodou entre as duas versões.
**Erro comum:** assumir que rollback é sempre simples e seguro, ignorando incompatibilidade de schema.
**Onde na prática:** marco 07.

### Janela de congelamento
**Em uma frase:** um período em que deploys não emergenciais são recusados automaticamente.
**No fin-platform:** o fechamento contábil do `fin-platform`, bloqueado por relógio, não por convenção verbal.
**Erro comum:** tratar a janela como "recomendação", ignorada sob pressão de um prazo de negócio.
**Onde na prática:** marco 07.

## Banco

### Expand/contract (na esteira)
**Em uma frase:** adicionar o novo sem remover o antigo, migrar os dois lados, só então remover — automatizado como passo de pipeline.
**No fin-platform:** a renomeação de `saldo` para `saldo_disponivel` em fases, nunca num único passo.
**Erro comum:** renomear uma coluna em uso num único passo, derrubando a versão anterior do app durante o deploy gradual.
**Onde na prática:** marco 08.

### Matriz de compatibilidade (N-1 × N)
**Em uma frase:** verifica se a versão anterior do app funciona contra o schema já migrado, e vice-versa.
**No fin-platform:** garante que, durante um deploy gradual, as duas versões coexistindo não quebram uma à outra.
**Erro comum:** migrar um schema sem verificar se a versão anterior do app ainda funciona contra ele.
**Onde na prática:** marco 08.

### DDL perigoso
**Em uma frase:** operações de schema conhecidas por causar incidente — trava longa, índice sem opção concorrente, renomear coluna em uso.
**No fin-platform:** pego pelo *linter* de `db/` antes de qualquer migração ser aplicada em ambiente real.
**Erro comum:** assumir que o que é "perigoso" é fixo entre versões do banco, sem conferir o comportamento vigente.
**Onde na prática:** marco 08.

## Controle

### Segregação de funções
**Em uma frase:** autor e aprovador de uma mudança nunca são a mesma identidade.
**No fin-platform:** `CODEOWNERS` e revisores obrigatórios rejeitando qualquer tentativa de auto-aprovação.
**Erro comum:** tratar isso como política de confiança, em vez de mecanismo estrutural verificável.
**Onde na prática:** marco 09.

### Evidência como produto
**Em uma frase:** todo controle (aprovação, *gate*, deploy) gera um registro que um auditor poderia consultar.
**No fin-platform:** o registro de deploy do `evidencia/` com autor, aprovador, checagens, *digest*, hora e classe.
**Erro comum:** confiar em logs espalhados por sistemas diferentes para reconstruir a história depois do fato.
**Onde na prática:** marco 09.

### Log encadeado por hash
**Em uma frase:** cada registro inclui o hash do anterior, tornando adulteração detectável.
**No fin-platform:** o log de evidência do `fin-pipeline`, que quebra visivelmente se um registro no meio for alterado.
**Erro comum:** achar que um log imutável impede adulteração — ele só a torna detectável, não impossível de tentar.
**Onde na prática:** marco 09.

### Break-glass
**Em uma frase:** o caminho de emergência que fura a aprovação normal, com revisão retroativa obrigatória e prazo.
**No fin-platform:** o *hotfix* de 2h da manhã, com tarefa de revisão gerada automaticamente para as próximas 24h.
**Erro comum:** tratar a urgência como dispensa de prestação de contas, em vez de só adiá-la com prazo.
**Onde na prática:** marco 09.

### Classe de mudança
**Em uma frase:** padrão (pré-aprovada por *gates*), normal (aprovação explícita) ou emergencial (*break-glass*).
**No fin-platform:** a classificação automática, função pura, que decide qual caminho uma mudança segue.
**Erro comum:** deixar a classe ser escolhida livremente por quem está implantando, sem verificação dos *gates* exigidos.
**Onde na prática:** marco 09.

## Esteira como produto

### Modelo de pipeline conforme
**Em uma frase:** *workflows* reutilizáveis e versionados com os *gates* dos marcos anteriores já embutidos.
**No fin-platform:** todo serviço novo nasce conforme, sem copiar YAML de outro repositório.
**Erro comum:** cada equipe construir sua própria pipeline do zero, reinventando (e esquecendo) cada verificação.
**Onde na prática:** marco 10.

### SLO da esteira
**Em uma frase:** disponibilidade, duração p95 e taxa de sucesso da própria pipeline, tratados como SLO de serviço crítico.
**No fin-platform:** calculado do histórico sintético do `fin-pipeline`, violado por uma degradação injetada em teste.
**Erro comum:** tratar a esteira como infraestrutura "que simplesmente deveria funcionar", sem medir sua confiabilidade.
**Onde na prática:** marco 10.

### Custo de CI
**Em uma frase:** minutos de execução, multiplicados pela frequência de execução, como item de orçamento real.
**No fin-platform:** medido via taxa de acerto de cache — o indicador mais direto de desperdício.
**Erro comum:** não medir e descobrir o custo só quando a fatura do provedor de CI já surpreendeu alguém.
**Onde na prática:** marco 10.
