Um verbete por termo: definição em uma frase, o exemplo no `fin-rails`, o erro comum associado
e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Ecossistema

### Arranjo de pagamento
**Em uma frase:** o conjunto de regras e participantes que definem como um meio de pagamento
funciona (um arranjo de cartão, o próprio Pix).
**No fin-rails:** cada simulador (`sim-spi`, `sim-cartoes`, `sim-boleto`) implementa as regras de
um arranjo diferente.
**Erro comum:** tratar "arranjo" como sinônimo de "sistema" — é a estrutura de regras e papéis,
não a infraestrutura técnica que a implementa.
**Onde na prática:** marco 01.

### Instituidor (do arranjo)
**Em uma frase:** quem define as regras do arranjo de pagamento.
**No fin-rails:** o Banco Central é o instituidor do Pix; uma bandeira é o instituidor de seu
próprio arranjo de cartão.
**Erro comum:** confundir o instituidor com um participante operacional do arranjo (emissor ou
adquirente) — o instituidor define regras, não processa transações individuais.
**Onde na prática:** marco 01.

### Bandeira
**Em uma frase:** a marca e a rede que conectam emissores e adquirentes num arranjo aberto de
cartão.
**No fin-rails:** o `sim-cartoes` simula uma bandeira roteando entre um emissor e um adquirente
fictícios.
**Erro comum:** achar que a bandeira processa o dinheiro diretamente — ela conecta e define
regras; o emissor e o adquirente é que movem fundos.
**Onde na prática:** marco 01, retomado no 04.

### Emissor
**Em uma frase:** a instituição que mantém a conta ou a linha de crédito do pagador.
**No fin-rails:** o emissor simulado decide se autoriza ou nega uma transação de cartão.
**Erro comum:** confundir emissor com adquirente — o emissor representa o pagador, o adquirente
representa o lojista.
**Onde na prática:** marco 01, retomado no 04.

### Adquirente
**Em uma frase:** a instituição que habilita o lojista a receber pagamentos.
**No fin-rails:** o `sim-cartoes` modela o adquirente como quem recebe a transação do lojista e a
roteia à bandeira.
**Erro comum:** achar que o adquirente é sempre o lojista — ele é o intermediário que permite ao
lojista aceitar o meio de pagamento.
**Onde na prática:** marco 01, retomado no 04 e 05.

### Subadquirente / facilitador
**Em uma frase:** quem revende acesso a um adquirente para lojistas menores, sem ser o adquirente
original.
**No fin-rails:** representado como uma camada adicional entre o lojista pequeno e o adquirente
no fluxo simulado.
**Erro comum:** tratar o subadquirente como equivalente ao adquirente — ele depende do adquirente
original para de fato processar.
**Onde na prática:** marco 01.

### Instituição de pagamento
**Em uma frase:** categoria regulatória que permite oferecer serviços de pagamento sem ser uma
instituição financeira completa (**conferir** a definição vigente).
**No fin-rails:** usada como papel conceitual nos cenários de fluxo; o `fin-rails` não implementa
nenhuma licença real.
**Erro comum:** tratar instituição de pagamento e instituição financeira como sinônimos — as
permissões regulatórias diferem.
**Onde na prática:** marco 01.

### Instituição financeira
**Em uma frase:** categoria regulatória com permissões mais amplas que uma instituição de
pagamento, incluindo captação de depósitos (**conferir** a definição vigente).
**No fin-rails:** papel conceitual nos cenários de fluxo, sem nenhuma licença real envolvida.
**Erro comum:** assumir que toda instituição que participa de um pagamento é uma instituição
financeira — muitos participantes são instituições de pagamento.
**Onde na prática:** marco 01.

