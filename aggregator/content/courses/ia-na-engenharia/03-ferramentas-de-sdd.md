---
id: ferramentas-de-sdd
title: "Ferramentas de SDD: Spec Kit e equivalentes"
summary: "A ferramenta dá o trilho e os modelos de documento; a qualidade continua vindo do critério de aceite. O Spec Kit 1.4.0 (a 1.0.0 saiu em ago 2026): a CLI specify, os nove comandos do fluxo e a grafia que muda por agente, o que ele gera, extensões e presets, a instalação fixada por tag; OpenSpec e BMAD como mapa; onde ajuda e onde atrapalha — com um conversor que mostrou o buraco do formato: o critério de aceite do Spec Kit pertence à história, não ao requisito."
estimatedMinutes: 50
reviewedAt: 2026-11-14
reviewEvery: 3m
competencies: [plataforma, execucao]
references:
  - title: "GitHub Spec Kit — repository and releases"
    url: https://github.com/github/spec-kit
  - title: "GitHub Spec Kit — Installation"
    url: https://github.github.io/spec-kit/installation.html
  - title: "GitHub Spec Kit — Command invocation by integration"
    url: https://github.github.io/spec-kit/integrations/cli.html
  - title: "OpenSpec"
    url: https://github.com/Fission-AI/OpenSpec
---

## O que a ferramenta dá, e o que ela não dá

Uma ferramenta de SDD dá três coisas: um **trilho** (a ordem das etapas), **modelos** de documento (a
especificação, o plano, as tarefas) e **comandos** que o agente executa em cada etapa. Ela não dá o critério
de aceite verificável do marco 02. Uma especificação gerada pelo Spec Kit pode ser tão vaga quanto uma
escrita à mão; ela só vem mais bem formatada.

Por isso a ordem deste marco: primeiro o que o Spec Kit faz, depois como ligá-lo ao formato verificável, e
por fim quando ele atrapalha.

## O Spec Kit, conferido na versão

O **Spec Kit** é a ferramenta de SDD de código aberto do GitHub, sob licença MIT. Conferido em 14 nov 2026,
no repositório:

- a versão atual é a **1.4.0** (10 nov 2026). A série 1.x começou com a **1.0.0, em 21 ago 2026**;
- antes dela, a CLI mudou de forma incompatível: a opção `--ai` virou `--integration`, e `--no-git` e
  `--skills` foram descontinuadas. Um *script* escrito para a 0.x quebra na 1.x;
- a instalação recomendada é **fixada numa *tag***:
  `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z`, ou
  `specify-cli==X.Y.Z` pelo PyPI. Instalar "da `main`" é instalar uma versão que muda sem aviso.

**A CLI e os comandos.** A CLI `specify` prepara o repositório (`specify init`) e mostra a versão
(`specify version`). As etapas do fluxo rodam **dentro do agente**, não no terminal. Na 1.4.0 são nove:

| Comando | Etapa |
| --- | --- |
| `constitution` | os princípios do projeto |
| `specify` | a especificação: o quê e por quê |
| `clarify` | as perguntas que fecham as ambiguidades |
| `plan` | o plano técnico |
| `checklist` | a lista de qualidade dos requisitos (opcional, depois do plano) |
| `tasks` | as tarefas |
| `analyze` | a consistência entre especificação, plano e tarefas |
| `implement` | a implementação |
| `converge` | repetir implementar e convergir até o relatório dizer `Converged` |

**A grafia muda por agente.** O mesmo passo é `/speckit-specify` no GitHub Copilot em modo de *skills*,
`/speckit.specify` na notação da documentação de referência e `$speckit-specify` no Codex. Num time com
agentes diferentes, a instrução escrita "rode `/speckit.specify`" não funciona para todos; a documentação
de integração diz qual grafia cada um usa.

**O que ele gera.** Medido aqui com a 1.4.0 e `specify init --integration copilot`:

- `.specify/`, com os modelos (`spec-template.md`, `plan-template.md`, `tasks-template.md`,
  `checklist-template.md`, `constitution-template.md`), os *scripts* e o registro da integração;
- `.github/skills/`, com uma *skill* por comando.

Nada disso chamou um modelo nem precisou de chave: o `init` só prepara o repositório.

