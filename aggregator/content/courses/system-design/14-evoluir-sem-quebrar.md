---
id: evoluir-sem-quebrar
title: "Evoluir sem quebrar"
summary: "Toda arquitetura é provisória; o que importa é o custo e a segurança de mudá-la. Feature flags, strangler fig, execução em paralelo para migrar cálculo financeiro."
estimatedMinutes: 60
references:
  - title: "Martin Fowler — Feature Toggles"
    url: https://martinfowler.com/articles/feature-toggles.html
  - title: "Martin Fowler — Strangler Fig"
    url: https://martinfowler.com/bliki/StranglerFigApplication.html
---

## Nenhuma arquitetura é definitiva, e isso é o ponto

Todo desenho desta trilha é a melhor decisão com a informação de **hoje** — volume vai mudar,
regulação vai mudar, o próprio negócio vai mudar de direção. O que separa uma arquitetura madura de
uma frágil não é "acertar para sempre"; é o **custo de mudar quando o "hoje" deixar de valer**. Uma
ADR sem gatilho de reversão (marco 01) é o sintoma de um time que não pensou nisso.

## Feature flags: tipos, ciclo de vida, e a dívida que elas acumulam

**Release flag**: liga uma funcionalidade nova gradualmente, removida logo depois do rollout
completo. **Operacional**: um interruptor de emergência (*kill switch*) para desligar algo sob
incidente, vive mais tempo, mas ainda tem dono. **Experimento**: suporta um teste A/B, com prazo de
análise definido. **Permissão**: liga uma funcionalidade por plano ou por cliente, pode viver
indefinidamente porque reflete uma segmentação de produto real, não uma transição.

A **dívida de flag** (*flag debt*) é o custo acumulado de flags que deveriam ter sido removidas e
não foram: cada uma é um caminho de código a mais para testar, um `if` a mais para entender, e,
pior, combinações de flags que nunca foram testadas juntas porque ninguém imaginou que
coexistiriam. Toda flag tem **dono** e **data de expiração** — uma flag sem expiração é uma
Promessa que ninguém cobra.

**Avaliação determinística**: o mesmo usuário deve receber a mesma variante em toda chamada,
tipicamente via um hash estável (`hash(user_id + flag_name) % 100 < percentual`) — sem isso, um
usuário "piscando" entre variantes a cada requisição é uma experiência quebrada e um experimento
estatisticamente inválido. **Valor padrão quando o serviço de flags cai**: todo flag precisa de um
comportamento definido para quando o sistema que as resolve está indisponível — geralmente o
comportamento mais conservador (a funcionalidade nova desligada), nunca "a aplicação trava
esperando resposta".

## Entrega progressiva e *strangler fig*

Entrega progressiva (ligada a *canary* — `kubernetes/06` e `/13`) expõe gradualmente uma mudança a
uma fração crescente de tráfego real, observando sinais antes de ir para 100%. **Strangler fig**: em
vez de reescrever um sistema de uma vez (arriscado, caro, quase sempre atrasado), o novo sistema
cresce **ao redor** do antigo, assumindo responsabilidades uma de cada vez, até o antigo poder ser
desligado — o nome vem da figueira estranguladora, que cresce em volta de uma árvore hospedeira até
substituí-la por completo. **Branch by abstraction**: dentro do próprio código, introduzir uma
interface antes de trocar a implementação por trás dela, permitindo alternar entre antiga e nova
sem um branch de longa duração divergindo do `main`.

## Execução em paralelo: o padrão específico para migrar cálculo financeiro

Trocar a lógica de cálculo de uma tarifa, de uma taxa de câmbio, de qualquer número que afeta
dinheiro de cliente, nunca deveria ser um "troca e torce". **Execução em paralelo (*dark
launch*)**: a implementação antiga continua sendo a fonte da resposta real; a nova roda em paralelo,
sobre a mesma entrada, e as duas saídas são comparadas — divergências são classificadas (arredondamento
aceitável? bug real?) **antes** de a nova assumir. Só depois de um volume suficiente de comparações
sem divergência inexplicada é que o rollout real começa, geralmente via o mesmo mecanismo de
entrega progressiva.

