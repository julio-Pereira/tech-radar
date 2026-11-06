---
id: conciliacao-diaria
titulo: "Conciliação D+1 de {transacoesDiaMi} milhões de transações por dia"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - ledger-e-contabilidade/08
  - pagamentos-e-liquidacao/05
  - pagamentos-e-liquidacao/07
conceitos: [idempotencia]
parametros:
  transacoesDiaMi: { min: 1, max: 15, passo: 1 }
  parceiros: { valores: [4, 12] }
  taxaDivergencia: { valores: [0.1, 0.5, 2] }
esclarecimentos:
  - pergunta: "Qual o volume diário?"
    revela: "{transacoesDiaMi} milhões de transações por dia, somando todos os parceiros."
    chave: true
  - pergunta: "Quantos parceiros mandam arquivo, e em que formato?"
    revela: "{parceiros} parceiros, cada um com o próprio layout de arquivo."
    chave: true
  - pergunta: "Quando os arquivos chegam?"
    revela: "Entre 2h e 6h do dia seguinte (D+1); alguns parceiros atrasam e reenviam."
    chave: true
  - pergunta: "Quanta divergência é normal?"
    revela: "Cerca de {taxaDivergencia}% das transações divergem em valor, data ou ausência."
    chave: true
  - pergunta: "Qual o prazo para tratar uma divergência?"
    revela: "Até D+2, com dono e motivo registrados."
    chave: false
  - pergunta: "O relatório final precisa de gráfico?"
    revela: "Fora de escopo."
    chave: false
estimativas:
  - id: divergencias-dia
    enunciado: "Divergências esperadas por dia"
    unidade: divergências
    formula: "transacoesDiaMi * 1e6 * taxaDivergencia / 100"
  - id: linhas-por-parceiro
    enunciado: "Linhas por arquivo de parceiro num dia médio, dividindo o volume por igual"
    unidade: linhas
    formula: "transacoesDiaMi * 1e6 / parceiros"
decisoes:
  - pergunta: "Como casar o arquivo do parceiro com os registros internos?"
    opcoes:
      - "Comparar só o total do dia de cada parceiro com o total interno"
      - "Transação a transação, por chave de negócio e com tolerâncias"
      - "Pela ordem das linhas do arquivo e da base interna do mesmo dia"
      - "Aceitar o arquivo do parceiro como verdade e ajustar o interno a ele"
    correta: 1
    explicacao: "Só o casamento por chave de negócio, com tolerância de data e valor, diz qual transação diverge. O total do dia esconde erros que se compensam; ordem de linhas não é chave; o parceiro também erra."
  - pergunta: "Como reprocessar quando um arquivo chega de novo ou corrigido?"
    opcoes:
      - "Apagar o resultado do dia e rodar tudo de novo a cada arquivo novo"
      - "Processar por arquivo, idempotente pelo id e pelo hash do conteúdo"
      - "Processar uma vez só e travar o dia, sem aceitar correção nenhuma"
      - "Juntar todos os arquivos num só e processar no fim do mês inteiro"
    correta: 1
    explicacao: "Idempotência por arquivo (id e hash) aceita reenvio sem duplicar e permite versão corrigida. Apagar tudo perde o trabalho já tratado; travar o dia impede a correção legítima; o fim do mês estoura o prazo."
  - pergunta: "O que fazer com as divergências encontradas?"
    opcoes:
      - "Ajustar automaticamente o ledger para bater com o parceiro, sempre"
      - "Fila de divergências classificadas, com dono, prazo e lançamento de ajuste"
      - "Ignorar as abaixo de um valor fixo, sem registrar nada sobre elas"
      - "Mandar uma planilha diária com as divergências por e-mail ao financeiro"
    correta: 1
    explicacao: "Cada divergência vira item com classe, dono e prazo, e o ajuste é um lançamento com motivo. Ajustar sempre ao parceiro esconde erro dele; ignorar sem registro some com dinheiro; planilha por e-mail não tem trilha nem dono."
reviravolta:
  momentoPct: 60
  texto: "O arquivo de um parceiro chega duplicado e, um minuto depois, uma versão parcial com metade das linhas. O que o seu desenho faz?"
  rubrica:
    - "Duplicado detectado por id e hash, sem processar duas vezes"
    - "Parcial detectado por trailer, contagem ou total de controle, e não usado como verdade"
    - "Dia do parceiro fica pendente, com alerta e dono, até chegar o arquivo completo"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Casou por chave de negócio, não por total"
  - "Tornou a ingestão de arquivos idempotente"
  - "Validou integridade do arquivo antes de usar (trailer, contagem, total)"
  - "Deu dono e prazo a cada divergência"
  - "Fez ajustes como lançamentos, nunca como edição"
---
## Enunciado

Desenhe a conciliação diária entre os registros internos do `fin-platform` e os arquivos que os
parceiros de pagamento mandam em D+1: cerca de {transacoesDiaMi} milhões de transações por dia.

Pergunte o que precisar antes de desenhar.

## Dicas

- `ledger-e-contabilidade/08` tem o método; `pagamentos-e-liquidacao/05` e `/07`, os arquivos.
- Arquivo de parceiro é entrada não confiável: valide antes de usar.

## Gabarito comentado

**Requisitos.** Casar cada transação; achar divergências com classe; tratar até D+2; aceitar
reenvio e correção; trilha de auditoria.

**Estimativas.** As divergências por dia crescem com o volume e a taxa; com os números maiores,
viram centenas de milhares — o que pede classificação automática, não planilha.

**Arquitetura.** Ingestão por arquivo, idempotente por id e hash; validação de trailer e totais;
normalização por parceiro para um formato canônico; casamento por chave de negócio com tolerâncias;
fila de divergências com dono e prazo; ajustes como lançamentos.

**Reviravolta.** O duplicado é descartado pelo hash; o parcial falha na validação de contagem ou
total e não é usado; o dia daquele parceiro fica pendente, com alerta, até o arquivo completo.

**Trade-offs.** Validar e normalizar por parceiro custa um adaptador por layout; em troca, um
arquivo ruim nunca vira verdade.
