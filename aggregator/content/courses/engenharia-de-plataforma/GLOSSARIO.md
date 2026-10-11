Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Produto

### Plataforma como produto
**Em uma frase:** tratar a plataforma interna com cliente, jornada e métrica, não como infraestrutura imposta.
**No fin-platform:** o `fin-devplatform`, medido pelo tempo até o primeiro deploy de uma equipe nova.
**Erro comum:** construir capacidades sem consultar quem vai usá-las, a "torre de marfim".
**Onde na prática:** marco 01.

### Cliente interno
**Em uma frase:** a equipe de produto que consome a plataforma, com jornada própria de dia 0 ao desligar.
**No fin-platform:** mapeado em `adocao/jornada.yaml`, com os passos reais, não os ideais.
**Erro comum:** assumir que o cliente interno vai se adaptar à plataforma, em vez de desenhar a plataforma para ele.
**Onde na prática:** marco 01.

### Carga cognitiva
**Em uma frase:** o que uma equipe precisa entender além do próprio domínio de negócio para operar seu serviço.
**No fin-platform:** o problema de fundo que a plataforma existe para absorver.
**Erro comum:** adicionar uma camada nova de complexidade "para ajudar", aumentando a carga em vez de reduzi-la.
**Onde na prática:** marco 01.

### Plataforma mínima viável
**Em uma frase:** resolve a dor de maior impacto primeiro, com a menor superfície possível.
**No fin-platform:** o backlog priorizado por espera removível, não por lista completa de capacidades imaginadas.
**Erro comum:** tentar construir toda capacidade possível antes de qualquer equipe real ter usado a primeira.
**Onde na prática:** marco 01.

### Tempo até o primeiro deploy
**Em uma frase:** a métrica central que resume o atrito acumulado da jornada de dia 0 de uma equipe nova.
**No fin-platform:** calculado como soma de trabalho e espera de todos os passos da jornada.
**Erro comum:** medir só depois de melhorias, sem ter um número de antes para comparar.
**Onde na prática:** marco 01.

### Modos de interação (equipe de plataforma)
**Em uma frase:** colaboração, X-as-a-service e facilitação — formas diferentes de uma equipe de plataforma atender equipes de produto.
**No fin-platform:** X-as-a-service como o modo que escala, reduzindo a necessidade de colaboração repetida.
**Erro comum:** manter colaboração direta como modo padrão indefinidamente, o que não escala com o número de equipes.
**Onde na prática:** marco 01.

### Métrica sem decisão
**Em uma frase:** qualquer métrica que não declara qual decisão ela informa — rejeitada pela regra central desta trilha.
**No fin-platform:** verificado por lint sobre o catálogo de métricas: toda métrica tem `decisao_que_informa` e dono.
**Erro comum:** adotar uma métrica de um modelo sofisticado (DORA, SPACE) sem nunca conectá-la a uma decisão real.
**Onde na prática:** marco 01.

## Arquitetura

### IDP (internal developer platform)
**Em uma frase:** a plataforma interna que expõe capacidades de infraestrutura e entrega como autosserviço.
**No fin-platform:** o `fin-devplatform` inteiro, nas camadas de interface, integração, recursos, observabilidade e segurança.
**Erro comum:** construir primeiro o portal, sem o control plane que de fato processa pedidos por trás dele.
**Onde na prática:** marco 02.

### Plano de controle × plano de dados
**Em uma frase:** control plane processa pedidos e reconcilia; o que já está em execução não deveria depender dele.
**No fin-platform:** um workload já implantado continua saudável mesmo com a API da plataforma fora do ar.
**Erro comum:** projetar um serviço que consulta o control plane em tempo de execução, criando dependência indevida.
**Onde na prática:** marcos 02 e 07.

### Reconciliação
**Em uma frase:** o mecanismo que faz o estado real convergir continuamente para o estado desejado.
**No fin-platform:** o reconciliador de `plataforma/`, corrigindo deriva introduzida manualmente.
**Erro comum:** tratar reconciliação como execução única, em vez de processo contínuo que corrige desvio futuro.
**Onde na prática:** marco 02.

### Idempotência de pedido
**Em uma frase:** o mesmo identificador de pedido, enviado duas vezes, produz o mesmo resultado, nunca dois recursos.
**No fin-platform:** protege contra reenvio causado por timeout de rede entre cliente e API.
**Erro comum:** gerar um novo identificador a cada tentativa, perdendo a capacidade de detectar repetição.
**Onde na prática:** marco 02.

### Atomicidade com compensação
**Em uma frase:** um pedido com múltiplos recursos é tudo ou nada; falha no meio desfaz o que já foi criado.
**No fin-platform:** um ambiente que precisa de banco, rede e permissões — falha em um desfaz os outros dois.
**Erro comum:** deixar recursos parcialmente criados quando um passo falha, sem compensação automática.
**Onde na prática:** marco 02.

### Plataforma fina × espessa
**Em uma frase:** fina orquestra o que já existe (Terraform, Kubernetes); espessa tem mais lógica e estado próprios.
**No fin-platform:** uma decisão arquitetural registrada em ADR, não um detalhe de implementação.
**Erro comum:** tornar a plataforma espessa por padrão, acumulando código próprio que poderia ser delegado.
**Onde na prática:** marco 02.

