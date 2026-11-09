Um verbete por termo: definição em uma frase, o exemplo no `pix-status`, o erro comum associado e o
marco onde o conceito aparece na prática. O glossário completo chega com o Bloco C.

## A linguagem

### Tipo de plataforma
**Em uma frase:** o tipo que o Kotlin dá a um valor vindo de Java sem anotação de nulidade (escrito `String!`), que o compilador deixa usar como anulável ou não.
**No pix-status:** o retorno de uma biblioteca Java de assinatura de *webhook* entra como tipo de plataforma.
**Erro comum:** atribuir o tipo de plataforma a um tipo não-nulo e receber a NPE longe da chamada.
**Onde na prática:** marco 02.

### `sealed`
**Em uma frase:** uma classe ou interface cujas subclasses diretas são todas conhecidas pelo compilador, o que torna o `when` exaustivo.
**No pix-status:** o estado do pagamento é uma `sealed interface`.
**Erro comum:** colocar um ramo `else` no `when` e perder o erro de compilação quando um estado novo entra.
**Onde na prática:** marco 03.

## Coroutines

### `suspend`
**Em uma frase:** marca uma função que pode suspender sem bloquear a *thread*; o compilador a reescreve com uma *continuation*.
**No pix-status:** a entrega de um *webhook* é uma função `suspend`.
**Erro comum:** chamar um cliente HTTP bloqueante dentro da função `suspend` e prender a *thread* do *dispatcher*.
**Onde na prática:** marco 05.

### `CancellationException`
**Em uma frase:** a exceção que sinaliza o cancelamento de uma coroutine, e que precisa ser propagada.
**No pix-status:** o cliente desiste da consulta de status, e as buscas filhas recebem o cancelamento.
**Erro comum:** um `catch (e: Exception)` que engole o cancelamento e transforma a desistência em sucesso.
**Onde na prática:** marco 06.