### Conta de reserva
**Em uma frase:** a conta que uma instituição mantém na infraestrutura de liquidação para
participar do sistema.
**No fin-rails:** o saldo da conta de reserva simulada é o que a trilha monitora no marco 07.
**Erro comum:** confundir a conta de reserva com uma conta operacional comum — ela existe
especificamente para liquidação entre instituições.
**Onde na prática:** marco 01, retomado no 07.

## Fluxo

### Fluxo de informação
**Em uma frase:** a mensagem que comunica que um pagamento foi autorizado ou processado, distinta
do movimento real do dinheiro.
**No fin-rails:** a resposta de "autorizado" do `sim-cartoes` em milissegundos é fluxo de
informação, não fluxo de fundos.
**Erro comum:** tratar uma resposta rápida de API como prova de que o dinheiro já mudou de conta.
**Onde na prática:** marco 01.

### Fluxo de fundos
**Em uma frase:** o momento em que o dinheiro de fato muda de conta entre instituições.
**No fin-rails:** nos cenários sintéticos do marco 01, o fluxo de fundos de um cartão parcelado
ocorre semanas depois do fluxo de informação.
**Erro comum:** assumir que fluxo de informação e fluxo de fundos ocorrem no mesmo instante.
**Onde na prática:** marco 01.

### Liquidação bruta em tempo real
**Em uma frase:** modelo de liquidação que movimenta o valor cheio de cada transação
individualmente, no momento em que ocorre.
**No fin-rails:** o `sim-spi` liquida cada pagamento Pix simulado individualmente, sem acumular
lote.
**Erro comum:** achar que liquidação bruta em tempo real é sempre superior à líquida diferida —
ela usa mais caixa por transação em troca de menos risco de contraparte.
**Onde na prática:** marco 01, retomado no 02 e 07.

### Liquidação líquida diferida
**Em uma frase:** modelo de liquidação que acumula um período de transações e movimenta só o
saldo líquido entre as partes ao final do ciclo.
**No fin-rails:** o `sim-cartoes` acumula capturas e gera um arquivo de liquidação líquida por
ciclo, não uma liquidação por transação.
**Erro comum:** ignorar que esse modelo expõe as partes a mais tempo de risco de contraparte entre
informação e fundos.
**Onde na prática:** marco 01, retomado no 05 e 07.

### Finalidade
**Em uma frase:** o momento em que um pagamento se torna definitivo, depois do qual desfazer exige
um processo novo, não um simples cancelamento.
**No fin-rails:** cada simulador declara explicitamente a regra de finalidade do seu trilho.
**Erro comum:** assumir que todo pagamento pode ser "simplesmente revertido" como uma transação de
banco de dados comum.
**Onde na prática:** marco 01, retomado no 03 e 08.

### *Prefunding*
**Em uma frase:** depositar fundos antecipadamente numa conta de reserva, antes de poder liquidar
através dela.
**No fin-rails:** a `liquidez/` do marco 07 projeta se o saldo pré-financiado é suficiente para o
cenário simulado.
**Erro comum:** tratar prefunding como opcional — muitos arranjos o exigem justamente para não
depender de crédito implícito entre participantes.
**Onde na prática:** marco 01, retomado no 07.

### Taxa de desconto
**Em uma frase:** o valor que o adquirente cobra do lojista sobre cada transação de cartão.
**No fin-rails:** o cálculo de bruto menos taxa de desconto é igual ao líquido, verificado por
propriedade no marco 05.
**Erro comum:** confundir taxa de desconto (cobrada do lojista) com tarifa de intercâmbio (paga ao
emissor) — são partes diferentes do mesmo split.
**Onde na prática:** marco 01, retomado no 05.

### Tarifa de intercâmbio
**Em uma frase:** a parte da taxa de uma transação de cartão que vai para o emissor.
**No fin-rails:** uma das parcelas do *split* de taxa que o marco 01 exige conservar no total.
**Erro comum:** achar que a tarifa de intercâmbio é fixa e universal — ela varia por arranjo e é
frequentemente regulada (**conferir** a regulação vigente).
**Onde na prática:** marco 01.

