---
id: storage-eventos-pix
titulo: "Quanto custa guardar os eventos do Pix"
tipo: estimativa
nivel: senior
duracaoMin: 20
prerequisitos:
  - kafka/02
  - kafka/12
  - system-design/02
conceitos: []
parametros:
  eventosDiaMi: { min: 50, max: 400, passo: 50 }
  bytesEvento: { valores: [600, 1200, 2000] }
  retencaoDias: { valores: [7, 30] }
  fatorPico: { valores: [3, 4] }
esclarecimentos:
  - pergunta: "O volume diário é médio ou de pico?"
    revela: "{eventosDiaMi} milhões de eventos é a média diária; o pico de uma hora chega a {fatorPico}× a média."
    chave: true
  - pergunta: "Qual o tamanho de cada evento?"
    revela: "{bytesEvento} bytes, já serializado e sem compressão."
    chave: true
  - pergunta: "Por quanto tempo o tópico guarda os eventos?"
    revela: "{retencaoDias} dias no Kafka; depois disso, o histórico vai para o data lake."
    chave: true
  - pergunta: "Qual o fator de replicação do cluster?"
    revela: "3, com min.insync.replicas igual a 2."
    chave: true
estimativas:
  - id: eventos-por-segundo
    enunciado: "Eventos por segundo na média do dia"
    unidade: eventos/s
    formula: "eventosDiaMi * 1e6 / 86400"
    tolerancia: 0.15
  - id: banda-pico
    enunciado: "Banda de escrita no pico, antes da replicação"
    unidade: MB/s
    formula: "eventosDiaMi * 1e6 / 86400 * fatorPico * bytesEvento / 1e6"
  - id: storage-kafka
    enunciado: "Disco total do cluster para a retenção, contando as 3 réplicas"
    unidade: TB
    formula: "eventosDiaMi * 1e6 * bytesEvento * retencaoDias * 3 / 1e12"
  - id: particoes
    enunciado: "Partições mínimas para o pico, com cada consumidor processando 1.000 eventos/s"
    unidade: partições
    formula: "ceil(eventosDiaMi * 1e6 / 86400 * fatorPico / 1000)"
    tolerancia: 0.2
decisoes:
  - pergunta: "Qual número usar para dimensionar a banda e as partições?"
    opcoes:
      - "A média do dia, porque o cluster aguenta picos curtos com folga"
      - "O pico de uma hora, porque é nele que o atraso dos consumidores dói"
      - "A média do mês, porque suaviza datas comemorativas e erros de medida"
      - "O maior segundo já visto, porque garante que nada nunca fique na fila"
    correta: 1
    explicacao: "Banda e partições respondem ao pico sustentado, onde o atraso dos consumidores aparece. A média subdimensiona; a média mensal esconde o problema; o pior segundo já visto superdimensiona por um evento que uma fila curta absorve."
  - pergunta: "O que mais reduz o disco do cluster sem perder garantia de entrega?"
    opcoes:
      - "Baixar o fator de replicação de 3 para 1 nos tópicos de eventos"
      - "Ativar compressão no produtor e mover o histórico para o data lake"
      - "Aumentar o número de partições para espalhar os dados entre discos"
      - "Desligar o min.insync.replicas para acelerar as escritas no pico"
    correta: 1
    explicacao: "Compressão no produtor reduz bytes no fio e no disco, e o histórico além da retenção vai para armazenamento mais barato. Replicação 1 e min.insync desligado trocam disco por perda de dados; mais partições não reduzem o total armazenado."
  - pergunta: "O volume dobra no ano que vem. O que muda primeiro?"
    opcoes:
      - "Nada: disco, banda e partições já têm folga para qualquer crescimento"
      - "Só o disco, porque banda e partições não dependem do volume diário"
      - "Banda, disco e partições, que crescem em proporção ao volume"
      - "Só as partições, porque disco e banda são resolvidos pela compressão"
    correta: 2
    explicacao: "As três estimativas são lineares no volume: dobrar eventos dobra banda, disco e partições necessárias. Compressão muda o fator, não a proporção."
entregavel:
  secoesObrigatorias: [Premissas, Calculos, Resultado, Sensibilidade]
rubrica:
  - "Escreveu as premissas antes dos números (pico, tamanho, retenção, replicação)"
  - "Converteu unidades sem pular passos (milhões, bytes, MB, TB)"
  - "Separou o que depende do pico do que depende da média"
  - "Arredondou para cima onde faltar capacidade custa caro (partições)"
  - "Disse qual premissa mais mexe no resultado (sensibilidade)"
---
## Enunciado

O `fin-platform` publica no Kafka um evento a cada mudança de estado de um pagamento Pix: cerca de
{eventosDiaMi} milhões de eventos por dia. Estime banda, disco e partições do tópico.

Só números: nada de desenho. Pergunte as premissas que faltarem.

## Gabarito comentado

**Premissas.** Média diária, fator de pico, tamanho do evento, retenção e replicação. Escrever as
premissas primeiro é metade da nota: é o que o entrevistador corrige quando o número sai errado.

**Cálculos.** Eventos por segundo na média = eventos por dia ÷ 86.400. A banda de pico multiplica
isso pelo fator de pico e pelo tamanho. O disco multiplica eventos por dia, tamanho, dias de
retenção e réplicas. As partições dividem o pico pela vazão de um consumidor, arredondando para
cima.

**Sensibilidade.** Tamanho do evento e retenção mexem linearmente no disco; o fator de pico mexe na
banda e nas partições, não no disco. Compressão no produtor é a alavanca mais barata.
