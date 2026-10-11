---
id: modelar-para-analise
title: "Modelar para análise"
summary: "Modelo de análise é uma decisão de granularidade e tempo, não de nome de tabela. SCD2, transação pendente→efetivada, e por que dinheiro nunca é ponto flutuante."
estimatedMinutes: 60
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## Granularidade declarada é a primeira decisão, não a última

Antes de desenhar qualquer tabela, declare: **uma linha representa o quê, exatamente?** "Uma linha
por transação" é diferente de "uma linha por transação por tentativa de processamento" é diferente
de "uma linha por dia por conta agregando transações" — e misturar granularidades na mesma tabela
(algumas linhas são transações individuais, outras são agregados) é o jeito mais confiável de
produzir uma soma errada sem ninguém perceber até o fechamento. A granularidade declarada vira um
teste de unicidade: se a chave que deveria ser única tem duplicata, a granularidade foi violada em
algum lugar do pipeline.

## Fatos e dimensões, e quando *one-big-table* serve

**Fato**: o evento ou a medida — uma transação, um saldo num instante. **Dimensão**: o contexto que
qualifica o fato — a conta, a instituição, o produto. O modelo dimensional separa os dois para
evitar repetir o contexto em cada linha de fato; a alternativa, **one-big-table** (tudo numa tabela
larga, dimensões já achatadas), serve quando o padrão de consulta é sempre o mesmo join repetido —
trocar normalização por velocidade de consulta, de forma deliberada, não por preguiça de modelar.

## SCD tipo 2: histórico de mudança como linha nova, não como `UPDATE`

Uma dimensão muda — o endereço de um cliente, o status de uma conta. **SCD tipo 2** (*slowly
changing dimension*) registra a mudança como uma **linha nova**, com uma vigência (`vigencia_de`,
`vigencia_ate`), em vez de sobrescrever a linha antiga — exatamente como o ledger nunca faz
`UPDATE` em `dados-distribuidos/05`, aqui aplicado a uma dimensão inteira, não a um lançamento. A
regra que mais falha na prática: as vigências de uma mesma entidade **nunca podem se sobrepor nem
deixar lacuna** — cada instante no tempo precisa corresponder a exatamente uma versão vigente.
**Bitemporalidade** (quando faz sentido saber não só "o que era verdade quando", mas também "o que
o sistema achava que era verdade, e quando mudou de ideia") é mencionada aqui em nível conceitual —
o caso raro que justifica uma segunda dimensão de tempo.

## O vocabulário de dado de Open Finance que todo modelo precisa respeitar

**Sinal débito/crédito** explícito (nunca inferido do valor, porque um valor negativo pode
significar coisas diferentes em sistemas diferentes); **moeda** e **fuso horário** registrados, não
assumidos; **transação pendente → efetivada**: uma transação pode aparecer como pendente num dia e
só ser efetivada (com valor possivelmente ajustado — estorno parcial, taxa aplicada) dias depois —
modelar isso como dois eventos distintos, ligados pela mesma chave de negócio, é o que permite
reconstruir "o que o cliente viu em cada momento" sem perder a transação final correta. **Valor em
centavos inteiros**: a regra que nunca tem exceção — `BigDecimal`/inteiro, jamais ponto flutuante,
a mesma disciplina de `spring-boot/05`.

## Resolução de entidade: o mesmo cliente, visto por instituições diferentes

Um cliente tem contas em múltiplas instituições, cada uma com seu próprio identificador interno.
**Resolução de entidade** é o processo de reconhecer que dois registros, de fontes diferentes, se
referem à mesma pessoa — por CPF (com cuidado de minimização e segurança, `seguranca-aplicacao/09`
e `/10`), ou por outro identificador comum. O risco: falsos positivos (unificar duas pessoas
diferentes) têm consequência tão séria quanto falsos negativos (tratar a mesma pessoa como duas),
porque uma unificação errada mistura histórico financeiro de pessoas distintas — um erro que uma
auditoria trata como grave.

> **Reencontro — `dados-distribuidos/06` e `kafka/07`.** A escolha de modelo pela forma da query,
> não pelo diagrama de entidades, é o mesmo critério daquele marco, agora aplicado à camada
> analítica em vez de operacional. A evolução de schema de um evento Kafka (`kafka/07`) é o mesmo
> problema de versionamento que uma dimensão SCD2 resolve do lado da tabela.

## Exemplo numa fintech

Uma compra no cartão aparece pendente no extrato às 14h32, com valor de R$ 150,00. Três dias
depois, o lojista aplica um desconto de fidelidade e a transação é efetivada em R$ 142,50. O modelo
precisa de duas linhas de fato — pendente e efetivada — ligadas pela mesma chave de negócio, com o
ouro servindo a soma **da efetivada** para fechamento e, separadamente, uma visão "o que estava
pendente em cada instante" para quem precisa reconstruir a experiência do cliente.

## Hands-on

**Tutorial.** Modele o fato de transações e a dimensão de conta com SCD2, sobre dados simulados do
`fake-transmissor`.

**Desafio.** Trate o caso pendente → efetivada corretamente, e produza a soma correta de TPV do dia
mesmo com reclassificações acontecendo depois do fato.

**Invariantes testáveis**

1. A granularidade declarada da tabela de fato é **única** — um teste de unicidade sobre a chave
   declarada não encontra duplicata.
2. As vigências da dimensão SCD2, para qualquer entidade, **não se sobrepõem nem deixam lacuna** —
   verificado programaticamente sobre todo o histórico simulado.
3. A soma por transmissora e por dia no ouro é **igual** à soma correspondente no bruto, mesmo após
   reclassificações de pendente para efetivada (conservação).
4. Nenhuma coluna monetária em nenhuma tabela usa tipo de ponto flutuante — verificado pelo schema
   declarado.

**Complemento.** Compare o modelo dimensional com uma versão *one-big-table* das mesmas consultas:
meça o custo de consulta (tempo, bytes lidos) dos dois.

**Checagem**

1. Por que declarar a granularidade antes de modelar evita o erro mais caro de modelagem analítica?
2. Por que SCD2 registra mudança como linha nova, e qual regra de vigência nunca pode ser violada?
3. Como o modelo trata uma transação que é pendente num dia e efetivada (com valor ajustado) dias
   depois?
4. Por que resolução de entidade errada é tão grave quanto não resolver entidade nenhuma?

## Principais aprendizados

- Granularidade declarada é a primeira decisão de modelagem, não a última — e ela vira um teste de
  unicidade executável, não só uma frase de documentação.
- SCD2 registra mudança como linha nova com vigência, nunca como `UPDATE` — a mesma disciplina de
  não sobrescrever que o ledger aplica a lançamentos, aqui aplicada a dimensões.
- Transação pendente → efetivada são dois eventos distintos ligados pela mesma chave de negócio,
  nunca um só registro sobrescrito.
- Dinheiro é sempre inteiro (centavos) ou tipo decimal exato — ponto flutuante numa coluna
  monetária é bug de conformidade esperando para acontecer.
- Resolução de entidade entre instituições tem dois riscos simétricos — unificar pessoas diferentes
  é tão grave quanto não reconhecer a mesma pessoa.
