Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira —
o Bloco A cria o vocabulário, e os blocos seguintes o reencontram.

## Conceitos fundamentais

### Observabilidade
**Em uma frase:** a propriedade de conseguir inferir o estado interno de um sistema a partir do que ele emite, inclusive para perguntas que ninguém previu.
**No fin-platform:** conseguir responder "por que só os pagamentos acima de R$50 mil do Itaú falham?" sem fazer deploy.
**Erro comum:** confundir com a ferramenta — "temos Grafana" não é resposta.
**Onde na prática:** marco 01.

### Monitoramento
**Em uma frase:** verificar continuamente um conjunto pré-definido de condições.
**No fin-platform:** alertar quando a taxa de erro do `POST /payments` passa do orçado.
**Erro comum:** tratar como inferior à observabilidade — é o subconjunto que dispara o pager, e é indispensável.
**Onde na prática:** marco 01.

### Telemetria
**Em uma frase:** os dados que o sistema emite sobre si mesmo — métricas, logs, traces, profiles.
**No fin-platform:** o que sai dos serviços via OTLP para o Collector.
**Erro comum:** confundir telemetria com trilha de auditoria; a primeira é descartável, a segunda não.
**Onde na prática:** marcos 05, 09, 17.

### Known-unknown / unknown-unknown
**Em uma frase:** o problema que você previu e não sabe quando ocorre, contra o que você nem sabia ser possível.
**No fin-platform:** "o PSP pode ficar lento" é known-unknown; "payload de cliente migrado estoura o buffer do antifraude" é unknown-unknown.
**Erro comum:** achar que dashboards cobrem incidente real — eles cobrem os dois primeiros tipos.
**Onde na prática:** marcos 01, 15.

### Black-box / white-box
**Em uma frase:** sondar de fora como um cliente, contra enxergar por dentro.
**No fin-platform:** um pagamento sintético de R$0,01 por minuto (black-box) contra o trace da autorização (white-box).
**Erro comum:** abrir mão do black-box — é o que pega o que a sua instrumentação não previu.
**Onde na prática:** marcos 01, 13.

### Monitoramento sintético
**Em uma frase:** tráfego artificial e previsível gerado de fora para verificar se o serviço funciona.
**No fin-platform:** o pagamento de R$0,01 a cada minuto, ponta a ponta.
**Erro comum:** monitorar só o `/health` em vez da jornada de negócio completa.
**Onde na prática:** marcos 01, 13.

### RUM (real user monitoring)
**Em uma frase:** telemetria coletada do cliente real, no navegador ou no app.
**No fin-platform:** o tempo que o cliente espera de fato, incluindo rede e dispositivo.
**Erro comum:** assumir que a latência do servidor é a experiência do usuário.
**Onde na prática:** marco 01.

### ODD (observability-driven development)
**Em uma frase:** instrumentar durante o desenvolvimento, tratando "como vou saber que isso quebrou?" como item de code review.
**No fin-platform:** nenhuma feature flag sem uma métrica que a discrimine.
**Erro comum:** instrumentar depois do primeiro incidente.
**Onde na prática:** marco 01.

## Confiabilidade

### SLI (service level indicator)
**Em uma frase:** o que você mede — a razão entre eventos bons e eventos válidos.
**No fin-platform:** proporção de `POST /payments` que responde em menos de 500ms sem 5xx.
**Erro comum:** usar uma média como SLI; SLI é razão, não média.
**Onde na prática:** marcos 02, 12.

### SLO (service level objective)
**Em uma frase:** a meta interna sobre um SLI, com janela explícita.
**No fin-platform:** 99,9% em 30 dias corridos na iniciação de pagamento.
**Erro comum:** definir SLO igual ao SLA, ficando sem margem de manobra.
**Onde na prática:** marcos 02, 12.

### SLA (service level agreement)
**Em uma frase:** o contrato externo, com consequência jurídica ou financeira.
**No fin-platform:** 99,5% mensal com o PSP, com crédito em fatura se descumprido.
**Erro comum:** aceitar a cláusula sem perguntar "99,5% de quê, medido onde, em qual janela?".
**Onde na prática:** marcos 02, 12.

