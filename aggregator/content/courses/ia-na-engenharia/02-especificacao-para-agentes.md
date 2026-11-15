---
id: especificacao-para-agentes
title: "Especificação que um agente consegue cumprir"
summary: "Desenvolvimento guiado por especificação funciona quando o critério de aceite é um teste; o resto é documento que envelhece. A cadeia princípios → especificação → plano → tarefas → implementação, o requisito com identificador e o critério como invariante verificável, a ambiguidade marcada em vez de adivinhada, a rastreabilidade nos dois sentidos, a deriva de especificação e quando SDD é cerimônia demais — com um speclint em Go que passou na especificação do limite noturno e pegou as nove mutações plantadas."
estimatedMinutes: 65
reviewedAt: 2026-11-14
reviewEvery: 3m
competencies: [arquitetura, execucao]
references:
  - title: "GitHub Spec Kit — Spec-Driven Development"
    url: https://github.com/github/spec-kit/blob/main/spec-driven.md
  - title: "GitHub Spec Kit — documentation"
    url: https://github.github.io/spec-kit/
---

## A especificação é o gargalo

Um agente cumpre o que está escrito, e adivinha o resto. "O Pix noturno deve ter limite" parece um
requisito. Para um agente, é um pedido de adivinhação com quatro buracos:

- qual janela? Das 20h às 6h, ou das 22h às 6h?
- em que fuso? O do servidor roda em UTC;
- o que acontece com o Pix das 23h59 quando chega a meia-noite: a soma recomeça?
- e o Pix agendado às 15h para executar às 21h: conta na janela da execução ou na do agendamento?

Cada buraco vira uma decisão que o agente toma sozinho, sem avisar, e que só aparece em produção. O
**desenvolvimento guiado por especificação** (SDD, de *spec-driven development*) é a disciplina de fechar
esses buracos antes do código, e de escrevê-los de um jeito que um teste confere.

## A cadeia: do porquê ao código

O SDD organiza o trabalho em camadas, cada uma com uma pergunta:

| Camada | Pergunta | Vive em |
| --- | --- | --- |
| **princípios** | o que vale para todo o projeto (teste antes, dinheiro em centavos, nada de *float*) | um arquivo do repositório, lido em toda tarefa |
| **especificação** | **o quê** e **por quê**, sem dizer como | `specs/<id>/spec.md` |
| **plano** | **como**: a abordagem, as decisões técnicas | `specs/<id>/plan.md` |
| **tarefas** | os passos pequenos, cada um com o seu "pronto" | `specs/<id>/tasks.md` |
| **implementação** | o código e os testes | o repositório |

A separação importa porque cada camada envelhece num ritmo. A especificação do limite noturno vale enquanto
a regra de negócio valer; o plano muda se o time trocar o banco; as tarefas acabam quando o PR entra.
Misturar "o quê" com "como" na especificação a faz envelhecer na velocidade do código.

O que **não** vai na especificação: a classe Java, a tabela do banco, o nome do método. Isso é do plano.
Uma especificação que diz "use um `HashMap` de soma por janela" amarrou o agente a uma implementação que
talvez seja errada, e não disse o que tinha de verdade a dizer.

## O requisito tem nome, e o critério é um teste

Duas convenções transformam um documento numa especificação que se verifica:

- **todo requisito tem identificador** (`RF-001`), único e estável. É por ele que o teste, a tarefa e o PR
  se referem ao requisito;
- **todo critério de aceite é um invariante verificável** (`CA-001-1`), a convenção deste catálogo: uma
  frase que um teste confere, com valor, borda e resultado.

Compare:

- *vago:* "o limite deve funcionar corretamente à noite";
- *verificável:* "CA-002-3: a soma das 23h59 continua valendo às 00h01 do dia seguinte: a janela é uma só."

O segundo vira um teste de tabela com relógio injetado. O primeiro vira o que o agente achar.

