---
id: paisagem-de-sistemas
title: "Paisagem de sistemas e capacidades"
summary: "Antes de integrar, comprar ou migrar qualquer coisa, é preciso saber o que a empresa faz, qual sistema faz cada coisa e quem é dono — e isso quase nunca está escrito num lugar só."
estimatedMinutes: 55
references:
  - title: "Wardley Maps (Simon Wardley)"
    url: https://learnwardleymapping.com/
---

## Arquitetura corporativa, de soluções, de software: o que cada papel decide

**Arquitetura corporativa** decide no nível do portfólio inteiro — que sistemas existem, como se
relacionam com a estratégia do negócio. **Arquitetura de soluções** (esta trilha) decide no nível de
**integração entre sistemas** — como eles se conectam, onde comprar versus construir, onde hospedar.
**Arquitetura de software** (`arquitetura-de-software`) decide **dentro** de um sistema — estilos,
módulos, fronteiras internas. Os três papéis respondem perguntas em escalas diferentes, e confundir
os níveis é a origem de boa parte da frustração em discussões de arquitetura: alguém respondendo uma
pergunta de soluções com uma resposta de software, ou vice-versa.

## Mapa de capacidades × inventário de sistemas

Um **mapa de capacidades** lista o que o negócio **faz** — "autorizar pagamento", "avaliar risco de
crédito", "gerenciar consentimento" — independente de qual sistema faz isso hoje. Um **inventário de
sistemas** lista o que **existe** — nomes de sistemas, versões, donos. A relação entre os dois (qual
sistema implementa qual capacidade) é onde a maioria das lacunas de conhecimento organizacional
aparece: é comum encontrar uma capacidade sem sistema claro, e mais comum ainda encontrar a mesma
capacidade implementada em mais de um sistema, sem que ninguém tenha decidido isso de propósito.

## Sistema de registro: uma fonte da verdade por dado

Para cada dado importante, deveria existir **um** sistema de registro — a fonte definitiva daquele
dado, de onde todo outro lugar que o exibe deveria copiar ou consultar, nunca o contrário. Quando o
mesmo dado existe em dois lugares sem que um seja claramente a cópia do outro, a pergunta "qual
valor está certo quando os dois discordam?" não tem resposta — porque a pergunta "qual é o sistema
de registro?" nunca foi respondida primeiro.

## Classificação de dados e criticidade

Nem todo sistema e todo dado merecem o mesmo rigor de governança — classificar por **criticidade**
(o que acontece se este sistema ficar indisponível por uma hora? por um dia?) e por **sensibilidade**
do dado que ele guarda orienta onde investir atenção de arquitetura primeiro, em vez de tratar
todo o portfólio com a mesma régua.

## Estado atual × estado alvo, e as lacunas

Documentar o **estado atual** (como as coisas realmente são, inclusive os pontos feios que ninguém
gosta de admitir) separado do **estado alvo** (como deveriam ser) é o que torna uma lacuna visível e
discutível — sem essa separação, toda conversa sobre arquitetura mistura "o que temos" com "o que
queremos", e fica difícil saber se uma proposta está descrevendo a realidade ou uma aspiração.

```diagrama
aso-saldo-atual
aso-saldo-alvo
```

## Princípios arquiteturais: poucos, e verificáveis

