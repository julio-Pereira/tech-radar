---
id: decidir-bem-sob-incerteza
title: "Decidir bem sob incerteza"
summary: "Boas decisões se distinguem de bons resultados — e só dá para aprender com as decisões que foram registradas antes de o resultado chegar."
estimatedMinutes: 60
competencies: [decisao]
references:
  - title: "Amazon — Letter to shareholders 2015/2016 (decisões reversíveis)"
    url: https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders
---

## Decisões reversíveis e irreversíveis

Uma distinção simples muda a velocidade certa de decidir: **portas de ida e volta** (decisões
reversíveis — se der errado, dá para voltar atrás a baixo custo) deveriam ser tomadas rápido, por
quem está mais perto do problema, sem processo pesado. **Portas sem volta** (decisões irreversíveis
ou caras de reverter) merecem mais deliberação, mais gente consultada, mais cautela. O erro mais
caro não é decidir rápido demais — é tratar uma porta de ida e volta com o mesmo processo pesado de
uma porta sem volta, pagando o custo de lentidão numa decisão que nem precisava dele.

## Direitos de decisão e métodos

`arquitetura-de-solucoes/06` já introduz direitos de decisão explícitos; este marco aprofunda
**quando usar cada método**. **Consentimento** (decide quem não vetar, mesmo sem concordância
unânime) serve bem decisões reversíveis de baixo risco. **Aconselhamento** (uma pessoa decide, mas é
obrigada a consultar antes) serve decisões técnicas onde uma pessoa tem contexto suficiente, mas
benefício real em ouvir outros. **DACI** formaliza isso com papéis nomeados, útil em decisões que
cruzam equipes. Escolher o método errado para o tipo de decisão é tão custoso quanto não ter método
nenhum.

## Registro de decisões

Um registro de decisão de qualidade tem **premissas** explícitas, **alternativas reais**
consideradas (não uma só, disfarçada), uma **previsão explícita** do que se espera que aconteça, e
um **gatilho de reversão** — o sinal específico que, se aparecer, significa "reveja esta decisão
agora". O formato de ADR de `arquitetura-de-software/07` é a base; este marco acrescenta a
**previsão** como campo obrigatório, porque é a previsão registrada **antes** do resultado que torna
possível, mais tarde, avaliar se a decisão foi boa — não só se o resultado foi bom.

## Vieses que distorcem decisão

Quatro vieses aparecem com frequência: **viés de planejamento** (otimismo sistemático sobre prazo e
esforço, já visto no marco 04), **custo afundado** (continuar investindo numa decisão ruim porque já
se investiu nela, em vez de avaliar só o que falta), **ancoragem** (a primeira cifra ou prazo
mencionado distorce todo julgamento posterior, mesmo quando é arbitrária) e **viés de grupo**
(pressão por consenso aparente que silencia discordância real, especialmente quando uma voz sênior
fala primeiro).

## Calibração e Brier score

