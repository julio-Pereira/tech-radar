---
id: ddd-tatico-em-codigo
title: "DDD tático em código"
summary: "Um agregado é uma fronteira de consistência escrita em código: se a API pública permite violar a invariante, não é agregado, é um saco de dados."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Domain-Driven Design (Eric Evans)"
    url: https://www.domainlanguage.com/ddd/
  - title: "Implementing Domain-Driven Design (Vaughn Vernon)"
    url: https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/
---

## Entidade, *value object*, e a diferença que importa

Uma **entidade** tem identidade que persiste ao longo do tempo, mesmo que seus atributos mudem — uma
conta é a mesma conta antes e depois de um depósito. Um ***value object*** não tem identidade própria
— é definido inteiramente pelo seu valor, e dois com os mesmos atributos são intercambiáveis.
`Money` é o exemplo canônico: imutável, representado em **centavos inteiros** (nunca ponto
flutuante — o erro de arredondamento acumulado em dinheiro não é hipotético, é garantido ao longo do
tempo), com a moeda como parte do valor, não um detalhe externo. Tratar `Money` como *value object*
imutável elimina uma classe inteira de bug: nenhum código em lugar nenhum pode mudar um valor
monetário "no lugar" depois de criado.

## Agregado e raiz: a fronteira de consistência

Um **agregado** é um grupo de objetos tratado como uma unidade para fins de mudança de estado — e a
**raiz do agregado** é o único ponto de entrada: todo acesso externo passa por ela, e é ela quem
garante que nenhuma sequência de operações deixe o agregado num estado que viole sua invariante. Uma
`Transferencia` com débito, crédito e estado é um agregado se, e só se, **nenhuma combinação de
chamadas públicas** conseguir criar uma transferência com valor negativo, concluí-la duas vezes, ou
deixá-la num estado intermediário inválido. Se a API pública permite isso — se existe um setter que
troca o estado sem passar pela validação da raiz — não é um agregado, é um conjunto de dados com um
nome bonito.

## Referência entre agregados: por identidade, nunca por objeto

Um agregado nunca guarda uma **referência de objeto** a outro agregado — guarda só o identificador. A
`Transferencia` referencia a `Conta` de origem por `contaId`, nunca mantendo uma referência direta ao
objeto `Conta` carregado em memória. O motivo é duplo: evita que uma mudança num agregado force o
carregamento em cascata de outro (o problema de desempenho), e evita que uma transação pareça
abranger dois agregados quando na verdade cada agregado deveria ser consistente **por si só**, sem
depender do estado simultâneo de outro.

## Tamanho do agregado, e o custo de concorrência

Um agregado grande (que engloba muitas entidades) protege mais invariantes de uma vez — mas também
significa que qualquer mudança em qualquer parte dele compete pelo mesmo lock ou pela mesma versão
otimista, mesmo que a mudança específica não tivesse relação real com o resto. Agregados pequenos
reduzem contenção, mas forçam mais invariantes a serem eventualmente consistentes entre agregados em
vez de garantidas atomicamente dentro de um só. Não existe tamanho certo universal — existe a
pergunta "quais mudanças **precisam** ser atômicas entre si?", e a resposta desenha a fronteira.

## *Domain service*: quando a regra não cabe numa entidade

Nem toda regra de negócio pertence naturalmente a uma entidade ou *value object* — uma regra que
envolve **múltiplos agregados** ou um cálculo que não é responsabilidade natural de nenhum deles
específico vive num ***domain service***: uma função com nome do domínio (não `TransferenciaUtils`),
sem estado próprio, que orquestra. A armadilha é colocar ali regra que deveria estar dentro de um
agregado só porque "ficou mais fácil" — o sintoma é um *domain service* enorme, com conhecimento
profundo do estado interno de cada agregado que ele toca, que é o modelo anêmico do marco 01 com
outro nome.

## Repositório: coleção de agregados inteiros

Um **repositório** devolve e persiste o agregado **completo**, nunca uma fração dele — carregar só
parte de um agregado e salvar só parte de volta é a porta de entrada para um estado inconsistente que
nenhum teste unitário do agregado isolado jamais pegaria, porque o problema está na borda entre o
agregado e sua persistência, não dentro da lógica do agregado.

## Eventos de domínio: coletados e publicados depois

Um agregado pode **coletar** eventos de domínio durante uma operação (*"transferência concluída"*),
mas só os **publica** depois que a operação inteira confirma que a invariante foi respeitada — nunca
no meio da operação, antes de saber se ela vai mesmo se completar. Publicar cedo demais significa que
um consumidor externo pode reagir a um evento que descreve um estado que, no fim, nunca existiu de
verdade (porque a operação falhou depois).