Uma lista de vinte princípios genéricos ("devemos ser ágeis", "devemos ser seguros") não orienta
nenhuma decisão concreta. Poucos princípios, cada um **verificável** em uma decisão real ("todo dado
tem um sistema de registro único" é verificável: ou tem, ou não tem), valem mais do que uma lista
longa e abstrata que ninguém consulta na hora de decidir algo.

## Mapas evolutivos (Wardley) como ferramenta de conversa

Um **mapa de Wardley** posiciona capacidades num eixo de evolução — de genesis (nunca visto antes,
experimental) a commodity (padronizado, disponível de qualquer fornecedor) — não como ferramenta de
medição precisa, mas como **ferramenta de conversa**: ajuda o time a concordar sobre o que é
diferenciador (vale construir e manter vantagem) e o que já é commodity (vale comprar, sem gastar
energia de engenharia reinventando). A utilidade está na discussão que o mapa provoca, não no mapa
em si como artefato final.

## Dependência entre capacidades

Capacidades não são independentes — "autorizar pagamento" depende de "avaliar risco" que depende de
"ter o perfil do cliente atualizado". Mapear essas dependências explicitamente é o que permite, mais
tarde (marco 07), sequenciar uma modernização de portfólio sem quebrar algo que dependia de um
sistema que foi movido ou desligado antes da hora.

## Como começar sem um projeto de seis meses

Um levantamento completo de capacidades e sistemas, feito do zero, é um projeto grande demais para
começar — a saída prática é levantar o que **já existe** nas ADRs e nos modelos C4 (`system-design/01`)
de cada trilha/sistema, e consolidar, em vez de reinventar a descoberta a partir do zero.

## Exemplo numa fintech

"Saldo" existe em três lugares: no core bancário, no `ledger-core`, e numa planilha da tesouraria
mantida manualmente para fins de relatório interno. Qual é o sistema de registro? A resposta correta
— "o `ledger-core`, porque é onde a transação é a fonte original" — só é óbvia depois de alguém
perguntar explicitamente; antes da pergunta, os três lugares coexistiam sem ninguém ter decidido
formalmente qual copia de qual.

## Hands-on

**Tutorial.** Construa `paisagem/capacidades.yaml` e `sistemas.yaml` do `fin-platform`, com a
relação explícita capacidade → sistema.

**Desafio.** Encontre capacidades duplicadas (implementadas em mais de um sistema sem decisão) e
órfãs (sem sistema nenhum).

**Invariantes testáveis**

1. Toda capacidade tem **exatamente um** sistema de registro declarado.
2. Todo sistema tem **dono**, **criticidade** e **classificação de dado** declarados — nenhum campo
   ausente.
3. Nenhum **sistema órfão** (sem capacidade associada) e nenhuma **capacidade sem sistema**.
4. O grafo de dependência entre capacidades é exibido, e **ciclos** são **listados** explicitamente,
   nunca escondidos ou ignorados silenciosamente.

**Complemento.** Marque, num mapa de Wardley em texto, o que é commodity no seu próprio contexto de
trabalho e o que é diferenciador — e use essa marcação como ponto de partida de uma conversa real
sobre comprar × construir.

**Checagem**

1. Qual é a diferença entre arquitetura corporativa, de soluções e de software, e por que confundir
   os níveis causa frustração em discussões?
2. O que significa "sistema de registro", e o que acontece quando dois sistemas guardam o mesmo
   dado sem um ser claramente cópia do outro?
3. Por que separar estado atual de estado alvo torna uma lacuna discutível, em vez de misturada com
   aspiração?
4. Qual é o valor prático de um mapa de Wardley, dado que ele não é uma medição precisa?

> **Reencontro — `system-design/01`; `system-design/03`; `arquitetura-eventos/02`;
> `dados-distribuidos/10`.** O modelo C4 e ADR de `system-design/01` são exatamente o material já
> existente que este marco recomenda consolidar em vez de reinventar do zero. A decisão de onde
> cortar o sistema, em `system-design/03`, já tocou a pergunta de capacidade versus sistema num
> nível mais técnico. O bounded context de `arquitetura-eventos/02` é a mesma ideia de fronteira,
> aplicada a modelo de domínio em vez de sistema de registro. E a identidade e unicidade de
> `dados-distribuidos/10` é o problema concreto que aparece quando o sistema de registro de um dado
> não está claro.

## Principais aprendizados

- Arquitetura corporativa, de soluções e de software decidem em escalas diferentes — confundir os
  níveis é a origem de boa parte da frustração em discussões de arquitetura.
- Um sistema de registro único por dado é o que torna "qual valor está certo" uma pergunta com
  resposta — sem ele, a pergunta não tem como ser respondida quando dois lugares discordam.
- Separar estado atual de estado alvo torna uma lacuna visível e discutível, em vez de misturada com
  aspiração.
- Poucos princípios arquiteturais, cada um verificável numa decisão real, valem mais que uma lista
  longa de afirmações genéricas que ninguém consulta.
- Um mapa de Wardley vale pela conversa que provoca sobre o que é diferenciador versus commodity,
  não como medição precisa.
