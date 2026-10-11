---
id: integracao-continua-de-verdade
title: "Integração contínua de verdade"
summary: "Integração contínua é uma prática — integrar no tronco todo dia, em lotes pequenos — não um servidor: quem tem ramo de duas semanas não faz CI, mesmo com pipeline."
estimatedMinutes: 60
references:
  - title: "Trunk Based Development"
    url: https://trunkbaseddevelopment.com/
---

## *Trunk-based*, ramos longos, *gitflow*: o critério é frequência e tamanho

Ter um servidor de CI rodando testes automaticamente não é a mesma coisa que **praticar** integração
contínua. A prática real é definida por **frequência de integração** (diariamente, idealmente várias
vezes ao dia) e **tamanho do lote** (pequeno) — um time com ramos de feature de duas semanas, mesmo
com testes automatizados rodando a cada push, não está fazendo integração contínua: está fazendo
integração **adiada e automatizada**. *Trunk-based development* é o padrão que maximiza frequência e
minimiza tamanho de lote por desenho; *gitflow* e ramos longos otimizam para outra coisa (isolamento
de release, controle de quando uma feature "entra") ao custo direto de integração menos frequente.

## PRs pequenos, e a latência de revisão

Um PR pequeno é revisado mais rápido — tanto porque há menos para ler quanto porque um revisor
consegue manter o contexto inteiro na cabeça sem precisar de várias sessões. A **latência de
revisão** (tempo entre abrir o PR e ele ser aprovado) é, na prática, um dos maiores componentes do
tempo de espera no mapa de fluxo de valor do marco 01 — e PRs pequenos atacam essa espera
diretamente, sem exigir nenhuma mudança de ferramenta.

## *Feature flags* para integrar trabalho incompleto

Uma funcionalidade grande não precisa esperar estar 100% completa para ser integrada ao tronco — uma
***feature flag*** (`system-design/14`) permite integrar o código no tronco principal, desligado por
padrão, e ativá-lo só quando estiver pronto. Isso separa **integração** (código no tronco,
testado contra tudo que já existe) de **ativação** (visível para usuários) — a mesma distinção entre
*deploy* e *release* que o marco 07 formaliza.

## Fila de merge: por que a `main` verde exige testar o resultado da fusão

Dois PRs podem, cada um isoladamente, passar todos os testes — e ainda assim, juntos, quebrar a
`main`, se tocarem partes do sistema que interagem de um jeito que nenhum dos dois testou isolado. Uma
**fila de merge** testa o resultado da **fusão** antes de aplicá-la definitivamente — não o ramo de
cada PR isoladamente — garantindo que a `main` só recebe um commit depois que a combinação específica
já foi verificada. Sem fila de merge, a probabilidade de a `main` ficar vermelha por uma combinação de
dois PRs aumenta com o número de PRs mesclados por período, mesmo que cada um individualmente estivesse
"verde".

## Proteção de ramo como código: *checks* obrigatórios = jobs existentes

A lista de verificações obrigatórias configurada na proteção de ramo deveria ser, **exatamente**, a
lista de jobs que realmente existem nos *workflows* atuais — nenhum *check* obrigatório "fantasma"
(apontando para um job renomeado ou removido, que trava todo PR para sempre, porque o check nunca
roda) e nenhum job importante **sem** ser obrigatório (que pode falhar silenciosamente sem bloquear
nada). Tratar essa lista como **código**, verificada contra os *workflows* reais, evita o *drift*
entre o que a proteção de ramo "pensa" que existe e o que de fato existe.

## *Monorepo* × *polyrepo*, e filtros de caminho

Num *monorepo*, uma mudança isolada em documentação não deveria disparar o build completo do
serviço — **filtros de caminho** decidem, a partir de quais arquivos mudaram, quais partes da
pipeline realmente precisam rodar. Isso vale independente da escolha entre *monorepo* e *polyrepo*;
é mais crítico em *monorepo*, onde a tentação de rodar tudo sempre, "para garantir", desperdiça tempo
de CI de forma crescente conforme o repositório cresce.

## "Reverter primeiro, investigar depois"

Quando a `main` quebra, a prioridade número um do time é **reverter** a mudança que quebrou — não
investigar a causa com a `main` ainda vermelha, bloqueando todo mundo. Investigar acontece depois,
com calma, sobre a mudança revertida (isolada, sem pressão de bloquear o time inteiro). Build quebrado
é uma prioridade que interrompe trabalho em progresso, não um item de backlog para "ver quando der".

