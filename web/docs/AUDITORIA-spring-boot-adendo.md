# Auditoria do adendo de entrevista da trilha `spring-boot`

Registro do que foi conferido em cada fase do adendo: programação reativa (marco 13), *feature
toggles* (marco 14) e a renumeração do `arquitetura-modulith` para 15.

## 1. Fase 0 — versões, licenças e compatibilidade

**Versões estáveis no Maven Central** (nov/2026):

| Biblioteca | Versão | Licença |
| --- | --- | --- |
| Spring Boot | 4.1.2 | Apache 2.0 |
| Reactor Core / Reactor Test | 3.8.8 | Apache 2.0 |
| BlockHound | 1.0.18.RELEASE | Apache 2.0 |
| OpenFeature Java SDK | 1.23.0 | Apache 2.0 (POM) |
| flagd *provider* (`dev.openfeature.contrib.providers:flagd`) | 0.15.0 | Apache 2.0 |
| Micrometer Context Propagation | 1.2.1 | Apache 2.0 (POM) |

**Executado no JDK 25** (projeto de conferência com Reactor 3.8.8, BlockHound e OpenFeature):
- **BlockHound:** `BlockHound.install()` detecta um `Thread.sleep` dentro de um `Mono.delay`
  (`BlockingOperationError: Blocking call! java.lang.Thread.sleepNanos0`). Mas só com
  `-XX:+AllowRedefinitionToAddDeleteMethods`:
  - sem a flag, a instalação falha com `IllegalStateException`;
  - com ela, a JVM avisa que a flag está *deprecated* desde o 13 e pode ser removida;
  - o ByteBuddy embutido no BlockHound também dispara avisos de `sun.misc.Unsafe`.

  O marco 13 vai registrar isso como risco de compatibilidade.
- **`StepVerifier.withVirtualTime`:** prova um `timeout` de 2 s sem esperar 2 s (verificação com
  limite de 1 s).
- **OpenFeature:** o `InMemoryProvider` do SDK avalia uma flag booleana sem serviço externo. Fica como
  *provider* local de teste; a escolha entre ele e o `flagd` é a ADR do marco 14.

**Fontes novas no `course.yaml`:** as páginas do Reactor e do OpenFeature foram conferidas pela busca
na web, porque `projectreactor.io` e `openfeature.dev` não resolvem a partir do contêiner. O
repositório da especificação Reactive Streams foi aberto e confere (licença MIT-0).

**Pontes planejadas:** `kotlin-backend/07` e `design-de-codigo/05` em `bridges-planned.yaml`.

## 2. Fase A — renumeração e stubs

- **Renumeração:** `13-arquitetura-modulith.md` (e o quiz) foi renomeado para `15-...`, com o `id` e o
  `## Capstone` intactos.
- **Stubs válidos:** `13-programacao-reativa.md` (65 min) e `14-feature-toggles-e-mudanca-segura.md`
  (55 min).
- **`course.yaml`:** a lista nova de marcos e `estimatedHours: 21` (625 × 2 / 60 = 20,8). Isso também
  resolve a exceção antiga de 22 h.

**Pontes, provadas pelo resolvedor do compilador** (`TestPontesSnapshot`, `PONTES_SLUG=spring-boot`):
- **Antes:** 108 pontes resolvem para a `spring-boot`, das quais 24 vão para `arquitetura-modulith`,
  todas literais (`spring-boot/13`), sem `/13` herdado.
- **Textuais:** 26 ocorrências de `spring-boot/13` no `content/` (as 24 pontes e 2 no `tambem:` de
  `conceitos.yaml`), reescritas para `spring-boot/15` em 15 arquivos. Nenhuma sobrou.
- **Depois:** com `PONTES_ANTES` e `PONTES_RENOMEAR=13-arquitetura-modulith.md=15-arquitetura-modulith.md`,
  o teste passa. O *diff* da coluna de destino, linha a linha, é vazio.
- **Fora das pontes:** "(marco 13)" no próprio capstone, dois verbetes do glossário (Modulith e Event
  Publication Registry) e a linha 13 da tabela de incrementos do `PROJETO.md` passaram a 15.

**Testes:** a lista de marcos sem hands-on ganhou os dois stubs.
