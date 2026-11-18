---
id: release-e-rollback-por-slo
title: "Release e rollback guiados por SLO"
summary: "Deploy é mover código; release é expor ao cliente; a decisão de continuar ou voltar deve ser uma função de sinais, não de coragem às 18h de sexta."
estimatedMinutes: 70
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

## Canary não é teste A/B

*Canary* e teste A/B usam a mesma mecânica, dividir o tráfego, para responder perguntas diferentes. A
frase-guia: **a estratégia de *deploy* protege a operação; o experimento informa o produto.**

| | *Rolling* | *Blue/green* | *Canary* | Teste A/B |
| --- | --- | --- | --- | --- |
| Pergunta | "consigo trocar sem parar?" | "consigo trocar e voltar rápido?" | "a versão nova é **segura**?" | "a variante é **melhor**?" |
| Sinal | saúde das instâncias novas | verificação pós-troca | operacional: erro, latência, saturação | de negócio (conversão, valor, abandono), com métricas de guarda operacionais |
| Quem recebe | todos, aos poucos, por instância | todos, de uma vez | uma fatia pequena e crescente do tráfego | grupos aleatórios, **fixos por cliente** |
| Duração | minutos | minutos | minutos a horas | dias a semanas, definida **antes** |
| Decisão | continuar ou parar | trocar ou voltar | promover ou reverter, automática | análise estatística ao fim do período |
| Mecanismo típico | substituição gradual de réplicas | dois ambientes e a troca do roteamento | peso de tráfego e a análise deste marco | *feature flag* com atribuição determinística |

```diagrama
ec-canary-vs-ab
```

**A unidade de aleatorização.** O *canary* divide **requisições**: a mesma pessoa pode cair na versão nova
numa chamada e na antiga na seguinte, e isso não importa, porque a pergunta é sobre a versão. O A/B divide
**clientes** (ou contas): a mesma pessoa não pode ver as duas variantes, senão a medida mistura as duas
experiências. Dividir por requisição serve ao *canary* e estraga o A/B.

**Atribuição determinística e fixa.** O cliente vai para uma variante por um *hash* de (unidade,
experimento, sal), reduzido a uma faixa de 0 a 99. É sem estado, dá o mesmo resultado em todas as instâncias
e não precisa de banco. O **sal diferente por experimento** impede que os mesmos clientes caiam sempre
juntos no mesmo lado de todos os experimentos.

**Antes de começar, por escrito:**

- a hipótese;
- a métrica principal;
- as **métricas de guarda** (erro, latência, reclamação), que encerram o experimento se piorarem;
- o efeito mínimo que importa para o negócio;
- o tamanho de amostra e a duração.

Tudo isso fica registrado antes de olhar o primeiro resultado.

**As armadilhas:**

- **espiar o resultado e parar cedo.** Cada espiada é uma nova chance de achar um "significativo" por
  acaso, e a taxa de falso positivo sobe muito acima da nominal. O laboratório mede isso;
- a **proporção de amostra quebrada** (SRM, de `ml-em-producao/08`): se o 50/50 declarado chega como 51/49
  em 100 mil clientes, a atribuição ou a coleta está errada, e nenhuma conclusão vale até corrigir;
- o **efeito de novidade**: a tela nova chama atenção na primeira semana e depois não;
- **experimentos que interferem** entre si, na mesma tela ou no mesmo fluxo;
- **comparar períodos** ("antes e depois") em vez de grupos simultâneos.

**Onde cada um entra na esteira.** Primeiro o *deploy*, por *blue/green* ou *canary*, que responde "é
seguro?". Depois o *release*, por *flag*. Por fim, o A/B sobre a *flag*, que responde "é melhor?". A métrica
de guarda do A/B reusa o mesmo `decidir` do *canary* deste marco: o experimento para pela guarda mesmo que a
métrica principal esteja melhorando.

O **lançamento escuro** (*shadow*) é a terceira forma de dividir tráfego: a versão nova recebe uma cópia
das requisições, e a resposta dela é descartada. Ele compara o comportamento sem expor o cliente
(`system-design/14` e `ml-em-producao/05`).

**Na fintech, nem tudo pode ser experimento.** Uma condição diferente de preço, tarifa ou crédito para
clientes equivalentes tem implicação regulatória e de defesa do consumidor. **Conferir** com o
*compliance*; o laboratório trata isso como política configurável, uma lista de atributos que nenhum
experimento pode variar. O experimento que usa dado pessoal respeita a finalidade do tratamento
(`engenharia-de-dados/10`).

> **Na ferramenta.** O `Experiment` do Argo Rollouts (`kubernetes/13`; conferido na v1.10.2) sobe
> ReplicaSets efêmeras e divide o tráfego entre elas **por peso**, com análise junto. Isso serve à análise
> de *canary*. Para um A/B por cliente, a atribuição fixa continua sendo da *flag*.

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
de métricas. Depois, `atribuir(unidade, experimento, sal) → variante` e `analisar(resultados)` (diferença de
proporções e intervalo de confiança de 95%, pela [aproximação normal](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Normal_approximation_interval)),
sobre massa sintética com semente fixa, só com a biblioteca padrão de Go.

