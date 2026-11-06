---
id: notificacoes-em-massa
titulo: "Notificações para {clientesMi} milhões de clientes"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos:
  - system-design/11
  - kafka/06
  - arquitetura-eventos/08
conceitos: [idempotencia, idempotency-key]
parametros:
  clientesMi: { min: 5, max: 60, passo: 5 }
  canais: { valores: [2, 3] }
  provedorPorSeg: { valores: [5000, 20000] }
esclarecimentos:
  - pergunta: "Quantos clientes podem receber notificações?"
    revela: "{clientesMi} milhões de clientes com o app instalado."
    chave: true
  - pergunta: "Quais canais existem?"
    revela: "{canais} canais: push e e-mail, e SMS quando são 3."
    chave: true
  - pergunta: "O provedor de push tem limite?"
    revela: "Aceita {provedorPorSeg} mensagens por segundo, por contrato."
    chave: true
  - pergunta: "O cliente pode escolher o que recebe?"
    revela: "Pode: escolhe canais e tipos; transacional e marketing têm regras diferentes."
    chave: true
  - pergunta: "Há restrição de horário?"
    revela: "Marketing só entre 8h e 21h; transacional a qualquer hora."
    chave: false
  - pergunta: "Qual o som da notificação?"
    revela: "Fora de escopo."
    chave: false
estimativas:
  - id: tempo-push-todos
    enunciado: "Minutos para mandar um push a todos os clientes, no limite do provedor"
    unidade: min
    formula: "clientesMi * 1e6 / provedorPorSeg / 60"
  - id: particoes
    enunciado: "Partições mínimas do tópico de envio, com cada consumidor entregando 1.000 mensagens/s"
    unidade: partições
    formula: "ceil(provedorPorSeg / 1000)"
    tolerancia: 0.2
decisoes:
  - pergunta: "Como ordenar o que sai primeiro?"
    opcoes:
      - "Uma fila única por ordem de chegada, sem favorecer nenhum tipo"
      - "Filas separadas por prioridade, transacional antes de marketing"
      - "Marketing primeiro, porque é o volume maior e trava o resto depois"
      - "Prioridade definida pelo provedor de push, que conhece a própria carga"
    correta: 1
    explicacao: "Transacional (um Pix recebido) não pode esperar a campanha de marketing: filas separadas por prioridade garantem isso. Fila única deixa a campanha atrasar o aviso de pagamento; o provedor não conhece o seu negócio."
  - pergunta: "Quando checar preferências e opt-out?"
    opcoes:
      - "Só no cadastro, uma vez, e não mais durante o envio"
      - "No momento do envio, por canal e por tipo de notificação"
      - "Mandar para todos e deixar o cliente desligar no próprio celular"
      - "Só depois de uma reclamação, quando o cliente pede para sair"
    correta: 1
    explicacao: "A preferência muda a qualquer momento e vale por canal e tipo: confere-se no envio. Checar só no cadastro ignora mudanças; mandar para todos e esperar reclamação desrespeita a escolha do cliente."
  - pergunta: "Como evitar notificação duplicada quando o envio é repetido?"
    opcoes:
      - "Reenviar sem controle: notificação duplicada não faz mal a ninguém"
      - "Chave de idempotência por notificação, conferida antes do provedor"
      - "Desligar o retry, aceitando perder notificações em qualquer falha"
      - "Deixar o provedor deduplicar, já que todo provedor garante isso sozinho"
    correta: 1
    explicacao: "A chave de idempotência conferida antes de chamar o provedor torna o retry seguro. Duplicata de aviso de pagamento confunde e gera chamado; sem retry perdem-se avisos; nem todo provedor deduplica."
reviravolta:
  momentoPct: 60
  texto: "Um incidente de segurança exige avisar todos os clientes em 10 minutos, pelo canal mais rápido. O que muda?"
  rubrica:
    - "Fila de urgência que passa na frente de tudo, inclusive do transacional"
    - "Conta de capacidade: o provedor dá conta em 10 min? Se não, o que se faz"
    - "Aviso obrigatório não segue opt-out de marketing; envio registrado"
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica:
  - "Separou transacional de marketing em prioridade e em regra"
  - "Respeitou preferência e horário no momento do envio"
  - "Dimensionou pelo limite do provedor, não só pela base de clientes"
  - "Tornou o envio idempotente"
  - "Previu o que fazer quando o provedor recusa ou atrasa"
---
## Enunciado

Desenhe o sistema que envia notificações aos clientes do `fin-platform`: avisos de transação e
campanhas, para uma base de {clientesMi} milhões de clientes.

Pergunte o que precisar antes de desenhar.

## Dicas

- É a prática do caso de `system-design/11`, com os números sorteados.
- O limite do provedor, não a sua infraestrutura, costuma ser o gargalo.

## Gabarito comentado

**Requisitos.** Transacional rápido e sempre; marketing respeitando preferência e horário; nada
duplicado; registro do que foi enviado.

**Estimativas.** O tempo para notificar todos é a base dividida pelo limite do provedor — com os
números maiores, passa de uma hora. As partições acompanham a vazão de saída.

**Arquitetura.** Eventos de domínio viram pedidos de notificação; filas por prioridade; checagem de
preferência no envio; chave de idempotência por notificação; adaptadores por canal com limite de
taxa e retry com backoff.

**Reviravolta.** Fila de urgência acima de todas; se o provedor de push não dá conta em 10 minutos,
combinar canais, negociar capacidade de emergência com antecedência e escalonar pela exposição dos
clientes. O aviso obrigatório não segue opt-out de marketing.

**Trade-offs.** Filas separadas custam operação e garantem que a campanha não atrase o aviso de
pagamento.
