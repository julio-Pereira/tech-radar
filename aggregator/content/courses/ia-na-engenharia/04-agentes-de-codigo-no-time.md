---
id: agentes-de-codigo-no-time
title: "Agentes de código no fluxo do time"
summary: "O agente entra no time pela mesma porta que qualquer autor: PR pequeno, gates verdes, aprovação de outra pessoa — com um detector para o truque de passar no teste mudando o teste. Contexto como engenharia (AGENTS.md com comandos que um teste executa), o laço planejar-agir-verificar e os testes rápidos como freio, escopo declarado, a revisão de código gerado pelo modo de falha, agente como autor e humano como aprovador — com um harness que pegou a asserção enfraquecida que a contagem não via: a pontuação de mutação caiu de 6/9 para 5/9."
estimatedMinutes: 65
reviewedAt: 2026-11-14
reviewEvery: 3m
competencies: [execucao, confiabilidade]
references:
  - title: "AGENTS.md"
    url: https://agents.md/
  - title: "DORA — State of AI-assisted Software Development (2025)"
    url: https://dora.dev/research/2025/dora-report/
---

## A mesma porta de qualquer autor

Um agente de código não ganha uma esteira própria. Ele entra pela porta que o time já tem para qualquer
pessoa nova: **PR pequeno, *gates* verdes, aprovação de outra pessoa**. As regras de `entrega-continua-e-devops`
valem igual, e o marco 01 diz por que elas ficam mais importantes: o agente aumenta o volume de mudança, e
o relatório do DORA de 2025 associa mais volume sem controle a mais instabilidade.

O que muda é que o agente tem modos de falha próprios, e o fluxo precisa de um detector para cada um.

## Contexto é engenharia

O agente não lembra de nada entre sessões (marco 01). O que ele sabe do repositório está escrito em algum
lugar que ele lê: o **arquivo de instruções do repositório**. O formato aberto mais adotado é o
**`AGENTS.md`**, "um README para agentes": um lugar previsível com os comandos de *build* e de teste, as
convenções e as instruções de PR. Várias ferramentas têm o seu equivalente com outro nome; a ideia é a
mesma.

O que vale pôr:

- **os comandos reais**, exatamente como se digitam: `go test ./limite`, e não "rode os testes";
- **as convenções que o código não mostra sozinho:** dinheiro em centavos, relógio injetado, a anotação do
  critério no teste;
- **os limites:** o que não tocar, quando parar e perguntar, o que exige revisão humana.

O que não vale pôr:

- **segredo**, nunca: o arquivo é lido por qualquer agente e entra no contexto de qualquer sessão
  (marco 06);
- **texto longo** que dilui o que importa. O agente lê tudo e não sabe o que é essencial;
- **comando que não funciona.** Um comando errado no arquivo de instruções é pior do que nenhum: o agente
  confia nele.

A regra do `fin-assist`: **todo comando citado no `AGENTS.md` roda num teste**. O arquivo de instruções
vira código, e quebra o *build* quando envelhece.

## O laço e o freio

O agente trabalha em laço: **planejar → agir → verificar → repetir**. A qualidade do "verificar" decide a
qualidade do resultado. Um teste que leva 40 minutos não entra no laço; o agente segue sem ele. Um teste
que leva 4 segundos entra, e corrige o agente a cada passo.

Por isso os **testes rápidos são o melhor freio** que um time pode dar a um agente: rápidos para rodar a
cada edição, e específicos o bastante para dizer o que quebrou. A pirâmide de testes e os *gates* de
`entrega-continua-e-devops/04` valem aqui com mais força.

**Tarefa pequena, escopo declarado.** A tarefa diz quais arquivos o agente pode tocar (o escopo, de
`tasks.md`, marco 02) e o tamanho máximo do PR pela classe (marco 01). Um patch que sai do escopo não é
"o agente sendo proativo"; é o modo de falha "escopo que cresce", e o *harness* o recusa. O PR pequeno de
`entrega-continua-e-devops/03` é o mesmo princípio.