**Desafio.** Implemente o congelamento com relógio falso (controlável em teste, não dependente do
relógio real da máquina). E o experimento "novo fluxo de confirmação do Pix": a métrica principal é a
conclusão do pagamento, e as métricas de guarda, a taxa de erro e a latência p95.

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
7. **A atribuição é fixa.** A mesma unidade recebe a mesma variante em 1.000 chamadas e em duas instâncias
   do processo. Medido: igual nas 1.000 e nos 200 clientes conferidos numa segunda instância.
8. **A divisão é a declarada.** Em 100 mil identificadores sintéticos, o 50/50 fica dentro de ±0,5 ponto.
   Medido: 50.250 × 49.750.
9. **Sais diferentes, grupos independentes.** A tabela cruzada de dois experimentos fica em 25% ± 0,5 ponto
   por célula. Medido: de 24.862 a 25.207. No lado quebrado, uma atribuição que ignora experimento e sal põe
   o cliente no mesmo lado dos dois experimentos em **10.000 de 10.000** casos; a correta, em 5.044.
10. **O SRM dispara na atribuição quebrada.** Medido: p = 0,11 na correta (não dispara) e p = 2 × 10⁻¹⁰ na
    *fixture* que perde 3% dos eventos de uma variante (dispara). O qui-quadrado foi conferido contra os
    valores de tabela (3,841 e 10,828 com 1 grau de liberdade).
11. **A guarda encerra o experimento.** Com a conclusão do Pix subindo de 90% para 93% (melhor, pela
    análise), a latência p95 indo de 350 para 520 ms, com tolerância de 100 ms, encerra o experimento pelo
    mesmo `decidir` do *canary*.
12. **O intervalo é honesto.** Com efeito real de 2 pontos injetado, o intervalo de 95% contém o efeito e
    conclui "melhor" (medido: de 1,4 a 2,5 pontos). Com efeito zero, conclui "sem diferença".
13. **Demonstração, o lado quebrado: espiar infla o falso positivo.** Em 1.000 simulações com efeito zero,
    olhar o resultado a cada um de 20 passos e parar no primeiro "significativo" deu **225 falsos positivos
    (22,5%)**; olhar só no fim deu 48 (4,8%), perto dos 5% nominais. A contagem é mostrada, não asserida como
    número exato: o teste só exige que passe dos 5%.
14. **Atributo proibido é recusado.** O validador de configuração recusa o experimento que varia `tarifa`
    (da lista de atributos proibidos) e o que não declara métricas de guarda.

**Complemento.** Defina, para um serviço real do seu trabalho, o critério concreto de rollback —
quais sinais, qual tolerância, qual janela. E escolha uma mudança do seu trabalho: ela pede *canary*, A/B ou
os dois? Qual seria a métrica de guarda?

**Checagem**

1. Qual é a diferença entre *deploy* e *release*, e qual mecanismo as separa na prática?
2. Por que a decisão de promover/reverter precisa de janela **e** tolerância, não só um dos dois? E que
   pergunta o *canary* responde que o teste A/B não responde?
3. Por que migração de banco complica rollback, e o que expand/contract resolve nesse cenário?
4. Por que uma janela de congelamento recusa deploys automaticamente, em vez de só "desencorajar"
   por convenção?

> **Reencontro — `kubernetes/06`; `kubernetes/13`; `observabilidade/12`; `system-design/14`;
> `spring-boot/08`; `aws-para-backend/04`; `ia-na-engenharia/07`.** As estratégias *rolling* e *canary* de `kubernetes/06` ganham aqui a decisão
> automatizada que as orienta. O GitOps de `kubernetes/13` é o mecanismo típico de execução do
> rollback decidido. O orçamento de erro de `observabilidade/12` funciona como freio direto sobre a
> tolerância do *canary*. As *feature flags* de `system-design/14` são o mecanismo que separa deploy
> de *release*. E a resiliência (circuito, retry) de `spring-boot/08` é o que impede que um canary
> degradado, enquanto ainda não foi revertido, afete desproporcionalmente o resto do sistema. Na AWS,
> `aws-para-backend/04` mapeia as três estratégias nos serviços gerenciados: o canary no ECS e a *flag* com
> experimento no AppConfig. E o piloto de agentes de código de `ia-na-engenharia/07` usa a mesma disciplina
> do teste A/B (grupo de comparação, duração definida antes, nada de espiar), com o time como unidade.

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
- *Canary* pergunta "é seguro?" e divide requisições; teste A/B pergunta "é melhor?" e fixa clientes. O A/B
  tem hipótese, guardas e duração escritas antes, e espiar o resultado infla o falso positivo (medido: 22,5%
  contra 4,8%).
