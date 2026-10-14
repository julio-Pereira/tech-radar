Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum associado
e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Papel

### Tech Lead
**Em uma frase:** quem lidera tecnicamente dentro de um time, com escopo de problemas bem
definidos e horizonte de semanas.
**No fin-platform:** o Tech Lead do Time Pix decide a arquitetura interna do serviço, mas não a
estratégia entre equipes.
**Erro comum:** tratar Tech Lead como sinônimo de Staff — a diferença real é escopo, ambiguidade e
horizonte, não nível hierárquico.
**Onde na prática:** marco 01.

### Staff
**Em uma frase:** papel cujo escopo cruza times ou toca a organização inteira, recebendo problemas
sem forma definida e devolvendo escopo.
**No fin-platform:** a pessoa que recebe "o checkout está lento" e devolve um diagnóstico com
sistemas, causas e um plano.
**Erro comum:** achar que Staff é definido pelo tamanho do código que a pessoa escreve, não pelo
tamanho do problema que ela resolve.
**Onde na prática:** marco 01.

### Principal
**Em uma frase:** papel que opera no escopo de uma organização inteira, com horizonte de ano.
**No fin-platform:** decide a direção técnica de longo prazo entre várias áreas do `fin-platform`,
não só de um domínio.
**Erro comum:** tratar Principal como "Staff mais experiente", ignorando que o escopo (organização
inteira) é qualitativamente diferente.
**Onde na prática:** marco 01.

### Arquiteto
**Em uma frase:** um dos arquétipos de Staff, focado na coerência estrutural entre sistemas.
**No fin-platform:** garante que o ledger, o gateway Pix e a plataforma de dados têm contratos
consistentes entre si.
**Erro comum:** achar que "arquiteto" é sempre um cargo separado — em muitas organizações é um
arquétipo que um Staff assume, não um título formal.
**Onde na prática:** marco 01.

### Arquétipo (de Staff)
**Em uma frase:** um dos quatro padrões de atuação de um Staff — líder técnico, arquiteto,
resolvedor, braço direito.
**No fin-platform:** o "resolvedor" entra na crise do Pix sem ser dono fixo da área; o "braço
direito" cobre o que a agenda do diretor de engenharia não alcança.
**Erro comum:** tentar ser os quatro arquétipos ao mesmo tempo, em vez de escolher o que a
organização precisa agora.
**Onde na prática:** marco 01.

### Escopo
**Em uma frase:** a declaração explícita de quais sistemas, equipes e horizonte de tempo uma
pessoa decide.
**No fin-platform:** o escopo do Tech Lead do Time Pix inclui o serviço de iniciação de pagamento,
não o ledger inteiro.
**Erro comum:** deixar o escopo implícito — a primeira vez que fica claro é quando algo falha e
ninguém sabe de quem era a decisão.
**Onde na prática:** marco 01.

### *Glue work*
**Em uma frase:** trabalho de coordenação, documentação e resolução de atrito que não aparece como
entrega visível.
**No fin-platform:** preparar a reunião entre o time de dados e o time de pagamentos que ninguém
mais quer organizar.
**Erro comum:** fazer só *glue work*, de forma permanente e não declarada, achando que ele por si
só constrói uma narrativa de impacto.
**Onde na prática:** marco 01.

### Contrato de papel
**Em uma frase:** acordo curto e explícito com quem avalia você sobre o que é seu decidir, o que
exige consulta e o que não é seu.
**No fin-platform:** o contrato do Staff de conciliação declara que decisões de schema do ledger
não são dele, mesmo que ele as implemente.
**Erro comum:** assumir que o contrato de papel é óbvio o suficiente para não precisar ser
escrito.
**Onde na prática:** marco 01.

### Escada de carreira
**Em uma frase:** o documento (geralmente já existente na organização) que descreve as expectativas
de cada nível.
**No fin-platform:** lida com atenção, revela o vocabulário (escopo, ambiguidade, influência) que
o comitê de promoção usa.
**Erro comum:** nunca ler a escada com atenção e descobrir as expectativas implícitas só quando a
promoção é negada.
**Onde na prática:** marco 01, retomado no 13.

