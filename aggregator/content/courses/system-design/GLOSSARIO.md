Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Método

### Requisito não-funcional
**Em uma frase:** como o sistema faz o que faz — latência, disponibilidade, consistência — em oposição ao que ele faz.
**No fin-platform:** "autorizar em até 300 ms" é não-funcional; "autorizar um pagamento" é funcional.
**Erro comum:** tratar requisito não-funcional como opcional, deixado para "se der tempo".
**Onde na prática:** marco 01.

### Restrição
**Em uma frase:** algo que você não escolhe — prazo regulatório, tecnologia já instalada, orçamento.
**No fin-platform:** a janela de liquidação do Pix, definida pelo Banco Central.
**Erro comum:** confundir restrição com preferência, e tentar "otimizar" o que não é negociável.
**Onde na prática:** marco 01.

### ADR (Architecture Decision Record)
**Em uma frase:** registro de uma decisão — contexto, decisão, alternativas, consequências e gatilho de reversão.
**No fin-platform:** a decisão de cortar `pix-gateway` de `ledger-core`, registrada com o porquê.
**Erro comum:** escrever ADR sem gatilho de reversão, virando história em vez de compromisso.
**Onde na prática:** marco 01 e toda a trilha.

### Gatilho de reversão
**Em uma frase:** a condição observável sob a qual uma decisão deve ser revisitada.
**No fin-platform:** "revisitar o corte se o acoplamento temporal entre os dois serviços crescer".
**Erro comum:** ADR sem esse campo — decisão que nunca mais é questionada, mesmo obsoleta.
**Onde na prática:** marco 01.

### C4
**Em uma frase:** quatro níveis de zoom arquitetural — Contexto, Container, Componente, Código.
**No fin-platform:** nível 2 (Container) mostrando `ledger-core`, `pix-gateway` e `fin-blueprint`.
**Erro comum:** usar o nível de detalhe errado para a audiência — Componente para a diretoria.
**Onde na prática:** marco 01.

### Fitness function
**Em uma frase:** teste executável que verifica continuamente uma propriedade arquitetural.
**No fin-platform:** um teste que falha se `payments` importar algo interno de `ledger`.
**Erro comum:** confiar só no diagrama — ele não impede ninguém de violar a fronteira sob prazo.
**Onde na prática:** marco 03.

## Números

### QPS de pico
**Em uma frase:** a taxa de requisições por segundo no momento de maior carga, não a média.
**No fin-platform:** o fator de pico multiplica a média por 3× a 10× nas janelas de concentração do dia.
**Erro comum:** dimensionar pela média e descobrir o pico só quando ele derruba o sistema.
**Onde na prática:** marco 02.

### Lei de Little
**Em uma frase:** concorrência média = taxa de chegada × tempo de permanência.
**No fin-platform:** 500 iniciações/s × 300 ms de permanência = 150 iniciações em voo, em média.
**Erro comum:** dimensionar capacidade sem medir o tempo de permanência real.
**Onde na prática:** marcos 02 e 08.

### Percentil (p99)
**Em uma frase:** o valor abaixo do qual 99% das observações caem — a cauda, não a média.
**No fin-platform:** p99 de uma cadeia de 5 saltos não é a soma dos p99 de cada salto.
**Erro comum:** reportar só a média e esconder que 1% dos usuários tem experiência muito pior.
**Onde na prática:** marco 02.

### Orçamento de latência
**Em uma frase:** o tempo total tolerável distribuído entre os saltos de um fluxo, com folga desigual.
**No fin-platform:** 1 segundo total, mais folga para o salto historicamente mais variável.
**Erro comum:** dividir o orçamento igualmente entre saltos, sem considerar variabilidade real.
**Onde na prática:** marcos 02 e 09.

### Amplificação de cauda
**Em uma frase:** mais saltos num fluxo aumentam a chance de que pelo menos um esteja no seu p99.
**No fin-platform:** um fan-out para quinze microsserviços sofre p99 agregado desproporcional.
**Erro comum:** achar que mais serviços só adiciona latência média, ignorando o efeito de cauda.
**Onde na prática:** marco 02.

