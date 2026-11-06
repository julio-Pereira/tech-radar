---
id: extrato-open-finance
titulo: "API de extrato no Open Finance com até {reqsPorSeg} requisições/s"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - open-finance-brasil/04
  - open-finance-brasil/05
  - open-finance-brasil/06
  - system-design/10
  - system-design/15
conceitos: [fapi, mtls, slo]
parametros:
  reqsPorSeg: { min: 200, max: 3000, passo: 100 }
  transacoesMes: { valores: [80, 150, 400] }
  tamanhoPagina: { valores: [25, 50, 100] }
  janelaMeses: { valores: [3, 12] }
esclarecimentos:
  - pergunta: "Qual o volume de chamadas das receptoras no pico?"
    revela: "{reqsPorSeg} requisições por segundo no pico, concentradas no início do mês."
    chave: true
  - pergunta: "Quantas transações tem uma conta típica?"
    revela: "Cerca de {transacoesMes} transações por mês por conta."
    chave: true
  - pergunta: "Quanto histórico a receptora pode pedir?"
    revela: "Até {janelaMeses} meses, em páginas de {tamanhoPagina} transações."
    chave: true
  - pergunta: "O consentimento pode mudar no meio de uma consulta?"
    revela: "Pode: o cliente revoga quando quiser, e a revogação vale na hora."
    chave: true
  - pergunta: "Existe exigência de desempenho?"
    revela: "Sim, há metas de disponibilidade e latência no padrão do ecossistema (confira os números vigentes)."
    chave: false
  - pergunta: "Qual a cor do logo da receptora?"
    revela: "Fora de escopo."
    chave: false
estimativas:
  - id: paginas-por-consulta
    enunciado: "Páginas para uma receptora ler todo o histórico permitido de uma conta típica"
    unidade: páginas
    formula: "ceil(transacoesMes * janelaMeses / tamanhoPagina)"
    tolerancia: 0.2
  - id: registros-pico
    enunciado: "Transações lidas por segundo no pico, se cada requisição devolver uma página cheia"
    unidade: transações/s
    formula: "reqsPorSeg * tamanhoPagina"
decisoes:
  - pergunta: "Quando validar o consentimento durante a paginação?"
    opcoes:
      - "Só na primeira página, guardando o resultado até o fim da paginação"
      - "A cada página, contra o estado atual do consentimento no transmissor"
      - "Uma vez por dia, num job que expira os cursores de paginação abertos"
      - "Só quando a receptora pede, pois o consentimento é responsabilidade dela"
    correta: 1
    explicacao: "O consentimento pode ser revogado a qualquer momento e a revogação vale na hora: cada página precisa conferir o estado atual. Validar só no início entrega dados depois da revogação; o job diário chega tarde; a responsabilidade de não entregar é do transmissor."
  - pergunta: "Como paginar um extrato que recebe transações novas durante a leitura?"
    opcoes:
      - "Offset e limite, recalculando a posição a cada nova página pedida"
      - "Cursor opaco por chave estável, como data e id da transação"
      - "Número de página fixo, calculado a partir do total no início da leitura"
      - "Devolver o extrato inteiro numa só resposta, sem paginação nenhuma"
    correta: 1
    explicacao: "Cursor por chave estável não pula nem repete transações quando entram linhas novas. Offset desloca a janela a cada inserção; o total fixo fica velho; resposta única estoura tamanho e latência."
  - pergunta: "Qual cache faz sentido para essa API?"
    opcoes:
      - "Cache compartilhado entre receptoras, aproveitando consultas iguais"
      - "Cache curto por consentimento, invalidado na revogação dele"
      - "Nenhum limite de taxa, já que o cache absorve qualquer pico de chamadas"
      - "Cache longo de um dia para todo extrato, porque o passado não muda mais"
    correta: 1
    explicacao: "O dado pertence a um consentimento: o cache precisa estar preso a ele e morrer com a revogação. Compartilhar entre receptoras vaza dados; cache não substitui limite de taxa; um dia de cache entrega dados depois de uma revogação."
reviravolta:
  momentoPct: 55
  texto: "O cliente revoga o consentimento enquanto uma receptora está na página 3 de uma leitura longa. O que acontece com as próximas páginas e com o que já foi entregue?"
  rubrica:
    - "Próximas páginas negadas com o erro do padrão, sem vazar dados"
    - "Cache e cursores ligados ao consentimento invalidados"
    - "O que já foi entregue fica registrado; a responsabilidade pelo uso passa à receptora"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Tratou o consentimento como parte de toda leitura, não só da primeira"
  - "Escolheu paginação estável e explicou por quê"
  - "Dimensionou pelo pico do início do mês"
  - "Separou limite de taxa por receptora do cache"
  - "Citou mTLS e FAPI como requisitos de acesso, não como detalhe"
---
## Enunciado

Desenhe, do lado do transmissor, a API que entrega o extrato de transações de uma conta às
receptoras do Open Finance. No pico, as receptoras somam até {reqsPorSeg} requisições por segundo.

Pergunte o que precisar antes de desenhar.

## Dicas

- É a prática do caso de `system-design/10`, com os números sorteados.
- O consentimento é o centro do desenho: tudo o que você guardar precisa saber a qual consentimento
  pertence.

## Gabarito comentado

**Requisitos.** Entregar o extrato do período consentido, paginado, só enquanto o consentimento
estiver ativo; isolar receptoras entre si; cumprir as metas de desempenho do ecossistema.

**Estimativas.** As páginas por consulta crescem com transações por mês e janela de histórico; as
transações lidas por segundo crescem com o pico e o tamanho da página. O início do mês concentra o
pico.

**Arquitetura.** Borda com mTLS e validação FAPI; checagem do consentimento a cada página; cursor
opaco por (data, id); réplica de leitura ou visão do extrato; cache curto por consentimento;
limite de taxa por receptora.

**Reviravolta.** A revogação invalida cursores e cache daquele consentimento, e as próximas páginas
recebem o erro previsto no padrão. O que já foi entregue não "volta": fica registrado.

**Trade-offs.** Checar o consentimento a cada página custa uma leitura a mais; em troca, nenhum dado
sai depois da revogação.
