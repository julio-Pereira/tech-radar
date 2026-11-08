---
id: estrutura-e-arquitetura
title: "Estrutura de projeto e arquitetura em Go"
summary: "Em Go, estrutura é pacote; a arquitetura aparece no grafo de imports. O layout oficial de módulo, pacote por domínio, ciclo de import como sinal de fronteira errada, portas e adaptadores sem cerimônia, injeção manual no main e o monolito modular com internal/."
estimatedMinutes: 50
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura]
references:
  - title: "Organizing a Go module"
    url: https://go.dev/doc/modules/layout
  - title: "cmd/go: Internal Directories"
    url: https://pkg.go.dev/cmd/go#hdr-Internal_Directories
  - title: "Get familiar with workspaces (Go blog)"
    url: https://go.dev/blog/get-familiar-with-workspaces
  - title: "Model Context Protocol Go SDK"
    url: https://github.com/modelcontextprotocol/go-sdk
---

## O layout oficial, e o que não é oficial

A documentação oficial (*Organizing a Go module*) descreve poucas coisas: código de biblioteca na raiz
ou em pacotes por assunto, executáveis em **`cmd/<nome>/`**, e código que só o próprio módulo pode
importar em **`internal/`**. O repositório popular `golang-standards/project-layout`, com `pkg/`,
`api/`, `configs/`, `build/` e uma dezena de pastas, **não é padrão do Go**: é uma coleção de hábitos
de projetos grandes, e o próprio README dele avisa que não é um padrão oficial do time do Go. Num serviço pequeno, aquelas
pastas vazias só espalham o código. Comece com `cmd/` e `internal/`, e crie pasta quando ela tiver
conteúdo.

## Pacote por domínio, e o grafo de imports

No marco 02, pacote por domínio era uma questão de encapsulamento. Aqui é de **arquitetura**: em Go,
a dependência entre partes do sistema é o grafo de imports, e o compilador o torna explícito e
rígido.

- **Import cíclico não compila.** Se `ledger` importa `antifraude` e `antifraude` importa `ledger`,
  o build falha. Em Java, ciclo entre pacotes é cheiro; em Go, é erro. E o erro é informação: um
  ciclo quase sempre diz que a fronteira está no lugar errado, porque os dois pacotes são, na
  verdade, um só, ou porque falta uma interface do lado de quem consome.
- **`internal/` é fronteira imposta pelo compilador.** Um pacote em `ledger/internal/regras` só pode
  ser importado por código sob `ledger/`. O `extrato` tentando importá-lo recebe
  `use of internal package ... not allowed`. Num monolito modular, cada módulo de negócio tem o seu
  `internal/`, e o que os outros módulos enxergam é a API pública dele.
- O grafo pode ser lido e testado: `go list -json ./...` devolve, para cada pacote, a lista de
  imports, e um teste pode recusar as arestas proibidas.

## Portas e adaptadores sem cerimônia

A arquitetura hexagonal (`arquitetura-de-software/04`) em Go não precisa de framework nem de
pastas `domain/`, `application/`, `infrastructure/`. Ela sai de duas regras que o marco 04 já ensinou:

- **A porta é uma interface pequena, declarada no domínio que a consome.** O `ledger` declara
  `Repo` com os dois métodos que usa.
- **O adaptador implementa a porta e mora fora do domínio** (`ledger/adapters/postgres`,
  `ledger/adapters/http`). O domínio nunca importa adaptador; o adaptador importa o domínio.

Quem liga as duas pontas é o **`main`**: cria o repositório, cria o serviço com o repositório, cria
o handler com o serviço. É **injeção de dependência manual**, explícita, que o compilador confere.
Um gerador (como o Wire) só vale quando o grafo de construção fica grande demais para ler no `main`,
o que num serviço de produto raramente acontece.

## Monolito modular e workspaces

