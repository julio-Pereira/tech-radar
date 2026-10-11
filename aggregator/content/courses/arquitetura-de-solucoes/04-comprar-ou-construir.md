---
id: build-vs-buy
title: "Comprar ou construir"
summary: "\"Comprar ou construir\" é uma pergunta sobre diferenciação, custo de saída e capacidade de operar — não sobre o custo da licença."
estimatedMinutes: 60
completion: quiz
references:
  - title: "Software Architecture: The Hard Parts (Ford et al.)"
    url: https://www.oreilly.com/library/view/software-architecture-the/9781492086888/
---

## Core × suporte × commodity

Três categorias, do framework de domínio central do DDD combinado com mapas evolutivos: **core** é o
que diferencia a empresa (o que, se feito melhor que o concorrente, gera vantagem real) — vale a pena
construir e manter. **Suporte** é necessário, mas não diferencia — construir é opcional, geralmente
não vale o esforço de manter a longo prazo. **Commodity** é padronizado, disponível de qualquer
fornecedor, sem vantagem em reinventar — comprar é quase sempre a resposta certa. A pergunta "comprar
ou construir" só tem resposta sólida depois de classificar **onde** a capacidade em questão se
encaixa nessas três categorias.

## TCO: além da licença

O **custo total de propriedade** (TCO) de uma decisão de comprar inclui muito mais que o preço da
licença: implantação, integração com o resto do sistema, **operação contínua** (quem mantém isso
funcionando, quem responde quando quebra), treinamento da equipe, e — o item mais frequentemente
esquecido — o **custo de sair** depois, se a decisão precisar ser revertida. Um TCO que só soma
licença contra custo de desenvolvimento está comparando uma fração do custo real de cada lado.

## Aprisionamento, e custo de saída medido

**Aprisionamento** (*vendor lock-in*) é a dificuldade de trocar de fornecedor depois de adotar a
solução — e esse custo deveria ser **medido**, não estimado de memória: quanto custaria migrar os
dados para fora, reescrever as integrações, treinar a equipe de novo? Um fornecedor que parece
barato na entrada pode ter um custo de saída que, somado ao longo do tempo de uso esperado, inverte
completamente a comparação original.

## Risco de fornecedor

Continuidade (o fornecedor vai existir em cinco anos?), DR (o fornecedor tem plano de recuperação de
desastre adequado?), segurança, e conformidade (requisitos regulatórios de terceirização — **confira**
as normas aplicáveis ao seu contexto) são dimensões de risco que uma comparação baseada só em preço e
funcionalidade ignora completamente.

## Adoção de código aberto: licença, manutenção, comunidade

Código aberto não é "gratuito" no sentido de TCO zero — a licença específica tem implicações (algumas
exigem publicar modificações, por exemplo), a **manutenção contínua** ainda precisa de alguém (interno
ou um fornecedor que oferece suporte comercial sobre o projeto aberto), e a **saúde da comunidade**
(quantos contribuidores ativos, com que frequência releases de segurança saem) é um proxy razoável de
quão sustentável é depender daquele projeto no longo prazo.

## Pontuação ponderada, e seus vícios

Uma matriz de pontuação ponderada (critérios, pesos, notas por opção) parece objetiva, mas tem um
vício clássico: o **peso é escolhido depois de saber qual opção já é a favorita**, de forma consciente
ou não — ajustando os pesos até o resultado "objetivo" bater com a conclusão que já estava decidida
antes da análise começar. A defesa é definir pesos **antes** de pontuar as opções, e registrar essa
ordem (pesos definidos, depois pontuação) de forma verificável.

## Prova de conceito, com critério de sucesso escrito antes

Uma prova de conceito (PoC) só serve como evidência se o **critério de sucesso** foi escrito **antes**
de rodar a prova — definido depois, o critério tende a se adaptar ao resultado obtido (sucesso
garantido por definição retroativa), que é o oposto do que uma PoC deveria produzir.

## Análise de sensibilidade: o que precisa ser verdade para a decisão inverter?

Em vez de apresentar a decisão como um número único e definitivo, uma **análise de sensibilidade**
lista quais parâmetros, se variados numa faixa razoável (±20%, por exemplo), fariam a decisão
**inverter**. Isso é mais honesto e mais útil do que "a opção A vence por R$ 50 mil" — porque mostra
exatamente onde a conclusão é frágil e onde é robusta.

## Decisão registrada em ADR, com gatilho de reversão e plano de saída

