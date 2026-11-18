---
id: escolher-estrategia-de-release
titulo: "Três mudanças, três estratégias: canary, sombra ou teste A/B"
tipo: system-design
nivel: senior
duracaoMin: 40
prerequisitos:
  - entrega-continua-e-devops/07
  - kubernetes/13
conceitos: [srm, slo]
parametros:
  base: { valores: [88, 90, 92] }
  mde: { valores: [0.5, 1, 2] }
  clientesDia: { min: 5000, max: 50000, passo: 5000 }
esclarecimentos:
  - pergunta: "A migração do ledger é compatível com a versão anterior do serviço?"
    revela: "Sim, se feita em passos: a coluna nova entra opcional, a versão nova grava nas duas e a antiga ignora a nova. A remoção da coluna velha fica para depois."
    chave: true
  - pergunta: "O que o provedor novo de antifraude decide?"
    revela: "Aprova ou nega cada Pix acima de R$ 1.000. Uma negação indevida bloqueia o pagamento de um cliente legítimo."
    chave: true
  - pergunta: "Dá para chamar o provedor novo sem usar a resposta dele?"
    revela: "Sim: o contrato permite chamadas em sombra, cobradas por consulta, e a resposta pode ser só registrada."
    chave: true
  - pergunta: "Qual métrica o produto quer melhorar com a tela nova de confirmação?"
    revela: "A taxa de conclusão do Pix iniciado na tela, hoje em {base}%. O produto só se importa com ganhos a partir de {mde} ponto percentual."
    chave: true
  - pergunta: "Quantos clientes passam pela tela de confirmação por dia?"
    revela: "{clientesDia} clientes distintos por dia, com um ciclo semanal claro: a conclusão cai no fim de semana."
    chave: true
  - pergunta: "A tela nova muda tarifa ou limite?"
    revela: "Não: só o fluxo de confirmação. Tarifa e limite estão na lista de atributos que nenhum experimento pode variar."
    chave: false
  - pergunta: "O time pode olhar o painel do experimento todo dia?"
    revela: "Pode olhar as métricas de guarda todo dia; a métrica principal é lida no fim do período combinado."
    chave: false
estimativas:
  - id: amostra-por-variante
    enunciado: "Clientes por variante para detectar {mde} ponto sobre a base de {base}% (5% bilateral, poder de 80%)"
    unidade: clientes
    formula: "16 * base * (100 - base) / mde ^ 2"
    tolerancia: 0.25
  - id: duracao-dias
    enunciado: "Duração do teste em dias, com duas variantes e pelo menos uma semana inteira"
    unidade: dias
    formula: "max(7, ceil(2 * 16 * base * (100 - base) / mde ^ 2 / clientesDia))"
    tolerancia: 0.25
decisoes:
  - pergunta: "Como entregar a migração do esquema do ledger?"
    opcoes:
      - "Migração compatível num passo próprio, depois o código por canary com rollback"
      - "Teste A/B por cliente, para comparar o desempenho do esquema novo com o do antigo"
      - "Blue/green trocando código e banco juntos, para voltar tudo de uma vez se der errado"
      - "Rolling sem análise, porque mudança de esquema não mexe em erro nem em latência"
    correta: 0
    explicacao: "O rollback de código não desfaz migração. Por isso a migração vem antes, compatível com as duas versões, e o código vai por canary, que pode voltar. O A/B responde se algo é melhor, e a pergunta aqui é se é seguro. Trocar o banco junto no blue/green junta o que não volta com o que volta. E migração mexe, sim, em erro e latência."
  - pergunta: "Como entrar com o provedor novo de antifraude?"
    opcoes:
      - "Teste A/B por cliente durante quatro semanas, com a conversão como métrica principal"
      - "Sombra primeiro, comparando as decisões; depois canary, com a negação como guarda"
      - "Troca de uma vez por blue/green, com o rollback pronto se as reclamações subirem"
      - "Flag ligada só para funcionários por um mês, e depois para todos os clientes de uma vez"
    correta: 1
    explicacao: "A sombra mede a concordância entre os dois provedores sem afetar nenhum cliente. O canary depois limita o dano de uma negação indevida, com a taxa de negação e a latência como sinais. O A/B por quatro semanas expõe metade dos clientes a um decisor ainda não validado. A troca de uma vez só descobre o problema pelas reclamações. E funcionários não são uma amostra dos pagamentos reais."
  - pergunta: "Como decidir se a tela nova de confirmação é melhor?"
    opcoes:
      - "Canary de 5% das requisições por uma hora, promovendo se a conclusão subir no período"
      - "Ligar para todos e comparar a conclusão com a da semana anterior, sem grupo de controle"
      - "Teste A/B por cliente, com duração calculada antes e erro e latência p95 como guarda"
      - "Teste A/B por requisição, que chega ao tamanho de amostra na metade do tempo"
    correta: 2
    explicacao: "A pergunta é de produto. Por isso a unidade é o cliente, que vê sempre a mesma tela, e a duração vem do tamanho de amostra, com pelo menos uma semana inteira. O canary de uma hora não tem amostra nem cliente fixo. Comparar com a semana anterior mistura a tela com tudo o que mudou. E dividir por requisição mostra as duas telas à mesma pessoa."
  - pergunta: "O que encerra o teste A/B antes do fim do período combinado?"
    opcoes:
      - "A métrica principal ficar estatisticamente significativa no terceiro dia do teste"
      - "Uma métrica de guarda fora da tolerância, ou a proporção fora do 50/50"
      - "O painel mostrar a variante B à frente da A em todos os dias de uma semana"
      - "O time de produto pedir o resultado antes, para a reunião de planejamento do mês"
    correta: 1
    explicacao: "Guarda e SRM param o teste: a guarda protege a operação, e o SRM diz que a atribuição ou a coleta está errada. Parar no primeiro resultado significativo, ou numa sequência de dias favoráveis, é espiar, e espiar infla o falso positivo. A agenda do produto não muda a estatística."
