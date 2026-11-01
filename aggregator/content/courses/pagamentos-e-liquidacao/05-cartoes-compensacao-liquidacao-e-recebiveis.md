---
id: cartoes-liquidacao-e-recebiveis
title: "Cartões: compensação, liquidação e recebíveis"
summary: "Autorizar não é receber: entre a captura e o dinheiro na conta do lojista existem compensação, liquidação, cronograma de parcelas e um registro de recebíveis."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Arranjos de pagamento"
    url: https://www.bcb.gov.br/estabilidadefinanceira/arranjospagamento
---

## Captura e o arquivo de compensação

**Captura** é o momento em que uma autorização já concedida é efetivamente cobrada (às vezes no
mesmo instante da autorização, às vezes mais tarde — uma pré-autorização de hotel é o exemplo
clássico de captura tardia). As capturas de um período são agrupadas num **arquivo de compensação**
(*clearing*) que o adquirente envia à bandeira, consolidando o que precisa ser liquidado entre as
partes — a autorização do marco 04 só informa que o dinheiro *pode* ser cobrado; a compensação é o
que de fato inicia o movimento de fundos.

## Liquidação do arranjo e prazos

A **liquidação** entre adquirente, bandeira e emissor segue prazos definidos pelo arranjo — à
vista e parcelado frequentemente têm cronogramas diferentes, e esses prazos mudam com a regulação e
com negociação comercial (**conferir** sempre os prazos vigentes, nunca assumir um valor fixo de
memória). É só depois dessa liquidação entre instituições que o lojista recebe sua parte — a
distância entre a venda e o dinheiro na conta do lojista é, estruturalmente, a soma do prazo de
captura mais o prazo de liquidação do arranjo.

## Agenda de recebíveis

Uma venda parcelada gera uma **agenda de recebíveis**: uma linha por parcela, cada uma com sua
própria data de liquidação prevista. Dividir o valor total em parcelas exige a mesma disciplina de
conservação do marco 01 — a soma das parcelas tem que bater exatamente com o valor total da venda,
usando uma regra de rateio (maior resto, por exemplo) para o centavo que não divide igualmente
entre todas as parcelas.

```diagrama
pg-recebiveis
```

## Registro de recebíveis

Um **registro de recebíveis** (uma infraestrutura que torna públicos, entre credores autorizados,
os recebíveis futuros de um lojista) existe para evitar que o mesmo recebível seja oferecido como
garantia a mais de um credor simultaneamente — **conferir** o regime vigente de registro, que
mudou nos últimos anos e continua evoluindo. Sem esse registro, nada impede, em tese, que um
lojista use o mesmo recebível futuro como garantia de dois empréstimos diferentes.

## Cancelamento e estorno depois da compensação

Quando uma venda já compensada precisa ser cancelada (devolução de produto, por exemplo), o ajuste
não reabre nem reescreve a liquidação já ocorrida — ele entra como um **valor negativo na
liquidação seguinte**. Essa escolha de design evita retrabalho contábil em período já encerrado, ao
custo de a agenda do lojista precisar sempre considerar que uma liquidação futura pode ser menor do
que o esperado por causa de um cancelamento de uma venda passada.

## Taxa de desconto, intercâmbio, e conservação revisitada

O marco 01 já introduziu a taxa de desconto e a tarifa de intercâmbio como conceitos; aqui eles
reaparecem como números concretos no cálculo de cada liquidação: **bruto menos taxas é igual ao
líquido** que chega ao lojista, para cada lote de captura — a mesma propriedade de conservação do
*split*, agora aplicada à liquidação real, não só ao conceito.

## Antecipação de recebíveis

**Antecipar** um recebível é trocar o valor futuro (com desconto) por dinheiro disponível hoje — um
produto financeiro com desconto embutido, estruturalmente parecido com um empréstimo garantido pelo
próprio recebível. O produto de crédito em si (como precificar o desconto, como avaliar risco de
antecipação) pertence à trilha `credito-e-risco`; este marco cobre apenas a mecânica
de liquidação que torna um recebível antecipável — ele precisa ter data e valor conhecidos e
estáveis para servir de garantia confiável.

## Arquivos de liquidação como fonte de conciliação