## Diagnóstico

### Lei de Conway
**Em uma frase:** sistemas tendem a espelhar a estrutura de comunicação de quem os constrói.
**No fin-platform:** três times que não se falam produzem três módulos com integração frágil entre
eles.
**Erro comum:** tratar a lei como regra absoluta, ignorando que ela é uma tendência observada, não
uma lei física.
**Onde na prática:** marco 02, retomado no 05.

### Fluxo de valor
**Em uma frase:** o caminho completo de uma unidade de trabalho da ideia à produção, por todas as
etapas.
**No fin-platform:** da especificação da funcionalidade de conciliação até ela estar em produção,
passando por revisão e aprovação de mudança.
**Erro comum:** mapear só a etapa onde o seu time trabalha, perdendo o gargalo que está em outra
etapa.
**Onde na prática:** marco 02.

### Tempo de ciclo
**Em uma frase:** quanto tempo um item de trabalho leva do início ao fim.
**No fin-platform:** o tempo entre uma tarefa de conciliação entrar em progresso e ser implantada
em produção.
**Erro comum:** confundir tempo de ciclo com tempo total desde a criação do item (que inclui tempo
na fila, não em progresso).
**Onde na prática:** marco 02.

### WIP (*work in progress*)
**Em uma frase:** quantos itens de trabalho estão em andamento ao mesmo tempo.
**No fin-platform:** o Time Pix com WIP alto tem muitas tarefas abertas simultaneamente, o que
geralmente aumenta o tempo de ciclo de cada uma.
**Erro comum:** achar que mais WIP significa mais produtividade — geralmente é o oposto.
**Onde na prática:** marco 02.

### *Throughput*
**Em uma frase:** quantos itens de trabalho terminam por unidade de tempo.
**No fin-platform:** o número de funcionalidades do Time Pix que chegam a produção por semana.
**Erro comum:** otimizar *throughput* de uma etapa que não é o gargalo, sem efeito no sistema
inteiro.
**Onde na prática:** marco 02.

### Idade do trabalho
**Em uma frase:** há quanto tempo um item em progresso está parado na etapa atual.
**No fin-platform:** uma tarefa de conciliação com idade acima do percentil 85 do histórico é
sinalizada como "envelhecida".
**Erro comum:** olhar só a média de tempo de ciclo e não ver os itens parados há muito mais tempo
que a média.
**Onde na prática:** marco 02.

### Lei de Little
**Em uma frase:** relação (L = λ·W) entre WIP, *throughput* e tempo de ciclo, usada como
verificação de sanidade de medições de fluxo.
**No fin-platform:** se o tempo de ciclo medido não bate com o previsto pela Lei de Little a partir
do WIP e do *throughput*, alguma medição está definida de forma inconsistente.
**Erro comum:** tratar a Lei de Little como ferramenta de previsão direta, não como checagem de
consistência das outras três métricas.
**Onde na prática:** marco 02.

### DORA
**Em uma frase:** conjunto de quatro métricas (frequência de implantação, *lead time*, taxa de
falha de mudança, tempo de recuperação) associadas a desempenho de entrega de software.
**No fin-platform:** calculadas a partir dos registros de *deploy* e incidente do Time Pix,
**conferir** a edição e as definições vigentes do relatório.
**Erro comum:** calcular DORA por pessoa, em vez de por time — a métrica nunca é individual.
**Onde na prática:** marco 02.

### SPACE
**Em uma frase:** *framework* que argumenta que produtividade de engenharia precisa de várias
dimensões (satisfação, atividade, colaboração, eficiência, desempenho) vistas juntas, não uma só.
**No fin-platform:** usado para explicar por que otimizar só "número de *commits*" piora outras
dimensões da produtividade real.
**Erro comum:** tratar SPACE como substituto de DORA — são complementares, não concorrentes.
**Onde na prática:** marco 02.

