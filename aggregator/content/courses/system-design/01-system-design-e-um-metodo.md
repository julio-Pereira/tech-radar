---
id: system-design-e-um-metodo
title: "System design é um método, não um repertório"
summary: "O ciclo requisito → número → corte → contrato → estado → fluxo → falha → evolução → defesa, e por que a ordem importa. Ambiguidade é a primeira entrega, não um obstáculo."
estimatedMinutes: 55
references:
  - title: "The C4 model for visualising software architecture"
    url: https://c4model.com/
  - title: "Architecture Decision Records (ADR)"
    url: https://adr.github.io/
---

## Uma disciplina de decisão, não uma coleção de respostas

A maioria do material de system design ensina a decorar desenhos — "assim se projeta um
encurtador de URL, assim se projeta um feed". Isso falha no primeiro requisito que não bate com o
modelo decorado. O que esta trilha ensina é um **método**: um ciclo fixo de perguntas que, repetido
em qualquer domínio, produz um desenho defensável.

```
requisito → número → corte → contrato → estado → fluxo → falha → evolução → defesa escrita
```

A ordem importa porque cada etapa é insumo da próxima. Cortar o sistema (bloco B) antes de ter os
números (bloco A) produz módulos do tamanho errado — cedo demais para saber onde a carga concentra.
Desenhar o contrato de API antes de saber o que é síncrono e o que é assíncrono (bloco C) produz um
contrato que a implementação não consegue cumprir. A defesa escrita vem por último porque ela é a
prova de que todo o resto foi de fato decidido, não presumido.

## O que muda quando o sistema move dinheiro

Três coisas distinguem system design de fintech do material genérico:

**Invariantes.** Conservação ("a soma não muda"), unicidade ("nunca duas vezes o mesmo débito") e
ordem ("o estorno depois do débito que ele estorna") não são "requisitos não-funcionais" — são o
contrato que, se quebrado, vira prejuízo real e, com frequência, prejuízo de terceiros.

**Falha é o caso normal.** Um timeout no SPI (Sistema de Pagamentos Instantâneos) depois que o
débito já aconteceu não é exceção: é rotina estatística em qualquer volume razoável. Um desenho que
só contempla o caminho feliz não é um desenho de fintech — é uma demonstração.

**O regulador e o auditor leem o desenho.** "Escala" sem número não é argumento em nenhum contexto
sério, e é particularmente insuficiente quando alguém pode pedir para ver a conta.

## Requisito, restrição, e a ambiguidade como primeira entrega

**Requisito funcional** é o que o sistema faz. **Requisito não-funcional** é como ele faz —
latência, disponibilidade, consistência. **Restrição** é algo que você não escolhe: um prazo
regulatório, uma tecnologia já instalada, um orçamento.

A habilidade que separa sênior de pleno aqui não é "ter a resposta rápido" — é **fazer as perguntas
que mudam o desenho**. "Projete um sistema de pagamentos" tem dezenas de leituras possíveis, e três
ou quatro delas mudam a arquitetura inteira: é P2P ou também B2B? O dinheiro fica retido em algum
momento ou sempre flui direto? Existe estorno? Isso roda num país com um SPI centralizado (como o
Pix) ou precisa falar com múltiplos trilhos? Entregar um desenho sem ter feito essas perguntas é
decidir por omissão — e decidir por omissão é a decisão mais cara de todas, porque ninguém assinou
embaixo dela.

## C4 como linguagem comum, não como burocracia

O **C4** dá quatro níveis de zoom — Contexto, Container, Componente, Código — cada um para uma
audiência diferente. O erro mais comum é usar o nível errado para a audiência: um diagrama de
Componente para a diretoria (ruído) ou um diagrama de Contexto para quem vai implementar (vazio
demais para decidir qualquer coisa). Os níveis 1 e 2 — Contexto e Container — bastam para a maior
parte das decisões de arquitetura que esta trilha cobre; o nível de Componente entra quando o corte
de um container específico (bloco B) precisa de detalhe.

## ADR como unidade de decisão

