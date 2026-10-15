Um verbete por termo: definição em uma frase, o exemplo no `fin-books`, o erro comum associado e
o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Modelo

### Razão (*ledger*)
**Em uma frase:** a visão de saldos organizada por conta, derivada do diário de lançamentos.
**No fin-books:** o `ledger/` calcula o razão a partir do `journal` imutável mantido no
PostgreSQL.
**Erro comum:** tratar o razão como a fonte de verdade — a fonte de verdade é o diário; o razão é
uma consulta sobre ele.
**Onde na prática:** marco 01.

### Diário (*journal*)
**Em uma frase:** a sequência cronológica e imutável de todos os lançamentos.
**No fin-books:** o diário é *append-only*, imposto por permissão real no banco, não só por
convenção de código.
**Erro comum:** confundir diário com razão — o diário é o histórico completo; o razão é a visão
por conta derivada dele.
**Onde na prática:** marco 01, retomado no 03.

### Conta
**Em uma frase:** a unidade do plano de contas que acumula lançamentos de uma categoria (ativo,
passivo, receita, despesa, patrimônio).
**No fin-books:** cada conta pertence a exatamente uma categoria, que determina sua conta normal.
**Erro comum:** tratar toda conta como equivalente — a categoria determina o sinal esperado do
saldo.
**Onde na prática:** marco 01.

### Plano de contas
**Em uma frase:** a hierarquia de contas, incluindo contas de cliente e contas internas
(compensação, *suspense*, tarifas).
**No fin-books:** o plano de contas é um parâmetro configurável, nunca hardcoded — **conferir** o
plano vigente com contabilidade.
**Erro comum:** implementar um plano de contas fixo no código, em vez de tratá-lo como
configuração testada.
**Onde na prática:** marco 01.

### Lançamento
**Em uma frase:** um registro contábil composto por duas ou mais pernas que, juntas, balanceiam
(soma de débitos igual à soma de créditos).
**No fin-books:** `Postar(lançamento)` rejeita qualquer lançamento cuja soma de débitos difira da
soma de créditos.
**Erro comum:** achar que um lançamento sempre tem exatamente duas pernas — pode ter várias,
desde que a soma balanceie.
**Onde na prática:** marco 01.

### Perna
**Em uma frase:** um dos componentes de um lançamento, com uma direção (débito ou crédito) e um
valor.
**No fin-books:** um lançamento com taxa tem três pernas: pagador, recebedor e conta de tarifa.
**Erro comum:** achar que uma perna isolada, sem o lançamento balanceado completo, pode ser
válida.
**Onde na prática:** marco 01.

### Débito
**Em uma frase:** uma das duas direções de um lançamento — o efeito sobre o saldo depende da
categoria da conta.
**No fin-books:** débito aumenta uma conta de ativo ou despesa; diminui passivo, patrimônio ou
receita.
**Erro comum:** tratar débito como sinônimo universal de "diminuir" — o efeito depende da
categoria da conta.
**Onde na prática:** marco 01.

### Crédito
**Em uma frase:** a outra direção de um lançamento — o efeito sobre o saldo depende da categoria
da conta.
**No fin-books:** crédito aumenta uma conta de passivo, patrimônio ou receita; diminui ativo ou
despesa.
**Erro comum:** tratar crédito como sinônimo universal de "aumentar" — o efeito depende da
categoria da conta.
**Onde na prática:** marco 01.

### Partida dobrada
**Em uma frase:** a regra de que todo lançamento tem pernas de débito e crédito que se igualam em
soma.
**No fin-books:** a propriedade Σ débitos = Σ créditos é verificada sobre qualquer sequência
aleatória de lançamentos.
**Erro comum:** achar que a partida dobrada é uma convenção opcional — é a restrição que impede
dinheiro de aparecer ou desaparecer.
**Onde na prática:** marco 01.

### Equação contábil
**Em uma frase:** ativo = passivo + patrimônio, mantida verdadeira em todo instante pela partida
dobrada.
**No fin-books:** cada lançamento válido preserva a equação, por construção.
**Erro comum:** tratar a equação contábil como um relatório calculado periodicamente, e não como
uma invariante mantida a cada lançamento.
**Onde na prática:** marco 01.

