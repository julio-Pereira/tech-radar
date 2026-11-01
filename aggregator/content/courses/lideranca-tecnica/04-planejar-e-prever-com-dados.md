---
id: planejar-e-prever-com-dados
title: "Planejar e prever com dados"
summary: "Uma data não é uma opinião: é a distribuição do que seu time já entregou, lida com honestidade sobre o que mudou."
estimatedMinutes: 60
competencies: [execucao, dados]
references:
  - title: "The SPACE of Developer Productivity (ACM Queue)"
    url: "https://queue.acm.org/detail.cfm?id=3454124"
---

## Por que estimativa individual falha

Pedir que uma pessoa estime "quanto tempo isso leva" produz, de forma consistente, uma estimativa
otimista — a **falácia do planejamento**: mesmo sabendo que tarefas parecidas no passado levaram
mais tempo do que o previsto, as pessoas continuam estimando a tarefa atual como se ela fosse a
exceção. A saída não é "estimar melhor" — é parar de estimar item por item e usar a **distribuição**
do que o time já entregou no passado como base, que é exatamente o que a previsão probabilística
faz.

## Fatiar o trabalho

Previsão por dados funciona melhor sobre muitos itens pequenos do que sobre poucos itens grandes —
quanto menor e mais uniforme o tamanho de cada item, mais a distribuição histórica de tempo de
entrega reflete o que está por vir. Fatiar não é burocracia: é o que torna a previsão estatística
possível em vez de uma adivinhação sobre um item único e grande demais para ter comparáveis.

## Previsão probabilística com Monte Carlo

Em vez de perguntar "quanto tempo leva?", a pergunta certa é **"quando, com que probabilidade?"** —
e a simulação de Monte Carlo responde isso: simula milhares de futuros possíveis, amostrando do
*throughput* histórico do time, e produz uma distribuição de datas de conclusão. O resultado não é
uma data — são **percentis**: "50% de chance de terminar até 20 de novembro; 85% de chance até 12
de dezembro". A pergunta "quando, com 85%?" é mais honesta do que qualquer estimativa de ponto
único, porque expõe a incerteza real em vez de escondê-la atrás de um número confiante.

```diagrama
lt-monte-carlo
```

## Faixas em vez de ponto

Um número único ("vai levar 3 semanas") esconde a incerteza; uma **faixa com premissa explícita**
("entre 2 e 5 semanas, assumindo que a integração com o sistema de risco não precisa de mudança")
comunica honestamente o que é conhecido e o que não é — prática que `arquitetura-de-solucoes/08` já
introduz para estimativas em geral, e que este marco aplica especificamente a previsão de entrega
com dados históricos.

## WIP e Lei de Little para encurtar prazo

A alavanca mais confiável para entregar mais rápido não é "trabalhar mais rápido" — é **reduzir o
WIP**. Pela Lei de Little, para um *throughput* fixo, reduzir o trabalho em progresso reduz
diretamente o tempo de ciclo. Isso é contraintuitivo: parece que começar mais coisas ao mesmo tempo
acelera a entrega, mas na prática dilui o foco e aumenta o tempo de ciclo de cada item individual.

## Escopo variável como alavanca

Quando a data é fixa (um prazo regulatório, por exemplo — **conferir** a obrigação real antes de
tratá-la como inegociável), a variável que resta é o **escopo**. Cortar escopo é a alavanca mais
rápida e mais sob controle do time para cumprir uma data — mais rápida do que tentar "acelerar" a
execução, que raramente funciona sem custo de qualidade.

## Margem para o não planejado

Nenhuma previsão de *throughput* histórico captura automaticamente interrupções futuras
incomuns — picos de incidentes, mudança de prioridade do negócio, períodos de plantão mais pesado.
A previsão honesta reserva margem explícita para isso, baseada na taxa histórica de interrupção, em
vez de assumir implicitamente que o futuro será tão tranquilo quanto a média do passado.

## Previsão sob mudança de capacidade

Se o time vai perder ou ganhar pessoas no meio do período previsto, o modelo de previsão precisa
incorporar isso explicitamente — rodar a simulação com a capacidade histórica quando a capacidade
real vai mudar produz uma previsão **sistematicamente errada**, não apenas um pouco imprecisa.

## Prazos regulatórios: data fixa, escopo flexível

Em fintech, alguns prazos não são negociáveis por natureza (uma obrigação regulatória com data —
**conferir** com compliance qual é a obrigação real e qual é a interpretação interna, que às vezes
é mais conservadora do que a norma exige). Quando a data é de fato fixa, a conversa muda de "quando
entregamos tudo" para "o que cabe até a data, com qualidade" — e essa é uma conversa de escopo, não
de pressão sobre o time.

