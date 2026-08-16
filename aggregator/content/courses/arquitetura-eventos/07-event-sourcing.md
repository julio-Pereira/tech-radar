---
id: event-sourcing
title: "Event sourcing: quando o log é a verdade"
summary: "Stream por agregado, estado como fold, snapshot como otimização — e a crítica honesta: a maioria dos times quer audit log com outbox, não event sourcing."
estimatedMinutes: 55
references:
  - title: "Martin Fowler — Event Sourcing"
    url: https://martinfowler.com/eaaDev/EventSourcing.html
  - title: "Microservices.io — Event sourcing"
    url: https://microservices.io/patterns/data/event-sourcing.html
  - title: "Greg Young — Versioning in an Event Sourced System"
    url: https://leanpub.com/esversioning/read
---

## O modelo

Em event sourcing, você não guarda o estado. Guarda a **sequência de fatos** que levou até
ele, e o estado é derivado.

- **Stream por agregado.** Cada conta tem o seu fluxo: `ContaAberta`, `ValorCreditado`,
  `ValorDebitado`, `ContaBloqueada`. O fluxo é append-only — nada é editado, nada é apagado.
- **Estado como fold.** Carregar o agregado é começar do zero e aplicar os eventos em ordem.
  `saldo = fold(0, eventos)`. A função de aplicação é pura, sem I/O e sem decisão.
- **Snapshot.** A partir de alguns milhares de eventos, o replay fica caro. O snapshot é o
  estado materializado num ponto do fluxo — carregue o snapshot, aplique só o delta. É
  **otimização**, nunca verdade: replay total e snapshot+delta precisam dar o mesmo saldo, e
  isso é um teste, não uma esperança.
- **Concorrência otimista pela versão.** O comando chega dizendo "eu vi a versão 42"; se o
  fluxo já está na 43, alguém escreveu antes e a operação é rejeitada ou refeita. É a mesma
  ideia do `@Version` do JPA em `spring-boot/05`, agora aplicada ao fluxo.

Repare no que muda de lugar: a decisão continua no agregado (marco 02), a invariante
continua protegida por uma transação. O que muda é **o que é persistido**.

## Upcasting: os eventos de 2019

O custo que as apresentações não mostram.

Um evento gravado em 2019 tem o formato de 2019 e vai ser lido, para sempre, pelo código de
hoje. Isso não é uma migração que você roda uma vez: é uma tradução na leitura, permanente,
chamada **upcasting**. O `V1` sobe para `V2`, que sobe para `V3`, e o agregado enxerga só a
versão atual.

Três consequências práticas:

1. **Você nunca deleta um upcaster.** Enquanto existir um evento antigo no fluxo — e existe
   —, a cadeia de tradução precisa estar completa.
2. **Renomear um campo é um upcaster novo.** Aquilo que num banco seria um `ALTER TABLE` de
   dez segundos vira código permanente.
3. **A cadeia precisa de teste.** Um evento de cada versão histórica, no repositório, com um
   teste que prova que ele ainda carrega. Sem isso, a quebra aparece no dia em que alguém
   abrir uma conta antiga.

## A crítica honesta

Uma trilha que só vende o padrão forma arquiteto que distribui problema, então aqui vai o
contra-argumento com todas as letras.

**Event sourcing acopla o time à decisão para sempre.** Não existe "vamos experimentar por
seis meses". Depois de um ano de eventos em produção, sair custa uma migração completa com
reconstrução de estado — e ninguém faz.

**Consulta trivial vira projeto.** "Me dá as contas com saldo acima de X" é um `WHERE` num
sistema normal e exige uma projeção dedicada aqui. Toda pergunta nova sobre o estado atual é
trabalho de engenharia, não de SQL.

**A curva de aprendizado atinge o time inteiro.** Quem entra precisa entender fold,
upcasting, snapshot e concorrência otimista antes de fazer o primeiro CRUD.

**E o que a maioria dos times realmente quer é outra coisa:** um registro auditável do que
aconteceu, e eventos publicados de forma confiável. Isso é **audit log + outbox** — muito
mais barato, sem nenhuma das consequências acima, e resolve 90% das motivações que levam
alguém a propor event sourcing numa reunião.

**Quando vale:** quando o histórico **é** o produto. Ledger contábil, prontuário médico,
rastreabilidade regulatória, sistemas em que a pergunta "como chegamos a este estado?" é
feita por gente de fora e precisa ser respondida com precisão jurídica.

## LGPD: apagar o que é imutável

O conflito é direto: a lei manda eliminar dado pessoal a pedido, e o fluxo é append-only.

