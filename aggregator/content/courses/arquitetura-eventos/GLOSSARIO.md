Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira —
o Bloco A cria o vocabulário, e os blocos seguintes o reencontram.

## Vocabulário básico

### Evento
**Em uma frase:** um fato consumado, nomeado no passado, que já aconteceu e não pode ser recusado.
**No fin-platform:** `PaymentAuthorized` — o antifraude já decidiu; quem lê não pode desfazer isso.
**Erro comum:** nomear no imperativo (`AuthorizePayment`), o que transforma o evento em RPC disfarçado com um broker no meio.
**Onde na prática:** marco 01.

### Comando
**Em uma frase:** um pedido com destinatário conhecido, que pode ser recusado.
**No fin-platform:** `IniciarPagamento` chega ao `pix-gateway`, que valida e pode responder "não".
**Erro comum:** publicar comando em tópico. Comando tem dono; evento não — misturar os dois é como o acoplamento volta pela porta dos fundos.
**Onde na prática:** marco 01.

### Evento de domínio
**Em uma frase:** fato interno de um contexto, que pode mudar toda semana porque só o dono o lê.
**No fin-platform:** `SaldoReservado`, dentro do `ledger-core`.
**Erro comum:** publicá-lo cru para o mundo — o modelo interno vira contrato público sem ninguém decidir isso.
**Onde na prática:** marco 02, retomado no 05.

### Evento de integração
**Em uma frase:** fato publicado para fora do contexto, com contrato, versão e dono declarados.
**No fin-platform:** `payments.authorized`, consumido por quatro squads e por um parceiro externo.
**Erro comum:** tratar como evento de domínio e renomear um campo "porque é só um ajuste".
**Onde na prática:** marco 02, retomado no 05.

### Event notification
**Em uma frase:** o evento avisa que algo aconteceu e carrega quase nada; quem quiser detalhe, busca.
**No fin-platform:** `payments.authorized` com apenas `paymentId` e `accountId`.
**Erro comum:** esquecer que isso devolve o acoplamento de disponibilidade — o consumidor volta a depender do produtor estar no ar.
**Onde na prática:** marco 01, decidido no 05.

### Event-carried state transfer
**Em uma frase:** o evento carrega o estado necessário para o consumidor decidir sozinho.
**No fin-platform:** `payments.authorized` com valor, moeda, conta e resultado do risco.
**Erro comum:** engordar o evento com o objeto de domínio inteiro, espalhando PII por todo lugar por onde ele passa.
**Onde na prática:** marco 01, decidido no 05.

### Acoplamento temporal
**Em uma frase:** você precisa que o outro esteja no ar **agora** para funcionar.
**No fin-platform:** o `pix-gateway` chamando o antifraude por HTTP no caminho da requisição.
**Erro comum:** achar que fila resolve tudo — se você precisa da resposta para continuar, o acoplamento temporal continua lá, com mais latência.
**Onde na prática:** marco 01, retomado no 10.

### Acoplamento espacial
**Em uma frase:** você precisa saber quem é o outro — endereço, nome do serviço, contrato de chamada.
**No fin-platform:** publicar em `payments.authorized` sem saber quem consome.
**Erro comum:** confundir "não sei quem consome" com "posso mudar à vontade" — é justamente o contrário.
**Onde na prática:** marco 01.

### Acoplamento de dados
**Em uma frase:** você conhece o formato do que o outro produz, e depende dele.
**No fin-platform:** todo consumidor de `payments.authorized` depende do schema do evento.
**Erro comum:** ignorar que EDA remove os dois primeiros acoplamentos e **agrava** este — por isso contrato de evento é o problema central da trilha.
**Onde na prática:** marco 01, resolvido no 05.

## Domínio e fronteiras

### Bounded context
**Em uma frase:** a fronteira dentro da qual uma palavra tem um significado único.
**No fin-platform:** "pagamento" no antifraude (um caso de risco) não é "pagamento" no ledger (um par de lançamentos).
**Erro comum:** perseguir um modelo canônico único para a empresa inteira — é assim que a maioria dos projetos de integração morre.
**Onde na prática:** marco 02.

### Agregado
**Em uma frase:** a fronteira de consistência transacional — o que está dentro é consistente agora, o que está fora é consistente depois.
**No fin-platform:** a conta e seus lançamentos: o saldo não pode ficar negativo, e isso se resolve numa transação.
**Erro comum:** agregado grande demais ("o cliente inteiro"), que transforma qualquer operação em contenção de escrita.
**Onde na prática:** marco 02, retomado no 04, 07 e 08.