## Pix

### SPI
**Em uma frase:** o Sistema de Pagamentos Instantâneos, a infraestrutura que liquida cada
transação Pix individualmente, 24x7.
**No fin-rails:** o `sim-spi/` simula essa liquidação bruta em tempo real sobre dados sintéticos.
**Erro comum:** achar que o SPI processa em lote — ele liquida transação por transação, não por
ciclo.
**Onde na prática:** marco 02.

### DICT
**Em uma frase:** o diretório que associa uma chave Pix à conta de destino real.
**No fin-rails:** o `sim-spi/` inclui um DICT simulado com limite de consultas configurável.
**Erro comum:** não proteger a consulta contra enumeração — a resposta de "chave inexistente" e
de "limite excedido" precisa ser indistinguível.
**Onde na prática:** marco 02.

### Chave Pix
**Em uma frase:** um identificador (CPF/CNPJ, e-mail, telefone ou aleatório) vinculado a uma conta
no DICT.
**No fin-rails:** o gerador sintético de chaves nunca usa um CPF ou e-mail real, apenas faixas
reservadas a teste.
**Erro comum:** tratar a chave como se fosse a própria conta — ela é só um apontador que o DICT
resolve.
**Onde na prática:** marco 02.

### Identificador fim a fim
**Em uma frase:** um valor único que acompanha uma transação Pix do início ao fim, base da
idempotência da transação.
**No fin-rails:** o mesmo identificador fim a fim enviado duas vezes ao `sim-spi/` produz um único
pagamento.
**Erro comum:** confiar só numa chave de idempotência da API de entrada, sem propagar o mesmo
identificador por toda a cadeia de processamento.
**Onde na prática:** marco 02.

### QR estático
**Em uma frase:** um QR Pix reutilizável, sem valor embutido, que exige o pagador digitar o
quanto pagar.
**No fin-rails:** o codec do `sim-spi/` gera e interpreta QR estático e dinâmico com o mesmo
parser.
**Erro comum:** usar QR estático numa cobrança cujo valor muda com frequência — exigiria
reimpressão a cada mudança.
**Onde na prática:** marco 02.

### QR dinâmico
**Em uma frase:** um QR Pix gerado para uma cobrança específica, com valor e identificador já
embutidos ou referenciados por URL, normalmente com validade limitada.
**No fin-rails:** o *payload* dinâmico simulado é hospedado pelo recebedor, como no sistema real.
**Erro comum:** achar que o QR dinâmico sempre embute o valor diretamente — muitas vezes ele só
carrega uma URL para buscar o valor.
**Onde na prática:** marco 02.

### BR Code
**Em uma frase:** o padrão de QR Code do Pix, com campos codificados em TLV e um CRC final sobre
todo o payload.
**No fin-rails:** o codec de QR do `sim-spi/` valida o CRC contra os vetores de teste oficiais da
Fase 0.
**Erro comum:** implementar o CRC de memória em vez de usar o polinômio exato do manual vigente.
**Onde na prática:** marco 02.

### Devolução (Pix)
**Em uma frase:** desfazer, total ou parcialmente, uma transação Pix já liquidada, com
identificador próprio.
**No fin-rails:** a soma de devoluções de uma transação sintética nunca excede o valor original,
mesmo sob pedidos concorrentes.
**Erro comum:** tratar devolução como simples "cancelamento" da transação original, em vez de uma
nova transação que a referencia.
**Onde na prática:** marco 03.

### MED
**Em uma frase:** o Mecanismo Especial de Devolução, acionado em casos de fraude, com bloqueio
cautelar e análise antes da devolução.
**No fin-rails:** o fluxo de MED simulado termina em um único estado terminal, conservando os
fundos entre bloqueado, devolvido e irrecuperável.
**Erro comum:** achar que o MED serve para arrependimento de compra — ele é reservado a fraude
investigada.
**Onde na prática:** marco 03.

