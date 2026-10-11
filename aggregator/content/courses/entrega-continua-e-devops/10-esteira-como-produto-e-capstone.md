---
id: esteira-como-produto
title: "A esteira como produto e capstone"
summary: "Quando dez equipes copiam a pipeline uma da outra, a pipeline vira dívida; a saída é tratar a esteira como produto: um modelo versionado, um SLO e um custo conhecido. Capstone da trilha."
estimatedMinutes: 70
references:
  - title: "DORA — pesquisa e as métricas de entrega"
    url: https://dora.dev/
---

## Modelo de pipeline conforme: *workflows* reutilizáveis com os *gates* embutidos

Em vez de cada equipe copiar e colar a mesma pipeline — e divergir silenciosamente a cada cópia — um
**modelo de pipeline conforme** embute, de uma vez, os *gates* dos marcos 02–09 (permissões mínimas,
*pinning*, teste como *gate*, promoção por *digest*, política sobre o plano, segregação de funções)
como *workflows* **reutilizáveis e versionados**. Um serviço novo que usa o modelo nasce já
conforme, sem que ninguém precise lembrar de configurar cada verificação manualmente. A trilha
`arquitetura-de-solucoes` (planejada/existente, conforme o estado do repositório) **verifica** se um
serviço está no *paved road*; esta trilha é quem **constrói** o modelo que torna isso possível de
verificar.

## SLO da própria esteira

A esteira é um serviço que equipes internas dependem — e por isso merece **SLO próprio**:
disponibilidade da API de CI, duração p95 de um build típico, taxa de sucesso. Um **orçamento de
erro** (`observabilidade/12`) aplicado à esteira mesma: se ela está consumindo esse orçamento rápido
demais, alguma coisa estrutural precisa de atenção antes de adicionar mais *gates* que a tornariam
ainda mais lenta ou instável.

## Custo de CI: minutos, cache, tipo de *runner*

Minutos de execução de CI custam — multiplicado pelo número de execuções por dia, isso se torna um
item de orçamento real, não uma curiosidade. **Taxa de acerto de cache** é a métrica mais direta de
onde esse custo está sendo desperdiçado: uma chave de cache mal configurada (o problema do marco 02,
de volta) produz *cache miss* sistemático, pagando o custo completo de reconstruir dependências a
cada execução. *Runners* auto-hospedados reduzem custo por minuto mas introduzem um **risco de
segurança** que precisa ser pesado explicitamente — um *runner* próprio que executa código de PRs
externos é uma superfície de ataque diferente de um *runner* gerenciado isolado.

## Observabilidade da esteira

Duração por estágio (onde o tempo realmente vai, não uma impressão), motivos de falha agregados (que
*gate* falha mais, e por quê) — a mesma disciplina de observabilidade aplicada a serviços de produção
aplicada aqui à esteira que constrói e implanta esses serviços. Sem isso, "a pipeline está lenta" é
uma reclamação sem direção; com isso, é um relatório específico de qual estágio.

## *On-call* e *game day* da pipeline

A esteira merece o mesmo tratamento operacional que qualquer serviço crítico: alguém de plantão
quando ela cai (porque, quando a esteira está fora, nenhuma equipe consegue fazer deploy, o que é um
tipo diferente de incidente, mas ainda um incidente real), e *game days* periódicos que provocam
falhas de propósito na própria esteira, não só nos serviços que ela entrega.

## Consolidar o `fin-pipeline`, e revisar o `tech-radar` real

O exercício final desta trilha não é só consolidar o projeto guia — é aplicar a mesma disciplina ao
*workflow* **real** deste repositório (`tech-radar`): permissões por job, *pinning*, cache, separação
entre teste/build/deploy, proteção do ambiente de publicação. **Reconferir o `main`** antes de
revisar, porque o estado real do repositório pode já ter mudado desde que este marco foi escrito.

## Exemplo numa fintech

Um serviço novo nasce a partir do modelo de pipeline reutilizável e, **na primeira execução**, passa
em todos os *gates* das etapas 02 a 09 — sem que ninguém tenha copiado YAML de outro repositório, sem
que ninguém tenha esquecido de configurar permissões mínimas ou *pinning* por SHA, porque tudo isso
já veio embutido no modelo.

## Hands-on

**Tutorial.** Construa o modelo de pipeline reutilizável e um relatório de custo de CI sobre
histórico sintético.

**Desafio.** Calcule o SLO da esteira e aplique a disciplina completa desta trilha ao *workflow*
real do `tech-radar`.

**Invariantes testáveis**

1. Um serviço-alvo novo que usa o modelo de pipeline passa em **todos** os *gates* **sem edição
   manual** — a primeira execução já é conforme.
2. O SLO da esteira é **calculado** a partir de um histórico sintético (*fixture*), e um período
   deliberadamente ruim injetado **viola** esse SLO de forma detectável.
3. A taxa de acerto de cache é **reportada** e **cai** mensuravelmente quando a chave de cache é
   quebrada de propósito (teste que simula a quebra).
4. As verificações dos marcos 02–09 rodam a partir de um **único comando** (`make gates`) que
   **falha** se qualquer uma delas falhar — sem exceção silenciosa de nenhuma etapa.