### Conta interna
**Em uma frase:** uma conta do plano de contas que não representa saldo de cliente — compensação,
*suspense*, receita de tarifas, despesa operacional.
**No fin-books:** contas internas nunca aparecem em consultas de saldo voltadas ao cliente.
**Erro comum:** misturar conta interna e conta de cliente na mesma consulta de saldo — um bug
estruturalmente grave.
**Onde na prática:** marco 02.

### Conta de controle
**Em uma frase:** uma conta interna cujo saldo deveria ser igual à soma dos saldos de todas as
contas de cliente correspondentes.
**No fin-books:** `make audit` verifica que as contas de controle igualam a soma dos clientes, por
moeda.
**Erro comum:** não ter nenhuma conta de controle, perdendo a verificação cruzada mais simples de
integridade do ledger.
**Onde na prática:** marco 02, retomado no 10.

### Subrazão
**Em uma frase:** um agrupamento de contas de detalhe cujo total é refletido numa única conta de
controle no razão geral.
**No fin-books:** o subrazão de clientes agrega milhares de contas individuais sob uma única
conta de controle.
**Erro comum:** confundir subrazão com conta interna — subrazão é uma técnica de agregação, não
uma categoria de conta.
**Onde na prática:** marco 02.

## Saldos

### Saldo contábil
**Em uma frase:** o saldo efetivo que o ledger de fato registrou, sem considerar reservas ou
projeções.
**No fin-books:** calculado como a soma de todos os lançamentos liquidados de uma conta.
**Erro comum:** tratar saldo contábil como "o" saldo único — ele é um entre quatro tipos
relevantes.
**Onde na prática:** marco 02.

### Saldo disponível
**Em uma frase:** o saldo contábil menos reservas ativas, mais qualquer limite de crédito
configurado como política.
**No fin-books:** disponível = contábil + limite − Σ reservas ativas.
**Erro comum:** confundir saldo disponível com saldo contábil quando existem reservas ativas.
**Onde na prática:** marco 02, retomado no 04.

### Saldo bloqueado
**Em uma frase:** a parte do saldo contábil retida por reservas ou restrições ativas.
**No fin-books:** a soma dos *holds* ativos de uma conta é o seu saldo bloqueado.
**Erro comum:** achar que saldo bloqueado é "perdido" — ele ainda pertence à conta, só não está
disponível agora.
**Onde na prática:** marco 02, retomado no 04.

### Saldo projetado
**Em uma frase:** o saldo que incluiria movimentos futuros conhecidos mas ainda não efetivados.
**No fin-books:** um boleto agendado reduz o saldo projetado antes de reduzir o saldo contábil.
**Erro comum:** apresentar saldo projetado como se fosse o saldo contábil atual.
**Onde na prática:** marco 02.

### Saldo derivado
**Em uma frase:** o saldo calculado, a cada consulta, como a soma de todos os lançamentos da
conta.
**No fin-books:** sempre correto; o custo cresce com o volume de histórico da conta.
**Erro comum:** usar saldo derivado sem considerar o custo de consulta em contas com milhões de
lançamentos.
**Onde na prática:** marco 02.

### Saldo materializado
**Em uma frase:** uma coluna mantida atualizada transacionalmente a cada novo lançamento.
**No fin-books:** rápido de consultar; precisa de verificação periódica contra o saldo derivado.
**Erro comum:** manter saldo materializado sem nenhuma verificação periódica de consistência.
**Onde na prática:** marco 02.

### Conta normal
**Em uma frase:** a direção (devedora ou credora) que naturalmente aumenta o saldo de uma conta,
de acordo com sua categoria.
**No fin-books:** o sinal interno de cada conta é representado de forma consistente com sua conta
normal.
**Erro comum:** interpretar saldo negativo como sempre "problema" — pode só significar operação na
direção oposta à normal.
**Onde na prática:** marco 02.

### Saldo em data
**Em uma frase:** o saldo de uma conta reconstruído até uma data específica no passado.
**No fin-books:** calculado somando lançamentos com data de competência até a data consultada.
**Erro comum:** calcular saldo em data usando data de registro em vez de data de competência.
**Onde na prática:** marco 02, retomado no 03.

