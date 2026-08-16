---
id: dominio-e-bounded-context
title: "Domínio antes do tópico: DDD tático para quem vai publicar eventos"
summary: "Bounded context como fronteira de significado, agregado como fronteira de consistência, e a regra que decide todo o resto: dentro é agora, fora é depois."
estimatedMinutes: 55
references:
  - title: "DDD Reference (Eric Evans)"
    url: https://www.domainlanguage.com/ddd/reference/
  - title: "Martin Fowler — BoundedContext"
    url: https://martinfowler.com/bliki/BoundedContext.html
  - title: "Microservices.io — Aggregate pattern"
    url: https://microservices.io/patterns/data/aggregate.html
---

## Bounded context: a fronteira do significado

"Pagamento" no antifraude é um caso de risco: tem score, histórico do portador, device
fingerprint, decisão. "Pagamento" no ledger é um par de lançamentos que soma zero: tem
conta de débito, conta de crédito, valor e data contábil. As duas coisas se chamam
pagamento, e não são a mesma coisa.

Um **bounded context** é a fronteira dentro da qual uma palavra tem um significado único.
Não é um serviço, não é um repositório, não é um time — embora acabe se alinhando com os
três. É uma fronteira **linguística**, e é a única que sobrevive a uma reorganização.

O erro correspondente é perseguir o **modelo canônico único**: uma classe `Payment` com 60
campos que serve para todo mundo e não serve bem para ninguém. Toda mudança precisa da
aprovação de todos, todo campo é opcional porque algum contexto não o usa, e o modelo vira
o gargalo político da empresa. É assim que a maioria dos projetos de integração morre —
não por tecnologia, por vocabulário.

Aceitar múltiplos significados custa tradução. Recusar custa o projeto.

Vale distinguir de um vizinho próximo: o monolito modular de `spring-boot/13` traça
fronteiras **entre módulos dentro do mesmo processo**, e quem as viola paga com um teste de
arquitetura vermelho. Aqui a fronteira é **entre contextos, através da rede**, e quem a
viola paga com latência, indisponibilidade e um contrato público que não pode mais mudar. O
conceito é o mesmo; o preço de errar é de outra ordem — e é por isso que vale desenhar a
fronteira dentro do processo antes de distribuí-la.

## Agregado: a fronteira de consistência

Esta é a regra que decide tudo adiante, e vale a pena decorá-la:

> **O que está dentro do agregado é consistente agora. O que está fora é consistente
> depois.** Dentro é transação; fora é evento.

Um agregado é um grupo de objetos tratado como uma unidade para efeito de mudança de
estado, com uma raiz que é o único ponto de entrada. A pergunta que define a fronteira não
é "o que é parecido?", é **"qual invariante precisa ser verdadeira a cada commit?"**.

"O saldo disponível não pode ficar negativo" precisa valer a cada débito. Logo, saldo e
lançamentos que o afetam estão no mesmo agregado, e uma transação os protege. "O extrato
mostra o pagamento" não precisa valer no mesmo instante — logo, o extrato está fora, e um
evento o alimenta.

Duas heurísticas que economizam meses:

**Uma transação, um agregado, por requisição.** Se a sua operação precisa alterar dois
agregados atomicamente, ou a fronteira está errada, ou você precisa de uma saga (marco 09)
e vai ter que conviver com um estado intermediário visível.

**Agregado pequeno.** O agregado grande — "o cliente inteiro", com contas, cartões,
endereços e limites — parece organizado e vira contenção de escrita: duas operações que
não têm nada a ver uma com a outra disputam o mesmo lock. O tamanho certo é o menor que
ainda protege a invariante.

E o corolário que vale para a trilha inteira: **é por isso que o outbox existe**. Se o
evento precisa sair junto com a mudança de estado, e a mudança de estado é uma transação
de um agregado, então o evento tem que ser gravado na mesma transação — não há commit
atômico entre banco e broker (marco 08, e a mecânica em `spring-boot/06`).

## Entidade, value object e o dinheiro

**Entidade** tem identidade que persiste através das mudanças: a conta `acc-123` continua
a mesma depois de mil lançamentos. **Value object** é definido pelo valor, é imutável e não
tem identidade: `Money(15075, "BRL", 2)` é igual a qualquer outro `Money` com os mesmos
componentes.

`Money` é o value object que toda fintech implementa e muitas implementam errado. As três
regras, já vistas em `go-fintech/02` e `spring-boot/05` e repetidas aqui porque no evento
elas ficam **públicas**:

1. Quantia é **inteiro na menor unidade** — centavos, não reais com vírgula. Ponto
   flutuante binário não representa 0,1 exatamente, e o erro acumulado em milhões de
   lançamentos quebra a conciliação.
2. Moeda é **explícita** no objeto. `100` não significa nada; `100 BRL` significa.
3. Escala é **explícita** quando varia (câmbio, cripto, juros com mais casas).

Num evento, isso vira contrato: `{"amount": 15075, "currency": "BRL", "scale": 2}`. Todo
consumidor futuro, inclusive o parceiro externo, vai depender dessa forma. Errar aqui não é
um bug local — é um bug que você exporta.

## Context map: como os contextos se relacionam

Desenhar caixas não informa nada; o tipo de relação é a informação:

- **Shared kernel** — dois contextos compartilham um pedaço de modelo. Barato de começar,
  caro de manter: qualquer mudança exige acordo dos dois times.
- **Customer/supplier** — o rio corre para um lado: o fornecedor atende às necessidades do
  cliente, negociadas. É a relação saudável entre `pix-gateway` e `fin-flow`.
