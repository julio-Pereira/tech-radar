---
id: sincrono-rest-grpc
title: "O síncrono ainda existe: REST, gRPC e o critério"
summary: "O contrapeso da trilha: a pergunta que decide o mecanismo, gRPC por dentro com deadline propagado, e a tabela REST × gRPC × GraphQL × evento por caso de uso."
estimatedMinutes: 55
references:
  - title: "gRPC — Core concepts, architecture and lifecycle"
    url: https://grpc.io/docs/what-is-grpc/core-concepts/
  - title: "Protocol Buffers — Proto Best Practices"
    url: https://protobuf.dev/best-practices/dos-donts/
  - title: "gRPC — Deadlines"
    url: https://grpc.io/docs/guides/deadlines/
---

## A pergunta que decide

Sem este marco, o aluno sai da trilha achando que tudo vira evento. Não vira, e a pergunta
que separa é uma só:

> **O chamador precisa da resposta para continuar?**

Se sim, é síncrono. Transformar isso em evento produz **request-reply sobre broker**: você
publica um pedido, cria um tópico de resposta, correlaciona por id, gerencia timeout à mão e
depura em dois lugares. O resultado é a mesma latência ou pior, com muito mais peças — e um
acoplamento temporal que continua existindo, agora escondido.

O contrapositivo também vale: se o chamador **não** precisa da resposta e você fez uma
chamada síncrona, você criou acoplamento temporal de graça. Uma requisição HTTP segurando
uma liquidação de três minutos, com timeout de 30 segundos no meio, é o resultado típico.

Um sinal de alerta em revisão de arquitetura: quando alguém descreve um "evento" e no
parágrafo seguinte fala em "aguardar a resposta do evento", o mecanismo está errado.

## gRPC por dentro

**HTTP/2 + protobuf.** Multiplexação de várias chamadas na mesma conexão, cabeçalhos
comprimidos, payload binário. Na prática: menos bytes e menos conexões que JSON sobre
HTTP/1.1 — relevante no caminho quente, irrelevante na borda com dez requisições por minuto.

**Quatro modos:** unary (o comum), server streaming, client streaming e bidirecional. Os
três últimos resolvem casos específicos — enviar um lote grande, receber uma cotação
contínua — e não são o caso comum.

**Deadline propagado** é o recurso que mais importa aqui e o que o REST não dá de graça. O
cliente diz "tenho 300ms"; o servidor **sabe** disso, e quando ele chama outro serviço, o
prazo restante viaja junto. Um serviço que já estourou o prazo pode desistir em vez de fazer
trabalho que ninguém vai usar. Em REST, cada salto tem seu timeout local, ninguém sabe
quanto sobrou, e o resultado é o cliente desistir enquanto o backend continua trabalhando —
que, num pagamento, é o pior desfecho possível (`kubernetes/04` mostra o mesmo problema na
borda).

**Interceptors** para autenticação, logging e propagação de contexto — inclusive o
`traceparent` do OTel (`observabilidade/05`). **Status codes** próprios, com `DEADLINE_EXCEEDED`
e `UNAVAILABLE` separados, o que torna a decisão de retentar bem mais honesta que um 500
genérico.

**Client-side load balancing** é a pegadinha operacional. O gRPC mantém conexões longas e
balanceia entre elas do lado do cliente. Atrás de um Service L4 do Kubernetes, a conexão é
estabelecida uma vez e **fica grudada num pod**: você escala para dez réplicas e o tráfego
continua indo para uma. As saídas são headless service com resolução por DNS, um proxy que
entenda HTTP/2, ou service mesh (`kubernetes/04` e `kubernetes/11`).

## Contrato protobuf: o mesmo problema, outro nome

O paralelo com o marco 05 é direto, e vale a pena ver os dois lado a lado:

| Evento | Protobuf |
| --- | --- |
| campo novo opcional é barato | campo novo com número novo é barato |
| renomear é remover e adicionar | renomear o campo é livre; **mudar o número, nunca** |
| remover exige provar que ninguém lê | remover exige `reserved` no número e no nome |
| `version` no envelope | número de campo é o contrato |

**O número do campo é para sempre.** O nome é açúcar para humanos; o que trafega é o número.
Reaproveitar um número liberado faz um cliente antigo interpretar bytes novos como o campo
velho — sem erro, sem alerta, com dado errado. É por isso que `reserved 4, 7;` existe, e é
por isso que ele nunca sai do arquivo.

Mesma disciplina do contrato de evento: o formato é público e a compatibilidade é decisão de
acoplamento, não de ferramenta.

## Java × Go, no mesmo serviço

O antifraude do `fin-platform` existe nos dois lados, e a comparação é útil porque isola a
linguagem do padrão. Em Go (`go-fintech/05`) o serviço gRPC é a stdlib mais o código gerado,
o `context.Context` carrega o deadline por convenção da linguagem, e o binário sobe em
dezenas de milissegundos. Em Java com Spring, você ganha o ecossistema — interceptors de
segurança, integração com o resto do stack, mTLS pela mesma configuração de
`spring-boot/09` — e paga em tempo de inicialização e memória.

