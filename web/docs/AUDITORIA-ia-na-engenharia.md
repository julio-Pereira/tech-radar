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