5. O relatório de revisão do *workflow* real do `tech-radar` lista cada achado com **dono** e
   **prazo** — nunca uma lista de problemas sem responsável.

**Complemento.** Liste o que faltaria para este modelo de pipeline se tornar, de fato, um produto de
plataforma consumido por várias equipes — o insumo direto da trilha `engenharia-de-plataforma`.

**Checagem**

1. Por que um modelo de pipeline reutilizável e versionado evita a divergência silenciosa que
   copiar-colar produz entre equipes?
2. O que a esteira ganha, especificamente, ao ter SLO próprio em vez de ser tratada como
   infraestrutura "que simplesmente deveria funcionar"?
3. Por que *runners* auto-hospedados reduzem custo mas introduzem risco de segurança que precisa
   ser avaliado explicitamente?
4. Por que o Capstone exige aplicar a disciplina ao *workflow* real do `tech-radar`, e não só ao
   projeto guia sintético?

> **Reencontro — `observabilidade/12`; `observabilidade/16`; `kubernetes/13`; `kubernetes/14`;
> `seguranca-aplicacao/16`.** O orçamento de erro de `observabilidade/12` é aplicado aqui à própria
> esteira, não só aos serviços que ela entrega. O custo e cardinalidade de `observabilidade/16` é a
> mesma disciplina de custo visível aplicada a minutos de CI em vez de métricas. O GitOps de
> `kubernetes/13` é o destino que o modelo de pipeline conforme alimenta de forma consistente. A
> decisão de custo e multi-tenancy de `kubernetes/14` é onde a pergunta "vale a pena manter um
> *runner* próprio" já apareceu num contexto adjacente. E o programa de segurança de
> `seguranca-aplicacao/16` é onde a disciplina inteira desta trilha se conecta a um programa mais
> amplo de maturidade.

## Principais aprendizados

- Um modelo de pipeline reutilizável e versionado, com os *gates* embutidos, evita a divergência
  silenciosa que copiar-colar produz entre dez equipes diferentes.
- A esteira merece SLO próprio, porque equipes internas dependem dela — tratá-la como
  infraestrutura que "simplesmente deveria funcionar" é o mesmo erro de não medir confiabilidade de
  qualquer serviço crítico.
- Taxa de acerto de cache é a métrica mais direta de onde o custo de CI está sendo desperdiçado.
- *Runners* auto-hospedados trocam custo por minuto contra risco de segurança — uma troca que
  precisa ser avaliada explicitamente, não assumida como vantagem gratuita.
- A prova final desta trilha é aplicar a disciplina inteira a um *workflow* real, reconferido contra
  o estado atual do repositório — não só ao projeto guia sintético.

## Capstone

O `fin-pipeline` é o seu projeto pessoal — a especificação completa está em `PROJETO.md`, na raiz
desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `dora/` com as quatro métricas calculadas sobre histórico sintético, mapa de fluxo de valor e
      simulador de lote
- [ ] *Workflows* reutilizáveis com os estágios na ordem certa, cache correto, permissões mínimas e
      *pinning* por SHA
- [ ] Filtros de caminho, limite de tamanho de PR, simulador de fila de merge
- [ ] Suíte de *gates*: mutação, corrida, ordem aleatória, regressão de desempenho por relação
- [ ] Promoção por *digest* sem reconstruir, versão calculada, ambiente efêmero com *teardown*
- [ ] `infra/` com módulos Terraform locais, testes, política sobre o plano
- [ ] `release/` com decisor de canary por função e janela de congelamento
- [ ] `db/` com linter de migração e matriz de compatibilidade
- [ ] `evidencia/` com log encadeado e fluxo de *break-glass*
- [ ] Modelo de pipeline conforme + SLO da esteira + custo de CI + revisão do *workflow* real do
      `tech-radar`

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Nenhuma lógica de decisão vive em YAML: todo critério é função com teste
- [ ] Todo job declara `permissions` mínimas e toda *action* de terceiros está fixada por SHA;
      `actionlint` limpo
- [ ] A ordem dos estágios põe verificação rápida e barata antes da lenta e cara
- [ ] Uma mudança só em documentação não dispara a pipeline de serviço
- [ ] O artefato implantado em produção é **o mesmo** (*digest*) que foi testado; a promoção não
      reconstrói
- [ ] A infraestrutura Terraform é idempotente, detecta *drift* e passa na política sobre o plano; o
      estado não é versionado
- [ ] A decisão de promover/reverter é uma função das séries de métricas/SLO, com teste de ruído e
      de regressão
- [ ] Toda migração passa no linter e é compatível com a versão anterior do app
- [ ] Todo deploy em produção gera evidência completa; o log encadeado detecta adulteração
- [ ] Existe caminho de emergência (*break-glass*) com revisão retroativa e prazo
- [ ] A esteira tem SLO próprio, custo de CI medido e métricas DORA calculadas — nunca a velocidade
      sem a estabilidade
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **qual *gate*
da sua esteira só passa porque o ambiente de teste é mais bem-comportado que produção — e que sinal,
medido em produção, te diria isso?**
