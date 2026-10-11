---
id: plataforma-como-produto
title: "Plataforma como produto"
summary: "Uma plataforma que ninguém escolhe usar é só um gargalo de tickets com identidade visual nova — e a diferença está em tratá-la como produto, com cliente, jornada e métrica."
estimatedMinutes: 55
references:
  - title: "Team Topologies"
    url: https://teamtopologies.com/
  - title: "What is platform engineering? (platformengineering.org)"
    url: https://platformengineering.org/blog/what-is-platform-engineering
---

## O problema que a plataforma resolve: carga cognitiva

Uma equipe de produto que precisa entender Kubernetes, Terraform, políticas de segurança e a esteira
de CI inteira antes de subir um serviço simples está pagando **carga cognitiva** que não tem relação
com o problema de negócio que ela deveria resolver (`spring-boot/13`, Conway). A plataforma existe
para absorver essa carga, não para adicionar uma camada nova de complexidade em cima da já
existente.

## Equipe de plataforma, e os modos de interação (**confira** a fonte)

Uma equipe de plataforma pode interagir com equipes de produto de formas diferentes: **colaboração**
direta e intensa (útil no início de algo novo, caro de manter em escala), **X-as-a-service** (a
plataforma expõe uma capacidade pronta, consumida sem colaboração contínua — o modo que escala), e
**facilitação** (ajuda temporária para destravar algo específico, sem assumir responsabilidade
permanente). A maturidade de uma plataforma se mede, em parte, por quanto do seu valor é entregue
via X-as-a-service, em vez de colaboração manual repetida a cada equipe nova.

## Cliente interno, e a jornada completa

A equipe de produto é o **cliente** da plataforma — e como qualquer cliente, tem uma **jornada**:
dia 0 (descoberta, primeira interação), **primeiro deploy** (o momento em que o valor começa a ser
entregue de fato), operação contínua, e eventualmente desligar/migrar. Mapear essa jornada
explicitamente, com os passos reais (não os passos "ideais" que a documentação descreve), é o que
revela onde a experiência realmente trava.

## Plataforma mínima viável

Assim como um produto não precisa de todas as funcionalidades no lançamento, uma plataforma não
precisa resolver tudo de uma vez — a ***thinnest viable platform*** (plataforma mínima viável)
resolve o problema de maior dor primeiro, com a menor superfície possível, e cresce a partir do uso
real, não de uma lista completa de capacidades imaginadas antes de qualquer equipe real ter usado
nada.

## Tempo até o primeiro deploy, como métrica central

Entre todas as métricas possíveis de uma plataforma, o **tempo até o primeiro deploy** de uma
equipe nova é particularmente informativa: ela resume, num número só, o atrito acumulado de toda a
jornada de dia 0. Uma plataforma que reduz esse tempo de onze dias para duas horas provou valor de
forma concreta, mensurável, sem precisar de nenhuma outra métrica para convencer ninguém.

## Métricas de adoção e de experiência do desenvolvedor (**confira** os modelos vigentes)

Modelos como DORA, SPACE, DevEx (**confira** a formulação vigente de cada um, porque esse campo
evolui) oferecem vocabulário para medir experiência do desenvolvedor de forma mais rica do que só
velocidade de entrega. A regra central deste marco, que vale para qualquer métrica adotada: **toda
métrica declara a decisão que ela informa** — uma métrica sem decisão associada é métrica de
vaidade, por mais sofisticado que seja o modelo de onde ela veio.

## Roteiro e priorização

Um roteiro de capacidades da plataforma priorizado pela **espera** que cada passo da jornada
elimina — não por "o que parece mais impressionante de construir" — concentra esforço onde o atrito
real está, em vez de onde a engenharia mais gosta de trabalhar.

## Antipadrões

**Torre de marfim**: a plataforma é construída isolada da realidade das equipes que vão usá-la, sem
consulta real. **Plataforma imposta**: adoção obrigatória, decidida de cima, sem que a plataforma
precise provar valor por escolha — o antipadrão central que o marco 09 termina endereçando. **"Ticket-ops"
renomeado**: a mesma fila de tickets manual de antes, só que agora chamada de "plataforma", sem
nenhuma automação real por trás. **Plataforma que tenta fazer tudo**: o oposto da plataforma mínima
viável, tentando resolver toda capacidade imaginável antes de qualquer equipe ter usado a primeira.