### Invariante
**Em uma frase:** a regra que precisa ser verdadeira o tempo todo, e que decide onde a fronteira do agregado passa.
**No fin-platform:** "a soma dos lançamentos de uma transação é zero" e "o saldo disponível não fica negativo".
**Erro comum:** listar invariantes depois de desenhar os serviços — a ordem certa é o contrário.
**Onde na prática:** marco 02, classificadas no 04.

### Entidade
**Em uma frase:** objeto com identidade que persiste através das mudanças de estado.
**No fin-platform:** a conta `acc-123` continua a mesma conta depois de mil lançamentos.
**Erro comum:** dar identidade a tudo, inclusive ao que só interessa pelo valor.
**Onde na prática:** marco 02.

### Value object
**Em uma frase:** objeto definido pelo valor, imutável e sem identidade própria.
**No fin-platform:** `Money` com quantia inteira na menor unidade, moeda e escala explícitas.
**Erro comum:** representar dinheiro com ponto flutuante — o erro acumulado quebra a conciliação (é a mesma lição de `go-fintech/02` e `spring-boot/05`).
**Onde na prática:** marco 02.

### Anticorruption layer (ACL)
**Em uma frase:** a camada de tradução que impede o modelo do outro de vazar para dentro do seu.
**No fin-platform:** o adaptador que converte o payload do PSP no vocabulário do `fin-flow`.
**Erro comum:** economizar a tradução "porque os campos são quase iguais" — e descobrir meses depois que o domínio inteiro fala a língua do parceiro.
**Onde na prática:** marco 02.

### Context map
**Em uma frase:** o desenho de como os contextos se relacionam — shared kernel, customer/supplier, conformist, ACL.
**No fin-platform:** iniciação, risco, ledger e liquidação, com quem manda em quem.
**Erro comum:** desenhar caixas sem dizer a relação; o tipo de relação é justamente a informação útil.
**Onde na prática:** marco 02.

### Política (policy)
**Em uma frase:** a regra "sempre que <evento>, então <comando>" que liga um fato à próxima ação.
**No fin-platform:** "sempre que `payments.authorized`, então solicitar liquidação".
**Erro comum:** deixar a política implícita dentro de um consumidor — ela vira regra de negócio escondida em código de infraestrutura.
**Onde na prática:** marco 03.

### Hotspot
**Em uma frase:** no event storming, o ponto em que o negócio discorda de si mesmo.
**No fin-platform:** "o que acontece se o estorno chega depois do fechamento?".
**Erro comum:** resolver o hotspot na hora, no lugar de registrá-lo — ele costuma ser o item mais valioso da sessão inteira.
**Onde na prática:** marco 03, vira o desafio da saga no 09.

### Read model
**Em uma frase:** o modelo desenhado para responder perguntas, não para proteger invariantes.
**No fin-platform:** o extrato e a posição consolidada do cliente.
**Erro comum:** tratá-lo como fonte da verdade — read model é descartável por design.
**Onde na prática:** marco 03, construído no 06.

## Consistência

### Consistência forte (linearizável)
**Em uma frase:** toda leitura enxerga a escrita mais recente, como se houvesse uma cópia só.
**No fin-platform:** a checagem de saldo dentro do agregado, na hora do débito.
**Erro comum:** querer isso em todo lugar — o preço é latência e disponibilidade, pagos até no dia em que nada falha.
**Onde na prática:** marco 04.

### Consistência eventual
**Em uma frase:** sem novas escritas, todas as réplicas convergem — em algum momento.
**No fin-platform:** o extrato do cliente, alguns segundos atrás do ledger.
**Erro comum:** usar "eventual" como sinônimo de "rápido o bastante" sem nunca medir a janela.
**Onde na prática:** marco 04.

### Consistência causal
**Em uma frase:** eventos que se causam são vistos na ordem certa; eventos independentes podem ser vistos em qualquer ordem.
**No fin-platform:** o estorno referencia o débito, então a ordem entre eles importa; contra um pagamento de outra conta, não.
**Erro comum:** exigir ordem global para conseguir ordem causal — é o que mata o paralelismo (a mesma lição de ordem por chave em `kafka/06`).
**Onde na prática:** marco 04.

