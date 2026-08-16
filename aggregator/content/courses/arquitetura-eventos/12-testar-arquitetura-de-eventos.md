---
id: testar-eventos
title: "Testar arquitetura de eventos"
summary: "Given/when/then no agregado sem banco nenhum, contract testing consumer-driven para evento assíncrono, e as duas suítes obrigatórias: reprojeção determinística e idempotência."
estimatedMinutes: 50
references:
  - title: "Pact — Consumer-driven contract testing"
    url: https://docs.pact.io/
  - title: "Martin Fowler — Contract Test"
    url: https://martinfowler.com/bliki/ContractTest.html
  - title: "Testcontainers — Getting started"
    url: https://testcontainers.com/getting-started/
---

## Given / when / then no agregado

O teste mais legível que existe em domínio rico, e ele **não precisa de banco**:

```
given:  [ContaAberta(saldo=0), ValorCreditado(100)]
when:   Debitar(150)
then:   erro SaldoInsuficiente, nenhum evento
```

```
given:  [ContaAberta(saldo=0), ValorCreditado(100)]
when:   Debitar(80)
then:   [ValorDebitado(80)]
```

Funciona porque o agregado do marco 07 tem duas funções puras: `apply(estado, evento)` e
`decide(estado, comando) -> []evento`. Nenhuma das duas toca em I/O. O teste é uma tabela de
casos, roda em milissegundos, e o diff quando quebra aponta exatamente para a invariante
violada.

Este é o teste que **prova a regra de negócio**. Repare no segundo caso do primeiro exemplo:
`nenhum evento`. Comando rejeitado não registra tentativa no fluxo — e essa é uma asserção
que se esquece de escrever e que o marco 07 listou como invariante.

Se você **não** faz event sourcing, a mesma estrutura vale com o estado no lugar do
`given`: dado este estado, quando este comando, então este estado e estes eventos
publicados.

## Contract testing para evento assíncrono

Em API síncrona, o consumer-driven contract é conhecido: o consumidor declara o que precisa,
o CI do produtor quebra se ele remover. Em evento assíncrono, a ideia é a mesma e a
implementação muda de lugar.

O consumidor publica um **pacto**: "eu consumo `payments.authorized` e uso os campos
`paymentId`, `accountId`, `amount.value`, `amount.currency`". O produtor roda esse pacto no
seu CI: se um campo declarado sumir, ficar obrigatório ou mudar de tipo, o build do
**produtor** fica vermelho — antes do merge, não três semanas depois no consumidor.

Isso resolve exatamente o modo de falha do marco 05: a quebra que aparece longe da causa e
depois. Aqui ela aparece perto e agora.

Duas notas práticas. O pacto cobre o que o consumidor **usa**, não o schema inteiro — é o
que permite ao produtor evoluir os campos que ninguém lê. E o pacto não substitui a
compatibilidade de schema no registry: um é sobre uso real, o outro é sobre forma. Rodar os
dois no CI é barato (`kafka/07` cobre a segunda metade).

## As duas suítes obrigatórias

**Teste de reprojeção determinística.** Dado um conjunto fixo de eventos, projete, guarde o
resultado, apague, reprojete. Os dois resultados precisam ser idênticos — por hash das
linhas ordenadas, não "parece igual". É o teste que garante a propriedade "descartável por
design" do marco 06, e ele falha na hora em que alguém introduz um `now()` na projeção.

**Teste de idempotência.** Entregue o mesmo evento três vezes e compare o estado final com o
da entrega única. Vale para toda projeção e todo consumidor com efeito. É o teste que teria
pego o consumidor não idempotente antes de ele duplicar um lançamento em produção.

As duas são baratas, rodam sem infraestrutura e cobrem os dois modos de falha mais caros de
um sistema de eventos. A ausência delas é o sinal mais confiável de que uma arquitetura
"orientada a eventos" nunca foi exercitada de verdade.

Acrescente uma terceira quando houver saga: **teste de retomada** — mate o processo em cada
passo e verifique o estado final (é o desafio do marco 09, promovido a suíte).

## Compatibilidade de schema como gate de merge

O CI precisa recusar o merge que quebra o contrato. Concretamente:

1. O schema do evento vive no repositório, versionado junto do código.
2. Um step compara o schema do PR com o publicado e falha se a mudança não for compatível na
   política declarada (`BACKWARD`, na maioria dos casos).
3. Os pactos dos consumidores conhecidos rodam contra o schema novo.
4. As fixtures de eventos históricos — uma por versão — são carregadas pelo upcaster
   (marco 07).

O passo 4 é o mais esquecido e o que evita o incidente mais irritante: o evento de 2019 que
deixa de carregar porque alguém removeu um upcaster achando que estava morto.

