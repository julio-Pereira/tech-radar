# `fin-leadkit` — projeto guia da trilha `lideranca-tecnica`

> Os 13 marcos desta trilha têm conteúdo completo. Este `PROJETO.md` é a especificação do
> `fin-leadkit` (fechada em `PLANO-trilha-lideranca-tecnica.md` §7) — como em toda trilha do
> `fin-platform`, a implementação real (CLI, modelos, *fixtures* do Time Pix, casos) é o projeto
> que **você** constrói no seu próprio repositório enquanto lê a trilha, não código que existe
> neste.

Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
constrói enquanto lê a trilha. O `fin-leadkit` é o **kit de liderança** do `fin-platform`: uma
CLI e um conjunto de modelos, dados sintéticos e casos que tornam verificável o que normalmente
é só narrativa.

## O que você vai construir

Seis partes: `leadkit/` (CLI em Go), `lint/` (regras de estrutura por tipo de artefato),
`modelos/` (previsão Monte Carlo, fluxo, DORA, fator-ônibus, caminho crítico, calibração,
equidade de plantão, WSJF, taxa de ação de *post-mortem*), `fixtures/` (o **Time Pix**
sintético: 12 meses de tarefas, *deploys*, incidentes, *commits*, plantões e decisões),
`modelos-de-doc/` (ADR, RFC, estratégia, *post-mortem*, registro de riscos, RACI/DACI, registro
de exceção, relatório de status, rubrica de entrevista, plano de mentoria) e `casos/` (casos
situacionais com rubrica e gabarito). O **dossiê** (`dossie/`) é um diretório **ignorado pelo
Git** para o seu uso real.

## Contratos com os vizinhos (todos simuláveis com stub)

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Registro de ADRs e RFCs do `fin-platform` (arquivos) | trilhas arquitetura-de-software/solucoes |
| consome | Métricas DORA/SLO (CSV) e incidentes (CSV) | `fin-pipeline`, `fin-obs` |
| consome | Revisão arquitetural do `fin-platform` (riscos priorizados) | `arquitetura-de-solucoes/09` |
| serve | `leadkit lint` como *gate* de PR para docs de decisão | `fin-pipeline` |
| serve | Relatórios de previsão e de saúde do fluxo | `fin-devplatform` |
| serve | Dossiê e plano de 90 dias | o próprio leitor |

**O que este projeto não é.** Não é sistema de RH, não monitora desempenho individual, não
guarda dado pessoal real e não substitui a conversa — mede **fluxo, sistema e artefatos**,
nunca pessoas. Os casos de pessoas (avaliação, plano de melhoria, promoção) são **sintéticos**,
com personagens fictícios.

**Salvaguarda ética (inegociável).** As métricas do `leadkit` são do **sistema** (time, fluxo,
plantão). A trilha ensina por que métricas por pessoa (linhas, *commits*, tickets) são
perigosas e o `fin-leadkit` **não** as calcula; o modelo de fator-ônibus trabalha por **área do
código**, não por pessoa nomeada. A avaliação de desempenho que a trilha ensina usa **evidência
de resultado e de comportamento observado**, nunca telemetria de atividade.

**Pré-requisitos.** Go (toolchain atual); `git`; `make`. **Não precisa:** nuvem, ferramenta
paga, dado real. Confirmar versões na Fase 0 (ainda não executada).

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Mapa de escopo e matriz de arquétipos (artefato) | `leadkit lint escopo` exige 3 sistemas, 3 partes interessadas e "o que eu não faço" |
| 02 | `modelos/fluxo` e `modelos/dora` sobre o Time Pix | Cycle time, WIP, throughput e DORA reproduzem os valores esperados do gabarito |
| 03 | Estratégia técnica do `fin-platform` (artefato) | `lint estrategia` reprova "lista de metas": exige diagnóstico, política guia e ações coordenadas com dono e critério |
| 04 | `modelos/previsao` (Monte Carlo) e plano de entrega | Percentis monotônicos; reduzir escopo antecipa a data; semente fixa reproduz |
| 05 | `modelos/caminhocritico`, registro de riscos, RACI, proposta de divisão de time | CPM correto no grafo-gabarito; RACI com um único "A"; risco sem dono reprovado; divisão sem fronteira/interface reprovada |
| 06 | `modelos/calibracao` + registro de decisões | Brier score reproduz o gabarito; decisão sem gatilho de reversão reprovada |
| 07 | Plano de mentoria, pauta de 1:1 e `modelos/fatoronibus` por área | Concentração por área detectada no repositório sintético; 1:1 sem compromissos datados reprovado |
| 08 | RFC/one-pager lintados + custo de reunião | `lint rfc` reprova sem alternativas; um doc ruim passa no *linter* (demonstração) |
| 09 | Rubrica de entrevista, `modelos/concordancia`, avaliação por evidência e plano de melhoria | Kappa reproduz o gabarito; avaliação sem evidência datada reprovada; nota por evidência invariante à ordem |
| 10 | `lint postmortem`, `modelos/plantao`, taxa de ação concluída | Gini de plantão reproduz; ação sem dono/prazo reprovada; *postmortem* com linguagem de culpa sinalizado |
| 11 | `lint excecao`/`risco-aceito` com relógio falso | Exceção vencida sinalizada; risco aceito sem controle compensatório reprovado |
| 12 | `modelos/wsjf` e custo de atraso | Ordenação reproduz o gabarito; mudança de custo de atraso muda a ordem como previsto |
| 13 | Dossiê (modelo) + `make dossie` + plano de 90 dias | Todos os artefatos presentes e lintados; narrativa de impacto com evidência |

