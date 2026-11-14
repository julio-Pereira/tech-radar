# Auditoria — trilha `ia-na-engenharia`

Registro das conferências, das medições e das decisões de cada fase. O plano é o
`PLANO-trilha-ia-na-engenharia` (14 nov 2026), que substitui o Bloco 5 do adendo de sinais de mercado:
o Julio escolheu a opção (a), trilha curta própria.

## 1. Fase 0 — conferências, laboratório e esqueleto

### Mudanças em relação ao plano

- **Categoria.** O plano propõe `"Engenharia"` ou a mais próxima. A categoria é texto livre no compilador,
  mas nenhuma trilha usa `"Engenharia"`; a trilha usa **`"DevOps"`**, a mais próxima, ao lado de
  `entrega-continua-e-devops`.
- **Posição no catálogo.** O plano propõe "depois de `aws-para-backend` e antes de `kotlin-backend`". O
  índice do catálogo é ordenado pelo compilador (`internal/course/compile.go`), não por um arquivo de
  ordem: não há onde declarar a posição. A jornada `entrevista-senior` e as pontes dão o caminho.
- **URL do Spec Kit.** O plano cita `github.github.com/spec-kit`. A documentação fica em
  **`github.github.io/spec-kit/`** (são 41 links no `README.md` da v1.4.0). O `course.yaml` usa a certa.
- **URL da especificação MCP.** O `course.yaml` aponta para a revisão (`/specification/2026-07-28`), e não
  para a raiz, que muda a cada revisão.
- **`reviewEvery: 3m`.** O campo aceita `3m`, `6m`, `12m` e `24m` (`internal/course/freshness.go`): a
  trilha usa `3m`, sem exceção a registrar.
- **Comandos do Spec Kit.** O plano lista "princípios, especificar, esclarecer, planejar, tarefas, analisar,
  implementar". Na v1.4.0, os comandos são nove: `constitution`, `specify`, `clarify`, `plan`, `checklist`,
  `tasks`, `analyze`, `implement` e **`converge`** (novo, repete implementar e convergir até `Converged`). O
  `taskstoissues` foi descontinuado.

### Conferências (fontes oficiais, 14 nov 2026)

Os quatro repositórios foram clonados na *tag* indicada e lidos no código e na documentação:
`github/spec-kit@v1.4.0`, `modelcontextprotocol/modelcontextprotocol@2026-07-28`,
`modelcontextprotocol/go-sdk@v1.8.0` e `modelcontextprotocol/java-sdk@v2.2.0`. O `agentsmd/agents.md`, pela
`main`.

| Afirmação do plano | Conferido | Fonte |
| --- | --- | --- |
| Spec Kit na série 1.x, a 1.0.0 em ago 2026 | **confere**: 1.0.0 em 21 ago 2026; a atual é a 1.4.0, de 10 nov 2026 | `CHANGELOG.md` |
| mudanças incompatíveis de CLI nas versões anteriores, fixar por *tag* | **confere**: `--ai` trocado por `--integration`, `--no-git` e `--skills` descontinuados; a documentação recomenda instalar "pinned to a release tag" | `CHANGELOG.md`, `docs/installation.md` |
| licença do Spec Kit | MIT | `LICENSE` |
| revisão 2026-07-28 do MCP com núcleo sem estado | **confere**: sem `initialize` nem `Mcp-Session-Id`; versão e capacidades em `_meta` de cada requisição; `server/discover` obrigatório | `changelog.mdx` da revisão |
| registro dinâmico de cliente em desuso, validação de emissor | **confere**: RFC 7591 descontinuado em favor do *Client ID Metadata Document*; o cliente **deve** validar o `iss` (RFC 9207) | `changelog.mdx` |
| autorização sobre OAuth 2.1 com audiência restrita | **confere**: RFC 8707, e *token passthrough* proibido | `basic/authorization/security-considerations.mdx` |
| SDK oficial em Go | v1.8.0 (4 set 2026), Go 1.25; a v1.7.0+ suporta a 2026-07-28 | `README.md`, `go.mod`, Go proxy |
| alternativa em Java | v2.2.0, MIT; integração Spring pelo Spring AI | `README.md`, `LICENSE` |
| licença do projeto MCP | transição de MIT para **Apache-2.0** | `LICENSE` da especificação e do SDK de Go |
| arquivo de instruções do repositório | `AGENTS.md`, formato aberto, "um README para agentes" | `agentsmd/agents.md` |
| lista OWASP para LLM | edição **2025** (LLM01 *Prompt Injection*, LLM06 *Excessive Agency*); existe também o *Top 10 for Agentic Applications for 2026* | genai.owasp.org, pela busca |
| relatório DORA sobre IA | **2025 State of AI-assisted Software Development**: adoção de IA associada a mais *throughput* e a mais instabilidade | dora.dev e o anúncio do Google Cloud, pela busca |

