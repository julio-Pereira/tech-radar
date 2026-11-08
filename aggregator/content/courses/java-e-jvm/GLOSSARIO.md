Um verbete por termo: definição em uma frase, o exemplo no `pix-core`, o erro comum associado e o
marco onde o conceito aparece na prática. O glossário completo chega com o Bloco C.

## A linguagem

### Preview
**Em uma frase:** um recurso completo da linguagem ou da API, entregue desligado e sujeito a mudar, que só compila com `--enable-preview`.
**No pix-core:** padrões de tipo primitivo ainda são *preview* no Java 25, então o domínio não os usa.
**Erro comum:** ligar `--enable-preview` em produção e ficar preso à versão exata do JDK.
**Onde na prática:** marco 01.

### Contrato de equals
**Em uma frase:** `equals` precisa ser reflexivo, simétrico, transitivo e consistente, e objetos iguais precisam ter o mesmo `hashCode`.
**No pix-core:** a `PaymentKey` do cache de idempotência é um record, com igualdade por componente.
**Erro comum:** sobrescrever `equals` sem `hashCode`, e o `HashMap` deixar de achar a chave.
**Onde na prática:** marco 02.

### Erasure
**Em uma frase:** o compilador apaga os argumentos de tipo dos generics, que não existem em tempo de execução.
**No pix-core:** o repositório genérico de agregados não pode fazer `new T()`.
**Erro comum:** tentar `instanceof List<String>`, que não compila.
**Onde na prática:** marco 04.

### Hipótese geracional
**Em uma frase:** a maioria dos objetos morre jovem, e por isso o GC separa as gerações e coleta a jovem com mais frequência.
**No pix-core:** os objetos de uma validação de pagamento morrem antes da próxima coleta jovem.
**Erro comum:** um cache sem limite que promove tudo para a geração velha.
**Onde na prática:** marco 08.
