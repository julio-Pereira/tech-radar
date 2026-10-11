---
id: features-offline-e-online
title: "Features: offline, online e consentimento"
summary: "Cada feature tem um caminho de cálculo, um dono, um frescor — e deixa de existir quando o consentimento acaba."
estimatedMinutes: 60
completion: quiz
references:
  - title: "Feast — feature store"
    url: https://docs.feast.dev/
---

## Feature como código, não como consulta ad-hoc

Uma feature não é "uma coluna que alguém calculou uma vez" — é uma **definição versionada**, com nome,
fórmula, janela de agregação, dono e finalidade declarados, executável tanto no treino (offline, sobre
histórico) quanto no serviço (online, sobre o estado atual). Tratar feature como código, não como consulta
improvisada, é o que torna possível perguntar "o que mudou nessa feature entre a versão 3 e a versão 4" com
uma resposta precisa.

## *Feature store*: quando ajuda, e quando é peso morto

Uma **feature store** registra definições, materializa valores (offline para treino, online para baixa
latência) e serve como fonte única da verdade sobre "o que essa feature significa". Ela ajuda quando várias
features são reusadas por vários modelos, ou quando a paridade offline/online é difícil de garantir à mão.
Ela é peso morto quando há poucas features, poucos modelos e a equipe consegue garantir a paridade com
disciplina simples — adotar a ferramenta antes de precisar dela é custo sem benefício.

## *Training/serving skew*: duas contas, dois relógios, dois padrões

O problema mais caro desta trilha depois do vazamento: a mesma feature, calculada por **dois caminhos**
(uma consulta SQL no treino, um cálculo em memória no serviço), produz **números diferentes** para a mesma
entrada. As causas típicas: código duplicado em duas linguagens ou dois frameworks; **relógios diferentes**
(o treino usa "últimos 90 dias corridos", o serviço usa "últimos 90 dias úteis"); e valores-padrão
diferentes para dado ausente (o treino usa zero, o serviço usa nulo). A defesa é ter **um único caminho de
cálculo**, testado para produzir o mesmo resultado nos dois contextos — não duas implementações que
"deveriam" bater.

## Frescor, TTL, e a diferença entre ausente e velho

Toda feature tem um **TTL** (tempo de vida): depois de quanto tempo sem atualização ela é considerada
vencida. Uma feature vencida deve devolver **ausente**, nunca o último valor velho disfarçado de atual —
confundir os dois é um erro silencioso que o modelo não tem como distinguir de um dado legítimo. Ausente é
uma resposta honesta ("não sei o valor atual"); velho-como-se-fosse-atual é uma mentira que o modelo aceita
sem questionar.

## Custo de materializar × calcular sob demanda

Pré-calcular (materializar) uma feature custa armazenamento e um pipeline de atualização; calcular sob
demanda custa latência no momento da decisão. A escolha depende do volume de consultas, da complexidade do
cálculo e do orçamento de latência do serviço (marco 06) — não existe resposta universal, e a decisão
merece ser medida, não assumida.

## Features sensíveis, de terceiros, e a regra do consentimento

Uma feature derivada de dado de terceiros (por exemplo, vinda das tabelas do `fin-insight`) herda a
restrição de consentimento do dado de origem — **a feature some quando o consentimento some**, não só o
dado bruto que a gerou. Isso vale mesmo que a feature já tenha sido calculada e armazenada: se o
consentimento que a legitimava foi revogado, o valor materializado também deixa de ser servível.

## Documentação como parte do contrato

Toda feature declara **dono** (quem mantém a definição), **definição** (fórmula e janela, não só o nome) e
**finalidade** (para que tipo de decisão ela pode ser usada) — sem os três, a feature não entra no
registro, e um registro que falha essa checagem falha o CI, não só uma revisão manual.

## Exemplo numa fintech

"Gasto médio dos últimos 90 dias" é calculado em SQL durante o treino (90 dias corridos, a partir da data
da decisão) e recalculado em memória no serviço de ofertas (90 dias úteis, a partir de agora) — duas
definições com o mesmo nome e números diferentes. O sintoma só aparece quando alguém nota que a mesma
feature, para o mesmo cliente no mesmo instante, tem valores diferentes no log de treino e no log de
serving.

## Hands-on

**Tutorial.** Implemente a definição única de 5 features, executada nos dois contextos (offline sobre
histórico, online sobre estado atual) a partir do mesmo código.

**Desafio.** Escreva o teste de paridade offline/online e a feature sensível ao consentimento.

**Invariantes testáveis**

1. A feature calculada offline e online para as **mesmas entradas** produz o **mesmo valor** — igualdade
   exata para inteiros, tolerância ε declarada para reais.
2. Uma feature com frescor vencido (fora do TTL) devolve **ausente**, nunca o último valor conhecido.
3. Após a revogação do consentimento de origem e o SLA de propagação, a feature correspondente do titular
   devolve ausente, em qualquer camada que a consulte.
4. Toda feature sem dono, definição ou finalidade declarados **falha o CI** do registro de features — não
   chega a ser servida.

**Complemento.** Meça o custo de materializar uma feature (armazenamento + pipeline de atualização) contra
calculá-la sob demanda, para as 5 features do tutorial.

**Checagem**

1. Quais são as três causas típicas de *training/serving skew* citadas neste marco?
2. Por que uma feature vencida deve devolver ausente, e não o último valor conhecido?
3. Em que condição uma feature store ajuda, e em que condição ela é peso morto?
4. Por que uma feature derivada de dado de terceiros precisa desaparecer quando o consentimento de origem
   é revogado, mesmo que o valor já esteja materializado?

> **Reencontro — `engenharia-de-dados/03`, `/10` e `/12` (trilha planejada); `dados-distribuidos/09`;
> `dados-distribuidos/01`.** A regra "a feature some quando o consentimento some" estende diretamente a
> propagação de revogação por todas as camadas que `engenharia-de-dados/10` ensina. O TTL de feature e a
> distinção ausente-versus-velho usam o mesmo raciocínio de cache de `dados-distribuidos/09`. E a causa
> "dois relógios" do *training/serving skew* é exatamente o modelo de falha e tempo distribuído de
> `dados-distribuidos/01`, aplicado a duas implementações da mesma feature em vez de dois nós.

## Principais aprendizados

- Feature é código versionado, com definição, janela, dono e finalidade — não uma consulta improvisada.
- *Training/serving skew* vem de três causas típicas: código duplicado, relógios diferentes, e
  valores-padrão diferentes para dado ausente.
- Feature vencida deve devolver ausente, nunca o último valor conhecido disfarçado de atual.
- Feature store ajuda quando há reúso entre vários modelos; é peso morto quando a disciplina simples já
  garante a paridade com poucas features.
- A regra "a feature some quando o consentimento some" vale mesmo para valores já materializados — a
  revogação invalida o que já foi calculado, não só o dado bruto de origem.