### Premissa × dado
**Em uma frase:** premissa é rotulada e assumida; dado é medido ou vem de fonte com proveniência.
**No fin-platform:** "assumo 3.000 TPS de pico" é premissa; o número do Banco Central é linkado.
**Erro comum:** apresentar premissa como se fosse dado, sem rótulo nem dono.
**Onde na prática:** marco 02.

## Fronteira

### Contexto delimitado
**Em uma frase:** área do domínio onde um termo tem um único significado consistente.
**No fin-platform:** "conta" significa coisas diferentes no `ledger-core` e no `pix-gateway`.
**Erro comum:** unificar um termo entre contextos diferentes, forçando times a negociar significado.
**Onde na prática:** marco 03.

### Lei de Conway
**Em uma frase:** a arquitetura tende a espelhar a estrutura de comunicação da organização.
**No fin-platform:** um time único mantendo dois serviços acoplados não ganhou microsserviços.
**Erro comum:** cortar o sistema sem olhar a estrutura real de times por trás dele.
**Onde na prática:** marco 03.

### Monolito distribuído
**Em uma frase:** parece microsserviços (vários deploys), mas se comporta como monolito acoplado.
**No fin-platform:** deploys que precisam ser coordenados em ordem específica entre três times.
**Erro comum:** achar que ter vários repositórios já significa ter isolamento real.
**Onde na prática:** marco 03.

### Power of two choices (P2C)
**Em uma frase:** escolher dois backends aleatórios e mandar para o menos carregado dos dois.
**No fin-platform:** reage mais rápido que round-robin quando um backend degrada sob pico.
**Erro comum:** achar que precisa de estado global de carga para balancear bem — P2C não precisa.
**Onde na prática:** marco 04.

### Hash consistente
**Em uma frase:** anel de distribuição onde mudar o número de nós move só a fração que cabe a eles.
**No fin-platform:** adicionar o 5º nó move só 1/5 das chaves, não quase todas.
**Erro comum:** usar `hash % N` simples e remapear quase tudo quando N muda.
**Onde na prática:** marco 04.

### Vnode (nó virtual)
**Em uma frase:** posições virtuais de um nó real no anel de hash consistente, melhorando distribuição.
**No fin-platform:** 100+ vnodes por nó real mantêm a razão de carga máxima/média abaixo de 1,25.
**Erro comum:** usar poucos vnodes e sofrer distribuição desigual mesmo com hash consistente.
**Onde na prática:** marco 04.

### Ejeção de outlier
**Em uma frase:** remover automaticamente da rotação um backend com taxa de erro anormal.
**No fin-platform:** com teto de segurança — nunca ejetar mais de 50% do pool de uma vez.
**Erro comum:** ejetar sem teto sob falha correlacionada, transformando degradação em queda total.
**Onde na prática:** marco 04.

### Orçamento de retry
**Em uma frase:** limite de que fração das requisições pode ser retry, numa janela de tempo.
**No fin-platform:** quando o orçamento estoura, a chamada falha rápido em vez de insistir.
**Erro comum:** retry sem limite, amplificando carga sobre um backend que já está degradado.
**Onde na prática:** marco 04.

## Contrato

### API-first
**Em uma frase:** escrever o contrato (OpenAPI, `.proto`) antes de qualquer linha de implementação.
**No fin-platform:** o OpenAPI da iniciação de pagamento, acordado antes do código existir.
**Erro comum:** escrever o código primeiro e "documentar" o contrato depois, já capturado pela implementação.
**Onde na prática:** marco 05.

### Breaking change
**Em uma frase:** mudança de contrato que quebra um cliente que seguia a versão anterior.
**No fin-platform:** tornar um campo obrigatório na requisição quebra quem não o envia ainda.
**Erro comum:** achar que adicionar algo é sempre seguro — depende de requisição ou resposta.
**Onde na prática:** marco 05.

### `Idempotency-Key`
**Em uma frase:** chave que o cliente gera por tentativa lógica, garantindo a mesma resposta em reenvio.
**No fin-platform:** evita que um retry de rede duplique um débito, sem o cliente saber se chegou.
**Erro comum:** não propagar a chave até o ledger, deixando a defesa só na borda da API.
**Onde na prática:** marcos 05 e 09.

