# Banco de desafios — formato

Um desafio é prática recorrente sobre o que as trilhas ensinam. **Não é marco:** não conta progresso
de trilha nem soma horas. Cada desafio é um arquivo `content/desafios/<id>.md` (o `id` é igual ao
nome do arquivo), com frontmatter YAML e corpo em markdown. O compilador
(`aggregator/internal/course/desafios.go`) valida tudo e gera `web/data/desafios.json`. Um desafio
inválido é registrado em WARN e fica fora do site; o `TestDesafiosRealContent` reprova o CI.

Arquivos que começam com `_` (como este) são documentação e não são compilados.

## Frontmatter

```yaml
id: pix-10k-tps                  # kebab-case, igual ao nome do arquivo
titulo: "Iniciação de pagamento Pix a {tps} TPS"
tipo: system-design              # system-design | lld | estimativa | incidente | comportamental
nivel: senior                    # senior | staff
duracaoMin: 45
prerequisitos:                   # marcos no formato das pontes: trilha/NN
  - spring-boot/06
  - system-design/09
conceitos: [idempotencia, outbox] # ids de content/conceitos.yaml
parametros:                       # sorteados a cada rodada
  tps:  { min: 2000, max: 20000, passo: 1000 }   # faixa numérica (min > 0)
  anos: { valores: [5, 10] }                      # lista de números
  rto:  { valores: ["15min", "1h"] }              # lista de textos (só para texto, nunca em fórmula)
esclarecimentos:                  # perguntas que o leitor pode "fazer"; só as feitas são reveladas
  - { pergunta: "...", revela: "...", chave: true }   # chave: pontua se for feita
estimativas:
  - id: storage-total
    enunciado: "Armazenamento total em {anos} anos"
    unidade: TB                   # opcional, só exibição
    formula: "tps * 86400 * 365 * anos * payloadKb / 1e9"
    tolerancia: 0.25              # opcional; padrão 0.25 (±25%)
decisoes:                         # múltipla escolha + explicação
  - pergunta: "..."
    opcoes: ["...", "...", "...", "..."]   # ≥3
    correta: 1                    # índice no arquivo; o build reposiciona (ver abaixo)
    explicacao: "..."
reviravolta:                      # opcional; aparece no modo simulado
  momentoPct: 60                  # 10 a 90
  texto: "..."
  rubrica: ["...", "..."]
entregavel:
  secoesObrigatorias: [Requisitos, Estimativas, Arquitetura, Gargalos, ModosDeFalha, TradeOffs]
rubrica: ["...", "...", "...", "...", "..."]   # ≥5 itens, autoavaliação
```

Campos desconhecidos reprovam o build (erro de digitação não passa em silêncio).

## Corpo

Três seções `##`, nesta ordem, e nada antes da primeira:

- `## Enunciado` (obrigatória): propositalmente vago no modo simulado; os esclarecimentos completam.
- `## Dicas` (opcional): só aparece no modo estudo.
- `## Gabarito comentado` (obrigatória): mostrado por último, depois da correção.

## Placeholders

`{nome}` em qualquer texto que o leitor vê (título, corpo, esclarecimentos, enunciados, decisões,
reviravolta, rubrica) é trocado pelo valor sorteado do parâmetro `nome`. Placeholder sem parâmetro
reprova o build. Só casa identificador entre chaves: `{"a": 1}` num exemplo de JSON não é placeholder.

## Fórmulas

Nunca são avaliadas como código (nada de `eval` ou `new Function`, no build ou no navegador). O
compilador faz o parse para uma AST de gramática fechada:

- números (`1e9` vale), parâmetros **numéricos** do próprio desafio;
- `+ - * / ^` (`^` é potência, associativa à direita), parênteses, menos unário;
- funções `ceil floor round log2` (1 argumento) e `min max` (2 ou mais).

Qualquer outra coisa reprova o build. Cada fórmula é avaliada em **todas as combinações dos
extremos** dos parâmetros (min e max de cada um); resultado não finito (NaN, Inf) ou não positivo
reprova o build. O navegador recebe a AST e a interpreta.

## Correção, em quatro camadas

| Camada | Correção | Rótulo |
| --- | --- | --- |
| Estimativas | numérica, com tolerância | verificado |
| Decisões | múltipla escolha | verificado |
| Entregável | seções obrigatórias presentes e não vazias | verificado (estrutura) |
| Rubrica | checklist do leitor | autoavaliado |

A nota mostra **verificado** e **autoavaliado** separados, nunca somados.

## Mínimos por tipo

| Tipo | Esclarecimentos | Estimativas | Decisões | Outros |
| --- | --- | --- | --- | --- |
| `system-design` | ≥4, ≥2 chave | ≥2 | ≥3 | |
| `incidente` | ≥4, ≥2 chave | ≥2 | ≥3 | |
| `estimativa` | — | ≥2 | ≥3 | |
| `lld` | — | — | ≥3 | testes em `<id>/java` (pom.xml + `src/test/**/*Test.java`) ou `<id>/go` (`*_test.go`) |
| `comportamental` | — | — | — | `secoesObrigatorias: [Situação, Tarefa, Ação, Resultado, Aprendizado]` |