Nada disso é sofisticado. É a mesma ideia do teste de arquitetura que quebra quando um
módulo importa o interno do outro: **transformar uma convenção que depende de disciplina
numa que depende do build**.

## O que precisa de infra, e o que não precisa

| Teste | Precisa de infra? |
| --- | --- |
| given/when/then do agregado | não — funções puras |
| idempotência da projeção | não — aplique os eventos em memória |
| reprojeção determinística | não, se a projeção for isolável do store |
| pacto consumidor-produtor | não — o pacto é um arquivo |
| consumidor com broker real | **sim** — Testcontainers (`spring-boot/11`) |
| saga com falha e retomada | **sim** — banco real, para provar a transação |

A regra é subir infra só onde a infra é o objeto do teste. Uma suíte em que tudo sobe
contêiner é lenta, instável e desencoraja a execução — o que faz o time rodá-la menos, que é
o oposto do objetivo.

## Exemplo numa fintech

O bug que motivou este marco existiu de verdade em muitos times: o consumidor de liquidação
não era idempotente, o webhook do PSP foi reenviado, e dois lançamentos entraram no ledger.
A conciliação pegou — 11 dias depois.

O teste que teria pego isso em 8 milissegundos:

```
dado    um evento LiquidacaoConfirmada(paymentId=p1, valor=15075)
quando  ele é processado 3 vezes
então   o ledger contém exatamente 2 lançamentos (débito e crédito),
        e a soma dos lançamentos de p1 é zero
```

Repare em duas coisas. A asserção não é "não deu erro": é sobre o **estado final** e sobre a
**invariante contábil** — que é a mesma que o `go-fintech/02` protege no código e que o
marco 08 da observabilidade transforma em alerta. E o teste não precisa de broker, banco nem
PSP: é o consumidor, três chamadas e uma asserção.

Um teste desses custa dez minutos para escrever. A conciliação daqueles 11 dias custou
bastante mais.

## Hands-on

**Tutorial — suíte given/when/then do agregado `Payment`.**

1. Escreva a tabela de casos: iniciado → autorizado, iniciado → recusado, autorização
   duplicada, débito acima do saldo, estorno de pagamento inexistente.
2. Cada caso é `given []Evento`, `when Comando`, `then []Evento ou erro`. Sem banco, sem
   mock de repositório, sem contêiner.
3. Inclua o caso de comando rejeitado com asserção explícita de **nenhum evento**.
4. `git commit -m "test: suíte given/when/then do agregado Payment"`.

**Desafio — o teste que teria pego o bug.** Escreva o teste de idempotência do consumidor de
liquidação do marco 08, no formato do exemplo acima. Depois **remova** o inbox do consumidor
e confirme que o teste falha. Um teste que passa com o bug presente não testa nada.

**Invariantes testáveis**

1. A suíte do agregado roda sem nenhum contêiner e em menos de um segundo.
2. Processar o mesmo evento 3× produz o mesmo estado final que processá-lo 1×.
3. Reprojeção completa gera um read model com hash idêntico ao anterior.
4. Um PR que adiciona campo obrigatório a um evento existente falha no CI.
5. Toda versão histórica de evento tem uma fixture no repositório, e ela carrega.

**Complemento.** Escreva o pacto de um consumidor do `payments.authorized` listando só os
campos que ele usa. Depois remova do produtor um campo que **não** está no pacto e confirme
que o build continua verde — é assim que se prova que o pacto libera evolução em vez de
congelar o contrato inteiro.

**Checagem**

1. Por que o teste given/when/then não precisa de banco, e o que ele prova que um teste de
   integração não prova?
2. O que o pacto do consumidor cobre, e por que ele não substitui a compatibilidade de
   schema?
3. Quais são as duas suítes obrigatórias de um sistema de eventos, e qual modo de falha cada
   uma pega?
4. Por que uma fixture de evento histórico precisa estar no repositório?

## Principais aprendizados

- Given/when/then é o teste mais legível de domínio rico e roda sem infraestrutura, porque
  `apply` e `decide` são funções puras — inclusive a asserção de "nenhum evento".
- O pacto consumer-driven move a quebra de contrato para perto e agora: o build do produtor
  fica vermelho antes do merge, não três semanas depois no consumidor.
- Reprojeção determinística e idempotência são as duas suítes obrigatórias; a ausência delas
  é o sinal de que a arquitetura nunca foi exercitada.
- O CI é o lugar da compatibilidade de schema, dos pactos e das fixtures históricas —
  convenção que depende de disciplina vira convenção que depende do build.
- Suba infraestrutura só onde ela é o objeto do teste; suíte lenta é suíte que o time deixa
  de rodar.
