---
id: ledger-multimoeda
titulo: "Ledger multimoeda com {lancamentosDia} milhões de lançamentos por dia"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - ledger-e-contabilidade/01
  - ledger-e-contabilidade/03
  - ledger-e-contabilidade/06
  - ledger-e-contabilidade/07
conceitos: [idempotencia]
parametros:
  lancamentosDia: { min: 1, max: 20, passo: 1 }
  moedas: { valores: [3, 8, 20] }
  retencaoAnos: { valores: [5, 10] }
esclarecimentos:
  - pergunta: "Qual o volume de lançamentos?"
    revela: "{lancamentosDia} milhões de lançamentos por dia, cada um com duas ou mais partidas."
    chave: true
  - pergunta: "Quantas moedas e qual a moeda funcional?"
    revela: "{moedas} moedas; o real é a moeda funcional da contabilidade."
    chave: true
  - pergunta: "De onde vem a taxa de câmbio e quando?"
    revela: "Uma taxa por par e por dia, publicada às 13h; correções podem chegar dias depois."
    chave: true
  - pergunta: "Um lançamento pode ser editado?"
    revela: "Nunca: correção é estorno mais lançamento novo."
    chave: true
  - pergunta: "Por quanto tempo os lançamentos ficam?"
    revela: "{retencaoAnos} anos, sem apagar nada."
    chave: false
  - pergunta: "Qual a fonte dos relatórios?"
    revela: "Fora de escopo: o BI lê do ledger, mas não é parte do desafio."
    chave: false
estimativas:
  - id: partidas-por-ano
    enunciado: "Partidas gravadas por ano, com duas partidas por lançamento"
    unidade: partidas
    formula: "lancamentosDia * 1e6 * 2 * 365"
  - id: pares-de-cambio
    enunciado: "Taxas a guardar por dia, se toda moeda converte direto em todas as outras"
    unidade: taxas/dia
    formula: "moedas * (moedas - 1)"
    tolerancia: 0.1
decisoes:
  - pergunta: "Como guardar os valores?"
    opcoes:
      - "Em ponto flutuante de dupla precisão, convertido na hora da leitura"
      - "Em inteiro na menor unidade da moeda, com a moeda em cada partida"
      - "Sempre convertido para real na gravação, sem guardar a moeda original"
      - "Em texto livre, para aceitar qualquer formato de valor das origens"
    correta: 1
    explicacao: "Inteiro na menor unidade, com a moeda junto, não perde centavos e preserva o fato original. Ponto flutuante acumula erro; converter na gravação perde a moeda do fato; texto livre não fecha conta nenhuma."
  - pergunta: "Como registrar a conversão de câmbio?"
    opcoes:
      - "Converter na leitura com a taxa do dia da consulta, sem guardar nada"
      - "Gravar a taxa usada e o valor convertido junto do lançamento original"
      - "Guardar só a taxa mais recente e recalcular o histórico com ela"
      - "Deixar a conversão para o time de BI, fora do ledger transacional"
    correta: 1
    explicacao: "A taxa usada é parte do fato contábil: grava-se com o lançamento. Converter na leitura muda o passado a cada dia; recalcular o histórico reescreve a contabilidade; terceirizar ao BI tira o câmbio da trilha de auditoria."
  - pergunta: "Como servir o saldo de uma conta?"
    opcoes:
      - "Somar todos os lançamentos da conta a cada consulta de saldo"
      - "Saldo materializado por conta e moeda, atualizado na mesma transação"
      - "Saldo calculado só no fechamento do dia, num job noturno em lote"
      - "Saldo guardado pelo app do cliente, que manda o valor a cada pedido"
    correta: 1
    explicacao: "O saldo materializado na mesma transação do lançamento é consistente e rápido. Somar tudo a cada consulta não escala; o job noturno deixa o saldo velho o dia inteiro; confiar no cliente é falha de segurança."
reviravolta:
  momentoPct: 60
  texto: "A fonte corrige a taxa de câmbio de três dias atrás. Como refletir a correção sem editar lançamentos?"
  rubrica:
    - "Estorno e relançamento com a taxa corrigida, nunca edição"
    - "Ajuste de variação cambial em conta própria, com data e motivo"
    - "Período já fechado tratado com lançamento no período aberto"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Manteve partidas dobradas e imutabilidade em todo o desenho"
  - "Guardou a moeda original e a taxa usada em cada lançamento"
  - "Tratou idempotência na entrada dos lançamentos"
  - "Explicou como o saldo fica consistente com os lançamentos"
  - "Considerou o fechamento de período"
---
## Enunciado

Desenhe o ledger que registra as movimentações de clientes em várias moedas, com cerca de
{lancamentosDia} milhões de lançamentos por dia.

Pergunte o que precisar antes de desenhar.

## Dicas

- A trilha `ledger-e-contabilidade` tem as peças: partidas dobradas, estorno, câmbio e fechamento.
- Se você pensar em "atualizar" um lançamento, pare: a resposta é sempre um lançamento novo.

## Gabarito comentado

**Requisitos.** Partidas dobradas que sempre fecham; imutabilidade; moeda original e moeda funcional;
saldo consistente; trilha de auditoria pelo prazo de retenção.

**Estimativas.** Partidas por ano crescem com o volume diário (duas por lançamento, no mínimo). As
taxas por dia crescem com o quadrado do número de moedas se toda moeda converte em todas — motivo
para converter tudo pela moeda funcional.

**Arquitetura.** Entrada idempotente; lançamento com partidas em inteiro na menor unidade, moeda,
taxa usada e valor na moeda funcional; saldo materializado por conta e moeda na mesma transação;
tabela de taxas versionada por data de publicação.

**Reviravolta.** A taxa corrigida gera estorno e relançamento (ou ajuste de variação cambial) com a
data e o motivo, no período aberto se o original já foi fechado. Nada é editado.

**Trade-offs.** Gravar a taxa em cada lançamento custa espaço e garante que o passado não muda.
