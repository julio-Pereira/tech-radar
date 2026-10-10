---
id: caso-antifraude-em-tempo-real
title: "Caso: antifraude em tempo real"
summary: "Em tempo real, falhar aberto ou fechado é decisão de negócio — com dono, limite e número. Orçamento de decisão em dezenas de ms, enriquecimentos paralelos, modo sombra."
estimatedMinutes: 60
references:
  - title: "The Tail at Scale (Dean & Barroso)"
    url: https://research.google/pubs/the-tail-at-scale/
---

## O orçamento de decisão é o requisito que domina tudo

Uma decisão de antifraude precisa acontecer dentro do orçamento de latência do fluxo que a
contém (marco 02) — tipicamente dezenas de milissegundos, porque ela é um dos saltos síncronos do
caminho de autorização de pagamento (marco 09). Esse orçamento, não a sofisticação do modelo, é o
que dita a arquitetura inteira: um modelo melhor que não cabe no orçamento não é uma opção, é um
projeto de pesquisa.

## Enriquecimentos paralelos, cada um com seu próprio timeout

A decisão consulta múltiplas fontes — histórico do cliente, reputação do dispositivo, velocidade
de transações recentes, sinal de geolocalização — e cada uma dessas consultas (**enriquecimento**)
roda em **paralelo**, nunca em série, porque em série a latência soma (a mesma lição do marco 02:
cada salto a mais multiplica a chance de um deles estourar o orçamento). Cada enriquecimento tem
seu **próprio timeout**, menor que o orçamento total da decisão, e um **valor de *fallback*
** definido antecipadamente para quando ele não responde a tempo — nunca "espera indefinidamente" e
nunca "a decisão falha porque um enriquecimento secundário está lento".

## Atributos online × offline

**Online**: calculados em tempo real, a partir do estado atual (quantas transações esta conta fez
nos últimos 10 minutos). **Offline**: pré-calculados em lote e consultados por chave (o perfil de
risco histórico do cliente, atualizado diariamente) — mais barato de consultar, mais velho de
dado. A arquitetura que separa os dois é conhecida como *feature store* em nível conceitual: um
repositório que serve o mesmo conjunto de atributos tanto para o modelo em produção (consulta
online, rápida) quanto para o treinamento do próximo modelo (consulta em lote, sobre histórico) —
sem essa separação, é comum um modelo ser treinado com um dado que a produção não consegue
calcular a tempo, uma categoria inteira de bug que só aparece depois do deploy.

## Regras + modelo, e modo sombra

A decisão raramente é só "o modelo decide": regras explícitas (um valor acima de X sempre vai para
análise humana, uma lista de dispositivos já confirmados como fraudulentos sempre bloqueia)
coexistem com a saída de um modelo estatístico. **Modo sombra**: uma regra ou modelo novo roda em
paralelo à decisão real, **sem afetar a resposta**, só registrando o que teria decidido — a forma
correta de validar uma mudança de risco contra tráfego real antes de deixá-la decidir de verdade.
A disciplina do modo sombra é inegociável: se ele tem qualquer chance de influenciar a resposta,
deixou de ser sombra.

## Falhar aberto × fechado, por faixa de valor

Quando um enriquecimento crítico falha, a decisão de deixar passar (falhar aberto) ou bloquear
(falhar fechado) não é uma constante do sistema — é uma **matriz por faixa de valor**, decidida
como negócio: uma transação de valor baixo, sob enriquecimento indisponível, provavelmente passa
(o custo esperado de um falso negativo pequeno é menor que o custo de atrito em volume alto); uma
transação de valor alto, na mesma condição, provavelmente vai para retenção e análise humana (o
custo esperado de deixar passar uma fraude grande supera o custo de atrito num volume baixo de
transações grandes). Cada faixa tem dono, e a matriz é testada faixa a faixa, não como regra única.

> **Reencontro — `go-fintech/03` e `/05`; `seguranca-aplicacao/14`; `observabilidade/08`.** O
> `ledger-core` e o antifraude compartilham a necessidade de decisão sob concorrência alta —
> `go-fintech/03` já tratou isso para o débito, aqui é para a decisão de risco. `/05` cobre gRPC,
> frequentemente o protocolo entre o serviço de decisão e os enriquecimentos internos.
> `seguranca-aplicacao/14` trata fraude e abuso em profundidade — aqui é a arquitetura da decisão
> em tempo real, lá é a disciplina de detecção e resposta. `observabilidade/08` cobre métrica de
> negócio, o que inclui taxa de falso positivo/negativo como sinal operacional.

## Exemplo numa fintech

Valor baixo (R$ 50) com o enriquecimento de reputação de dispositivo fora do ar: passa, com
*fallback* de "reputação desconhecida, não negativa" — o custo de atrito em alto volume supera o
risco esperado daquele valor. Valor alto (R$ 50.000) na mesma condição: retido para análise
humana — o custo de uma fraude daquele tamanho justifica o atrito de uma revisão manual, mesmo que
na maioria das vezes a transação seja legítima.

## Hands-on

**Tutorial.** Documento de design completo no molde do marco 09, para a decisão de antifraude.

**Desafio.** Serviço de decisão em Go, com orçamento de 80 ms e três enriquecimentos paralelos
simulados (cada um com latência e taxa de falha configuráveis no teste).

**Invariantes testáveis**

1. Com um dos três enriquecimentos fora do ar (simulado), a resposta ainda sai dentro do orçamento
   de 80 ms (p99), usando o *fallback* definido para aquele enriquecimento.
2. A matriz falha-aberta/falha-fechada por faixa de valor é testada faixa a faixa — cada faixa tem
   um teste próprio confirmando o comportamento esperado sob enriquecimento indisponível.
3. Uma regra em modo sombra **nunca** altera a resposta final — testado comparando a resposta com
   e sem a regra sombra ativa, sobre o mesmo conjunto de entradas, exigindo resultado idêntico.
4. A decisão é determinística para a mesma entrada e a mesma versão de regra/modelo — rodar o
   mesmo caso duas vezes produz a mesma saída.

**Complemento.** Projete o ciclo de rótulo tardio: quando a fraude de uma transação só é confirmada
dias depois (reclamação do cliente, chargeback), como esse rótulo retroalimenta o sistema sem
reprocessar decisões já tomadas.

**Checagem**

1. Por que o orçamento de latência domina a arquitetura da decisão de antifraude, mais que a
   sofisticação do modelo?
2. O que diferencia um atributo online de um offline, e por que um *feature store* evita um bug
   comum entre os dois?
3. O que torna uma regra "em modo sombra" de verdade, e o que a desqualifica?
4. Por que falhar aberto × fechado é uma matriz por faixa de valor, não uma constante do sistema?

## Principais aprendizados

- O orçamento de latência (dezenas de ms) domina a arquitetura: um modelo melhor que não cabe nele
  não é opção disponível, é projeto de pesquisa.
- Enriquecimentos rodam em paralelo, cada um com timeout próprio e *fallback* definido — nunca em
  série, e nunca sem plano para quando um deles não responde a tempo.
- *Feature store* separa atributo online (rápido, fresco) de offline (barato, mais velho) e evita
  o bug clássico de treinar com dado que a produção não consegue calcular a tempo.
- Modo sombra só é modo sombra se não tiver absolutamente nenhuma chance de influenciar a resposta
  real — qualquer vazamento de efeito o desqualifica.
- Falhar aberto ou fechado é matriz por faixa de valor, decidida como negócio, testada faixa a
  faixa — nunca uma constante única aplicada ao sistema inteiro.
