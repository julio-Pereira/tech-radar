Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Estrutura

### Estilo arquitetural
**Em uma frase:** um conjunto de regras sobre quem pode depender de quem, não uma estética de diagrama.
**No fin-platform:** `transferir` implementado em camadas, hexagonal e *vertical slice* — o comportamento não muda, o grafo de dependências sim.
**Erro comum:** escolher um estilo pela moda, sem nomear o atributo de qualidade que ele deveria proteger.
**Onde na prática:** marco 01.

### Camada (arquitetura em camadas)
**Em uma frase:** divisão horizontal por responsabilidade técnica (apresentação, aplicação, domínio, dados).
**No fin-platform:** o estilo default do `transferir` antes de reescrito em hexagonal e *vertical slice*.
**Erro comum:** deixar uma camada virar passagem pura, pulada na prática até perder significado.
**Onde na prática:** marco 01.

### Porta
**Em uma frase:** uma interface que o núcleo define — de entrada (como é chamado) ou de saída (o que ele chama).
**No fin-platform:** `RepositorioDeContas` como porta de saída, implementada por um adaptador em memória e um em SQL.
**Erro comum:** criar uma porta para toda dependência por reflexo, sem mais de um adaptador real esperado.
**Onde na prática:** marco 04.

### Adaptador
**Em uma frase:** a implementação de uma porta, de fora para dentro, que o núcleo nunca importa.
**No fin-platform:** o adaptador SQL e o adaptador em memória, ambos passando no mesmo teste de contrato da porta.
**Erro comum:** deixar um adaptador vazar seu formato interno (DTO do banco) para dentro do núcleo.
**Onde na prática:** marco 04.

### Núcleo (domínio)
**Em uma frase:** a parte do sistema que não importa framework, banco nem biblioteca de transporte.
**No fin-platform:** `Transferencia` e `Money`, testáveis sem subir nenhuma infraestrutura.
**Erro comum:** um import de driver de banco "só essa vez" dentro do pacote do núcleo.
**Onde na prática:** marco 04.

### Regra de dependência
**Em uma frase:** a direção permitida de importação entre módulos, verificada por teste de arquitetura.
**No fin-platform:** "o domínio nunca importa infraestrutura", verificada por ArchUnit em Java e `go list -deps` em Go.
**Erro comum:** ter a regra escrita num documento, mas nenhum teste que a faça falhar de propósito.
**Onde na prática:** marcos 01 e 04.

### Vertical slice
**Em uma frase:** organizar o código por funcionalidade, não por camada técnica.
**No fin-platform:** uma pasta só para `transferir`, com entrada, regra e saída juntas.
**Erro comum:** duplicar lógica entre slices parecidos sem perceber que já virou um padrão repetido.
**Onde na prática:** marco 01.

### Sinkhole
**Em uma frase:** uma chamada que atravessa várias camadas sem fazer nada além de repassar o parâmetro.
**No fin-platform:** um controlador que só chama um serviço que só chama um repositório, sem nenhuma lógica no meio.
**Erro comum:** adicionar uma camada "por padrão" em todo fluxo, mesmo quando ela não decide nada.
**Onde na prática:** marco 01.

### Monolito modular
**Em uma frase:** um único processo de deploy com fronteiras internas fortes entre módulos.
**No fin-platform:** o `fin-platform` inteiro, se decidido por `system-design/03`, com os módulos medidos por este trilha.
**Erro comum:** confundir módulo bem separado com serviço distribuído — a fronteira de deploy e a de módulo são decisões diferentes.
**Onde na prática:** marco 01.

## Qualidade

### Atributo de qualidade
**Em uma frase:** uma propriedade do sistema (desempenho, segurança, modificabilidade) que só vira decisão com cenário e medida.
**No fin-platform:** "escalável" reescrito como "sob 3× o tráfego normal, p99 abaixo de 200ms sem intervenção manual".
**Erro comum:** tratar uma lista genérica de atributos como se já fosse uma decisão de arquitetura.
**Onde na prática:** marco 02.

### Cenário (de atributo de qualidade)
**Em uma frase:** fonte, estímulo, ambiente, artefato, resposta e medida de resposta — os seis campos que tornam um atributo verificável.
**No fin-platform:** `qualidade/cenarios.yaml`, com 6 cenários completos do `fin-platform`.
**Erro comum:** escrever um cenário sem a medida de resposta — sem ela, não é diferente de um desejo vago.
**Onde na prática:** marco 02.

### Medida de resposta
**Em uma frase:** o número ou a relação verificável que diz se um cenário de qualidade foi atingido.
**No fin-platform:** "no máximo N arquivos tocados" para o cenário de modificabilidade do `transferir`.
**Erro comum:** aceitar uma medida que não pode ser verificada automaticamente, só "sentida".
**Onde na prática:** marco 02.

