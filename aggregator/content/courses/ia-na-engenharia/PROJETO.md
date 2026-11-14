# Projeto guia: `fin-assist`

> Componente do `fin-platform`. O `fin-assist` é o **kit que torna seguro e mensurável o uso de agentes de
> código** nos outros componentes: como se especifica, o que o agente pode tocar, que ferramentas internas
> ele enxerga e como se sabe se valeu a pena.

## Por que uma trilha própria

Um agente de código escreve rápido e não sabe quando errou. O trabalho do engenheiro sênior passa a ser
**especificar de forma verificável, limitar o que o agente pode tocar e medir o efeito**. Cada uma dessas
três coisas pode ser provada por teste **sem depender do modelo**.

Três hábitos atravessam os sete marcos:

1. **A especificação é o gargalo.** Requisito sem critério de aceite executável é pedido de adivinhação.
2. **Defesa que depende do modelo "se comportar" não é defesa.** Permissão, escopo e saída de dados são
   controles determinísticos em volta do agente.
3. **Produtividade se mede na entrega, não no teclado.** Estabilidade e retrabalho contam junto com
   velocidade.

**Para quem.** Engenheiro backend sênior ou *tech lead* que já usa, ou vai usar, assistente ou agente de
código e precisa definir como o **time** trabalha com isso num banco.

**O que não é:** curso de um assistente específico; curso de *prompt*; a trilha de IA generativa servindo
clientes (RAG, *guardrails* de produto), que é outra; comparação de modelos. Nenhum marco ensina como um
LLM funciona por dentro.

## O que você vai construir

| Pasta | Conteúdo | Marco |
| --- | --- | --- |
| `delegacao.yaml` e `classificador/` | a matriz de delegação e a função que põe uma mudança na classe certa | 01 |
| `specs/` e `speclint/` | especificação, plano e tarefas versionados, e o verificador | 02, 03 |
| `AGENTS.md` | as instruções de repositório, com comandos que um teste executa | 04 |
| `agente-roteirizado/` | o reprodutor de *fixtures* de ações de agente | 04 a 07 |
| `harness/` | a aceitação de PR de agente | 04 |
| `mcp/` | o servidor MCP de leitura, em Go | 05 |
| `portao/` | o portão de política entre o agente e as ferramentas | 06 |
| `medicao/` | os indicadores do piloto sobre histórico sintético | 07 |
| `adr/` | as decisões: SDK de MCP, agente roteirizado, política de dados | todos |

A trilha inteira entrega **uma** funcionalidade, do começo ao fim: o **limite de valor por período** no
`pix-gateway` (por exemplo, um limite noturno), com a janela e o valor como parâmetros. A regra regulatória
real fica marcada **conferir**: a trilha testa o mecanismo, não a interpretação da norma.

## Contratos com os vizinhos

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | *gates* e registro de evidência | `fin-pipeline` (`entrega-continua-e-devops`) |
| consome | dados sintéticos de lançamentos | `ledger-core` (`go-fintech`) |
| altera | a funcionalidade de limite por período | `pix-gateway` (`spring-boot`) |
| serve | instruções de repositório e servidor MCP como modelo | `fin-devplatform` (`engenharia-de-plataforma`) |

## O laboratório: sem modelo, sem chave, sem rede

### ADR: o agente roteirizado (14 nov 2026)

**Contexto.** Um agente real não é determinístico, custa dinheiro e não roda em CI sem chave de API. Um
teste que depende dele prova o comportamento do modelo naquele dia, não o controle.

**Decisão.** Todo invariante usa um **agente roteirizado**: um programa Go pequeno que reproduz, em ordem
fixa, *fixtures* de ações de agente (patch proposto, chamada de ferramenta, conteúdo lido, comando, saída de
rede) contra o controle que está sendo testado. Uma ação pode ser condicionada a o roteiro ter lido um
conteúdo com instrução escondida: é assim que a *fixture* reproduz um agente "enganado".

Medido na Fase 0, com 5 *fixtures*:

- as cinco carregam, e juntas usam os cinco tipos de ação;
- 100 rodadas da mesma *fixture* emitem a mesma sequência;
- com o conteúdo injetado, o roteiro **tenta** a saída de rede; com o conteúdo limpo, não tenta;
- um executor que nega a rede deixa a negação no registro, e o roteiro segue (4 passos, 1 negado);
- tipo de ação desconhecido é recusado na carga;
- a mutação que ignora a condição de injeção é pega pelo teste.

**Consequência.** O invariante de segurança afirma o **bloqueio pelo controle**, nunca o "bom
comportamento" do agente. Toda *fixture* de ataque ou de patch ruim tem a versão boa correspondente, e o
teste distingue as duas. Usar um agente real, ou um modelo aberto local, é sempre **Complemento**, e o roteiro
não reproduz como um modelo escolhe a próxima ação: cada marco diz isso numa caixa.

### ADR: o SDK de MCP (14 nov 2026)

**Contexto.** O servidor MCP do marco 05 precisa de um SDK que fale a revisão vigente da especificação
(2026-07-28) e rode em CI sem rede.