### Bloqueio cautelar
**Em uma frase:** reter o valor na conta de destino durante a análise de um MED, antes de
qualquer decisão final.
**No fin-rails:** o bloqueio cautelar simulado impede que o valor seja retirado enquanto a análise
está em andamento.
**Erro comum:** esperar a conclusão da análise para bloquear — isso daria tempo ao fraudador de
retirar o valor antes de qualquer ação.
**Onde na prática:** marco 03.

### Pix agendado
**Em uma frase:** registrar a intenção de pagar numa data futura, não a execução imediata.
**No fin-rails:** o agendador simulado trata falta de saldo na data marcada como um estado
terminal explícito, com notificação.
**Erro comum:** tentar executar repetidamente sem limite quando não há saldo, em vez de terminar
explicitamente e notificar.
**Onde na prática:** marco 03.

### Pix Automático (recorrência)
**Em uma frase:** cobrança recorrente autorizada previamente pelo pagador, específica para um
cobrador e geralmente com teto de valor.
**No fin-rails:** a cobrança recorrente simulada sem autorização registrada é sempre rejeitada.
**Erro comum:** inferir autorização a partir do histórico de cobranças anteriores, em vez de
exigir o registro explícito.
**Onde na prática:** marco 03.

## Cartões

### Autorização
**Em uma frase:** a conversa rápida entre portador, lojista, adquirente, bandeira e emissor que
aprova (ou nega) uma transação de cartão, reservando o valor sem necessariamente cobrá-lo ainda.
**No fin-rails:** o `sim-cartoes/` simula essa cadeia de quatro saltos com latência e falhas
injetáveis.
**Erro comum:** confundir autorização com cobrança efetiva — autorização só reserva a
possibilidade; captura é que cobra de fato.
**Onde na prática:** marco 04.

### Captura
**Em uma frase:** o momento em que uma autorização já concedida é efetivamente cobrada.
**No fin-rails:** o `sim-cartoes/` modela captura imediata e captura tardia (como uma
pré-autorização de hotel).
**Erro comum:** achar que captura sempre ocorre no mesmo instante da autorização — muitos cenários
têm captura tardia.
**Onde na prática:** marco 04, retomado no 05.

### Compensação (*clearing*)
**Em uma frase:** o arquivo que agrupa as capturas de um período, consolidando o que precisa ser
liquidado entre adquirente, bandeira e emissor.
**No fin-rails:** a compensação simulada é o que de fato inicia o movimento de fundos entre as
partes, não a autorização.
**Erro comum:** achar que a autorização já move dinheiro — só a compensação inicia o fluxo de
fundos real.
**Onde na prática:** marco 05.

### Reversão
**Em uma frase:** desfazer uma autorização que não deveria seguir adiante, liberando o *hold*
reservado.
**No fin-rails:** um *timeout* simulado gera uma reversão, e o *hold* é liberado exatamente uma
vez, mesmo com retransmissão.
**Erro comum:** tratar reversão como opcional — ela é obrigatória sempre que um *hold* não deveria
permanecer.
**Onde na prática:** marco 04.

### Resultado desconhecido (autorização)
**Em uma frase:** o estado de uma autorização cuja resposta não chegou dentro do tempo esperado,
sem se saber se ela de fato ocorreu do lado do emissor.
**No fin-rails:** o *timeout* simulado do `sim-cartoes/` é resolvido por reversão, nunca assumido
como "negado" por padrão.
**Erro comum:** tratar *timeout* como sinônimo de "negado" — se a autorização de fato ocorreu, há
um *hold* que precisa ser desfeito.
**Onde na prática:** marco 04.

