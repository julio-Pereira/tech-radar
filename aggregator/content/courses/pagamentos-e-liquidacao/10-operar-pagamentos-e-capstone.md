---
id: operar-pagamentos-e-capstone
title: "Operar pagamentos e capstone"
summary: "Em pagamentos, 'no ar' não basta: o que importa é quantos pagamentos legítimos foram aprovados, em quanto tempo e por qual trilho — e o que se faz quando um trilho cai."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Pix"
    url: https://www.bcb.gov.br/estabilidadefinanceira/pix
---

## SLIs de negócio e de plataforma

Disponibilidade sozinha não diz muito sobre a saúde de um sistema de pagamentos — os indicadores
que realmente importam incluem **taxa de aprovação** (de todas as tentativas, quantas foram
aprovadas), o **funil** completo (iniciado → autorizado → liquidado, com a taxa de conversão entre
cada etapa), **latência por trilho** (cada trilho tem seu próprio perfil esperado), **taxa de
resultado desconhecido** (quanto do volume termina sem resposta clara dentro do tempo esperado), e
**tempo até a conciliação** (quanto tempo leva até confirmar que tudo bateu). Um sistema "no ar"
com taxa de aprovação caindo silenciosamente está falhando de um jeito que um simples *health
check* nunca detectaria.

## Sondas sintéticas por trilho

Uma **sonda sintética** executa, periodicamente e de forma automatizada, uma transação de teste
completa em cada trilho (usando os simuladores e dados sintéticos desta trilha, nunca dinheiro ou
participante real) — detectando degradação de um trilho específico antes que o volume real de
usuários a revele através de reclamações. Uma sonda por trilho, rodando continuamente, é o que
permite distinguir "o Pix está lento" de "o cartão está lento" sem esperar o volume de produção
confirmar.

## Degradação e roteamento quando um trilho cai

Quando um trilho específico degrada ou cai, a resposta correta normalmente não é "parar tudo" —
é **rotear** para uma alternativa viável (quando existe) e **avisar** claramente o cliente sobre a
limitação temporária, em vez de deixá-lo tentando repetidamente contra um trilho que não vai
responder. A política de degradação precisa estar definida **antes** do incidente, nos mesmos
termos de política de orçamento de erro já vistos em observabilidade — não inventada sob pressão
no meio de uma crise real.

## Incidentes de infraestrutura de terceiros

Quando o problema está na infraestrutura de um terceiro (o SPI, uma bandeira, um PSP externo), a
instituição não controla a correção — mas controla inteiramente a **comunicação**: avisar
clientes afetados, atualizar status publicamente, e documentar o impacto, mesmo sem poder acelerar
a resolução do lado de fora. Tratar um incidente de terceiro com o mesmo silêncio que seria
inaceitável num incidente interno transfere, injustamente, a frustração do cliente para a própria
instituição.

## Homologação e certificação

Toda mudança na integração com um arranjo ou provedor merece passar por um **catálogo de casos de
teste versionado como código** antes de ir para produção — não uma checagem manual ad-hoc. Esse
catálogo é o que permite detectar, de forma automatizada, se uma mudança no lado do arranjo (ou uma
mudança própria) quebrou um comportamento esperado, antes que o volume real de produção a
descubra.

## Calendário de mudanças do ecossistema

Arranjos e infraestruturas de pagamento publicam **janelas de mudança** (novas versões de manual,
períodos obrigatórios de adequação) com antecedência — **conferir** o calendário vigente do seu
ecossistema específico. Perder uma dessas janelas não é um detalhe administrativo: pode significar
operar fora de conformidade a partir de uma data definida externamente, sem controle sobre o
prazo.

## DR, RPO e RTO por trilho

Cada trilho de pagamento tem seu próprio perfil de **recuperação de desastre**: o **RPO**
(*recovery point objective* — quanto dado pode se perder) e o **RTO** (*recovery time objective* —
quanto tempo até restaurar o serviço) para o Pix, operando 24x7, são tipicamente mais exigentes do
que para um trilho em lote como boleto, que já tem alguma folga embutida no próprio ciclo de
compensação.

## Custo por transação e evolução

O **custo por transação** de cada trilho (infraestrutura, tarifas pagas a terceiros, suporte) é a
métrica que liga diretamente a operação técnica deste marco à linguagem de negócio — reduzir esse
custo em escala tem efeito multiplicado pelo volume. E a evolução natural do ecossistema de
pagamentos (novos trilhos, novos métodos) exige que a arquitetura de orquestração do marco 09 seja
**extensível**: adicionar um novo trilho não deveria exigir reescrever a máquina de estados central
do pagamento, só implementar a integração específica contra o modelo já existente.

## Exemplo numa fintech

O SPI simulado começa a responder com lentidão crescente; o funil de pagamentos mostra a quebra
especificamente no passo "autorizado → liquidado", e a taxa de resultado desconhecido sobe —
sinais que, juntos, apontam exatamente para onde o problema está, sem precisar esperar reclamações
de clientes para localizá-lo.

## Hands-on

**Tutorial.** Implemente SLOs e sondas sintéticas por trilho sobre os simuladores já construídos
nos marcos anteriores.

**Desafio.** Implemente a degradação automática de roteamento quando um trilho simulado falha, e o
calendário de mudanças do ecossistema.

**Invariantes testáveis**

1. O **SLO de aprovação** é calculado sobre uma massa sintética de transações, e uma degradação
   injetada **viola** esse SLO de forma detectável.