A escolha raramente é sobre desempenho bruto: é sobre onde o serviço vive no caminho quente,
quem opera, e o que o resto do sistema já fala. O que **não** muda entre os dois é a
disciplina: deadline propagado, contrato versionado por número de campo e status codes
distinguindo o que se retenta do que não se retenta.

## A tabela de decisão

| Caso | Mecanismo | Por quê |
| --- | --- | --- |
| Borda pública, parceiros, webhooks | **REST/JSON** | universal, cacheável, depurável com `curl` |
| Serviço a serviço no caminho quente | **gRPC** | deadline propagado, binário, contrato tipado |
| Agregação para mobile, muitas telas | **GraphQL** | uma requisição por tela, menos round-trips |
| Fato que outros querem saber | **evento** | desacopla tempo e espaço, N consumidores |
| Processo longo com passos | **evento + saga** | não há transação que segure (marco 09) |

Duas armadilhas ao usar a tabela. A primeira: um sistema usa **todos**, e a coerência não
vem de escolher um só, vem de o critério ser o mesmo em todos os casos. A segunda: GraphQL
na borda com resolvers que fazem N chamadas gRPC por trás é uma forma elegante de esconder
um problema de latência.

## Exemplo numa fintech

**Autorização de cartão via gRPC com deadline de 300ms.** O cliente está na maquininha; a
bandeira tem prazo e, se você estourar, a transação cai. O deadline entra na chamada, e cada
salto interno sabe quanto sobra. O serviço de risco que recebe a chamada com 40ms restantes
responde o fallback conservador em vez de consultar o bureau — decisão de negócio, tomada
com informação que só existe porque o prazo viajou.

**Liquidação via evento.** Ninguém está esperando; o processo leva horas.

E o antipadrão que aparece nas duas: **chamar quatro serviços em série** dentro de uma
requisição de 200ms. Cada um responde em 50ms na média — e o p99 do conjunto não é a soma
dos p99, é pior, porque basta um dos quatro estar na cauda. Disponibilidade também
multiplica: quatro serviços de 99,9% em série entregam ~99,6% ao fluxo
(`observabilidade/02`). As saídas são paralelizar o que é independente, mover o que não é
necessário para fora do caminho (evento) e, às vezes, aceitar que aquele dado pode ser lido
de uma projeção local (marco 06).

## Hands-on

**Desafio — escolher o mecanismo de cinco interações.** Para cada uma, escolha entre REST,
gRPC, GraphQL e evento, e escreva uma linha de justificativa baseada no critério, não em
preferência:

1. App do cliente consulta o extrato dos últimos 90 dias.
2. `pix-gateway` consulta o antifraude para autorizar um pagamento.
3. `pix-gateway` avisa o mundo que um pagamento foi autorizado.
4. Parceiro externo consulta o status de um pagamento.
5. `fin-flow` pede ao `ledger-core` para lançar a liquidação.

Depois, escolha **o único caso polêmico** da sua lista e escreva um parágrafo defendendo a
escolha contra a alternativa mais forte. O exercício não é acertar os cinco — é saber
defender o que não é óbvio.

**Invariantes testáveis**

1. Toda interação classificada como síncrona tem prazo declarado e comportamento definido
   para o estouro.
2. Nenhuma interação classificada como evento tem o chamador aguardando resposta.
3. Numa cadeia gRPC de dois saltos, o prazo restante chega ao segundo serviço — um teste com
   deadline curto prova que ele desiste em vez de trabalhar.
4. Nenhum número de campo do `.proto` foi reaproveitado; os removidos estão em `reserved`.

**Complemento.** Suba duas réplicas do serviço gRPC atrás de um Service comum do Kubernetes
e mande cem chamadas do mesmo cliente. Conte quantas chegaram em cada réplica. O resultado
(quase sempre 100/0) é a demonstração do problema de balanceamento — e vale mais que
qualquer parágrafo sobre o assunto.

**Checagem**

1. Qual é a pergunta que decide entre síncrono e evento, e o que acontece quando ela é
   ignorada nas duas direções?
2. O que o deadline propagado do gRPC dá que o timeout local do REST não dá?
3. Por que o número do campo no protobuf é para sempre, e o que `reserved` impede?
4. Por que quatro chamadas em série de 50ms não produzem um p99 de 200ms?

## Principais aprendizados

- A pergunta é uma só: o chamador precisa da resposta para continuar? Evento no lugar de
  síncrono vira request-reply sobre broker, com a mesma latência e pior depuração.
- gRPC entrega deadline propagado — cada salto sabe quanto sobra —, contrato tipado e
  binário no caminho quente; o preço é o balanceamento em L4 que gruda a conexão num pod.
- Número de campo do protobuf é contrato permanente: `reserved` existe para impedir que um
  número reaproveitado produza dado errado sem erro.
- Um sistema usa todos os mecanismos; a coerência vem de aplicar o mesmo critério, não de
  escolher um só.
- Quatro serviços em série multiplicam latência de cauda e indisponibilidade — o antipadrão
  não é o mecanismo, é a serialização.
