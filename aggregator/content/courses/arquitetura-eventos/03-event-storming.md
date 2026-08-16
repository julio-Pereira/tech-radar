---
id: event-storming
title: "Event storming: descobrir os eventos junto com o negócio"
summary: "A gramática dos post-its, os três níveis da técnica, e por que o hotspot — o ponto em que o negócio discorda de si mesmo — é o item mais valioso da sessão."
estimatedMinutes: 45
references:
  - title: "EventStorming (Alberto Brandolini)"
    url: https://www.eventstorming.com/
  - title: "Martin Fowler — DomainDrivenDesign"
    url: https://martinfowler.com/bliki/DomainDrivenDesign.html
  - title: "Microservices.io — Domain event"
    url: https://microservices.io/patterns/data/domain-event.html
---

## Por que não dá para descobrir eventos sozinho

O marco 02 deu a régua: agregado é fronteira de consistência, e a invariante decide onde
ela passa. Falta a matéria-prima — **quais eventos existem no negócio**. E essa informação
não está no banco de dados, não está no código e não está com você.

Ela está espalhada entre a pessoa de operações que sabe o que acontece quando o arquivo do
PSP chega com uma linha a mais, a de compliance que sabe o que o BACEN pergunta, e a de
produto que sabe por que existe a regra de "até 20h". Event storming é o formato que junta
essas pessoas numa parede por algumas horas e extrai isso em forma de eventos.

O output não é um diagrama bonito. É um vocabulário compartilhado e uma lista de coisas que
ninguém sabia que ninguém sabia.

## A gramática dos post-its

A técnica tem uma convenção de cores. O que importa não é a cor exata, é que cada forma
tenha um significado único e todos na sala saibam qual:

| Elemento | Papel | Exemplo no `fin-flow` |
| --- | --- | --- |
| **Evento** (laranja) | fato consumado, no passado | `PagamentoAutorizado` |
| **Comando** (azul) | intenção, pode ser recusada | `SolicitarLiquidação` |
| **Ator** (amarelo pequeno) | quem dispara o comando | cliente, operador, temporizador |
| **Agregado** (amarelo grande) | quem decide e protege a invariante | `Conta`, `Liquidação` |
| **Política** (lilás) | "sempre que X, então Y" | "sempre que autorizado, solicitar liquidação" |
| **Read model** (verde) | o que alguém precisa ver para decidir | extrato, painel de liquidações |
| **Sistema externo** (rosa) | o que está fora do seu controle | PSP, BACEN, bureau de crédito |
| **Hotspot** (vermelho) | discordância, dúvida, "depende" | "e se o estorno chegar depois do fechamento?" |

A frase que estrutura tudo: **ator dispara comando → agregado decide → evento acontece →
política reage → novo comando**. Quando o fluxo na parede não cabe nessa frase, ou falta um
elemento, ou existe uma regra que ninguém verbalizou.

## Os três níveis

**Big picture.** O fluxo inteiro na parede, em ordem cronológica, sem se preocupar com
agregado nem com precisão. O objetivo é ver a extensão do processo e onde ele atravessa
times. Duas a quatro horas, muita gente, pouca estrutura. É aqui que aparecem os eventos
que ninguém do time técnico conhecia.

**Process modeling.** O nível em que a frase acima é aplicada: cada evento ganha o comando
que o causou, o agregado que decidiu e a política que reage a ele. É onde as fronteiras
começam a se desenhar sozinhas — quando um grupo de eventos gira em torno das mesmas
invariantes, você está olhando um agregado.

**Design level.** O detalhe que vira código: campos do evento, o que o agregado precisa
guardar para decidir, o que é consulta e o que é comando. Faz sentido para um contexto por
vez, e com pessoas técnicas.

Não é obrigatório subir os três degraus. Muito time tira 80% do valor do big picture e
para ali — e isso já é melhor do que a alternativa habitual, que é modelar sozinho.

## Como conduzir (inclusive solo)

Regras que salvam a sessão:

- **Eventos no passado, sempre.** Alguém vai escrever `ValidarPagamento`. Isso é comando —
  reescreva junto com a pessoa, na hora. A disciplina do nome é a disciplina do conceito
  (marco 01).
- **Ordem cronológica na parede**, esquerda para a direita. Divergência sobre a ordem já é
  descoberta.
- **Não resolva o hotspot na hora.** Marque, siga em frente, volte depois. Discussões de
  hotspot consomem a sessão inteira se você deixar.
- **Ninguém tem autoridade sobre a parede.** A pessoa de operações escreve tanto quanto o
  arquiteto — a assimetria mata a técnica.
- **Compliance na sala.** Numa fintech, metade das regras de negócio existe por causa de
  uma norma. Descobrir isso na modelagem é barato; descobrir na homologação, não.

**Solo funciona?** Funciona como esboço. Você escreve o fluxo, marca os hotspots, e usa a
lista de hotspots como pauta da conversa com quem sabe. É exatamente o que o hands-on pede:
o valor está em transformar suas dúvidas implícitas numa lista explícita de perguntas.

## Da parede ao repositório

A parede evapora; o repositório fica. Cada evento vira um verbete com quatro campos:

