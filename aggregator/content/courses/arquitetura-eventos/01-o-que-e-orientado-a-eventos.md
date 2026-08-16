---
id: o-que-e-eda
title: "O que é ser orientado a eventos (e o que não é)"
summary: "Comando, evento e mensagem; os quatro estilos que quase sempre são confundidos com um pacote só; e os três acoplamentos — porque EDA remove dois e agrava o terceiro."
estimatedMinutes: 50
references:
  - title: "Martin Fowler — What do you mean by Event-Driven?"
    url: https://martinfowler.com/articles/201701-event-driven.html
  - title: "Microservices.io — Event-driven architecture"
    url: https://microservices.io/patterns/data/event-driven-architecture.html
  - title: "AWS Prescriptive Guidance — Integrating microservices"
    url: https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-integrating-microservices/welcome.html
---

## Comando, evento e mensagem

Três palavras que times usam como sinônimo, e que decidem coisas diferentes.

**Comando** é um pedido: tem destinatário conhecido, expressa intenção e **pode ser
recusado**. `IniciarPagamento` chega ao `pix-gateway`, que valida e responde "não" se o
saldo não der. Quem envia sabe para quem enviou e espera que alguém decida.

**Evento** é um fato consumado: aconteceu, está no passado e não se recusa um fato.
`PaymentAuthorized` não é um pedido para autorizar — é o registro de que o antifraude já
decidiu. Quem publica não sabe, e não precisa saber, o que acontece depois.

**Mensagem** é o envelope de transporte dos dois. É a camada de infraestrutura, e é onde
a trilha `kafka` vive. Aqui, ela quase não aparece.

A regra de nomenclatura — evento no particípio passado — não é estética. É o mecanismo
que impede o evento de virar RPC disfarçado. No dia em que alguém publica um
`DoPaymentCommand` num tópico, o produtor voltou a saber o que deve acontecer depois, e o
consumidor virou um servidor com um broker na frente: você pagou o preço da assincronia e
não comprou o desacoplamento. Se o nome do seu "evento" está no imperativo, ele é um
comando com fantasia.

Um teste simples: **você consegue ter zero consumidores?** Um evento com zero
consumidores continua correto — o fato aconteceu, ninguém se interessou. Um comando com
zero destinatários é um bug.

## Os quatro estilos, que não são um pacote

Fowler separa quatro coisas que quase todo mundo compra junto, e que são escolhas
independentes:

| Estilo | O que é | Preço |
| --- | --- | --- |
| **Event notification** | O evento avisa que algo aconteceu e carrega quase nada | O consumidor volta a chamar o produtor para saber o resto |
| **Event-carried state transfer** | O evento carrega o estado necessário para decidir | Duplicação de dado e PII espalhada por onde o evento passa |
| **Event sourcing** | A sequência de eventos **é** a verdade; o estado é derivado | O time fica casado com a decisão; consulta trivial vira projeto |
| **CQRS** | Modelos separados para escrever e para ler | Duas coisas para manter e uma janela de inconsistência |

Você pode fazer notification sem nada mais. Pode fazer CQRS sem event sourcing — e
provavelmente deveria. Pode fazer event sourcing dentro de um único serviço, sem broker
nenhum. Tratar os quatro como um combo é como se compra complexidade que ninguém pediu.

Na trilha `kafka`, o marco 07 citou os dois primeiros como formato de payload. Aqui eles
são decisão de arquitetura: **quanta autonomia você quer dar ao consumidor, e quanto está
disposto a duplicar para isso**. Os marcos 05, 06 e 07 tratam cada um em profundidade.

## Acoplamento, decomposto em três

"Desacoplar" é a palavra mais usada e menos definida em revisão de arquitetura. Ela quer
dizer pelo menos três coisas independentes:

- **Acoplamento temporal** — preciso que você esteja no ar **agora**? Se o `pix-gateway`
  chama o antifraude por HTTP no caminho da requisição, sim.
- **Acoplamento espacial** — preciso saber quem você é? Endereço, nome do serviço,
  contrato de chamada.
- **Acoplamento de dados** — preciso conhecer o seu formato? O schema do que você produz.

EDA remove os dois primeiros e **agrava o terceiro**. Quando você publica em
`payments.authorized` sem saber quem consome, ganhou independência de tempo e de
localização — e perdeu a capacidade de saber quem quebra se você renomear um campo. O
consumidor está lá, você só não sabe onde.

É por isso que o problema central desta trilha é **contrato de evento** (marco 05), e não
transporte. Numa chamada síncrona, a quebra é imediata e óbvia: alguém recebe 500 e o
alerta dispara. Num evento, a quebra aparece horas depois, longe da causa, em um consumidor
que você não sabia que existia — que é exatamente quando a correlação é mais difícil.

Um corolário desconfortável: "não sei quem consome" **não** significa "posso mudar à
vontade". Significa o oposto.

## Quando EDA é a resposta errada

Uma trilha que só vende o padrão forma arquiteto que distribui problema. Os casos em que
evento é a escolha errada:

**O chamador precisa da resposta para continuar.** Autorização de cartão: o cliente está
com a mão na maquininha, e alguém tem que dizer sim ou não em 300ms. Transformar isso em
evento cria request-reply sobre broker — a mesma latência (ou pior), com depuração muito
mais difícil e um estado de correlação que você agora tem que gerenciar. O marco 10 volta
a esse ponto com a tabela de decisão completa.

