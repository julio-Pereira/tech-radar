---
id: arquitetura-de-nuvem
title: "Arquitetura de nuvem e guardrails"
summary: "Nuvem sem guardrails é só um datacenter com cartão de crédito: a arquitetura está nas fronteiras de conta, identidade, rede e política, não nos serviços."
estimatedMinutes: 65
references:
  - title: "Well-Architected — princípios (visão geral, neutra de fornecedor)"
    url: https://learn.microsoft.com/azure/well-architected/
---

## Zona de pouso: a fundação antes de qualquer serviço

Uma ***landing zone*** (zona de pouso) é a estrutura organizacional que existe **antes** de qualquer
serviço rodar: hierarquia de contas/assinaturas/projetos, identidade e acesso, rede, registro
central, política. Projetar essa fundação primeiro — em vez de criar recursos ad-hoc e organizar
depois — é o que separa uma arquitetura de nuvem deliberada de um amontoado de recursos criados
conforme a necessidade surgia.

## Responsabilidade compartilhada

O provedor de nuvem é responsável por uma parte da pilha (a infraestrutura física, em geral); o
cliente é responsável pelo resto (configuração, dados, controle de acesso às próprias aplicações) —
a linha exata muda por tipo de serviço (IaaS, PaaS, SaaS), e assumir que "a nuvem cuida disso" sem
verificar de qual "isso" especificamente o provedor é responsável é uma fonte recorrente de lacuna de
segurança.

## Raio de explosão, e isolamento por ambiente

O mesmo conceito de `entrega-continua-e-devops/06` (um estado por fronteira limita o alcance de um
erro), aqui aplicado a contas de
nuvem: produção e desenvolvimento em contas **separadas**, sem confiança implícita entre elas, limita
o que um erro de configuração ou uma credencial comprometida numa conta pode afetar na outra.

## Residência e região de dados

Onde os dados fisicamente residem tem implicações regulatórias (LGPD e normas setoriais —
**confira** o texto vigente) que vão além de latência ou custo. A escolha de região não é só uma
decisão de engenharia; é uma decisão que precisa estar alinhada com requisitos legais que variam por
tipo de dado e por jurisdição do titular.

## Política como código: negar por padrão, exceção com prazo

A postura padrão deveria ser **negar** (um recurso só é permitido se explicitamente conforme às
políticas), não **permitir e auditar depois**. Quando uma exceção legítima é necessária, ela tem
**prazo** — a mesma disciplina de exceção com prazo que `governanca-e-paved-road` (marco 06 desta
trilha) formaliza mais à frente.

```diagrama
aso-landing-zone
```

## Etiquetas obrigatórias, e custo por dono

Toda etiqueta obrigatória (dono, custo, ambiente) em todo recurso é o que torna possível, depois,
atribuir **custo por dono** — sem etiqueta, custo acumulado sem responsável identificável é a
situação mais comum e mais difícil de corrigir retroativamente, porque ninguém sabe a quem perguntar.

## Multinuvem e híbrido, sem romantismo

Portabilidade entre provedores de nuvem (ou entre nuvem e infraestrutura própria) tem **custo real**:
abstrair toda a infraestrutura para rodar em qualquer lugar significa, geralmente, não usar
plenamente nenhum dos dois, perdendo os recursos específicos que tornariam cada ambiente mais
eficiente. Multinuvem vale quando há uma razão concreta (resiliência a falha de um provedor inteiro,
requisito regulatório específico) — não como seguro genérico contra uma situação hipotética que nunca
foi avaliada com número.

## Estratégia de saída: inventário, substituto, exportação

Para cada serviço gerenciado adotado, uma estratégia de saída documentada: um **substituto**
identificado (o que substituiria esse serviço se precisasse sair) e uma **exportação de dados
validada** (não só teórica — testada de fato, confirmando que os dados realmente saem em formato
usável). Sem isso, "e se precisarmos sair desse serviço amanhã?" não tem resposta até o dia em que a
pergunta se torna urgente.

