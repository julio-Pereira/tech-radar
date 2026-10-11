---
id: ambientes-como-servico
title: "Ambientes como serviço"
summary: "\"Me dá um ambiente\" deve ser uma chamada de API que devolve um ambiente seguro, com dono, com custo e com prazo de vida — e que sabe se apagar sem apagar o que não deve."
estimatedMinutes: 70
completion: quiz
references:
  - title: "Crossplane — documentation (como estudo comparativo)"
    url: https://docs.crossplane.io/
---

## Pedido de ambiente → definição declarativa → entrega por GitOps

O fluxo completo: um pedido ("ambiente de homologação para o serviço X") é traduzido numa
**definição declarativa** (manifestos, módulos Terraform), que é entregue ao destino via GitOps
(`kubernetes/13`) — o mesmo padrão de pedido-plano-reconciliação do marco 02, aplicado
especificamente a ambientes.

## O que é um ambiente: espaço de nomes, cota, rede, identidade, etiquetas

Um ambiente completo não é só um *namespace* vazio — inclui **cota** e **limites** (padrões, não
negociados caso a caso toda vez — `kubernetes/05`), **rede** (isolamento, regras de acesso),
**identidade** (quem/o que pode agir dentro do ambiente), e **etiquetas** (dono, custo, ambiente —
obrigatórias, a mesma disciplina de `arquitetura-de-solucoes/05`).

## Cotas e limites padrão, e negação clara

Pedir um ambiente maior que o permitido deveria ser **negado com uma mensagem clara** (qual é o
limite, e como pedir uma exceção, se legítima) — nunca uma falha silenciosa ou um erro genérico que
não explica o motivo real da negação.

## Módulos Terraform como produto versionado

Os módulos Terraform usados para provisionar um ambiente (`entrega-continua-e-devops/06`, **trilha
planejada** até sua publicação) são, eles mesmos, um **produto** da plataforma — versionados,
testados, com contrato — não um script ad-hoc copiado e colado a cada novo tipo de ambiente
necessário.

## API de plataforma sobre Kubernetes: *operators*/CRDs e composição (**confira**)

*Operators* e CRDs (`kubernetes/08`) são um mecanismo comum para expor "ambiente" como um recurso
Kubernetes de primeira classe, reconciliado continuamente. Ferramentas de composição de
infraestrutura (Crossplane, por exemplo) oferecem abstrações semelhantes sobre recursos de nuvem —
tratadas aqui só como **estudo comparativo**, com licença e maturidade a **conferir**, não como
pré-requisito de implementação.

## Ciclo de vida completo: criação, mudança, TTL, expiração, remoção

Um ambiente tem ciclo de vida completo, não só criação: **mudança** (ajustar depois de criado),
**TTL** (tempo de vida declarado), **expiração** (o que acontece quando o TTL se esgota), e
**remoção** — cada etapa com comportamento definido, não assumido.

## Proteção de ambientes com dados

Um ambiente marcado como **protegido** (ou com um marcador explícito de que contém dados
importantes) nunca é removido automaticamente pelo TTL, mesmo que o prazo tenha se esgotado — a
remoção automática de **qualquer** ambiente que contenha dados reais (mesmo sintéticos, se
representam esforço de configuração significativo) sem essa proteção é o tipo de incidente que essa
regra existe para prevenir.

## Dono obrigatório vindo do catálogo

Todo ambiente tem **dono**, e esse dono precisa existir no **catálogo** (marco 03) — não um nome de
equipe digitado livremente no momento do pedido, que pode nem corresponder a nada real.

## Recurso zumbi

Um **recurso zumbi** é algo que continua existindo e custando, mas que ninguém mais usa — geralmente
porque o processo de remoção falhou silenciosamente, ou porque o TTL nunca foi configurado para
aquele recurso específico. Detectar zumbis ativamente (não esperar que alguém note a fatura) é parte
da operação saudável de ambientes como serviço.

## Ambientes efêmeros por PR

A mesma disciplina de `entrega-continua-e-devops/05` (**trilha planejada**) — um ambiente criado
automaticamente por PR, destruído no fechamento — é um caso particular de "ambiente como serviço",
só que com ciclo de vida atado ao PR em vez de a um TTL fixo.

