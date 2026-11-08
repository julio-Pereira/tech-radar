---
id: java-vs-go
title: "Decisão arquitetural: Java vs Go em Fintech"
summary: "O entregável é uma decisão com números do seu ambiente — e a resposta para \"por que Go?\" na entrevista. Onde cada linguagem ganha, como medir sem folclore (inclusive o artefato que quase culpou a linguagem por uma opção de socket) e o capstone do ledger-core."
estimatedMinutes: 45
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura, performance]
references:
  - title: "JEP 444: Virtual Threads"
    url: https://openjdk.org/jeps/444
  - title: "vegeta (gerador de carga HTTP)"
    url: https://github.com/tsenart/vegeta
  - title: "ADR — Architecture Decision Records"
    url: https://adr.github.io/
---

## Não existe "Go é melhor que Java"

Tudo o que o `ledger-core` exercitou converge para uma capacidade: **decidir tecnologia com
fundamento**. A pergunta "por que Go e não Java?" aparece em toda entrevista de backend Go, e a
resposta ruim é a de folclore ("Go é mais rápido", "Java é pesado"). A boa nomeia **critérios** e
traz **números do seu ambiente**:

- **Latência de cauda** sob a carga real do serviço, depois de aquecido.
- **Memória** em repouso e sob carga, que vira custo por réplica.
- **Tempo de subida**, que importa em autoscaling, scale-to-zero e deploy com muitas réplicas.
- **Ecossistema** para o domínio: bibliotecas maduras para o que o serviço faz.
- **Time**: quem mantém, quem contrata, quanto custa formar.

## Onde Go ganha em fintech

- **Gateways, BFFs e serviços de borda**: alto fan-out, baixa latência, footprint pequeno.
- **Processamento de alto throughput** com lógica não muito complexa: autorização, validação,
  roteamento de pagamentos.
- **Ferramentas internas**: CLIs de operação, reconciliação, migração; o binário único sem runtime
  domina aqui.
- **Cloud native**: operators, sidecars, plugins; o ecossistema do Kubernetes é Go.
- **Subida rápida**: serverless, webhooks, scale-to-zero.

## Onde Java continua forte

- **Core bancário e motores de cálculo complexos**, com bibliotecas maduras.
- **Batch pesado**: Spring Batch é o padrão para fim de dia, liquidação e conciliação em massa.
- **Streaming complexo**: Kafka Streams e Flink.
- **Integrações corporativas**: ISO 8583, ISO 20022 e SWIFT têm bibliotecas Java testadas em
  produção; em Go, implementa-se mais coisa do zero.
- **Domínios com regras intricadas** (crédito, seguro): records, sealed types e pattern matching
  expressam bem, e o Java moderno não é o Java de 2010.

E a diferença de concorrência ficou menor: com as **virtual threads** do Java 21 (JEP 444), um
servidor Java também atende milhares de conexões bloqueantes sem uma thread do sistema por conexão.
A comparação de modelos (goroutine × virtual thread, cancelamento) está em
`concorrencia-e-recursos/06`, e o servidor Spring com virtual threads em `spring-boot/07`.

## Empate técnico, e o padrão em fintechs maduras

Para APIs de produto comuns (cadastro, consulta de saldo, extrato), decidem a infraestrutura que já
existe, a experiência do time e o custo operacional: a escolha é organizacional, não técnica. O
padrão que aparece em empresas maduras é **por camada**, não uma linguagem para tudo:

| Linguagem | Camada |
| --- | --- |
| Go | borda e serviços de alto throughput |
| Java ou Kotlin | core de domínio complexo, batch |
| Python | dados e ML |
| Rust | nichos de desempenho crítico |

## Exemplo numa fintech: medir sem folclore

O mesmo endpoint de saldo (`GET /accounts/{id}/balance`, um mapa em memória e um JSON) foi escrito em
Go, com `net/http`, e em Java 21, com o `HttpServer` da JDK e virtual threads. Os dois foram medidos
numa máquina de 4 núcleos com o mesmo script: tempo até o primeiro `200`, memória residente (RSS) em
repouso, e p99 com o `vegeta` a 2.000 requisições por segundo, por 10 segundos, **depois** de 10
segundos de aquecimento.

A primeira rodada mostrou o Java com **p99 de 48 ms** contra 1 ms do Go, estável em três execuções e
mesmo depois do aquecimento. Um número constante perto de 40 ms tem assinatura conhecida: o
algoritmo de Nagle esperando o ACK atrasado do TCP. O `HttpServer` da JDK não liga `TCP_NODELAY` por
padrão. Com `-Dsun.net.httpserver.nodelay=true`, o p99 do Java caiu para **1,1 ms**: empate. Uma
conclusão errada ("Java tem latência 48 vezes pior") quase foi parar numa ADR por causa de uma opção
de socket.

