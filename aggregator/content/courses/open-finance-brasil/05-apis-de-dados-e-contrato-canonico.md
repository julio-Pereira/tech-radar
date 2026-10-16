---
id: apis-de-dados-e-contrato-canonico
title: "APIs de dados e contrato canônico"
summary: "O contrato é público, estável e escrito por outros; o seu core é privado, antigo e diferente — e a diferença entre os dois é uma camada de código com testes."
estimatedMinutes: 60
references:
  - title: "OpenAPI Specification"
    url: https://spec.openapis.org/oas/latest.html
---

## Famílias de APIs de dados

O ecossistema organiza suas APIs de dados em famílias — cadastro, contas, cartões, crédito,
investimentos, entre outras (**conferir** a lista vigente, que cresce por fase) — cada uma com seu
próprio conjunto de endpoints, permissões e estrutura de dados. Tratar "a API do Open Finance"
como uma coisa única, em vez de várias famílias com suas próprias regras, é um erro de modelagem
que se manifesta quando a implementação de uma família assume, incorretamente, premissas de outra.

## Contrato-primeiro: OpenAPI como fonte

A especificação técnica do ecossistema publica um **OpenAPI** que é, ele mesmo, a fonte de
verdade do contrato — a prática de **contrato-primeiro** parte desse OpenAPI para **gerar tipos**
automaticamente e **validar em tempo de execução** que cada resposta realmente corresponde ao que
foi declarado, em vez de escrever o contrato de memória e descobrir divergências só quando um TPP
reclama.

## A camada anticorrupção: do core legado ao contrato canônico

O core bancário por trás do transmissor é, tipicamente, antigo, privado, e modelado para suas
próprias necessidades internas — nada disso é compatível, por acaso, com um contrato público e
estável definido por terceiros. A **camada anticorrupção** (já formalizada em
`arquitetura-de-solucoes/03` para o problema geral de core legado) é o componente que absorve essa
diferença: ela traduz, valida e, quando necessário, **recusa devolver** o que não consegue garantir
corretamente — nunca expõe a estrutura interna do core diretamente ao contrato público.

## O que o core não tem: nulos, enums e moeda

Problemas concretos de mapeamento que a camada anticorrupção precisa resolver: campos
**obrigatórios** pelo contrato que o core simplesmente não possui (exigindo uma decisão explícita
de política, nunca um valor inventado); **enumerações** do contrato que não cobrem todos os valores
internos do core (a convenção de um valor **"outros"** explícito para o que não mapeia
diretamente); **datas e fusos horários** representados de forma inconsistente internamente; e
**valores monetários** que, no core, podem não ter moeda explícita associada — todos exigindo
tradução deliberada, nunca repasse direto.

## Paginação padronizada e filtros por data

A paginação de uma lista (de transações, por exemplo) segue um padrão definido pelo contrato
(estrutura de links, metadados, tamanho de página — **conferir** os detalhes exatos vigentes), e
**filtros por data** sobre um intervalo são comuns nas APIs de extrato. Implementar paginação
customizada, divergente do padrão esperado, quebra qualquer cliente que tenha sido escrito contra
o contrato oficial, mesmo que a paginação customizada seja, isoladamente, "melhor".

## Paginação sob mudança: integridade quando o extrato muda

Um extrato sendo paginado pode receber **novos lançamentos durante a própria leitura** — a
pergunta real é se a paginação garante que **nenhum item se perde e nenhum item se repete**, mesmo
sob essa mudança concorrente. Isso exige uma estratégia de paginação (um cursor estável, por
exemplo, em vez de um deslocamento numérico simples que uma inserção no meio pode invalidar)
desenhada deliberadamente para esse cenário, não assumida como "provavelmente funciona".

## Minimização por permissão

Uma resposta de API só deveria incluir os **campos cobertos pelas permissões** do consentimento
ativo — mesmo que o endpoint, tecnicamente, pudesse retornar mais. Devolver um campo que o
consentimento não autoriza, mesmo que "só por conveniência" ou porque o core já trazia o dado
junto, é uma violação de minimização, não um detalhe inofensivo.

## Versionamento e *sunset*