### CAP
**Em uma frase:** durante uma partição de rede, você escolhe entre responder (disponibilidade) e responder certo (consistência).
**No fin-platform:** o que fazer quando o `ledger-core` fica inalcançável no meio de uma liquidação.
**Erro comum:** dizer "somos AP" sobre um sistema que roda numa AZ só — sem partição, o teorema não está nem em jogo.
**Onde na prática:** marco 04.

### PACELC
**Em uma frase:** a extensão honesta do CAP — na partição, A ou C; **senão** (else), latência ou consistência.
**No fin-platform:** ler o saldo da réplica (rápido, atrasado) ou do primário (correto, mais caro) no dia normal.
**Erro comum:** discutir CAP e ignorar o "else", que é o trade-off que você paga todos os dias.
**Onde na prática:** marco 04.

### Janela de inconsistência
**Em uma frase:** o intervalo declarado entre o fato acontecer e a leitura refletir o fato.
**No fin-platform:** "o extrato reflete o pagamento em até 5 segundos, p99".
**Erro comum:** tratar como acidente técnico. É requisito: tem número, dono, monitoramento e uma frase escrita para o cliente e para o regulador.
**Onde na prática:** marco 04.

### Read-your-own-writes
**Em uma frase:** a garantia de que quem escreveu enxerga a própria escrita na leitura seguinte.
**No fin-platform:** o cliente que acabou de pagar e abre o extrato.
**Erro comum:** ignorar o caso e responder com suporte. Os truques honestos são ler do modelo de escrita logo após o comando, devolver a versão esperada ou usar sticky routing.
**Onde na prática:** marco 04.

## Contrato e modelo

### Envelope
**Em uma frase:** os metadados padronizados que todo evento carrega, independentemente do payload.
**No fin-platform:** `eventId`, `type`, `version`, `occurredAt`, `producer`, `correlationId`, `causationId`, `tenant`, `partitionKey`.
**Erro comum:** deixar cada squad inventar o seu — e descobrir num incidente que não dá para correlacionar nada.
**Onde na prática:** marco 05.

### correlationId
**Em uma frase:** o identificador do caso inteiro, que atravessa todos os eventos de uma jornada.
**No fin-platform:** um pagamento, do clique até a liquidação, com o mesmo `correlationId`.
**Erro comum:** gerar um novo a cada salto — o que transforma uma árvore em vinte troncos soltos.
**Onde na prática:** marco 05, usado no 11.

### causationId
**Em uma frase:** o identificador do evento ou comando que causou **este** evento.
**No fin-platform:** `settlement.requested` aponta para o `payments.authorized` que o disparou.
**Erro comum:** confundir com `correlationId`: um dá o caso, o outro dá a aresta da árvore causal.
**Onde na prática:** marco 05, usado no 11.

### Upcasting
**Em uma frase:** traduzir, na leitura, um evento antigo para o formato que o código de hoje entende.
**No fin-platform:** ler eventos de 2019 sem que o agregado saiba que existiu outra versão.
**Erro comum:** subestimar o custo — é o preço escondido do event sourcing que as apresentações não mostram.
**Onde na prática:** marco 07.

### CQRS
**Em uma frase:** separar o modelo que decide (escrita, rico em invariante) do modelo que responde (leitura, otimizado para a tela).
**No fin-platform:** o agregado da conta versus o extrato.
**Erro comum:** achar que CQRS implica event sourcing, dois bancos ou microsserviços — não implica nenhum dos três.
**Onde na prática:** marco 06.

### Projeção
**Em uma frase:** o consumidor idempotente que constrói um read model a partir do fluxo de eventos.
**No fin-platform:** o extrato, reconstruído do zero sempre que preciso.
**Erro comum:** tratá-la como fonte da verdade e ter medo de reprojetar. Uma KTable (`kafka/09`) é exatamente uma projeção.
**Onde na prática:** marco 06.

### Reprojeção
**Em uma frase:** apagar o read model e reconstruí-lo do início do fluxo.
**No fin-platform:** recriar o extrato inteiro e provar que o resultado é idêntico ao anterior.
**Erro comum:** nunca ensaiar. Reprojeção que nunca foi feita não é uma operação, é uma hipótese.
**Onde na prática:** marco 06.

