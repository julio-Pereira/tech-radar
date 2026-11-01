---
id: arquitetura-de-uma-idp
title: "Arquitetura de uma IDP"
summary: "O coração de uma plataforma não é o portal: é uma API declarativa com reconciliação, que o portal, a linha de comando e a automação consomem."
estimatedMinutes: 60
completion: quiz
references:
  - title: "CNCF Platforms White Paper"
    url: https://tag-app-delivery.cncf.io/whitepapers/platforms/
  - title: "Kubernetes — Operator pattern"
    url: https://kubernetes.io/docs/concepts/extend-kubernetes/operator/
---

## Planos (camadas) de uma IDP (**confira** o white paper vigente)

Uma plataforma interna de desenvolvimento (IDP) é geralmente descrita em camadas: interface com o
desenvolvedor (como as equipes interagem — API, CLI, portal), integração e entrega (a esteira,
`entrega-continua-e-devops`), recursos (o que de fato é provisionado — ambientes, bancos, filas),
observabilidade, e segurança. Cada camada tem responsabilidade própria, e confundir onde uma
capacidade deveria morar (por exemplo, tratar segurança como só um detalhe da camada de recursos)
produz lacunas que só aparecem quando alguém tenta contornar a camada errada.

```diagrama
ep-idp
```

## Plataforma como API: pedido → plano → reconciliação

O padrão central desta trilha, emprestado diretamente do modelo de **reconciliação** do Kubernetes
(`kubernetes/01`): um cliente faz um **pedido declarativo** ("quero um ambiente de homologação para
o serviço X"), a plataforma calcula um **plano** (o que precisa ser criado, mudado ou removido para
atingir o estado desejado), e um **reconciliador** trabalha continuamente para que o estado real
convirja para o estado desejado — não só uma vez, mas continuamente, corrigindo qualquer desvio que
aparecer depois.

## Idempotência por identificador de pedido

O mesmo pedido, identificado pelo mesmo **identificador único**, enviado duas vezes (por exemplo,
por causa de um *timeout* que fez o cliente reenviar sem saber se o primeiro tinha sido processado),
deveria produzir **o mesmo resultado** — nunca dois recursos onde deveria haver um. Isso exige que a
API trate o identificador de pedido como chave central da operação, não apenas um campo informativo.

## Atomicidade, com compensação

Um pedido que envolve múltiplos recursos (por exemplo, um ambiente que precisa de um banco, uma rede
e um conjunto de permissões) deveria ser **tudo ou nada**: se o terceiro recurso falhar ao criar, os
dois primeiros já criados precisam ser **desfeitos** (compensação), não deixados pela metade, num
estado que ninguém decidiu deliberadamente.

```diagrama
ep-pedido
```

## Contrato versionado, e compatibilidade

A API da plataforma, como qualquer API (`system-design/05`), precisa de **contrato versionado** —
uma mudança incompatível (remover um campo que clientes já usam, por exemplo) quebra quem consome,
e precisa ser detectada **antes** de chegar a produção, por teste de compatibilidade, não descoberta
por um cliente reportando erro.

## *Control plane* × portal

O ***control plane*** é o mecanismo que processa pedidos, calcula planos e reconcilia — o **cérebro**
da plataforma. Um **portal** visual é só um dos possíveis **clientes** desse *control plane*, junto
com uma CLI e automações programáticas. Confundir os dois leva ao erro de construir primeiro um
portal bonito sem nenhum mecanismo real por trás — decoração sem função.

## Plataforma fina × espessa

Uma plataforma **fina** orquestra recursos que já existem em outro lugar (Terraform, Kubernetes),
sem "possuir" a infraestrutura diretamente. Uma plataforma **espessa** possui mais lógica e estado
próprios. A escolha entre as duas é uma decisão arquitetural real, não um detalhe de implementação —
uma plataforma mais fina é geralmente mais fácil de manter atualizada com as ferramentas que
orquestra; uma mais espessa pode oferecer uma experiência mais coesa, ao custo de mais código
próprio para manter.

## Onde a política é aplicada: entrada, reconciliação, ou destino

Uma política (de segurança, de custo, de conformidade) pode ser verificada **na entrada** do pedido
(antes de aceitar), **durante a reconciliação** (a cada ciclo de convergência), ou **no destino**
(pelo sistema que recebe o recurso, como o Kubernetes aplicando *admission control*). As três
camadas são complementares, não substitutas — uma política só na entrada não pega um recurso que
foi alterado manualmente depois, fora do fluxo da plataforma.

## Falha parcial, e retomada