## Imutabilidade

### *Append-only*
**Em uma frase:** a propriedade de uma tabela que só aceita inserção, nunca atualização ou
remoção.
**No fin-books:** imposto por revogação real de privilégios `UPDATE`/`DELETE` no banco, não só
por convenção de código.
**Erro comum:** garantir *append-only* apenas por convenção de código, sem impor no próprio banco.
**Onde na prática:** marco 03.

### Estorno (*reversal*)
**Em uma frase:** um lançamento que desfaz por completo um lançamento anterior, gerando o inverso
exato.
**No fin-books:** o estorno de um lançamento sintético devolve o saldo ao valor anterior, por
propriedade.
**Erro comum:** usar estorno quando só uma fração da operação original estava errada — um ajuste
seria mais preciso.
**Onde na prática:** marco 03.

### Ajuste (*adjustment*)
**Em uma frase:** uma correção que ajusta uma diferença sem desfazer por completo o lançamento
original.
**No fin-books:** usado quando parte da operação (como uma taxa mal calculada) precisa de
correção isolada.
**Erro comum:** usar ajuste quando a operação inteira não deveria ter ocorrido — nesse caso,
estorno é mais apropriado.
**Onde na prática:** marco 03.

### Idempotência de *posting*
**Em uma frase:** a garantia de que a mesma chave de operação, processada mais de uma vez, produz
um único lançamento.
**No fin-books:** uma restrição de unicidade no banco garante idempotência mesmo sob retentativas
concorrentes.
**Erro comum:** usar um identificador aleatório gerado a cada tentativa em vez de uma chave
natural da operação.
**Onde na prática:** marco 03.

### Bitemporal
**Em uma frase:** a prática de distinguir data de registro (quando entrou no sistema) de data de
competência (a data econômica real).
**No fin-books:** um lançamento retroativo tem data de competência anterior à data de registro.
**Erro comum:** confundir as duas datas num relatório de saldo histórico, produzindo resultado
errado.
**Onde na prática:** marco 03.

### Data de competência
**Em uma frase:** a data econômica a que um lançamento se refere, podendo ser anterior à data de
registro.
**No fin-books:** usada para calcular saldo "em data" corretamente, mesmo com lançamentos
retroativos.
**Erro comum:** achar que data de competência é sempre igual à data em que o lançamento foi
inserido no sistema.
**Onde na prática:** marco 03.

### Data de registro
**Em uma frase:** o momento em que um lançamento efetivamente entrou no sistema.
**No fin-books:** usada para auditoria e ordenação do journal, distinta da data de competência.
**Erro comum:** usar data de registro para responder perguntas sobre saldo histórico econômico.
**Onde na prática:** marco 03.

### Trilha de auditoria (de lançamento)
**Em uma frase:** o registro de quem, quando e por que um lançamento foi feito, incluindo
referência ao original em caso de estorno ou ajuste.
**No fin-books:** um estorno sem referência ao original seria apenas "mais um lançamento",
perdendo a história da correção.
**Erro comum:** registrar um estorno ou ajuste sem referência explícita ao lançamento que ele
corrige.
**Onde na prática:** marco 03, retomado no 10.

## Reserva

### Autorização
**Em uma frase:** o momento em que uma operação é aprovada, criando um compromisso sobre o saldo
ainda sem lançamento contábil final.
**No fin-books:** a autorização cria uma reserva, reduzindo o disponível sem alterar o contábil.
**Erro comum:** tratar autorização e liquidação como o mesmo evento contábil.
**Onde na prática:** marco 04.

### Captura
**Em uma frase:** converter uma reserva num lançamento contábil final, parcial ou totalmente.
**No fin-books:** a captura parcial libera automaticamente o restante não capturado da reserva.
**Erro comum:** capturar sem liberar o excedente de uma captura parcial, deixando saldo bloqueado
sem necessidade.
**Onde na prática:** marco 04.

### Liquidação (de reserva)
**Em uma frase:** a resolução final de uma reserva, seja por captura ou por liberação.
**No fin-books:** toda reserva simulada termina em exatamente um dos três estados terminais.
**Erro comum:** achar que uma reserva pode permanecer indefinidamente sem nenhuma resolução final.
**Onde na prática:** marco 04.