**Calibração** é a prática de dar **probabilidades explícitas** às suas previsões ("tenho 70% de
confiança que terminamos até sexta") e, depois, medir sistematicamente se essas probabilidades
bateram com a realidade ao longo de muitas previsões. O **Brier score** quantifica isso: quanto mais
próximo de zero, melhor calibrada a pessoa está. Uma pessoa sempre insegura que prevê "50%" para
tudo tem Brier score de 0,25 — um número que parece neutro, mas na verdade sinaliza previsões **não
informativas**, não previsões prudentes.

## Valor esperado e *regret*

Decidir sob incerteza frequentemente significa comparar **valor esperado** entre opções (probabilidade
× impacto de cada resultado possível), não só o cenário mais provável. E **minimizar arrependimento**
(*regret*) — "qual decisão eu lamentaria menos, dado o que eu sei agora, em qualquer um dos cenários
possíveis?" — é, com frequência, mais útil na prática do que tentar calcular valor esperado com
precisão quando os números de entrada já são incertos.

## Dívida técnica como decisão financeira

Como o marco 03 já introduziu, decidir pagar ou conviver com dívida técnica é uma decisão
**financeira**: compara o custo de atraso que a dívida gera (os "juros" de `arquitetura-de-software/06`)
com o custo de pagá-la agora. Tratá-la como decisão moral ("dívida é sempre ruim, deveria ser sempre
paga") produz decisões piores do que tratá-la como qualquer outra alocação de recurso escasso.

## *Disagree and commit*

Quando uma decisão precisa ser tomada e a discordância legítima persiste depois de todos serem
ouvidos, *disagree and commit* — comprometer-se totalmente com a execução de uma decisão mesmo
discordando dela — evita a paralisia de buscar consenso perfeito. A condição necessária é que a
discordância tenha sido **genuinamente ouvida antes**, não ignorada; sem isso, "disagree and commit"
vira só uma forma educada de calar quem discorda.

## Revisar a decisão: o gatilho disparou?

Um registro de decisão sem revisão é só um documento histórico. A prática de revisão pergunta,
periodicamente ou quando o gatilho declarado aparece: a previsão registrada se confirmou? Se não, a
decisão deveria mudar? Decisões registradas e nunca revisadas acumulam risco silencioso — são
compromissos que ninguém está mais defendendo ativamente, só porque ninguém voltou a olhar.

## Decisões em grupo: disciplina de reunião e voz de quem sabe

Decisões em grupo pioram quando a pessoa mais sênior fala primeiro (ancora a discussão) ou quando a
reunião não tem uma estrutura que force cada voz a se manifestar antes do consenso aparente se
formar. Uma disciplina simples — pedir que cada pessoa registre sua posição **antes** da discussão
em grupo começar — reduz a distorção de ancoragem e de viés de grupo, e frequentemente revela
discordância real que a conversa sozinha teria escondido.

## Decidir rápido sem decidir mal

A velocidade certa de decisão depende do tipo de porta (reversível ou não) e do custo de adiar —
não é sempre "mais rápido é melhor" nem sempre "mais devagar é mais seguro". Decidir rápido **bem**
significa aplicar o método certo ao tipo certo de decisão, não pular etapas de uma decisão que
mereceria mais cautela.

*Evidência.* [E] os vieses cognitivos (planejamento, custo afundado, ancoragem, grupo) e a prática
de calibração vêm de pesquisa publicada sobre julgamento e tomada de decisão. [P] portas de ida/volta
e DACI são prática consolidada de praticantes, não resultado de estudo controlado. [O] a escolha de
qual método de decisão (consentimento, aconselhamento, DACI) usar em cada situação depende da
cultura da organização.

## Exemplo numa fintech

Duas pessoas seniores discordam: construir a conciliação internamente ou comprar uma solução de
mercado. Em vez de deixar a discussão se arrastar por semanas, o time decide em 48 horas usando
aconselhamento (uma pessoa decide, depois de consultar as duas partes), registra a decisão com
previsão explícita ("esperamos economizar 3 meses construindo; se passar de 5 meses sem resultado,
revertemos para a solução de mercado") e agenda a revisão no gatilho declarado.

## Hands-on

**Tutorial.** Rode `modelos/calibracao` do `fin-leadkit` sobre o registro de 40 decisões sintéticas
do Time Pix, com previsão e resultado.

**Desafio.** Calcule sua própria calibração sobre um conjunto de previsões, e decida um caso
fictício de *build × buy* usando a rubrica do marco.

**Invariantes testáveis**

1. O **Brier score** calculado sobre o conjunto de previsões-gabarito é o valor esperado, dentro da
   tolerância declarada.
2. Uma série de previsões sempre em 50% produz Brier score de 0,25, e o modelo **sinaliza**
   explicitamente essa série como "não informativa" — não apenas reporta o número sem contexto.
3. `lint decisao` reprova um registro **sem pelo menos duas alternativas reais, sem premissa
   declarada, ou sem gatilho de reversão** — cada ausência listada separadamente.
4. A curva de calibração por faixa (previsões entre 0–10%, 10–20%... 90–100%, cada faixa comparada
   com a taxa real de acerto) reproduz o padrão esperado no conjunto sintético.
5. O *lint* exige que a **data do registro da previsão seja anterior** à data do resultado conhecido
   — uma previsão registrada depois do resultado (viés retrospectivo) é rejeitada.
6. **Demonstração do limite:** um registro de decisão com todos os campos presentes, mas cujas
   "alternativas" são artificiais (uma delas claramente inviável, só para cumprir a exigência de
   "≥2") **passa** no *lint* estrutural — a rubrica humana, não o *linter*, pega isso.

**Complemento.** Inicie um diário de decisões privado com pelo menos 10 previsões suas, com
probabilidade explícita, para calibrar ao longo do tempo.

**Checagem**

1. Por que o erro mais caro, segundo este marco, não é decidir rápido demais, mas tratar uma porta
   de ida e volta com o processo de uma porta sem volta?
2. Por que o Brier score de uma pessoa que sempre prevê "50%" é tratado como sinal de previsão não
   informativa, não como prudência?
3. Qual é a condição necessária para que *disagree and commit* funcione, em vez de virar uma forma
   de silenciar discordância?
4. Por que um registro de decisão sem data de revisão é descrito como acumulando "risco
   silencioso"?
5. Por que pedir que cada pessoa registre sua posição antes da discussão em grupo reduz
   especificamente o viés de ancoragem?
6. Por que tratar dívida técnica como decisão moral ("sempre pagar") tende a produzir decisões
   piores do que tratá-la como decisão financeira?

> **Pontes — `arquitetura-de-solucoes/06`; `arquitetura-de-software/07`; `arquitetura-de-software/06`.**
> Os direitos de decisão de `arquitetura-de-solucoes/06` são a base sobre a qual este marco escolhe
> o método certo (consentimento, aconselhamento, DACI) para cada situação. O formato de ADR de
> `arquitetura-de-software/07` é o que o registro de decisões deste marco estende com previsão
> explícita e gatilho de reversão. E o registro de dívida técnica com juros de
> `arquitetura-de-software/06` é o dado de entrada direto da decisão financeira sobre dívida tratada
> aqui.

## Principais aprendizados

- Portas de ida e volta merecem decisão rápida; portas sem volta merecem mais deliberação — tratar
  as duas igual é o erro mais caro.
- Um registro de decisão de qualidade tem premissas, alternativas reais, previsão explícita e
  gatilho de reversão.
- Calibração mede se suas probabilidades batem com a realidade ao longo do tempo — o Brier score
  quantifica isso.
- *Disagree and commit* só funciona quando a discordância foi genuinamente ouvida antes.
- Decisões registradas e nunca revisadas acumulam risco silencioso.