Uma **ADR** (Architecture Decision Record) registra: contexto (o que motivou a decisão),
decisão (o que foi escolhido), alternativas consideradas e por que foram descartadas, consequências
(o que fica mais fácil e o que fica mais difícil), e — o campo que a maioria dos modelos de ADR
esquece — o **gatilho de reversão**: sob qual condição observável esta decisão deve ser revisitada.
Sem gatilho de reversão, uma ADR é um registro histórico; com ele, é um compromisso operacional.
Cada marco desta trilha produz pelo menos uma.

> **Reencontro adiante — `observabilidade/12`.** "Requisito não-funcional" vira número concreto
> quando se transforma em SLI/SLO — o marco 02 usa exatamente esse vocabulário para orçamento de
> latência e capacidade. E `spring-boot/13` já mostra fronteira de módulo **verificada por
> teste**, não só por diagrama — a mesma disciplina que o bloco B desta trilha aplica ao corte
> entre serviços.

## Exemplo numa fintech

"Projete um app de pagamentos" vira, depois de doze perguntas de esclarecimento, um escopo
reconhecível: iniciação Pix P2P e B2B, limite diário configurável por conta, conciliação D+1 com o
SPI, e conformidade com os requisitos de continuidade do Banco Central. Três das doze perguntas —
"existe estorno?", "o limite é por conta ou por titular?", "qual o volume de pico esperado no
lançamento?" — mudam a arquitetura de forma mensurável: a primeira decide se existe estado
"revogável" no fluxo; a segunda decide a chave de particionamento do limite; a terceira decide se o
desenho do dia 1 já precisa de sharding ou se um Postgres bem indexado resolve por um ano.

## Hands-on

**Tutorial.** Modele o `fin-platform` em C4, níveis 1 (Contexto: o sistema e quem interage com
ele — cliente, SPI, bureau de crédito) e 2 (Container: `ledger-core`, `pix-gateway`,
`fin-blueprint` e os demais componentes das outras trilhas). Escreva a primeira ADR do projeto,
`adr/0001-escopo-e-fronteiras.md`, com as quatro seções e o gatilho de reversão.

**Desafio.** Escreva um `adr-lint`: um script (shell ou a linguagem de sua preferência) que lê todo
arquivo em `adr/` e falha se faltar qualquer uma das quatro seções obrigatórias ou o gatilho de
reversão.

**Invariantes testáveis**

1. O `adr-lint` reprova uma ADR de teste que não tem a seção de gatilho de reversão.
2. O `adr-lint` aprova uma ADR com as quatro seções completas.
3. Todo contêiner do modelo C4 nível 2 tem um campo `owner` (pessoa ou time) e um campo
   `criticidade` (alta/média/baixa) — um validador simples confirma isso lendo o modelo como dado
   estruturado, não como prosa.
4. O modelo C4 compila (ou, na ausência de uma ferramenta de C4-as-code, é validado por um script
   que confere a presença dos dois níveis e das relações entre os contêineres).

**Complemento.** Pegue uma decisão de arquitetura que você já tomou em outro projeto — real, não
hipotética — e escreva-a como ADR agora, retroativamente. Identifique qual era o gatilho de
reversão que ninguém tinha escrito na época, e se ele já deveria ter disparado.

**Checagem**

1. Por que cortar o sistema antes de ter os números do bloco A produz módulos do tamanho errado?
2. O que diferencia um requisito não-funcional de uma restrição?
3. Qual campo de uma ADR a maioria dos modelos esquece, e por que ele é o que transforma registro
   em compromisso?
4. Dê um exemplo de pergunta de esclarecimento que muda a arquitetura de um sistema de pagamentos.

## Principais aprendizados

- System design é um ciclo de nove etapas, em ordem — requisito, número, corte, contrato, estado,
  fluxo, falha, evolução, defesa — porque cada etapa é insumo da seguinte.
- Fintech muda três coisas: invariantes que custam dinheiro real, falha como caso normal (não
  exceção), e o desenho sendo lido por regulador e auditor.
- As perguntas de esclarecimento que mudam a arquitetura são a primeira entrega — decidir por
  omissão é a decisão mais cara, porque ninguém assinou embaixo dela.
- C4 é linguagem comum por nível de zoom: use Contexto/Container para a maioria das decisões, e
  reserve Componente para onde o corte específico de um container precisa de detalhe.
- ADR sem gatilho de reversão é história; com gatilho, é compromisso operacional — e é o que esta
  trilha cobra em cada marco.