## Onde isto encontra o Kubernetes

GitOps (`kubernetes/13`) e a decisão de custo/multi-tenancy (`kubernetes/14`) operam **dentro** da
camada que este marco organiza por fora — a zona de pouso e as políticas de conta são o que decide
em qual conta/assinatura um cluster roda, com quais permissões de rede e identidade; o que acontece
dentro do cluster é o domínio daquela trilha.

## Exemplo numa fintech

Um serviço novo tenta subir numa região não permitida pela política de residência de dados, sem dono
etiquetado, e com um bucket de armazenamento configurado como público por padrão — três políticas
diferentes falham simultaneamente, cada uma pegando uma violação distinta antes que o recurso chegue
a existir de fato.

## Hands-on

**Tutorial.** Construa `nuvem/` com arquivos declarativos de exemplo (conformes e violadores) e três
políticas avaliadas por um motor local.

**Desafio.** Produza o inventário de estratégia de saída para os serviços gerenciados do seu
desenho.

**Invariantes testáveis**

1. **Cada** *fixture* violadora **falha** com a política esperada correspondente; a *fixture*
   conforme **passa** — testado par a par, nunca só o caso de sucesso.
2. Toda política tem uma *fixture* que a **viola** — uma regra sem teste negativo é **rejeitada**
   (não entra no conjunto de políticas válidas).
3. O inventário de saída tem, para **todo** serviço gerenciado listado, um substituto e uma
   **exportação de dados validada** (formato verificado, não assumido).
4. Um recurso sem `owner` ou sem `custo` etiquetado **falha** a validação.
5. A hierarquia de contas modelada **não permite** confiança implícita entre produção e
   desenvolvimento — verificado por análise do grafo de permissões.

**Complemento.** Estime o custo de sair de um serviço gerenciado real do seu contexto de trabalho —
migração de dados, reescrita de integração, tempo de equipe.

**Checagem**

1. O que uma zona de pouso estabelece antes de qualquer serviço rodar, e por que isso precisa vir
   primeiro?
2. Por que a postura padrão de política deveria ser negar, não permitir e auditar depois?
3. O que etiquetas obrigatórias de dono e custo tornam possível depois, que sua ausência torna quase
   impossível de corrigir?
4. Por que multinuvem "por segurança genérica" é descrito como romantismo sem número, em vez de
   decisão de arquitetura?

> **Reencontro — `system-design/13`; `dados-distribuidos/12`; `kubernetes/13`; `kubernetes/14`;
> `seguranca-aplicacao/10`.** Regiões e células de `system-design/13` são a mesma decisão de
> distribuição geográfica, aqui vista pela lente de conta e política de nuvem, não de disponibilidade
> de aplicação. O backup e DR de `dados-distribuidos/12` é onde a estratégia de saída de um serviço
> gerenciado de banco de dados específico já apareceu. O GitOps de `kubernetes/13` e a decisão de
> custo de `kubernetes/14` operam dentro da estrutura que este marco organiza por fora. E segredos e
> chaves de `seguranca-aplicacao/10` são o tipo de recurso que a identidade e acesso da zona de
> pouso precisa proteger desde a fundação.

## Principais aprendizados

- Uma zona de pouso (hierarquia de contas, identidade, rede, política) é a fundação que precisa
  existir antes de qualquer serviço, não organizada retroativamente depois que os recursos já
  existem.
- Responsabilidade compartilhada muda por tipo de serviço (IaaS, PaaS, SaaS) — assumir que "a nuvem
  cuida disso" sem verificar qual parte é fonte recorrente de lacuna.
- Política como código deveria negar por padrão, com exceções explícitas e sempre com prazo.
- Etiquetas obrigatórias de dono e custo são o que torna "custo sem responsável" uma situação
  evitável, em vez da mais comum e mais difícil de corrigir depois.
- Multinuvem vale com razão concreta e medida, nunca como seguro genérico contra uma situação
  hipotética nunca avaliada com número.