### *Hold*
**Em uma frase:** sinônimo de reserva — redução do saldo disponível sem lançamento contábil
final, até resolução.
**No fin-books:** disponível = contábil − Σ holds ativos, verificado em todo instante.
**Erro comum:** confundir hold com saldo bloqueado permanentemente — ele é temporário por
natureza.
**Onde na prática:** marco 04.

### Captura parcial
**Em uma frase:** capturar um valor menor do que o originalmente reservado.
**No fin-books:** o restante não capturado é liberado automaticamente no momento da captura
parcial.
**Erro comum:** deixar o valor não capturado bloqueado em vez de liberá-lo imediatamente.
**Onde na prática:** marco 04.

### Expiração (de reserva)
**Em uma frase:** a liberação automática de uma reserva não resolvida dentro do prazo
configurado.
**No fin-books:** com relógio falso avançado além do prazo, a reserva simulada expira e libera o
valor sozinha.
**Erro comum:** não configurar expiração, permitindo que uma reserva esquecida bloqueie saldo
indefinidamente.
**Onde na prática:** marco 04.

### Estado terminal (de reserva)
**Em uma frase:** um dos três resultados finais possíveis de uma reserva — capturada, liberada ou
expirada — sempre único.
**No fin-books:** uma reserva simulada nunca alcança dois estados terminais diferentes, mesmo sob
chamadas concorrentes repetidas.
**Erro comum:** permitir que uma reserva mude de estado terminal depois de já resolvida.
**Onde na prática:** marco 04.

## Valor

### Menor unidade
**Em uma frase:** a menor fração indivisível de uma moeda (centavo, por exemplo), usada como base
para representar valores como inteiros.
**No fin-books:** todo valor monetário em Go é um inteiro na menor unidade, nunca ponto
flutuante.
**Erro comum:** representar valor monetário como ponto flutuante binário em qualquer camada do
sistema.
**Onde na prática:** marco 01, retomado no 05.

### *Half-even*
**Em uma frase:** convenção de arredondamento que, no caso de valor exatamente na metade,
arredonda para o número par mais próximo.
**No fin-books:** usado para evitar viés sistemático de arredondamento ao longo de milhões de
operações.
**Erro comum:** usar `half-up` quando a convenção correta do produto é `half-even`, introduzindo
um viés não intencional.
**Onde na prática:** marco 05.

### Maior resto
**Em uma frase:** algoritmo de rateio que distribui os centavos restantes para as partes com
maior resto fracionário descartado.
**No fin-books:** garante que a soma das parcelas rateadas seja exatamente igual ao total
original.
**Erro comum:** dividir um total em partes iguais sem rateio por maior resto, perdendo ou criando
centavos.
**Onde na prática:** marco 05.

### Rateio
**Em uma frase:** dividir um valor total entre várias partes, conservando a soma exata.
**No fin-books:** usado tanto para parcelas de uma venda quanto para split de taxas entre
participantes.
**Erro comum:** tratar rateio como uma simples divisão aritmética, ignorando a conservação do
total.
**Onde na prática:** marco 05.

### Juros simples e compostos
**Em uma frase:** juros simples aplicam a taxa sobre o principal original; compostos aplicam
sobre o saldo já acrescido de juros anteriores.
**No fin-books:** o acúmulo diário de juros simulado reproduz a tabela de casos de referência para
ambos os tipos.
**Erro comum:** aplicar a fórmula de juros compostos quando o produto real usa juros simples, ou
vice-versa.
**Onde na prática:** marco 05.

### Base de dias
**Em uma frase:** a convenção (252, 360 ou 365 dias por ano) usada para calcular juros
proporcionais a um período.
**No fin-books:** tratada como parâmetro configurável e marcada "conferir" — nunca assumida de
memória.
**Erro comum:** usar uma base de dias diferente da que o produto real exige, produzindo juros
calculados incorretamente.
**Onde na prática:** marco 05.