Uma nova versão de uma API de dados precisa coexistir, por um período, com a versão anterior —
**versionamento** explícito e uma data de **sunset** (quando a versão antiga deixa de responder)
são partes do mesmo contrato público que rege tudo nesta trilha. Uma versão antiga que muda de
comportamento silenciosamente, sem seguir esse processo, quebra TPPs que ainda dependem dela
legitimamente.

## Exemplo numa fintech

O core bancário guarda o limite de crédito como um número sem moeda associada e o tipo de conta
como um código numérico interno — a camada de mapeamento traduz o código para a enumeração pública
correta (ou para "outros", se não houver correspondência direta), associa a moeda correta ao
limite, e **recusa** devolver qualquer campo que não consiga garantir com confiança suficiente.

## Hands-on

**Tutorial.** Implemente a API de contas e saldos sobre um core simulado, validada contra o
OpenAPI do contrato.

**Desafio.** Implemente paginação íntegra sob um extrato em mudança concorrente, e o mapeamento de
enumerações do core para o contrato.

**Invariantes testáveis**

1. **Toda resposta valida** contra o contrato OpenAPI — verificado por um teste de contrato numa
   tabela de cenários, incluindo o caso de um campo opcional ausente.
2. Um dado do core que **viola** o contrato (um nulo onde o contrato exige valor, um enum
   desconhecido) produz um **erro observável** explícito — nunca uma resposta inválida silenciosa.
3. Paginando um extrato que recebe **novos lançamentos durante a leitura**, nenhum item se perde
   nem se repete — propriedade verificada com semente fixa sobre um cenário de mutação concorrente.
4. A resposta contém **apenas** os campos cobertos pelas permissões do consentimento ativo —
   verificado comparando a resposta contra o conjunto de permissões de diferentes consentimentos
   sintéticos.
5. **Valores monetários e moedas são exatos** — nenhuma coluna ou tipo intermediário usa ponto
   flutuante, verificado por varredura.
6. Uma **versão antiga** da API continua respondendo **exatamente igual** depois que a nova versão
   é publicada — teste de compatibilidade entre as duas versões simuladas.

**Complemento.** Liste cinco campos do seu próprio core (real ou hipotético) que não cabem
diretamente no contrato público, e descreva a política de mapeamento para cada um.

**Checagem**

1. Por que contrato-primeiro (gerar tipos e validar em runtime a partir do OpenAPI) é preferível a
   escrever o contrato de memória?
2. O que a camada anticorrupção deveria fazer quando o core não consegue garantir um campo que o
   contrato exige como obrigatório?
3. Por que paginação sob um extrato em mudança concorrente precisa de uma estratégia deliberada,
   em vez de um deslocamento numérico simples?
4. Por que devolver um campo fora das permissões do consentimento é uma violação, mesmo que o
   endpoint tecnicamente pudesse retorná-lo?

> **Reencontro — `arquitetura-de-solucoes/03`.** O mapeamento de core bancário e legado daquele
> marco é exatamente a disciplina de camada anticorrupção que este marco aplica especificamente ao
> contrato canônico do ecossistema de Open Finance.

O contrato de API como superfície estável de `system-design/05` é o princípio geral que o OpenAPI
do ecossistema implementa de forma regulada; a arquitetura hexagonal de `arquitetura-de-software/04`
é um padrão natural para isolar o core das regras de mapeamento deste marco; e a identidade e
unicidade de `dados-distribuidos/10` sustenta a idempotência de leitura que a paginação íntegra
sob mudança concorrente, aqui, exige.

## Principais aprendizados

- Contrato-primeiro — gerar tipos e validar em runtime contra o OpenAPI — evita divergências que
  só apareceriam quando um TPP reclamasse.
- A camada anticorrupção recusa devolver o que não consegue garantir, nunca inventa um valor para
  preencher um campo obrigatório que o core não tem.
- Paginação sob um extrato em mudança concorrente exige uma estratégia deliberada (como cursor
  estável) para nunca perder nem repetir um item.
- Minimização por permissão significa devolver só os campos que o consentimento ativo cobre,
  mesmo que o endpoint pudesse retornar mais.
- Uma versão antiga da API precisa continuar respondendo exatamente igual depois que uma nova
  versão é publicada, até o sunset declarado.