```diagrama
as-agregado
```

## Fábricas, construtores, e o estado inválido impossível de criar

A defesa mais barata contra estado inválido é não deixar ele nascer: construtores e fábricas que
**recusam** parâmetros inválidos antes mesmo de instanciar o objeto, de forma que "criar uma
`Transferencia`" e "criar uma `Transferencia` válida" sejam a mesma operação, sem exceção.

## Vocabulário por linguagem

**Java**: `record` para *value objects* imutáveis, `sealed` para modelar estados fechados, construtor
validando invariante. **Go**: tipos não exportados com construtor `New...()` que é o único ponto de
criação, e métodos no tipo em vez de herança (que Go não tem) — a mesma disciplina, vocabulário
diferente.

## Exemplo numa fintech

`Transferencia` tem três estados possíveis: pendente, concluída, revertida. A raiz do agregado é o
único ponto que pode transicionar entre eles, e a transição `pendente → concluída` só acontece se
débito e crédito já tiverem sido aplicados de forma atômica — não existe caminho pela API pública que
permita "concluir" uma transferência duas vezes, nem criar uma com valor negativo. A `Transferencia`
referencia `Conta` de origem e destino só por `contaId` — jamais carregando o objeto `Conta` inteiro
dentro de si.

## Hands-on

**Tutorial.** Implemente `Money` e `Transferencia` como agregado, em Java e em Go.

**Desafio.** Escreva um teste de propriedade que gera sequências aleatórias de chamadas às operações
públicas do agregado e verifica que nenhuma sequência produz estado inválido.

**Invariantes testáveis**

1. **Nenhuma** sequência de chamadas públicas (testada por propriedade, com semente fixa, sobre um
   espaço grande de sequências geradas) deixa a `Transferencia` em estado inválido.
2. `Money` é **imutável** e **não aceita ponto flutuante** como representação interna — verificado
   por teste de tipo/construção, não por convenção de uso.
3. Teste de arquitetura: um agregado **não guarda referência de objeto** a outro agregado — só
   identificador (`contaId`, não `Conta`).
4. O repositório devolve e salva o agregado **inteiro**: uma ida e volta (carregar, salvar sem
   mudança, carregar de novo) preserva a igualdade do agregado.
5. O evento de domínio só é publicado **depois** de a invariante valer — nunca antes, mesmo que a
   operação tenha múltiplos passos internos.

**Complemento.** Mostre o mesmo domínio modelado como modelo anêmico (getters/setters, regra em
serviço externo) e aponte, linha por linha, onde a regra de negócio "vazou" para fora do agregado.

**Checagem**

1. Por que `Money` deve ser imutável e nunca representado em ponto flutuante?
2. O que torna uma `Transferencia` um agregado de verdade, e não "um saco de dados com nome bonito"?
3. Por que um agregado referencia outro por identificador, nunca por objeto?
4. Quando uma regra de negócio pertence a um *domain service* em vez de a uma entidade?
5. Por que um repositório sempre devolve e salva o agregado inteiro?
6. Por que um evento de domínio só pode ser publicado depois que a invariante do agregado já foi
   confirmada?

> **Reencontro — `arquitetura-eventos/02`; `concorrencia-e-recursos/10`; `dados-distribuidos/10`;
> `go-fintech/02`.** Agregado e fronteira de consistência retomam diretamente o bounded context e o
> agregado conceitual de `arquitetura-eventos/02` — aqui levados para o código real, em Java e Go.
> A concorrência no ledger de `concorrencia-e-recursos/10` é o mesmo problema de contenção que o
> tamanho do agregado desta trilha modula. A identidade e unicidade em ambiente shardado de
> `dados-distribuidos/10` é o mesmo raciocínio de referência por id aplicado entre bancos em vez de
> entre agregados em memória. E a estrutura de tipos não exportados de `go-fintech/02` é onde a
> fábrica/construtor deste marco se apoia em Go.

## Principais aprendizados

- `Money` como *value object* imutável, em centavos inteiros, elimina uma classe inteira de bug de
  arredondamento e mutação indevida.
- Um agregado só é de verdade um agregado se nenhuma sequência de chamadas públicas conseguir
  violar sua invariante — testado por propriedade, não assumido.
- Agregados referenciam uns aos outros por identificador, nunca por objeto — evitando cascata de
  carregamento e transação que abrange dois agregados.
- O tamanho do agregado é uma troca entre proteção de invariante e contenção de concorrência; não
  existe tamanho certo universal.
- Um evento de domínio só é publicado depois que a invariante já vale — publicar antes arrisca
  anunciar um estado que nunca chegou a existir de fato.