**Para a Fase 3:** a lista completa da OWASP (as dez da edição 2025 e o *Agentic Top 10*) e os números do
DORA vão ser lidos na página, citados com link e data, e só os que o texto usar.

### Laboratório

**Agente roteirizado** (`agente-roteirizado/`, Go, sem dependência externa), com 5 *fixtures*:

- `patch-bom.json` e `patch-assercao-enfraquecida.json`: o mesmo patch, com a asserção certa e trocada por
  `assertNotNull`;
- `ferramenta-leitura.json`: duas chamadas de ferramenta de leitura;
- `conteudo-injetado.json` e `conteudo-limpo.json`: a mesma issue, com e sem instrução escondida.

| Teste | Resultado |
| --- | --- |
| toda *fixture* carrega, e os cinco tipos de ação (patch, ferramenta, ler, comando, rede) aparecem | passou |
| 100 rodadas da mesma *fixture* emitem a mesma sequência | passou |
| com o conteúdo injetado, o roteiro **tenta** a saída de rede; com o limpo, não | passou |
| um executor que nega a rede deixa a negação no registro, e o roteiro segue | passou: 4 passos, 1 negado |
| tipo de ação desconhecido é recusado na carga | passou |
| **mutação:** ignorar a condição de injeção | **pega**: `TestInjecaoMudaOQueOAgenteTenta` falhou |

**Spec Kit 1.4.0:** instalado do PyPI (`specify-cli==1.4.0`) num ambiente isolado; `specify version`
respondeu `1.4.0`, e `specify init --integration copilot --ignore-agent-tools` criou o `.specify/` (modelos de
especificação, plano, tarefas, *checklist* e constituição) e as nove *skills* em `.github/skills/`, sem agente
nem rede além do PyPI.

### Esqueleto

- `course.yaml` com 7 marcos, 430 minutos e 14 horas, `level: advanced`, categoria `DevOps`;
- `PROJETO.md` com as ADRs do agente roteirizado e do SDK de MCP e a tabela "ferramenta/protocolo → versão";
- `GLOSSARIO.md` mínimo, com 4 verbetes;
- 7 *stubs* válidos; o 07 já tem `## Capstone`;
- `fin-assist` em `capstones.yaml`, com `make portao` como checagem de comportamento, e o `fin-devplatform`
  passando a depender dele;
- testes: `wantNoSection` com os 7 *stubs*, o *golden* de cobertura do glossário e o `capstone.spec.js` (27
  componentes).

### Pontes conferidas para as próximas fases

| O plano diz | Marco real |
| --- | --- |
| `seguranca-aplicacao` (`oauth2-e-oidc`) | `seguranca-aplicacao/05`; autorização em `/08` |
| `go-fintech` (marco do `Money`) | `go-fintech/02` |
| `go-fintech/15` (servidor MCP em Go) | confere: o Complemento já usa o SDK v1.8.0 e os transportes em memória |
| `engenharia-de-plataforma` (caminho pavimentado) | `engenharia-de-plataforma/04` (*golden paths*) |
| `lideranca-tecnica` (adoção de prática) | `lideranca-tecnica/07` (mentoria, delegação e *feedback*) |
| `design-de-codigo` e `arquitetura-de-software` (ADR) | `design-de-codigo` não está publicada; a ADR fica em `arquitetura-de-software/07` |
| `entrega-continua-e-devops/01`, `/02`, `/03`, `/04`, `/09` | conferem |
| `system-design/05` e `ml-em-producao/08` | conferem |

