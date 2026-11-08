# Projeto guia: `pix-core`

> Componente do `fin-platform`. O `pix-core` é o **domínio do `pix-gateway` sem framework**: tipos de
> valor (`Money`, `PixKey`, `PaymentKey`), resultado de autorização como tipo fechado, máquina de
> estados do pagamento, cálculo de tarifa e o cache de consulta DICT. Ele não tem HTTP nem banco:
> existe para ser correto, rápido e testável.

## O que você vai construir

O hexágono de dentro do `pix-gateway`, em Java puro. A trilha `spring-boot` o consome como
dependência; quem não fez a `spring-boot` usa o `pix-core` sozinho, com testes. Cada marco acrescenta
uma peça, e cada afirmação de custo (boxing, *stream* paralelo, alocação) vem com um benchmark JMH no
próprio repositório.

## Contratos com os vizinhos

Todos simuláveis com stub.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| serve | biblioteca de domínio (tipos, regras, máquina de estados) | `pix-gateway`, trilha `spring-boot` |
| serve | o mesmo modelo de estados que o `pix-status` reescreve em Kotlin | trilha `kotlin-backend` (planejada) |
| consome | nada em tempo de execução; regras de validação de chave Pix por *fixture* | `pagamentos-e-liquidacao` |

## Pré-requisitos

| Ferramenta | Versão conferida (nov/2026) | Licença |
| --- | --- | --- |
| JDK | 25 (LTS; conferido com Temurin 25.0.4.1) | GPLv2 com Classpath Exception |
| Maven ou Gradle | por ADR no marco 01 | Apache 2.0 |
| JUnit | 6.1 (Jupiter) | EPL 2.0 |
| AssertJ | 3.27 (a 4.0 ainda é *milestone*) | Apache 2.0 |
| ArchUnit | 1.5 | Apache 2.0 |
| EqualsVerifier | 4.5 | Apache 2.0 |
| JMH | 1.37 | GPLv2 com Classpath Exception |
| jcstress (opcional) | 0.16 | GPLv2 com Classpath Exception |
| JDK Mission Control | para ler as gravações do JFR | UPL |
| async-profiler (opcional) | 4.x | Apache 2.0 |

**Não precisa:** Spring, nuvem paga, nem Docker (exceto no marco 08, para o limite de contêiner).

## Recurso → versão

O baseline é o **Java 25**, a LTS vigente; a próxima LTS está prevista para setembro de 2027. Recurso
em *preview* nunca é ensinado como padrão. Cada linha foi conferida compilando um exemplo com
`javac --release N` (compila) e `--release N-1` (falha), no JDK 25.

| Recurso | Final no Java | JEP |
| --- | ---: | --- |
| `var` em variável local | 10 | 286 |
| `switch` como expressão | 14 | 361 |
| *Text blocks* | 15 | 378 |
| Records | 16 | 395 |
| *Pattern matching* para `instanceof` | 16 | 394 |
| `Stream.toList()` | 16 | — |
| Classes e interfaces seladas | 17 | 409 |
| *Pattern matching* para `switch` | 21 | 441 |
| *Record patterns* | 21 | 440 |
| Coleções sequenciadas | 21 | 431 |
| *Virtual threads* | 21 | 444 |
| ZGC geracional | 21 (padrão do ZGC desde o 23; o modo não geracional saiu no 24, JEP 490) | 439 |
| Variáveis e padrões sem nome (`_`) | 22 | 456 |
| *Stream Gatherers* | 24 | 485 |
| Carga e ligação de classes AOT | 24 | 483 |
| *Module import declarations* | 25 | 511 |
| Arquivo-fonte compacto e `main` de instância | 25 | 512 |
| *Flexible constructor bodies* | 25 | 513 |
| `ScopedValue` | 25 | 506 |
| Ergonomia de linha de comando do cache AOT (`-XX:AOTCacheOutput`) | 25 | 514 |
| *Profiling* de métodos no cache AOT | 25 | 515 |
| Cabeçalho de objeto compacto (opcional, `-XX:+UseCompactObjectHeaders`) | 25 | 519 |

**Ainda em *preview*** no Java 25, e também no 27: padrões de tipo primitivo (`instanceof byte b`,
JEP 507 no 25) e `StructuredTaskScope`. Aparecem só como *callout*.

## Regra das horas

A trilha soma 590 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 590 x 2 / 60 = 19,7, arredondado para **20 horas**.
