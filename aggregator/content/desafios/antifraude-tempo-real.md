---
id: antifraude-tempo-real
titulo: "Antifraude em tempo real a {tps} decisões/s"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - system-design/08
  - system-design/12
  - ml-em-producao/03
  - ml-em-producao/06
conceitos: [circuit-breaker, slo]
parametros:
  tps: { min: 500, max: 8000, passo: 500 }
  orcamentoMs: { valores: [100, 150] }
  featuresOnline: { min: 10, max: 60, passo: 10 }
esclarecimentos:
  - pergunta: "Qual o orçamento de latência da decisão?"
    revela: "{orcamentoMs} ms de ponta a ponta no p99; o modelo pode usar no máximo metade."
    chave: true
  - pergunta: "O que acontece se a decisão passar do orçamento?"
    revela: "O pagamento não espera: segue pela regra de contingência."
    chave: true
  - pergunta: "Quantas features o modelo usa por decisão?"
    revela: "{featuresOnline} features online, lidas de um feature store."
    chave: true
  - pergunta: "Qual o volume no pico?"
    revela: "{tps} decisões por segundo no pico."
    chave: true
  - pergunta: "Há exigência de explicar uma negativa?"
    revela: "Sim: toda negativa precisa de motivo registrado para revisão humana."
    chave: false
  - pergunta: "Qual a cor do alerta no painel?"
    revela: "Fora de escopo."
    chave: false
estimativas:
  - id: orcamento-modelo
    enunciado: "Tempo máximo do modelo dentro do orçamento"
    unidade: ms
    formula: "orcamentoMs / 2"
    tolerancia: 0.1
  - id: leituras-feature-store
    enunciado: "Leituras por segundo no feature store, se cada feature for uma leitura separada"
    unidade: leituras/s
    formula: "tps * featuresOnline"
decisoes:
  - pergunta: "O modelo não respondeu dentro do orçamento. O que fazer com a transação?"
    opcoes:
      - "Esperar o modelo responder, mesmo além do orçamento de latência"
      - "Decidir pelas regras de contingência no prazo e registrar a decisão"
      - "Aprovar todas as transações até o modelo voltar, sem registrar nada"
      - "Negar todas as transações até o modelo voltar, para não correr risco"
    correta: 1
    explicacao: "O orçamento é do pagamento, não do modelo: a contingência decide no prazo e deixa rastro para revisão. Esperar estoura a latência; aprovar ou negar tudo, sem registro, troca um problema técnico por perda ou por clientes barrados."
  - pergunta: "Como obter as features no caminho da decisão?"
    opcoes:
      - "Calcular todas as features na hora da transação, lendo o histórico"
      - "Ler features pré-calculadas de um store online, em lote por chave"
      - "Recalcular o modelo inteiro a cada transação com os dados do dia"
      - "Buscar as features no data lake analítico, que tem todo o histórico"
    correta: 1
    explicacao: "Features pré-calculadas num store online, lidas em lote, cabem no orçamento. Calcular na hora ou ir ao data lake não cabe; retreinar por transação não faz sentido."
  - pergunta: "Como isolar o pagamento de um modelo lento ou fora do ar?"
    opcoes:
      - "Chamar o modelo direto, sem timeout, para não perder nenhuma decisão"
      - "Timeout e circuit breaker no cliente do modelo, com fallback medido"
      - "Retry imediato três vezes em caso de erro, dentro da mesma requisição"
      - "Fila assíncrona, devolvendo a decisão ao pagador no dia seguinte"
    correta: 1
    explicacao: "Timeout curto e circuit breaker param de esperar um modelo doente, e o fallback é medido para se saber quanto custa. Sem timeout a fila de threads cresce; retry imediato multiplica a carga; decisão no dia seguinte não serve a pagamento instantâneo."
reviravolta:
  momentoPct: 60
  texto: "O serviço do modelo ficou fora por 20 minutos no pico. Falhar aberto ou fechado? Defenda por tipo de transação."
  rubrica:
    - "Decisão diferente por faixa de valor ou de risco, não uma regra única"
    - "Exposição a fraude no modo aberto estimada"
    - "Impacto no cliente do modo fechado estimado, com comunicação"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Dividiu o orçamento de latência entre as etapas, com números"
  - "Separou features online de offline e explicou a paridade"
  - "Definiu a contingência antes de precisar dela"
  - "Registrou motivo de toda negativa para revisão"
  - "Mediu o custo do fallback em fraude e em atrito"
---
## Enunciado

Desenhe o serviço de antifraude que decide, em tempo real, se um pagamento segue. Ele recebe até
{tps} decisões por segundo no pico.

Pergunte o que precisar antes de desenhar.

## Dicas

- É a prática do caso de `system-design/12`, com os números sorteados.
- Comece pelo orçamento de latência: ele decide quase todo o resto.

## Gabarito comentado

**Requisitos.** Decidir dentro do orçamento, sempre; explicar negativas; continuar decidindo, de
forma conhecida, quando o modelo falhar.

**Estimativas.** O modelo tem metade do orçamento. As leituras de features crescem com o volume e o
número de features, e é por isso que se lê em lote.

**Arquitetura.** Regras rápidas antes do modelo; features online pré-calculadas; cliente do modelo
com timeout e circuit breaker; contingência por regras; registro de toda decisão com motivo.

**Reviravolta.** Nem aberto nem fechado para tudo: transações de baixo valor e baixo risco seguem
pela contingência; as de alto valor esperam revisão ou são negadas com comunicação clara. O número
de fraude aceito e o de clientes barrados são estimados e explicitados.

**Trade-offs.** Contingência aceita algum risco para não parar o pagamento; o registro de motivo
custa armazenamento e paga a revisão e a regulação.