### Error budget
**Em uma frase:** o complemento do SLO — quanta indisponibilidade você pode gastar antes de parar de lançar feature.
**No fin-platform:** SLO de 99,9% na iniciação de pagamento ⇒ 43min/mês de orçamento.
**Erro comum:** tratar como meta a atingir em vez de recurso a gastar; budget nunca gasto é SLO conservador demais.
**Onde na prática:** marcos 02, 12.

### Error budget policy
**Em uma frase:** a regra escrita do que muda quando o orçamento acaba.
**No fin-platform:** budget esgotado ⇒ congela feature e prioriza confiabilidade até se recompor.
**Erro comum:** ter SLO sem policy — o número vira relatório e não muda decisão nenhuma.
**Onde na prática:** marco 12.

### Disponibilidade composta
**Em uma frase:** a disponibilidade de um fluxo com dependências em série é o produto das disponibilidades.
**No fin-platform:** 99,95% × 99,9% × 99,9% × 99,5% ≈ 99,25% — quase 5,5h/mês.
**Erro comum:** prometer para o fluxo o SLO do seu serviço, ignorando o caminho crítico.
**Onde na prática:** marcos 02, 12.

### MTTD / MTTA / MTTR / MTBF
**Em uma frase:** tempo médio até detectar, reconhecer, restaurar, e entre falhas.
**No fin-platform:** MTTD é o intervalo entre o PSP começar a recusar e o alerta disparar.
**Erro comum:** reportar MTTR como média — dois incidentes de 5min e um de 6h não são "média de 2h".
**Onde na prática:** marcos 02, 15.

### Toil
**Em uma frase:** trabalho manual, repetitivo, automatizável, sem valor duradouro, que cresce com o sistema.
**No fin-platform:** reiniciar o consumidor travado toda segunda-feira.
**Erro comum:** confundir com trabalho operacional em geral — investigar um incidente novo não é toil.
**Onde na prática:** marcos 02, 15.

### Blast radius / failure domain
**Em uma frase:** o alcance do estrago de uma falha, e o conjunto de coisas que caem juntas.
**No fin-platform:** namespace por domínio, PDB e spread por zona limitam o alcance.
**Erro comum:** chamar de redundância o que são cópias no mesmo domínio de falha.
**Onde na prática:** marcos 02, 15.

### Alert fatigue
**Em uma frase:** alertas demais ou irrelevantes demais treinam o time a ignorá-los.
**No fin-platform:** o alerta de CPU que dispara em toda madrugada de batch.
**Erro comum:** medir a saúde do alerting pelo número de alertas em vez da taxa de acionáveis.
**Onde na prática:** marcos 02, 13.

### On-call
**Em uma frase:** a escala de plantão que responde ao pager.
**No fin-platform:** quem é acordado quando a taxa de autorização desaba às 3h.
**Erro comum:** medir só a cobertura da escala, não a quantidade de acionamentos por turno.
**Onde na prática:** marcos 02, 13.

### Runbook
**Em uma frase:** o documento que diz o que fazer quando este alerta específico dispara.
**No fin-platform:** o RTO medido do restore com Velero está no runbook, não na memória de alguém.
**Erro comum:** alerta sem runbook — que é só um susto às 3h.
**Onde na prática:** marcos 02, 13, 15.

### Post-mortem blameless
**Em uma frase:** análise pós-incidente que investiga o sistema em vez de procurar culpado.
**No fin-platform:** uma página por incidente, sem nome de pessoa, com ação de prevenção.
**Erro comum:** escrever "erro humano" como causa raiz — é onde a investigação deveria começar.
**Onde na prática:** marcos 02, 15.

### RCA (root cause analysis)
**Em uma frase:** a análise que persegue a causa por trás do sintoma.
**No fin-platform:** "o pod reiniciou" é sintoma; "a liveness depende do banco" é causa.
**Erro comum:** parar na primeira causa plausível, que costuma ser a mais visível.
**Onde na prática:** marco 15.