## Definição de pronto (capstone)

- [ ] `leadkit lint` valida os artefatos do capstone (estratégia, RFC, ADRs, riscos, RACI,
      *post-mortem*, exceção) e **reprova** cada violação plantada
- [ ] Os modelos reproduzem os gabaritos do Time Pix com semente fixa; nenhum usa dado pessoal
      real
- [ ] A estratégia técnica do `fin-platform` tem diagnóstico, política guia, ações coordenadas,
      **o que não faremos** e critério de revisão
- [ ] O plano de entrega traz previsão em **faixas de confiança**, caminho crítico e riscos com
      dono/gatilho
- [ ] Há um registro de decisões com **gatilho de reversão** e previsão calibrável
- [ ] Um *post-mortem* de incidente simulado tem linha do tempo, fatores contribuintes e ações
      verificadas
- [ ] A exceção/risco aceito do cenário regulado tem dono, prazo e controle compensatório
- [ ] O dossiê pessoal (privado) existe e está **fora** do Git (verificado por
      `make check-privacidade`)
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário (com os dados sintéticos), decida, registre e escreva um post-mortem de
uma página — inclusive quando acertar.

1. **São 02:10, o Pix está fora e você é a pessoa mais sênior no canal.** Quem comanda? Quem
   escreve? Quem fala com o negócio?
2. **O diretor pede uma data para a fase 3.** Você tem a previsão a 50% e a 85%. O que responde
   e como protege o time?
3. **Dois seniores discordam: construir ou comprar.** Como a decisão é tomada, registrada e
   revista?
4. **A auditoria acha uma exceção vencida há 40 dias.** O que o seu processo já tinha
   detectado?
5. **A pessoa que conhece o módulo de conciliação pediu demissão.** O que o fator-ônibus
   mostrava há seis meses?
6. **Uma dependência de outra equipe atrasa três semanas.** O caminho crítico mudou? O que se
   corta?
7. **O produto pede para pular testes para cumprir um prazo regulatório.** O que você negocia e
   o que não negocia?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 810 min de leitura viram ~27h porque o hands-on é
escrever os artefatos, rodar os modelos sobre os dados e decidir os casos antes de ver o
gabarito.

## Caminho Tech Lead → Staff/IC ou gestão técnica em fintech

Rascunho (plano §13), insumo direto da melhoria de plataforma "caminhos por papel"
(`aggregator/content/paths/`): sequência de **marcos existentes** que, com os 13 desta trilha,
formam o caminho.

| Etapa | Marcos | Por quê |
| --- | --- | --- |
| Fundação de desenho | `system-design/01, /02, /15`; `arquitetura-de-software/01, /02, /07` | Linguagem de requisitos, números, trade-offs e ADR |
| Arquitetura de sistemas | `arquitetura-de-solucoes/01, /03, /04, /06, /07, /08, /09` | Capacidades, legado, build×buy, governança, portfólio, influência, revisão |
| Operação e confiabilidade | `observabilidade/02, /12, /13, /15`; `entrega-continua-e-devops/01, /07, /09, /10` | SLO, plantão, incidente, DORA, mudança regulada, esteira |
| Plataforma | `engenharia-de-plataforma/08, /09` | Adoção, FinOps, métricas de valor |
| Segurança e risco | `seguranca-aplicacao/01, /13, /16` | Modelagem de ameaça, SDLC seguro, programa |
| **Liderança (esta trilha)** | `lideranca-tecnica/01–13` | Estratégia, execução, pessoas, operação, regulação, negócio, carreira |

**Degradação enquanto a melhoria "caminhos por papel" não existir:** esta tabela já é a lista de
marcos recomendados, lida diretamente aqui.

## Competências por marco

Insumo direto da melhoria de plataforma "competências por marco" (`#/skills`): cada marco já
está marcado com 1-2 ids do vocabulário fechado (`aggregator/content/competencies.yaml`).

| Marco | Competências |
| --- | --- |
| 01 — Papel, escopo e arquétipos | `estrategia`, `execucao` |
| 02 — Diagnóstico da organização técnica | `estrategia`, `dados` |
| 03 — Estratégia técnica | `estrategia` |
| 04 — Planejar e prever com dados | `execucao`, `dados` |
| 05 — Programas, riscos e dependências | `execucao`, `decisao` |
| 06 — Decidir bem sob incerteza | `decisao` |
| 07 — Mentoria, delegação e feedback | `pessoas` |
| 08 — Escrita, rituais e reuniões | `execucao` |
| 09 — Contratar, avaliar e desenvolver pessoas | `pessoas` |
| 10 — Liderar incidentes e operação | `operacao`, `confiabilidade` |
| 11 — Liderar em ambiente regulado | `regulacao` |
| 12 — Tecnologia e negócio | `negocio` |
| 13 — Carreira, impacto e capstone | `carreira` |

**Degradação enquanto `#/skills` não existir:** esta tabela já responde "o que este marco
desenvolve", lida diretamente aqui.