O `ledger-core` cresce em três módulos de negócio dentro do mesmo serviço: `ledger`, `antifraude` e
`extrato`. Cada um com o seu `internal/`, a sua API pública e os seus adaptadores, no mesmo binário e
no mesmo deploy. É o **monolito modular**: as fronteiras de um sistema distribuído, sem a rede no
meio. Se um módulo um dia virar serviço próprio, a fronteira já existe. O mesmo desenho em Spring é o
Spring Modulith, de `spring-boot/15`; os estilos e o critério de escolha estão em
`arquitetura-de-software/01`.

Quando o projeto tem **vários módulos Go** (vários `go.mod`), um **workspace** (`go.work`, Go 1.18)
permite desenvolver os módulos juntos, com as mudanças locais de um enxergadas pelo outro, sem
`replace` no `go.mod` que alguém esquece de tirar.

## Exemplo numa fintech

No `ledger-core`, a regra de débito (`PodeDebitar`) mora em `ledger/internal/regras`. O time do
`extrato` precisava da mesma regra para mostrar "saldo disponível" e tentou importá-la: o compilador
recusou. A resposta certa não foi mover a regra para um `pkg/util` compartilhado (que viraria o
depósito de tudo), e sim o `ledger` expor uma operação pública que responde a pergunta, e o
`extrato` consumir essa operação por uma interface pequena. A fronteira que o compilador impôs evitou
duas cópias da regra de saldo divergindo com o tempo.

Um teste de arquitetura vigia o resto: lê o grafo com `go list -json ./...` e reprova qualquer pacote
fora de `cmd/` que importe um pacote de `adapters/`. Um detalhe: como o teste chama `go list` por
fora, o cache do `go test` não enxerga mudanças nos outros pacotes; rode-o com `-count=1` no CI.

## Hands-on

**Tutorial.** Reorganize o `ledger-core`: `cmd/ledger` com o `main` que monta tudo; `ledger/` com o
`Service` e a porta `Repo`; `ledger/internal/regras`; `ledger/adapters/postgres` com o repositório.
Tente importar `ledger/internal/regras` de outro módulo e leia o erro.

**Desafio.** Separe o `ledger-core` nos módulos `ledger`, `antifraude` e `extrato`, cada um com a sua
API pública e o seu `internal/`, e escreva o teste de arquitetura.

**Invariantes testáveis**

1. Nenhum pacote de domínio importa adaptador: o teste lê `go list -json ./...` e reprova a aresta
   (prove fazendo o `antifraude` importar `ledger/adapters/postgres` e vendo o teste falhar).
2. Nenhum módulo importa o `internal/` de outro: o compilador garante, e um pacote de teste em
   `testdata` que tenta prova que a regra continua de pé.
3. O `main` é o único lugar que monta dependências: só pacotes sob `cmd/` importam `adapters/`.

**Complemento.** Um **servidor MCP em Go** como mais um adaptador de entrada, opcional: com o SDK
oficial (`github.com/modelcontextprotocol/go-sdk`, v1.8.0), exponha a ferramenta `consultar_saldo`
para um agente de IA. O adaptador recebe só uma interface de leitura (`Saldo`), então não tem como
escrever; declare a ferramenta com `ReadOnlyHint: true`. Invariante: um teste com os transportes em
memória do SDK (`mcp.NewInMemoryTransports`) lista as ferramentas, chama todas, confere que todas se
declaram somente leitura e que nenhuma escrita chegou ao ledger.

**Checagem**

1. Por que o `project-layout` popular não é o layout do Go, e o que é?
2. O que um ciclo de import costuma dizer sobre a fronteira entre dois pacotes?
3. Por que a porta é declarada no domínio, e o adaptador importa o domínio, e não o contrário?
4. O que o `internal/` garante num monolito modular que uma convenção de time não garante?

## Principais aprendizados

- Layout oficial: `cmd/` e `internal/`; o resto cria-se quando tiver conteúdo.
- Em Go, a arquitetura é o grafo de imports: ciclo não compila, e `internal/` é fronteira.
- Portas pequenas no domínio, adaptadores fora, injeção manual no `main`.
- Monolito modular: cada módulo com a sua API e o seu `internal/`; `go.work` para vários módulos.
- Teste de arquitetura sobre `go list`, com `-count=1`.
