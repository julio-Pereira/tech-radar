---
id: lancamentos-e-estorno
title: "Lançamentos imutáveis e estorno"
summary: "O passado de um ledger não se edita: corrige-se o presente com um lançamento que desfaz ou ajusta o anterior — e a idempotência decide se o retry cria dinheiro."
estimatedMinutes: 65
references:
  - title: "PostgreSQL — Transaction Isolation"
    url: https://www.postgresql.org/docs/current/transaction-iso.html
---

## *Append-only*: impor, não só prometer

Um journal **append-only** (só permite inserção, nunca atualização ou remoção) é uma garantia
fraca se depender apenas de uma convenção de código — a forma robusta de impor é **no próprio
banco de dados**: revogar privilégios de `UPDATE` e `DELETE` do papel que a aplicação usa para
escrever lançamentos, e, quando necessário, reforçar com gatilhos que rejeitam explicitamente
qualquer tentativa. Um teste que verifica essa permissão **de verdade** contra o banco é
estruturalmente diferente (e mais confiável) de um teste que só verifica se o código da aplicação
"nunca chama" `UPDATE`.

## Estorno × ajuste

**Estorno** (*reversal*) desfaz um lançamento inteiro, gerando o lançamento inverso exato — útil
quando a operação original simplesmente não deveria ter ocorrido. **Ajuste** (*adjustment*)
corrige uma diferença sem necessariamente desfazer o lançamento original por completo — útil
quando parte da operação estava correta e só um componente (uma taxa calculada errado, por
exemplo) precisa de correção. Escolher entre os dois é uma decisão de modelagem: estornar e
relançar do zero é mais simples de raciocinar; ajustar é mais preciso quando só uma fração da
operação original estava errada.

## Idempotência de *posting*

Toda operação de lançamento carrega uma **chave de idempotência** — um identificador natural da
operação de negócio, não um UUID aleatório gerado a cada tentativa — e uma restrição de
unicidade no banco garante que a mesma chave, processada mais de uma vez (por *retry* de rede, por
exemplo), produza **um único** lançamento e devolva a mesma resposta em todas as tentativas. Essa é
a mesma disciplina de identidade e unicidade já formalizada em `dados-distribuidos/10`, aplicada
aqui especificamente ao ato de postar um lançamento contábil.

## Bitemporalidade simples

Dois tempos importam para um lançamento: a **data de registro** (quando o lançamento entrou no
sistema) e a **data de competência** (a data econômica a que o lançamento se refere, que pode ser
anterior à data de registro — um lançamento retroativo). Um relatório que confunde os dois tempos
produz respostas erradas para perguntas como "qual era o saldo em 15 de março" quando um
lançamento retroativo com competência de março só foi registrado em abril.

## Trilha de auditoria por lançamento

Cada lançamento carrega, além das pernas de débito e crédito, uma **trilha de auditoria** mínima:
quem (ou qual sistema) iniciou a operação, quando foi registrado, por que (um motivo ou referência
de operação de negócio), e, no caso de um estorno ou ajuste, a referência explícita ao lançamento
original. Sem essa referência, um estorno é apenas "mais um lançamento" — com ela, é possível
reconstruir a história completa de uma correção, incluindo o que ela corrigiu e por quê.

## Lançamento em período fechado

Um lançamento com data de competência dentro de um período já fechado (o marco 07 detalha o
mecanismo de fechamento) não pode simplesmente ser inserido como se o período ainda estivesse
aberto — ele precisa passar por uma via de **ajuste auditado**, que registra a correção no período
atual sem alterar o balancete já fechado do período anterior. A imutabilidade de um período fechado
e a imutabilidade de um lançamento individual são a mesma ideia aplicada em duas escalas.

## Estorno de estorno

Um estorno pode, ele mesmo, precisar ser desfeito (o estorno foi feito por engano, por exemplo) —
e esse "estorno de estorno" é permitido, mas precisa permanecer **rastreável** à cadeia completa: o
lançamento original, o estorno, e o estorno do estorno, cada um referenciando explicitamente o
anterior. Sem esse encadeamento, reconstruir "o que realmente aconteceu" numa cadeia de correções
sucessivas se torna impossível a partir de um certo ponto.

```diagrama
lg-estorno
```

## Journal × *event store*: uma comparação honesta

