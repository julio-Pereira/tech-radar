# Projeto guia — fin-pipeline

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
> constrói enquanto lê a trilha. O `fin-pipeline` é a **esteira de entrega do `fin-platform`**: dois
> serviços-alvo pequenos, a pipeline que os constrói, testa, promove e registra, a infraestrutura
> descrita em Terraform e os controles que um auditor pediria — tudo verificável sem nuvem.

## O que você vai construir

Oito pastas: `alvos/` (um serviço Java e um Go, mínimos, com testes), `.github/workflows/`
(*workflows* reutilizáveis), `ci/` (os **scripts de *gate*** e suas funções com testes: permissões,
*pinning*, filtros de caminho, ordem dos estágios, regras de promoção), `infra/` (módulos Terraform
locais), `release/` (simulador de canary e regras de rollback), `db/` (migrações + linter),
`evidencia/` (gerador de evidência com log encadeado) e `dora/` (métricas a partir de um histórico
sintético).

**Contratos com os vizinhos** (todos simuláveis com stub):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Manifestos/*repo* de configuração para o qual o deploy aponta | GitOps, trilha kubernetes |
| consome | SLOs e *error budget* como critério de promoção | trilha observabilidade |
| consome | Requisitos de SBOM/proveniência como etapa da esteira | trilha seguranca-aplicacao |
| consome | Padrão de migração *expand/contract* | trilha dados-distribuidos |
| serve | Modelo de pipeline conforme (*workflows* reutilizáveis versionados) | trilha engenharia-de-plataforma (`fin-devplatform`) e arquitetura-de-solucoes, marco 06 |
| serve | Evidência de mudança por deploy | revisão arquitetural (arquitetura-de-solucoes, marco 09) |
| serve | Métricas DORA e SLO da própria esteira | trilha observabilidade |

**O que este projeto não é.** Não cria recurso em nuvem, não implanta em cluster real, não escolhe
fornecedor de CI e não reimplementa GitOps (usa o destino já descrito em `kubernetes/13`).

**Pré-requisitos.** Go (toolchain atual) e JDK 21+ para os alvos; `git`; `terraform` (ou `tofu`);
`actionlint`; um motor de política de código aberto (por ADR); `docker` opcional (banco efêmero e
ambiente de PR); conta GitHub com repositório pessoal **opcional**. **Não precisa:** conta em
nuvem, *runner* próprio, ferramenta paga. Confirmar versões e licenças na Fase 0.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `dora/` + mapa do fluxo de valor + simulador de lote | Valores exatos sobre massa conhecida; relatório recusa velocidade sem estabilidade; lote menor ⇒ menor *lead time* (relação, semente fixa) |
| 02 | *Workflows* reutilizáveis + `ci/` com checagens | `actionlint` limpo; todo job declara `permissions` mínimas; toda *action* fixada por SHA; chave de cache inclui o lockfile; verificação rápida antes da lenta |
| 03 | Filtros de caminho, limite de tamanho de PR, simulador de fila de merge | Mudança só em docs não dispara o build do serviço; com fila, a `main` nunca fica vermelha na simulação; *checks* exigidos = nomes dos jobs |
| 04 | Suíte de *gates*: mutação, corrida, ordem aleatória, regressão de desempenho | Mutante plantado derruba a suíte; regressão injetada reprova o *gate*, ruído não |
| 05 | Promoção por *digest* + versão calculada + ambiente efêmero | *Digest* em produção = *digest* testado; a promoção não reconstrói; ambiente efêmero some no *teardown* |
| 06 | `infra/` com módulos Terraform locais + testes + política sobre o plano | `fmt`/`validate` ok; segunda aplicação sem mudanças; *drift* detectado e corrigido; política nega o plano violador |
| 07 | `release/` com decisor de canary e janela de congelamento | Série boa promove; regressão injetada faz rollback em ≤ N passos; ruído não gera rollback (taxa limitada, sementes fixas) |
| 08 | `db/` com linter de migração e matriz de compatibilidade | DDL perigoso reprovado; versão N-1 do app passa contra o schema N; do zero = incremental |
| 09 | `evidencia/` com log encadeado e fluxo *break-glass* | Autor ≠ aprovador; todo deploy tem registro de 6 campos; adulteração detectada; *break-glass* sem revisão no prazo reprova o relatório |
| 10 | Modelo de pipeline conforme + SLO da esteira + custo de CI + revisão do *workflow* do `tech-radar` | Serviço gerado passa em **todos** os *gates* sem edição; SLO calculado de histórico; taxa de acerto de cache reportada |

### Definição de pronto (capstone)

- [ ] Nenhuma lógica de decisão vive em YAML: todo critério é função com teste
- [ ] Todo job declara `permissions` mínimas e toda *action* de terceiros está fixada por SHA;
      `actionlint` limpo
- [ ] A ordem dos estágios põe verificação rápida e barata antes da lenta e cara (verificado a
      partir de custos declarados)
- [ ] Uma mudança só em documentação não dispara a pipeline de serviço (teste do filtro)
- [ ] O artefato implantado em produção é **o mesmo** (*digest*) que foi testado; a promoção não
      reconstrói
- [ ] A infraestrutura Terraform é idempotente (segunda aplicação sem mudanças), detecta *drift* e
      passa na política sobre o plano; o estado não é versionado
- [ ] A decisão de promover/reverter é uma função das séries de métricas/SLO, com teste de ruído e
      de regressão
- [ ] Toda migração passa no linter e é compatível com a versão anterior do app
- [ ] Todo deploy em produção gera evidência com autor, aprovador (diferente do autor), checagens,
      *digest*, hora e classe de mudança; o log encadeado detecta adulteração
- [ ] Existe caminho de emergência (*break-glass*) com revisão retroativa e prazo
- [ ] A esteira tem SLO próprio, custo de CI medido e métricas DORA calculadas — nunca a velocidade
      sem a estabilidade
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **A `main` fica vermelha** por um merge. Quanto tempo até a reversão? O que a fila de merge teria
   evitado?
2. **Uma *action* de terceiros é comprometida** (simule trocando o conteúdo da versão). O *pinning*
   por SHA protegeu? O que o token podia fazer?
3. **Um deploy canary degrada a latência.** O decisor reverte sozinho? Em quantos passos? E se o
   ruído for só ruído?
4. **Alguém aprova a própria mudança** (ou força push). Que controle bloqueia, e que evidência fica?
5. **Um `terraform apply` manual** altera algo fora do código. Quem percebe, e como o *drift* é
   corrigido?
6. **Uma migração tira o schema da compatibilidade** com a versão anterior durante um deploy
   gradual. Qual *gate* pega?
7. **A pipeline fica 3× mais lenta.** Qual SLO dispara, e qual é o primeiro lugar para olhar?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 630 min de leitura viram ~21h porque o hands-on é
escrever o *gate*, **plantar a falha de propósito** (mutante, deriva, regressão, auto-aprovação) e
ver o controle agir.
