---
id: producao-e-deploy
title: "Produção: imagem, startup e shutdown"
summary: "Buildpacks vs Dockerfile em camadas, CDS e GraalVM native com trade-offs reais, graceful shutdown e liveness vs readiness bem usados no Kubernetes."
estimatedMinutes: 35
references:
  - title: "Spring Boot Reference — Container Images"
    url: https://docs.spring.io/spring-boot/reference/packaging/container-images/index.html
  - title: "Spring Boot Reference — GraalVM Native Image"
    url: https://docs.spring.io/spring-boot/reference/native-image/index.html
  - title: "Spring Boot Reference — Graceful Shutdown"
    url: https://docs.spring.io/spring-boot/reference/web/graceful-shutdown.html
---

## A imagem: buildpacks vs Dockerfile em camadas

Empacotar um JAR fat numa imagem `COPY app.jar` funciona, mas desperdiça cache: qualquer
mudança de código reconstrói a camada inteira, incluindo as dependências que não mudaram.
Duas formas melhores:

- **Buildpacks** (`./gradlew bootBuildImage` / `mvn spring-boot:build-image`) — geram uma
  imagem OCI otimizada **sem Dockerfile**, com camadas separadas (dependências, snapshot,
  aplicação), usuário não-root e boas práticas por padrão. É o caminho de menor atrito e
  o default recomendado.
- **Dockerfile em camadas** — quando você precisa de controle fino, use o *layertools* do
  Boot para extrair as camadas (`dependencies`, `spring-boot-loader`, `snapshot-
  dependencies`, `application`) e copiá-las em ordem de estabilidade. As dependências
  (raramente mudam) ficam numa camada cacheável; só a camada da aplicação reconstrói a
  cada commit.

## Startup rápido: CDS e GraalVM native

Tempo de startup vira requisito quando você escala sob demanda ou reinicia numa janela de
incidente. Dois caminhos, com trade-offs bem diferentes:

- **CDS / AppCDS** (Class Data Sharing) — arquiva o estado de classes carregadas para
  a JVM mapear na subida em vez de recarregar. Ganho de startup **moderado**, custo
  **baixo**, **nenhuma** mudança no modelo de execução: continua uma JVM normal, com JIT
  e todo o ecossistema. O Boot 4 integra isso de forma quase transparente. É o ganho
  barato — comece por ele.
- **GraalVM native image** — compila **ahead-of-time** para um binário nativo. Startup em
  **dezenas de milissegundos** e consumo de memória muito menor — ótimo para serverless e
  escala agressiva. O custo é real e precisa ser dito: **reflexão, proxies dinâmicos e
  carregamento de recurso precisam ser conhecidos em build time** (o Spring AOT gera
  boa parte dos hints, mas bibliotecas fora do radar exigem configuração manual);
  **agentes Java e algumas ferramentas de APM não funcionam**; e o **tempo de build é
  muito maior**. Não é "ligar uma flag" — é uma decisão de arquitetura.

A regra: **CDS** dá 80% do ganho de startup por 5% do custo; vá de **native** só quando o
startup ultra-rápido/baixa memória for requisito concreto e você aceitar o custo de build
e as restrições de reflexão.

## Graceful shutdown

Quando o Kubernetes manda um pod parar (deploy, escala pra baixo), matar o processo no
meio de uma transação em voo é inaceitável numa fintech — pode deixar um pagamento em
estado indefinido. **Graceful shutdown** faz o servidor **parar de aceitar novas
requisições** e **esperar** as em andamento terminarem (até um limite):

