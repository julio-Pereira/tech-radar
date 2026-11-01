---
id: golden-paths-em-escala
title: "Golden paths em escala"
summary: "Gerar o serviço certo no dia 0 é fácil; o difícil é manter 40 serviços no caminho certo no dia 400 quando o template evolui."
estimatedMinutes: 65
completion: quiz
references:
  - title: "CNCF Platform Engineering Maturity Model"
    url: https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/
---

## *Golden path*: opinativo, com *escape hatches* explícitas

Um ***golden path*** é **opinativo** — ele escolhe por você a estrutura, o framework, os padrões —
e isso é intencional: a maior parte dos casos não precisa de uma decisão nova, só de seguir o
caminho já pavimentado. Mas opinativo não significa inflexível: **escape hatches** (saídas
explícitas para desviar do caminho padrão) existem para os casos legítimos que fogem do comum —
contanto que sejam **auditadas** (registradas, visíveis) e tenham **prazo** (não um desvio
permanente sem revisão).

## O que embutir num *golden path*

Um *golden path* completo embute: a estrutura de código (`arquitetura-de-software`), o **modelo de
pipeline** já construído e verificado por `entrega-continua-e-devops/10`, observabilidade (instrumentação já configurada, não adicionada depois) e
segurança (defaults seguros, marco 06 desta trilha). Um serviço gerado por esse caminho nasce
**conforme** em todas essas dimensões simultaneamente, sem que ninguém precise lembrar de
configurar cada uma manualmente.

## Geração × herança: dois mecanismos, trade-offs diferentes

**Geração** (*scaffolding*): um comando cria os arquivos iniciais de um novo serviço a partir de um
template — rápido para começar, mas depois de gerado, o código gerado e o template **divergem**
naturalmente (o serviço evolui com mudanças específicas, o template evolui separadamente).
**Herança** (biblioteca ou *workflow* reutilizável, consumido por referência): o serviço **depende**
do componente compartilhado em vez de copiar seu conteúdo — atualizações se propagam automaticamente
(ou quase), mas o acoplamento à biblioteca/workflow é mais forte e pode limitar customização local.

## Versionamento do template, e política de compatibilidade

Um template tem **versão** própria, e os repositórios gerados a partir dele registram **qual
versão** usaram — sem isso, "quantos serviços ainda estão na v1?" não tem resposta verificável. Uma
**política de compatibilidade** declara por quanto tempo uma versão antiga continua suportada antes
de ser considerada fora da janela de suporte.

## *Drift* de template, e como medir

**Drift de template**: a distância entre o que um repositório gerado tem hoje e o que a versão mais
recente do template teria gerado — medido, não assumido. Um relatório de *drift* lista, por
repositório, **quais arquivos divergem e por quê** (customização deliberada ou simplesmente nunca
atualizado).

## Atualização em massa, sem sobrescrever personalização

Atualizar 40 repositórios de uma vez, de uma versão de template para outra, via **PRs automáticos**
ou ***codemods*** (transformações automatizadas de código), precisa lidar com **personalização
local**: um arquivo que o repositório específico já modificou não pode ser simplesmente sobrescrito
pela atualização — a técnica de **mesclagem de três vias** (a mesma usada em `git merge`, comparando
base comum, versão antiga do template e versão nova) detecta e **reporta conflitos**, em vez de
silenciosamente escolher um lado.

```diagrama
ep-golden-path
```

## CI do próprio template

O template, como qualquer código que vai ser usado por muitos consumidores, merece seu próprio CI:
**gerar** um serviço a partir dele, **construir**, e **rodar os *gates*** da esteira sobre o
resultado gerado — um template que quebra o próprio processo de geração precisa ser pego **antes**
de ser publicado, não descoberto pelo primeiro time que tentar usá-lo.

## Depreciação com janela

Quando uma versão de template (ou uma capacidade inteira) precisa ser desativada, uma **janela de
depreciação** anunciada com antecedência — não um desligamento surpresa — dá tempo para os
consumidores migrarem, com comunicação clara do prazo final.

## Templates em Java e Go, e quando **não** padronizar