reviravolta:
  momentoPct: 60
  texto: "Na segunda semana do teste da tela, o painel mostra 52,8% dos clientes na variante B, com 50/50 configurado. A conclusão de B está 1,5 ponto acima da de A, e o produto quer declarar vitória hoje."
  rubrica:
    - "Reconheceu a proporção quebrada (SRM) e disse que nenhuma conclusão vale até a causa ser achada"
    - "Listou causas prováveis: evento perdido numa variante, redirecionamento, filtro de robôs, atribuição que muda no meio"
    - "Recusou parar cedo pelo resultado e propôs corrigir e recomeçar com um período novo"
entregavel:
  secoesObrigatorias: [Estrategias, Sinais, CriteriosDeParada, Estimativas, TradeOffs]
rubrica:
  - "Separou as perguntas: 'é seguro?' para a migração e o antifraude, 'é melhor?' para a tela"
  - "Pôs a migração compatível antes do código e explicou que o rollback de código não a desfaz"
  - "Usou a sombra para validar o provedor novo antes de qualquer tráfego real, e o canary depois"
  - "Escolheu o cliente como unidade do teste A/B e calculou amostra e duração antes de começar"
  - "Deu, para cada mudança, o sinal e o critério de parada, com as métricas de guarda do teste A/B"
---
## Enunciado

Três mudanças vão para produção no mesmo trimestre, no time de Pix:

1. uma migração de esquema no ledger;
2. a troca do provedor de antifraude;
3. uma tela nova de confirmação do Pix.

Para cada uma, diga qual estratégia usar, qual sinal observar e o que faz parar ou voltar. Pergunte o
que precisar.

## Dicas

- `entrega-continua-e-devops/07` separa o *canary* ("é seguro?") do teste A/B ("é melhor?"), e
  `kubernetes/13` mostra o *canary* com análise e o *blue-green*.
- O tamanho de amostra de uma proporção com 5% bilateral e poder de 80% tem uma aproximação de bolso:
  16 · p(1 − p) / δ² por variante.

## Gabarito comentado

As três mudanças pedem três respostas diferentes, e o que a banca avalia é a **pergunta** que cada uma
faz.

**A migração** pergunta "é seguro?", e o que não volta vem antes. A migração entra num passo próprio,
compatível com as duas versões: expandir, migrar, contrair. Depois, o código vai por *canary*, com a
análise de erro e latência do marco 07 e o *rollback* de código pronto. Isso funciona porque a versão
antiga continua lendo o banco. O *blue-green* não salva uma migração incompatível: os dois lados usam o
mesmo banco.

**O antifraude** também pergunta "é seguro?", mas o dano é de negócio: uma negação indevida bloqueia um
cliente legítimo. Por isso entra primeiro em **sombra**. O provedor novo recebe as mesmas consultas e só
registra a resposta, e o time mede a concordância com o atual, sem afetar ninguém. Depois vem o
*canary* por peso, com a taxa de negação e a latência como sinais e um critério de reversão
automático.

**A tela** pergunta "é melhor?". É teste A/B: a atribuição é por cliente, com sal próprio, e a
conclusão do Pix é a métrica principal. Erro e latência p95 são as guardas, avaliadas pelo mesmo
decisor do *canary*. Com base `p` e efeito mínimo `δ`, a amostra por variante é cerca de
16 · p(1 − p) / δ². O 16 vem de 2 · (1,96 + 0,84)² ≈ 15,7, com 5% bilateral e poder de 80%. A duração é
o dobro da amostra dividido pelos clientes por dia, e nunca menos de uma semana inteira, por causa do
ciclo semanal. Tudo fica registrado antes de começar.

**A reviravolta** é um SRM: 52,8% numa variante configurada em 50/50, com milhares de clientes, não é
acaso. Algo perde eventos ou move clientes, e a diferença de 1,5 ponto pode vir só disso. A resposta
forte para tudo, procura a causa (evento perdido numa variante, redirecionamento, filtro de robôs,
atribuição que muda), corrige e recomeça com um período novo.

Erros comuns:

- usar *canary* para decidir se a tela converte mais;
- usar teste A/B para validar uma migração;
- dividir o experimento por requisição;
- parar no primeiro número bom;
- variar tarifa ou limite num experimento.