## O que **não** é plataforma

Um wiki com instruções, por mais bem escrito, não é plataforma — é documentação. Um script solto que
alguém escreveu e compartilhou informalmente não é plataforma — é uma ferramenta pessoal sem
contrato, sem suporte, sem versão. Plataforma implica **API, contrato e operação contínua**
(marco 02).

## Exemplo numa fintech

Hoje, subir um serviço novo no `fin-platform` exige 9 passos manuais e 11 dias de espera total —
a maior parte em filas de aprovação e configuração manual de acesso. A plataforma não começa
construindo um portal visual bonito; começa atacando o **passo de maior espera** especificamente
(normalmente, a concessão de acesso e a criação do ambiente), porque é ali que o atrito real está
concentrado.

## Hands-on

**Tutorial.** Construa `adocao/jornada.yaml` com os passos reais, responsável, tempo de trabalho,
tempo de espera, e se cada passo é manual.

**Desafio.** Produza o backlog de capacidades priorizado por espera, e a definição formal das
métricas que a plataforma vai acompanhar.

**Invariantes testáveis**

1. O tempo até o primeiro deploy, calculado do mapa de jornada, é a **soma de trabalho e espera**
   de todos os passos — teste de tabela sobre uma massa de dados conhecida.
2. O backlog é **ordenado de forma determinística** pela espera removível de cada passo — rodar o
   mesmo cálculo duas vezes produz a mesma ordem.
3. Toda métrica declarada tem `decisao_que_informa` e `dono` — verificado por *lint*; métrica sem
   decisão associada é **rejeitada**, não aceita no catálogo de métricas.
4. No simulador de jornada, com **semente fixa**, automatizar o passo de **maior espera** reduz o
   tempo até o primeiro deploy — testado como relação (automatizar o maior reduz mais que
   automatizar um menor), não como valor absoluto.
5. A nota de satisfação calculada de uma pesquisa **sintética** de experiência do desenvolvedor
   bate exatamente com o valor esperado para a massa de dados de teste.

**Complemento.** Descreva a jornada de dia 0 de um time real do seu trabalho, e identifique
especificamente onde ela trava — qual passo concentra a maior espera.

**Checagem**

1. O que é carga cognitiva, e por que ela é o problema de fundo que uma plataforma deveria
   resolver?
2. Qual é a diferença entre os três modos de interação (colaboração, X-as-a-service, facilitação),
   e qual deles escala melhor?
3. Por que tempo até o primeiro deploy é uma métrica particularmente informativa, resumindo o
   atrito de toda a jornada de dia 0?
4. O que torna uma métrica "de vaidade", segundo a regra "toda métrica declara a decisão que
   informa"?

> **Reencontro — `spring-boot/13`; `system-design/03`; `observabilidade/13`; `kubernetes/14`.** A
> carga cognitiva e os modos de interação de Conway, em `spring-boot/13`, são o fundamento direto
> deste marco — aqui aplicados especificamente à equipe de plataforma. A decisão de onde cortar o
> sistema em `system-design/03` é adjacente à decisão de onde cortar a responsabilidade entre
> plataforma e equipes de produto. O plantão e a triagem de `observabilidade/13` são onde o suporte
> da plataforma (marco 07) se apoia. E a decisão de custo e multi-tenancy de `kubernetes/14` é onde
> "quando não construir uma capacidade nova da plataforma" já apareceu num contexto adjacente de
> infraestrutura.

## Principais aprendizados

- Carga cognitiva — o que uma equipe de produto precisa entender além do próprio domínio de negócio
  — é o problema de fundo que uma plataforma existe para absorver.
- X-as-a-service é o modo de interação que escala; colaboração direta é útil no início, mas cara de
  manter conforme o número de equipes crescer.
- Plataforma mínima viável resolve a dor de maior impacto primeiro, crescendo a partir de uso real,
  não de uma lista completa de capacidades imaginadas antes de qualquer equipe ter usado nada.
- Tempo até o primeiro deploy resume, num número só, o atrito acumulado de toda a jornada de dia 0.
- Toda métrica declara a decisão que informa — sem isso, mesmo uma métrica de um modelo
  sofisticado é métrica de vaidade.
