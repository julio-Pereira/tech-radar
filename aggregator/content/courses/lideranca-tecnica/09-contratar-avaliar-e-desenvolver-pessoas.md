---
id: contratar-avaliar-e-desenvolver-pessoas
title: "Contratar, avaliar e desenvolver pessoas"
summary: "Contratação, avaliação de desempenho baseada em evidência, plano de melhoria e desenvolvimento de outros — como processo e conceito, nunca como vigilância."
estimatedMinutes: 75
competencies: [pessoas]
references:
  - title: "Google re:Work — Guides (contratação, gestão)"
    url: https://rework.withgoogle.com/
---

> Este marco trata contratação, avaliação, promoção e desligamento como **processo e conceito** —
> nunca como orientação jurídica ou trabalhista. Toda regra específica de RH, direito do trabalho ou
> política de remuneração está marcada **conferir** e precisa ser validada com as áreas competentes
> da sua instituição antes de qualquer aplicação real. Nenhum exemplo usa dado de pessoa real; todos
> os casos são personagens fictícios.

## Entrevista estruturada

Entrevistas **estruturadas** — critérios definidos por nível antes da entrevista, perguntas
comparáveis entre candidatos, **rubricas com âncoras** (descrições concretas do que cada nota
significa, não só um número) e notas registradas **independentemente**, antes do *debrief* em
grupo — produzem avaliação mais consistente e mais justa do que entrevistas não estruturadas, onde
cada entrevistador segue seu próprio roteiro e a conversa em grupo acontece antes de qualquer
registro individual.

## O que cada exercício mede (e não mede)

Um exercício de código mede capacidade de resolver um problema delimitado sob pressão de tempo — não
mede necessariamente capacidade de ambiguidade ou de trabalho em equipe ao longo de meses.
`system-design/15` já trata isso do lado de quem é avaliado; este marco trata do lado de quem
avalia: a responsabilidade de saber exatamente o que cada etapa do processo mede, para não
generalizar demais a partir de um sinal limitado.

## Calibração entre entrevistadores

Quando múltiplas pessoas avaliam os mesmos candidatos (ou avaliam candidatos diferentes com a mesma
rubrica), medir a **concordância** entre elas — formalmente, com um coeficiente como **kappa** —
revela se a rubrica está sendo aplicada de forma consistente ou se cada entrevistador está, na
prática, usando critérios próprios apesar da rubrica compartilhada.

```diagrama
lt-contratacao
```

## Expectativas por nível

Assim como a escada de carreira do marco 01, expectativas por nível **escritas e comparáveis**
(escopo, autonomia, impacto esperado em cada nível) dão à avaliação um ponto de referência objetivo.
Sem isso, "desempenho adequado ao nível" vira julgamento implícito, diferente para cada avaliador e
difícil de contestar de forma justa.

## Avaliação baseada em evidência

A alternativa à avaliação por "impressão geral" é o **registro contínuo**: coletar exemplos
concretos de resultado e comportamento observado ao longo de todo o período de avaliação, não
reconstruir a avaliação de memória no último dia. Três vieses corrompem a avaliação por memória:
**recência** (as últimas semanas pesam desproporcionalmente mais do que o resto do período),
**halo** (uma impressão forte numa dimensão contamina o julgamento de todas as outras) e
**semelhança** (avaliar melhor quem se parece com o avaliador). O registro contínuo, com evidência
datada e distribuída ao longo do período, é a defesa estrutural contra os três.

## Linguagem sobre comportamento, não sobre caráter

A mesma disciplina do SBI (marco 07) se aplica à avaliação formal: "entregou o projeto X duas
semanas depois do combinado, sem comunicar o atraso com antecedência" é avaliável e contestável; "não
é comprometido" é um julgamento de caráter, não uma observação — e não dá à pessoa avaliada nenhum
caminho concreto de melhoria.

## Conversa de desempenho

Uma conversa de desempenho direta usa a mesma estrutura SBI do marco 07, com a evidência coletada ao
longo do período como base — nunca como surpresa. Se o conteúdo de uma avaliação formal é a primeira
vez que a pessoa ouve sobre um problema específico, o processo de registro contínuo falhou antes da
conversa acontecer.

## Desempenho abaixo do esperado

Antes de qualquer plano formal, diagnosticar a causa: **clareza** (a pessoa sabia o que era
esperado?), **habilidade** (ela sabe fazer?), **contexto** (há obstáculo fora do controle dela?) ou
**motivação** — cada causa pede uma resposta diferente, e tratar todas como "falta de esforço" é um
erro comum e injusto. Um **plano de melhoria** formal precisa de critérios **observáveis**, apoio
concreto e específico do líder (não só "se esforce mais"), **checkpoints datados** e uma
**consequência declarada** com antecedência — nunca descoberta no fim do prazo. Quando e como
envolver a área de RH formalmente é, em si, uma decisão que varia por instituição — **conferir**.

## O colega brilhante e corrosivo