> **Reencontro — `kubernetes/13`; `spring-boot/13`; `arquitetura-eventos/13`.** GitOps e entrega
> (`kubernetes/13`) implementam o mecanismo de *canary* que a entrega progressiva usa.
> `spring-boot/13` já tratou monolito modular com fronteira testada — a mesma disciplina de
> *branch by abstraction* dentro de um módulo. `arquitetura-eventos/13` cobre migrar sem parar
> numa arquitetura orientada a eventos — o mesmo princípio de execução em paralelo, aplicado a
> fluxo de mensagens em vez de cálculo síncrono.

## Política de depreciação e custo por transação

Toda mudança que remove algo (uma versão de API — marco 05, uma flag, um caminho de código antigo)
precisa de política de depreciação: data anunciada, sinal técnico (`Sunset`), e um canal pelo qual
quem depende do que está saindo é avisado com antecedência real, não descoberta no dia da remoção.
**Custo por transação** (FinOps) é um requisito de evolução tanto quanto correção: uma mudança que
resolve um problema técnico mas dobra o custo por transação processada precisa dessa conta exposta
na decisão, não descoberta na fatura do mês seguinte.

## Exemplo numa fintech

Trocar o cálculo de tarifa de transferência: 10 mil transações reais processadas pelas duas
versões em paralelo, por uma semana. Das 10 mil, 9.994 batem exatamente; 6 divergem por
arredondamento de centavo (classificado como aceitável, com a regra de arredondamento documentada);
zero divergem por motivo não explicado. Só então o rollout real começa, via entrega progressiva —
1% do tráfego, depois 5%, depois 25%, observando sinais de negócio a cada degrau antes do próximo.

## Hands-on

**Tutorial.** Motor de flags em Go com *bucketing* determinístico (hash estável de usuário +
flag).

**Desafio.** Execução em paralelo de duas implementações de uma regra de cálculo (antiga × nova)
com um classificador de divergência que separa "arredondamento aceitável" de "divergência
inexplicada".

**Invariantes testáveis**

1. O mesmo usuário recebe a mesma variante de uma flag em chamadas repetidas e em instâncias
   diferentes do serviço.
2. A distribuição de variantes fica dentro de ±1% do percentual configurado, sobre 100 mil usuários
   simulados.
3. Ampliar o rollout de 5% para 25% **mantém** os usuários que já estavam na variante nova — sem
   nenhum deles "voltar" para a antiga por reavaliação do hash.
4. O *kill switch* tem efeito observável em até um intervalo de *poll* declarado, depois de
   acionado.
5. Uma flag sem dono ou com data de expiração vencida derruba um check de CI dedicado.
6. Sobre as 10 mil transações do teste de execução em paralelo, zero divergências ficam sem
   classificação — toda divergência cai em "aceitável" ou "investigar", nenhuma fica sem rótulo.

**Complemento.** Calcule o custo por transação da implementação nova comparado à antiga, usando o
tempo de processamento medido no teste de execução em paralelo.

**Checagem**

1. O que diferencia uma dívida de flag de uma flag saudável, e por que toda flag precisa de dono e
   data de expiração?
2. O que *strangler fig* resolve que uma reescrita completa não resolve?
3. Por que execução em paralelo é o padrão certo especificamente para migrar cálculo financeiro,
   em vez de um simples *canary* de tráfego?
4. O que uma política de depreciação precisa ter, além da data de remoção?

## Principais aprendizados

- Nenhuma arquitetura é definitiva — o que separa madura de frágil é o custo de mudar quando a
  informação de hoje deixar de valer, não acertar para sempre.
- Toda flag precisa de dono e data de expiração; dívida de flag é o custo acumulado de combinações
  nunca testadas juntas porque ninguém imaginou que coexistiriam.
- *Strangler fig* evita o risco de uma reescrita completa: o novo sistema cresce ao redor do
  antigo, assumindo responsabilidade por partes, até o antigo poder ser desligado.
- Execução em paralelo é o padrão específico para migrar cálculo financeiro: a implementação antiga
  continua sendo a fonte real enquanto a nova é validada contra ela, sobre tráfego de verdade.
- Política de depreciação precisa de data, sinal técnico e canal de aviso real — e toda mudança
  tem custo por transação que precisa estar exposto na decisão, não descoberto na fatura.
