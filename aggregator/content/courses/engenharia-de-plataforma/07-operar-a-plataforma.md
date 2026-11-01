---
id: operar-a-plataforma
title: "Operar a plataforma"
summary: "A plataforma é um serviço crítico que atende clientes internos — precisa de SLO, suporte e isolamento de falha: se ela cair, o que já roda tem que continuar rodando."
estimatedMinutes: 60
references:
  - title: "DORA — pesquisa e métricas de entrega"
    url: https://dora.dev/
---

## SLIs/SLOs da plataforma

A plataforma, como qualquer serviço crítico (`observabilidade/12`), tem **SLIs** próprios:
disponibilidade da API, taxa de sucesso de pedidos, **tempo de provisionamento** p95 (quanto tempo
um pedido típico leva do início ao fim), e frescor do catálogo (marco 03). Esses SLIs alimentam
**SLOs** com **orçamento de erro** — a mesma disciplina de qualquer sistema de produção, aplicada
aqui ao sistema que serve todas as outras equipes.

## Plano de dados × plano de controle: a separação que importa mais aqui

A distinção mais importante desta trilha, em termos operacionais: o que **já está em execução**
(um serviço já implantado, um ambiente já provisionado — **plano de dados**) não pode **depender**
do *control plane* da plataforma para continuar funcionando. Se a API da plataforma cai, os
serviços que ela já ajudou a implantar deveriam continuar rodando normalmente — a plataforma fora
do ar impede **novas** operações (criar, mudar), não **interrompe** o que já existe.

## Modelo de suporte

Um canal claro, **triagem** (classificar o pedido antes de rotear), **prazos** declarados por tipo
de solicitação, e horário de atendimento — a separação explícita entre ***bug*** (algo quebrado),
**pedido** (uma solicitação de algo novo) e **dúvida** (uma pergunta) evita que os três tipos
diferentes de demanda sejam tratados com a mesma prioridade e o mesmo processo, quando deveriam ter
tratamentos distintos.

## *Runbooks*, e plantão

Todo alerta da plataforma (`observabilidade/13`) tem um ***runbook*** correspondente — sem ele, um
alerta que dispara às 3h é só ansiedade sem direção para quem está de plantão. E o plantão da
plataforma, como qualquer plantão, precisa de dono, rotação e critério claro de quando escalar.

## Gestão de mudança da própria plataforma

Uma mudança na **API** da plataforma, ou uma nova versão do **template**, segue o mesmo rigor de
canário que qualquer release (`entrega-continua-e-devops/07`): liberar
gradualmente, medir, e ter rollback pronto — a plataforma não se exime da disciplina que ela impõe
a todo mundo que a consome.

## Comunicação de incidente para clientes internos

Quando a plataforma tem um incidente, as equipes que dependem dela precisam de **comunicação**
clara e rápida — o mesmo princípio de comunicação de incidente de qualquer serviço de produção, só
que o "cliente" aqui são outras equipes de engenharia, não usuários finais externos.

## O custo da plataforma ser "sempre disponível"

Garantir altíssima disponibilidade para a própria plataforma tem custo real (redundância, mais
engenharia de confiabilidade) — e esse custo precisa ser pesado contra o impacto real de uma
indisponibilidade **temporária** da plataforma, dado que o plano de dados continua funcionando
mesmo com o *control plane* fora do ar. Nem toda plataforma precisa do mesmo nível de
disponibilidade que o sistema transacional que ela ajuda a operar.

## *Game days*

Provocar falhas deliberadas na própria plataforma — não só nos serviços que ela entrega — é o que
confirma, na prática, que o plano de dados realmente sobrevive à queda do *control plane*, em vez
de assumir isso sem jamais testar.

## Exemplo numa fintech

Um deploy de produção de um serviço falha porque a **API da plataforma** está fora do ar naquele
momento — mas, examinando com cuidado, nenhuma parte do serviço em si (já implantado, já rodando)
depende da plataforma em tempo de execução. O que falhou foi uma **nova** operação (um novo deploy,
que depende da API) tentando acontecer durante a janela de indisponibilidade — não o serviço já
rodando, que continuou saudável o tempo todo.

## Hands-on

**Tutorial.** Construa `operacao/` com SLIs, SLO, e um histórico sintético.

**Desafio.** Implemente isolamento de falha e a triagem de suporte.

**Invariantes testáveis**

1. O SLO é **calculado** a partir do histórico sintético, e uma **degradação injetada** o
   **viola** de forma detectável.
2. Com a API da plataforma **derrubada** na simulação, os *workloads* **já implantados** mantêm a
   saúde — verificado checando que o grafo de dependências de **tempo de execução** não contém o
   *control plane*.
3. A classificação do pedido de suporte (*bug*/pedido/dúvida) é **função pura**, testada em
   tabela; os prazos usam **relógio falso**, não o relógio real da máquina de teste.
4. Todo alerta da plataforma tem ***runbook*** associado — verificado por *lint*, nenhum alerta
   sem o campo preenchido.
5. A liberação de uma nova versão da API usa o **decisor de canário** já construído
   (`release/`, `entrega-continua-e-devops/07`), com teste de regressão
   aplicado à própria API da plataforma.

**Complemento.** Escreva o comunicado de um incidente real (ou simulado) de 40 minutos de
indisponibilidade da plataforma, direcionado às equipes que dependem dela.

**Checagem**

1. Por que a separação entre plano de dados e plano de controle é a distinção operacional mais
   importante desta trilha?
2. Por que *bug*, pedido e dúvida precisam de tratamento distinto no modelo de suporte, em vez de
   uma fila única?
3. Por que um alerta sem *runbook* correspondente é "ansiedade sem direção" para quem está de
   plantão?
4. Por que nem toda plataforma precisa do mesmo nível de disponibilidade que o sistema
   transacional que ela ajuda a operar?

> **Reencontro — `observabilidade/12`; `observabilidade/13`; `observabilidade/15`; `kubernetes/12`;
> `kubernetes/06`.** SLO e *error budget* de `observabilidade/12` são aplicados aqui diretamente à
> própria plataforma como serviço crítico. Plantão e triagem de `observabilidade/13` fundamentam o
> modelo de suporte deste marco. A condução de incidente até a causa raiz de `observabilidade/15` é
> a disciplina usada quando a plataforma mesma sofre um incidente real. A observabilidade e
> *debugging* de `kubernetes/12` é onde o isolamento entre plano de dados e plano de controle se
> torna visível na prática, dentro do cluster. E o ciclo de vida e *zero-downtime* de
> `kubernetes/06` é o que garante que um *workload* já implantado não depende de nada externo para
> continuar rodando.

## Principais aprendizados

- A separação entre plano de dados (o que já roda) e plano de controle (o mecanismo que cria e
  muda) é a distinção operacional mais importante: a plataforma fora do ar não deveria derrubar o
  que já existe.
- Modelo de suporte com *bug*/pedido/dúvida tratados distintamente evita que demandas de natureza
  diferente compitam pela mesma prioridade e processo.
- Todo alerta precisa de *runbook* correspondente — sem ele, o alerta é só ansiedade sem direção
  para quem está de plantão.
- A própria API e os templates da plataforma seguem a mesma disciplina de canário que qualquer
  release — a plataforma não se exime do rigor que impõe a todo mundo.
- Nem toda plataforma precisa de disponibilidade máxima — o custo de "sempre disponível" precisa
  ser pesado contra o impacto real de uma indisponibilidade temporária, dado que o plano de dados
  continua funcionando.
