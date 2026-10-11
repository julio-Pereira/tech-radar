---
id: feedback-loop-e-experimentacao
title: "Feedback loop e experimentação"
summary: "Você só vê o resultado das ofertas que fez; um modelo que nunca explora aprende só com o próprio passado."
estimatedMinutes: 70
completion: quiz
references:
  - title: "Trustworthy Online Controlled Experiments (Kohavi et al.)"
    url: https://experimentguide.com/
---

## Viés de seleção e o laço de reforço

O dataset de treino (marco 02) só contém decisões que **já foram tomadas** — o que teria acontecido com um
candidato que nunca recebeu oferta alguma é, por construção, desconhecido. Um modelo treinado só sobre
decisões passadas aprende os padrões **daquelas decisões**, não o efeito real da oferta — e se esse modelo
decide as próximas ofertas, ele reforça o próprio padrão: um **laço de reforço** que se fecha sobre si
mesmo sem nunca ser corrigido pela realidade.

## Exploração: o custo de aprender além do próprio passado

**Exploração** significa, deliberadamente, às vezes tomar uma decisão diferente da que o modelo
recomendaria — *ε-greedy* (explorar aleatoriamente uma fração pequena do tempo) e amostragem de Thompson
(conceitual, sem entrar na matemática) são duas formas comuns. Explorar tem custo real (uma fração das
decisões não é a "melhor" conhecida) mas é o único jeito de aprender o que aconteceria em situações que o
modelo nunca escolheria por conta própria.

## Grupo de controle global (*holdout*)

Um **holdout**: uma fração pequena e constante da base nunca recebe nenhuma oferta guiada por modelo —
serve como referência do que aconteceria sem o sistema, para medir o efeito real do sistema inteiro ao
longo do tempo, não só comparar uma versão de modelo com outra.

## Teste A/B correto

**Unidade de randomização**: o que é sorteado entre braços (cliente, não decisão — senão o mesmo cliente
pode cair em braços diferentes em momentos diferentes, contaminando a leitura). **Atribuição
determinística**: o mesmo cliente, no mesmo experimento, cai sempre no mesmo braço — calculada por uma
função pura do identificador, não por sorteio novo a cada chamada. **Tamanho de amostra e poder**:
calculados antes do experimento, não ajustados depois para "achar" significância. **SRM** (*sample ratio
mismatch*): se a proporção observada entre braços diverge da proporção configurada (70/30 em vez do 50/50
esperado, por exemplo), a atribuição está quebrada e **nenhuma conclusão do experimento é confiável** até
corrigir isso. **Espiar o resultado cedo** (checar significância repetidamente até achar um ponto favorável)
infla a taxa de falso positivo e é um erro comum, não uma prática aceitável.

## Rótulo atrasado, e avaliação contrafactual com propensão registrada

A mesma janela de maturação do marco 02 se aplica aqui: o efeito de uma oferta mostrada hoje só é conhecido
meses depois. Para avaliar políticas **sem esperar** por um experimento novo cada vez, registra-se, para
cada decisão, a **probabilidade da ação tomada** (a chance que a política vigente deu a essa ação
específica) — isso permite estimadores como **IPS** (*inverse propensity scoring*, conceitual) recuperar,
a partir do log histórico, uma estimativa do efeito de uma política diferente, sem precisar rodar um novo
experimento do zero.

## *Guardrails*, novidade e fadiga

Mesmo um experimento bem desenhado precisa de **guardrails**: um cap de frequência de contato por cliente
(independente do braço), métricas de dano (reclamação, *opt-out*) monitoradas durante o experimento, e
atenção redobrada a clientes vulneráveis (conferir política de compliance). O **efeito de novidade**
(engajamento momentâneo só porque é diferente) e a **fadiga** (engajamento cai com exposição repetida)
distorcem a leitura de um experimento curto — por isso a duração mínima de um experimento também precisa
ser declarada, não só o tamanho de amostra.

## Exemplo numa fintech