### Apdex
**Em uma frase:** índice de satisfação baseado num limiar de latência (satisfeito/tolerável/frustrado).
**No fin-platform:** aparece em ferramenta antiga que você vai encontrar.
**Erro comum:** usá-lo como métrica principal — o limiar é arbitrário e o índice esconde a distribuição.
**Onde na prática:** marco 02 (legado).

## Frameworks de sinal

### Golden signals
**Em uma frase:** latência, tráfego, erros e saturação — o checklist mínimo de um serviço.
**No fin-platform:** os quatro no `pix-gateway`, com latência de sucesso e de erro separadas.
**Erro comum:** medir latência de sucesso e erro juntas — erro rápido melhora o p99 durante o incidente.
**Onde na prática:** marcos 03, 07.

### RED
**Em uma frase:** Rate, Errors, Duration — a lente do serviço, o que o consumidor sente.
**No fin-platform:** RPS, taxa de 5xx e duração do `POST /payments`.
**Erro comum:** achar que RED cobre corretude — ele mede transporte, não conteúdo.
**Onde na prática:** marcos 03, 07, 10.

### USE
**Em uma frase:** Utilization, Saturation, Errors — a lente do recurso, criada para achar gargalo.
**No fin-platform:** pool Hikari, lag do consumidor, throttling de CPU.
**Erro comum:** alertar por USE — ele explica, RED detecta.
**Onde na prática:** marcos 03, 07.

### Saturação
**Em uma frase:** quanto trabalho está na fila esperando — o único sinal preditivo.
**No fin-platform:** `hikaricp_connections_pending`, lag por partição, fila de liquidação.
**Erro comum:** confundir com utilização; utilização tem teto de 100%, a fila não tem teto.
**Onde na prática:** marcos 03, 07, 08.

## Modelo de dado e estatística

### Cardinalidade
**Em uma frase:** quantos valores distintos um atributo assume — e o total de séries é o produto das cardinalidades.
**No fin-platform:** `psp` (5 valores) é barato; `payment_id` derruba o Prometheus.
**Erro comum:** tratar como detalhe de custo; é pré-condição da observabilidade **e** a origem da conta.
**Onde na prática:** marcos 01, 04, 06, 07, 09, 16.

### Dimensionalidade
**Em uma frase:** quantos atributos você anexa a cada evento.
**No fin-platform:** `psp`, `bandeira`, `canal`, `versão` num span de pagamento.
**Erro comum:** confundir com cardinalidade — dimensionalidade é quantos campos, cardinalidade é quantos valores.
**Onde na prática:** marcos 01, 04.

### Percentil
**Em uma frase:** o valor abaixo do qual está determinada fração das observações.
**No fin-platform:** p99 de 200ms com 10k req/min são 100 clientes insatisfeitos por minuto.
**Erro comum:** tirar média de percentis — some buckets, nunca percentis.
**Onde na prática:** marcos 04, 07.

### Coordinated omission
**Em uma frase:** as requisições que travaram tanto que nem foram enviadas somem da amostra e melhoram o p99 artificialmente.
**No fin-platform:** o benchmark que "melhorou" justamente quando o gateway congelou.
**Erro comum:** confiar no p99 de um gerador de carga que não corrige pela taxa esperada.
**Onde na prática:** marco 04.

### Little's Law
**Em uma frase:** `L = λ × W` — concorrência é taxa de chegada vezes tempo de serviço.
**No fin-platform:** 100 req/s a 50ms são 5 em voo; a 100ms são 10, e o pool tem 8.
**Erro comum:** tratar fila crescente como mistério — é aritmética, e o retry dobra o λ.
**Onde na prática:** marcos 03, 04.

### Wide event
**Em uma frase:** um evento canônico por unidade de trabalho, com dezenas de atributos, do qual os demais sinais derivam.
**No fin-platform:** um evento por pagamento com PSP, canal, duração, resultado e versão.
**Erro comum:** apresentar como consenso — o argumento contra é custo e maturidade de ferramenta.
**Onde na prática:** marco 04.