```
Evento:      PagamentoAutorizado
Dono:        contexto de Risco
Disparado por: comando AutorizarPagamento, após decisão do antifraude
Consumidores conhecidos: fin-flow (liquidação), projeção de extrato, data lake
Hotspots relacionados: e se a autorização expirar antes da liquidação?
```

Esse arquivo — `EVENTOS.md` — é o insumo direto do marco 05, onde cada verbete ganha
envelope, versão e política de evolução. E é o documento que responde, sem reunião, à
pergunta que todo consumidor novo faz: "que evento eu escuto para saber que um pagamento
foi aprovado?".

Dois cuidados: **evento sem consumidor conhecido** não é necessariamente errado (pode ser
histórico ou auditoria), mas merece a pergunta "então por que ele existe?". E **evento com
sete consumidores** é um ponto de acoplamento que vai doer quando mudar — ele é o primeiro
candidato a ter contrato bem versionado.

## Exemplo numa fintech

Modelando a liquidação D+1 com o time de operações, o fluxo na parede sai mais ou menos
assim:

```
[cliente] → SolicitarPagamento → (Conta) → PagamentoIniciado
                                            ↓ política: submeter ao risco
                                          PagamentoAutorizado
                                            ↓ política: solicitar liquidação
                                          LiquidaçãoSolicitada
                                            ↓ (janela D+1, temporizador)
                                          LiquidaçãoConfirmada  ← [PSP]
                                            ↓ política: notificar
                                          ClienteNotificado
```

E então alguém de operações diz a frase que vale a sessão inteira:

> "Isso quando dá certo. Se o estorno chega **depois** do fechamento da janela, a gente
> resolve no dia seguinte, na mão."

Isso é um **hotspot**, e é o achado mais valioso do dia. Ele revela: (a) existe um processo
manual que ninguém modelou, (b) existe uma ordem de eventos que o sistema não trata, e (c)
existe uma decisão de negócio — quem paga a diferença? — que nunca foi escrita.

Esse hotspot específico vira o desafio da saga no marco 09, onde ele deixa de ser "a gente
resolve na mão" e passa a ser uma compensação com estado explícito. E repare que ele não
apareceu por análise técnica: apareceu porque alguém de operações estava na sala.

## Hands-on

**Tutorial — event storming solo do `fin-flow`.**

1. Numa parede física com post-its, ou num quadro virtual, escreva **em laranja** todos os
   eventos do fluxo de pagamento que você conhece, em ordem cronológica. Não filtre.
2. Para cada evento, adicione **em azul** o comando que o causou e **em amarelo** quem
   decidiu. Se você não souber quem decide, isso é um hotspot — marque em vermelho.
3. Adicione **em lilás** as políticas ("sempre que… então…"). Toda seta entre um evento e o
   próximo comando é uma política; escreva-a, mesmo que pareça óbvia.
4. Marque **em rosa** tudo que está fora do seu controle: PSP, BACEN, o app do cliente.
5. Marque **em vermelho** toda dúvida, toda discordância e todo "depende". Não resolva.
6. Transcreva para `EVENTOS.md`, um verbete por evento, com nome, dono, disparo e
   consumidores conhecidos. Liste os hotspots numa seção própria, com a pergunta que cada
   um levanta.
7. `git commit -m "docs: catálogo inicial de eventos do fin-flow"`.

**Desafio.** Pegue os três hotspots mais desconfortáveis e escreva, para cada um, a
pergunta exata que você faria a uma pessoa específica do negócio — nome do papel incluído.
Se você não consegue nomear quem responde, o hotspot é maior do que parecia: você
descobriu que a decisão não tem dono.

**Invariantes testáveis**

1. Todo evento do `EVENTOS.md` está nomeado no passado e tem exatamente um dono.
2. Toda transição entre dois eventos tem uma política escrita, ou está marcada como
   hotspot — não existe seta sem explicação.
3. Todo hotspot tem uma pergunta formulada e um papel responsável por responder.

**Complemento.** Compare o seu `EVENTOS.md` com o `CONTEXTOS.md` do marco 02. Algum evento
está sendo emitido por um contexto que não é dono da invariante correspondente? Esse é o
tipo de inconsistência que só aparece quando os dois documentos existem.

**Checagem**

1. Qual é a frase que estrutura o process modeling, e o que significa quando o fluxo não
   cabe nela?
2. Por que não se resolve um hotspot durante a sessão?
3. O que exatamente vira o `EVENTOS.md`, e para que ele serve no marco 05?
4. Por que compliance deveria estar na sala numa fintech — e o que se perde sem essa pessoa?

## Principais aprendizados

- Os eventos do negócio não estão no banco nem no código: estão distribuídos entre pessoas,
  e event storming é o formato que os extrai em algumas horas.
- A gramática é uma só: ator dispara comando → agregado decide → evento acontece → política
  reage. Fluxo que não cabe nela tem elemento faltando.
- Os três níveis — big picture, process modeling, design level — não precisam ser subidos
  todos; o big picture sozinho já vale mais que modelar em silêncio.
- O hotspot é o item mais valioso da sessão: é onde o negócio discorda de si mesmo, e é
  onde moram os processos manuais que ninguém modelou.
- A parede evapora; o `EVENTOS.md` fica, e é o insumo direto do contrato de evento do
  marco 05.
