---
id: catalogo-e-propriedade
title: "Catálogo de software e propriedade"
summary: "Quem não sabe o que existe, de quem é e do que depende não consegue rotear um alerta, alocar custo nem aposentar nada — o catálogo é a base de todas as outras capacidades."
estimatedMinutes: 60
references:
  - title: "CNCF Platforms White Paper"
    url: https://tag-app-delivery.cncf.io/whitepapers/platforms/
---

## Catálogo como código, e como dado

Um descritor de catálogo vive **ao lado do código** de cada componente (esquema definido por
ADR) — não num sistema separado mantido manualmente por outra equipe. Ao mesmo tempo, esse
descritor é **consumido como dado** por outras automações (roteamento de alerta, atribuição de
custo, verificação de conformidade) — a dualidade "código perto de quem o escreve, dado consumível
por quem precisa" é o que faz o catálogo se manter atualizado sem exigir um processo manual de
sincronização constante.

## Modelo de entidades: sistema, componente, API, recurso, grupo, dono

Um catálogo útil modela, no mínimo: **sistema** (uma coleção de componentes com propósito de
negócio comum), **componente** (um serviço, uma biblioteca), **API** (um contrato exposto),
**recurso** (banco, fila, bucket), **grupo** (equipe), e **dono** — com **relações** explícitas
entre eles (este componente pertence a este sistema, é dono deste grupo, expõe esta API, depende
deste recurso).

## Relações, e o grafo de dependência

As relações entre entidades formam um **grafo de dependência** — o mesmo tipo de grafo que o marco
01 de `arquitetura-de-solucoes` já constrói no nível de capacidades, aqui no nível mais granular de
componentes de software. Esse grafo é o que permite responder "se eu mudar ou desligar este
componente, o que mais é afetado?" sem depender de memória de quem está presente no momento.

```diagrama
ep-catalogo
```

## Propriedade como contrato

"Dono" não é um campo decorativo — é um **contrato**: o dono se compromete a **escalonamento**
(quem é acordado quando algo quebra) e **canal** (onde a equipe pode ser contatada). Um componente
sem dono funcional (mesmo que tenha um nome de equipe preenchido no catálogo, se essa equipe não
responde mais por aquele componente de fato) é, na prática, um componente sem dono — o campo
precisa refletir a realidade operacional, não só um registro histórico.

## Frescor: metadado velho é pior que nenhum

Um catálogo que diz que o dono de um componente é uma equipe que foi reorganizada há seis meses é
**pior** que não ter metadado algum — porque gera confiança falsa (alguém vai agir com base na
informação errada) em vez de incerteza honesta (que levaria a verificar antes de agir). **Frescor**
— quando o metadado foi confirmado por último — precisa ser visível, não assumido eternamente
válido.

## Descoberta × registro

Um catálogo pode ser **populado por registro manual** (cada time preenche seu descritor) ou por
**descoberta automática** (varredura do código ou da infraestrutura real, inferindo entidades) — os
dois têm vantagens e riscos diferentes: registro manual é mais rico semanticamente, mas depende de
disciplina contínua; descoberta automática nunca fica desatualizada, mas pode perder nuance que só
um humano registraria.

## *Scorecards* de maturidade, sem virar ranking punitivo

Um ***scorecard*** avalia um componente contra critérios declarados (tem SLO? tem *runbook*? tem
dono? tem testes? tem SBOM?) — útil como ferramenta de **melhoria guiada**, perigoso se usado como
ranking que **pune** quem está atrás, em vez de orientar onde investir esforço de melhoria. A
diferença está em como o resultado é usado, não no mecanismo de pontuação em si.

## Ligação com mapa de capacidades e com RBAC

O catálogo deste marco é mais granular (componentes de software) que o mapa de capacidades
(`arquitetura-de-solucoes/01`, que trata de capacidades de negócio) — os dois se conectam, mas não
são a mesma coisa. E o RBAC (`kubernetes/10`) consome o catálogo para saber quem deveria ter acesso
a quê, baseado em propriedade real, não numa lista de permissões mantida separadamente e
divergente.