Um caso difícil não é o de quem entrega pouco, e sim o de quem entrega muito e piora o time em
volta: revisões de código que humilham em vez de ensinar, conhecimento guardado como fonte de
poder, decisões impostas sem discussão. Tolerar esse padrão custa mais do que parece, porque o
custo não aparece na entrega dessa pessoa. Ele aparece no resto do time: as pessoas param de
propor ideias (a segurança psicológica do marco 07), evitam a área dela e o fator-ônibus daquela
parte do código cai para um. A defesa é avaliar **resultado** e **comportamento** como **duas
dimensões separadas**, cada uma com evidência própria e datada; um resultado excelente não
compensa um comportamento que reduz o resultado dos outros. A conversa é direta e usa o SBI do
marco 07 ("na revisão do PR de devoluções, na terça, você escreveu que a solução era 'de
estagiário'; desde então, a autora não abriu outro PR na área"). Se o comportamento se repete
depois de feedback claro, ele entra num **plano de melhoria** como qualquer outro critério
observável. Quanto tolerar antes disso é política de cada instituição — **conferir** com RH.

## Promoção

Um pacote de promoção reúne **evidências** (não afirmações) de que a pessoa já está operando no
escopo do nível seguinte, não apenas pronta para ele em teoria. **Patrocínio** (marco 07) importa
aqui: evidência que nunca chega ao comitê de calibração, porque ninguém a levou, não existe para
quem decide. Comitês de calibração comparam candidatos contra o **critério do nível**, não uns
contra os outros diretamente. Um "ainda não" merece retorno específico e acionável — o que, com
evidência, mudaria a decisão da próxima vez — não um "continue assim" vago.

## Remuneração (conceito, sem números)

Remuneração — equidade entre pessoas em posições comparáveis, transparência de critério, bandas por
nível — é tratada aqui **só como conceito**. Nenhuma faixa numérica, nenhuma fórmula de cálculo:
isso é especificidade de cada instituição, e a política real precisa ser **conferida** com a área
responsável antes de qualquer conversa com uma pessoa do time.

## Desligamento como processo justo e digno

Desligamento, quando necessário, é tratado aqui como **processo** — tempo adequado de aviso quando
aplicável, comunicação clara do motivo (dentro do que a política permite), e cuidado com o impacto
no time que fica. Toda regra específica de direito do trabalho sobre desligamento — prazo, aviso
prévio, documentação exigida — é, de novo, **conferir** com RH e jurídico antes de qualquer ação;
este marco não substitui essa consulta.

## Desenvolvimento de carreira dos outros

Além de avaliar, parte do papel é **desenvolver** ativamente as pessoas do time — identificar o
próximo desafio que expande o escopo de alguém antes que a pessoa peça, e criar oportunidade
deliberada (um projeto visível, uma apresentação, um patrocínio) em vez de esperar que o
desenvolvimento aconteça por acaso.

*Evidência.* [E] entrevistas estruturadas produzem avaliação mais consistente do que não
estruturadas, e os vieses de recência, halo e semelhança são bem documentados em pesquisa de
seleção e avaliação de pessoas. [P] planos de melhoria, calibração de promoção e o formato de
*debrief* vêm de prática consolidada de praticantes, não de estudo controlado isolado. [O] como
equilibrar rigor de processo com empatia individual depende do contexto e da pessoa. [P] o padrão do colega de alto resultado e comportamento corrosivo, e a avaliação em duas
dimensões, vêm de relatos de praticantes, entre eles *The Manager's Path*, de Camille Fournier.
**Toda regra
trabalhista, de remuneração e de RH citada neste marco é "conferir" com as áreas competentes da sua
instituição — nada aqui é orientação jurídica.**

## Exemplo numa fintech

Na avaliação de meio de ano de "Pessoa A" (engenheira sênior fictícia do Time Pix), a memória do
líder pesa desproporcionalmente as últimas três semanas — que foram difíceis. O registro contínuo
de evidência, mantido ao longo dos seis meses, mostra um padrão consistente de entregas sólidas; a
nota final muda, não por simpatia, mas porque a evidência distribuída no tempo conta uma história
diferente da memória recente.

No mesmo ciclo, "Pessoa B" (engenheiro fictício do Time Pix) tem a melhor entrega individual do
time e três registros datados de revisões de código com linguagem humilhante, além de uma área do
código que só ele altera. A nota "só resultado" o põe no topo. A nota por evidência, com as duas
dimensões, fica abaixo da esperada para o nível, e a conversa que vem dela é sobre comportamento,
não sobre entrega.

## Hands-on

**Tutorial.** Construa a rubrica de entrevista de uma vaga sênior fictícia e rode
`modelos/concordancia` do `fin-leadkit` sobre notas sintéticas de múltiplos entrevistadores
fictícios. Rode `lint expectativas` sobre a escada de carreira do Time Pix.

**Desafio.** (a) Desenhe o loop de entrevista completo para uma vaga; (b) avalie uma pessoa
fictícia a partir de um registro sintético de evidências e escreva o plano de melhoria de um caso
fictício de desempenho abaixo do esperado; (c) avalie o caso "Pessoa B" nas duas dimensões,
resultado e comportamento, e escreva a abertura SBI da conversa.

**Invariantes testáveis**

1. O **kappa** de concordância calculado sobre o conjunto-gabarito de notas sintéticas é o valor
   esperado, dentro da tolerância declarada.
2. `lint rubrica` reprova um critério de avaliação **sem âncoras** (descrições concretas em pelo
   menos 3 níveis) ou sem comportamento observável associado.
3. O *debrief* simulado **só aceita** notas que já foram registradas (com data) antes do início da
   discussão em grupo — uma nota registrada depois é rejeitada pela ordem temporal.
4. `lint avaliacao` reprova uma avaliação **sem evidências datadas e distribuídas ao longo do
   período** (mais de um percentual configurável concentrado no último mês é sinalizado como viés
   de recência) e reprova qualquer avaliação que **atribui traço de caráter** em vez de
   comportamento observável.
5. A **nota calculada por evidência é invariante à ordem** em que as evidências são apresentadas
   (propriedade testada por permutação do conjunto de evidências) — e difere, no conjunto sintético,
   da "nota por memória" que pesa desproporcionalmente o período recente.
6. `lint plano-melhoria` reprova um plano **sem comportamento observável, sem critério de sucesso,
   sem apoio concreto do líder, sem checkpoints datados ou sem consequência declarada** — cada
   ausência listada separadamente.
7. `lint promocao` exige **evidência do escopo do nível seguinte** (não apenas do nível atual) — um
   pacote que só demonstra competência no nível corrente é reprovado.
8. **Teste de ausência:** nenhum relatório ou métrica gerado pelo `fin-leadkit` neste marco referencia
   pessoa nomeada real — apenas personagens fictícios do Time Pix.
9. **Demonstração do limite:** uma avaliação com todos os campos formalmente presentes (evidência
   datada, linguagem de comportamento, distribuição temporal correta) ainda pode ser **injusta** se
   as evidências foram escolhidas a dedo (viés de seleção do que foi registrado) — a estrutura
   verifica forma, não neutralidade da escolha do que documentar.
10. `lint avaliacao` **reprova** uma avaliação que não tem as **duas dimensões** (resultado e
    comportamento), cada uma com evidência datada própria.
11. No caso sintético "Pessoa B" do registro de evidências, a **nota por evidência difere** da
    nota "só resultado" do gabarito — propriedade verificada sobre o conjunto sintético.
12. **Demonstração do limite:** uma avaliação que cita o comportamento corrosivo e o neutraliza
    com adjetivos sobre o resultado ("as revisões são duras, mas ele é excepcional") passa na
    estrutura das duas dimensões e continua ruim — o *lint* verifica que a dimensão existe, não
    que ela pesou.

**Complemento.** Escreva as expectativas detalhadas de um nível da sua escada de carreira, ou uma
autoavaliação sua baseada em evidência própria. Mantenha no dossiê privado.

**Checagem**

1. Por que entrevistas estruturadas, com notas registradas antes do *debrief*, tendem a produzir
   avaliação mais justa do que a prática comum de discutir em grupo antes de qualquer registro
   individual?
2. Qual é a diferença entre os vieses de recência, halo e semelhança, e por que o registro contínuo
   de evidência é uma defesa contra os três?
3. Por que diagnosticar a causa (clareza, habilidade, contexto, motivação) antes de um plano de
   melhoria formal evita tratar toda queda de desempenho como "falta de esforço"?
4. Por que um pacote de promoção precisa de evidência do escopo do **nível seguinte**, não só do
   nível atual?
5. Por que este marco trata remuneração apenas como conceito, sem nenhuma faixa numérica?
6. Por que a "demonstração do limite" deste marco mostra que uma avaliação estruturalmente completa
   ainda pode ser injusta?

> **Pontes — `system-design/15`; `arquitetura-de-solucoes/08`; `observabilidade/15`.**
> A avaliação por níveis de `system-design/15` é o ponto de partida deste marco, visto agora do lado
> de quem avalia, não de quem é avaliado. A trajetória de IC sênior/Staff de
> `arquitetura-de-solucoes/08` é o vocabulário de escopo e impacto que expectativas por nível e
> pacotes de promoção usam. E o *post-mortem* sem culpa de `observabilidade/15` compartilha o mesmo
> princípio central deste marco: avaliar o que aconteceu com evidência e sem atribuir traço de
> caráter, nunca o contrário.

## Principais aprendizados

- Entrevista estruturada com rubrica de âncoras e notas registradas antes do *debrief* reduz
  inconsistência entre entrevistadores.
- Avaliação baseada em evidência contínua e datada é a defesa contra os vieses de recência, halo e
  semelhança.
- Plano de melhoria exige diagnóstico de causa antes, critérios observáveis, apoio concreto,
  checkpoints datados e consequência declarada.
- Promoção exige evidência do escopo do nível seguinte, não só competência no nível atual.
- Resultado e comportamento são avaliados como dimensões separadas; resultado alto não compensa
  comportamento que reduz o resultado do time.
- Remuneração e desligamento são tratados como processo e conceito; toda regra específica é
  "conferir" com RH e jurídico — nunca orientação definitiva deste marco.
