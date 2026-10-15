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