- **Crypto-shredding.** O dado pessoal é cifrado com uma chave por titular; apagar a chave
  torna o conteúdo irrecuperável, e o fluxo permanece íntegro — offsets, ordem e hashes
  intactos. É a solução que reconcilia as duas obrigações (`kafka/13` mostra a operação).
- **Evento de retificação.** Para correção, e não para eliminação: `EnderecoCorrigido` é um
  fato novo, na frente do fluxo. Nada é editado no passado.
- **Pseudonimização desde o design.** A melhor: o fluxo carrega identificador opaco, e a
  ligação com a pessoa vive num sistema separado e auditado — que **pode** ser apagado sem
  tocar no fluxo.

A escolha precisa ser feita antes do primeiro evento em produção. Depois, ela custa
reescrever o histórico, que é exatamente o que event sourcing promete que você nunca faz.

## Exemplo numa fintech

O **ledger double-entry já é event sourcing**, e é anterior à computação em uns 500 anos.

Um lançamento contábil é imutável: você não edita, você lança o contrário. O saldo não é um
campo — é a soma dos lançamentos. Estorno não apaga o débito; é um crédito novo, com data e
documento próprios. Snapshot existe e tem nome: **saldo de fechamento** do período. E a
auditoria funciona justamente porque o histórico é a verdade.

Isso dá duas conclusões úteis. A primeira: se você trabalha com ledger, você já opera um
sistema event-sourced e conhece o padrão pela prática — inclusive os custos (fechamento
mensal é literalmente um snapshot para não reprocessar tudo). A segunda, mais importante: o
ledger é o caso em que o padrão é justificado **pelo domínio**, não pela arquitetura. Aplicar
o mesmo ao cadastro de clientes, onde o histórico não é o produto, é copiar a forma sem a
razão.

## Hands-on

**Desafio — `Account` como fold de eventos.**

1. Modele os eventos: `ContaAberta`, `ValorCreditado`, `ValorDebitado`, `ContaBloqueada`.
2. Implemente `apply(estado, evento) -> estado` como função **pura** — sem I/O, sem decisão,
   sem relógio.
3. Implemente `decide(estado, comando) -> []evento`, que é onde a invariante vive: débito
   que deixaria o saldo negativo devolve erro e **nenhum** evento.
4. Implemente carregamento por replay e concorrência otimista por versão do fluxo.
5. Implemente snapshot a cada 100 eventos, e o carregamento snapshot+delta.
6. `git commit -m "feat: agregado Account event-sourced com snapshot"`.

**Invariantes testáveis**

1. Para o mesmo fluxo, `replay total` e `snapshot + delta` produzem **exatamente** o mesmo
   saldo. É o teste que impede o snapshot de virar uma segunda verdade.
2. `apply` é pura: rodada duas vezes sobre o mesmo estado e evento, dá o mesmo resultado, e
   não toca em nada externo.
3. Um comando rejeitado não gera evento nenhum — o fluxo não registra tentativas inválidas.
4. Dois comandos concorrentes na mesma versão: um passa, o outro é rejeitado por conflito.
5. Um evento em formato antigo, guardado como fixture, ainda carrega pelo upcaster.

**Complemento.** Escreva a ADR do seu sistema respondendo: *o histórico é o produto aqui?*
Se a resposta for não, a ADR deve concluir por **audit log + outbox**, e isso é um resultado
tão válido quanto o outro — provavelmente mais.

**Checagem**

1. Por que o snapshot nunca pode ser tratado como verdade, e qual teste garante isso?
2. O que é upcasting, e por que um upcaster nunca é deletado?
3. Quais são os três custos permanentes de event sourcing, e o que a maioria dos times
   realmente queria?
4. Como se apaga dado pessoal de um fluxo append-only, e por que a decisão precisa vir antes
   do primeiro evento em produção?

## Principais aprendizados

- O fluxo é a verdade e o estado é `fold` dos eventos; snapshot é otimização e precisa ser
  provado idêntico ao replay total.
- Upcasting é tradução permanente na leitura: você nunca deleta um upcaster, e a cadeia
  precisa de fixtures de cada versão histórica no repositório.
- O padrão acopla o time para sempre, transforma consulta trivial em projeto e atinge a
  curva de aprendizado de todo mundo que entra.
- A maioria dos times quer **audit log + outbox**, não event sourcing — muito mais barato e
  sem nenhuma dessas consequências.
- Vale quando o histórico **é** o produto. O ledger double-entry é o caso canônico, e ele
  justifica o padrão pelo domínio, não pela arquitetura.