**A invariante é única e mora dentro de um agregado.** "O saldo não pode ficar negativo" se
resolve com uma transação, não com um evento. Espalhar isso entre serviços não distribui a
regra: distribui a chance de violá-la. O marco 02 dá o nome disso, e o 04 dá a teoria.

**Time de cinco pessoas com um produto.** O ganho de EDA é autonomia entre equipes que se
atrapalham. Sem equipes que se atrapalham, você comprou o custo operacional (broker, DLQ,
idempotência, correlação, plantão) e não comprou o benefício.

**"Queríamos desacoplar."** O caso mais comum e o mais caro. Sem uma pergunta concreta —
*desacoplar o quê de quê, e o que passa a ser possível depois?* — o resultado típico é
latência maior, depuração pior e nenhuma autonomia nova, porque os serviços continuam
tendo que ser implantados juntos. Esse resultado tem nome: **monolito distribuído**, o
antipadrão que fecha a trilha no marco 13.

## Exemplo numa fintech

O mesmo produto tem os dois regimes, e confundi-los é o erro caro.

**Autorização de cartão é síncrona por natureza.** O cliente está na maquininha, a rede da
bandeira tem timeout, e a resposta precisa sair em centenas de milissegundos. O emissor
decide, e o chamador precisa da decisão para continuar. Não há evento que conserte isso —
qualquer assincronia aqui vira request-reply com estado de correlação por cima.

**Liquidação é assíncrona por natureza.** O dinheiro se move em D+1, por janelas, com
arquivos e conciliação. Ninguém está esperando na tela. Aqui, evento é o modelo natural:
`settlement.requested` acontece, o processo caminha por horas, e o cliente é notificado
quando terminar.

O erro típico não é escolher errado uma vez — é **não perceber que são regimes diferentes**
e aplicar o mesmo estilo aos dois. Times que aplicam evento ao caminho síncrono descobrem
que fizeram uma chamada remota com passos extras. Times que aplicam síncrono ao caminho
assíncrono descobrem no primeiro pico: uma requisição HTTP segurando uma liquidação de
três minutos, com timeout de 30 segundos no meio.

A pergunta que separa os dois não é sobre tecnologia: **o chamador precisa da resposta
para continuar, ou só precisa que aconteça?**

## Hands-on

**Desafio — a espinha da trilha.** Classifique 10 interações do `fin-platform` em
*síncrona* ou *assíncrona (evento)*, com uma justificativa por **invariante ou requisito**,
nunca por preferência. Use estas, ou substitua pelas do seu sistema:

1. Cliente inicia pagamento no app → `pix-gateway`
2. `pix-gateway` → antifraude, para decidir aprovar
3. `pix-gateway` → `ledger-core`, para reservar saldo
4. Aprovação → notificação push ao cliente
5. Aprovação → atualização do extrato
6. Aprovação → envio ao PSP para liquidar
7. PSP confirma liquidação → `fin-flow`
8. Liquidação → conciliação contábil noturna
9. Estorno solicitado pelo cliente → `fin-flow`
10. Todo pagamento → data lake analítico

Produza `SINCRONO-OU-EVENTO.md` no repo do `fin-flow` com uma tabela: interação,
mecanismo, **invariante ou requisito que justifica**, e o custo de errar a escolha.

**Invariantes testáveis**

1. Toda linha tem uma justificativa que cita um requisito verificável (prazo, invariante
   de negócio, dependência de resposta) — nunca "é mais desacoplado".
2. Nenhuma interação marcada como assíncrona tem o chamador esperando a resposta para
   continuar. Se tem, ou a classificação está errada, ou o fluxo precisa mudar.
3. Toda interação síncrona tem um prazo declarado, e o comportamento definido para quando
   ele estourar.

**Complemento.** Para cada linha marcada como assíncrona, escreva a **janela** aceitável
("o extrato reflete em até 5s"). Você vai precisar desses números no marco 04, e vai
descobrir que alguns deles ninguém no time sabe responder — o que já é um resultado.

**Checagem**

1. Qual é o teste que distingue um evento de um comando disfarçado?
2. Quais dos três acoplamentos o EDA remove, e qual ele agrava — e por quê?
3. Por que CQRS e event sourcing são escolhas independentes?
4. Dê um caso do seu sistema em que transformar uma chamada síncrona em evento pioraria
   tudo, e diga qual requisito torna isso verdade.

## Principais aprendizados

- Comando tem destinatário e pode ser recusado; evento é fato consumado e não tem dono do
  que acontece depois. Nome no imperativo denuncia RPC disfarçado de evento.
- Os quatro estilos — notification, state transfer, event sourcing e CQRS — são escolhas
  independentes, e comprá-los como pacote é comprar complexidade que ninguém pediu.
- EDA remove acoplamento temporal e espacial e **agrava** o de dados: por isso contrato de
  evento, não transporte, é o problema central desta trilha.
- Fluxo que precisa de resposta, invariante única dentro de um agregado e time pequeno com
  um produto são casos em que evento é a resposta errada.
- Numa fintech, autorização é síncrona por natureza e liquidação é assíncrona por natureza:
  o erro caro é não perceber que são regimes diferentes.