### Árvore de utilidade
**Em uma frase:** priorização de cenários por importância para o negócio × dificuldade de atingir.
**No fin-platform:** decide quais dos 6 cenários merecem rigor arquitetural e quais podem esperar.
**Erro comum:** tratar todo cenário levantado com o mesmo nível de atenção, sem priorizar.
**Onde na prática:** marco 02.

### Tática (de atributo de qualidade)
**Em uma frase:** um meio conhecido de atingir um atributo — cache para desempenho, redundância para disponibilidade.
**No fin-platform:** publicar evento de domínio como tática para auditabilidade.
**Erro comum:** aplicar uma tática sem nomear o atributo que ela piora em troca.
**Onde na prática:** marco 02.

### Ponto de sensibilidade
**Em uma frase:** um parâmetro ao qual uma medida de resposta reage de forma desproporcional.
**No fin-platform:** o tamanho do *connection pool* afetando a latência sob carga de forma não linear.
**Erro comum:** ajustar um parâmetro sensível sem medir o efeito antes e depois.
**Onde na prática:** marco 02.

### Ponto de trade-off
**Em uma frase:** um parâmetro que afeta mais de um atributo de qualidade, em direções opostas.
**No fin-platform:** publicar evento a cada mudança de estado ajuda auditabilidade e complica modificabilidade.
**Erro comum:** aplicar a tática sem nomear os dois atributos em tensão — sem isso, o custo fica invisível.
**Onde na prática:** marco 02.

### Modificabilidade medida
**Em uma frase:** quantos arquivos ou módulos uma mudança típica toca, medido por script, não por impressão.
**No fin-platform:** adicionar um novo meio de pagamento, contado nos três estilos do marco 01.
**Erro comum:** comparar esse número como nota absoluta em vez de relação entre estilos ou ao longo do tempo.
**Onde na prática:** marco 02.

## DDD tático

### Entidade
**Em uma frase:** um objeto com identidade que persiste ao longo do tempo, mesmo com atributos mudando.
**No fin-platform:** uma `Conta`, a mesma antes e depois de qualquer depósito.
**Erro comum:** comparar entidades por valor de atributo em vez de por identidade.
**Onde na prática:** marco 03.

### Value object
**Em uma frase:** um objeto sem identidade própria, definido inteiramente pelo seu valor.
**No fin-platform:** `Money`, imutável, em centavos inteiros, com a moeda como parte do valor.
**Erro comum:** representar dinheiro em ponto flutuante, acumulando erro de arredondamento garantido.
**Onde na prática:** marco 03.

### Agregado
**Em uma frase:** um grupo de objetos tratado como unidade de consistência, cuja raiz é o único ponto de entrada.
**No fin-platform:** `Transferencia`, onde nenhuma sequência de chamadas públicas deixa o estado inválido.
**Erro comum:** um setter que muda o estado sem passar pela validação da raiz — não é agregado, é um saco de dados.
**Onde na prática:** marco 03.

### Raiz do agregado
**Em uma frase:** o único ponto de entrada de um agregado, responsável por garantir a invariante.
**No fin-platform:** `Transferencia` é a raiz; débito e crédito só mudam de estado através dela.
**Erro comum:** expor um objeto interno do agregado para mutação direta de fora.
**Onde na prática:** marco 03.

### Referência por identidade
**Em uma frase:** um agregado referencia outro só pelo id, nunca guardando o objeto carregado em memória.
**No fin-platform:** `Transferencia` guarda `contaId`, nunca o objeto `Conta` inteiro.
**Erro comum:** carregar um agregado inteiro "de brinde" dentro de outro, criando carregamento em cascata.
**Onde na prática:** marco 03.

### Domain service
**Em uma frase:** uma função do domínio para regras que não cabem numa única entidade ou value object.
**No fin-platform:** um cálculo que envolve múltiplos agregados ao mesmo tempo.
**Erro comum:** um domain service gigante com conhecimento profundo do estado interno de cada agregado — o modelo anêmico com outro nome.
**Onde na prática:** marco 03.

### Repositório
**Em uma frase:** uma coleção de agregados completos — carrega e salva o agregado inteiro, nunca uma fração.
**No fin-platform:** o repositório de `Transferencia`, onde ida e volta preserva a igualdade do agregado.
**Erro comum:** salvar só parte de um agregado, abrindo uma via de estado inconsistente invisível ao teste do agregado isolado.
**Onde na prática:** marco 03.

### Evento de domínio
**Em uma frase:** um fato relevante que o agregado coleta durante a operação e publica só depois de confirmar a invariante.
**No fin-platform:** "transferência concluída", publicado só depois do débito e crédito serem aplicados com sucesso.
**Erro comum:** publicar o evento antes de a operação confirmar, anunciando um estado que pode nunca ter existido de fato.
**Onde na prática:** marco 03.