```properties
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

Combinado com o *preStop hook* e o `terminationGracePeriodSeconds` do Kubernetes, garante
que nenhuma transação seja cortada no meio durante um rollout.

## Liveness e readiness bem usados

Ligando com o marco 10: o Boot expõe `/actuator/health/liveness` e
`/actuator/health/readiness` (com `management.endpoint.health.probes.enabled=true`). No
Kubernetes:

- **Liveness** falha → o pod é **reiniciado**. Use só para estado irrecuperável; ligar
  liveness a uma dependência externa causa *restart loop* quando ela oscila.
- **Readiness** falha → o pod **sai do balanceador** mas continua vivo. É onde entra a
  dependência crítica (o antifraude): indisponível → não recebe tráfego, sem reiniciar.

No rollout, o Boot marca readiness como *out* no início do shutdown, então o Kubernetes
para de mandar tráfego **antes** do graceful shutdown drenar as requisições em voo. Esse
é o encadeamento que dá deploy sem derrubar transação. (Amarra com a futura trilha de
Kubernetes.)

## Exemplo numa fintech

O **pix-gateway** roda de imagem construída por buildpacks (não-root, camadas cacheadas),
com CDS ligado para reiniciar rápido numa janela de incidente. No rollout, readiness sai
primeiro, o graceful shutdown drena as iniciações em andamento em até 30s, e só então o
pod antigo morre — **nenhuma transação Pix é cortada no meio**, requisito não-negociável
para quem move dinheiro.

## Mão na massa

**Tutorial — imagem sem root e rollback com schema já migrado.**

1. Gere a imagem por buildpacks (sem Dockerfile):

   ```bash
   mvn spring-boot:build-image -Dspring-boot.build-image.imageName=pix-gateway:v1
   docker inspect pix-gateway:v1 --format '{{.Config.User}}'   # não deve ser root/vazio
   ```

2. Rode com graceful shutdown e prove que ele espera requisição em voo:

   ```properties
   server.shutdown=graceful
   spring.lifecycle.timeout-per-shutdown-phase=30s
   ```

   ```bash
   docker run -p 8080:8080 pix-gateway:v1 &
   # dispare uma requisição de ~2s (endpoint de teste com Thread.sleep) e, no meio dela:
   docker stop -t 30 <container-id>
   # a requisição em voo deve terminar com 200, não com conexão resetada
   ```

3. **Migração expand/contract + rollback.** Adicione uma migração Flyway que só
   *expande* o schema (nova coluna nullable, sem remover nada):

   ```sql
   -- V3__add_channel_column.sql
   ALTER TABLE pagamentos ADD COLUMN canal TEXT;
   ```

   Suba a versão nova (`v2`, já lendo `canal`), confirme que funciona, e então **faça
   rollback para a imagem `v1`** sem reverter a migração:

   ```bash
   mvn spring-boot:build-image -Dspring-boot.build-image.imageName=pix-gateway:v2
   docker run -p 8080:8080 pix-gateway:v2 &   # aplica V3, usa a coluna canal
   docker stop <container-v2>
   docker run -p 8080:8080 pix-gateway:v1 &   # volta pra v1, schema já com a coluna
   curl -i -X POST localhost:8080/payments -d '{"...sem canal..."}'   # v1 ainda funciona
   ```

   A prova do marco: **v1 continua funcionando** com o schema de v2 no ar — é o que
   "expand/contract" garante (a coluna nova é nullable, v1 simplesmente não a usa).

**Checagem.** (a) O que quebraria no passo 3 se `V3` tivesse `NOT NULL` sem default?
(b) Por que buildpacks já resolve "sem root" por padrão, e o que isso evita?

## Principais aprendizados

- **Buildpacks** (`bootBuildImage`) é o default de menor atrito; Dockerfile em **camadas**
  quando precisa de controle — dependências numa camada cacheável.
- **CDS** dá o ganho de startup barato; **GraalVM native** dá startup ultrarrápido/baixa
  memória ao custo de build e restrições de reflexão — decisão de arquitetura, não flag.
- **Graceful shutdown** (`server.shutdown=graceful`) não corta transação em voo.
- **Liveness** reinicia (use só para estado irrecuperável); **readiness** tira do
  balanceador (dependência crítica) — o encadeamento readiness-out + drain dá deploy sem
  perda.
