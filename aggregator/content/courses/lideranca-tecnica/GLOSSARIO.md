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
