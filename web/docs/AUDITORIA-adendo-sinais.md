# Auditoria — adendo transversal: sinais de vagas reais (nov 2026)

O adendo leva às trilhas já publicadas o que quatro vagas de sênior pedem fora das trilhas de linguagem.
Ele tem cinco blocos:

1. Migração de agente proprietário para OpenTelemetry.
2. Tabela-índice de nuvem.
3. Desafios de linguagem no banco.
4. Grupo de linguagem na jornada `entrevista-senior`.
5. Proposta de trilha de IA na engenharia, **não executada** até a decisão do Julio.

Este documento registra o que foi conferido em cada fase, e como.

## Ordem de execução (decisão de 9 nov 2026)

- **Blocos 1, 3 e 4 agora.** Todos os marcos que eles citam já existem na `main`, inclusive os da
  `kotlin-backend`.
- **Bloco 2 depois.** Ele depende da trilha `aws-para-backend` (cada linha AWS da tabela aponta para um
  marco dela), que por sua vez vem depois da `terraform-e-iac`. O plano da `terraform-e-iac` ainda não
  foi compartilhado.
- **Bloco 5 não executado** até a decisão registrada.

## 1. Fase 0 — conferências e decisões

### Bloco 1: a tabela de fornecedores

Cada célula do esqueleto do plano foi conferida em documentação oficial, em 9 nov 2026. As páginas do
Datadog foram lidas diretamente. As da New Relic, da AWS e da Elastic foram conferidas pelos trechos
das páginas oficiais devolvidos pela busca, porque o *proxy* deste ambiente recusa esses domínios.

| Conceito | Datadog | New Relic | AWS | Elastic |
| --- | --- | --- | --- | --- |
| Entrada de OTLP | três caminhos: OTLP no Agent, DDOT Collector e *endpoint* OTLP direto (sem Agent) | *endpoint* OTLP nativo (`otlp.nr-data.net`, com variantes EU e FedRAMP), o caminho recomendado | ADOT Collector; *endpoints* OTLP nativos do CloudWatch para *traces* (host do X-Ray) e *logs*, e métricas OTLP em *preview* | *Managed OTLP Endpoint* (Elastic Cloud) ou EDOT Collector; o OTLP do APM Server virou legado, não recomendado para usuário novo |
| Métricas | Metrics | Metrics | CloudWatch Metrics | Metrics |
| *Logs* | Log Management | Logs (com *logs in context*) | CloudWatch Logs | Logs |
| *Traces* | APM | Distributed Tracing (no APM) | X-Ray; Application Signals por cima | APM |
| *Profiling* | Continuous Profiler | Continuous Profiling por agente (Java por JFR; Node.js e .NET em *preview*) | CodeGuru Profiler (sem aviso de fim de suporte encontrado) | Universal Profiling |
| SLO e *error budget* | Service Level Objectives | Service Levels (Service Level Management) | SLOs do Application Signals, com *burn rate* | SLOs |

Três diferenças entre o esqueleto e a conferência entram no texto do marco:

- **AWS.** O SDK e o *daemon* do X-Ray entraram em manutenção em 25 fev 2026, com fim de suporte em
  25 fev 2027. A AWS aponta o OpenTelemetry como o caminho de instrumentação. Na migração para OTel na
  AWS, o agente "proprietário" que sai é o SDK do X-Ray.
- **Datadog.** Dado vindo do SDK do OTel não alimenta alguns produtos proprietários, entre eles o
  Continuous Profiler, segundo a página de OTLP no Agent. A paridade de painéis precisa listar o que
  fica sem dado.
- **Elastic.** A ingestão OTLP direto no APM Server é legado. O caminho é o EDOT Collector ou o
  *endpoint* gerenciado.

**Fontes:**