**Ambiente isolado.** O agente roda num ambiente sem segredo de produção, com rede restrita e permissões
mínimas. O marco 06 trata disso inteiro.

## Revisar código gerado

A revisão de um PR de agente começa pelos modos de falha, nesta ordem:

1. **teste alterado:** algum arquivo de teste mudou? A asserção ficou mais fraca, um caso sumiu, um valor
   esperado foi trocado?
2. **asserção enfraquecida sem mudar de tamanho:** `||` virou `&&`, uma condição ganhou `&& false`, um
   `assertEquals` virou `assertNotNull`;
3. **erro engolido:** um `catch` vazio, um `_ = err`, um *retry* infinito que esconde a falha;
4. **dependência nova:** o agente adicionou um pacote? Ele existe, é o certo, tem versão fixada
   (`seguranca-aplicacao/12`)?
5. **código morto plausível:** a função bem escrita que ninguém chama.

As duas primeiras se detectam por máquina, e o *harness* do laboratório faz isso de dois jeitos:

- **contagem de asserções por teste:** não pode cair. Pega a asserção removida;
- **pontuação de mutação do módulo:** não pode cair. Pega a asserção que continua lá, mas não verifica mais
  nada. É o *gate* de mutação de `entrega-continua-e-devops/04`, agora como defesa contra o agente.

A contagem sozinha não basta: `if a || b` virando `if a && b` mantém a contagem e mata o teste. A mutação
sozinha é lenta para rodar em toda edição. As duas juntas fecham o caminho.

## Autor, aprovador e responsável

O agente é **autor**. Uma pessoa é **responsável** por ele: quem disparou a tarefa e responde pelo PR. E
outra pessoa é **aprovadora**. A segregação de `entrega-continua-e-devops/09` vale igual: autor (o agente e a
pessoa responsável) ≠ aprovador. A pessoa que pediu ao agente não aprova o PR que o agente escreveu.

A **atribuição** fica no *commit*: o agente aparece como coautor, e a pessoa como responsável. Quando um
incidente pergunta "quem mudou isso?", a resposta tem nome.

## Vários agentes, e quando parar

**Agentes em paralelo**, cada um numa cópia do repositório (*worktree*), multiplicam a produção e o custo de
integração: três PRs que mexem no mesmo módulo, abertos ao mesmo tempo, viram três conflitos. O paralelo
serve para tarefas independentes; para a mesma área, uma de cada vez.

**Quando parar o agente e escrever à mão:**

- ele propôs a terceira versão do mesmo patch, e cada uma quebra outra coisa;
- a tarefa exige uma decisão que não está escrita, e ele começa a decidir;
- o diff passou do tamanho da classe e continua crescendo;
- você já gastou mais tempo revisando do que levaria escrevendo.

**Propriedade intelectual e política da empresa.** O que se pode mandar para um modelo externo, de quem é o
código gerado, quais ferramentas são permitidas: a política da empresa decide, e a trilha não interpreta.
**Conferir** com o jurídico antes de adotar.

> **Armadilha.** Aprovar o PR do agente porque "os testes passaram", sem olhar se os testes mudaram. Um PR
> verde que altera o teste e a produção juntos é o caso que mais precisa de leitura.

> **O que o roteiro não reproduz.** O agente roteirizado aplica patches gravados; ele não explora o
> repositório, não reage ao erro do compilador nem inventa um caminho novo. O *harness* prova que o
> controle pega os patches conhecidos. Um agente real produz patches que ninguém gravou, e por isso o
> Complemento roda um.

## Exemplo numa fintech

O PR do limite por período chegou verde. O agente tinha implementado o limite, e o teste de
`CA-001-1` passava. Na revisão, o diff mostrava uma linha mudada no teste: `if l.Decidir(1) || l.Soma() !=
100000` tinha virado `if l.Decidir(1) && l.Soma() != 100000`. Com o `&&`, o teste só falhava se o decisor
aprovasse **e** a soma mudasse ao mesmo tempo; o código que aprovava acima do limite sem mudar a soma
passava. A contagem de asserções era a mesma. A correção:

- o *harness* passou a rodar a mutação do pacote antes e depois do patch, e a recusar a queda;
- o `AGENTS.md` ganhou o limite "não altere asserção de teste existente para fazer um teste passar: pare e
  pergunte";
- teste e produção no mesmo PR passaram a exigir a revisão reforçada (marco 01).

## Hands-on

**Tutorial.** O `AGENTS.md` do `fin-assist` (comandos, convenções e limites) e o agente roteirizado
reproduzindo a tarefa `T-001` do marco 02.

**Desafio.** O *harness* de aceitação de PR de agente (`harness/`): ele aplica o roteiro numa cópia do
módulo, roda os testes do pacote e julga o escopo, o tamanho, as asserções, a mutação e a evidência.

**Invariantes testáveis**

1. **Todo comando do `AGENTS.md` funciona.** Um teste extrai os comandos da seção "Comandos" e os executa.
   Medido: os três terminam com sucesso.
2. **O patch bom entra.** Medido: aceito, com a pontuação de mutação igual, 6/9 antes e depois.
3. **Asserção removida ou enfraquecida é recusada.** Medido:
   - removendo a asserção e o código, a contagem caiu (de 3 para 2 em `TestDecidir`, de 2 para 1 em
     `TestJanela`), e a mutação caiu de 6/9 para 3/6;
   - **enfraquecendo sem mudar a contagem** (`||` para `&&` e um `&& false`), a contagem não viu nada, e só a
     mutação pegou: de **6/9 para 5/9**.
4. **Fora do escopo, recusado.** Medido: o patch que também mexe em `speclint/speclint.go` foi recusado.
5. **PR grande demais, recusado.** Medido: 311 linhas, contra o limite de 120 da classe.
6. **Autor ≠ aprovador.** Medido: a pessoa responsável aprovando o próprio PR foi recusada, e o PR de agente
   sem pessoa responsável também.

A pontuação de mutação de partida é 6/9: três mutantes do decisor sobrevivem à suíte original. O *harness*
compara antes e depois, não exige 100%; os sobreviventes são a lista de testes que faltam.

Uma armadilha de ferramenta virou conteúdo: a primeira versão do *harness* rodava `go test ./...` dentro da
cópia, e isso rodava o próprio *harness*, que copiava o módulo de novo, em recursão, até encher o disco.
Passou a rodar só os pacotes da tarefa.

**Complemento.** Rode a mesma tarefa `T-001` com um agente de código real, em ambiente isolado, e passe o PR
dele pelo *harness*. Ele foi aceito? Se não, por qual motivo, e o motivo era um erro do agente ou do
*harness*?

**Checagem**

1. O que vai no arquivo de instruções do repositório, e por que todo comando dele deve rodar num teste?
2. Por que a contagem de asserções não basta, e o que a pontuação de mutação acrescenta?
3. Quem é autor, quem é responsável e quem aprova um PR de agente?
4. Quando é hora de parar o agente e escrever à mão?

## Principais aprendizados

- O agente entra pela porta de qualquer autor: PR pequeno, *gates* verdes, aprovação de outra pessoa.
- Contexto é engenharia: o `AGENTS.md` tem comandos reais, convenções e limites, e nenhum segredo; um teste
  roda os comandos.
- Testes rápidos são o freio do laço planejar-agir-verificar; escopo e tamanho são declarados pela tarefa.
- Revisão pelo modo de falha: teste alterado, asserção enfraquecida, erro engolido, dependência nova.
- Contagem de asserções e mutação, juntas. Medido: o `&&` no lugar do `||` só a mutação viu (6/9 → 5/9).
- Agente autor, pessoa responsável, outra pessoa aprovadora; a atribuição fica no *commit*.
