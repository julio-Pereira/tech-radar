---
id: divida-arquitetural
title: "Dívida arquitetural e refatoração em escala"
summary: "Dívida arquitetural não se paga com um projeto de refatoração de seis meses: paga-se em passos pequenos, cobertos por testes que provam que o comportamento não mudou."
estimatedMinutes: 55
references:
  - title: "Working Effectively with Legacy Code (Michael Feathers)"
    url: https://www.oreilly.com/library/view/working-effectively-with/0131177052/
---

## Dívida técnica × dívida arquitetural

**Dívida técnica** é local: um método confuso, um nome ruim, um teste faltando — caro de entender,
mas barato de isolar. **Dívida arquitetural** é estrutural: um ciclo entre módulos, uma regra de
negócio espalhada por controladores e consultas SQL, uma fronteira que devia existir e não existe —
o tipo de dívida que torna **toda mudança** naquela região mais cara, não só a próxima. A distinção
importa porque a cura é diferente: dívida técnica se resolve localmente; dívida arquitetural exige
mudar a estrutura, não só o código dentro dela.

## Registro de dívida com juros, não valor em dinheiro inventado

Um registro de dívida arquitetural é útil quando lista, por item, o **custo de cada mudança** naquela
região (os "juros") — qualitativo ou medido (o marco 05 dá a métrica), nunca um valor em dinheiro
inventado ("essa dívida custa R$ 50 mil"), que soa preciso mas não é verificável e desvia a conversa
para negociar o número em vez de corrigir o problema.

## Teste de caracterização / *golden master* para código sem teste

Antes de tocar em código legado sem teste, é preciso saber o que ele **faz hoje**, não o que deveria
fazer. Um teste de caracterização (ou ***golden master***) grava a saída do sistema para um conjunto
de entradas fixas, **sem julgar** se essa saída está certa — só documenta o comportamento atual. Toda
refatoração subsequente é validada contra esse *golden master*: se a saída muda, ou a refatoração
introduziu um bug, ou mudou intencionalmente o comportamento (e nesse caso o *golden master* precisa
ser atualizado deliberadamente, nunca por acidente).

## Costuras, e ramificação por abstração

Uma **costura** (*seam*) é um ponto no código legado onde é possível alterar comportamento sem editar
o código naquele ponto exato — geralmente introduzindo uma interface onde antes havia uma chamada
direta, sem mudar a lógica. ***Branch by abstraction***: para substituir uma implementação grande sem
parar a entrega, introduz-se uma abstração sobre a implementação antiga, constrói-se a nova atrás da
mesma abstração, alterna-se gradualmente, e só então remove-se a antiga — a entrega nunca para
esperando a refatoração terminar.

## Método Mikado para refatorações grandes

Para uma refatoração grande o suficiente que "só fazer" não é viável, o método Mikado documenta, como
um grafo, cada pré-requisito descoberto ao tentar a mudança direto (que falha), desfaz a tentativa, e
ataca os pré-requisitos primeiro — até que a mudança original se torne trivial. O valor é visibilidade:
em vez de uma refatoração grande e arriscada, uma sequência de passos pequenos e ordenados, cada um
sabendo exatamente por que existe.

## Quando **não** refatorar

Código que vai morrer (sistema a ser aposentado, feature com data de desligamento conhecida) não
merece investimento de refatoração — o retorno nunca chega, porque o código não vai viver o
suficiente para pagar o investimento. Essa decisão de **não** refatorar, documentada com o motivo e
um gatilho para reavaliar, é tão válida e tão deliberada quanto a decisão de refatorar.

## Refatorar sem parar a entrega

Pequenos PRs que preservam comportamento, intercalados com entrega de funcionalidade nova, batem
*feature freezes* de "projeto de refatoração" na prática: o time nunca para de entregar valor
enquanto a estrutura melhora — e cada PR pequeno é revisável e revertível individualmente, diferente
de uma mudança de seis meses que só pode ser aceita ou rejeitada como um bloco inteiro.