### Problem Details (RFC 9457)
**Em uma frase:** formato padronizado de erro HTTP — `type`, `title`, `status`, `detail`, `instance`.
**No fin-platform:** todo erro de API segue `application/problem+json`, nunca um formato próprio por endpoint.
**Erro comum:** cada endpoint inventar seu próprio formato de erro, obrigando tratamento caso a caso.
**Onde na prática:** marco 05.

### *Deadline* propagado
**Em uma frase:** o tempo restante do orçamento de latência, passado de salto a salto, não um timeout local fixo.
**No fin-platform:** se o primeiro salto consumiu 100 ms de um orçamento de 300, o segundo sabe que só tem 200.
**Erro comum:** cada salto usar seu próprio timeout fixo, ignorando quanto do orçamento já foi gasto.
**Onde na prática:** marco 05.

### Número de campo (`.proto`)
**Em uma frase:** o identificador numérico de um campo numa mensagem Protocol Buffers, nunca reutilizável.
**No fin-platform:** `buf breaking` detecta reuso de número de campo removido no CI.
**Erro comum:** reusar um número após remover o campo original — consumidor antigo interpreta errado, silenciosamente.
**Onde na prática:** marco 05.

### `Sunset`
**Em uma frase:** cabeçalho HTTP que sinaliza a data de desativação de uma versão de API.
**No fin-platform:** a v1 da API de pagamento é servida com `Sunset` declarado durante a transição para v2.
**Erro comum:** remover uma versão sem nenhum sinal técnico prévio, só um aviso em changelog que ninguém lê.
**Onde na prática:** marcos 05 e 14.

## Gestão de API

### Token bucket
**Em uma frase:** algoritmo de rate limit com um balde reabastecido a taxa constante, permitindo burst até a capacidade.
**No fin-platform:** tolera picos curtos de um TPP legítimo, mas impõe taxa sustentada no longo prazo.
**Erro comum:** confundir com janela fixa, que tem o defeito do burst de borda na virada de janela.
**Onde na prática:** marco 06.

### Janela deslizante
**Em uma frase:** rate limit que olha uma janela contínua de tempo, em vez de intervalos fixos.
**No fin-platform:** evita o burst de borda da janela fixa, ao custo de computação mais cara.
**Erro comum:** usar janela fixa por simplicidade e não medir o efeito do burst de borda na prática.
**Onde na prática:** marco 06.

### GCRA
**Em uma frase:** algoritmo de rate limit eficiente com um único valor de estado por chave.
**No fin-platform:** mais barato de manter consistente sob alta concorrência distribuída que vários contadores.
**Erro comum:** manter contadores múltiplos por chave em store distribuído quando um único valor bastaria.
**Onde na prática:** marco 06.

### Cota (plano)
**Em uma frase:** o limite de uso e a prioridade sob contenção associados a um plano de API.
**No fin-platform:** três planos de TPP — básico, parceiro, parceiro estratégico — com SLA diferente.
**Erro comum:** tratar cota só como "quantas chamadas", ignorando a prioridade sob contenção.
**Onde na prática:** marco 06.

### Medição de uso
**Em uma frase:** o pipeline que transforma evento de uso em fatura — contabilidade, não só métrica.
**No fin-platform:** idempotência por `event_id`, tolerância a duplicata e fora de ordem, reconciliação.
**Erro comum:** tratar medição de uso como métrica comum, sem as garantias que faturamento exige.
**Onde na prática:** marco 06.

### Reconciliação (de faturamento)
**Em uma frase:** confirmar que o valor faturado bate com a soma de eventos de uso únicos.
**No fin-platform:** auditável depois do fato — a prova de que ninguém foi cobrado a mais ou a menos.
**Erro comum:** não reconciliar, descobrindo divergência só quando um cliente reclama da fatura.
**Onde na prática:** marco 06.

### Falhar aberto × fechado
**Em uma frase:** decisão de negócio sobre o que fazer quando uma dependência de controle falha.
**No fin-platform:** rate limit falha aberto em leitura comum, fechado em operação cara ou sensível.
**Erro comum:** tratar como decisão técnica automática, sem dono nem conta do custo de cada lado.
**Onde na prática:** marco 06.

