---
id: transferencia-sem-deadlock
titulo: "Transferências concorrentes sem deadlock"
tipo: lld
nivel: senior
duracaoMin: 45
prerequisitos:
  - concorrencia-e-recursos/03
  - concorrencia-e-recursos/04
  - ledger-e-contabilidade/01
conceitos: []
parametros: {}
decisoes:
  - pergunta: "Duas threads fazem, ao mesmo tempo, A → B e B → A, cada uma travando primeiro a origem e depois o destino. O que pode acontecer?"
    opcoes:
      - "Nada de errado: o Java detecta o conflito e serializa as duas transferências"
      - "Deadlock: cada thread segura uma trava e espera a outra, para sempre"
      - "Uma das duas lança ConcurrentModificationException e é repetida"
      - "As duas terminam, mas uma delas pode deixar o saldo da origem negativo"
    correta: 1
    explicacao: "É o ciclo de espera: a primeira segura A e espera B, a segunda segura B e espera A. Nenhuma solta, e o synchronized ou o lock() comum não têm prazo. A JVM não detecta nem resolve deadlock sozinha (o jstack só o aponta), e ConcurrentModificationException é de iterador de coleção."
  - pergunta: "Qual estratégia elimina o deadlock sem serializar todas as transferências do banco?"
    opcoes:
      - "Uma trava global única, adquirida no começo de toda transferência"
      - "Adquirir as duas travas sempre na mesma ordem global, pelo id da conta"
      - "Travar só a conta de origem, porque é ela que pode ficar sem saldo"
      - "Usar volatile nos saldos, para que todas as threads vejam sempre o valor mais atual"
    correta: 1
    explicacao: "Com uma ordem global, A → B e B → A pedem as travas na mesma sequência, e o ciclo de espera não se forma; transferências entre contas diferentes continuam em paralelo. A trava global também evita o deadlock, mas serializa o banco inteiro. Travar só a origem deixa o crédito do destino correr com outra transferência; volatile dá visibilidade, não atomicidade."
  - pergunta: "Como o teste prova que a implementação não trava, sem pendurar a suíte quando ela trava?"
    opcoes:
      - "Rodando as transferências na thread do teste e esperando que ele termine"
      - "Com threads daemon e um Future.get com prazo, que reprova o teste no estouro"
      - "Com Thread.sleep de 30 segundos depois de disparar as threads de transferência"
      - "Contando as transferências feitas e comparando com o total esperado no fim"
    correta: 1
    explicacao: "O Future.get com prazo transforma o deadlock numa falha com mensagem, e as threads daemon deixam a JVM encerrar mesmo com threads presas. Esperar sem prazo pendura a suíte e o CI; o sleep só atrasa e não detecta nada; contar transferências no fim nunca chega ao fim se houver deadlock."
entregavel:
  secoesObrigatorias: [Decisoes, Testes]
rubrica:
  - "Todos os testes passam, inclusive as 3 repetições dos testes concorrentes"
  - "A soma de todos os saldos é a mesma antes e depois de qualquer combinação de transferências"
  - "Nenhum saldo fica negativo, e uma transferência recusada não muda nada"
  - "As travas são adquiridas numa ordem global, e transferências entre contas diferentes correm em paralelo"
  - "Explicou como o mesmo problema aparece no banco de dados (FOR UPDATE na ordem do pedido) e como evitá-lo lá"
---
## Enunciado

Implemente um banco em memória com contas e transferências entre elas, seguro para uso concorrente.
`transferir(origem, destino, centavos)` move o valor de forma atômica e devolve `false`, sem mudar
nada, se a origem não tiver saldo. Nenhuma combinação de transferências simultâneas pode travar, o
total de dinheiro nunca muda, e nenhum saldo fica negativo.

O esqueleto e os testes estão em `aggregator/content/desafios/transferencia-sem-deadlock/java/`. Os
testes falham até a implementação estar certa.

- Java: `cd java && mvn -q test`

## Dicas

- Faça primeiro a versão sem concorrência e os testes de entrada inválida.
- Escreva a versão que trava cada conta na ordem do pedido e rode o teste de transferências opostas:
  ver o *deadlock* acontecer é o melhor jeito de entender a correção.
- `concorrencia-e-recursos/04` tem as quatro condições do *deadlock*; `concorrencia-e-recursos/03`, as
  travas; `ledger-e-contabilidade/01`, por que a soma tem de fechar.

## Gabarito comentado

Cada conta tem a sua trava (um `ReentrantLock`, ou o próprio objeto da conta). A transferência ordena
as duas contas pelo id e adquire as travas nessa ordem: a de menor id primeiro. Com isso, A → B e
B → A pedem as travas na mesma sequência, e a condição de espera circular, uma das quatro do
*deadlock*, não pode se formar. Dentro das duas travas: conferir o saldo, debitar, creditar. O
`total()` trava todas as contas na mesma ordem global para ler um valor consistente.

Os erros mais comuns:
- travar na ordem do pedido, que trava no primeiro par de transferências opostas: a versão ingênua
  foi reprovada por *deadlock* em todas as repetições, no prazo de 15 s;
- usar uma trava global, que é correta mas serializa o banco inteiro;
- travar só a origem e creditar o destino fora da trava;
- conferir o saldo fora da trava, o que deixa duas transferências simultâneas gastarem o mesmo saldo.

Uma alternativa à ordem global é o `tryLock` com prazo e nova tentativa, que evita o *deadlock* ao
custo de possível *livelock* e de mais código. No banco de dados, o mesmo problema aparece com
`SELECT ... FOR UPDATE` nas duas contas na ordem do pedido, e a correção é a mesma: travar as linhas em
ordem de id (`go-fintech/09`).
