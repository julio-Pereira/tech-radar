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