Todo tipo: `prerequisitos` não vazio, `rubrica` com ≥5 itens.

## Viés das decisões

No banco inteiro, a correta pode ser a opção mais longa em no máximo 40% das decisões (o mesmo
limite dos quizzes das trilhas: escreva distratores de tamanho comparável). A posição não precisa de
cuidado: o build coloca a correta da k-ésima decisão do banco no índice `k mod n` e embaralha as
outras de forma determinística, então nenhum índice concentra respostas.

## Comportamental e privacidade

As respostas de um desafio `comportamental` ficam só no navegador do leitor (ou no dossiê privado da
trilha `lideranca-tecnica`, fora do Git). Nada vai para servidor nem para o repositório: são dados
pessoais e de terceiros (LGPD).

## Código de um desafio LLD

```text
content/desafios/<id>/
  go/          esqueleto + testes entregues ao leitor (go.mod próprio)
  java/        esqueleto + testes (pom.xml, JUnit 5)
  referencia/  solução de referência: só os arquivos de código, sem os testes
    go/
    java/
```

O site mostra o comando de cada pasta no modo estudo. O job `desafios-lld` do CI roda
`tools/desafios/check-lld.sh`, que prova duas coisas para cada linguagem: os testes **falham** no
esqueleto e **passam** quando os arquivos da referência substituem os do esqueleto (Go com `-race`,
Java com Maven e Temurin 21). Um esqueleto que já passa, ou uma referência que falha, reprova o CI.
Saída do Maven (`target/`) não entra no Git.

## A rodada no navegador

Tudo fica no `localStorage`, na chave `tr:desafios:v1`; nada vai para servidor:

```json
{
  "rodadas": {
    "<id>": [{ "seed": 123, "at": "2026-11-06T10:00:00Z", "verificadoPct": 82, "autoPct": 60,
               "partes": { "estimativas": { "acertos": 1, "total": 2 },
                           "decisoes":    { "acertos": 3, "total": 3 },
                           "entregavel":  { "acertos": 5, "total": 6 } } }]
  },
  "rascunhos": { "<id>|<seed>": "texto do entregável" },
  "cadencia": 2
}
```

A semente (`seed`) refaz a mesma rodada: os mesmos parâmetros e, portanto, as mesmas respostas
esperadas. Rodadas gravadas antes de existir `partes` continuam valendo (ver o radar abaixo).

## Agenda

Um desafio só entra na fila de `#/revisar` quando **todos** os marcos de pré-requisito estão
concluídos. O intervalo até a próxima rodada vem da nota **verificada** da última:

| Última rodada | Volta em |
| --- | --- |
| < 60% | 2 dias |
| 60% a 80% | 7 dias |
| > 80% | 21 dias |
| > 80% duas vezes seguidas | 45 dias |

A fila põe os vencidos primeiro, depois os nunca feitos, alternando o tipo. A cadência (padrão: 2
por semana, de segunda a domingo) decide o card "Desafio da semana" em `#/learn`.

## Na jornada e no radar de prontidão

A jornada `content/paths/entrevista-senior.yaml` termina com um passo especial:

```yaml
  - desafios: "*"            # o banco inteiro; único valor aceito
    group: "Prática contínua"
    why: "..."
```

O passo não aceita `ref` nem `whole`, aparece no máximo uma vez por caminho e reprova o build se o
banco estiver vazio. Cada desafio continua liberado pelos próprios pré-requisitos. O passo fica
concluído quando todo desafio tem ao menos uma rodada.

O **radar de prontidão** da jornada tem cinco eixos e usa **só a parte verificada** da última
rodada de cada desafio. A rubrica autoavaliada nunca entra. Cada eixo soma itens (acertos sobre
total), não médias de porcentagens:

| Tipo do desafio | Estimativas | Decisões | Entregável |
| --- | --- | --- | --- |
| `system-design`, `incidente` | Estimativa | HLD | HLD |
| `estimativa` | Estimativa | Estimativa | Estimativa |
| `lld` | LLD | LLD | LLD |
| `comportamental` | Comportamental | Comportamental | Comportamental |

O eixo **Domínio** recebe, além disso, as decisões de todo desafio com `dominio: true` no JSON.
O build liga esse campo quando algum pré-requisito está numa trilha com
`category: "Domínio financeiro"`; não existe campo no frontmatter. Rodada antiga, sem `partes`,
conta uma vez, com o `verificadoPct` dela, só no eixo principal do tipo.

## Checklist de um desafio novo

1. Escreva `content/desafios/<id>.md` com este formato; o tipo define os mínimos.
2. Confira que nenhum enunciado de estimativa revela um valor que só uma pergunta-chave deveria
   revelar. Se uma estimativa depende do valor, a pergunta que o revela precisa ser chave.
3. Escreva distratores de tamanho comparável à correta (limite de 40% para a mais longa).
4. Para LLD, crie `go/` ou `java/` com testes que falham e `referencia/` com a solução.
5. Rode `go test ./internal/course/` (inclui `TestDesafiosRealContent`) e, em `web/`,
   `npx playwright test tests/desafios.spec.js`: o último teste abre todo desafio do banco nos dois
   modos e roda o axe.
6. Ajuste o número de desafios esperado no teste de catálogo de `desafios.spec.js`.