## Comunicar incerteza sem parecer evasivo

Dizer "85% até 12 de dezembro, 50% até 20 de novembro" soa, para quem não está acostumado, como
enrolação. A prática que resolve isso é parear a faixa com uma **recomendação clara** ("eu
planejaria para 12 de dezembro, e comunico se isso mudar") — a incerteza é honesta, a recomendação é
decisiva; as duas coisas não se contradizem.

## O que a previsão não cobre

Previsão por *throughput* histórico não prevê dependências externas que ainda não existem no
histórico, nem mudança de requisito no meio do caminho — ela assume que o padrão de trabalho futuro
se parece com o padrão passado. Quando isso não é verdade (uma dependência nova e desconhecida, por
exemplo), a previsão precisa ser combinada com o caminho crítico do marco 05, que modela
dependências explicitamente.

*Evidência.* [E] a falácia do planejamento é um viés cognitivo bem documentado em pesquisa. [P]
previsão por fluxo com Monte Carlo é prática consolidada de praticantes de métodos ágeis
orientados a dados. [O] o tamanho da margem reservada para o não planejado depende do histórico de
interrupção específico de cada time.

## Exemplo numa fintech

O diretor pergunta quando a nova funcionalidade de conciliação fica pronta. Em vez de "três
semanas", a resposta é: "85% de chance até 12 de dezembro; 50% até 20 de novembro; se cortarmos o
relatório de auditoria detalhado da primeira versão, antecipamos cerca de duas semanas". O diretor
tem uma data para planejar, uma alavanca de escopo se precisar antecipar, e nenhuma falsa certeza.

## Hands-on

**Tutorial.** Rode `modelos/previsao` (Monte Carlo com semente fixa) do `fin-leadkit` sobre o
*throughput* histórico do Time Pix.

**Desafio.** Produza a previsão para um backlog de 60 itens, incluindo um cenário de mudança de
capacidade no meio do período e uma proposta de corte de escopo.

**Invariantes testáveis**

1. Com a semente fixa, o **P85 é posterior ao P50**, e os percentis calculados são **monotônicos**
   (P10 ≤ P50 ≤ P85 ≤ P95) para qualquer entrada válida.
2. **Reduzir o escopo** (menos itens no backlog simulado) nunca atrasa a data prevista, para
   qualquer semente — propriedade verificada por comparação de pares de simulações.
3. **Reduzir a capacidade** (menos *throughput* histórico disponível) nunca antecipa a data
   prevista, pela mesma lógica de comparação de pares.
4. Rodando a simulação sobre o histórico conhecido do Time Pix, os percentis **reproduzem o
   gabarito** dentro da tolerância declarada.
5. O modelo **recusa** rodar com um histórico menor que o mínimo de amostras declarado, devolvendo
   um erro explícito — nunca um resultado silenciosamente não confiável.
6. O relatório de previsão sempre inclui a **premissa** usada (período do histórico, capacidade
   assumida) junto com os percentis — relatório sem premissa é tratado como incompleto pelo *lint*.

**Complemento.** Pegue uma resposta de prazo que você deu recentemente como data única e reescreva-a
como faixa, com a premissa explícita.

**Checagem**

1. Por que a falácia do planejamento não se resolve pedindo para a pessoa "estimar com mais
   cuidado"?
2. Por que reduzir o WIP tende a encurtar o tempo de ciclo, mesmo parecendo contraintuitivo à
   primeira vista?
3. Quando a data é regulatoriamente fixa, por que a conversa certa é sobre escopo, e não sobre
   pressionar o time a entregar mais rápido?
4. Por que uma previsão apresentada sem a premissa que a sustenta é considerada incompleta neste
   marco?

> **Pontes — `arquitetura-de-solucoes/08`; `entrega-continua-e-devops/01`.**
> As estimativas em faixas de `arquitetura-de-solucoes/08` são a prática geral que este marco
> aplica especificamente a previsão de entrega com dados históricos de fluxo. E os fundamentos de
> entrega contínua de `entrega-continua-e-devops/01` sustentam o *throughput* real que a simulação
> de Monte Carlo deste marco usa como entrada.

## Principais aprendizados

- Estimativa individual falha de forma previsível (falácia do planejamento); previsão por dados
  históricos não tem esse viés.
- "Quando, com que probabilidade?" é a pergunta certa — não "quanto tempo leva?".
- Reduzir WIP encurta o tempo de ciclo; reduzir escopo é a alavanca mais confiável para cumprir uma
  data fixa.
- Toda previsão deve vir com a premissa explícita (período do histórico, capacidade assumida).
- Previsão por *throughput* histórico não substitui o caminho crítico quando dependências externas
  importam (marco 05).