### Modelo anêmico
**Em uma frase:** um objeto com só getters/setters, com toda regra de negócio morando fora, em serviços.
**No fin-platform:** a versão de `Transferencia` usada para mostrar, de propósito, onde a regra "vazou" do agregado.
**Erro comum:** achar que separar dados de comportamento é sempre "mais limpo", mesmo quando a invariante depende do comportamento.
**Onde na prática:** marco 03.

## Hexagonal

### Teste de contrato da porta
**Em uma frase:** a mesma suíte de testes rodando contra todos os adaptadores de uma porta.
**No fin-platform:** o teste de `RepositorioDeContas` rodando igual contra o adaptador em memória e o SQL.
**Erro comum:** adaptar o teste para cada adaptador, perdendo a garantia de que eles são de fato intercambiáveis.
**Onde na prática:** marco 04.

### Inversão de dependência
**Em uma frase:** o núcleo declara a interface de que precisa; algo de fora a implementa e injeta.
**No fin-platform:** `Transferencia` declarando a porta de persistência, sem conhecer a implementação SQL.
**Erro comum:** o núcleo instanciar diretamente a implementação concreta em vez de receber a interface injetada.
**Onde na prática:** marco 04.

### DTO (objeto de transferência de dados)
**Em uma frase:** um objeto que atravessa a porta de entrada, mapeado para o objeto de domínio, nunca o mesmo objeto.
**No fin-platform:** o payload HTTP de `transferir`, mapeado para o agregado `Transferencia` no adaptador.
**Erro comum:** deixar o DTO vazar para dentro do núcleo, ou o agregado de domínio vazar para fora como resposta.
**Onde na prática:** marco 04.

### ACL como adaptador
**Em uma frase:** a camada anticorrupção de um sistema legado é, estruturalmente, só mais um adaptador.
**No fin-platform:** a ACL do core bancário, implementando a mesma porta de saída que qualquer outro adaptador.
**Erro comum:** tratar ACL como um conceito arquitetural separado em vez de aplicar a mesma disciplina de porta e adaptador.
**Onde na prática:** marco 04.

## Acoplamento

### Instabilidade (I = Ce / (Ca + Ce))
**Em uma frase:** a proporção entre dependências de saída e o total de dependências de um módulo.
**No fin-platform:** um módulo utilitário estável (I perto de 0) versus um módulo de aplicação instável (I perto de 1).
**Erro comum:** esperar que todo módulo tenha instabilidade baixa — módulos concretos deveriam ser instáveis por desenho.
**Onde na prática:** marco 05.

### Ciclo de dependência
**Em uma frase:** dois módulos que dependem um do outro, direta ou indiretamente.
**No fin-platform:** `pagamentos` importando `relatorios` que importa `pagamentos` de volta.
**Erro comum:** achar que o ciclo "não é problema" porque o código compila e funciona.
**Onde na prática:** marco 05.

### Connascence
**Em uma frase:** vocabulário para o tipo de força de um acoplamento — de nome, tipo, posição, algoritmo, temporal, de dados.
**No fin-platform:** acoplamento de tipo entre produtor e consumidor de um schema Kafka, versus acoplamento temporal numa ordem de chamadas implícita.
**Erro comum:** tratar "está tudo acoplado" como suficiente, sem distinguir o acoplamento barato do caro.
**Onde na prática:** marco 05.

### Fitness function
**Em uma frase:** uma métrica de arquitetura verificada automaticamente, com consequência real se violada.
**No fin-platform:** o script que calcula ciclos e instabilidade a cada *pull request*.
**Erro comum:** calcular a métrica e só exibir num painel, sem nenhuma consequência se ela piorar.
**Onde na prática:** marco 05.

### Ratchet
**Em uma frase:** uma linha de base versionada que só pode melhorar — o CI falha se a métrica piorar.
**No fin-platform:** o número de ciclos do `fin-structure`, que nunca pode subir entre commits.
**Erro comum:** definir um limite fixo para o repositório inteiro, punindo módulo novo pela dívida de módulo antigo.
**Onde na prática:** marco 05.

### Princípio das dependências estáveis
**Em uma frase:** um módulo estável não deveria depender de um módulo menos estável que ele.
**No fin-platform:** o núcleo do ledger (estável) não deveria depender de um módulo de relatórios (instável).
**Erro comum:** não perceber a violação porque ela não gera erro de compilação, só fragilidade silenciosa.
**Onde na prática:** marco 05.

## Dívida