### *Accrual*
**Em uma frase:** lançar periodicamente o juro proporcional já acumulado, em vez de esperar o
vencimento final.
**No fin-books:** o saldo contábil reflete, a cada dia, o valor econômico real já acumulado.
**Erro comum:** calcular juros só no vencimento, deixando o saldo contábil "atrasado" em relação
ao valor econômico real.
**Onde na prática:** marco 05.

### Tarifa
**Em uma frase:** um valor fixo ou percentual cobrado sobre uma operação, tratado como parâmetro
configurável.
**No fin-books:** toda tarifa aplicada é registrada como lançamento explícito, nunca descontada
silenciosamente.
**Erro comum:** embutir o valor de uma tarifa diretamente no código, em vez de tratá-la como
configuração testada.
**Onde na prática:** marco 05.

## Câmbio

### Moeda
**Em uma frase:** parte inseparável de um valor monetário, com seu próprio código (ISO 4217) e
número de casas decimais.
**No fin-books:** o tipo `Money` nunca aceita operação entre moedas diferentes sem conversão
explícita.
**Erro comum:** tratar valor e moeda como campos independentes, em vez de uma unidade
inseparável.
**Onde na prática:** marco 01, retomado no 06.

### Taxa (de câmbio)
**Em uma frase:** o fator de conversão entre duas moedas, registrado com hora e fonte em cada
conversão.
**No fin-books:** uma conversão sem taxa registrada é rejeitada antes de qualquer outro
processamento.
**Erro comum:** reutilizar uma taxa antiga em vez de registrar uma nova taxa, com hora e fonte,
para cada conversão.
**Onde na prática:** marco 06.

### *Spread* (cambial)
**Em uma frase:** a diferença entre a taxa de mercado e a taxa oferecida ao cliente, a margem da
operação de câmbio.
**No fin-books:** tratado como parâmetro configurável, nunca um valor embutido sem registro.
**Erro comum:** aplicar spread sem registrar seu valor explicitamente no lançamento de conversão.
**Onde na prática:** marco 06.

### Conta de posição (cambial)
**Em uma frase:** conta que acumula a diferença entre o valor convertido e o valor de referência,
origem do ganho ou perda cambial.
**No fin-books:** o ganho ou perda cambial da reavaliação simulada fecha exatamente essa
diferença.
**Erro comum:** deixar a diferença cambial sem lançamento contábil correspondente, como se ela
simplesmente não existisse.
**Onde na prática:** marco 06.

### Ganho/perda cambial
**Em uma frase:** o resultado contábil de uma diferença de taxa de câmbio, seja na conversão ou
na reavaliação.
**No fin-books:** sempre lançado explicitamente, nunca ignorado ou descartado como resto.
**Erro comum:** tratar ganho ou perda cambial como um detalhe irrelevante em vez de um lançamento
contábil obrigatório.
**Onde na prática:** marco 06.

### Reavaliação
**Em uma frase:** ajustar a visão contábil de um saldo em moeda estrangeira conforme a taxa de
mercado muda, sem converter de fato.
**No fin-books:** a reavaliação diária simulada gera um lançamento de ganho ou perda não
realizado.
**Erro comum:** confundir reavaliação com conversão — reavaliação ajusta a visão contábil;
conversão move valor de fato.
**Onde na prática:** marco 06.

## Fechamento

### Período
**Em uma frase:** uma janela de tempo contábil (dia, mês) com começo e fim definidos.
**No fin-books:** cada período simulado tem um processo de fechamento próprio, com balancete
verificável.
**Erro comum:** tratar "o período" como uma janela sempre potencialmente mutável, sem um ato
formal de fechamento.
**Onde na prática:** marco 07.

### *Cut-off*
**Em uma frase:** o horário exato em que o fechamento de um período é executado.
**No fin-books:** um lançamento no limiar do cut-off segue uma regra determinística e explícita
sobre a qual período pertence.
**Erro comum:** não ter uma regra explícita para lançamentos que chegam exatamente no limiar do
cut-off.
**Onde na prática:** marco 07.

### Calendário bancário
**Em uma frase:** a definição configurável de quais dias são úteis e quais são feriados, usada
para calcular fechamento e prazos.
**No fin-books:** tratado como configuração testada — **conferir** a fonte correta do calendário
vigente.
**Erro comum:** hardcoded o calendário de feriados no código, em vez de tratá-lo como
configuração testável.
**Onde na prática:** marco 07.