- **Conformist** — você aceita o modelo do outro como ele é, sem tradução, porque não tem
  poder de negociação. Comum com bancos e bandeiras.
- **Anticorruption layer (ACL)** — você traduz na fronteira, para que o modelo do outro
  não vaze para dentro do seu.

A ACL é o item que mais se economiza e mais se paga depois. O payload do PSP tem
`status: "APPROVED_WITH_RESTRICTIONS"`, e alguém decide guardar isso direto no domínio
"porque é quase igual ao nosso". Meses depois, o domínio inteiro fala a língua do parceiro,
e trocar de parceiro virou reescrita.

## Evento de domínio × evento de integração

A distinção mais prática do marco, e a mais ignorada.

**Evento de domínio** é interno ao contexto. `SaldoReservado` dentro do `ledger-core` pode
mudar de forma toda semana, porque só o dono o lê. Ele existe para desacoplar o modelo de
si mesmo.

**Evento de integração** cruza a fronteira. `payments.authorized` é contrato público: tem
versão, dono, catálogo e consumidores que você não conhece. Ele não pode mudar toda semana,
e a política de evolução dele é o assunto do marco 05.

O antipadrão é publicar o evento de domínio cru. É rápido — a classe já existe, o mapper já
está pronto — e o efeito é que o seu modelo interno virou contrato público sem ninguém ter
decidido isso. A partir daí, renomear um campo interno quebra um parceiro externo, e a sua
liberdade de refatorar acabou.

A tradução de domínio para integração é feita de propósito, na saída: menos campos, nomes
estáveis, sem PII desnecessária, com envelope.

## Exemplo numa fintech

Desenhando as fronteiras do `fin-platform`:

| Contexto | Dono de | Invariante que protege |
| --- | --- | --- |
| **Iniciação** (`pix-gateway`) | a intenção de pagar | a mesma intenção não vira dois pagamentos |
| **Risco** (antifraude) | a decisão de risco | toda autorização tem uma decisão registrada |
| **Ledger** (`ledger-core`) | os lançamentos e o saldo | a soma dos lançamentos é zero; saldo não fica negativo |
| **Liquidação** (`fin-flow`) | o processo até o dinheiro sair | todo pagamento iniciado termina em estado terminal |

Repare no que **não** aparece duas vezes: "saldo". Saldo tem exatamente um dono, o ledger.
A liquidação não guarda saldo, o gateway não guarda saldo, o app mostra uma **projeção** do
saldo (marco 06) e sabe que ela pode estar alguns segundos atrás.

O dia em que dois contextos passam a ter "o saldo" é o dia em que começa a conciliação
manual — e ela nunca mais termina.

Repare também no que o "saldo disponível" realmente é: o saldo contábil menos as reservas
em voo. Ele parece um segundo saldo e não é — é uma função do primeiro, calculada pelo dono.

## Hands-on

**Desafio — quem é dono de qual invariante.** Dadas as seis invariantes abaixo do
`fin-platform`, diga quais exigem estar **no mesmo agregado** (consistência transacional) e
quais toleram **evento** (consistência posterior). Justifique cada uma pelo custo de violar:

1. O saldo disponível de uma conta nunca fica negativo.
2. A soma dos lançamentos de uma transação é exatamente zero.
3. Todo pagamento autorizado tem uma decisão de risco registrada.
4. O extrato do cliente mostra todos os lançamentos do dia.
5. Um pagamento com a mesma chave de idempotência não é processado duas vezes.
6. A posição consolidada do cliente bate com a soma das contas.

Produza `CONTEXTOS.md` no repo do `fin-flow`: contextos, agregados de cada um, e uma tabela
invariante → dono → mecanismo (transação ou evento) → custo de violar.

**Invariantes testáveis**

1. Toda invariante da lista tem **exatamente um** dono. Se duas caixas reivindicam a mesma,
   a fronteira está errada.
2. Nenhuma invariante marcada como transacional atravessa dois agregados. Se atravessa, ou
   os agregados se fundem, ou vira saga com estado intermediário visível.
3. "Saldo" aparece como dado de escrita em um único contexto; em todos os outros, aparece
   como projeção, com a palavra "projeção" escrita.

**Complemento.** Escolha a invariante mais polêmica da lista e escreva o parágrafo que
você diria ao time de produto explicando o custo da alternativa. Se você não consegue
explicar sem jargão, a fronteira ainda não está clara para você.

**Checagem**

1. Qual pergunta define a fronteira de um agregado — e por que não é "o que é parecido"?
2. Por que o outbox é consequência da fronteira do agregado, e não uma escolha de broker?
3. O que muda, na prática, entre publicar um evento de domínio e um de integração?
4. Por que "saldo" só pode ter um dono, e o que é o "saldo disponível" nesse desenho?

## Principais aprendizados

- Bounded context é fronteira de significado; o modelo canônico único é como projetos de
  integração morrem, por vocabulário e não por tecnologia.
- Agregado é fronteira de consistência: dentro é agora (transação), fora é depois (evento).
  Uma transação, um agregado, por requisição — e agregado pequeno.
- O outbox não é escolha de broker: é consequência de o evento precisar sair na mesma
  transação da mudança de estado.
- `Money` é value object com quantia inteira, moeda e escala explícitas — e num evento esse
  erro deixa de ser local e passa a ser exportado.
- Evento de domínio é interno e muda quando quiser; evento de integração é contrato público.
  Publicar o primeiro cru é vazar o modelo interno para o mundo sem decidir isso.