2. A regra de alerta correspondente passa em `promtool test rules` contra casos de teste
   sintéticos representando violação e não-violação do SLO.
3. Com o Pix simulado indisponível, o orquestrador **roteia ou degrada** conforme a política
   configurada, sem perder nenhum pedido e sem duplicar nenhuma cobrança (conservação).
4. O catálogo de casos de homologação roda como suíte automatizada e **falha** quando um caso do
   arranjo simulado não está coberto.
5. `make rails-review` executa as verificações de todos os marcos anteriores (01-09) e falha se
   qualquer uma delas falhar.

**Complemento.** Escreva o *runbook* "o Pix está lento" — os passos exatos que você seguiria,
incluindo quais sinais consultar primeiro e quando escalar.

**Checagem**

1. Por que a taxa de aprovação e o funil completo revelam problemas que um simples *health check*
   de disponibilidade não revelaria?
2. Por que a resposta correta a um trilho degradado normalmente é rotear e avisar, em vez de
   simplesmente parar tudo?
3. O que a instituição controla, e o que não controla, quando o problema está na infraestrutura de
   um terceiro — e por que a comunicação ainda importa nesse caso?
4. Por que RPO e RTO diferem entre um trilho 24x7 como o Pix e um trilho em lote como o boleto?

> **Reencontro — `observabilidade/08`, `/12`, `/13`, `/15`.** As métricas de negócio daquele
> primeiro marco são exatamente os SLIs de funil e taxa de aprovação que este marco aplica a
> pagamentos; o SLO e orçamento de erro de `observabilidade/12` e os alertas e plantão de
> `observabilidade/13` sustentam a degradação automática deste marco; e o processo de incidente
> até a causa de `observabilidade/15` é o que se
> aplica quando um trilho cai de fato, não apenas na simulação de sonda sintética.

A observabilidade e depuração de `kubernetes/12` é a camada de infraestrutura sobre a qual as
sondas sintéticas e os painéis deste marco, na prática, são implantados e operados.

## Principais aprendizados

- Disponibilidade sozinha não revela a saúde de um sistema de pagamentos — taxa de aprovação,
  funil e taxa de resultado desconhecido são os sinais que realmente importam.
- Sondas sintéticas por trilho detectam degradação antes que o volume real de usuários a revele
  por reclamação.
- A resposta a um trilho degradado normalmente é rotear e avisar, com a política definida antes
  do incidente, não inventada sob pressão.
- Num incidente de infraestrutura de terceiro, a instituição não controla a correção, mas controla
  inteiramente a comunicação.
- RPO e RTO variam por trilho — um sistema 24x7 como o Pix exige recuperação muito mais rápida do
  que um trilho em lote como o boleto.

## Capstone

O `fin-rails` é a sua camada de trilhos de pagamento executável — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ela fica pronta, consolidando os simuladores e o
orquestrador de todos os blocos anteriores.

**Entrega**

- [ ] `fluxo/` com participantes, contas e os quatro cenários do marco 01, com conservação provada
- [ ] `sim-spi/` com DICT, QR Code e mensagens didáticas (marco 02), e agendamento/recorrência/MED
      (marco 03)
- [ ] `sim-cartoes/` com autorização, *timeout*/reversão e o `cofre/` isolando o PAN (marco 04), e
      compensação/agenda de recebíveis/registro (marco 05)
- [ ] `sim-boleto/` com geração, *parsing*, pagamento e detecção de duplicidade (marco 06)
- [ ] `liquidez/` com projeção de posição, *netting* e colchão (marco 07)
- [ ] Máquina de disputas com prazos, retenção e reapresentação (marco 08)
- [ ] `orquestrador/` com dois provedores simulados, roteamento, *webhooks* e camada anticorrupção
      (marco 09)
- [ ] SLOs, sondas sintéticas por trilho, calendário de mudanças e `make rails-review` (este marco)

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Todo pagamento simulado termina em **um** estado terminal e conserva o dinheiro (Σ in = Σ
      out, taxas incluídas)
- [ ] Informação e fundos são modelados separadamente em todo cenário; nenhum evento de informação
      move saldo
- [ ] Toda regra de trilho (limite, prazo, horário, código) vem de configuração marcada
      "conferir"; trocar o valor não exige mudar código
- [ ] Resultado desconhecido é resolvido por consulta ou reversão, nunca por nova cobrança às
      cegas, em **todos** os trilhos simulados
- [ ] Nenhum PAN, chave Pix ou documento real aparece em log, métrica, arquivo ou teste fora do
      `cofre/` — verificado por varredura automática
- [ ] Devoluções, estornos e disputas respeitam seus limites de valor e de prazo em todo cenário
      testado
- [ ] Retentativa entre provedores nunca duplica cobrança; *webhooks* têm assinatura, janela de
      tempo e idempotência
- [ ] Existe projeção de liquidez com alerta e colchão para o cenário 24x7
- [ ] `make rails-review` agrega as verificações de todos os marcos e falha se qualquer uma falhar
- [ ] Nenhum fornecedor real integrado, nenhum PAN real, nenhuma chave Pix real em nenhum momento

**Antes de fechar**, rode o *game day* do `PROJETO.md` (os sete cenários) e escreva um
*post-mortem* de uma página para cada um — inclusive se nada tiver quebrado. E responda por
escrito à pergunta final da trilha: **dos dez comportamentos que você provou contra simuladores,
qual é o que um participante real mais provavelmente quebraria — e que métrica, medida na primeira
semana de homologação, mostraria isso?**