Quando a reconciliação falha no meio (um dos vários recursos de um pedido não pôde ser criado por um
problema transitório), o mecanismo precisa saber **retomar** de onde parou, não recomeçar do zero
nem ficar travado indefinidamente esperando uma intervenção manual.

## Comprar × construir cada componente (ADR)

Backstage, Crossplane, e outras ferramentas de composição de plataforma existem e evoluem
rapidamente (**confira** licença e maturidade antes de adotar) — cada componente da arquitetura da
IDP (portal, motor de composição de infraestrutura, catálogo) é uma decisão independente de
comprar ou construir, registrada em ADR, não uma escolha única "a plataforma inteira é produto X".

## Exemplo numa fintech

Pedir "ambiente de homologação para o serviço X" duas vezes, por causa de um *timeout* de rede entre
o cliente e a API da plataforma, não pode criar dois ambientes. O identificador do pedido (gerado
pelo cliente, não pelo servidor, para funcionar mesmo que a primeira resposta nunca tenha chegado)
garante que a segunda tentativa reconhece que aquele pedido já foi processado e devolve o mesmo
resultado, sem criar nada novo.

## Hands-on

**Tutorial.** Construa `plataforma/` com `POST /v1/pedidos`, armazenamento em arquivo, e um
reconciliador.

**Desafio.** Implemente atomicidade com compensação, e o teste de contrato.

**Invariantes testáveis**

1. O **mesmo pedido** (mesmo identificador) enviado duas vezes produz **o mesmo resultado** e **um
   só** recurso — nunca dois.
2. Depois da reconciliação, o estado **observado = desejado**; uma deriva introduzida manualmente é
   **corrigida** no próximo ciclo.
3. Uma **quebra de contrato** (um campo removido da especificação da API) é **detectada** por teste
   de compatibilidade, antes de qualquer cliente real ser afetado.
4. Uma falha injetada no **meio** de um pedido de 3 recursos deixa **0 ou 3** recursos — nunca 1 ou
   2 — com compensação verificada.
5. A **CLI** executa exatamente as mesmas operações que o portal executaria — a API é a **única
   porta** de entrada, verificado pela ausência de qualquer caminho que contorne a API.

**Complemento.** Desenhe o que mudaria na arquitetura se o reconciliador precisasse rodar em
múltiplos nós simultaneamente, em vez de um só.

**Checagem**

1. Por que a plataforma é descrita como "pedido → plano → reconciliação", em vez de só "executar
   uma ação"?
2. Por que o mesmo pedido enviado duas vezes precisa produzir o mesmo resultado, e o que isso exige
   da API?
3. Qual é a diferença entre plataforma fina e espessa, e por que a escolha entre elas é uma decisão
   arquitetural, não um detalhe de implementação?
4. Por que política verificada só na entrada do pedido não é suficiente, mesmo com reconciliação
   contínua existindo?
5. O que falha parcial com retomada exige do mecanismo, em comparação a simplesmente recomeçar do
   zero?
6. Por que o portal é descrito como "só um dos clientes" do *control plane*, e não o *control
   plane* em si?

> **Reencontro — `kubernetes/01`; `kubernetes/08`; `system-design/05`; `arquitetura-eventos/08`.**
> O modelo declarativo e a reconciliação de `kubernetes/01` são o padrão central que esta trilha
> inteira aplica, generalizado para qualquer recurso da plataforma, não só objetos do Kubernetes.
> *Operators*/CRDs de `kubernetes/08` são a implementação concreta mais comum desse padrão de
> reconciliação dentro de um cluster. O contrato de API de `system-design/05` é a mesma disciplina
> aplicada à API da plataforma. E idempotência e *outbox* de `arquitetura-eventos/08` são o mesmo
> mecanismo de identificador único que garante o mesmo pedido, enviado duas vezes, não duplicar
> efeito.

## Principais aprendizados

- O padrão central de uma IDP é "pedido declarativo → plano → reconciliação contínua" — não uma
  ação executada uma vez e esquecida.
- Idempotência por identificador de pedido garante que reenviar o mesmo pedido (por *timeout*, por
  exemplo) nunca duplica o resultado.
- Atomicidade com compensação garante que um pedido com múltiplos recursos nunca fica pela metade —
  é tudo ou nada.
- Plataforma fina orquestra o que já existe; plataforma espessa possui mais lógica própria — a
  escolha entre as duas é decisão arquitetural real.
- O portal é só um cliente do *control plane*, não o *control plane* em si — confundir os dois leva
  a construir decoração sem mecanismo por trás.