**Extensões e *presets*.** O Spec Kit tem um catálogo comunitário de extensões (revisão de segurança,
guarda de arquitetura, sincronização com o rastreador de tarefas) e de *presets* de governança. Cada uma
é mais um pedaço de código de terceiro que o agente executa: entra pela mesma régua de cadeia de suprimentos
de `seguranca-aplicacao/12`, com versão fixada.

## O formato do Spec Kit, e o buraco dele

O modelo de especificação do Spec Kit organiza o documento em:

- **histórias de usuário**, com prioridade e **cenários de aceite** no formato *Given/When/Then*;
- **requisitos funcionais** `FR-NNN` ("System MUST...");
- **critérios de sucesso** `SC-NNN`, mensuráveis;
- marcas `[NEEDS CLARIFICATION: ...]` para o que falta decidir.

Duas coisas casam bem com o marco 02: o identificador do requisito e a marca de dúvida, que é a ambiguidade
aberta. E uma não casa: **o cenário de aceite pertence à história, não ao requisito**. Nada no formato liga
o `FR-002` ao cenário que o prova. A rastreabilidade requisito → critério → teste fica implícita, e o
verificador do marco 02 não tem o que cruzar.

A solução do `fin-assist` é uma **convenção**: cada história leva no título o requisito que cobre
(`### User Story 2 - A janela atravessa a meia-noite (FR-002)`). Com ela, um conversor leva a especificação
do Spec Kit para o formato neutro e volta, sem perder nada. Sem ela, o conversor **recusa** em vez de
adivinhar.

## Os equivalentes, como mapa

Outras ferramentas fazem o mesmo trabalho com outro trilho. Conferido em 14 nov 2026, sem exercício:

| Ferramenta | O que propõe | Licença |
| --- | --- | --- |
| **OpenSpec** (2.0.0) | cada mudança numa pasta com proposta, desenho, tarefas e o *delta* da especificação; pensado para código que já existe | MIT |
| **BMAD Method** (v6.12.4) | papéis de agente encadeados: *brief*, PRD e arquitetura antes das histórias | MIT |
| **Kiro** | um IDE de agente com o fluxo de requisitos, desenho e tarefas embutido | produto comercial; conferir os termos |

A escolha entre elas importa menos do que a decisão de ligar o critério de aceite a um teste. Qualquer uma
pode ser a ferramenta; nenhuma é o critério.

## Onde ajuda e onde atrapalha

**Ajuda:**

- no trabalho novo de tamanho médio, em que o agente precisa de contexto estruturado;
- no time que precisa de um **padrão** comum de documento, revisável por qualquer um;
- na conversa com o produto: a especificação em linguagem de negócio, separada do plano técnico.

**Atrapalha:**

- na mudança pequena: nove etapas para uma correção de uma linha ensinam o time a pular o processo;
- na especificação que **incha**: o modelo pede seções, o agente as preenche, e o documento fica longo sem
  ficar preciso;
- no **documento gerado que ninguém lê**: se a revisão do PR olha só o código, a especificação é
  decoração;
- na **falsa sensação de rigor**: "tem especificação, plano e tarefas" não diz se o critério está certo.

**Adotar num repositório existente.** A documentação tem o caminho próprio ("Existing projects"):
comece por uma funcionalidade nova, não por especificar o legado inteiro; fixe a versão; decida quem é o
dono de cada especificação antes da primeira.

## Lado a lado com este catálogo

| | Spec Kit | `tech-radar` |
| --- | --- | --- |
| princípios | `constitution` | as convenções de autoria do `README.md` e de cada plano |
| especificação | `specify` + `clarify` | a tese, as decisões e os critérios de aceite do `PLANO-*.md` |
| plano e tarefas | `plan` + `tasks` | as fases do plano, um PR por fase |
| verificação | `analyze` + `checklist` | os invariantes testáveis e a auditoria de cada fase |
| implementação | `implement` + `converge` | o agente de código, com os testes do compilador como freio |

A diferença que importa é a última linha: aqui, a fase só termina quando os invariantes rodam.