### *Stand-in*
**Em uma frase:** a decisão da bandeira (ou do adquirente) de autorizar ou negar em nome do
emissor, quando ele está indisponível, usando regras conservadoras pré-combinadas.
**No fin-rails:** a decisão de *stand-in* simulada é uma função pura testada contra uma tabela de
casos.
**Erro comum:** achar que o emissor fora do ar significa negar toda transação — *stand-in* existe
justamente para evitar isso.
**Onde na prática:** marco 04.

### EMV
**Em uma frase:** o padrão de chip de cartão que acrescenta criptografia e um segredo que não
viaja em texto claro.
**No fin-rails:** mencionado como contexto do fluxo de autorização; o `sim-cartoes/` não
implementa criptografia de chip real.
**Erro comum:** achar que EMV elimina toda fraude de cartão — ele dificulta a clonagem do chip,
não cobre todos os vetores de fraude.
**Onde na prática:** marco 04.

### 3-D Secure
**Em uma frase:** uma camada adicional de autenticação do portador, acionada com base em risco
calculado a partir de sinais da transação.
**No fin-rails:** a decisão simulada de acionar 3-D Secure é uma função pura testada contra uma
tabela de casos de risco.
**Erro comum:** tratar 3-D Secure como regra fixa de "sempre" ou "nunca" — a decisão varia por
risco calculado, transação a transação.
**Onde na prática:** marco 04.

### PAN (*Primary Account Number*)
**Em uma frase:** o número real do cartão de pagamento.
**No fin-rails:** o PAN só existe dentro do pacote `cofre/`; todo o resto do sistema só vê tokens.
**Erro comum:** deixar o PAN aparecer em log, métrica ou teste fora do `cofre/` — uma varredura
automática do repositório proíbe isso.
**Onde na prática:** marco 04.

### Token (de cartão)
**Em uma frase:** um identificador que substitui o número real do cartão (PAN), com significado só
dentro de um contexto específico.
**No fin-rails:** o orquestrador do marco 09 manipula exclusivamente tokens, nunca o PAN.
**Erro comum:** achar que perder um token expõe o número real do cartão — um token sem o `cofre/`
não é reversível ao PAN.
**Onde na prática:** marco 04.

### Escopo de PCI
**Em uma frase:** o conjunto de sistemas que, por tocarem dados de cartão, precisam de auditoria
de conformidade ao padrão PCI (**conferir** a versão vigente).
**No fin-rails:** isolar o PAN no `cofre/` reduz drasticamente o escopo de PCI do restante do
`fin-rails`.
**Erro comum:** achar que tokenizar em um só componente já resolve o escopo, ignorando que outros
componentes ainda tocam o PAN diretamente.
**Onde na prática:** marco 04.

### Luhn
**Em uma frase:** algoritmo que valida a estrutura de um número de cartão — uma checagem de
formato, não uma prova de que o cartão existe ou tem saldo.
**No fin-rails:** validado por propriedade e por vetores de teste sobre números sintéticos de
faixas reservadas a teste.
**Erro comum:** achar que passar Luhn significa que o cartão é válido e tem saldo — é só uma
checagem de formato.
**Onde na prática:** marco 04.

## Recebíveis

### Agenda de recebíveis
**Em uma frase:** o cronograma de parcelas futuras geradas por uma venda, cada uma com sua própria
data de liquidação prevista.
**No fin-rails:** a agenda simulada sempre soma exatamente o valor total da venda, com rateio de
resto por maior resto.
**Erro comum:** gerar parcelas que não somam exatamente o valor total da venda original.
**Onde na prática:** marco 05.

### Registro de recebíveis
**Em uma frase:** infraestrutura que torna públicos, entre credores autorizados, os recebíveis
futuros de um lojista, para evitar uso duplicado como garantia.
**No fin-rails:** uma verificação de unicidade simulada reprova a segunda tentativa de comprometer
o mesmo recebível.
**Erro comum:** assumir que um contrato privado entre lojista e credor já previne o comprometimento
duplicado sem um registro público.
**Onde na prática:** marco 05.

