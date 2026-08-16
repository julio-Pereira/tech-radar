---
id: consistencia-eventual
title: "Consistência eventual: a teoria que sustenta tudo"
summary: "O marco denso da trilha: CAP sem folclore, PACELC, os modelos de consistência em ordem de força, e a janela de inconsistência como requisito com número, dono e frase para o cliente."
estimatedMinutes: 60
references:
  - title: "Daniel Abadi — Consistency Tradeoffs in Modern Distributed Database Design (PACELC)"
    url: https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf
  - title: "Martin Kleppmann — Please stop calling databases CP or AP"
    url: https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html
  - title: "Jepsen — Consistency models"
    url: https://jepsen.io/consistency
  - title: "Werner Vogels — Eventually Consistent"
    url: https://www.allthingsdistributed.com/2008/12/eventually_consistent.html
---

## CAP sem folclore

O teorema diz uma coisa estreita: **durante uma partição de rede**, um sistema distribuído
escolhe entre responder (disponibilidade) e responder certo (consistência). Só isso.

O folclore transformou isso em "escolha dois dos três", como se P fosse opcional. Não é:
partição acontece com você, você não a escolhe. E o teorema **não diz nada** sobre o dia em
que a rede está boa — que é 99,9% dos dias.

Duas frases que denunciam o folclore em uma reunião:

- **"Somos AP."** Dito sobre um sistema que roda numa única zona de disponibilidade, com
  um banco só, é frase de slide: sem partição possível entre réplicas, o teorema não está
  nem em jogo.
- **"Escolhemos consistência."** Escolheu para qual operação? Ler saldo e escrever
  lançamento têm requisitos diferentes, e a escolha é por operação, não por sistema.

**PACELC** é a versão honesta: *na Partição, escolha entre A e C; **senão** (Else), escolha
entre L (latência) e C.* O segundo termo é o que você paga todo dia. Ler o saldo da réplica
é rápido e pode estar atrasado; ler do primário é correto e mais caro. Nenhuma partição
envolvida — só a física.

Essa é a discussão que importa numa fintech, e é a que quase nunca acontece.

## Os modelos, em ordem de força

Do mais forte (e mais caro) ao mais fraco (e mais barato):

| Modelo | Garantia | Custo | No `fin-platform` |
| --- | --- | --- | --- |
| **Linearizável** | toda leitura vê a escrita mais recente, como se houvesse uma cópia só | coordenação a cada operação; latência e disponibilidade | checagem de saldo na hora do débito |
| **Sequencial** | todos veem as operações na mesma ordem, não necessariamente em tempo real | coordenação, sem sincronia de relógio | fila de processamento de uma conta |
| **Causal** | o que se causa é visto na ordem; o independente, em qualquer ordem | rastrear dependências | estorno depois do débito que ele estorna |
| **Eventual** | sem novas escritas, todos convergem em algum momento | quase nada | extrato, posição consolidada, data lake |

A pergunta prática não é "qual modelo o nosso sistema tem", é **"qual modelo cada operação
precisa"**. A resposta quase sempre é: uma operação precisa do mais forte, e vinte precisam
do mais fraco. O erro caro é aplicar o requisito da primeira às vinte.

## Consistência causal: o que quase toda fintech precisa

Se o estorno referencia o débito, a ordem entre eles importa: processar o estorno antes do
débito produz saldo errado ou rejeição indevida. Se o pagamento é de **outra conta**, a
ordem relativa não importa em nada — são fatos independentes.

Isso é consistência causal: preservar ordem onde há relação de causa, e não pagar por ordem
onde não há. É exatamente o que se ganha com chave de partição por conta — a ordem existe
dentro da conta e não existe entre contas (a mecânica está em `kafka/06`).

O erro estrutural correspondente é exigir **ordem global** para conseguir ordem causal. Ordem
global custa uma partição e um consumidor, sem escala e sem paralelismo — e entrega uma
garantia que ninguém pediu. Quando alguém disser "os eventos precisam ser processados na
ordem", a pergunta é sempre: **ordem entre o quê e o quê?**

Guardar o `causationId` no evento (marco 05) é o que torna essa ordem verificável depois: dá
para reconstruir a árvore causal e provar que o estorno veio do débito certo.

## A janela de inconsistência é um requisito

Este é o ponto central do marco, e o que separa uma arquitetura profissional de uma
desculpa: **"eventualmente" não é um prazo.**

Uma janela de inconsistência declarada tem quatro coisas:

1. **Um número.** "O extrato reflete o pagamento em até 5 segundos, p99." Não "rapidinho".
2. **Um dono.** Alguém responde quando estoura.
3. **Monitoramento.** O lag da projeção é uma métrica de produto, com alerta — não um
   detalhe de infraestrutura (o painel é assunto do marco 11).
4. **Uma frase escrita**, para o cliente e para o regulador. "Seu pagamento foi concluído; o
   extrato pode levar alguns segundos para atualizar" é design de produto, não é gambiarra.

Sem esses quatro itens, você não tem consistência eventual: tem inconsistência sem prazo, e
uma reclamação futura sem resposta.

**Read-your-own-writes** é o caso especial que o cliente percebe primeiro: ele acabou de
pagar e abre o extrato. Se a projeção está 3 segundos atrás, ele vê a tela sem o pagamento
que acabou de fazer e conclui, corretamente do ponto de vista dele, que algo deu errado. Os
truques honestos:

- **Ler do modelo de escrita** logo após o comando, apenas nessa tela e apenas por alguns
  segundos.
- **Devolver a versão esperada** no comando e fazer a leitura esperar por ela (ou avisar).
- **Sticky routing** da sessão para a réplica que já recebeu a escrita.

Todos custam alguma coisa; nenhum é vergonhoso. O que é vergonhoso é o cliente descobrir a
janela sozinho.

## O que não tolera atraso

Nem tudo é negociável. "O saldo disponível não pode ficar negativo" é uma invariante que
vive **dentro de um agregado, com transação** — e nenhum evento, nenhuma projeção e nenhuma
saga conserta essa escolha (é a régua do marco 02: dentro é agora, fora é depois).

O teste é o custo de violar por um instante:

- Extrato 5 segundos atrasado: cliente estranha, suporte explica, ninguém perde dinheiro.
- Saldo 5 segundos atrasado no caminho do débito: dois débitos concorrentes passam, a conta
  fica negativa, e alguém perde dinheiro de verdade.

Quando um time propõe resolver a segunda com evento, a resposta não é "isso é complexo
demais": é **"qual é o custo de a invariante ser falsa por 5 segundos?"**. Se o custo for
dinheiro ou multa, a invariante é transacional, e a discussão acabou.

## Exemplo numa fintech

"Meu extrato não atualizou" é a reclamação nº 1 de sistema com CQRS mal comunicado. Não é
um bug de projeção — é uma janela que existia por projeto e nunca foi contada a ninguém.

E há um caso em que o negócio já resolveu isso sozinho, muito antes da engenharia: a
diferença entre **saldo disponível** e **saldo contábil**. O disponível desconta o que está
reservado e ainda não liquidou; o contábil reflete o que já foi lançado. Todo cliente de
banco entende essa diferença porque ela é exibida, nomeada e explicada.

Isso é uma janela de inconsistência com número, dono, monitoramento e frase para o cliente
— só que batizada em português de negócio, e não em jargão de sistemas distribuídos. É o
melhor modelo que existe para o que este marco pede: não esconda a janela, **nomeie**.

## Hands-on

**Desafio — classificar as invariantes do `fin-platform`.** Liste 5 invariantes do seu
sistema e classifique cada uma como *transacional* ou *eventual com janela de X*. Para as
eventuais, declare a janela e o que acontece quando ela estoura. Sugestões, se quiser
começar das mesmas:

1. O saldo disponível não fica negativo.
2. O extrato mostra o pagamento que o cliente acabou de fazer.
3. Todo pagamento autorizado tem decisão de risco registrada.
4. A posição consolidada bate com a soma das contas.
5. O relatório regulatório do dia contém todos os pagamentos do dia.

Produza `CONSISTENCIA.md` no repo do `fin-flow`, com uma tabela: invariante · modelo
exigido · janela (se eventual) · dono · como é monitorada · **custo de violar por 1 minuto**
· frase para o cliente.

**Invariantes testáveis**

1. Toda invariante marcada como eventual tem um número de janela e um mecanismo de medição
   nomeado. "Rapidamente" reprova.
2. Toda invariante marcada como transacional cabe dentro de **um** agregado. Se atravessa
   dois, ou a fronteira do marco 02 está errada, ou existe uma saga escondida.
3. Toda janela tem uma frase escrita em linguagem de cliente — sem as palavras
   "eventual", "assíncrono" ou "projeção".
4. Para cada invariante, o custo de violar por 1 minuto está escrito em dinheiro, em risco
   regulatório ou em confiança — nunca em "seria ruim".

**Complemento.** Pegue a invariante nº 5 (relatório regulatório) e discuta: ela é
transacional ou eventual? A resposta honesta é "eventual, com janela até o horário do
envio" — e isso muda tudo sobre como você a monitora. Escreva o alerta que você criaria.

**Checagem**

1. O que o teorema CAP diz, e o que ele explicitamente **não** diz sobre o dia normal?
2. Por que consistência causal basta em quase toda fintech, e o que custa exigir ordem
   global no lugar dela?
3. Quais são os quatro itens de uma janela de inconsistência declarada?
4. Qual é a pergunta que decide se uma invariante é transacional — e por que ela é sobre
   custo, e não sobre tecnologia?

## Principais aprendizados

- CAP só vale durante a partição; o trade-off que você paga todo dia é o "else" do PACELC:
  latência contra consistência.
- A pergunta não é qual modelo o sistema tem, é qual modelo **cada operação** precisa — uma
  precisa do mais forte, vinte precisam do mais fraco.
- Consistência causal preserva a ordem onde existe causa e não cobra por ela onde não
  existe; exigir ordem global para conseguir isso mata o paralelismo.
- Janela de inconsistência é requisito: número, dono, monitoramento e frase escrita para o
  cliente. Sem os quatro, é inconsistência sem prazo.
- Invariante cujo custo de violar é dinheiro ou multa mora dentro de um agregado, com
  transação — e nenhum evento conserta essa escolha.
- Saldo disponível × saldo contábil é uma janela de inconsistência que o negócio já
  nomeou: o caminho não é esconder a janela, é batizá-la.
