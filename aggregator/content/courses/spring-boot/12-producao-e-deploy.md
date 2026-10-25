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
- **Dockerfile em camadas** — quando você precisa de controle fino, use o modo `tools` do
  jar do Boot para extrair as camadas (`dependencies`, `spring-boot-loader`, `snapshot-
  dependencies`, `application`) e copiá-las em ordem de estabilidade:
  `java -Djarmode=tools -jar app.jar extract --layers --launcher`. (O antigo
  `-Djarmode=layertools` não existe mais no Boot 4: o jar responde
  `Unsupported jarmode 'layertools'`.) As dependências
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
requisições** e **esperar** as em andamento terminarem (até um limite). Desde o Boot 3.4
ele é o **padrão** — as duas linhas abaixo só deixam a escolha explícita e documentada (e
os 30 s também são o default):

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
- **Readiness** falha → o pod **sai do balanceador** mas continua vivo. É onde entra o que
  é do próprio pod (aquecendo, em shutdown). Dependência externa compartilhada, como o
  antifraude, fica fora — derrubaria todos os pods juntos (marco 10).

No rollout, o Boot marca readiness como *out* no início do shutdown, então o Kubernetes
para de mandar tráfego **antes** do graceful shutdown drenar as requisições em voo. Esse
é o encadeamento que dá deploy sem derrubar transação.

> **Reencontro adiante — `kubernetes/06`.** O lado do cluster dessa coreografia — o
> `preStop`, o `terminationGracePeriodSeconds` e por que o pod ainda recebe tráfego por
> alguns segundos depois do SIGTERM — é o assunto desse marco.

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

2. Rode com graceful shutdown e prove que ele espera requisição em voo. Para isso o
   exercício precisa de duas peças que só existem num perfil `drill` — diferença
   estrutural, logo perfil (marco 03); em produção nenhuma delas é registrada:

   ```java
   @Profile("drill")
   @RestController
   class SlowController {
       @GetMapping("/drill/slow")
       String slow() throws InterruptedException {
           Thread.sleep(5_000);          // simula uma iniciação em voo de 5 s
           return "terminei";
       }
   }

   // O issuer real do marco 09 não existe na sua máquina. No perfil drill, os tokens são
   // validados por uma chave pública local. (Só trocar a propriedade não basta: com
   // issuer-uri configurado, o Boot o prefere a public-key-location.)
   @Profile("drill")
   @Configuration
   class DrillJwtConfig {
       @Bean
       JwtDecoder drillJwtDecoder(@Value("${drill.jwt.public-key-location}") Resource key) throws Exception {
           try (InputStream in = key.getInputStream()) {
               return NimbusJwtDecoder.withPublicKey(RsaKeyConverters.x509().convert(in)).build();
           }
       }
   }
   ```

   Refaça a imagem `pix-gateway:v1` do passo 1 com essas duas classes. Depois, gere o par
   de chaves e um script que emite tokens assinados com ele:

   ```bash
   mkdir -p drill && cd drill
   openssl genrsa -out private.pem 2048
   openssl rsa -in private.pem -pubout -out public.pem
   cat > mint-jwt.sh <<'SH'
   #!/usr/bin/env bash
   # uso: ./mint-jwt.sh "payments:write payments:read"  -> JWT RS256 válido por 1h
   set -euo pipefail
   b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
   now=$(date +%s)
   header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64)
   payload=$(printf '{"iss":"https://auth.openfinance.example.com","sub":"drill","scope":"%s","iat":%d,"exp":%d}' "$1" "$now" "$((now+3600))" | b64)
   sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -sign private.pem | b64)
   echo "$header.$payload.$sig"
   SH
   chmod +x mint-jwt.sh && cd ..
   ```

   Suba um Postgres e a aplicação na mesma rede Docker. Sem Kafka, o relay do outbox
   registra erro de conexão a cada rodada — esperado aqui; os eventos ficam no outbox.

   ```bash
   docker network create pixnet
   docker run -d --name pg --network pixnet -e POSTGRES_PASSWORD=pix -e POSTGRES_DB=pix postgres:17-alpine

   docker run -d --name app-v1 --network pixnet -p 8080:8080 -v "$PWD/drill:/keys:ro" \
     -e SPRING_PROFILES_ACTIVE=drill -e DRILL_JWT_PUBLIC_KEY_LOCATION=file:/keys/public.pem \
     -e SPRING_DATASOURCE_URL=jdbc:postgresql://pg:5432/pix \
     -e SPRING_DATASOURCE_USERNAME=postgres -e SPRING_DATASOURCE_PASSWORD=pix \
     -e PIX_PSP_BASE_URL=http://psp.invalid \
     pix-gateway:v1

   TOKEN=$(cd drill && ./mint-jwt.sh "payments:write payments:read")
   curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/drill/slow &   # 5 s em voo
   sleep 1 && docker stop -t 30 app-v1
   wait
   ```

**Invariante testável.** O `curl` imprime `terminei` com status 200, o `docker stop`
leva ~5 s (não 30, nem 0) e o log mostra `Commencing graceful shutdown. Waiting for
active requests to complete` seguido de `Graceful shutdown complete`.

3. **Migração expand/contract + rollback.** Adicione uma migração Flyway que só
   *expande* o schema (nova coluna nullable, sem remover nada):

   ```sql
   -- V3__add_channel_column.sql
   ALTER TABLE payments ADD COLUMN channel TEXT;
   ```

   A versão nova (`v2`) aceita `channel` no `PaymentRequest` e grava na entidade
   `Payment`. Suba a `v2`, confirme que funciona, e então **faça rollback para a imagem
   `v1`** sem reverter a migração (o `docker run` é o do passo 2, só muda a imagem e o
   nome do container):

   ```bash
   mvn spring-boot:build-image -Dspring-boot.build-image.imageName=pix-gateway:v2
   docker rm app-v1
   docker run -d --name app-v2 ... pix-gateway:v2          # aplica V3
   curl -i -X POST localhost:8080/payments \
     -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $(cat /proc/sys/kernel/random/uuid)" \
     -H 'Content-Type: application/json' -d '{"amount": 80.00, "channel": "app"}'   # 201

   docker stop app-v2
   docker run -d --name app-v1 ... pix-gateway:v1          # volta pra v1, schema já em V3
   curl -i -X POST localhost:8080/payments \
     -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $(cat /proc/sys/kernel/random/uuid)" \
     -H 'Content-Type: application/json' -d '{"amount": 80.00}'                      # 201

   docker exec pg psql -U postgres -d pix -c "select amount, status, channel from payments"
   ```

**Invariantes testáveis.** A `v1` sobe sem erro, e o log do Flyway diz
`Schema "public" has a version (3) that is newer than the latest available migration
(2) !` — um aviso, não uma falha: por padrão o Boot ignora migrações "do futuro"
(`spring.flyway.ignore-migration-patterns=*:future`). Os dois `POST` respondem `201`, e
a consulta mostra duas linhas: uma com `channel = app`, outra com `channel` vazio. É o
que "expand/contract" garante: a coluna nova é nullable, e a `v1` simplesmente não a
usa.

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
