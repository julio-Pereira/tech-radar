---
id: estrategia-tecnica
title: "Estratégia técnica"
summary: "Estratégia não é lista de metas nem de tecnologias: é um diagnóstico, uma política que escolhe e ações coordenadas — e a parte mais valiosa é o que fica de fora."
estimatedMinutes: 70
competencies: [estrategia]
references:
  - title: "Will Larson — Irrational Exuberance"
    url: https://lethain.com/
---

## O núcleo da estratégia

Uma estratégia tem três partes, nessa ordem: um **diagnóstico** (o que está de fato acontecendo,
com evidência — igual ao marco anterior), uma **política orientadora** (uma escolha que restringe
opções: "preferimos X a Y") e **ações coordenadas** (passos concretos, com dono e critério, que
seguem da política). Sem diagnóstico, a política não tem base. Sem política, as ações não têm
coerência entre si — são só uma lista de projetos paralelos. O núcleo inteiro existe para produzir
**coerência**: cada ação deveria ser rastreável até o item do diagnóstico que ela ataca.

## Estratégia ruim: os quatro disfarces mais comuns

**Lista de desejos** ("ser líder de mercado em confiabilidade") não é estratégia — é aspiração sem
mecanismo. **"Ser o melhor"** é o mesmo problema com outras palavras. **Slogan** ("mobile first",
"cloud native") soa como direção mas não restringe nenhuma decisão real — qualquer ação pode ser
justificada por um slogan vago o suficiente. **Metas no lugar de política** ("reduzir tempo de
resposta em 30%") é um número sem o mecanismo que o produz — uma meta não diz **como** chegar lá,
e sem o "como" ela não guia decisão nenhuma no dia a dia.

## Visão, princípios de engenharia e estratégia: três coisas diferentes

**Visão** é onde você quer chegar, num horizonte longo, sem dizer como ("ser a plataforma de
pagamento mais confiável do mercado"). **Princípios de engenharia** são declarações que **escolhem
um lado** de um trade-off recorrente ("preferimos consistência a disponibilidade no ledger";
"preferimos simplicidade operacional a flexibilidade de configuração") — eles orientam decisões do
dia a dia sem precisar de uma estratégia nova a cada vez. **Estratégia** é o meio-termo: mais
concreta que visão, mais situacional que princípio, válida por um período definido e revisada
quando o contexto muda.

## Apostas e não-objetivos

Toda estratégia real faz **apostas** — escolhas que custam alguma coisa se estiverem erradas,
porque uma estratégia que não arrisca nada também não está escolhendo nada. E toda estratégia boa
declara **não-objetivos**: o que explicitamente não será perseguido neste período, mesmo sendo
desejável em abstrato. A parte mais valiosa de uma estratégia, com frequência, é o que ela deixa de
fora — porque é isso que protege o time de se dispersar atrás de toda oportunidade que aparece.

## Alinhamento com a estratégia do negócio

Uma estratégia técnica desconectada da estratégia do negócio compete por recursos sem conseguir se
justificar. Numa fintech, isso significa entender, no mínimo em que direção a empresa está
investindo (crescimento agressivo de usuários versus consolidação de margem, por exemplo) e quais
restrições regulatórias pesam mais no próximo período — não para que a engenharia vire refém do
negócio, mas para que a conversa sobre prioridade aconteça em termos que o negócio reconhece.

## Mapas de evolução (opcional)

Mapas de evolução (na linha do trabalho de Simon Wardley, aqui em nível introdutório) posicionam
componentes de um sistema num eixo que vai de "novidade sob medida" a "*commodity* padronizada" —
útil para decidir onde vale a pena construir algo próprio (onde o componente ainda é diferencial) e
onde vale comprar ou usar o que já é padrão de mercado (onde o componente já virou *commodity*).
Esta ferramenta é opcional nesta trilha — o essencial é o núcleo da estratégia; mapas de evolução são
um recurso a mais, não um requisito.

## Roadmap por resultados × por entregas

Um roadmap tradicional lista entregas ("lançar X no trimestre 2"); um roadmap **por resultados**
organiza por "agora / próximo / depois" em torno de **resultados** desejados ("reduzir o tempo de
liquidação em Y"), deixando a entrega específica como implementação que pode mudar sem que o
roadmap inteiro precise ser reescrito. A vantagem não é cosmética: quando o roadmap é de entregas,
qualquer mudança de plano parece uma falha; quando é de resultados, mudar a tática mantendo o
resultado é o esperado.

## Estratégia de dívida técnica

Dívida técnica, tratada estrategicamente, não é "pagar tudo" nem "ignorar tudo" — é uma decisão
sobre **o que pagar agora** (dívida que está no caminho crítico de iniciativas futuras, cujos juros
crescem) e **o que conviver** (dívida isolada, de baixo custo de manutenção, que não compete por
atenção). `arquitetura-de-software/06` trata dívida como registro com juros; este marco e o marco
12 tratam a decisão de pagar ou conviver como decisão **financeira** — custo de atraso comparado ao
custo de pagar agora.

## Como testar uma estratégia

Duas perguntas separam estratégia real de lista de boas intenções: **ela exclui alternativas
plausíveis?** (se qualquer ação concebível é compatível com a estratégia, ela não está escolhendo
nada) e **alguém razoável a negaria?** (se ninguém discordaria da frase — "devemos ser
confiáveis" — ela não é uma escolha, é um consenso vazio). Uma política orientadora de verdade é
specífica o suficiente para que uma pessoa razoável pudesse, de boa fé, discordar dela.

## Revisão periódica, gatilhos e difusão

Estratégia não é documento estático: tem **data de revisão** e **gatilhos** que forçam revisão
antecipada (mudança relevante no diagnóstico, apostas que não se confirmaram). E uma estratégia que
não é **difundida** — lida, entendida, usada nas decisões do dia a dia — não vale o papel em que
está escrita; o marco 08 trata a escrita e os rituais que fazem uma estratégia circular de verdade.

*Evidência.* [P] o núcleo da estratégia (diagnóstico, política, ações coerentes) e a prática de
princípios de engenharia vêm de autores de referência da área, não de estudo controlado. [O] o
formato do roadmap e o uso (ou não) de mapas de evolução dependem fortemente da cultura da
organização.

## Exemplo numa fintech

A "estratégia" do Time Pix, como estava escrita, era "migrar tudo para a nuvem e usar Kafka em
tudo" — um slogan disfarçado de estratégia. Reescrita com o núcleo: o **diagnóstico** mostra que a
latência de conciliação vem da dependência síncrona com um sistema legado, e que esse sistema tem
um único dono (risco de fator-ônibus). A **política** é isolar o legado atrás de um *anti-corruption
layer* e só migrar componentes que tenham dono designado. As **ações** têm dono, prazo e critério de
sucesso específicos — e a lista de não-objetivos deixa explícito que a fila de eventos **não** será
trocada neste período, mesmo sendo tecnicamente interessante.

```diagrama
lt-estrategia
```

## Hands-on

**Tutorial.** Escreva a estratégia técnica do `fin-platform` a partir do diagnóstico produzido no
marco 02 e da revisão arquitetural de `arquitetura-de-solucoes/09`.

**Desafio.** Reescreva uma "estratégia" fictícia que é, na prática, uma lista de metas — transforme
em diagnóstico, política e ações.

**Invariantes testáveis**

1. `leadkit lint estrategia` **reprova** um documento sem **diagnóstico**, sem **política
   orientadora**, com **menos de 3 ações coordenadas com dono e critério de sucesso**, ou com
   **menos de 2 não-objetivos** — cada ausência listada separadamente.
2. O *lint* reprova documentos cujas "ações" são só metas numéricas no padrão "aumentar X em Y%"
   sem um mecanismo associado — detectado por não haver política referenciada pela ação.
3. Cada ação referencia o item específico do diagnóstico que ela ataca — o *lint* constrói um grafo
   e reprova **ação órfã** (sem item de diagnóstico associado) e **item de diagnóstico sem ação**
   (reconhecido, mas não endereçado nem declarado como não-objetivo).
4. Os princípios de engenharia declarados têm o formato "preferimos X a Y" — teste de forma sobre
   cada princípio listado.
5. **Demonstração do limite:** uma estratégia-gabarito ruim (lista de metas reescrita com
   vocabulário de política, mas sem mecanismo real) **passa** no *linter* estrutural, e uma
   estratégia boa também passa — a rubrica humana, não o *linter*, é o que as separa por qualidade.

**Complemento.** Escreva o "teste do rival razoável" para a sua estratégia atual: quem discordaria
dela, e por que a discordância seria razoável, não só teimosia.

**Checagem**

1. Por que uma meta numérica sozinha ("reduzir tempo de resposta em 30%") não é, segundo este
   marco, uma estratégia?
2. Por que os não-objetivos são descritos como, com frequência, a parte mais valiosa de uma
   estratégia?
3. Qual a diferença entre um princípio de engenharia e uma estratégia, segundo este marco?
4. O que significa, na prática, "uma pessoa razoável discordaria desta frase" como teste de
   qualidade de uma política orientadora?
5. Por que o marco trata dívida técnica como decisão financeira, e não como débito moral a ser
   sempre pago o quanto antes?
6. Por que uma estratégia sem data de revisão e sem gatilhos de revisão antecipada é considerada
   incompleta neste marco?

> **Pontes — `arquitetura-de-solucoes/07`; `arquitetura-de-solucoes/06`; `arquitetura-de-software/06`.**
> O portfólio e sequenciamento de `arquitetura-de-solucoes/07` é onde a estratégia técnica deste
> marco se conecta a decisões concretas de priorização entre iniciativas. Os direitos de decisão de
> `arquitetura-de-solucoes/06` são o mecanismo que torna as ações desta estratégia executáveis — sem
> saber quem decide, uma ação coordenada não sai do papel. E o registro de dívida técnica com juros
> de `arquitetura-de-software/06` é o dado de entrada que a estratégia de dívida deste marco usa
> para decidir o que pagar agora.

## Principais aprendizados

- O núcleo da estratégia é diagnóstico → política orientadora → ações coordenadas, nessa ordem.
- Lista de desejos, slogan e meta numérica isolada são disfarces comuns de estratégia ruim.
- Não-objetivos — o que fica de fora — são, com frequência, a parte mais valiosa do documento.
- Uma política orientadora de verdade é específica o suficiente para que alguém razoável discorde
  dela.
- Estratégia tem data de revisão e gatilhos; documento estático que ninguém revisita não é
  estratégia viva.
