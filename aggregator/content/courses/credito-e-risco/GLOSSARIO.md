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

## Concessão

### Proposta
**Em uma frase:** o pedido de crédito com canal, valor, prazo e finalidade, identificado de forma idempotente desde o primeiro envio.
**No fin-lend:** reenviar a mesma proposta por *timeout* devolve a mesma análise, sem nova consulta paga.
**Erro comum:** gerar um identificador novo a cada clique, e pagar duas consultas pela mesma pessoa.
**Onde na prática:** marco 04.

### Consulta em cascata
**Em uma frase:** a ordem de consulta das fontes da mais barata à mais cara, descendo um degrau só quando a pré-decisão fica na faixa de dúvida.
**No fin-lend:** o *bureau* só é chamado para a faixa de dúvida, com orçamento de custo e de tempo.
**Erro comum:** consultar todas as fontes para toda proposta, pagando caro para decidir casos óbvios.
**Onde na prática:** marco 04.

### Instantâneo de entrada
**Em uma frase:** a cópia mínima dos valores exatos que a função de decisão viu, com a data da consulta.
**No fin-lend:** é o que o *replay* do marco 05 usa, sem chamar nenhuma fonte.
**Erro comum:** guardar só uma referência à consulta, que seis meses depois devolve outra coisa.
**Onde na prática:** marco 04, retomado no 05.

### Política de crédito
**Em uma frase:** o conjunto versionado de regras que decide propostas: corte, capacidade, score e tabela de estratégia.
**No fin-lend:** `politica/v1.yaml`, publicada com vigência e imutável.
**Erro comum:** editar a política em vigor em vez de publicar uma nova versão.
**Onde na prática:** marco 05.

### Knock-out
**Em uma frase:** uma regra de corte que recusa sem olhar mais nada, como documento inválido ou restrição grave.
**No fin-lend:** a primeira camada da política, antes de qualquer consulta cara.
**Erro comum:** colocar o *knock-out* depois do score, pagando consultas para recusar por documento.
**Onde na prática:** marco 05.

### Comprometimento de renda
**Em uma frase:** a fração da renda que já vai para dívidas, comparada a um limite declarado.
**No fin-lend:** a camada de capacidade recusa com o motivo `CAP-02` acima do limite.
**Erro comum:** usar a renda declarada sem comparar com a comprovada.
**Onde na prática:** marco 05.

### Tabela de estratégia
**Em uma frase:** o cruzamento de faixa de score com renda (ou outra dimensão) que devolve limite, taxa, prazo ou recusa.
**No fin-lend:** a última camada da política, versionada junto com ela.
**Erro comum:** espalhar essas faixas em `if`s no código, sem versão.
**Onde na prática:** marco 05.

### Código de motivo
**Em uma frase:** o identificador da razão de uma recusa, mapeado para um texto que o cliente entende.
**No fin-lend:** nasce na camada que recusou e vai para o log de decisão.
**Erro comum:** recusar sem motivo, ou com um motivo interno que ninguém de fora entende.
**Onde na prática:** marco 05.

### Override
**Em uma frase:** a decisão manual contra a política, com dupla aprovação e registro no log.
**No fin-lend:** um *override* sem segunda aprovação é recusado pelo sistema.
**Erro comum:** permitir que quem pede o *override* seja quem o aprova.
**Onde na prática:** marco 05.

### Campeã e desafiante
**Em uma frase:** a política em vigor (campeã) e a candidata (desafiante), que roda em sombra decidindo sem aplicar.
**No fin-lend:** a `v2` roda em sombra sobre a carteira sintética antes de ser publicada.
**Erro comum:** trocar de política para 100% das propostas sem medir o impacto antes.
**Onde na prática:** marco 05.

### Atributo proibido
**Em uma frase:** um dado que a política não pode usar, direta ou indiretamente por *proxy*.
**No fin-lend:** testado por acesso (a função não lê) e por correlação (nenhuma variável usada é *proxy*).
**Erro comum:** achar que não ler o campo basta, deixando um *proxy* forte na decisão.
**Onde na prática:** marco 05.

## Risco

### PD (probabilidade de default)
**Em uma frase:** a probabilidade de um contrato entrar em default num horizonte declarado.
**No fin-lend:** o *scorecard* fixo converte cada faixa de score numa PD.
**Erro comum:** comparar PDs de horizontes diferentes como se fossem a mesma coisa.
**Onde na prática:** marco 06.

### LGD (perda dado o default)
**Em uma frase:** a fração da exposição que se perde se houver default, depois da recuperação.
**No fin-lend:** 45% no exemplo da trilha.
**Erro comum:** usar LGD de 100% por prudência, ignorando a recuperação real.
**Onde na prática:** marco 06.

### EAD (exposição no default)
**Em uma frase:** quanto estará exposto no momento do default: saldo mais a parte provável do limite não usado.
**No fin-lend:** no rotativo, inclui o fator de conversão do limite livre.
**Erro comum:** usar só o saldo atual num cartão, subestimando a exposição.
**Onde na prática:** marco 06, retomado no 07.