### Efeito Goodhart
**Em uma frase:** quando uma medida vira meta explícita, ela deixa de ser uma boa medida.
**No fin-platform:** medir "número de *commits* por pessoa" como meta faz o número subir sem que a
produtividade real mude.
**Erro comum:** achar que o problema é a métrica em si, quando o problema é transformá-la em meta
de pessoa.
**Onde na prática:** marco 02, retomado no 12.

### Gargalo
**Em uma frase:** a etapa do fluxo que limita a velocidade do sistema inteiro.
**No fin-platform:** no Time Pix, o gargalo está na etapa de aprovação de mudança, não na
implementação.
**Erro comum:** otimizar uma etapa que não é o gargalo — não acelera nada, só desloca a fila.
**Onde na prática:** marco 02.

### Ronda de escuta
**Em uma frase:** protocolo curto de entrevistas individuais com perguntas abertas, usado para
diagnóstico qualitativo.
**No fin-platform:** revela que o atraso percebido como "falta de gente" é, na verdade, fila de
aprovação — depois de cruzado com o dado de fluxo.
**Erro comum:** confiar só na ronda de escuta sem triangular com os números do fluxo, ou vice-versa.
**Onde na prática:** marco 02.

## Estratégia

### Núcleo da estratégia
**Em uma frase:** diagnóstico, política orientadora e ações coordenadas, nessa ordem — a estrutura
mínima de uma estratégia real.
**No fin-platform:** a estratégia do `fin-platform` parte do diagnóstico do marco 02 e termina em
ações com dono e critério de sucesso.
**Erro comum:** escrever ações sem diagnóstico nem política — vira uma lista de projetos paralelos
sem coerência entre si.
**Onde na prática:** marco 03.

### Política orientadora
**Em uma frase:** uma escolha que restringe opções futuras — o que a estratégia de fato decide.
**No fin-platform:** "preferimos isolar o sistema legado atrás de um *anti-corruption layer* a
reescrevê-lo inteiro" é uma política orientadora.
**Erro comum:** escrever uma política vaga o suficiente para que qualquer ação seja compatível com
ela — isso não restringe nada.
**Onde na prática:** marco 03.

### Ações coerentes
**Em uma frase:** passos concretos, com dono e critério de sucesso, que seguem logicamente da
política orientadora.
**No fin-platform:** cada ação da estratégia do `fin-platform` é rastreável até um item específico
do diagnóstico.
**Erro comum:** ações "órfãs" sem relação clara com o diagnóstico ou a política — parecem
estratégicas, mas são projetos isolados.
**Onde na prática:** marco 03.

### Visão
**Em uma frase:** onde se quer chegar, num horizonte longo, sem especificar como.
**No fin-platform:** "ser a plataforma de pagamento mais confiável do mercado" é visão, não
estratégia.
**Erro comum:** confundir visão com estratégia — visão não restringe nenhuma decisão do dia a dia.
**Onde na prática:** marco 03.

