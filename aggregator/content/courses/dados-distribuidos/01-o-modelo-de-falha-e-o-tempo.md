---
id: falha-e-tempo
title: "O modelo de falha e o problema do tempo"
summary: "Por que timeout é palpite, por que relógio de parede não ordena dinheiro, e qual é a fonte de ordem de um ledger que precisa fechar."
estimatedMinutes: 55
references:
  - title: "Martin Kleppmann — Distributed Systems lecture notes"
    url: https://www.cl.cam.ac.uk/teaching/2122/ConcDisSys/dist-sys-notes.pdf
  - title: "Jepsen — Consistency Models"
    url: https://jepsen.io/consistency
  - title: "AWS Builders' Library — Timeouts, retries, and backoff with jitter"
    url: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
---

## As falácias, aplicadas a dados

A lista de Peter Deutsch tem trinta anos e continua sendo a causa raiz de incidentes de
banco de dados: a rede é confiável, a latência é zero, a topologia não muda, existe um
administrador só. Cada uma delas, aplicada a um `INSERT`, vira uma pergunta desconfortável.

A primeira delas é a que mais custa: **você nunca sabe se o commit aconteceu**. O cliente
enviou o `COMMIT`, a conexão caiu antes da resposta. O banco pode ter gravado. Pode não ter.
Repetir a operação pode duplicar o lançamento; não repetir pode perder o pagamento. Não
existe uma terceira opção que resolva isso do lado do cliente — a saída é a operação ser
idempotente, e é por isso que `Idempotency-Key` (`spring-boot/06`) não é um enfeite de API.

O vocabulário que organiza o resto são os **modelos de falha**:

- **Crash-stop** — o nó morre e não volta. É o modelo mais simples e o menos realista.
- **Crash-recovery** — o nó morre, volta, e tem memória parcial do que fez. É o modelo real
  de um banco de dados: existe WAL justamente para o "volta" ser correto.
- **Falha bizantina** — o nó responde, e responde **errado**. Dentro do seu datacenter, você
  normalmente pode ignorar; na fronteira com o PSP ou com a bandeira, não pode: um parceiro
  que reporta um pagamento que não aconteceu é exatamente isso. A defesa não é consenso
  bizantino, é conciliação (marco 08).

Numa fintech, os dois primeiros modelos governam a arquitetura interna, e o terceiro governa
o contrato com quem está do outro lado.

## Detecção de falha é palpite

Este é o teorema que nunca aparece em slide de arquitetura e explica metade dos incidentes:
**é impossível distinguir, por observação remota, um nó morto de um nó lento**. Um processo
pausado por GC de 12 segundos é indistinguível de um processo que morreu — e volta a
escrever no décimo terceiro segundo, achando que nada aconteceu.

Timeout, portanto, é palpite calibrado. Curto demais, você declara morto quem estava vivo.
Longo demais, você segura o sistema esperando um cadáver. E a consequência direta é a mais
cara de todas: **todo failover automático pode produzir split-brain**, com dois nós
convencidos de que são o leader e ambos aceitando escrita.

A correção não é um timeout melhor. É **fencing**: quem assume a liderança recebe um número
que só cresce, e o storage rejeita qualquer escrita que venha com um número menor. O nó
zumbi acorda, tenta escrever, e leva um erro — que é exatamente o que se quer. O mecanismo
volta em detalhe no marco 10, junto com locks distribuídos.

> **Reencontro — CAP e PACELC (`arquitetura-eventos/04`).** É esta impossibilidade que dá
> ao CAP o seu conteúdo: durante uma partição, você escolhe entre recusar a escrita e
> aceitar divergência. O PACELC lembra que, **fora** da partição, a escolha continua — entre
> latência e consistência. A trilha de eventos usou isso para decidir o que tolera atraso;
> aqui vamos ver como a replicação **produz** esse atraso.

## O tempo mente

Relógio de parede (`System.currentTimeMillis()`, `time.Now()`) é sincronizado por NTP, e NTP
corrige o relógio **saltando** — inclusive para trás. Um lançamento gravado às 10:00:03,100
pode ser seguido, no mesmo host, por outro gravado às 10:00:02,940. Some a isso o skew entre
hosts diferentes, que em máquina virtual em nuvem passa de dezenas de milissegundos com
facilidade, e você tem o cenário completo.

Consequência prática, escrita como regra: **nunca ordene dois fatos de negócio comparando
timestamps produzidos por hosts diferentes**. Não é uma questão de precisão do NTP — é uma
questão de o resultado ser silenciosamente errado, sem exceção, sem log, com o relatório
fechando com o valor errado.

As alternativas, em ordem de custo:

- **Relógio monotônico** para medir *duração* (`time.Since`, `System.nanoTime`). Ele não
  volta atrás, mas não tem significado entre hosts. Use para latência, nunca para ordenar.
- **Relógio lógico de Lamport** — um contador por nó, propagado nas mensagens. Garante que
  se A causou B, o contador de A é menor. A recíproca não vale: contador menor não prova
  causalidade.
- **Vector clock** — um contador por nó, todos carregados juntos. Detecta concorrência de
  verdade ("estes dois eventos não se conhecem"), e cresce com o número de nós.
- **TrueTime (Spanner)** — relógio atômico e GPS no datacenter, com incerteza *declarada*: a
  API devolve um intervalo, e o commit espera o intervalo passar. É hardware comprando
  ordem total, e é caro exatamente por isso.

