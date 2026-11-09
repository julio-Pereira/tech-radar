# Projeto guia: `pix-status`

> Componente do `fin-platform`. O `pix-status` é o serviço Kotlin de **consulta de status e
> notificação** de pagamentos Pix. Ele recebe o evento de mudança de estado do pagamento, responde a
> `GET /payments/{id}/status` e entrega *webhooks* ao recebedor, com prazo, *retry* e limite de
> concorrência. É o caso típico de coroutines: *fan-out*, prazo, cancelamento e *backpressure*.

## Por que uma trilha própria, e não um adendo

Vagas de backend sênior em banco escrevem "Java/Kotlin" como intercambiáveis, no contexto Spring. Por
isso a trilha é um **delta**. Ela assume as trilhas `spring-boot` e `java-e-jvm` e ensina só o que
muda: a linguagem (null-safety, tipos, funções) e, principalmente, o modelo de concorrência de
coroutines, que não tem equivalente direto em Java nem em Go.

Essa decisão foi tomada com poucas vagas de Kotlin em mãos. O critério: coroutines, concorrência
estruturada e `Flow` não cabem como seção de um marco de Spring, e o framework entra só como delta
(Spring no centro, Ktor como alternativa leve num marco). **Revisitar** o peso de Ktor × Spring se
novas vagas mostrarem outro padrão.

## O que você vai construir

O mesmo modelo de estados do `pix-core`, reescrito em Kotlin, atrás de um serviço que consulta e
notifica. Cada marco acrescenta uma peça, e cada marco compara: o que você faria em Java, o que muda em
Kotlin, o que não muda (e Go, quando o paralelo existe).

| Marco | Peça do `pix-status` |
| --- | --- |
| 01 | Projeto Gradle (Kotlin DSL) e o `Money` portado do `pix-core` |
| 02 | Fronteira de entrada do evento, sem `null` escondido |
| 03 | Máquina de estados do pagamento com `sealed` e `value class` |
| 04 | DSL de regras de notificação |
| 05 | Cliente de *webhook* suspenso, com limite por recebedor |
| 06 | Agregação de status com prazo e cancelamento |
| 07 | Pipeline de eventos → *webhooks*, com *backpressure* e DLQ |
| 08 | O serviço em Spring Boot, com *controller* `suspend` |
| 09 | O mesmo contrato HTTP em Ktor, e a API chamada de Java |

## Contratos com os vizinhos

Todos simuláveis com stub.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | evento de mudança de estado do pagamento | `pix-gateway` (trilha `spring-boot`) ou `pix-stream` (trilha `kafka`) |
| consome | modelo de estados (mesma tabela de transições) | `pix-core` (trilha `java-e-jvm`) |
| serve | `GET /payments/{id}/status` | canais/BFF |
| serve | *webhook* de notificação ao recebedor | sistemas externos (stub) |
| emite | métricas de entrega (latência, *retry*, DLQ) | trilha `observabilidade` |

**O que não é:** não inicia pagamento, não lança no ledger e não reimplementa o *broker*.

## Pré-requisitos

| Ferramenta | Versão conferida (nov/2026) | Licença |
| --- | --- | --- |
| JDK | 25 (LTS; conferido com Temurin 25.0.4.1) | GPLv2 com Classpath Exception |
| Kotlin | 2.3.21, a versão que o Spring Boot 4.1.2 gerencia (a mais nova estável é a 2.4.21) | Apache 2.0 |
| Gradle | 8.14 ou mais novo, com Kotlin DSL | Apache 2.0 |
| kotlinx.coroutines | 1.10.2, gerenciada pelo Boot 4.1.2 (a mais nova é a 1.11.0, usada pelo Ktor 3.6.1) | Apache 2.0 |
| `kotlinx-coroutines-test` | a mesma versão do `kotlinx.coroutines` | Apache 2.0 |
| Spring Boot | 4.1.2 (Spring Framework 7.0.10) | Apache 2.0 |
| Módulo Kotlin do Jackson | 3.1.x (`tools.jackson.module:jackson-module-kotlin`, o Jackson 3 do Boot 4) | Apache 2.0 |
| Ktor | 3.6.1 (marco 09) | Apache 2.0 |
| MockK ou Mockito | por ADR no marco 01 | Apache 2.0 / MIT |
| detekt | 1.23.8 estável; a linha 2.0 ainda é *alpha* | Apache 2.0 |
| Docker (opcional) | para o *stub* do recebedor | Apache 2.0 |

**Não precisa:** nuvem paga.

## Regra das horas

A trilha soma 490 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 490 x 2 / 60 = 16,3, arredondado para **16 horas**.