### Princípio de engenharia
**Em uma frase:** declaração que escolhe um lado de um trade-off recorrente, válida por mais tempo
que uma estratégia específica.
**No fin-platform:** "preferimos consistência a disponibilidade no ledger" orienta decisões sem
precisar de uma estratégia nova a cada vez.
**Erro comum:** escrever princípios que não escolhem lado nenhum ("buscamos qualidade e
velocidade") — isso não é um princípio, é um desejo.
**Onde na prática:** marco 03.

### Aposta
**Em uma frase:** escolha estratégica que custa alguma coisa se estiver errada.
**No fin-platform:** apostar em isolar o legado em vez de reescrevê-lo é uma aposta — custa tempo
se a decisão se mostrar errada.
**Erro comum:** escrever uma estratégia sem nenhuma aposta real — se nada arrisca, nada está sendo
escolhido.
**Onde na prática:** marco 03.

### Não-objetivo
**Em uma frase:** o que a estratégia explicitamente não perseguirá neste período, mesmo sendo
desejável em abstrato.
**No fin-platform:** "não vamos trocar a fila de eventos neste período" protege o time de se
dispersar atrás de uma melhoria tecnicamente interessante, mas fora do foco atual.
**Erro comum:** omitir os não-objetivos — sem eles, qualquer oportunidade nova parece compatível
com a estratégia.
**Onde na prática:** marco 03.

### Roadmap por resultados
**Em uma frase:** roadmap organizado em torno de resultados desejados (agora/próximo/depois), não
de entregas específicas.
**No fin-platform:** "reduzir o tempo de liquidação" é o resultado; a tática para chegar lá pode
mudar sem reescrever o roadmap inteiro.
**Erro comum:** tratar mudança de tática como falha de planejamento — num roadmap por resultados,
isso é esperado.
**Onde na prática:** marco 03.

## Entrega

### Falácia do planejamento
**Em uma frase:** o viés sistemático de estimar a tarefa atual de forma otimista, mesmo sabendo que
tarefas parecidas no passado levaram mais tempo.
**No fin-platform:** a equipe do Time Pix estima "duas semanas" para a conciliação pela quarta vez
seguida, apesar do histórico mostrar consistentemente mais.
**Erro comum:** achar que "estimar com mais cuidado" resolve a falácia — ela persiste mesmo quando a
pessoa conhece o histórico.
**Onde na prática:** marco 04.

### Monte Carlo (previsão)
**Em uma frase:** simulação que amostra milhares de futuros possíveis a partir do *throughput*
histórico, produzindo uma distribuição de datas de conclusão.
**No fin-platform:** gera o percentil 85 de conclusão do backlog de conciliação com semente fixa e
reprodutível.
**Erro comum:** interpretar a saída como uma data única, em vez de uma distribuição de
probabilidades.
**Onde na prática:** marco 04.

### Percentil (previsão)
**Em uma frase:** o ponto da distribuição simulada abaixo do qual uma dada porcentagem dos futuros
possíveis se encontra — P85 significa 85% de chance de terminar até aquela data.
**No fin-platform:** "P50 em 20 de novembro, P85 em 12 de dezembro" comunica duas datas com
confiança diferente, não uma data única.
**Erro comum:** tratar P50 como "a" previsão e ignorar P85, escondendo metade da incerteza real.
**Onde na prática:** marco 04.

### Faixa de confiança
**Em uma frase:** um intervalo (não um número único) acompanhado da premissa explícita que o
sustenta.
**No fin-platform:** "entre 2 e 5 semanas, assumindo que a integração com risco não muda" é uma
faixa de confiança; "3 semanas" não é.
**Erro comum:** dar uma faixa sem declarar a premissa — a faixa sozinha, sem premissa, ainda esconde
informação relevante.
**Onde na prática:** marco 04, origem em `arquitetura-de-solucoes/08`.

### Caminho crítico
**Em uma frase:** a sequência de tarefas que, somadas, determina a duração mínima de um programa.
**No fin-platform:** no programa de conciliação, o caminho crítico passa pela adequação de
certificado mTLS da equipe de segurança.
**Erro comum:** tratar toda tarefa atrasada como igualmente urgente, ignorando que tarefas fora do
caminho crítico têm folga.
**Onde na prática:** marco 05.

### Folga
**Em uma frase:** quanto uma tarefa fora do caminho crítico pode atrasar sem afetar a data final do
programa.
**No fin-platform:** uma tarefa de documentação com folga de duas semanas não precisa da mesma
urgência que uma tarefa no caminho crítico.
**Erro comum:** tratar folga como "não importa", quando na verdade ela é informação ativa sobre onde
NÃO concentrar atenção de risco.
**Onde na prática:** marco 05.

### RACI / DACI
**Em uma frase:** modelos de direitos de decisão que nomeiam papéis (Responsável/Aprovador/
Consultado/Informado, ou Direcionador/Aprovador/Contribuidor/Informado) por decisão.
**No fin-platform:** o RACI do programa de conciliação declara um único "A" por decisão técnica.
**Erro comum:** ter mais de um "A" (ou "D") na mesma linha — reproduz a ambiguidade que o modelo
deveria eliminar.
**Onde na prática:** marco 05.

### Registro de riscos
**Em uma frase:** lista estruturada de riscos, cada um com probabilidade, impacto, dono, mitigação
e gatilho.
**No fin-platform:** o risco "atraso na certificação mTLS" tem dono (equipe de segurança), gatilho
("certificado não emitido até 15 dias antes do prazo") e mitigação declarados.
**Erro comum:** registrar um risco sem dono — na prática, ninguém cuida dele até virar problema.
**Onde na prática:** marco 05.

### Gatilho (de risco ou decisão)
**Em uma frase:** o sinal observável e específico de que um risco está se materializando, ou de que
uma decisão precisa ser revisada.
**No fin-platform:** "se a previsão P85 ultrapassar a data comprometida" é um gatilho; "se as coisas
piorarem" não é.
**Erro comum:** declarar um gatilho vago demais para ser observado objetivamente.
**Onde na prática:** marcos 05 e 06.

### Status (relatório de programa)
**Em uma frase:** a cor (verde/amarelo/vermelho) de um programa, válida apenas quando acompanhada de
um critério objetivo definido com antecedência.
**No fin-platform:** "vermelho = P85 ultrapassou a data comprometida" é um critério objetivo; "a
equipe está confiante" não é.
**Erro comum:** reportar verde por sentimento, quando o critério objetivo já indicaria vermelho.
**Onde na prática:** marco 05.

### Go/no-go
**Em uma frase:** critério de decisão de lançamento definido com antecedência, não inventado sob
pressão no dia.
**No fin-platform:** o critério de go/no-go do lançamento Pix inclui SLO de disponibilidade e
ausência de incidente crítico aberto.
**Erro comum:** definir o critério de go/no-go na própria reunião de decisão, sob pressão.
**Onde na prática:** marco 05.

## Times

### Conway reverso
**Em uma frase:** desenhar deliberadamente a estrutura de equipes para produzir a arquitetura
desejada, invertendo a observação original da Lei de Conway.
**No fin-platform:** separar o time de conciliação do time de ledger antes de separar o código,
esperando que a arquitetura siga a nova fronteira.
**Erro comum:** esperar que a arquitetura mude sozinha sem mudar a estrutura de comunicação que a
sustenta.
**Onde na prática:** marco 05.

### Topologia de equipe
**Em uma frase:** um dos quatro padrões de equipe de Team Topologies — alinhada ao fluxo,
plataforma, habilitadora, subsistema complicado.
**No fin-platform:** a equipe de plataforma de dados serve outras equipes; a equipe do Time Pix é
alinhada ao fluxo (entrega de ponta a ponta).
**Erro comum:** confundir os quatro tipos, tratando uma equipe de plataforma como se fosse alinhada
ao fluxo (ou vice-versa).
**Onde na prática:** marco 05.

### Carga cognitiva (de equipe)
**Em uma frase:** o quanto de domínio, complexidade técnica e operacional uma equipe consegue
sustentar sem degradar decisão e qualidade.
**No fin-platform:** o Time Pix, ao assumir conciliação além do seu escopo original, ultrapassa a
carga cognitiva sustentável.
**Erro comum:** medir tamanho de equipe só por número de pessoas, ignorando a complexidade que cada
uma precisa sustentar.
**Onde na prática:** marco 05.

### Fronteira de propriedade
**Em uma frase:** a declaração explícita de qual sistema, decisão ou interface pertence a qual
equipe.
**No fin-platform:** a proposta de divisão do Time Pix declara qual equipe é dona do serviço de
iniciação e qual é dona da conciliação.
**Erro comum:** dividir um time sem declarar fronteiras — a divisão aumenta dependências cruzadas em
vez de reduzi-las.
**Onde na prática:** marco 05.

### Reorganização
**Em uma frase:** mudança de estrutura de equipes, com custos reais e frequentemente subestimados
(contexto perdido, relações desfeitas, produtividade reduzida por meses).
**No fin-platform:** dividir o Time Pix em dois reduz carga cognitiva, mas custa meses de
produtividade até as novas equipes se estabilizarem.
**Erro comum:** tratar reorganização como mudança "de graça" que só traz benefício, sem custo.
**Onde na prática:** marco 05.

## Decisão

### Porta de ida e volta
**Em uma frase:** decisão reversível a baixo custo — merece velocidade, não processo pesado.
**No fin-platform:** escolher a biblioteca de *logging* interna é, geralmente, uma porta de ida e
volta.
**Erro comum:** aplicar o mesmo processo de aprovação de uma porta sem volta a uma decisão
facilmente reversível.
**Onde na prática:** marco 06.

### Porta sem volta
**Em uma frase:** decisão irreversível ou muito cara de reverter — merece mais deliberação e
cautela.
**No fin-platform:** migrar o schema do ledger para um novo modelo de dados é, tipicamente, uma
porta sem volta.
**Erro comum:** decidir uma porta sem volta com a mesma rapidez informal de uma porta de ida e
volta.
**Onde na prática:** marco 06.

### Calibração (de previsão)
**Em uma frase:** a prática de dar probabilidades explícitas a previsões e medir, ao longo do
tempo, se elas batem com a realidade.
**No fin-platform:** registrar "70% de confiança" numa previsão de decisão e, meses depois, checar
se decisões com 70% de confiança se confirmaram em torno de 70% das vezes.
**Erro comum:** nunca registrar a probabilidade explícita — sem isso, não há como medir calibração
depois.
**Onde na prática:** marco 06.

### Brier score
**Em uma frase:** métrica que quantifica a qualidade da calibração de um conjunto de previsões —
quanto mais perto de zero, melhor.
**No fin-platform:** o Brier score das 40 decisões registradas do Time Pix revela se a equipe tende
a ser excessivamente confiante ou insegura.
**Erro comum:** interpretar um Brier score de 0,25 (sempre prever 50%) como bom, quando na verdade
sinaliza previsão pouco informativa.
**Onde na prática:** marco 06.

### Gatilho de reversão
**Em uma frase:** o sinal específico registrado numa decisão que, se aparecer, significa "reveja
esta decisão agora".
**No fin-platform:** "se o custo de operação passar de X, revertemos para a solução de mercado" é um
gatilho de reversão.
**Erro comum:** registrar uma decisão sem gatilho — sem ele, a decisão nunca é formalmente
reavaliada.
**Onde na prática:** marco 06, origem em `arquitetura-de-software/07`.

### *Disagree and commit*
**Em uma frase:** comprometer-se totalmente com a execução de uma decisão mesmo discordando dela,
depois de ter sido genuinamente ouvido.
**No fin-platform:** a pessoa que defendia comprar a solução de mercado se compromete com a decisão
de construir, depois de sua objeção ter sido considerada.
**Erro comum:** usar "disagree and commit" para calar discordância que nunca foi de fato ouvida.
**Onde na prática:** marco 06.

### Custo afundado
**Em uma frase:** viés de continuar investindo numa decisão ruim porque já se investiu nela, em vez
de avaliar só o que falta.
**No fin-platform:** continuar construindo a solução interna de conciliação só porque "já gastamos
três meses nisso", ignorando que comprar agora seria mais barato daqui para frente.
**Erro comum:** confundir "já investimos muito" com "vale a pena continuar investindo" — são
perguntas diferentes.
**Onde na prática:** marco 06.