### Antecipação de recebíveis
**Em uma frase:** trocar o valor futuro de um recebível, com desconto, por dinheiro disponível
hoje.
**No fin-rails:** fora de escopo como produto de crédito; este marco só cobre a mecânica de
liquidação que torna um recebível antecipável.
**Erro comum:** tratar antecipação como "desconto gratuito" — é um produto financeiro com preço
embutido no desconto aplicado.
**Onde na prática:** marco 05.

## Boleto/TED

### Linha digitável
**Em uma frase:** a representação textual, para digitação manual, dos mesmos dados codificados no
código de barras de um boleto.
**No fin-rails:** *gerar → interpretar → gerar* produz exatamente a mesma linha digitável, para
qualquer payload sintético válido.
**Erro comum:** achar que a linha digitável e o código de barras podem divergir ligeiramente — eles
precisam representar exatamente os mesmos dados.
**Onde na prática:** marco 06.

### Código de barras (boleto)
**Em uma frase:** a representação para leitura óptica dos mesmos dados da linha digitável de um
boleto.
**No fin-rails:** o mesmo codec do `sim-boleto/` gera e interpreta ambas as representações a
partir dos mesmos dados internos.
**Erro comum:** implementar dois codecs separados para código de barras e linha digitável,
arriscando divergência entre eles.
**Onde na prática:** marco 06.

### Fator de vencimento
**Em uma frase:** número que codifica a data de vencimento de um boleto como contagem de dias a
partir de uma data-base, com um limite de intervalo que já mudou de regra.
**No fin-rails:** calculado e testado com tabela de casos nas bordas do intervalo, usando datas
fictícias de virada.
**Erro comum:** calcular o fator de vencimento sem tratar as bordas do intervalo, gerando datas
erradas silenciosamente.
**Onde na prática:** marco 06.

### Cobrança registrada
**Em uma frase:** um boleto publicado numa infraestrutura central antes de circular, garantindo
que qualquer banco veja o mesmo estado do título.
**No fin-rails:** o registro simulado garante consistência de estado entre as partes no
`sim-boleto/`.
**Erro comum:** assumir que todo boleto emitido é automaticamente registrado — a prática não
registrada é residual, mas ainda existe.
**Onde na prática:** marco 06.

### Baixa (boleto)
**Em uma frase:** o ato formal de marcar um título como liquidado, encerrando sua cobrança.
**No fin-rails:** um boleto pago no `sim-boleto/` só deixa de ser "pendente" depois da baixa
processada.
**Erro comum:** achar que o pagamento físico já encerra a cobrança — sem baixa processada, o
título continua pendente do ponto de vista do credor.
**Onde na prática:** marco 06.

### Boleto híbrido
**Em uma frase:** um boleto que combina a linha digitável tradicional com um QR Code Pix no mesmo
documento.
**No fin-rails:** não muda a mecânica central do `sim-boleto/`, só adiciona um segundo canal de
pagamento ao mesmo título.
**Erro comum:** achar que o boleto híbrido elimina a necessidade de conciliar os dois canais de
pagamento possíveis.
**Onde na prática:** marco 06.

### TED
**Em uma frase:** Transferência Eletrônica Disponível — move fundos entre instituições diferentes,
com regras próprias de janela de horário e finalidade.
**No fin-rails:** modelada conceitualmente na tabela de trilhos, sem simulação de infraestrutura
própria.
**Erro comum:** assumir que TED está disponível em qualquer horário — janelas de horário limitam
quando o envio é possível.
**Onde na prática:** marco 06.

## Liquidez

### *Netting*
**Em uma frase:** liquidação líquida — mover apenas o saldo entre as partes, em vez do valor bruto
de cada obrigação individual.
**No fin-rails:** o resultado do `netting` simulado é sempre igual à soma dos valores brutos por
participante (conservação).
**Erro comum:** achar que netting elimina o risco de contraparte — ele reduz o caixa usado, mas a
janela de risco entre as obrigações originais e a liquidação líquida permanece.
**Onde na prática:** marco 07.