**Ambiguidade marcada, não adivinhada.** Quando a resposta ainda não existe ("o limite é por conta ou por
CPF?"), ela entra na especificação como **ambiguidade aberta**, com um dono e um prazo. O agente lê e não
decide; a revisão vê que falta uma decisão. O critério deste catálogo: num requisito da classe crítica da
matriz de delegação (marco 01), nenhuma especificação é aceita com ambiguidade aberta.

## Rastreabilidade nos dois sentidos

A rastreabilidade liga **requisito → critério → teste → tarefa**, e vale nos dois sentidos:

- todo critério é citado por pelo menos um teste (senão, ninguém prova que ele vale);
- todo teste novo aponta para um critério (senão, é comportamento que ninguém pediu, e que o agente
  inventou);
- toda tarefa referencia um requisito e declara o seu comando de verificação.

Uma anotação no teste (`// spec: CA-002-3`) basta. Um verificador cruza as duas listas. É barato, e pega
exatamente o modo de falha do marco 01: o teste que o agente escreveu para o que o código faz, não para o
que foi pedido.

**Tarefa pequena e independente.** A boa tarefa cabe num PR pequeno, toca um conjunto de arquivos que se
pode declarar, e tem um "pronto" que um comando confere. "Implementar o limite" não é tarefa; "T-002:
janela com relógio injetado e fuso, verificação: `go test ./limite -run TestJanela`" é.

## Deriva de especificação

O código muda; a especificação nem sempre acompanha. Essa é a **deriva de especificação**, e ela é o modo
como o SDD morre: depois de três meses, ninguém confia no documento, e o agente lê uma especificação que
descreve um sistema que não existe mais.

Duas respostas, e o time escolhe uma por escrito:

- **a especificação é a fonte da verdade:** mudança de comportamento começa pela especificação, e o
  verificador reprova o PR que muda o código sem mudar o documento (critério sem teste, teste sem critério);
- **o código é a fonte da verdade:** a especificação vale para a entrega e depois vira histórico, com data.
  Mais honesto para o que muda todo dia; inútil como contrato.

O que não funciona é a terceira via, a mais comum: a especificação "viva" que ninguém atualiza.

## Quando o SDD é cerimônia demais

Especificação, plano e tarefas para corrigir um erro de digitação é cerimônia, e cerimônia ensina o time a
pular o processo inteiro. O critério sai da matriz de delegação do marco 01:

- **mudança mecânica** (renomear, formatar, atualizar uma dependência de teste): o teste existente é a
  especificação;
- **regra de negócio fora do dinheiro:** especificação curta, com os critérios;
- **caminho do dinheiro:** a cadeia completa, sem ambiguidade aberta.

## Estudo de caso: este catálogo

O `tech-radar` é escrito assim. Cada trilha começa por um **plano** em Markdown, com tese, decisões, marcos,
invariantes e critérios de aceite; o agente de código executa uma fase por PR; cada PR declara o que mediu.
Dois exemplos públicos: o
[PR da Fase 0 desta trilha](https://github.com/julio-Pereira/tech-radar/pull/159) e a
[auditoria dela](https://github.com/julio-Pereira/tech-radar/blob/main/web/docs/AUDITORIA-ia-na-engenharia.md),
que registra cada desvio do plano: a categoria que não existia, a URL do Spec Kit que estava errada, o
comando novo do Spec Kit que o plano não listava.

E um exemplo de deriva, do próprio catálogo: os planos **não estão versionados no repositório**. Eles chegam
colados na conversa com o agente. A auditoria é que guarda o que mudou em relação a eles. Funciona para um
autor só; num time, o plano precisaria estar no repositório, com dono, ou ninguém saberia de qual versão a
auditoria fala.

> **Armadilha.** Escrever a especificação depois do código, a partir do código. Ela descreve o que o código
> faz, inclusive o erro, e dá ao erro o selo de "especificado".

> **O que o laboratório não reproduz.** O `speclint` verifica a forma: identificador, critério, teste,
> tarefa, termo vago. Ele não sabe se o critério está certo. "A janela vai das 20h às 6h" passa no
> `speclint` estando a regra certa ou errada; quem decide é o dono do domínio.

## Exemplo numa fintech

O primeiro PR do limite noturno chegou com os testes verdes e uma decisão que ninguém tinha tomado: o
agente usou o fuso do servidor. Em produção, rodando em UTC, a janela das 20h às 6h de São Paulo virou a das
17h às 3h. A especificação dizia "à noite". A correção:

- a especificação ganhou o fuso como critério (`CA-003-1`), com o caso "07h UTC é 04h em São Paulo" no teste
  de tabela;
- a borda da meia-noite e o Pix agendado viraram critérios; o agendado foi uma decisão do produto,
  registrada;
- o `speclint` entrou na esteira, e a especificação sem fuso, num requisito de janela, passou a não ser
  aceita na revisão.

## Hands-on

**Tutorial.** O formato neutro de especificação do `fin-assist`: `specs/limite-periodo/spec.md` (requisitos
`RF-NNN`, critérios `CA-NNN-k`, ambiguidades `[ABERTA]` e `[RESOLVIDA]`), `tasks.md` (tarefas `T-NNN` com
requisitos e comando de verificação) e o `speclint` (Go), que cruza a especificação com as anotações
`// spec:` dos testes.

**Desafio.** Especificar o limite por período do `pix-gateway`, com janela, valor, fuso, a borda da meia-noite
e o Pix agendado, e implementar o decisor (`limite/`) com relógio injetado até o `speclint` aprovar.

**Invariantes testáveis**

1. **Requisito com nome e critério.** Todo requisito tem identificador único e pelo menos um critério.
2. **Rastreabilidade nos dois sentidos.** Todo critério é citado por um teste, e todo teste cita um critério
   que existe.
3. **Termo vago reprova.** Os termos de uma lista (`rápido`, `adequado`, `quando necessário`, `se possível`,
   `razoável`, `eficiente`...) reprovam num requisito ou critério, salvo se marcados como ambiguidade
   aberta.
4. **Classe crítica sem ambiguidade aberta.** A especificação de classe `caminho-do-dinheiro` não é aceita com
   ambiguidade aberta.
5. **Tarefa verificável.** Toda tarefa referencia um requisito que existe e declara o comando de verificação.
6. **As bordas da janela são testes de tabela.** Início (20h00), fim (6h00), virada do dia e fuso, com
   casos que estejam **dentro num fuso e fora no outro** (07h UTC é 04h em São Paulo; 21h UTC é 18h). A revisão
   adversarial mostrou que os primeiros casos de fuso ("22h em São Paulo é 01h UTC", "12h UTC é 09h em São
   Paulo") ficavam do mesmo lado da janela nos dois fusos, e o decisor que ignorava o fuso passava. Os novos
   reprovam esse decisor. Os casos: início (20h00), fim (6h00), virada do dia e fuso
   (`America/Sao_Paulo` contra UTC), com relógio injetado.

Medido: a especificação do limite (4 requisitos, 7 critérios, 3 tarefas) passou no `speclint` sem
achados. Nove mutações, cada uma aplicada a uma cópia, foram **todas reprovadas** com o achado certo:

- o critério sem teste;
- o teste sem critério;
- o teste que cita critério inexistente;
- o requisito sem critério;
- o identificador repetido;
- o termo vago;
- a ambiguidade aberta na classe crítica;
- a tarefa sem verificação;
- a tarefa sem requisito.

E o termo vago marcado como ambiguidade aberta, fora da classe crítica, **passou**, como deve.

**Complemento.** Peça a um agente de código a implementação do limite a partir só da frase "o Pix noturno deve
ter limite", e depois a partir da especificação. Compare os dois patches contra os testes de borda.

**Checagem**

1. O que vai na especificação e o que vai no plano, e por que a separação importa?
2. Por que a rastreabilidade precisa valer nos dois sentidos?
3. O que é uma ambiguidade aberta, e por que ela reprova na classe crítica?
4. O que é deriva de especificação, e quais são as duas respostas honestas a ela?

## Principais aprendizados

- A especificação é o gargalo: o agente cumpre o escrito e adivinha o resto.
- Princípios, especificação (o quê), plano (como), tarefas, implementação: cada camada envelhece num ritmo.
- Requisito com identificador; critério de aceite como invariante verificável.
- Ambiguidade marcada, com dono; na classe crítica, nenhuma aberta.
- Rastreabilidade nos dois sentidos pega o teste que o agente escreveu para o código, e não para o pedido.
- Deriva: escolha por escrito quem é a fonte da verdade. Medido: o `speclint` pegou as nove mutações.