## Dia 2: escalar, estender prazo, migrar

Depois da criação, um ambiente tem necessidades de **dia 2**: escalar (mais capacidade), estender o
TTL (prorrogar o prazo, com justificativa), migrar (mover para outra configuração). Tratar essas
operações como **parte da API**, não como exceções manuais fora do fluxo normal, é o que diferencia
"ambiente como serviço" de "ambiente criado por script uma vez e depois gerenciado manualmente".

## Exemplo numa fintech

Um ambiente de homologação, criado para testar uma funcionalidade específica, é esquecido depois que
o teste termina — mantendo um banco de dados com dados de teste rodando por seis meses, sem que
ninguém perceba o custo acumulado. O TTL, se tivesse sido configurado desde a criação, teria
expirado o ambiente automaticamente há cinco meses — a ausência de TTL, não a existência dele, é o
que causou o problema.

## Hands-on

**Tutorial.** Estenda `plataforma/` (marco 02) para transformar um pedido de ambiente em módulo
Terraform local e manifestos gerados.

**Desafio.** Implemente TTL e proteção.

**Invariantes testáveis**

1. A definição gerada é **válida** (`terraform validate`, manifestos validados como arquivo) e
   **passa na política** de nuvem aplicável.
2. Um pedido **acima da cota** configurada é **negado**, com mensagem que informa o **limite**
   exato — não um erro genérico.
3. Com **relógio falso**, o *reaper* (processo de limpeza por TTL) **remove só o que expirou** e
   **nunca** um ambiente marcado `protegido` ou com marcador de dados — verificado contra uma massa
   de ambientes mista (expirados, não expirados, protegidos).
4. **Segunda aplicação sem mudanças**: a mesma disciplina de idempotência do Terraform aplicada ao
   fluxo de ambiente completo.
5. Todo ambiente tem dono **existente no catálogo** e etiquetas de custo — senão, o pedido é
   **negado** na criação, não aceito e corrigido depois.
6. Remover um ambiente **duas vezes** é idempotente — a segunda remoção não produz erro nem efeito
   adicional.

**Complemento.** Projete a estratégia de prorrogação de TTL — quem pode pedir, com que
justificativa, por quanto tempo adicional.

**Checagem**

1. O que compõe um "ambiente" completo, além do espaço de nomes vazio?
2. Por que negar um pedido acima da cota precisa de mensagem clara, em vez de erro genérico?
3. Por que um ambiente protegido nunca é removido automaticamente pelo TTL, mesmo com o prazo
   esgotado?
4. O que torna um recurso "zumbi", e por que detectá-lo ativamente é melhor do que esperar a
   fatura revelar o problema?

> **Reencontro — `kubernetes/05`; `kubernetes/08`; `kubernetes/13`; `kubernetes/14`;
> `dados-distribuidos/12`.** Cotas e limites padrão de `kubernetes/05` são o mecanismo direto que
> este marco aplica a ambientes como serviço. *Operators*/CRDs de `kubernetes/08` são a
> implementação típica de "ambiente" como recurso de primeira classe. O GitOps de `kubernetes/13`
> entrega a definição declarativa gerada. A decisão de custo e quando não usar de `kubernetes/14`
> informa quando um ambiente deveria simplesmente não existir. E o backup/PITR de
> `dados-distribuidos/12` é onde a pergunta "o que fazer com dados antes de remover algo" já
> apareceu num contexto adjacente.

## Principais aprendizados

- "Ambiente" completo inclui cota, rede, identidade e etiquetas — não só um espaço de nomes vazio.
- Negar um pedido acima da cota precisa de mensagem clara, com o limite exato e o caminho de
  exceção — nunca um erro genérico sem explicação.
- Um ambiente protegido nunca é removido automaticamente, mesmo com TTL esgotado — proteção
  explícita sempre vence expiração automática.
- Dono de ambiente precisa existir no catálogo real, não ser um nome digitado livremente no momento
  do pedido.
- Recurso zumbi é detectado ativamente, não descoberto quando alguém finalmente nota a fatura —
  ausência de TTL é geralmente a causa raiz.