## Estado e fluxo

### Fonte da verdade
**Em uma frase:** o lugar onde um fato nasce — não uma cópia, não um cálculo derivado dele.
**No fin-platform:** o lançamento no ledger é fonte; o extrato é derivado dele.
**Erro comum:** tratar o derivado como se fosse a fonte, confundindo atraso de projeção com erro.
**Onde na prática:** marco 07.

### Estado derivado
**Em uma frase:** dado calculado a partir da fonte da verdade, nunca a fonte em si.
**No fin-platform:** o extrato e a posição consolidada são derivados do ledger.
**Erro comum:** escrever diretamente no derivado, criando uma segunda fonte da verdade sem querer.
**Onde na prática:** marco 07.

### Fan-out (na escrita × na leitura)
**Em uma frase:** onde o custo de propagar uma mudança para os consumidores é pago — ao escrever ou ao ler.
**No fin-platform:** a maioria dos clientes usa fan-out na escrita; o cliente famoso usa um caminho à parte.
**Erro comum:** aplicar a mesma estratégia de fan-out a todo caso, sem medir o ponto de cruzamento de custo.
**Onde na prática:** marco 11.

### Read-your-writes
**Em uma frase:** a garantia de que quem escreveu enxerga a própria escrita na leitura seguinte.
**No fin-platform:** o cliente que acabou de pagar espera ver o lançamento no extrato imediatamente.
**Erro comum:** ignorar essa expectativa num extrato com fan-out assíncrono, gerando reclamação instantânea.
**Onde na prática:** marco 11.

### Admissão (ponto de)
**Em uma frase:** onde o sistema decide dizer "não" explicitamente — na borda ou no serviço.
**No fin-platform:** rejeitar na borda é mais barato que processar parcialmente e rejeitar depois.
**Erro comum:** não ter ponto de admissão nenhum, aceitando tudo até o sistema cair de recurso.
**Onde na prática:** marco 08.

### Fila limitada
**Em uma frase:** fila com teto de tamanho e política de rejeição explícita além dele.
**No fin-platform:** transforma sobrecarga em rejeição visível, em vez de consumo de memória silencioso.
**Erro comum:** fila ilimitada, que parece segura até o dia em que a memória do processo esgota.
**Onde na prática:** marco 08.

### Joelho da curva
**Em uma frase:** o ponto, perto da capacidade máxima, onde a latência passa de plana a abrupta.
**No fin-platform:** dimensionar pela utilização média esconde que picos já empurram o sistema para lá.
**Erro comum:** operar perto ou acima do joelho sem saber, descobrindo só quando um pico normal vira incidente.
**Onde na prática:** marco 08.

## Operar

### Disponibilidade composta
**Em uma frase:** a disponibilidade de um fluxo com múltiplas dependências, sempre pior que a pior delas em série.
**No fin-platform:** seis dependências a 99,95% cada compõem para ~99,7%, não 99,95%.
**Erro comum:** achar que a disponibilidade do fluxo é a de qualquer dependência individual.
**Onde na prática:** marco 13.

### RPO (recovery point objective)
**Em uma frase:** quanto dado você aceita perder, medido em tempo de escrita.
**No fin-platform:** requisito de negócio, não número técnico escolhido isoladamente pela engenharia.
**Erro comum:** declarar RPO sem medir o que a replicação real entrega sob falha.
**Onde na prática:** marco 13.

### RTO (recovery time objective)
**Em uma frase:** quanto tempo você aceita ficar fora até voltar a operar.
**No fin-platform:** ativo-ativo tem RTO quase zero; ativo-passivo depende do tempo de failover.
**Erro comum:** medir RTO só do restore técnico, esquecendo o tempo de perceber e decidir agir.
**Onde na prática:** marco 13.

### Ativo-ativo
**Em uma frase:** duas regiões servindo tráfego simultaneamente, com RTO baixo e conflito de escrita como custo.
**No fin-platform:** a complexidade se move para resolver escritas concorrentes entre regiões.
**Erro comum:** adotar ativo-ativo sem um plano real de resolução de conflito entre regiões.
**Onde na prática:** marco 13.

