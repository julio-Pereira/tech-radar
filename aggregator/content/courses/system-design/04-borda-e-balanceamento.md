---
id: borda-e-balanceamento
title: "Borda e balanceamento"
summary: "Distribuir tráfego é distribuir risco; o algoritmo importa menos que o que acontece quando um backend degrada. Power of two choices, consistent hashing, e amplificação de retry."
estimatedMinutes: 60
references:
  - title: "The Tail at Scale (Dean & Barroso)"
    url: https://research.google/pubs/the-tail-at-scale/
  - title: "Envoy Proxy — documentation"
    url: https://www.envoyproxy.io/docs
---

## DNS e CDN: o que cabe na borda de uma fintech

**DNS** com TTL curto é o mecanismo de failover mais grosso que existe: trocar o registro A/AAAA
redireciona tráfego **novo**, mas conexões já estabelecidas e resolvedores que ignoram TTL (alguns
ainda existem) continuam batendo no destino antigo por minutos. Não é um substituto para health
check em tempo real — é a primeira linha de defesa contra uma região inteira fora do ar, não contra
um backend individual degradado.

**CDN** numa fintech serve o que é público e estático de verdade — assets do app, página de
marketing, documentação de API pública. Dado de conta, saldo, qualquer coisa que exija autenticação
e seja específica do cliente não cabe em CDN: cachear isso é o tipo de erro que vira notícia.

## L4 × L7, e quem faz o quê

**L4** (transporte, TCP/UDP) balanceia sem olhar o conteúdo da requisição — rápido, barato, cego
a rota ou a cabeçalho. **L7** (aplicação, HTTP) decide por path, header, versão de API — o
roteamento inteligente que uma fintech com múltiplas versões de contrato (marco 05) precisa. A
pilha típica: **DNS** manda para uma região; o **Load Balancer** (L4 ou L7, dependendo do provedor)
distribui entre zonas; o **gateway** (L7, API Management — marco 06) decide por rota e aplica
política; o **mesh**, se existir, balanceia entre instâncias do mesmo serviço, dentro do cluster.
Colocar lógica de negócio no LB é o erro clássico — ele deve rotear, não decidir.

## Algoritmos: o que cada um faz quando um backend degrada

**Round-robin** distribui igualmente, cego à carga real — se um backend está lento, ele continua
recebendo a mesma fatia que os outros, e a fila nele cresce. **Menos conexões** (*least
connections*) evita isso olhando quantas requisições cada backend já tem em voo — melhor, mas
caro de manter exato em escala (contagem distribuída).

**Power of two choices (P2C)**: escolher **dois** backends aleatórios e mandar para o menos
carregado dos dois. A elegância é estatística: com `d=1` (aleatório puro), a variância de carga é
alta; com `d=2`, a melhoria é exponencial sobre `d=1`; com `d=3`, só um fator constante a mais sobre
`d=2` — por isso P2C é o ponto de maior custo-benefício, sem precisar de estado global de carga de
todos os backends.

**Hash consistente com nós virtuais** resolve o problema de `hash(chave) % N`: quando `N` muda
(escala, falha de um nó), **quase tudo** remapeia — o oposto do que se quer. Um anel consistente,
com `N` posições virtuais por nó real, faz com que adicionar um nó mova só a fração que cabe a ele,
deixando o resto intocado.

## Health check, ejeção e *connection draining*

**Health check ativo** (o LB pergunta periodicamente "você está bem?") pega falha antes do
tráfego real bater nela; **passivo** (observar taxa de erro do tráfego real) pega mais rápido, mas
cobra com requisições reais falhando primeiro. **Ejeção de outlier** tira automaticamente da
rotação um backend com taxa de erro anormal — com um teto de segurança: nunca ejetar mais que uma
fração do pool, porque ejetar demais sob um problema correlacionado (todos degradando juntos)
transforma degradação em indisponibilidade total.

**Connection draining**: ao remover um backend da rotação (deploy, escala para baixo), parar de
mandar tráfego **novo** para ele, mas deixar as conexões **em andamento** terminarem — derrubar
conexão ativa no meio é o jeito mais barato de gerar erro 5xx numa janela de deploy perfeitamente
evitável.