## 2. Fase 1 — Bloco A (marcos 01 a 03)

Os três marcos saíram dos *stubs*, cada um com os cinco blocos de Hands-on e 4 perguntas de quiz (12 no
total, nenhuma com a resposta certa como a única opção mais longa). O laboratório é Go, com
`gopkg.in/yaml.v3` como única dependência externa.

### Medições

| Marco | O que foi medido | Resultado |
| --- | --- | --- |
| 01 | matriz de delegação (`delegacao.yaml`, 3 classes) e o classificador | as 4 invariantes passaram; a mutação que liga o *merge* automático no caminho do dinheiro foi reprovada |
| 01 | tabela de casos do classificador | a primeira versão esperava o teste de `ledger-core/extrato/` na classe "teste"; o classificador o pôs na classe da regra. A tabela estava errada: o teste de uma regra herda a criticidade dela. Arquivo fora de toda classe é recusado |
| 01 | teste e produção no mesmo PR | `ledger/saldo.go` + `ledger/saldo_test.go` recusado sem a etiqueta `revisao-reforcada` e aceito com ela; só o teste segue |
| 02 | `speclint` sobre a especificação do limite por período (4 requisitos, 7 critérios, 3 tarefas) e o decisor com relógio injetado | sem achados; bordas da janela (20h00, 6h00, virada do dia, `America/Sao_Paulo` × UTC) em teste de tabela |
| 02 | nove mutações aplicadas a cópias | **todas reprovadas** com o achado certo: critério sem teste, teste sem critério, critério inexistente, requisito sem critério, identificador repetido, termo vago, ambiguidade aberta na classe crítica, tarefa sem verificação, tarefa sem requisito. O termo vago marcado como aberto, fora da classe crítica, passou |
| 03 | conversor neutro ↔ Spec Kit (convenção do requisito no título da história) | ida e volta preservou os 11 identificadores; o convertido passou no `speclint`; a história sem `(FR-NNN)` foi recusada; o `[NEEDS CLARIFICATION]` virou ambiguidade aberta e reprovou na classe crítica |
| 03 | versão do Spec Kit fixada num lugar só | uma instalação fixada e nenhuma solta; a linha "da `main`" é pega. A primeira versão do detector, por ocorrência, acusava `specify-cli --from ...@v1.4.0` como solta; passou a julgar a linha inteira |
| 03 | dono das especificações | todo arquivo de `specs/` tem entrada no `CODEOWNERS` |

### Conferências desta fase (14 nov 2026)

- **DORA:** a página do relatório de 2025 é `dora.dev/research/2025/dora-report/`. O relatório trata a IA
  como amplificador: mais *throughput* e mais instabilidade sem testes, versão e *feedback* fortes. O marco
  01 não cita número; remete ao relatório.
- **Equivalentes do Spec Kit**, conferidos nos repositórios: **OpenSpec** 2.0.0 e **BMAD Method** v6.12.4,
  ambos MIT. O **Kiro** entra como produto comercial, com os termos a conferir. O formato de requisitos que
  fontes secundárias atribuem a ele não foi citado, por falta de fonte primária.
- **Formato do Spec Kit:** o cenário de aceite pertence à história de usuário, e não ao `FR-NNN`; a
  rastreabilidade só existe com convenção. Virou o centro do Desafio do 03.
- **Estudo de caso:** o repositório é público, mas os `PLANO-*.md` **não estão versionados**, porque chegam
  colados na conversa. O marco 02 usa o PR #159 e esta auditoria como exemplo, e a ausência dos planos como
  exemplo real de deriva de especificação.

### Achado fora do escopo

`entrega-continua-e-devops/01` fala em "quatro métricas DORA" (com "conferir edição vigente"). A edição de
2025 tem **cinco**: a quinta é a taxa de retrabalho, o tema do marco 07 desta trilha. A correção entra na
Fase 3, junto com as edições da §10 do plano.
