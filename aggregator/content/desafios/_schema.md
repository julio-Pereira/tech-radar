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