### Perda esperada
**Em uma frase:** o produto PD × LGD × EAD, aditivo entre contratos e linear em cada fator.
**No fin-lend:** R$ 180,00 para PD 4%, LGD 45% e EAD R$ 10.000.
**Erro comum:** somar perdas esperadas de horizontes diferentes.
**Onde na prática:** marco 06.

### Default
**Em uma frase:** o critério declarado de inadimplência, tipicamente um número de dias de atraso.
**No fin-lend:** parâmetro em `regras.yaml`, com a fonte a conferir.
**Erro comum:** mudar o critério sem recalcular as medidas históricas.
**Onde na prática:** marco 06.

### Janela de maturação
**Em uma frase:** o tempo que um contrato precisa ter para que se saiba se entrou em default.
**No fin-lend:** safras recentes ficam fora da medição de inadimplência.
**Erro comum:** medir o modelo com contratos que ainda não tiveram tempo de inadimplir.
**Onde na prática:** marco 06.

### Scorecard
**Em uma frase:** um modelo que soma pontos por faixa de cada variável e chega a um score.
**No fin-lend:** o `fin-lend` usa um *scorecard* fixo sintético; não treina modelo.
**Erro comum:** ler o score como probabilidade sem a tabela que o converte em PD.
**Onde na prática:** marco 06.

### AUC
**Em uma frase:** a probabilidade de um bom pagador ter score maior que um mau, sorteados ao acaso.
**No fin-lend:** ≈ 0,833 no conjunto de brinquedo do marco 06.
**Erro comum:** confundir AUC alta com modelo calibrado.
**Onde na prática:** marco 06.

### KS
**Em uma frase:** a maior distância entre as distribuições acumuladas de score de bons e de maus.
**No fin-lend:** ≈ 0,667 no conjunto de brinquedo do marco 06.
**Erro comum:** comparar KS de populações muito diferentes sem contexto.
**Onde na prática:** marco 06.

### PSI
**Em uma frase:** o índice que mede quanto a distribuição atual se afastou da de referência, faixa a faixa.
**No fin-lend:** ≈ 0,069 no exemplo de três faixas do marco 06.
**Erro comum:** ler PSI baixo como prova de que está tudo bem.
**Onde na prática:** marco 06.

### Calibração
**Em uma frase:** a concordância, por faixa, entre a PD prevista e a inadimplência observada.
**No fin-lend:** medida por *backtest* sobre safras maduras.
**Erro comum:** usar um modelo descalibrado para precificar ou provisionar.
**Onde na prática:** marco 06.

## Limites

### Limite rotativo
**Em uma frase:** o limite que se consome e se recompõe o tempo todo, como no cartão e no cheque especial.
**No fin-lend:** cada compra reserva e cada pagamento libera, com escrita condicional atômica.
**Erro comum:** ler o disponível e gravar em duas operações, furando o limite sob concorrência.
**Onde na prática:** marco 07.

### Exposição
**Em uma frase:** o quanto a instituição pode perder com o cliente: saldo mais a parte provável do limite livre.
**No fin-lend:** somada por cliente, produto, grupo e carteira.
**Erro comum:** tratar exposição como sinônimo de saldo.
**Onde na prática:** marco 07.

### Concentração
**Em uma frase:** a parcela da exposição em um mesmo setor, região, canal ou grupo.
**No fin-lend:** um estouro recusa a próxima concessão que o agravaria.
**Erro comum:** medir só o total da carteira, que esconde concentrações.
**Onde na prática:** marco 07.

### Grupo econômico
**Em uma frase:** o conjunto de clientes ligados (mesmo dono, mesmo relacionamento) cuja exposição se consolida.
**No fin-lend:** cinco empresas de R$ 400 mil viram R$ 2 milhões de exposição ligada.
**Erro comum:** controlar só o limite individual de cada empresa.
**Onde na prática:** marco 07.

## Cobrança

### Faixa de atraso (bucket)
**Em uma frase:** o intervalo de dias de atraso que decide a régua, a provisão e o que vem depois.
**No fin-lend:** 1–30, 31–60, 61–90 e acima de 90, com um único cálculo de atraso.
**Erro comum:** cada sistema calcular os dias de atraso de um jeito.
**Onde na prática:** marco 08.

### Régua de cobrança
**Em uma frase:** a sequência de ações por faixa e por dia, executada como saga agendada e idempotente.
**No fin-lend:** roda com relógio injetável, testada varrendo 30 dias em segundos.
**Erro comum:** testar a régua esperando o calendário passar.
**Onde na prática:** marco 08.

### Portão de contato
**Em uma frase:** o ponto único por onde toda mensagem passa, verificando proteção, canal, janela e limite.
**No fin-lend:** mensagem fora da janela é adiada, não descartada.
**Erro comum:** espalhar a verificação de horário por cada passo da régua.
**Onde na prática:** marco 08.

