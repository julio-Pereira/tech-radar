Um verbete por termo: definição em uma frase, o exemplo no `fin-lend`, o erro comum associado e
o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Contrato

### CCB (Cédula de Crédito Bancário)
**Em uma frase:** o instrumento que formaliza um contrato de crédito, com os termos
assinados pelas partes.
**No fin-lend:** a formalização simulada gera o registro equivalente antes do desembolso.
**Erro comum:** tratar a CCB como um detalhe burocrático, sem relação com os estados do contrato
no sistema.
**Onde na prática:** marco 01.

### Desembolso
**Em uma frase:** o momento em que o valor do empréstimo efetivamente sai da instituição para o
cliente.
**No fin-lend:** o desembolso simulado é o primeiro lançamento balanceado postado no razão.
**Erro comum:** confundir desembolso com a decisão de aprovação — a aprovação autoriza; o
desembolso move o dinheiro de fato.
**Onde na prática:** marco 01, retomado no 03.

### Vigência
**Em uma frase:** o período em que o contrato está ativo e as parcelas estão sendo pagas
normalmente.
**No fin-lend:** o estado "vigente" é o estado normal entre o desembolso e a liquidação ou o
atraso.
**Erro comum:** tratar vigência como um estado terminal — ela é o estado de trânsito entre
desembolso e o desfecho do contrato.
**Onde na prática:** marco 01.

### Liquidação (de contrato)
**Em uma frase:** o estado terminal alcançado quando o contrato é totalmente pago.
**No fin-lend:** um contrato liquidado não tem nenhuma transição de saída válida.
**Erro comum:** permitir que um contrato liquidado seja reaberto por uma transição comum, em vez
de um mecanismo auditado específico.
**Onde na prática:** marco 01, retomado no 03.

### Baixa (de crédito)
**Em uma frase:** o estado terminal alcançado quando um contrato é reconhecido como prejuízo,
após esgotadas as tentativas de cobrança.
**No fin-lend:** a baixa simulada move o saldo para a conta contábil correta, distinta da
liquidação normal.
**Erro comum:** confundir baixa com liquidação — uma é pagamento integral; a outra é
reconhecimento de perda.
**Onde na prática:** marco 01, retomado no 08.

### Renegociação
**Em uma frase:** liquidar um contrato existente e originar um novo com termos renegociados,
carregando o saldo remanescente.
**No fin-lend:** a renegociação simulada preserva o histórico do contrato original, nunca o
edita.
**Erro comum:** editar o contrato original diretamente, em vez de liquidá-lo e originar um novo.
**Onde na prática:** marco 03, retomado no 08.

### Estado terminal (de contrato)
**Em uma frase:** um estado sem nenhuma transição de saída válida — liquidado ou baixado.
**No fin-lend:** o `contrato/` simulado rejeita qualquer tentativa de transição a partir de um
estado terminal.
**Erro comum:** achar que todo estado permite alguma transição — estados terminais são, por
definição, sem saída.
**Onde na prática:** marco 01.

### Ordem de imputação
**Em uma frase:** a sequência (tipicamente encargos → juros → principal) em que um pagamento
parcial é aplicado aos componentes devidos.
**No fin-lend:** a imputação simulada segue a ordem configurada, verificada contra uma tabela de
casos.
**Erro comum:** aplicar um pagamento parcial sem ordem definida, distorcendo o saldo
remanescente calculado.
**Onde na prática:** marco 03.

### Juros de mora
**Em uma frase:** os juros adicionais que incidem sobre um pagamento em atraso, proporcionais aos
dias de atraso.
**No fin-lend:** calculados como lançamento separado e identificável, distinto da multa.
**Erro comum:** misturar multa e juros de mora num único "valor de atraso" agregado, perdendo
capacidade de auditoria.
**Onde na prática:** marco 03.

### Multa (de atraso)
**Em uma frase:** um valor fixo ou percentual aplicado por atraso, distinto dos juros de mora.
**No fin-lend:** tratada como parâmetro configurável em `regras.yaml`, com limite legal marcado
"conferir".
**Erro comum:** aplicar multa sem respeitar o limite legal vigente, ou embutir seu valor dentro
do cálculo de juros.
**Onde na prática:** marco 03.

## Matemática

### Taxa nominal
**Em uma frase:** a taxa de juros declarada, antes de considerar o efeito da capitalização
composta.
**No fin-lend:** usada como entrada para o cálculo de taxa efetiva em `calc/`.
**Erro comum:** confundir taxa nominal com taxa efetiva, tratando-as como equivalentes sem
conversão.
**Onde na prática:** marco 02.

### Taxa efetiva
**Em uma frase:** o que a taxa nominal de fato representa quando capitalizada no regime
composto.
**No fin-lend:** calculada a partir da taxa nominal e verificada por equivalência ida e volta.
**Erro comum:** aplicar equivalência linear (multiplicar por 12, por exemplo) num regime que é
composto.
**Onde na prática:** marco 02.

### Tabela Price
**Em uma frase:** sistema de amortização com parcela constante e composição variável entre juros
e amortização.
**No fin-lend:** `calc/` reproduz a tabela Price do exemplo ao centavo.
**Erro comum:** achar que a parcela constante do Price significa juros constantes — os juros
decrescem; a amortização cresce.
**Onde na prática:** marco 02.

### SAC (Sistema de Amortização Constante)
**Em uma frase:** sistema de amortização com amortização constante e parcela decrescente.
**No fin-lend:** `calc/` reproduz a tabela SAC do exemplo ao centavo, com juros totais menores
que o Price equivalente.
**Erro comum:** achar que SAC e Price sempre produzem o mesmo total de juros para a mesma taxa e
prazo.
**Onde na prática:** marco 02.

### CET (Custo Efetivo Total)
**Em uma frase:** a taxa que iguala o valor líquido recebido ao valor presente das parcelas,
incorporando tarifas e custos adicionais.
**No fin-lend:** o CET calculado no exemplo sobe de 2,00% para ≈2,25% a.m. com uma tarifa
financiada.
**Erro comum:** reportar a taxa nominal como se fosse o custo real da operação, ignorando
tarifas e seguros.
**Onde na prática:** marco 02.

### Pro rata
**Em uma frase:** o ajuste proporcional de juros para um período que não corresponde a um mês
completo.
**No fin-lend:** calculado com a base de dias declarada em `regras.yaml`.
**Erro comum:** usar uma base de dias diferente da que o produto real exige, sem registrar qual
foi usada.
**Onde na prática:** marco 02.

### Amortização antecipada
**Em uma frase:** pagar parte do saldo devedor antes do vencimento, reduzindo prazo ou parcela
conforme escolha do cliente.
**No fin-lend:** a amortização antecipada simulada sempre reduz os juros totais e nunca deixa o
saldo negativo.
**Erro comum:** recalcular o cronograma de forma que o saldo devedor fique negativo em algum
ponto.
**Onde na prática:** marco 02.

### TIR (Taxa Interna de Retorno)
**Em uma frase:** a taxa, calculada por método numérico, que zera o valor presente líquido de um
fluxo de caixa.
**No fin-lend:** calculada por bisseção ou Newton-Raphson com tolerância de convergência
declarada.
**Erro comum:** esperar uma fórmula fechada simples para a TIR — ela exige método numérico
iterativo.
**Onde na prática:** marco 02.