### Colchão (de liquidez)
**Em uma frase:** o saldo de segurança mantido acima do estritamente necessário, para absorver
picos inesperados de saída.
**No fin-rails:** a `liquidez/` simulada nunca projeta a posição abaixo do colchão quando a
política de reposição está ligada.
**Erro comum:** definir o colchão como um número arbitrário, em vez de refletir a volatilidade real
observada do fluxo de caixa.
**Onde na prática:** marco 07.

### *Float*
**Em uma frase:** o dinheiro em trânsito entre o momento em que sai de uma conta e o momento em
que chega efetivamente a outra.
**No fin-rails:** mencionado como contexto histórico; o `fin-rails` não simula uso de float, dado
que é restrito pela regulação em muitos sistemas (**conferir**).
**Erro comum:** assumir que float é um recurso de tesouraria livremente disponível — é restringido
pela regulação em muitos contextos.
**Onde na prática:** marco 07.

### Reposição (de liquidez)
**Em uma frase:** aporte de capital ou empréstimo intradiário usado para recompor a posição de
liquidez quando ela ameaça cair abaixo do colchão.
**No fin-rails:** a política de reposição simulada é o que, no cenário de teste, mantém a posição
projetada sempre acima do colchão.
**Erro comum:** não ter nenhuma política de reposição definida com antecedência, negociando a
resposta ad-hoc durante a crise de caixa.
**Onde na prática:** marco 07.

## Disputas

### *Chargeback*
**Em uma frase:** o processo formal de contestação de uma transação de cartão, com prazos,
evidência e dinheiro retido até a decisão.
**No fin-rails:** a máquina de estados de disputa simulada conserva os fundos entre retenção,
estorno e reapresentação.
**Erro comum:** achar que o mérito da evidência sozinho decide o caso — perder um prazo formal
decide o caso independentemente da evidência.
**Onde na prática:** marco 08.

### Representação
**Em uma frase:** a resposta do lojista a uma contestação de chargeback, com evidência de que a
transação é legítima.
**No fin-rails:** a evidência de representação simulada varia por categoria de motivo (serviço,
processamento ou fraude).
**Erro comum:** apresentar evidência genérica em vez da evidência específica que responde à
categoria do motivo do chargeback.
**Onde na prática:** marco 08.

### Código de motivo
**Em uma frase:** a categoria declarada de um chargeback — fraude, serviço ou processamento —
que determina qual evidência é relevante para a defesa.
**No fin-rails:** o motivo simulado direciona qual tipo de evidência o lojista fictício precisa
reunir.
**Erro comum:** tratar todos os códigos de motivo com a mesma estratégia de resposta, ignorando
que cada categoria exige evidência diferente.
**Onde na prática:** marco 08.

### Fraude amigável
**Em uma frase:** quando o próprio portador contesta uma transação legítima que ele mesmo
realizou.
**No fin-rails:** o gerador sintético de casos distingue fraude amigável de fraude real para
treinar a resposta correta a cada uma.
**Erro comum:** tratar fraude amigável com a mesma resposta de investigação usada para fraude
real — a evidência eficaz é diferente em cada caso.
**Onde na prática:** marco 08.

### Taxa de *chargeback*
**Em uma frase:** a proporção de chargebacks sobre o volume de transações de um lojista, usada
como indicador de risco.
**No fin-rails:** calculada sobre uma massa sintética e usada para disparar um alerta no limite
configurado.
**Erro comum:** só reagir à taxa de chargeback depois que ela ultrapassa um limite formal, em vez
de monitorá-la continuamente.
**Onde na prática:** marco 08.

## Orquestração