Toda decisão de comprar ou construir vira uma **ADR** com plano de saída explícito (o que fazer se a
decisão precisar ser revertida, com custo estimado) e **gatilho de reversão** (a condição concreta que
dispararia essa reconsideração) — sem os dois, a decisão vira permanente por inércia, não por mérito
continuamente reavaliado.

## Exemplo numa fintech

Um motor de antifraude: **construir** (modelo de ML próprio, time dedicado) × **comprar**
(`FornecedorA`, fornecedor fictício) × **híbrido** (regras próprias + score comprado). O modelo de
TCO, rodado sobre volume projetado de transações, mostra que a decisão **inverte** acima de um certo
volume — abaixo dele, comprar é mais barato (a operação própria não se paga); acima, construir se
paga porque o custo por transação do fornecedor cresce proporcionalmente ao volume, enquanto o custo
de operar internamente cresce mais lentamente depois do investimento inicial.

## Hands-on

**Tutorial.** Construa `decisoes/tco.go` (ou equivalente) modelando três cenários (construir,
comprar, híbrido) ao longo de 5 anos, com fornecedores **fictícios**.

**Desafio.** Produza o relatório de sensibilidade e a ADR da decisão.

**Invariantes testáveis**

1. O modelo é **determinístico**, e o ponto de equilíbrio calculado **coincide** com o valor
   encontrado por busca numérica independente sobre a mesma função.
2. O relatório de sensibilidade **lista cada parâmetro** que, variado em ±20%, **inverte** a
   decisão — nenhum parâmetro sensível fica de fora da lista.
3. Os pesos da pontuação **somam 1**, e **trocar a ordem** em que as opções são avaliadas **não
   muda** o resultado final.
4. A ADR tem plano de saída com **custo estimado** e **gatilho de reversão** — verificado por *lint*
   sobre o documento.
5. O critério de sucesso da prova de conceito é **escrito antes** do resultado — verificado pela
   data do arquivo do critério ser anterior à data do arquivo do resultado, por convenção de commit.

**Complemento.** Refaça a decisão do exemplo assumindo que o volume projetado é a metade do
originalmente estimado, e veja se a conclusão muda.

**Checagem**

1. Por que classificar uma capacidade como core, suporte ou commodity é o primeiro passo antes de
   perguntar "comprar ou construir"?
2. O que o TCO inclui além da licença, e qual item é o mais frequentemente esquecido?
3. Qual é o vício clássico de uma matriz de pontuação ponderada, e como a defesa (definir pesos
   antes de pontuar) o neutraliza?
4. Por que um critério de sucesso de PoC definido **depois** do resultado é o oposto do que uma PoC
   deveria produzir?
5. O que uma análise de sensibilidade mostra que um número único de decisão não mostra?
6. Por que uma ADR de comprar/construir precisa de gatilho de reversão, mesmo quando a decisão
   parece clara no momento?

> **Reencontro — `seguranca-aplicacao/12`; `observabilidade/16`; `system-design/02`;
> `kubernetes/14`.** A cadeia de suprimentos de `seguranca-aplicacao/12` é onde o risco de depender
> de um fornecedor ou de código aberto já apareceu num contexto de segurança — aqui ele entra como
> dimensão explícita do TCO. Custo e cardinalidade de `observabilidade/16` é a mesma disciplina de
> tornar custo visível, aplicada a decisão de comprar/construir em vez de telemetria. Requisitos e
> números de `system-design/02` é o mesmo exercício de transformar intuição em modelo verificável.
> E a decisão de custo e multi-tenancy de `kubernetes/14` é onde "vale a pena manter isso
> internamente?" já apareceu num contexto adjacente de infraestrutura.

## Principais aprendizados

- Classificar uma capacidade como core, suporte ou commodity é o primeiro passo — a pergunta
  "comprar ou construir" não tem resposta sólida sem essa classificação prévia.
- TCO inclui operação contínua e custo de saída, não só licença — ignorar esses dois itens compara
  uma fração do custo real.
- Uma matriz de pontuação ponderada é vulnerável a escolher pesos depois de já saber qual opção é a
  favorita — a defesa é definir pesos antes de pontuar.
- Uma PoC só é evidência real se o critério de sucesso foi escrito antes do resultado — definido
  depois, ele se adapta ao que já aconteceu.
- Análise de sensibilidade mostra onde a decisão é frágil e onde é robusta — mais útil e mais
  honesto que um número único de conclusão.