### Event sourcing
**Em uma frase:** guardar a sequência de eventos como verdade e derivar o estado por fold.
**No fin-platform:** o ledger double-entry já é isso — lançamentos imutáveis, saldo como soma, há 500 anos.
**Erro comum:** adotar por elegância. A maioria dos times quer, na verdade, audit log + outbox — e a trilha diz isso com todas as letras.
**Onde na prática:** marco 07.

### Snapshot
**Em uma frase:** o estado materializado num ponto do stream, para não reler tudo desde o começo.
**No fin-platform:** o saldo da conta a cada 100 lançamentos.
**Erro comum:** tratar o snapshot como verdade; ele é otimização — replay total e snapshot+delta precisam dar o mesmo resultado.
**Onde na prática:** marco 07.

## Padrões de integração

### Outbox
**Em uma frase:** gravar o evento na mesma transação do dado, e publicar depois a partir da tabela.
**No fin-platform:** o `pix-gateway` grava pagamento e evento juntos; um relay publica.
**Erro comum:** achar que é sobre o broker. É consequência da fronteira do agregado: não existe commit atômico entre dois sistemas (a mecânica está em `spring-boot/06` e `kafka/08`).
**Onde na prática:** marco 08.

### Inbox
**Em uma frase:** a tabela de deduplicação no consumidor, com o `eventId` como chave.
**No fin-platform:** o consumidor de liquidação recebe o mesmo evento três vezes e lança uma.
**Erro comum:** confiar apenas na entrega do broker. É o inbox que transforma at-least-once em efeito exactly-once no negócio.
**Onde na prática:** marco 08.

### Idempotência de negócio
**Em uma frase:** a mesma intenção do usuário, repetida, produz um único efeito.
**No fin-platform:** o cliente aperta "pagar" duas vezes e paga uma — resolvido por chave de negócio, não por `eventId`.
**Erro comum:** confundir com idempotência técnica: deduplicar por `eventId` protege de reentrega, não de clique duplo.
**Onde na prática:** marco 08.

### Saga
**Em uma frase:** um processo de negócio de longa duração, quebrado em passos locais, com compensação para cada um.
**No fin-platform:** reservar saldo → antifraude → PSP → liquidar → notificar.
**Erro comum:** implementá-la implícita, espalhada por consumidores. Saga sem máquina de estado persistida é dívida invisível.
**Onde na prática:** marco 09.

### Coreografia
**Em uma frase:** cada serviço reage a eventos e ninguém coordena o todo.
**No fin-platform:** cabe até uns três passos, quando ninguém precisa de status central.
**Erro comum:** escolher por gosto. Numa fintech, alguém *sempre* pergunta "onde está esse pagamento?" — e aí coreografia não responde.
**Onde na prática:** marco 09.

### Orquestração
**Em uma frase:** um componente conhece o processo inteiro e comanda os passos.
**No fin-platform:** o orquestrador do `fin-flow`, com estado, tentativa, prazo e histórico.
**Erro comum:** transformar o orquestrador num monolito com todas as regras de todos os contextos.
**Onde na prática:** marco 09.

### Compensação
**Em uma frase:** desfazer semanticamente um passo já concluído, com uma ação nova.
**No fin-platform:** o estorno é um lançamento novo, com data e registro próprios — não um rollback.
**Erro comum:** tentar apagar o lançamento original. Em partida dobrada nada se apaga, e a conciliação quebra se você tentar.
**Onde na prática:** marco 09.

### Pivot step
**Em uma frase:** o passo a partir do qual não há mais volta — ordene a saga para que o irreversível venha por último.
**No fin-platform:** enviar o dinheiro ao PSP; a notificação ao cliente vem depois, e não antes.
**Erro comum:** deixar o irreversível no meio e descobrir que o passo 4 não tem compensação possível.
**Onde na prática:** marco 09.

### Monolito distribuído
**Em uma frase:** serviços separados que precisam ser implantados juntos e falham juntos.
**No fin-platform:** o resultado de publicar comandos disfarçados de evento e chamar quatro serviços em série.
**Erro comum:** medir sucesso pela contagem de repositórios em vez de autonomia de deploy.
**Onde na prática:** marco 13.

### Strangler fig
**Em uma frase:** extrair um contexto por vez do sistema legado, até que o legado se torne desnecessário.
**No fin-platform:** tirar a liquidação do monolito de pagamentos, começando pelo contexto com menos invariante compartilhada.
**Erro comum:** começar pelo ledger, que é onde estão as invariantes mais fortes — e onde a extração dói mais.
**Onde na prática:** marco 13.