O arquivo de liquidação que o arranjo envia é, ao mesmo tempo, a prova de quanto foi liquidado e a
fonte primária para **conciliar** as capturas esperadas contra o que de fato chegou — qualquer
divergência (um valor que não aparece, um valor duplicado, um valor diferente do esperado) precisa
ser **classificada**, não apenas registrada como "diferença". O destino natural dessa conciliação é
o razão (`ledger-e-contabilidade`), que usa o mesmo arquivo como evidência de auditoria.

## Exemplo numa fintech

Uma venda parcelada em três vezes de R$ 300 gera três recebíveis: duas parcelas de R$ 100,00 e uma
de R$ 100,00, cada uma com sua data de liquidação própria (mês 1, mês 2, mês 3). No mês seguinte à
venda, um cancelamento parcial de R$ 30 chega como ajuste negativo na terceira parcela, reduzindo-a
para R$ 70,00 — sem reabrir a liquidação já feita das duas primeiras.

## Hands-on

**Tutorial.** Implemente a compensação e a geração da agenda de recebíveis a partir das capturas
simuladas.

**Desafio.** Implemente parcelas com rateio de resto, cancelamento após compensação, e o arquivo
de liquidação com conciliação.

**Invariantes testáveis**

1. **Bruto menos taxas é igual ao líquido**, para todo lote de captura simulado (conservação,
   verificada por propriedade sobre valores arbitrários).
2. As parcelas de uma venda **somam exatamente o valor total**, com rateio do resto por **maior
   resto**, e as datas seguem o calendário de liquidação configurado.
3. Um cancelamento registrado **depois** da compensação gera o ajuste na **liquidação seguinte**,
   sem alterar o valor já liquidado da parcela original.
4. O arquivo de liquidação **concilia** exatamente com as capturas simuladas, e divergências
   plantadas de propósito (valor duplicado, valor ausente, valor divergente) são **classificadas**
   corretamente pelo mecanismo de conciliação.
5. Um recebível **não pode ser comprometido (dado em garantia) duas vezes** no registro simulado —
   uma verificação de unicidade reprova a segunda tentativa; a versão sem essa verificação
   **demonstra** o problema que o registro existe para prevenir.

**Complemento.** Simule, numa planilha ou script simples, o fluxo de caixa de um lojista fictício
com vendas parceladas ao longo de 90 dias, e identifique o dia de menor saldo projetado.

**Checagem**

1. Por que a distância entre a venda e o dinheiro na conta do lojista é a soma do prazo de captura
   com o prazo de liquidação do arranjo, não apenas um dos dois?
2. Por que um cancelamento depois da compensação entra como ajuste na liquidação seguinte, em vez
   de reabrir a liquidação já ocorrida?
3. Por que um registro de recebíveis público entre credores autorizados previne um problema que um
   simples contrato privado entre lojista e credor não preveniria?
4. O que significa, concretamente, "conciliar" um arquivo de liquidação contra as capturas
   esperadas — e por que uma divergência precisa ser classificada, não só registrada?

> **Reencontro — `engenharia-de-dados/08`.** A qualidade de dados daquele marco — detectar e
> classificar divergências, não só sinalizar "diferente" — é exatamente a disciplina que a
> conciliação de arquivos de liquidação deste marco exige na prática.

O caso de extrato e notificações de `system-design/11` já lidou com a tarefa de apresentar ao
usuário final um histórico de lançamentos consistente; a agenda de recebíveis deste marco é a fonte
de dados que, mais adiante, alimentaria um extrato equivalente do lado do lojista. E a captura
tardia de uma pré-autorização segue o mesmo padrão de confirmação assíncrona que
`arquitetura-eventos/08` já formalizou para outbox e inbox.

## Principais aprendizados

- Captura inicia o movimento real de fundos; autorização, por si só, só reserva a possibilidade.
- A distância entre a venda e o dinheiro do lojista é a soma do prazo de captura com o prazo de
  liquidação do arranjo.
- Parcelas de uma venda precisam somar exatamente o valor total, com uma regra explícita de
  rateio do resto.
- Um cancelamento depois da compensação ajusta a liquidação seguinte, nunca reabre a liquidação já
  ocorrida.
- Um registro de recebíveis previne que o mesmo recebível futuro seja usado como garantia de mais
  de um credor ao mesmo tempo.