**Ordem causal × ordem total.** Ordem causal preserva "o que aconteceu por causa de quê" e
deixa eventos concorrentes sem ordem definida — é o que o Lamport e o vector clock entregam,
e é o que basta para a maioria das invariantes. Ordem total define uma sequência única para
tudo, é o que o Spanner compra e o que uma partição do Kafka entrega dentro de si
(`kafka/06`). O erro caro é presumir ordem total onde só existe causal.

## A fonte de ordem de um ledger

Num ledger, ordem não é detalhe de implementação: ela **é** o produto. O extrato precisa ser
reproduzível, a auditoria precisa ser refazível, e o fechamento do dia precisa dar o mesmo
número quando recalculado em dezembro.

Por isso o ledger não usa timestamp como ordem. Ele usa um **número de sequência** atribuído
pelo dono do dado no momento do commit — e o timestamp vira o que ele realmente é: um
atributo descritivo, útil para relatório e inútil para ordenação.

A separação que resolve a confusão é ter **dois tempos explícitos**:

| Campo | Significado | Quem atribui |
| --- | --- | --- |
| `occurredAt` | quando o fato aconteceu no mundo | a origem (pode ser o PSP, pode mentir) |
| `recordedAt` / `seq` | quando o ledger tomou conhecimento | o `fin-store`, monotonicamente |

Contabilidade e regulação trabalham com o primeiro; consistência e replay trabalham com o
segundo. Misturar os dois num campo só é o bug de modelagem que aparece meses depois, no
primeiro estorno retroativo.

## Exemplo numa fintech

Um estorno chega do PSP com `occurredAt` **40 segundos anterior** ao débito que ele estorna —
porque o relógio do parceiro está adiantado, ou porque o nosso está atrasado, e ninguém sabe
qual dos dois. Se o extrato ordena por `occurredAt`, o cliente vê o dinheiro voltar antes de
sair, e o suporte abre um chamado de "saldo errado" que não tem defeito nenhum no saldo.

Ordenando por sequência do ledger, a história fica correta: débito, depois estorno, com
`occurredAt` exibido como informação. E o caso de o estorno chegar **depois do fechamento do
dia** deixa de ser um bug de ordenação para virar o que sempre foi — uma decisão contábil:
reabrir o dia ou lançar no dia seguinte com referência ao original. É pergunta para a
contabilidade, e ela só consegue respondê-la porque a ordem do sistema é inequívoca.

O terceiro caso, o mais silencioso: dois serviços gravando `createdAt` com o próprio relógio
e uma query de conciliação usando `BETWEEN`. Com 200ms de skew, alguns lançamentos caem fora
da janela — a conciliação acusa divergência que não existe, e o time passa a ignorar o
alerta. O dia em que a divergência for real, ninguém vai olhar.

## Hands-on

**Desafio — ordenar cinco eventos que discordam.** Cinco eventos chegaram de três hosts, com
os timestamps que cada host registrou:

| Evento | Host | `occurredAt` | Chegou ao ledger |
| --- | --- | --- | --- |
| `payment.authorized` | gateway-a | 10:00:03,100 | 1º |
| `ledger.debited` | ledger-1 | 10:00:03,050 | 2º |
| `payment.refunded` | psp-externo | 10:00:02,900 | 3º |
| `ledger.credited` | ledger-2 | 10:00:03,400 | 4º |
| `statement.projected` | proj-1 | 10:00:03,010 | 5º |

Produza `ORDEM.md` no repo do `fin-store` respondendo:

1. Quais ordenações são **defensáveis** e qual invariante cada uma quebra ou preserva.
2. Quais pares desses eventos têm relação causal comprovável, e como você a comprovaria com
   o dado disponível.
3. Qual é a fonte de ordem que o `fin-store` vai adotar, e o que acontece com `occurredAt`
   depois dessa decisão.

**Invariantes testáveis**

1. Nenhuma ordenação adotada pelo sistema depende de comparar relógios de dois hosts
   diferentes.
2. Todo evento persistido tem os dois tempos separados e nomeados de forma distinguível.
3. Um evento com `occurredAt` no passado, chegando depois do fechamento, tem destino
   definido por escrito — não por acaso do código.
4. A ordem do extrato de uma conta é reproduzível: recalculá-la amanhã dá exatamente a mesma
   sequência.

**Complemento.** Meça o skew real da sua máquina: `chronyc tracking` ou
`ntpq -p` mostram o offset atual. Depois rode dois contêineres e compare
`date +%s%N` nos dois, cem vezes. O número que você obtiver é o erro que existiria no seu
`BETWEEN` — e ele costuma surpreender quem nunca olhou.

**Checagem**

1. Por que timeout não consegue distinguir um nó morto de um nó lento, e o que o fencing
   resolve que um timeout melhor não resolve?
2. Qual a diferença prática entre relógio monotônico, Lamport e vector clock — e para que
   serve cada um?
3. Por que um ledger ordena por sequência e não por timestamp, e o que sobra para o
   `occurredAt` fazer?
4. Onde a falha bizantina realmente aparece numa fintech, e qual é a defesa?

## Principais aprendizados

- Você nunca sabe se o commit aconteceu quando a conexão cai: a saída é idempotência, não um
  retry mais esperto.
- Detecção de falha é palpite — todo failover automático pode gerar split-brain, e a correção
  é fencing, não um timeout melhor calibrado.
- Relógio de parede salta e diverge entre hosts: ordenar fatos de negócio por timestamp de
  hosts diferentes produz erro silencioso, não impreciso.
- Ordem causal (Lamport, vector clock) basta para quase tudo; ordem total custa hardware
  (TrueTime) ou uma partição única (`kafka/06`).
- O ledger separa `occurredAt` (o mundo, pode mentir) de `seq` (o dono do dado, monotônico) —
  e ordena pelo segundo.
