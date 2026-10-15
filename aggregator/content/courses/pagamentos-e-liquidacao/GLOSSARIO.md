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
