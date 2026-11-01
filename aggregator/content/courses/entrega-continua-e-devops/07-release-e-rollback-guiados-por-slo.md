---
id: release-e-rollback-por-slo
title: "Release e rollback guiados por SLO"
summary: "Deploy é mover código; release é expor ao cliente; a decisão de continuar ou voltar deve ser uma função de sinais, não de coragem às 18h de sexta."
estimatedMinutes: 60
references:
  - title: "Release It! (Michael Nygard)"
    url: https://pragprog.com/titles/mnee2/release-it-second-edition/
---

## *Deploy* × *release*: a mesma distinção do marco 03, formalizada

***Deploy***: o código está no ambiente, rodando. ***Release***: o código está **visível** para
clientes — a *feature flag* que o marco 03 usou para integrar trabalho incompleto é exatamente o
mecanismo que separa os dois. Essa separação é o que permite fazer deploy com frequência (baixo risco,
reversível instantaneamente desligando a flag) sem forçar toda mudança a ser "lançada" no mesmo
momento em que é implantada.

## Estratégias de *release*: *rolling*, *blue/green*, *canary*

**Rolling**: substitui instâncias antigas pela nova versão gradualmente, uma (ou um pequeno grupo) por
vez — já tratado em `kubernetes/06`. **Blue/green**: duas versões completas rodando em paralelo, com
o tráfego trocando de uma para outra de uma vez (ou quase) — rollback é só trocar de volta.
**Canary**: uma fração pequena do tráfego real vai para a versão nova, enquanto o grosso continua na
versão estável — a estratégia que este marco detalha, porque exige a análise ativa da próxima seção.

## Análise de canary: comparar com a linha de base, com janela e tolerância

A decisão de promover, segurar, ou reverter um *canary* é uma **função** de sinais — taxa de erro e
latência do grupo canário, comparadas à **linha de base** (o grupo estável, no mesmo período) — não
uma impressão subjetiva de alguém olhando um painel. A comparação precisa de **janela** (por quanto
tempo observar antes de decidir) e **tolerância** (quanto de diferença é ruído aceitável, versus sinal
real de regressão) — sem os dois, o decisor reage a flutuação normal como se fosse problema, ou
demora demais reagindo a um problema real.

## Orçamento de erro como freio

O *error budget* (`observabilidade/12`) de um SLO existente funciona como freio natural: se o
orçamento já está consumido por outros motivos no período, a tolerância para um *canary* específico
deveria ser **mais apertada**, porque o sistema já está mais próximo do limite aceitável de
degradação total.

```diagrama
ec-canario
```

## *Rollback* × *roll-forward*, e por que migração de banco complica o *rollback*

**Rollback**: voltar à versão anterior. **Roll-forward**: corrigir com uma nova versão em vez de
voltar. Rollback parece sempre mais simples e seguro — até uma migração de schema de banco (marco 08)
ter rodado entre as duas versões: voltar o código sem voltar o schema pode deixar a versão anterior
incompatível com o schema atual, exatamente o motivo pelo qual expand/contract (`dados-distribuidos/11`)
existe — para que as duas versões de código consigam operar sobre o mesmo schema durante a transição.

## Verificação pós-deploy, e anotações na observabilidade

Um **smoke test** pós-deploy confirma que o sistema básico está respondendo antes de considerar o
deploy concluído com sucesso. E toda mudança de deploy deveria gerar uma **anotação** na
observabilidade (um marcador de tempo com versão e *digest*) — para que, quando uma métrica mudar de
comportamento, a correlação "isso aconteceu logo depois daquele deploy" seja imediata, em vez de
reconstruída manualmente examinando logs de CI depois do fato.

## Janelas de congelamento, e *hotfix*

Certos períodos (fechamento contábil, datas de alto volume — **confira** o calendário de cada
contexto) têm **janela de congelamento**: deploys não emergenciais são recusados automaticamente
durante essa janela, não apenas "desencorajados" por convenção verbal. Um *hotfix* — correção
urgente que precisa furar a fila — é a exceção explícita que a janela de congelamento permite, com
seu próprio rastro de evidência (marco 09).