| Medida (3 execuções, nesta máquina) | Go 1.27 | Java 21 (nodelay, SerialGC) |
| --- | ---: | ---: |
| Tempo até o primeiro 200 | 7 a 9 ms | 140 a 170 ms |
| RSS em repouso | ~6,4 MB | ~50 MB |
| RSS depois da carga | ~13 MB | ~140 MB padrão; ~100 MB com `-Xmx64m` |
| p99 a 2.000 req/s, aquecido | 0,9 a 1,2 ms | 1,1 a 1,4 ms |

O que esses números dizem, e o que não dizem: para esse endpoint, **latência empata**; **memória e
subida** favorecem Go por uma ordem de grandeza, o que pesa em autoscaling e em muitas réplicas
pequenas. Não dizem nada sobre um serviço com Spring, JPA e um domínio rico, que é outro experimento.
A ADR do antifraude precisa dos números **do antifraude**, medidos assim.

## Hands-on

**Tutorial.** Escreva o endpoint de saldo nas duas linguagens e o script de medição: subir o processo,
medir o tempo até o primeiro 200, ler o `VmRSS` de `/proc/<pid>/status` em repouso, aquecer com o
`vegeta`, medir o p99 numa segunda janela e ler o RSS de novo.

**Desafio.** Escreva a ADR "Go ou Java para o antifraude", com a medição do serviço real (o handler de
`Avaliar` do marco 10 e uma versão Java equivalente), no formato de ADR do `PROJETO.md`.

**Invariantes testáveis**

1. A ADR cita pelo menos três números medidos no seu ambiente (memória em repouso, p99 sob a mesma
   carga depois de aquecido, tempo de subida), cada um com o comando que o gerou.
2. Os comandos estão no repositório e, rodados de novo, reproduzem a mesma ordem de grandeza.
3. A ADR registra as condições da medição (máquina, versões, flags da JVM e do Go, aquecimento) e
   pelo menos um artefato de medição investigado (como o `TCP_NODELAY` acima), não só o resultado.
4. A ADR tem a seção "o que me faria mudar de ideia", com um gatilho mensurável.

**Complemento.** Rode o lado Java com o servidor que o time usaria de verdade (Spring Boot com virtual
threads, de `spring-boot/07`) e refaça a tabela. O que mudou, e a decisão mudou?

**Checagem**

1. Quais critérios você usaria para responder "por que Go e não Java?" sem folclore?
2. Por que o aquecimento importa para medir a JVM, e por que ele não explicou os 48 ms?
3. Em que tipo de serviço a diferença de memória e de subida pesa na decisão?
4. Que medição faria você trocar Go por Java no antifraude?

## Principais aprendizados

- Go vence na borda, no throughput e nas ferramentas; Java segue forte no core complexo, no batch e
  nas integrações.
- Virtual threads diminuíram a distância de concorrência; memória e subida continuam diferentes.
- Medição honesta: mesmo endpoint, aquecimento, p99, e desconfiança de número constante.
- A decisão é uma ADR com números, condições e o gatilho que a reverteria.

## Capstone

O `ledger-core` é o seu componente do `fin-platform`; a especificação completa está no `PROJETO.md`
desta trilha. Aqui ele fica pronto.

**Entrega**

- [ ] Domínio: `Money` em centavos com `Allocate`, `AccountID` que não nasce inválido, `Kind` com
      `exhaustive` (marcos 01 e 02)
- [ ] Extrato paginado sem aliasing e taxonomia de erros com mapeamento para HTTP (marcos 03 a 05)
- [ ] Lote com no máximo N em voo e parada no primeiro erro; cliente de PSP com hedging sem
      vazamento (marcos 06 e 07)
- [ ] `POST /entries` idempotente com Problem Details; transferência no Postgres com ordem de trava e
      retry; antifraude gRPC com deadline e fallback (marcos 08 a 10)
- [ ] Fuzz do parser de eventos e teste de contrato contra o Postgres real (marco 11)
- [ ] Logs com `trace_id`, mTLS, `govulncheck` limpo, imagem distroless, benchmark com `benchstat`
      (marcos 12 a 14)
- [ ] Módulos `ledger`, `antifraude` e `extrato` com teste de arquitetura, e a ADR Go × Java
      (marcos 15 e 16)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] A soma dos lançamentos de toda transação é exatamente zero, e 10 mil transferências
      concorrentes conservam a soma de todos os saldos
- [ ] Nenhum `float` no caminho do valor, nem na serialização
- [ ] A mesma `Idempotency-Key` enviada 50 vezes em paralelo produz **um** lançamento
- [ ] `go test -race ./...` verde, e `goleak` sem goroutine sobrando nos testes de concorrência
- [ ] O fuzz do parser roda sem pânico no CI noturno
- [ ] Com o modelo do antifraude fora, a decisão de fallback sai dentro do deadline
- [ ] O `Shutdown` termina as requisições em voo sem perder lançamento
- [ ] `govulncheck ./...` sem vulnerabilidade alcançável
- [ ] Uma ADR por bloco: tipos do domínio, concorrência, persistência, gRPC × REST, segurança e
      Go × Java

**A pergunta final.** Qual invariante do `ledger-core` hoje só é verdade porque o teste roda com uma
goroutine, e como você provaria que ela vale com mil?

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página, inclusive
se nada tiver quebrado.