### Composição de infraestrutura
**Em uma frase:** ferramentas (como Crossplane) que abstraem recursos de nuvem em APIs declarativas compostas.
**No fin-platform:** tratada como estudo comparativo neutro, com licença e maturidade a conferir antes de adotar.
**Erro comum:** adotar uma ferramenta de composição como pré-requisito de implementação, em vez de opção avaliada por ADR.
**Onde na prática:** marco 02.

## Catálogo

### Entidade (catálogo)
**Em uma frase:** sistema, componente, API, recurso, grupo ou dono — os tipos modelados no catálogo.
**No fin-platform:** as 12 entidades reais de `catalogo/`, com relações explícitas entre elas.
**Erro comum:** modelar só componentes, sem capturar APIs e recursos que eles expõem ou consomem.
**Onde na prática:** marco 03.

### Scorecard
**Em uma frase:** avalia um componente contra critérios declarados (SLO, runbook, dono, testes, SBOM).
**No fin-platform:** calculado de forma determinística, mudando de nível conforme a tabela de regras.
**Erro comum:** usar o scorecard como ranking punitivo, em vez de ferramenta de melhoria guiada.
**Onde na prática:** marco 03.

### Frescor (catálogo)
**Em uma frase:** quando um metadado foi confirmado por último — metadado velho é pior que nenhum.
**No fin-platform:** um dono desatualizado no catálogo gera confiança falsa em vez de incerteza honesta.
**Erro comum:** assumir que um metadado registrado uma vez continua válido para sempre.
**Onde na prática:** marco 03.

### Componente órfão
**Em uma frase:** código existente no repositório sem descritor correspondente no catálogo.
**No fin-platform:** detectado por varredura cruzando repositório real e catálogo declarado.
**Erro comum:** confiar que todo componente novo vai ter descritor criado, sem verificação automatizada.
**Onde na prática:** marco 03.

## Golden path

### Golden path / escape hatch
**Em uma frase:** caminho opinativo com saídas explícitas, auditadas e com prazo, para casos legítimos.
**No fin-platform:** o template que já embute estrutura, pipeline, observabilidade e segurança.
**Erro comum:** permitir escape hatch sem registro nem prazo, virando desvio permanente não revisado.
**Onde na prática:** marco 04.

### Drift de template
**Em uma frase:** a distância entre o que um repositório gerado tem hoje e o que a versão atual do template geraria.
**No fin-platform:** medido por relatório, listando quais arquivos divergem e por quê.
**Erro comum:** assumir que todo repositório está atualizado, sem medir o drift real.
**Onde na prática:** marco 04.

### Mesclagem de três vias
**Em uma frase:** compara base comum, versão antiga e versão nova do template para detectar conflito, sem sobrescrever.
**No fin-platform:** a técnica de atualização em massa v1→v2, reportando conflitos em vez de escolher um lado.
**Erro comum:** atualizar em massa sem essa técnica, sobrescrevendo personalização local silenciosamente.
**Onde na prática:** marco 04.

### Janela de suporte (template)
**Em uma frase:** o período em que uma versão de template continua suportada antes de ser considerada fora de janela.
**No fin-platform:** verificada com relógio falso, sinalizando repositórios em versão além do prazo.
**Erro comum:** não declarar janela de suporte, deixando versões antigas indefinidamente sem pressão de atualização.
**Onde na prática:** marco 04.

## Ambientes

### Ambiente como serviço
**Em uma frase:** "me dá um ambiente" como chamada de API, com dono, custo e prazo de vida — não script manual.
**No fin-platform:** a extensão de `plataforma/` que transforma pedido em módulo Terraform e manifestos.
**Erro comum:** criar ambientes manualmente fora do fluxo da plataforma, perdendo dono e etiquetas obrigatórias.
**Onde na prática:** marco 05.

### TTL (ambiente)
**Em uma frase:** o tempo de vida declarado de um ambiente, após o qual ele expira automaticamente.
**No fin-platform:** o mecanismo que, se configurado desde a criação, evita o custo acumulado de um ambiente esquecido.
**Erro comum:** não configurar TTL por padrão, deixando a expiração depender de alguém lembrar manualmente.
**Onde na prática:** marco 05.

### Proteção (ambiente)
**Em uma frase:** um marcador que impede a remoção automática por TTL de um ambiente com dados importantes.
**No fin-platform:** verificado em teste: nenhum ambiente protegido é removido, mesmo com o prazo esgotado.
**Erro comum:** confiar só no TTL sem marcar explicitamente ambientes que não deveriam ser removidos automaticamente.
**Onde na prática:** marco 05.

### Recurso zumbi
**Em uma frase:** algo que continua existindo e custando, mas que ninguém mais usa.
**No fin-platform:** detectado ativamente, não descoberto só quando a fatura do mês revela o problema.
**Erro comum:** esperar revisão manual de custo para encontrar zumbis, em vez de detecção automatizada contínua.
**Onde na prática:** marcos 05 e 08.

## Segurança