## *Release train*

Em vez de cada mudança disparar seu próprio processo de release, um ***release train*** agrupa
mudanças que estão prontas num horário fixo recorrente (a cada hora, a cada dia) — mudanças que não
estão prontas simplesmente pegam o próximo trem. Isso troca flexibilidade individual por
previsibilidade e simplicidade de coordenação; não é a estratégia certa para toda organização, mas é
uma alternativa válida ao "cada deploy quando estiver pronto".

## Exemplo numa fintech

Um *canary* de 5% do tráfego mostra latência p95 20% pior que a linha de base, dentro da primeira
janela de observação. O decisor (função automática, não humano sob pressão) **segura** a promoção —
não reverte imediatamente, porque a tolerância ainda não foi excedida o suficiente para justificar
rollback, mas também não libera mais tráfego. Na segunda janela, com a degradação persistindo, o
decisor **reverte** automaticamente.

## Hands-on

**Tutorial.** Implemente a função `decidir(baseline, canary, tolerancia)` e um simulador de séries
de métricas.

**Desafio.** Implemente o congelamento com relógio falso (controlável em teste, não dependente do
relógio real da máquina).

**Invariantes testáveis**

1. Uma série **saudável** (dentro da tolerância da linha de base) resulta em **promoção**.
2. Uma regressão injetada leva a **rollback em até N passos** declarados — asserção rígida, não
   "eventualmente".
3. **Ruído** dentro da tolerância declarada **não** gera rollback, verificado em 1000 execuções
   simuladas com semente fixa, com taxa de falso positivo **abaixo de um limite** declarado.
4. O rollback é **idempotente**: reaplicá-lo (chamar a função de rollback de novo sobre um estado já
   revertido) não altera o estado.
5. Em janela de congelamento (relógio falso), o decisor **recusa** um deploy não marcado como
   emergencial.
6. Todo deploy emite uma **anotação** com versão e *digest*, verificável depois.

**Complemento.** Defina, para um serviço real do seu trabalho, o critério concreto de rollback —
quais sinais, qual tolerância, qual janela.

**Checagem**

1. Qual é a diferença entre *deploy* e *release*, e qual mecanismo as separa na prática?
2. Por que a decisão de promover/reverter precisa de janela **e** tolerância, não só um dos dois?
3. Por que migração de banco complica rollback, e o que expand/contract resolve nesse cenário?
4. Por que uma janela de congelamento recusa deploys automaticamente, em vez de só "desencorajar"
   por convenção?

> **Reencontro — `kubernetes/06`; `kubernetes/13`; `observabilidade/12`; `system-design/14`;
> `spring-boot/08`.** As estratégias *rolling* e *canary* de `kubernetes/06` ganham aqui a decisão
> automatizada que as orienta. O GitOps de `kubernetes/13` é o mecanismo típico de execução do
> rollback decidido. O orçamento de erro de `observabilidade/12` funciona como freio direto sobre a
> tolerância do *canary*. As *feature flags* de `system-design/14` são o mecanismo que separa deploy
> de *release*. E a resiliência (circuito, retry) de `spring-boot/08` é o que impede que um canary
> degradado, enquanto ainda não foi revertido, afete desproporcionalmente o resto do sistema.

## Principais aprendizados

- *Deploy* é código no ambiente; *release* é código visível ao cliente — *feature flags* separam os
  dois, permitindo deploy frequente sem forçar lançamento simultâneo.
- A decisão de promover ou reverter um *canary* é uma função de sinais com janela e tolerância
  declaradas, nunca uma impressão subjetiva sob pressão.
- Orçamento de erro já consumido deveria apertar a tolerância de um *canary* novo — os dois
  conceitos se conectam, não vivem isolados.
- Migração de banco complica rollback porque o código anterior pode não ser compatível com o schema
  já migrado — expand/contract existe para que as duas versões operem no mesmo schema durante a
  transição.
- Janela de congelamento recusa deploys não emergenciais automaticamente, não por convenção verbal
  "desencorajada e ignorada sob pressão".