### *Snapshot* (de fechamento)
**Em uma frase:** os saldos de todas as contas congelados no exato momento do fechamento de um
período.
**No fin-books:** o snapshot simulado é igual ao saldo reconstruído do diário para a mesma data,
por propriedade.
**Erro comum:** editar um snapshot diretamente para "corrigir" uma divergência, em vez de
investigar a causa.
**Onde na prática:** marco 07.

### Balancete (*trial balance*)
**Em uma frase:** a soma dos saldos devedores comparada à soma dos saldos credores de um período,
por moeda.
**No fin-books:** `make audit` verifica que o balancete fecha a cada período simulado.
**Erro comum:** tratar um balancete que não fecha como detalhe cosmético, em vez de investigar a
violação de partida dobrada que ele revela.
**Onde na prática:** marco 07, retomado no 10.

### Reabertura (de período)
**Em uma frase:** a operação excepcional de reabrir um período já fechado, exigindo registro
auditável e refazendo o balancete.
**No fin-books:** a reabertura simulada sempre refaz o balancete inteiro depois da correção.
**Erro comum:** reabrir um período informalmente, sem registro auditável do motivo.
**Onde na prática:** marco 07.

## Conciliação

### Casamento
**Em uma frase:** o processo de associar um lançamento interno a uma linha externa
correspondente, usando uma chave.
**No fin-books:** o casamento simulado é determinístico — mesma entrada, mesmo resultado,
independente da ordem das linhas.
**Erro comum:** usar uma chave de casamento frágil (só valor e data) quando um identificador fim a
fim único está disponível.
**Onde na prática:** marco 08.

### Quebra (de conciliação)
**Em uma frase:** uma divergência entre o ledger e a fonte externa que não casa automaticamente.
**No fin-books:** toda quebra simulada é classificada (timing ou erro) antes de entrar na fila de
exceções.
**Erro comum:** deixar uma quebra sem classificação, tratando toda divergência genericamente da
mesma forma.
**Onde na prática:** marco 08.

### Diferença de *timing*
**Em uma frase:** uma divergência que se resolve sozinha com o tempo — um item "em trânsito"
entre os dois lados.
**No fin-books:** reclassificada automaticamente quando a contraparte confirma a linha no dia
seguinte, no cenário simulado.
**Erro comum:** confundir diferença de timing com erro real, deixando um erro real se acumular
sob a desculpa de "vai resolver sozinho".
**Onde na prática:** marco 08.

### Tolerância (de conciliação)
**Em uma frase:** o limite explícito de diferença de valor ou de tempo aceito como divergência
esperada, não erro.
**No fin-books:** configurada e testada; uma divergência fora da tolerância sempre gera exceção.
**Erro comum:** usar tolerância tão ampla que mascara erros reais sob a desculpa de "divergência
esperada".
**Onde na prática:** marco 08.

### Fila de exceções
**Em uma frase:** o conjunto de quebras de conciliação pendentes, cada uma com idade e dono
responsável.
**No fin-books:** o *aging* da fila simulada é calculado com relógio falso e ordenado por idade e
valor.
**Erro comum:** ter uma fila de exceções sem dono explícito por item, deixando-as sem
responsável.
**Onde na prática:** marco 08.

### *Aging*
**Em uma frase:** há quanto tempo uma exceção de conciliação está pendente sem resolução.
**No fin-books:** calculado com relógio falso sobre a fila de exceções simulada.
**Erro comum:** não medir aging, perdendo visibilidade sobre exceções antigas que deveriam ter
prioridade.
**Onde na prática:** marco 08.

### Conciliação interna/externa
**Em uma frase:** interna compara o próprio ledger consigo mesmo (razão, subrazão, materializado);
externa compara contra uma fonte fora do seu controle.
**No fin-books:** `make audit` roda ambas: verificação interna de consistência e conciliação
externa simulada.
**Erro comum:** achar que conciliação externa só revela erro da contraparte — ela também revela
bug do próprio ledger.
**Onde na prática:** marco 08.