### Default-deny
**Em uma frase:** a postura de rede que nega todo tráfego por padrão, permitindo só o explicitamente declarado.
**No fin-platform:** aplicado a todo ambiente gerado pela plataforma, verificado nos manifestos.
**Erro comum:** configurar rede permissiva "para simplificar" e restringir depois, invertendo a postura correta.
**Onde na prática:** marco 06.

### Menor privilégio (da própria plataforma)
**Em uma frase:** a conta de serviço da plataforma tem só as permissões que estritamente precisa, nunca um curinga.
**No fin-platform:** verificado contra uma lista permitida explícita; adicionar curinga reprova o teste.
**Erro comum:** dar permissão ampla "para garantir que funciona", ampliando o raio de explosão de um comprometimento.
**Onde na prática:** marco 06.

### Isolamento de tenant
**Em uma frase:** o time A não cria nem lê recursos do tenant do time B, mesmo usando a mesma API compartilhada.
**No fin-platform:** verificado por teste exaustivo da matriz de autorização, todas as combinações.
**Erro comum:** confiar em convenção de nomenclatura para isolar tenants, sem verificação técnica real.
**Onde na prática:** marco 06.

### Plataforma como alvo
**Em uma frase:** por concentrar poder sobre todas as equipes, a plataforma é um dos alvos mais valiosos da organização.
**No fin-platform:** justifica credencial de menor privilégio, segredo do control plane protegido, e auditoria completa.
**Erro comum:** tratar a segurança da própria plataforma com o mesmo rigor de um serviço comum, subestimando o raio de explosão.
**Onde na prática:** marco 06.

## Operação

### SLO da plataforma
**Em uma frase:** disponibilidade da API, tempo de provisionamento p95 e frescor do catálogo, tratados como SLO de serviço crítico.
**No fin-platform:** calculado do histórico sintético, violado por degradação injetada em teste.
**Erro comum:** tratar a plataforma como infraestrutura "que simplesmente deveria funcionar", sem medir confiabilidade.
**Onde na prática:** marco 07.

### Runbook (da plataforma)
**Em uma frase:** os passos de diagnóstico e ação associados a um alerta específico da plataforma.
**No fin-platform:** todo alerta tem runbook — verificado por lint, nenhum alerta sem o campo preenchido.
**Erro comum:** ter alerta sem runbook, deixando quem está de plantão sem direção na hora do incidente.
**Onde na prática:** marco 07.

### Canário da plataforma
**Em uma frase:** a mesma disciplina de release gradual aplicada à própria API ou template da plataforma.
**No fin-platform:** uma nova versão da API liberada com o decisor de canário, com teste de regressão.
**Erro comum:** promover uma nova versão da API da plataforma sem o mesmo rigor que ela exige de todo mundo.
**Onde na prática:** marco 07.

## Custo

### Showback × chargeback
**Em uma frase:** showback mostra custo sem cobrar; chargeback cobra de fato do orçamento da equipe.
**No fin-platform:** showback usado primeiro para educar, antes de uma eventual transição para chargeback.
**Erro comum:** adotar chargeback sem a maturidade organizacional de orçamento por equipe que ele exige.
**Onde na prática:** marco 08.

### Custo unitário
**Em uma frase:** custo por ambiente, por serviço, por minuto de build, por pedido atendido.
**No fin-platform:** permite comparar eficiência, diferente de olhar só o custo total absoluto.
**Erro comum:** reportar só custo total, sem unitário, perdendo a capacidade de comparar entre times de tamanhos diferentes.
**Onde na prática:** marco 08.

### Custo sem dono
**Em uma frase:** gasto que não pode ser atribuído a nenhum dono específico — deveria aparecer como balde próprio visível.
**No fin-platform:** destacado explicitamente no relatório, com meta de zero, nunca diluído no total.
**Erro comum:** diluir esse custo no total, onde ele passa despercebido e nunca é investigado.
**Onde na prática:** marco 08.

## Adoção

### Funil de adoção
**Em uma frase:** descobriu → experimentou → migrou → ficou — revela onde as equipes desistem.
**No fin-platform:** construído a partir de eventos sintéticos de adoção em `adocao/`.
**Erro comum:** medir só "quantas equipes usam", perdendo a informação de onde no funil elas desistiram.
**Onde na prática:** marco 09.

### Aposentadoria do caminho antigo
**Em uma frase:** bloquear novos usos primeiro, depois migrar o legado existente — nessa ordem.
**No fin-platform:** verificado com relógio falso: novos serviços no caminho antigo são bloqueados após o prazo.
**Erro comum:** migrar o legado antes de bloquear novos usos, prolongando indefinidamente a necessidade dos dois caminhos.
**Onde na prática:** marco 09.

### Comprar × construir a IDP
**Em uma frase:** estudo comparativo e neutro de portal/catálogo e composição de infraestrutura, sem recomendar produto.
**No fin-platform:** aplicando o mesmo framework de TCO de `arquitetura-de-solucoes/04`.
**Erro comum:** amarrar o conteúdo da trilha a uma ferramenta específica que pode mudar de licença ou maturidade.
**Onde na prática:** marco 09.