## Amplificação de retry e orçamento de retry

Retry sem controle é o jeito mais eficiente de transformar uma degradação parcial numa queda total:
cada chamada que falha e é repetida **multiplica** a carga sobre um backend que já está
sofrendo. Um **orçamento de retry** (não mais que X% das requisições de um cliente podem ser
retries, numa janela de tempo) impede essa espiral — quando o orçamento estoura, a chamada falha
rápido em vez de tentar de novo, e o sistema degrada graciosamente em vez de amplificar o colapso.

> **Reencontro — `spring-boot/08`.** Retry só no idempotente, timeout primeiro — a hierarquia de
> resiliência daquele marco é o lado do **cliente**; aqui é o lado da **borda**, decidindo para
> onde a chamada (com ou sem retry) vai. `kubernetes/04` cobre o Gateway API e `/11` o service
> mesh — os dois mecanismos que implementam o que este marco decide.

## Exemplo numa fintech

Um backend fica 10× mais lento durante a janela de pico (um `GC` longo, uma migração em andamento).
**Round-robin** continua mandando a mesma fatia — a fila nele cresce sem parar, e as requisições que
caem ali esperam cada vez mais. **Menos conexões** detecta a fila crescendo e desvia — mas com
atraso, porque a contagem de conexões em voo não é instantânea em todo LB. **P2C** reage mais
rápido: a cada escolha de dois, a chance de incluir o backend degradado na dupla já reduz o impacto,
e quando ele é escolhido, perde para o par mais rápido.

## Hands-on

**Tutorial.** Simulador de LB em Go com 5 backends simulados (latência configurável por backend) e
um deles 10× mais lento. Implemente e compare round-robin, menos conexões e P2C.

**Desafio.** Anel de consistent hashing com *vnodes* configuráveis; meça exatamente o que se move
quando um 5º nó é adicionado a um anel de 4.

**Invariantes testáveis**

1. Com um backend 10× mais lento, p99(P2C) é menor que p99(round-robin) — comparação de ordem, não
   de valor absoluto, porque a máquina de teste varia.
2. Ao adicionar o 5º nó ao anel de 4, no máximo `1/5 + 5` pontos percentuais das chaves mudam de
   dono.
3. Com pelo menos 100 *vnodes* por nó real, a razão entre a carga do nó mais carregado e a carga
   média fica abaixo de 1,25.
4. A ejeção de outlier reduz a taxa de erro agregada sob degradação simulada, e nunca ejeta mais de
   50% dos nós do pool de uma vez.

**Complemento.** Implemente retry sem orçamento sob falha parcial simulada (um backend lento, não
fora do ar) e meça a amplificação de carga — quantas requisições extras o retry sem controle gera
sobre o backend já degradado, comparado ao mesmo cenário com orçamento de retry ativo.

**Checagem**

1. Por que `hash(chave) % N` é caro quando `N` muda, e o que o anel consistente resolve?
2. O que exatamente P2C resolve que round-robin não resolve, e por que `d=3` não vale muito mais
   que `d=2`?
3. O que é amplificação de retry, e como um orçamento de retry a evita?
4. Qual é a diferença entre L4 e L7, e por que lógica de negócio não deveria morar no LB?

## Principais aprendizados

- DNS é failover grosso (região inteira), não substituto de health check em tempo real; CDN serve
  só o que é público e estático — dado de conta nunca cabe ali.
- Power of two choices entrega a maior parte do ganho estatístico de escolher o melhor backend sem
  precisar de estado global de carga — `d=2` já captura o essencial do que `d=3` ofereceria a mais.
- Hash consistente com *vnodes* evita que adicionar ou remover um nó remapeie quase tudo — só a
  fração que cabe ao nó que mudou se move.
- Ejeção de outlier precisa de teto: ejetar demais sob falha correlacionada transforma degradação
  parcial em indisponibilidade total.
- Retry sem orçamento amplifica carga sobre um backend já degradado — o orçamento de retry é o que
  transforma colapso em degradação graciosa.