**Decisão.** O **SDK oficial em Go** (`github.com/modelcontextprotocol/go-sdk`), versão **v1.8.0** (4 set
2026). Pela tabela de compatibilidade do próprio repositório, a linha v1.7.0+ suporta a 2026-07-28 e as
revisões anteriores. Os transportes em memória do SDK servem ao teste sem rede, como já faz o Complemento
de `go-fintech/15`. O SDK exige **Go 1.25**; o laboratório usa a *toolchain* que o `go.mod` pede.

**Alternativa registrada.** O SDK oficial em Java (`io.modelcontextprotocol`), versão **v2.2.0**, licença MIT,
com integração Spring pelo Spring AI. Fica como mapa para quem prefere o `pix-gateway` como servidor.

**Licença.** O projeto MCP está em transição de MIT para **Apache-2.0** (código e especificação novos já em
Apache-2.0; contribuições antigas sem consentimento de relicenciamento seguem MIT), como diz o `LICENSE` do
SDK de Go e da especificação.

## Ferramenta e protocolo → versão conferida

O `reviewEvery: 3m` de todo marco revisa esta tabela. Conferido em 14 nov 2026, nas fontes oficiais (os
repositórios clonados na *tag* indicada).

| Item | Versão conferida | Fonte | O que importa para a trilha |
| --- | --- | --- | --- |
| **Spec Kit** (`specify-cli`) | **v1.4.0** (10 nov 2026); a v1.0.0 saiu em 21 ago 2026 | `github/spec-kit`, `CHANGELOG.md`; licença MIT | instalado e testado aqui: `pip install specify-cli==1.4.0`, `specify version`, `specify init` sem agente |
| comandos do Spec Kit | `constitution`, `specify`, `clarify`, `plan`, `checklist`, `tasks`, `analyze`, `implement`, `converge` | `templates/commands/` na v1.4.0 | a grafia muda por agente: `/speckit-specify` (Copilot em modo *skills*), `/speckit.specify` (notação da referência), `$speckit-specify` (Codex). O `taskstoissues` foi descontinuado |
| instalação fixada do Spec Kit | `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z`, ou `specify-cli==X.Y.Z` no PyPI | `docs/installation.md` | a documentação recomenda fixar por *tag* |
| **especificação MCP** | **2026-07-28** (a anterior é 2025-11-25) | `modelcontextprotocol/modelcontextprotocol`, `changelog.mdx` da revisão | núcleo **sem estado**: sem *handshake* `initialize` nem `Mcp-Session-Id`; cada requisição leva versão e capacidades em `_meta`; `server/discover` obrigatório |
| autorização MCP | OAuth 2.1; audiência do *token* pelo RFC 8707; *token passthrough* proibido | `basic/authorization/security-considerations.mdx` | o *Dynamic Client Registration* (RFC 7591) ficou **descontinuado** em favor do *Client ID Metadata Document*; o cliente **deve** validar o `iss` (RFC 9207) |
| recursos descontinuados no MCP | *roots*, *sampling* e *logging* (janela mínima de 12 meses) | `changelog.mdx` | o servidor do marco 05 não depende deles |
| **SDK MCP em Go** | **v1.8.0** (4 set 2026), Go 1.25 | `modelcontextprotocol/go-sdk`, `README.md` | suporta a 2026-07-28 desde a v1.7.0 |
| **SDK MCP em Java** | **v2.2.0**, licença MIT | `modelcontextprotocol/java-sdk` | alternativa registrada |
| **AGENTS.md** | formato aberto, sem versão | `agentsmd/agents.md` | "um README para agentes": comandos de *build* e teste, convenções, instruções de PR |
| **OWASP Top 10 for LLM Applications** | edição **2025** (LLM01 *Prompt Injection*, LLM06 *Excessive Agency*) | genai.owasp.org | há também o *Top 10 for Agentic Applications for 2026*; a lista inteira se confere na Fase 3 |
| **DORA** | relatório **2025**, *State of AI-assisted Software Development* | dora.dev | adoção de IA associada a mais *throughput* e a **mais instabilidade**; números só com link, nunca de memória |

## Pré-requisitos

Go (o SDK de MCP pede 1.25), JDK para o `pix-gateway`, `git`, `make`; Docker opcional. Python 3.11+ só para
o marco 03, com o Spec Kit.

**Não precisa:** chave de API, assinatura de assistente, GPU nem conta em nuvem. **Opcional
(Complemento):** um agente de código qualquer; um modelo aberto local (licença a conferir no marco).

## Frescor

Todo marco declara `reviewEvery: 3m`: é a área que mais muda no catálogo. O campo aceita `3m`, `6m`, `12m`
e `24m` (`internal/course/freshness.go`).

## Regra do tempo declarado

A trilha soma 430 minutos de `estimatedMinutes`. A regra do repositório é ~2x a soma, para cobrir o
hands-on: 430 x 2 / 60 = 14,3, arredondado para **14 horas**.