## Mensagens de commit estruturadas: o que dá para automatizar

Mensagens de commit que seguem uma convenção estruturada (tipo de mudança: `feat`, `fix`, `chore`,
por exemplo) permitem **automatizar** cálculo de versão e geração de *changelog* — o marco 05 usa
exatamente isso. A convenção não é um exercício de estilo; é o que torna possível derivar informação
útil do histórico de commits sem intervenção manual.

## Exemplo numa fintech

Dois PRs: um adiciona um campo obrigatório numa tabela, o outro adiciona um relatório que consulta
essa mesma tabela sem esperar o campo novo. Cada um, isoladamente, passa todos os testes — o primeiro
porque os testes dele não tocam o relatório, o segundo porque foi escrito contra o schema **antes**
da mudança do primeiro. Juntos, mesclados em sequência sem uma fila que testasse a combinação, o
relatório quebra em produção, porque nenhum teste isolado jamais exercitou os dois PRs ao mesmo
tempo.

## Hands-on

**Tutorial.** Implemente filtros de caminho e limite de tamanho de PR como funções testáveis.

**Desafio.** Construa um simulador de fila de merge.

**Invariantes testáveis**

1. Uma mudança só em `docs/` **não** dispara o build do serviço — verificado como função pura sobre
   uma lista de arquivos alterados, não sobre a execução real da pipeline.
2. O *gate* de tamanho de PR **reprova** PRs acima do limite configurado — testado com massa de
   dados conhecida (número de arquivos/linhas).
3. No simulador, com **semente fixa**: sem fila de merge, a `main` fica vermelha **ao menos uma vez**
   em N tentativas simuladas de dois PRs conflitantes; com fila de merge, **nunca** — a asserção
   rígida está do lado com fila, a demonstração do lado sem.
4. A configuração de proteção de ramo exige **exatamente** os nomes de jobs que existem nos
   *workflows* reais — **zero** *drift* entre a lista configurada e a lista real.
5. O simulador de duração de ramo mostra, com semente fixa, que **ramo mais longo implica mais
   conflitos** de merge — testado como relação entre duração e contagem de conflitos, não como
   número absoluto.

**Complemento.** Calcule, a partir do histórico real do seu próprio trabalho, há quanto tempo em
média um ramo de feature vive antes de ser mesclado.

**Checagem**

1. Por que ter um servidor de CI rodando testes não é a mesma coisa que praticar integração
   contínua?
2. Como *feature flags* permitem integrar trabalho incompleto sem expô-lo a usuários?
3. Por que uma fila de merge testa a **fusão**, e não cada ramo isoladamente — e o que isso previne
   que testes individuais não previnem?
4. Por que a prioridade, quando a `main` quebra, é reverter primeiro e investigar depois?

> **Reencontro — `system-design/14`; `spring-boot/11`; `seguranca-aplicacao/13`; `kubernetes/13`.**
> As *feature flags* de `system-design/14` são o mecanismo exato que este marco usa para integrar
> trabalho incompleto sem ativá-lo. Os testes de integração reais de `spring-boot/11` são o que uma
> fila de merge precisa executar sobre o resultado da fusão, não só sobre o ramo isolado. A ordem dos
> *gates* de segurança de `seguranca-aplicacao/13` depende da mesma disciplina de filtro de caminho
> para não rodar verificações caras em mudanças que não as exigem. E o GitOps de `kubernetes/13` só
> recebe uma `main` confiável se a integração contínua descrita aqui realmente acontecer antes dela.

## Principais aprendizados

- Integração contínua é definida por frequência de integração e tamanho de lote, não pela existência
  de um servidor de CI — ramo de duas semanas com testes automatizados não é CI.
- *Feature flags* separam integração (código no tronco) de ativação (visível a usuários), permitindo
  integrar trabalho incompleto com segurança.
- Uma fila de merge testa o resultado da fusão de PRs, não cada um isolado — e é isso que previne a
  `main` quebrar por uma combinação que nenhum teste individual jamais exercitou.
- Proteção de ramo tratada como código, sincronizada com os jobs reais dos *workflows*, evita *checks*
  fantasma que travam todo PR para sempre.
- Quando a `main` quebra, reverter é a prioridade imediata; investigar a causa acontece depois, sem
  pressão de bloquear o time inteiro.