### Orquestrador
**Em uma frase:** o componente que decide qual provedor ou trilho usar para cada pagamento e
mantém a continuidade do pagamento entre tentativas e provedores.
**No fin-rails:** o `orquestrador/` do marco 09 é o serviço central que implementa esse papel sobre
dois provedores simulados.
**Erro comum:** confundir orquestrador com gateway — o gateway simplifica acesso a um PSP; o
orquestrador decide entre vários e trata continuidade.
**Onde na prática:** marco 09.

### Roteamento (de pagamento)
**Em uma frase:** a decisão de qual provedor usar para um pagamento específico, ponderando custo,
taxa de aprovação, risco e disponibilidade.
**No fin-rails:** modelado como função pura, testada contra uma tabela de casos.
**Erro comum:** implementar roteamento como lógica implícita acumulada, em vez de uma função
testável e auditável.
**Onde na prática:** marco 09.

### Retentativa entre provedores
**Em uma frase:** tentar um segundo provedor depois que o primeiro falhou, sempre precedida da
resolução do resultado desconhecido do primeiro.
**No fin-rails:** o orquestrador simulado nunca tenta o segundo provedor antes de consultar ou
anular no primeiro.
**Erro comum:** tentar o segundo provedor imediatamente após um *timeout* do primeiro, arriscando
cobrança dupla.
**Onde na prática:** marco 09.

### *Webhook* (de pagamento)
**Em uma frase:** notificação assíncrona de um provedor sobre o resultado de um pagamento,
exigindo assinatura, janela de tempo e idempotência de ingestão.
**No fin-rails:** o orquestrador simulado rejeita *webhooks* sem assinatura válida ou fora da
janela de tempo configurada.
**Erro comum:** implementar só a verificação de assinatura, esquecendo a janela de tempo (proteção
contra *replay*) ou a idempotência de ingestão.
**Onde na prática:** marco 09.

### Camada anticorrupção (por provedor)
**Em uma frase:** a tradução do formato e da semântica específicos de um provedor externo para o
modelo de domínio único do orquestrador.
**No fin-rails:** um teste de arquitetura reprova qualquer tipo específico de provedor que vaze
para fora da camada anticorrupção correspondente.
**Erro comum:** deixar códigos de erro ou formatos de mensagem de um provedor específico vazarem
para a lógica central do orquestrador.
**Onde na prática:** marco 09.

## Operação

### Taxa de aprovação
**Em uma frase:** a proporção de tentativas de pagamento que são efetivamente aprovadas.
**No fin-rails:** calculada por trilho sobre dados sintéticos, e uma degradação injetada a reduz
de forma detectável.
**Erro comum:** confiar só em disponibilidade de infraestrutura, ignorando que a taxa de aprovação
pode cair mesmo com o sistema "no ar".
**Onde na prática:** marco 10.

### Funil (de pagamento)
**Em uma frase:** a sequência iniciado → autorizado → liquidado, com a taxa de conversão entre
cada etapa.
**No fin-rails:** o painel simulado identifica exatamente em qual etapa do funil uma degradação
específica ocorre.
**Erro comum:** medir só a taxa de aprovação final, sem visibilidade de em qual etapa do funil o
problema realmente está.
**Onde na prática:** marco 10.

### Sonda sintética
**Em uma frase:** uma transação de teste completa, executada periodicamente e automaticamente em
cada trilho, usando dados sintéticos.
**No fin-rails:** cada trilho simulado tem sua própria sonda, detectando degradação antes do
volume real de produção.
**Erro comum:** depender só de reclamações de clientes para detectar degradação de um trilho
específico.
**Onde na prática:** marco 10.

### Homologação
**Em uma frase:** um catálogo de casos de teste versionado como código que valida uma integração
com um arranjo ou provedor antes da produção.
**No fin-rails:** `make rails-review` executa o catálogo de homologação simulado e falha se um
caso não estiver coberto.
**Erro comum:** validar uma mudança de integração só com checagem manual ad-hoc, sem um catálogo
automatizado e versionado.
**Onde na prática:** marco 10.
