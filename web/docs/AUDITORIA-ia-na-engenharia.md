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

`entrega-continua-e-devops/01` fala em "quatro métricas DORA" (com "conferir edição vigente"). O DORA tem
**cinco** desde o relatório de **2024** (a quinta é a taxa de retrabalho de *deploy*; esta seção dizia "a
edição de 2025", corrigido na Fase 3). A correção do marco entrou na Fase 3.

## 3. Fase 2 — Bloco B (marcos 04 e 05)

Os dois marcos críticos saíram dos *stubs*, com os cinco blocos de Hands-on e o quiz estendido (6 perguntas
cada). As 24 perguntas da trilha até aqui: nenhuma com a resposta certa como a única opção mais longa.

### Medições

| Marco | O que foi medido | Resultado |
| --- | --- | --- |
| 04 | os comandos do `AGENTS.md`, executados por um teste | os três terminam com sucesso |
| 04 | *harness*: patch bom | aceito; mutação do decisor 6/9 antes e depois |
| 04 | asserção removida (com o código) | contagem caiu (3 → 2 em `TestDecidir`, 2 → 1 em `TestJanela`); mutação 6/9 → 3/6 |
| 04 | asserção enfraquecida sem mudar a contagem (`\|\|` → `&&`, `&& false`) | a contagem não viu; só a mutação pegou: **6/9 → 5/9** |
| 04 | fora do escopo, PR grande, autoaprovação | recusados: `speclint/speclint.go` fora de `limite/`; 311 linhas contra 120; aprovador = responsável; PR sem pessoa responsável |
| 05 | *token* sem audiência certa (ausente, outra audiência, vencido, assinatura falsa) | os quatro recusados, zero leituras no repositório |
| 05 | ferramentas só de leitura | as duas com `readOnlyHint`, chamadas todas: zero escritas |
| 05 | saída sem dado pessoal | a *fixture* com CPF, chave Pix e conta no histórico saiu limpa |
| 05 | auditoria | 3 chamadas, 3 registros completos; a falha registrada como erro |
| 05 | entrada fora do esquema | cinco casos (injeção, caminho, campo extra, campo faltando, serviço fora da lista) rejeitados, zero leituras |
| 05 | resposta grande | 14.030 bytes chegaram como 2.048 com o aviso de truncamento |
| 05 | mutações | sem a limpeza, sem a checagem de audiência e sem o padrão do esquema: cada uma reprovou a sua invariante |

### Achados que viraram conteúdo

- **O SDK MCP em Go v1.8.0 e a revisão 2026-07-28.** O cliente pede a 2026-07-28 por padrão, mas o *handler*
  HTTP do servidor só a negocia com `StreamableHTTPOptions{Stateless: true}`; sem a opção, a sessão do teste
  caiu para a **2025-11-25**, com o *handshake* `initialize`, sem erro. Entrou no marco 05 e como sétima
  invariante.
- **O vencimento do *token*.** O *middleware* `auth.RequireBearerToken` confere o vencimento contra o relógio
  real, além do verificador; o primeiro teste, com relógio fixo, recusou o *token* válido.
- **A recursão do *harness*.** A primeira versão rodava `go test ./...` dentro da cópia do módulo, e isso rodava
  o próprio *harness*, em recursão, até encher o disco. Passou a rodar só os pacotes da tarefa.
- **A mutação de partida é 6/9.** Três mutantes do decisor sobrevivem à suíte original; o *harness* compara
  antes e depois, sem exigir 100%.

### Laboratório

O servidor MCP é um módulo Go próprio (`fin-assist/mcp`, Go 1.25 pelo SDK); o resto do `fin-assist` segue em
Go 1.24. O teste sobe o servidor com `httptest` e fala com ele pelo cliente do SDK, sem rede externa.

## 4. Fase 3 — Bloco C (marcos 06 e 07), capstone, glossário, conceitos e edições da §10

Os marcos 06 (quiz estendido, 6) e 07 (4, com `## Capstone`) saíram dos *stubs*. A trilha fecha com **34
perguntas**, nenhuma com a resposta certa como a única opção mais longa, e o teste de seções volta a
`var wantNoSection []string`. O `GLOSSARIO.md` passou de 4 para **39 verbetes**, sem repetir os que têm dono
(*gate*, métricas DORA, evidência, cadeia de suprimentos, segredo, teste de mutação e lei de Goodhart, os
dois últimos conferidos nos glossários de `go-fintech`, `concorrencia-e-recursos` e
`entrega-continua-e-devops`).

### Medições

| Marco | O que foi medido | Resultado |
| --- | --- | --- |
| 06 | portão com o roteiro injetado | o roteiro tentou ler o `.env` e mandar para o coletor; 2 negações, **nada enviado**; com o conteúdo limpo, nenhuma negação |
| 06 | segunda camada | com a leitura liberada por engano, o destino fora da lista ainda barra a saída; sessão sem rede não sai nem para destino conhecido |
| 06 | combinação perigosa | a sessão com as três capacidades é recusada; com qualquer uma tirada, passa |
| 06 | contexto montado | `.env`, chave, `secrets/` e o valor do segredo copiado em `config/local.yaml` e num `README.md` ficaram fora; o código ficou |
| 06 | dependências | fora da lista, negada; na lista por engano mas fora do registro espelhado, negada pelo espelho |
| 06 | irreversível | sem aprovação, com a da própria responsável e com a de outra ação: negado; com a de outra pessoa, permitido |
| 06 | registro encadeado | as negações entram; a entrada adulterada é apontada pelo índice |
| 06 | seis mutações | ler segredo, qualquer destino, autoaprovação, sem o validador das três, sem espelho, sem conferir o *hash*: todas pegas |
| 07 | medição sobre massa conhecida | *lead time* 45 h × 17h30; falha 10% × 30%; retrabalho de *deploy* 20% no piloto; retrabalho de código 1/12 × 6/20 |
| 07 | veredito | velocidade sozinha recusada; mais rápido com mais retrabalho: "sem ganho comprovado"; mais rápido sem piora: "ganho" |
| 07 | janela do retrabalho | a linha refeita 30 dias depois fica fora da janela de 14 (6/20) e entra na de 31 (7/20) |
| 07 | grupos desiguais | 4 × 4 não alerta; 12 × 4 alerta; menos de 30 *deploys* gera o alerta de amostra pequena |
| capstone | `make tudo` (`spec`, `harness`, `portao`, `medicao`, `mcp`) | os 9 pacotes passam, sem chave de API e sem rede externa |

**Um achado das mutações do 06.** Na primeira bateria, a mutação "ler segredo" sobreviveu: a lista de arquivos
da sessão também negava o `.env`, e nenhum teste isolava a regra de segredo. Um teste com uma sessão de leitura
ampla passou a exigi-la. E a primeira versão do *script* de mutação escondia as falhas de compilação (um mutante
deixava uma variável sem uso); passou a mostrar todo `FAIL`.

### Conferências desta fase (15 nov 2026)

- **OWASP:** a edição vigente do *Top 10 for LLM Applications* é a **2026** (publicada em ago 2026),
  e não a 2025, que a Fase 0 registrou. Corrigido no `PROJETO.md`. O *Top 10 for Agentic Applications for 2026*
  (dez 2025) começa por *Agent Goal Hijack*, *Tool Misuse* e *Identity & Privilege Abuse*; a lista inteira não
  foi lida, e o marco cita só essas três.
- **Combinação perigosa:** atribuída às fontes primárias, com as URLs conferidas: o texto de Simon Willison (16
  jun 2025) e o *Agents Rule of Two* da Meta (out 2025), em que a terceira capacidade é "mudar estado ou se
  comunicar para fora", e que se diz complemento, não substituto, do menor privilégio.
- **DORA:** cinco métricas desde o relatório de **2024**; a quinta, a taxa de retrabalho de *deploy*, conta
  *deploys* não planejados por incidente em produção. É diferente do retrabalho de código do plano (linhas
  refeitas em poucos dias); o marco 07 mede e explica os dois.

### Edições em outras trilhas (§10 do plano)

- `go-fintech/15`: o Complemento de MCP ganhou a ponte para `ia-na-engenharia/05`;
- `entrega-continua-e-devops/04`: a mutação como defesa contra a asserção enfraquecida, com ponte para
  `ia-na-engenharia/04`;
- `entrega-continua-e-devops/01`: as **cinco** métricas do DORA, com a quinta desde 2024 e a ponte para
  `ia-na-engenharia/07`; o Hands-on segue com as quatro clássicas;
- `seguranca-aplicacao/12`: o pacote inexistente sugerido pelo modelo, com ponte para `ia-na-engenharia/06`;
- jornada `entrevista-senior`: grupo **"Engenharia com IA"** com `/02`, `/04` e `/06`; a jornada passou de 47
  para 50 etapas;
- banco de desafios: `adotar-ia-no-time` (comportamental, rubrica de 5 itens e a reviravolta do dado sensível),
  com pré-requisito `ia-na-engenharia/07`; o banco passou de 15 para 16;
- `conceitos.yaml`: **MCP**, com dono em `ia-na-engenharia/05` (citado em `go-fintech/14` e `/15`);
- o Bloco 5 do adendo de sinais aponta para esta trilha na auditoria do adendo (o plano do adendo não é
  versionado no repositório).

## 5. Fase 4 — auditoria final e revisão independente dos marcos 04, 05 e 06

### Revisão adversarial

Um revisor separado recebeu uma cópia do `fin-assist` com uma tarefa: **burlar** o *harness* de PR (04), o
servidor MCP (05) e o portão de política (06) com *fixtures* e ações novas, sem mexer nos controles. Cada burla
achada foi corrigida no laboratório e ganhou um teste de regressão em `revisao_test.go`, no pacote dela. Quando a
correção não cabia no controle, a burla virou **limite conhecido**: um teste afirma que ela ainda passa, e o marco
diz qual é a defesa.

| Marco | Burla do revisor | Desfecho |
|---|---|---|
| 04 | renomear o teste; `//go:build ignore` no arquivo de teste | pegas de saída: contagem (2 → 0) e mutação (6/8 → 0/8) |
| 04 | alvo `limite/../speclint/...` e `limite/../../` | corrigida: alvo normalizado e preso à cópia |
| 04 | 300 instruções numa linha | corrigida: o tamanho conta as instruções separadas por `;` |
| 04 | produção sem espaços nos operadores, zerando os mutantes (razão `NaN`) | corrigida: a queda do total de mutantes reprova |
| 04 | asserção num comentário; `t.Skip` no meio do teste | corrigidas: contagem pela AST; `t.Skip` novo conta como queda |
| 04 | o mutante num comentário, equivalente, contava na pontuação | corrigida: comentários não são mutados (6/9 virou 6/8) |
| 04 | aprovador `Ana`, `ana ` ou o próprio agente | corrigida: nomes normalizados; o agente não aprova |
| 04 | teste e produção no mesmo PR sem a etiqueta | corrigida: a regra da matriz do marco 01 passou a ser cobrada |
| 02 | casos de fuso do mesmo lado da janela nos dois fusos | corrigida: 07h UTC (04h em SP) e 21h UTC (18h em SP) reprovam o decisor que ignora o fuso |
| 04 | porta dos fundos só na produção, com um valor que nenhum teste usa | **limite conhecido**: a revisão humana da classe crítica é a defesa |
| 05 | erro do repositório com CPF e e-mail chegando ao cliente | corrigida: erro genérico ao cliente, detalhe limpo na auditoria |
| 05 | chave Pix aleatória (UUID), CPF com espaço ou ponto, telefone com DDD entre parênteses, conta de 6 a 7 dígitos, CNPJ | corrigidas na limpeza por padrão |
| 05 | *token* sem sujeito conectava | corrigida: `sub` vazio é recusado |
| 05 | `aud` em lista (RFC 7519) recusado | corrigida: aceita texto ou lista |
| 05 | corte da resposta no meio de um caractere UTF-8 | corrigida |
| 05 | nome próprio em texto livre | **limite conhecido**: a projeção dos campos é a primeira defesa |
| 06 | `httpd/.env` e `.env#x` tratados como conteúdo externo | corrigidas: externo é URL com esquema ou `issue#N` |
| 06 | `limite/../.env`, `.ENV`, `producao.env`, `id_rsa`, `secrets.yaml` | corrigidas: caminho normalizado; segredo em qualquer caixa e nos nomes comuns |
| 06 | `go test ./... && curl`, `; go get`, `-exec`, `-vettool`, `make test && make deploy-producao`, `make testedeploy-producao` | corrigidas: comando por palavra, sem metacaractere nem *flag* perigosa |
| 06 | segundo pacote do `go get`, `@latest`, sufixo no nome do módulo | corrigidas: todo pacote conferido, com versão fixada |
| 06 | segredo no caminho de uma URL do *proxy*; usuário ou porta no destino; `http` em claro | corrigidas: destinos por `https` e por caminho |
| 06 | aprovação do irreversível por `Ana` ou pelo agente | corrigida: nomes normalizados; quem aprova não é o responsável nem o agente |
| 06 | `Executor` rodando uma sessão com as três capacidades | corrigida: o executor valida a sessão antes da primeira ação |
| 06 | colisão pelo separador e argumentos fora do *hash* do registro | corrigidas: o *hash* cobre a entrada inteira, em JSON |
| 06 | cadeia inteira recalculada; cauda truncada | **limite conhecido**: âncora do último *hash* fora do alcance do agente |
| 06 | segredo codificado em base64 dentro de outro arquivo | **limite conhecido**: a remoção por valor conhecido não o reconhece |

**Medido depois das correções** (15 nov 2026):

- **04:** a pontuação de mutação de partida é 6/8. O *patch* enfraquecido cai para 5/8, e o *patch* que remove
  asserção e código derruba os mutantes de 8 para 5. Os dois sobreviventes da partida estão em `Contem`, no ramo
  da janela que não atravessa a meia-noite, e nenhum está no decisor.
- **05:** as três mutações originais continuam pegas, e as duas novas (devolver ao cliente o erro original e
  aceitar `sub` vazio) também.
- **06:** as seis mutações originais continuam pegas, e as duas novas (desligar a checagem de metacaractere e
  desligar a validação no executor) também. Os 38 casos de burla do revisor são negados, e as ações permitidas
  da suíte original continuam passando.

O texto dos marcos 02, 04, 05 e 06 e a explicação da pergunta 2 do quiz 04 foram ajustados aos números novos e
às burlas. A data da OWASP no `PROJETO.md` e no marco 06 ficou em "ago 2026", em vez de "entre ago e set de 2026"
(§4).

### Checagens mecânicas

| Checagem | Resultado |
|---|---|
| Σ `estimatedMinutes` dos 7 marcos | 430 |
| `estimatedHours` | 14 (430 × 2 / 60 = 14,3) |
| perguntas | 34 (4, 4, 4, 6, 6, 6, 4) |
| resposta certa como a única opção mais longa | 0 de 34; posição da certa: 8, 9, 9, 8 |
| verbetes do glossário | 39 (meta: ≥ 30) |
| *stubs* | nenhum |
| pontes e conceitos | resolvem (testes do agregador) |
| `make tudo` sem chave de API e com `GOPROXY=off` | os 9 pacotes passam |
| invariantes de segurança | todas afirmam o bloqueio pelo controle, não o bom comportamento do agente |
| *fixtures* ruins | cada uma tem a boa correspondente |