### Dívida técnica
**Em uma frase:** um problema local — nome ruim, método confuso — caro de entender, barato de isolar.
**No fin-platform:** uma função com nome genérico `processar()` que faz cinco coisas diferentes.
**Erro comum:** confundir dívida técnica (local) com dívida arquitetural (estrutural) e tentar corrigir a segunda localmente.
**Onde na prática:** marco 06.

### Dívida arquitetural
**Em uma frase:** uma falha estrutural que torna toda mudança numa região do código mais cara, não só a próxima.
**No fin-platform:** o `legacy-wallet`, com regra de saldo espalhada entre controladores e SQL direto.
**Erro comum:** registrar a dívida com um valor em dinheiro inventado, em vez de juros qualitativos verificáveis.
**Onde na prática:** marco 06.

### Golden master
**Em uma frase:** um teste de caracterização que grava a saída atual do sistema, sem julgar se ela está certa.
**No fin-platform:** a saída do `legacy-wallet` para um conjunto fixo de entradas, gravada antes de qualquer refatoração.
**Erro comum:** atualizar o golden master sem querer, mascarando um bug introduzido pela refatoração.
**Onde na prática:** marco 06.

### Costura (seam)
**Em uma frase:** um ponto no código legado onde se pode alterar comportamento sem editar o código ali.
**No fin-platform:** uma interface introduzida sobre uma chamada direta do `legacy-wallet`, sem mudar a lógica.
**Erro comum:** não encontrar nenhuma costura num código muito acoplado, e por isso precisar criar uma primeiro.
**Onde na prática:** marco 06.

### Branch by abstraction
**Em uma frase:** substituir uma implementação grande introduzindo uma abstração, construindo a nova atrás dela, sem parar a entrega.
**No fin-platform:** trocar o motor de cálculo de saldo do `legacy-wallet` sem um *feature freeze*.
**Erro comum:** remover a implementação antiga antes de a nova estar completamente validada atrás da abstração.
**Onde na prática:** marco 06.

### Método Mikado
**Em uma frase:** documentar como grafo os pré-requisitos de uma refatoração grande, atacando-os antes da mudança original.
**No fin-platform:** descobrir, ao tentar extrair um módulo do `legacy-wallet`, três pré-requisitos antes não percebidos.
**Erro comum:** tentar a refatoração grande direto, sem mapear os pré-requisitos, e travar no meio sem saber por quê.
**Onde na prática:** marco 06.

## Documentação

### C4 como código
**Em uma frase:** um modelo de arquitetura escrito em texto versionado, comparável programaticamente com o código real.
**No fin-platform:** `modelo/` do `fin-structure`, gerando diagramas a partir do texto, não desenhados à mão.
**Erro comum:** manter o diagrama numa ferramenta visual proprietária, sem nenhuma comparação automática com o código.
**Onde na prática:** marco 07.

### Drift (modelo × código)
**Em uma frase:** a divergência entre o que o modelo de arquitetura afirma e o que o código realmente faz.
**No fin-platform:** o diagrama que diz "`pagamentos` só fala com `ledger`", e o grafo real mostrando uma chamada a `relatorios`.
**Erro comum:** descobrir o drift por acidente, meses depois, em vez de detectá-lo automaticamente a cada *pull request*.
**Onde na prática:** marco 07.

### arc42
**Em uma frase:** um template de documentação de arquitetura, usado aqui como roteiro, não formulário obrigatório inteiro.
**No fin-platform:** as seções do arc42 escolhidas conforme o que realmente vale documentar no `fin-structure`.
**Erro comum:** preencher todas as seções "para estar completo", sem que ninguém leia ou mantenha o resultado.
**Onde na prática:** marco 07.

### ADR (registro de decisão arquitetural)
**Em uma frase:** um documento curto com contexto, decisão, alternativas e gatilho de reversão para uma decisão difícil de reverter.
**No fin-platform:** a ADR que escolheu hexagonal para `transferir`, com o gatilho que faria reconsiderar.
**Erro comum:** uma ADR "substituída" sem link para a ADR que a substituiu, quebrando a rastreabilidade do log.
**Onde na prática:** marco 07.

### Gatilho de reversão
**Em uma frase:** a condição concreta que faria uma decisão arquitetural ser reconsiderada.
**No fin-platform:** "se o volume de transferências triplicar sem o módulo escalar, revisar a decisão de agregado único".
**Erro comum:** escrever uma ADR sem gatilho de reversão, tornando a decisão permanente por inércia, não por mérito.
**Onde na prática:** marco 07.

### Documentação viva
**Em uma frase:** documentação gerada de testes e do código real, recalculada a cada execução, em vez de escrita e esquecida.
**No fin-platform:** o contrato de uma porta, documentado pelo próprio teste de contrato que a verifica.
**Erro comum:** confiar em documentação escrita à mão para algo que já tem um teste automatizado dizendo a mesma coisa.
**Onde na prática:** marco 07.