### Célula
**Em uma frase:** réplica completa e independente da pilha, servindo um subconjunto de tenants.
**No fin-platform:** se uma célula falha, só os tenants dela são afetados, nunca a base inteira.
**Erro comum:** compartilhar qualquer recurso crítico entre células, anulando o isolamento pretendido.
**Onde na prática:** marco 13.

### Raio de explosão
**Em uma frase:** a fração de tenants afetada por uma falha isolada — `1/N` com N células do mesmo tamanho.
**No fin-platform:** com 10 células, uma falha isolada afeta no máximo 10% dos tenants.
**Erro comum:** ter células de tamanhos muito desiguais, concentrando raio de explosão nas maiores.
**Onde na prática:** marco 13.

### Shuffle sharding
**Em uma frase:** atribuir tenants a células de um jeito que minimiza sobreposição de conjunto entre tenants.
**No fin-platform:** reduz a chance de dois tenants específicos compartilharem exatamente as mesmas células.
**Erro comum:** atribuição simples (hash direto) que correlaciona impacto entre tenants sem necessidade.
**Onde na prática:** marco 13.

### Estabilidade estática
**Em uma frase:** o plano de dados continua servindo com a última configuração boa, mesmo sem o plano de controle.
**No fin-platform:** uma falha do plano de controle não pode travar o que já está servindo tráfego.
**Erro comum:** acoplar o plano de dados a uma consulta síncrona ao plano de controle em todo caminho quente.
**Onde na prática:** marco 13.

## Evoluir

### Feature flag
**Em uma frase:** interruptor que liga ou desliga comportamento sem novo deploy, com tipo, dono e prazo.
**No fin-platform:** release, operacional, experimento ou permissão — cada tipo com ciclo de vida distinto.
**Erro comum:** flag sem dono nem data de expiração, virando dívida que ninguém remove.
**Onde na prática:** marco 14.

### *Flag debt*
**Em uma frase:** o custo acumulado de flags que deveriam ter sido removidas e não foram.
**No fin-platform:** combinações de flags nunca testadas juntas porque ninguém imaginou que coexistiriam.
**Erro comum:** medir só quantas flags existem, sem medir combinações não testadas entre elas.
**Onde na prática:** marco 14.

### *Bucketing* determinístico
**Em uma frase:** o mesmo usuário sempre cai na mesma variante de uma flag, via hash estável.
**No fin-platform:** `hash(user_id + flag_name) % 100 < percentual` — nunca aleatório a cada chamada.
**Erro comum:** avaliação não determinística, fazendo o usuário "piscar" entre variantes a cada requisição.
**Onde na prática:** marco 14.

### *Kill switch*
**Em uma frase:** flag operacional de emergência, desligando algo sob incidente, com efeito rápido.
**No fin-platform:** efeito observável dentro de um intervalo de *poll* declarado depois de acionado.
**Erro comum:** um kill switch que demora minutos a propagar, inútil no momento em que mais se precisa dele.
**Onde na prática:** marco 14.

### *Strangler fig*
**Em uma frase:** o novo sistema cresce ao redor do antigo, assumindo responsabilidades aos poucos.
**No fin-platform:** evita o risco concentrado de uma reescrita completa de uma vez.
**Erro comum:** tentar reescrever tudo de uma vez só, atrasando entrega e concentrando risco num único corte.
**Onde na prática:** marco 14.

### Execução em paralelo (*dark launch*)
**Em uma frase:** a implementação nova roda em paralelo à antiga, sem decidir nada, só sendo comparada.
**No fin-platform:** o padrão específico para migrar cálculo financeiro — tarifa, taxa de câmbio.
**Erro comum:** usar canary comum (que já decide para parte do tráfego real) para migrar cálculo de dinheiro.
**Onde na prática:** marco 14.

### Modo sombra
**Em uma frase:** uma regra ou modelo roda em paralelo à decisão real, sem nenhuma chance de influenciá-la.
**No fin-platform:** valida uma regra de antifraude nova contra tráfego real antes de deixá-la decidir.
**Erro comum:** uma regra "sombra" que, por algum caminho de código, acaba afetando a resposta real.
**Onde na prática:** marco 12.