## Relação com *strangler*: aqui o sistema não troca, só a estrutura

O padrão *strangler* (`system-design/14`) troca um **sistema** por outro, gradualmente. Este marco
trata do mesmo tipo de disciplina gradual — mas aplicada **dentro** do mesmo sistema, mudando sua
estrutura interna sem trocar o sistema por outro. A disciplina de "nunca parar, sempre em passos
pequenos e reversíveis" é compartilhada; o que muda de lugar é diferente.

## Exemplo numa fintech

O `legacy-wallet`: regras de saldo espalhadas entre controladores e consultas SQL diretas, com ciclos
de dependência entre pacotes e nenhum teste. Um *golden master* é gravado primeiro, capturando a
saída atual (certa ou errada, não importa neste momento) para um conjunto de entradas representativo.
Cinco passos pequenos depois — cada um extraindo uma regra para o domínio, cada um verificado contra
o *golden master* — o número de ciclos chega a zero e a instabilidade melhora, sem que o
comportamento observável tenha mudado uma vírgula.

## Hands-on

**Tutorial.** Grave o *golden master* do `legacy-wallet` (entradas fixas → saídas gravadas).

**Desafio.** Reestruture o `legacy-wallet` em 5 passos pequenos até zero ciclos de dependência.

**Invariantes testáveis**

1. A saída do *golden master* é **idêntica** depois de cada um dos cinco passos — verificado
   automaticamente, não só ao final.
2. O número de ciclos e a instabilidade (marco 05) **melhoram ou permanecem iguais** a cada passo —
   o mesmo *ratchet*, aplicado passo a passo durante a refatoração.
3. Cada passo é um **commit** isolado que compila e passa em todos os testes — nenhum passo deixa o
   repositório num estado intermediário quebrado.
4. O registro de dívida lista cada item com dono, juros qualitativos (ou medidos) e **critério de
   pagamento** — não um valor monetário inventado.

**Complemento.** Escreva a decisão de **não** refatorar um trecho real do seu trabalho, com o motivo
e o gatilho que faria você reavaliar essa decisão depois.

**Checagem**

1. O que distingue dívida técnica de dívida arquitetural, e por que a cura é diferente para cada
   uma?
2. Por que um *golden master* não julga se o comportamento atual está certo, só o documenta?
3. O que é uma costura, e como *branch by abstraction* usa esse conceito para substituir uma
   implementação sem parar a entrega?
4. Em que condição a decisão correta é **não** refatorar um trecho de código?

> **Reencontro — `system-design/14`; `arquitetura-eventos/13`; `spring-boot/11`; `go-fintech/08`.**
> O *strangler* de `system-design/14` e a migração sem parar de `arquitetura-eventos/13` compartilham
> a mesma disciplina gradual deste marco, aplicada a **sistema** em vez de a **estrutura interna** —
> a distinção que este marco traça explicitamente. O teste que prova comportamento real de
> `spring-boot/11` é a mesma função do *golden master* aqui. E a comparação Java × Go de
> `go-fintech/08` é onde a prática de registrar dívida com critério de pagamento, em vez de opinião,
> já apareceu num contexto de produção.

## Principais aprendizados

- Dívida arquitetural é estrutural (torna toda mudança numa região mais cara), diferente de dívida
  técnica local — e por isso exige mudar a estrutura, não só o código.
- Um registro de dívida com juros qualitativos ou medidos é mais útil que um valor monetário
  inventado, que desvia a conversa da correção para a negociação do número.
- Um *golden master* documenta o comportamento atual sem julgá-lo, e vira a régua contra a qual toda
  refatoração subsequente é validada.
- *Branch by abstraction* e o método Mikado tornam refatorações grandes em sequências de passos
  pequenos, revisáveis e revertíveis, sem parar a entrega.
- Não refatorar código que vai morrer é uma decisão válida e deliberada, não negligência — desde que
  documentada com motivo e gatilho de reavaliação.