## Catálogo alimenta roteamento, custo, conformidade

Sem um catálogo confiável, roteamento de alerta (para quem?), atribuição de custo (de quem?), e
verificação de conformidade (quem está fora do *paved road*?) ficam todos sem fundação — o catálogo
não é uma capacidade isolada, é o pré-requisito de várias outras.

## Exemplo numa fintech

Um serviço sem dono recebe um alerta de produção às 3h da manhã — e não há ninguém para acordar,
porque o campo de dono no catálogo apontava para uma equipe que foi reorganizada meses atrás e
nunca mais atualizou o registro. O alerta existe, a automação de roteamento funciona tecnicamente,
mas o catálogo desatualizado faz a cadeia inteira falhar silenciosamente no último passo.

## Hands-on

**Tutorial.** Construa `catalogo/` com esquema e **12 entidades** reais do `fin-platform`.

**Desafio.** Implemente *scorecard* e detecção de componentes órfãos.

**Invariantes testáveis**

1. Todo componente tem **um** dono que **existe** no catálogo — não um nome de equipe que não
   corresponde a nenhum grupo registrado.
2. Toda relação aponta para uma entidade **existente**, e **ciclos** de dependência são
   **listados** explicitamente, nunca escondidos.
3. O *scorecard* é **determinístico**: mudar um campo específico muda o nível do componente
   conforme a **tabela de regras** declarada — testado por tabela, não por inspeção visual.
4. Um componente com código **existente** no repositório mas **sem descritor** no catálogo é
   detectado como **órfão** — verificado por varredura cruzando repositório e catálogo.
5. A transferência de propriedade de um componente é **append-only** — o histórico de donos
   anteriores é preservado, nunca sobrescrito.

**Complemento.** Modele uma dependência circular real (ou plausível) do seu contexto de trabalho, e
decida explicitamente quem deveria quebrá-la.

**Checagem**

1. Por que o catálogo vive "ao lado do código" e é, ao mesmo tempo, consumido como dado por outras
   automações?
2. Por que propriedade é um contrato (escalonamento, canal), não só um nome preenchido num campo?
3. Por que metadado desatualizado é descrito como pior que nenhum metadado?
4. Como um *scorecard* de maturidade evita virar ranking punitivo, segundo a distinção deste
   marco?

> **Reencontro — `kubernetes/10`; `observabilidade/13`; `system-design/01`; `seguranca-aplicacao/12`.**
> RBAC e auditoria de `kubernetes/10` consomem diretamente a propriedade registrada no catálogo
> deste marco. O roteamento de alerta de `observabilidade/13` depende do mesmo catálogo para saber
> quem acordar. O modelo C4 de `system-design/01` é outra forma de descrever componentes e
> relações, numa granularidade usada mais para comunicação do que para automação. E a cadeia de
> suprimentos de `seguranca-aplicacao/12` é onde SBOM, um dos critérios do *scorecard*, já é tratado
> em profundidade.

## Principais aprendizados

- O catálogo vive ao lado do código, mas é consumido como dado por outras automações — essa
  dualidade é o que o mantém atualizado sem exigir sincronização manual constante.
- Propriedade é um contrato com escalonamento e canal, não um campo decorativo preenchido uma vez e
  esquecido.
- Metadado desatualizado é pior que nenhum metadado — gera confiança falsa em vez de incerteza
  honesta que levaria a verificar antes de agir.
- *Scorecards* orientam melhoria guiada quando usados corretamente; virar ranking punitivo é um uso
  incorreto do mesmo mecanismo, não uma falha do mecanismo em si.
- O catálogo é pré-requisito de roteamento de alerta, atribuição de custo e verificação de
  conformidade — não uma capacidade isolada.