- **Datadog:**
  - [OpenTelemetry](https://docs.datadoghq.com/opentelemetry/);
  - [OTLP no Agent](https://docs.datadoghq.com/opentelemetry/otlp_ingest_in_the_agent.md);
  - [DDOT](https://docs.datadoghq.com/opentelemetry/setup/ddot_collector.md);
  - [OTLP direto](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest.md);
  - [Profiler](https://docs.datadoghq.com/profiler/);
  - [SLOs](https://docs.datadoghq.com/service_management/service_level_objectives/).
- **New Relic:**
  - [OTLP](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/);
  - [Service levels](https://docs.newrelic.com/docs/service-level-management/consume-slm/);
  - [Profiling com JFR](https://docs.newrelic.com/docs/apm/agents/java-agent/features/real-time-profiling-java-using-jfr-metrics/);
  - [notas de out 2026](https://docs.newrelic.com/docs/release-notes/docs-release-notes/docs-10-9-2026/).
- **AWS:**
  - [OTLP Endpoints](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html);
  - [SLOs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html);
  - [ADOT](https://aws-otel.github.io/docs/introduction);
  - [fim de suporte do SDK do X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-daemon-eos.html).
- **Elastic:**
  - [OpenTelemetry com Elastic APM](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry);
  - [intake do APM Server](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry-intake-api);
  - [endpoint OTLP](https://www.elastic.co/docs/manage-data/ingest/otlp-endpoint);
  - [visão geral](https://www.elastic.co/docs/solutions/observability).

### Bloco 1: o envio duplo, provado localmente

Para o Complemento do marco `observabilidade/05`, o laboratório usou:

- um OpenTelemetry Collector contrib 0.139.0 com dois exportadores OTLP: Tempo 2.6.1 e Jaeger 2.11.0;
- um gerador em Go (SDK do OTel 1.38.0), que grava os `trace_id` enviados;
- um *script* que confere cada `trace_id` nas APIs dos dois destinos.

Tudo roda em Docker, sem conta em nuvem.

| Cenário | Tempo | Jaeger | Resultado do *script* |
| --- | ---: | ---: | --- |
| os dois destinos no ar, 200 *traces* | 200 | 200 | paridade (saída 0) |
| Jaeger fora durante o envio, de volta em seguida (*retry* padrão) | 100 | 100 | paridade: a fila de *retry* do exportador segurou e entregou |
| Jaeger fora por mais tempo que o *retry* (`max_elapsed_time: 10s`, só no teste) | 100 | 0 | falha (saída 1); o Collector registra `Exporting failed. Dropping data.` |

Um efeito colateral virou conteúdo. A primeira tentativa do terceiro cenário tinha
`max_elapsed_time` menor que `max_interval`. Com isso, o Collector **não subiu**
(`invalid configuration`), e os **dois** destinos ficaram sem dado. No envio duplo, uma configuração
inválida derruba o caminho antigo junto com o novo, e por isso a configuração precisa ser validada na
esteira.

### Bloco 3: desafios e linguagens

- **`cache-lru-ttl` e `transferencia-sem-deadlock`** já existem no banco, em Java, desde o PR #128. O
  Bloco 3 acrescenta a variante Go de cada um, com `-race` no `check-lld.sh`, e os pré-requisitos Go
  (`go-fintech/03` e `go-fintech/09`).
- **Kotlin no `check-lld.sh`: não estender.** O *script* e o job do CI conhecem `go/` e `java/`
  (Maven). Uma variante `kotlin/` traria o plugin Kotlin ao job, e o desafio Kotlin equivalente já
  existe: o pipeline do marco `kotlin-backend/07`, com os mesmos invariantes (pendentes limitados, ordem
  por chave, DLQ). O `pipeline-com-backpressure` sai só em Go, e o enunciado aponta para o marco 07 como
  variante Kotlin.
- **Marcos citados como pré-requisito**, todos conferidos na `main`:
  - `go-fintech/03`, `/06`, `/07` e `/09`;
  - `java-e-jvm/03`;
  - `concorrencia-e-recursos/04`;
  - `kotlin-backend/07`;
  - `lideranca-tecnica/07` ("Mentoria, delegação e feedback") e `/08` ("Escrita, rituais e
    reuniões").

### Bloco 4: a jornada

- **Os nove `ref` do grupo de linguagem existem**, com estes títulos:
  - `go-fintech/03` "Slices, maps e strings: a semântica que derruba entrevista";
  - `go-fintech/04` "Interfaces, tipos e generics com critério";
  - `go-fintech/07` "Goroutines em produção: vazamento, cancelamento e limites";
  - `go-fintech/14` "Runtime, performance e profiling";
  - `java-e-jvm/02` "Objetos, igualdade e imutabilidade";
  - `java-e-jvm/03` "Coleções por dentro";
  - `java-e-jvm/08` "Memória e GC";
  - `spring-boot/13` "Programação reativa a fundo";
  - `kotlin-backend/06` "Concorrência estruturada e cancelamento".
- **"Escolha um".** O formato de `paths` não marca um grupo inteiro como escolha única, mas aceita
  `optional` por etapa. A decisão: as nove etapas entram como `optional: true`, e o `why` da primeira
  diz em uma frase que se escolhe a linguagem da vaga.
- **Ordem de pré-requisitos.** O compilador confere a ordem dos pré-requisitos entre trilhas no
  caminho. O grupo entra entre "Código e LLD" e "Domínio fintech como diferencial", e o teste vai
  confirmar que a ordem continua válida.

### Bloco 2: adiado

A tabela "conceito → serviço" e as pontes para `aws-para-backend` ficam para depois daquela trilha,
como o próprio plano prevê.

## 2. Fase 1 — Bloco 1 (observabilidade)

**`observabilidade/05`.** O marco ganhou:

- a seção "Migrar de um agente proprietário para OTel" (~600 palavras), com:
  - os três motivos da troca;
  - o fim de suporte do SDK do X-Ray como exemplo;
  - a sequência instrumentar → envio duplo → paridade;
  - quatro armadilhas: nome de métrica, cardinalidade, alerta mudo (com `absent_over_time`) e produto
    proprietário que não lê OTel;
  - a tabela conferida na Fase 0;
- o Complemento de envio duplo, com o invariante e os quatro resultados do laboratório da §1;
- `otelcol-contrib validate`, conferido: ele acusa
  `'max_elapsed_time' must not be less than 'initial_interval'` sem subir o Collector;
- o item (e) da checagem e um aprendizado novo;
- `reviewedAt` e `reviewEvery: 6m`, porque o marco agora depende de nomes de produto;
- as referências do Datadog e do fim de suporte do X-Ray.

**Quiz do 05.** A questão de *baggage* saiu, porque o tema continua na checagem (d). Entrou uma questão
sobre envio duplo × troca direta, e o marco continua com 4 questões. Na questão nova, a correta não é a
estritamente mais longa.

**`observabilidade/16`.** O marco ganhou um parágrafo sobre a conta em SaaS: as alavancas são as
mesmas, e só muda a linha da fatura em que o desperdício aparece.

**Glossário da `observabilidade`.** Entraram três verbetes: envio duplo, paridade de alertas e alerta
de ausência de dado. "Semantic convention" já existia e foi mantido. A trilha passa a ter 47
verbetes.

**Pontes de retorno.** `go-fintech/12` e `spring-boot/10` passam a citar `observabilidade/05` para a
migração.

**Testes.** O golden de seções ganhou +1 bloco de complemento (269), e o de glossário foi regenerado.

## 3. Fase 3 — Bloco 3 (banco de desafios)

O banco passa de 12 para 15 desafios, e dois dos que já existiam ganham a variante Go. Todos os
desafios com código passam no `tools/desafios/check-lld.sh`, o mesmo do CI: os testes falham no
esqueleto e passam na referência, com `-race` no Go e com Go 1.27 e JDK 21, as versões do job.

| Desafio | Linguagens | Prova extra: a implementação errada que os testes reprovam |
| --- | --- | --- |
| `cache-lru-ttl` | Java (#128) + **Go** novo | sem o `Mutex`: 10 avisos de *data race* com `-race` |
| `transferencia-sem-deadlock` | Java (#128) + **Go** novo | travas na ordem do pedido: "deadlock?" em 15 s; referência com `-race` em 1,8 s |
| `fetcher-concorrente-limitado` (novo) | Go | sem o `wg.Wait()`: o `goleak` mostra as goroutines; vaga adquirida dentro da goroutine: chamadas começam depois do primeiro erro |
| `pipeline-com-backpressure` (novo) | Go | partição pela sequência em vez da chave: pagamento fora de ordem; fila sem limite: 392 pendentes contra o máximo de 37 |
| `elevar-o-nivel-do-time` (novo) | comportamental | rubrica de 5 itens: evidência, mecanismo (não heroísmo), medida, o que não funcionou, crédito ao time |

**Pré-requisitos.** O compilador trata os pré-requisitos como uma lista que precisa estar inteira
concluída para o desafio ser liberado. Por isso, nos dois desafios que ganharam Go, os pré-requisitos
continuam os da versão Java. Os marcos de Go (`go-fintech/03` e `go-fintech/09`) entram nas Dicas: se
entrassem como pré-requisito, quem estuda só Java teria o desafio bloqueado. Os novos usam os
pré-requisitos do plano:

- `go-fintech/06` e `/07` no *fetcher*;
- `go-fintech/06` e `kotlin-backend/07` no *pipeline*;
- `lideranca-tecnica/07` e `/08` no comportamental.

**Kotlin.** Como decidido na §1, o `pipeline-com-backpressure` sai só em Go, e o enunciado aponta o
Desafio do marco `kotlin-backend/07` como a versão Kotlin.

**Viés das decisões.** As 6 decisões novas não têm a correta como a opção estritamente mais longa. No
banco inteiro, isso acontece em 5 de 39 decisões, abaixo do limite de 40%.

**Testes web.** Os testes de desafios e da jornada passam a esperar 15 desafios, e o filtro `lld`
passa a esperar 5.

## 4. Fase 4 — Bloco 4 (jornada `entrevista-senior`)

O grupo novo **"Linguagem (escolha a da vaga)"** entra entre "Código e LLD" e "Domínio fintech como
diferencial". Todas as etapas dele são `optional: true`, e o `why` da primeira diz que se escolhe
só a linguagem da vaga.

**Desvio do plano.** O plano pedia nove etapas novas, mas sete marcos de linguagem já estavam na jornada,
no grupo "Código e LLD":

- `java-e-jvm/02`, `/03` e `/08`, pelo plano da `java-e-jvm`;
- `go-fintech/04`, `/06`, `/07` e `/16`, pelo plano da `go-fintech`.

O compilador recusa `ref` duplicado. A solução foi **mover** esses sete para o grupo novo, mantendo os
`why` que já descreviam cada marco pelo título real, e **acrescentar** os quatro que faltavam:

| `ref` | Título real | `why` |
| --- | --- | --- |
| `go-fintech/03` | Slices, maps e strings: a semântica que derruba entrevista | escolha a linguagem da vaga; slices, maps e strings concentram o "o que esse código imprime?" |
| `go-fintech/14` | Runtime, performance e profiling | os números de alocação e GC respondem "como você otimizaria isso?" |
| `spring-boot/13` | Programação reativa a fundo | cobre a vaga que pede reativo e streaming, e quando não usar |
| `kotlin-backend/06` | Concorrência estruturada e cancelamento | o diferencial de Kotlin que a banca usa para medir profundidade |

`go-fintech/06` (canais e `errgroup`) e `go-fintech/16` (Java × Go), que não estavam na lista do plano,
ficam no grupo de linguagem porque são específicos de Go. O grupo tem 11 etapas, e a jornada passa de
35 para 39.

**Testes.**

- `go test ./...` passou, inclusive a validação de `ref` e da ordem de pré-requisitos entre trilhas.
- O `jornada.spec.js` passa a esperar o grupo novo na lista de grupos e "39 etapas".
- Playwright: os 18 testes de `jornada.spec.js` e `paths.spec.js` passaram, depois de a suíte completa
  ter falhado só na lista de grupos, que era o ajuste esperado.

## Critérios de aceite

- [x] Tabela do Bloco 1 com cada célula conferida e a fonte de cada linha (§1). A tabela do Bloco 2
      fica para depois da `aws-para-backend`.
- [x] Complemento novo do Bloco 1 com invariante testável, rodando sem conta em nuvem (§1, §2).
- [x] Desafios `lld` passando no `check-lld.sh` (§3).
- [x] Jornada com o grupo de linguagem, todos os `ref` resolvendo e os `why` fiéis ao título real (§4).
- [x] Bloco 5 não implementado.
- [x] `go test ./...` e testes do front verdes.