### Push vs pull
**Em uma frase:** a app envia (OTLP) ou o coletor raspa (`/metrics`).
**No fin-platform:** app faz push OTLP ao Collector, e o Collector expõe pull ao Prometheus.
**Erro comum:** com push, esquecer que silêncio é ambíguo — saudável e quieto, ou morto?
**Onde na prática:** marcos 04, 06, 07.

## OpenTelemetry e pipeline

### Semantic convention
**Em uma frase:** nomes padronizados de atributos, para que dado de serviços diferentes seja comparável.
**No fin-platform:** `http.request.method` e `db.system` iguais em Java e em Go.
**Erro comum:** inventar nome próprio onde a convenção existe, quebrando painel e consulta entre stacks.
**Onde na prática:** marcos 05, 10.

### Resource attribute
**Em uma frase:** atributos que descrevem quem emitiu, anexados a todo sinal do processo.
**No fin-platform:** `service.name`, `service.version`, `k8s.pod.name`.
**Erro comum:** esquecer `service.version` — é o que responde "esse erro começou na versão nova?".
**Onde na prática:** marcos 05, 06.

### Context propagation
**Em uma frase:** o mecanismo (header W3C `traceparent`) que faz o contexto do trace atravessar processos.
**No fin-platform:** o header viaja no HTTP e nos headers da mensagem Kafka.
**Erro comum:** perder o contexto em troca de thread ou executor — o trace "some no meio".
**Onde na prática:** marcos 05, 10.

### Baggage
**Em uma frase:** pares chave-valor que viajam junto com o contexto e podem ser lidos por qualquer serviço da cadeia.
**No fin-platform:** `canal` propagado para todos os serviços da requisição.
**Erro comum:** pôr PII em baggage — ela vira atributo em toda a telemetria.
**Onde na prática:** marcos 05, 17.

### Span
**Em uma frase:** uma unidade de trabalho com início, fim, atributos, status e um pai.
**No fin-platform:** o span da chamada ao PSP, com `fin.psp` e `fin.amount_cents`.
**Erro comum:** criar um span por método — traces de 400 spans que ninguém lê.
**Onde na prática:** marcos 05, 10.

### Trace
**Em uma frase:** o conjunto de spans com o mesmo `trace_id`, formando uma árvore causal.
**No fin-platform:** do `POST /payments` até o lançamento no ledger, atravessando o Kafka por link.
**Erro comum:** esperar que o trace exista para toda requisição — com sampling, ele pode não existir.
**Onde na prática:** marcos 05, 06, 10.

### Sampling (head / tail)
**Em uma frase:** decidir o que guardar no começo, antes de saber o que aconteceu, ou no fim, com o trace completo.
**No fin-platform:** tail sampling guarda 100% dos erros, dos lentos e das transações acima de R$50 mil, e 5% do resto.
**Erro comum:** fazer tail sampling com spans do mesmo trace caindo em gateways diferentes — decisão sobre trace parcial.
**Onde na prática:** marcos 06, 10, 16.

### Exemplar
**Em uma frase:** um `trace_id` anexado a uma observação de bucket de histograma, ligando métrica a trace.
**No fin-platform:** clicar no pico do p99 e abrir o trace daquela requisição.
**Erro comum:** ignorá-lo e correlacionar à mão — é o meio-termo prático entre pilares e wide events.
**Onde na prática:** marcos 04, 07, 14.

### Profile
**Em uma frase:** amostra periódica da pilha de execução, agregada, que responde "por quê, em qual linha".
**No fin-platform:** o flame graph que mostra a serialização consumindo os 600ms que nenhum span explicava.
**Erro comum:** ler a altura do flame graph como lentidão — só a largura é tempo.
**Onde na prática:** marcos 04, 11.

### Burn rate
**Em uma frase:** a velocidade com que o error budget está sendo consumido.
**No fin-platform:** duas janelas combinadas, uma curta e uma longa, para pegar o incidente agudo e a degradação lenta.
**Erro comum:** alertar por limiar fixo de erro em vez de burn rate — grita no pico curto e cala na degradação.
**Onde na prática:** marcos 12, 13.