O modelo observa que "quem recebe oferta de cartão contrata cartão" com alta correlação — mas isso inclui
clientes que já iam contratar de qualquer forma, e exclui qualquer evidência sobre quem *não* recebeu a
oferta. Sem *holdout* e sem exploração, o modelo não tem como distinguir "a oferta causou a contratação" de
"esses clientes sempre contratariam" — e passa a oferecer cada vez mais estritamente para quem já
contrataria, reforçando o próprio padrão em vez de aprender algo novo sobre o resto da base.

## Hands-on

**Tutorial.** Construa, sobre o `sim-clientes` (que conhece o efeito real da oferta), três políticas:
gananciosa (sempre a melhor decisão conhecida), com exploração (ε-greedy) e com *holdout*.

**Desafio.** Estime o *uplift* real de cada política e detecte uma atribuição de experimento
deliberadamente quebrada.

**Invariantes testáveis (seed fixa, 100 simulações)**

1. Com *holdout* de 5%, o efeito estimado da oferta fica **dentro do intervalo de confiança** do efeito
   real conhecido pelo `sim-clientes` em **≥90%** das 100 simulações.
2. Sem exploração, a estimativa de valor de uma oferta **nunca mostrada** permanece viesada de forma
   demonstrável; com ε > 0, o viés cai **abaixo de um limite declarado** depois de N rodadas — o lado
   quebrado como demonstração, o lado corrigido com asserção rígida.
3. A atribuição de braço é **determinística** (mesmo cliente + mesmo experimento → mesmo braço, em
   qualquer instância do serviço) e o teste de **SRM** sinaliza uma atribuição 70/30 plantada enquanto não
   sinaliza a atribuição correta 50/50.
4. Toda decisão registra a **probabilidade da ação tomada**, e o estimador IPS sobre o log recupera o
   efeito real dentro de uma tolerância declarada.
5. O **cap de frequência** de contato por cliente nunca é excedido, em nenhum braço do experimento.

**Complemento.** Simule um rótulo atrasado de 90 dias e observe o efeito de decidir o resultado do
experimento antes da janela de maturação se fechar.

**Checagem**

1. Por que o dataset de treino sozinho não contém informação sobre o que aconteceria sem a oferta?
2. O que distingue a unidade de randomização correta (cliente) de uma unidade errada (decisão)?
3. O que SRM detecta, e por que nenhuma conclusão do experimento é confiável até ele ser corrigido?
4. Por que espiar o resultado de um experimento antes do fim planejado infla a taxa de falso positivo?
5. O que a probabilidade da ação registrada permite calcular depois, sem rodar um novo experimento?
6. Por que um cap de frequência de contato é necessário mesmo num experimento bem desenhado estatisticamente?

> **Reencontro — `system-design/14`; `observabilidade/08`; `engenharia-de-dados/11` (trilha planejada).**
> Atribuição determinística e exploração reusam o mecanismo de *feature flags* e *dark launch* de
> `system-design/14` — a mesma função pura decidindo quem vê o quê. As métricas de negócio do experimento
> (receita incremental, taxa de dano) seguem o mesmo vocabulário de `observabilidade/08`. E o tratamento de
> dado atrasado como correção auditável, não descarte silencioso, é a mesma disciplina de streaming de
> `engenharia-de-dados/11`.

## Principais aprendizados

- O dataset de treino só contém decisões já tomadas — o efeito real da oferta exige exploração ou
  *holdout*, não só histórico.
- Um modelo sem exploração aprende e reforça o próprio padrão passado: o laço de reforço clássico.
- Atribuição de experimento precisa ser determinística por cliente, e SRM detecta quando essa atribuição
  está quebrada — sem corrigir isso, nenhuma conclusão do experimento vale.
- Espiar resultado antes do fim planejado do experimento infla falso positivo; a duração e o tamanho de
  amostra são calculados antes, não ajustados depois.
- Registrar a probabilidade da ação tomada permite avaliar políticas diferentes a partir do log histórico
  (IPS), sem esperar por um novo experimento inteiro.