Um journal contábil *append-only* é, estruturalmente, um caso especializado de **event store**
(`arquitetura-eventos/07` já trata event sourcing de forma geral) — a diferença central é que o
journal contábil carrega uma invariante adicional e específica: **toda entrada precisa balancear**
(débitos iguais a créditos). Um event store genérico não impõe essa restrição, porque nem todo
evento de domínio representa movimento de dinheiro — a especialização do journal contábil é
exatamente essa invariante extra.

## Exemplo numa fintech

Uma transferência foi lançada ontem com o valor errado (R$ 1.000 em vez de R$ 100); hoje, o ledger
registra um **estorno** do lançamento original (devolvendo o saldo ao estado anterior) seguido do
lançamento **correto** com o valor certo — o extrato do cliente mostra os três lançamentos (o
errado, o estorno, o correto), contando a história completa, sem nenhuma edição do passado.

## Hands-on

**Tutorial.** Implemente o journal *append-only* (com permissões reais no banco), estorno e
ajuste.

**Desafio.** Implemente idempotência de *posting* sob concorrência, com a chave natural da
operação.

**Invariantes testáveis**

1. O papel de aplicação **não consegue** executar `UPDATE` ou `DELETE` na tabela de lançamentos —
   testado como uma verificação real de permissão contra o banco, não uma suposição sobre o
   código.
2. A **mesma chave de idempotência**, enviada N vezes concorrentemente, produz **exatamente um**
   lançamento, e todas as N respostas são idênticas entre si.
3. O estorno de um lançamento **devolve o saldo ao valor anterior** — propriedade verificada sobre
   sequências aleatórias de lançamentos e estornos com semente fixa.
4. Um estorno de estorno é permitido **uma vez** e permanece **rastreável** à cadeia completa
   (original → estorno → estorno do estorno), testado com a consulta que reconstrói essa cadeia.
5. Um lançamento retroativo altera corretamente o saldo "em data" para a data de competência
   anterior, e **não** altera o balancete de um período já fechado (verificado em conjunto com o
   marco 07).
6. **Demonstração do limite:** a mesma carga de lançamentos concorrentes, rodada **sem** a
   restrição de unicidade de chave de idempotência, produz lançamentos duplicados — contados
   explicitamente para evidenciar o problema que a restrição previne.

**Complemento.** Compare, por escrito, o seu journal contábil com um *event store* genérico: o que
cada um garante, e o que o journal contábil garante **além** do que um event store genérico
garantiria.

**Checagem**

1. Por que impor a imutabilidade do journal via permissão real do banco é mais confiável do que
   depender apenas de uma convenção no código da aplicação?
2. Em que situação um ajuste é preferível a um estorno completo, e vice-versa?
3. Por que confundir data de registro com data de competência produz respostas erradas para
   perguntas sobre saldo histórico?
4. O que diferencia especificamente um journal contábil de um *event store* genérico?

> **Reencontro — `dados-distribuidos/10`.** A identidade e unicidade daquele marco são exatamente
> o mecanismo que garante a idempotência de *posting* deste marco — a chave natural da operação e
> a restrição de unicidade no banco são a mesma disciplina, aplicada aqui a lançamentos contábeis.

A comparação entre journal contábil e *event store* se apoia diretamente no event sourcing já
formalizado em `arquitetura-eventos/07`, e o outbox/inbox de `arquitetura-eventos/08` é o mecanismo
que, na prática, garante que um lançamento postado seja também publicado como evento exatamente
uma vez para os sistemas consumidores. A matriz de concorrência de `concorrencia-e-recursos/10`
segue sendo a referência de qual mecanismo usar para proteger a escrita concorrente de um
lançamento e seu estorno correspondente.

## Principais aprendizados

- Impor imutabilidade via permissão real do banco é mais confiável do que depender só de
  convenção de código.
- Estorno desfaz um lançamento inteiro; ajuste corrige uma fração dele — a escolha é uma decisão
  de modelagem, não uma regra fixa.
- A mesma chave de idempotência processada múltiplas vezes precisa produzir um único lançamento,
  com a mesma resposta em toda tentativa.
- Data de registro e data de competência são tempos diferentes — confundi-los produz respostas
  erradas sobre saldo histórico.
- Um journal contábil é um event store especializado, com uma invariante adicional específica: toda
  entrada precisa balancear.
