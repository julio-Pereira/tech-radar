---
id: pix-10k-tps
titulo: "Iniciação de pagamento Pix a {tpsPico} TPS"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - spring-boot/06
  - kafka/05
  - system-design/09
  - system-design/15
conceitos: [idempotencia, idempotency-key, outbox, rpo]
parametros:
  tpsPico: { min: 2000, max: 20000, passo: 1000 }
  payloadKb: { min: 1, max: 4, passo: 1 }
  retencaoAnos: { valores: [5, 10] }
  rto: { valores: ["15min", "1h"] }
esclarecimentos:
  - pergunta: "Esse volume é o pico ou a média?"
    revela: "{tpsPico} TPS é o pico, na virada do dia 5 e em datas comemorativas. A média do dia é um terço disso."
    chave: true
  - pergunta: "Existe exigência de retenção dos registros?"
    revela: "Sim: {retencaoAnos} anos, com trilha de auditoria imutável."
    chave: true
  - pergunta: "O cliente pode reenviar a mesma iniciação?"
    revela: "Pode: em timeout, o app reenvia a mesma iniciação até 3 vezes, com a mesma chave."
    chave: true
  - pergunta: "Qual o tamanho de cada iniciação?"
    revela: "Cerca de {payloadKb} KB por iniciação, já com metadados e assinatura."
    chave: true
  - pergunta: "Qual o RTO acordado com o negócio?"
    revela: "{rto} para voltar a aceitar iniciações depois de uma falha regional."
    chave: false
  - pergunta: "Qual a cor do botão de confirmar?"
    revela: "Fora de escopo."
    chave: false
estimativas:
  - id: storage-total
    enunciado: "Armazenamento das iniciações durante todo o prazo de retenção exigido, só os dados brutos"
    unidade: TB
    formula: "(tpsPico / 3) * 86400 * 365 * retencaoAnos * payloadKb / 1e9"
  - id: particoes
    enunciado: "Partições mínimas do tópico de eventos, com cada consumidor processando 1.000 mensagens/s no pico"
    unidade: partições
    formula: "ceil(tpsPico / 1000)"
    tolerancia: 0.2
  - id: escritas-pico
    enunciado: "Escritas por segundo no banco no pico, gravando o pagamento e o registro do outbox"
    unidade: escritas/s
    formula: "tpsPico * 2"
    tolerancia: 0.2
decisoes:
  - pergunta: "Onde garantir que uma iniciação reenviada não gere dois pagamentos?"
    opcoes:
      - "Somente no cliente, com retry, backoff exponencial e jitter"
      - "Na borda, com a chave de idempotência gravada antes do efeito"
      - "No consumidor Kafka, descartando duplicadas pelo offset lido"
      - "No PSP recebedor, que rejeita sozinho qualquer duplicidade de envio"
    correta: 1
    explicacao: "Só a chave de idempotência gravada antes do efeito impede o segundo pagamento: o reenvio encontra a chave e devolve a mesma resposta. O retry do cliente é justamente o que causa a duplicidade, o offset não identifica a iniciação e o recebedor não conhece a sua intenção."
  - pergunta: "Como publicar o evento de pagamento iniciado sem perder nem inventar eventos?"
    opcoes:
      - "Publicar no Kafka e depois gravar no banco, na mesma requisição"
      - "Gravar no banco e publicar no Kafka numa transação distribuída 2PC"
      - "Gravar pagamento e evento na mesma transação, com outbox e relay"
      - "Gravar no banco e publicar logo depois, sem nenhum controle adicional"
    correta: 2
    explicacao: "O outbox grava o pagamento e o evento na mesma transação local, e o relay publica depois, pelo menos uma vez. Publicar antes inventa eventos de pagamentos que falharam; publicar depois sem controle perde eventos numa queda; 2PC entre banco e Kafka não é suportado na prática e acopla a disponibilidade dos dois."
  - pergunta: "Qual chave de partição usar no tópico de eventos de pagamento?"
    opcoes:
      - "Aleatória, para distribuir a carga de forma uniforme entre partições"
      - "O identificador do pagamento, para ordenar os eventos de cada um"
      - "O horário da requisição arredondado ao segundo, para agrupar picos"
      - "O código do banco recebedor, para cada PSP ter uma partição própria"
    correta: 1
    explicacao: "Os eventos de um mesmo pagamento precisam chegar em ordem, e a ordem só é garantida dentro de uma partição. O id do pagamento espalha bem a carga e mantém essa ordem. A aleatória quebra a ordem, o horário concentra o pico numa partição e o banco recebedor cria partições quentes."
reviravolta:
  momentoPct: 60
  texto: "O Banco Central passou a exigir RPO zero para transações liquidadas. O que muda no desenho?"
  rubrica:
    - "Replicação síncrona ou consenso no caminho de escrita do que é liquidado"
    - "Custo de latência explicitado e comparado com o orçamento"
    - "Escopo limitado ao que é liquidado, não a toda iniciação"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Separou requisitos funcionais de não funcionais antes de desenhar"
  - "Tratou a duplicidade de ponta a ponta, do app ao evento publicado"
  - "Definiu SLOs de latência e disponibilidade antes de escolher tecnologia"
  - "Explicou o que acontece quando o SPI ou o banco ficam lentos"
  - "Explicitou o que NÃO faria e por quê"
  - "Usou o pico, não a média, para dimensionar"
---
## Enunciado

Desenhe o serviço que recebe as iniciações de pagamento Pix do app do `fin-platform` e as
encaminha para liquidação. O volume esperado é de {tpsPico} TPS.

Antes de desenhar, pergunte o que precisar: só as perguntas que você fizer serão respondidas.

## Dicas

- O caso Pix ponta a ponta (`system-design/09`) é o ponto de partida; aqui o interesse é o que muda
  com os números sorteados.
- Siga o framework com *timebox* de `system-design/15`: esclarecer, estimar, desenhar, aprofundar.
- A duplicidade nasce no cliente, não no servidor: comece por ela.

## Gabarito comentado

**Requisitos.** Funcionais: aceitar a iniciação, devolver um identificador, publicar o evento para
os consumidores (antifraude, extrato, conciliação). Não funcionais: dimensionar pelo **pico**, não
pela média; nenhuma iniciação duplicada; retenção auditável pelo prazo exigido.

**Estimativas.** Com o pico informado e a média a um terço dele, o armazenamento cresce com a média,
o prazo de retenção e o tamanho da iniciação; as partições e as escritas no banco crescem com o
pico. Errar por usar a média no lugar do pico subdimensiona exatamente o momento que importa.

**Arquitetura.** API na borda com chave de idempotência gravada antes do efeito; gravação do
pagamento e do evento na mesma transação (outbox); relay publicando no Kafka com o id do pagamento
como chave; consumidores idempotentes do outro lado.

**Gargalos e modos de falha.** O banco de escrita é o primeiro gargalo no pico; o relay pode atrasar
sem perder evento; um SPI lento pede limite de concorrência e fila, não retry agressivo.

**Reviravolta.** RPO zero vale para o que é liquidado: replicação síncrona (ou consenso) só nesse
caminho, com o custo de latência medido contra o orçamento. Estender a toda iniciação encarece sem
benefício.

**Trade-offs.** Outbox troca latência de publicação por garantia de entrega; idempotência na borda
troca uma escrita a mais por nenhum pagamento duplicado.