> **O que a geração automática de especificação não garante.** Que o critério esteja certo; que a ambiguidade
> tenha sido vista; que alguém seja dono do documento; que a especificação continue valendo depois do *merge*.
> A ferramenta gera o arquivo. O critério, o dono e a revisão continuam sendo do time.

> **Armadilha.** Instalar a CLI "da `main`" no CI e descobrir, numa segunda-feira, que o comando mudou de
> nome e a esteira inteira parou.

## Exemplo numa fintech

O time do `pix-gateway` adotou o Spec Kit e, em um mês, tinha 40 especificações geradas. Na revisão de uma
regressão, ninguém sabia quem respondia pela especificação do limite de TED; ela tinha sido gerada pelo
agente, aprovada junto com o código e nunca mais aberta. A correção:

- toda especificação ganhou dono no `CODEOWNERS`, e o PR que muda uma especificação sem dono não entra;
- a versão do Spec Kit passou a ser fixada num lugar só, e um teste reprova instalação sem versão;
- as histórias passaram a citar o requisito no título, e o `speclint` do marco 02 passou a rodar sobre a
  especificação convertida.

## Hands-on

**Tutorial.** Numa cópia do `fin-assist`, instale o Spec Kit com a versão fixada (`specify-cli==1.4.0`), rode
`specify version` e `specify init --integration copilot --ignore-agent-tools`, e olhe o que foi gerado em
`.specify/` e `.github/skills/`.

**Desafio.** Levar a especificação do limite por período do marco 02 para o formato do Spec Kit e voltar, com
um conversor (`speckit/`, Go) que segue a convenção da história com o requisito no título.

**Invariantes testáveis**

1. **O convertido passa no `speclint`.** A especificação levada ao Spec Kit e trazida de volta passa no
   `speclint` do marco 02 sem edição manual. Medido: sem achados.
2. **A ida e volta preserva os identificadores.** O conjunto de identificadores de requisito e de critério é
   igual antes e depois. Medido: os mesmos 11 (4 requisitos e 7 critérios).
3. **Versão fixada num lugar só.** Uma instalação do Spec Kit, fixada (`==X.Y.Z` ou `@vX.Y.Z`), e nenhuma solta.
   Um teste varre `Makefile`, *scripts* e arquivos de trava. Medido: a linha que instala "da `main`" é pega,
   e a fixada por *tag* passa. A primeira versão do detector, por ocorrência e não por linha, acusava a forma
   fixada `specify-cli --from ...@v1.4.0` como solta; passou a julgar a linha inteira.
4. **Nenhum artefato sem dono.** Todo arquivo de especificação tem entrada no `CODEOWNERS`.

E dois casos que o conversor trata sem adivinhar. Medido:

- a história sem `(FR-NNN)` no título é **recusada**, com o requisito que ficou sem critério;
- o `[NEEDS CLARIFICATION]` vira ambiguidade aberta e, na classe crítica, reprova no `speclint`.

**Complemento.** Rode o fluxo completo do Spec Kit com um agente real (`specify`, `clarify`, `plan`, `tasks`)
para o limite por período e compare a especificação gerada com a do marco 02: quantos critérios verificáveis
ela tem? Quantos termos vagos?

**Checagem**

1. O que o Spec Kit gera no repositório, e o que ele não garante?
2. Por que fixar a versão da ferramenta por *tag*, e o que mudou entre a 0.x e a 1.x?
3. Onde o formato do Spec Kit perde a rastreabilidade, e como a convenção a recupera?
4. Quando uma ferramenta de SDD atrapalha mais do que ajuda?

## Principais aprendizados

- A ferramenta dá trilho, modelos e comandos; o critério de aceite verificável continua sendo do time.
- Spec Kit 1.4.0 (nov 2026), MIT; a 1.0.0 saiu em ago 2026, depois de mudanças incompatíveis na CLI.
- Nove comandos, com a grafia que muda por agente; instale fixado por *tag*.
- No Spec Kit, o cenário de aceite é da história, não do requisito: a convenção do requisito no título liga
  os dois.
- OpenSpec e BMAD (MIT) e o Kiro como mapa; a ferramenta importa menos que o critério.
- Toda especificação com dono; nenhuma instalação solta. Medido: a ida e volta preservou os 11
  identificadores.
