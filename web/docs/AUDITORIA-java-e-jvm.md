# Auditoria da trilha `java-e-jvm`

Registro do que foi conferido em cada fase do plano da trilha `java-e-jvm` (Java a fundo e a JVM),
com o comando ou a fonte de cada conferência.

## 1. Fase 0 — convenções, versões, ferramentas e esqueleto

**Estado de partida:** `main` em `cb6e273`, depois do merge da reestruturação da `go-fintech` (#117).

**Convenções reconferidas no código do compilador** (`aggregator/internal/course`):
- `## Hands-on` em cinco blocos (**Tutorial.**, **Desafio.**, **Invariantes testáveis**,
  **Complemento.**, **Checagem**), contados pelo golden de `sections_test.go`;
- quiz com `question`/`code` (opcional)/`options`/`answer`/`explanation`, com a posição embaralhada no
  build; o comprimento da correta continua sendo controlado à mão;
- pontes `trilha/NN` resolvidas pelo prefixo do arquivo, com exceções em `bridges-planned.yaml`;
- `glossary: GLOSSARIO.md` no formato de quatro campos, com "marco NN" no último;
- `## Capstone` obrigatório no último marco de uma trilha com entrada em `capstones.yaml`;
- `reviewEvery` com `reviewedAt`.

**Colisões:** nenhuma trilha, `id` de marco ou componente de capstone se chama `java-e-jvm` ou
`pix-core`. Os 11 `id`s do plano são novos no repositório.

**Baseline.** O Java 25 é a LTS vigente. Conferido com o Temurin `25.0.4.1+1-LTS` (agosto de 2026).
A release mais nova é o Java 27 (Temurin `27+35`, setembro de 2026), sem LTS; a próxima LTS está
prevista para setembro de 2027.

**Recurso → versão.** Cada linha da tabela do `PROJETO.md` foi conferida compilando um exemplo mínimo
no `javac` 25: compila com `--release N` e falha com `--release N-1`. Os 17 casos bateram (de `var` no
10 a `ScopedValue` e `main` de instância no 25).

Os números de JEP vieram do índice do OpenJDK (`openjdk.org/jeps/0` e as páginas dos JDKs 21, 24 e 25)
e dos resumos de mudanças da linguagem da Oracle, pela busca na web. O `openjdk.org` e o
`docs.oracle.com` não resolvem a partir do contêiner da sessão.

**Finais × *preview*, executado nos JDKs 25 e 27 sem `--enable-preview`:**

| Recurso | JDK 25 | JDK 27 |
| --- | --- | --- |
| *Stream Gatherers* | final | final |
| *Flexible constructor bodies* | final | final |
| *Module import* | final | final |
| `main` de instância, `IO.println` | final | final |
| `ScopedValue` | final | final |
| Variáveis sem nome (`_`) | final | final |
| Padrões de tipo primitivo | *preview* (`primitive patterns are a preview feature`) | *preview* |
| `StructuredTaskScope` | *preview* | *preview* |
| `StableValue` | *preview* | não existe mais na API |

Conclusão: dos recursos que o plano pediu para conferir, *Gatherers*, *flexible constructor bodies* e
*module import* são finais e podem ser ensinados; padrões primitivos ficam como *callout* de *preview*.

**JVM, executado no JDK 25:**
- a AOT cache funciona: `-XX:AOTCacheOutput=app.aot` criou um cache de 9,3 MB num treino, e
  `-XX:AOTCache=app.aot -Xlog:aot` mostra `Opened AOT cache app.aot`;
- `UseCompactObjectHeaders` é flag de produto (`{product}` no `-XX:+PrintFlagsFinal`) e liga sem
  `UnlockExperimentalVMOptions`, apesar de o guia de migração da Oracle ainda chamá-la de
  experimental;
- o padrão é G1 com `MaxRAMPercentage = 25`.

**Bibliotecas** (última versão estável no Maven Central e licença lida do POM):

| Biblioteca | Versão | Licença |
| --- | --- | --- |
| JUnit Jupiter | 6.1.3 | EPL 2.0 |
| AssertJ | 3.27.7 (a 4.0.0-M1 é *milestone*) | Apache 2.0 |
| ArchUnit | 1.5.1 | Apache 2.0 |
| EqualsVerifier | 4.5.2 | Apache 2.0 |
| jqwik (testes por propriedade) | 1.10.2 | EPL 2.0 |
| JMH | 1.37 | GPLv2 com Classpath Exception (POM pai) |
| jcstress | 0.16 | GPLv2 com Classpath Exception |
| async-profiler | 4.6 | Apache 2.0 (POM e repositório) |

**URLs das fontes.** O repositório do JMH no GitHub foi aberto e confere. Os domínios
`docs.oracle.com`, `openjdk.org` e `www.oreilly.com` não resolvem a partir do contêiner; as URLs foram
conferidas pela busca na web, que devolveu cada página com o título esperado. O guia de GC existe na
Release 25, e a fonte passou a apontar para ele (o plano apontava para a 21).

**Esqueleto criado:**
- `course.yaml` como no plano (com a URL do guia de GC 25);
- 11 stubs válidos;
- o stub do marco 11 já tem uma seção `## Capstone` mínima, porque `capstones.yaml` exige essa seção
  no último marco desde a entrada do `pix-core`;
- `PROJETO.md` com contratos, pré-requisitos e as tabelas de versões e de recurso → versão;
- `GLOSSARIO.md` mínimo, com 4 verbetes;
- `pix-core` em `capstones.yaml`, com `depends_on: []`;
- `kotlin-backend/01` e `/03` em `bridges-planned.yaml`. A ponte `design-de-codigo/02` já existia lá.

**Testes ajustados:** o golden de cobertura do glossário (a trilha entra com 4/4), a lista de marcos
sem hands-on (os 11 stubs, que saem dela bloco a bloco) e o `capstone.spec.js` (22 componentes).

**Pendências do plano:**
- O marco 11 cita dois desafios do banco, `cache-lru-ttl` e `transferencia-sem-deadlock`, que **não
  existem** em `content/desafios` (o plano os atribui a um adendo que não está no repositório). Na
  Fase 3, ou eles são criados com testes de referência em Java (como o `rate-limiter-concorrente`),
  ou o marco usa o `rate-limiter-concorrente`, que já tem a versão Java.
- O "adendo de sinais, Bloco 4", citado nos critérios de aceite para a jornada `entrevista-senior`,
  também não está no repositório; a jornada será atualizada pelo objetivo da trilha, como na
  `go-fintech`.