Um *golden path* precisa existir para as linguagens que a organização de fato usa (Java e Go, no
contexto desta trilha) — mas nem toda situação se beneficia de padronização: um protótipo
descartável, ou uma necessidade genuinamente única que nenhum template serviria bem, são casos onde
forçar o caminho padrão custa mais do que vale.

## Exemplo numa fintech

O template v2 troca a biblioteca de métricas usada por padrão — mas 3 dos 10 repositórios gerados
da v1 já personalizaram o arquivo de configuração de métricas para um caso específico. A
atualização automática detecta, via mesclagem de três vias, que esses 3 arquivos têm conflito —
reporta exatamente quais e por quê, em vez de sobrescrever silenciosamente a personalização de
ninguém sabe quem decidiu fazer.

## Hands-on

**Tutorial.** Construa `templates/` v1 e v2 (Java e Go) e 10 repositórios-*fixture* gerados da v1,
com personalizações plantadas.

**Desafio.** Implemente a atualização v1→v2 e o relatório de *drift*.

**Invariantes testáveis**

1. O serviço gerado pelo template passa em **todos** os *gates* **sem edição manual** — a primeira
   execução já é conforme.
2. A atualização v1→v2 **não sobrescreve** nenhum arquivo personalizado; os conflitos são
   **reportados com o arquivo e o motivo** — **zero** sobrescritas silenciosas, verificado sobre as
   10 *fixtures*.
3. Um template que **quebra** o próprio CI (geração que não compila, por exemplo) é **barrado**
   antes de ser publicado — testado contra um template deliberadamente quebrado.
4. Todo repositório registra a **versão do template** usada (*lint*), e o relatório lista os
   arquivos divergentes de cada um.
5. Com **relógio falso** avançado além da janela de suporte, repositórios em versão mais antiga são
   **sinalizados** — não silenciosamente ignorados.

**Complemento.** Decida, para um template real do seu contexto, o que deveria ser **biblioteca**
(herança) em vez de **esqueleto** (geração) — e justifique com o trade-off específico.

**Checagem**

1. Por que um *escape hatch* precisa ser auditado e ter prazo, em vez de simplesmente permitido sem
   registro?
2. Qual é o trade-off entre geração e herança, e por que nenhuma das duas é estrategicamente
   superior em todo caso?
3. Por que mesclagem de três vias **reporta** conflitos em vez de escolher automaticamente um lado?
4. O que o CI do próprio template pega que o CI do serviço gerado, sozinho, não pegaria?
5. Por que uma janela de depreciação anunciada é preferível a um desligamento surpresa?
6. Em que situação não padronizar é a decisão correta, mesmo havendo um *golden path* disponível?

> **Reencontro — `spring-boot/12`; `go-fintech/01`; `kubernetes/13`; `seguranca-aplicacao/13`;
> `entrega-continua-e-devops/10`.** Produção e deploy de `spring-boot/12` é o
> destino típico de um serviço gerado pelo *golden path* Java. A estrutura de pacotes de
> `go-fintech/01` é a base do template Go equivalente. O GitOps de `kubernetes/13` é onde a
> definição de ambiente, embutida no template, acaba sendo entregue. A ordem de *gates* de
> segurança de `seguranca-aplicacao/13` é um dos componentes que o template já embute por padrão. E
> `entrega-continua-e-devops/10` é especificamente quem constrói o modelo de pipeline que o
> *golden path* consome.

## Principais aprendizados

- Um *golden path* é opinativo por desenho, com *escape hatches* auditadas e com prazo para os
  casos legítimos que precisam desviar.
- Geração diverge naturalmente do template ao longo do tempo; herança propaga atualizações
  automaticamente, ao custo de acoplamento mais forte — nenhuma das duas é superior em todo caso.
- *Drift* de template precisa ser medido, não assumido — um relatório lista exatamente quais
  arquivos divergem e por quê.
- Mesclagem de três vias reporta conflitos de personalização em vez de sobrescrever
  silenciosamente — zero sobrescritas silenciosas é o padrão de qualidade.
- O template merece CI próprio: um template que quebra sua própria geração precisa ser pego antes
  de publicado, não descoberto pelo primeiro consumidor.