### Promessa de pagamento
**Em uma frase:** o compromisso do cliente de pagar numa data, que suspende a régua até lá.
**No fin-lend:** a quebra avança a régua exatamente uma vez.
**Erro comum:** avançar a régua a cada execução do verificador.
**Onde na prática:** marco 08.

### Cura artificial
**Em uma frase:** a melhora aparente de um contrato renegociado sem mudança real de risco.
**No fin-lend:** a renegociação não zera o histórico de atraso para a provisão.
**Erro comum:** tirar o contrato renegociado dos relatórios de atraso.
**Onde na prática:** marco 08.

### Baixa para prejuízo
**Em uma frase:** a saída do crédito do ativo contra a provisão constituída.
**No fin-lend:** o saldo vai para a conta de prejuízo, com histórico preservado.
**Erro comum:** reverter a baixa quando o cliente paga depois.
**Onde na prática:** marco 08.

### Recuperação posterior
**Em uma frase:** o valor recebido depois da baixa, lançado como receita de recuperação.
**No fin-lend:** um lançamento novo, nunca a reversão da baixa.
**Erro comum:** apagar a baixa do histórico ao receber.
**Onde na prática:** marco 08.

## Provisão

### Perda incorrida
**Em uma frase:** o modelo de provisão por faixa de atraso, que reage ao atraso já ocorrido.
**No fin-lend:** parâmetros em `regras.yaml`, com a fonte a conferir.
**Erro comum:** achar que provisão só existe depois do atraso.
**Onde na prática:** marco 09.

### Estágio (de provisão)
**Em uma frase:** a classe de risco do contrato no modelo de perda esperada, que define o horizonte da provisão.
**No fin-lend:** 1 (12 meses), 2 (vida inteira) e 3 (problemático).
**Erro comum:** voltar de estágio no primeiro pagamento em dia.
**Onde na prática:** marco 09.

### SICR
**Em uma frase:** o aumento significativo de risco de crédito desde a originação, que leva ao estágio 2.
**No fin-lend:** gatilhos declarados, como atraso acima de 30 dias (valor ilustrativo).
**Erro comum:** mudar o gatilho sem aprovação e sem registro.
**Onde na prática:** marco 09.

### ECL
**Em uma frase:** a perda de crédito esperada: PD × LGD × EAD no horizonte do estágio, descontada e ponderada por cenários.
**No fin-lend:** calculada por contrato e somada para a carteira.
**Erro comum:** usar um único cenário, ignorando a ponderação.
**Onde na prática:** marco 09.

### Cenário macro
**Em uma frase:** uma hipótese econômica (otimista, base, pessimista) que muda os parâmetros da ECL.
**No fin-lend:** o pessimista nunca dá provisão menor que o base.
**Erro comum:** escolher o cenário que dá o número desejado.
**Onde na prática:** marco 09.

## Carteira

### Vintage
**Em uma frase:** a curva de inadimplência de uma safra de originação em função da idade.
**No fin-lend:** a safra de março está 40% acima da de dezembro aos 3 meses.
**Erro comum:** comparar safras no mesmo mês do calendário, e não na mesma idade.
**Onde na prática:** marco 11.

### Roll rate
**Em uma frase:** a matriz de migração entre faixas de atraso de um mês para o outro.
**No fin-lend:** cada linha soma 1; a diagonal para a direita antecipa provisão e cobrança.
**Erro comum:** ler só a inadimplência total, sem ver quanto rola de faixa em faixa.
**Onde na prática:** marco 11.

### Apetite a risco
**Em uma frase:** a lista de limites que a instituição aceita, com gatilhos e quem escala.
**No fin-lend:** um estouro abre um alerta com dono e prazo.
**Erro comum:** tratar o apetite como número num painel, sem dono.
**Onde na prática:** marco 11.

### As-of
**Em uma frase:** a leitura da carteira numa data de corte, reproduzível em qualquer momento.
**No fin-lend:** o relatório de 31 de março dá o mesmo resultado hoje e daqui a um ano.
**Erro comum:** gerar o relatório do passado a partir do estado atual.
**Onde na prática:** marco 11.

### Escada de vencimentos
**Em uma frase:** a comparação, mês a mês, entre o que entra das parcelas e o que sai da captação.
**No fin-lend:** no estresse do marco 10, a cobertura vira negativa no mês 8.
**Erro comum:** olhar só o saldo total, que não mostra o descasamento de datas.
**Onde na prática:** marco 10.

### KRI
**Em uma frase:** um indicador de risco operacional com limiar e dono, que antecipa eventos de perda.
**No fin-lend:** taxa de decisões degradadas, *backlog* da fila manual.
**Erro comum:** medir só depois do evento de perda.
**Onde na prática:** marco 10.

### Decisão degradada
**Em uma frase:** a decisão tomada pela regra de degradação enquanto uma fonte está indisponível, marcada no log.
**No fin-lend:** reavaliada pela política normal quando a fonte volta.
**Erro comum:** não marcar, e perder a chance de reavaliar.
**Onde na prática:** marco 12.
