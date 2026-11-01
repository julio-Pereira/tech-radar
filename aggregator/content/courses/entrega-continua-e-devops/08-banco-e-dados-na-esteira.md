---
id: banco-e-dados-na-esteira
title: "Banco e dados na esteira"
summary: "O deploy mais perigoso quase sempre é o que mexe no schema: ele precisa ser versionado, linted e compatível com a versão anterior do app."
estimatedMinutes: 60
references:
  - title: "Continuous Delivery (Humble & Farley)"
    url: https://continuousdelivery.com/
---

## Migrações versionadas

Cada mudança de schema vive num arquivo de **migração** numerado e versionado (ferramentas por ADR —
Flyway e Liquibase em Java, equivalentes em Go, **confira** o estado vigente de cada uma) — a
sequência de migrações aplicadas é o histórico completo e reprodutível de como o schema chegou ao
estado atual, nunca editado retroativamente depois de aplicado em qualquer ambiente.

## *Expand/contract* automatizado

A disciplina de expand/contract (`dados-distribuidos/11`) — adicionar o novo sem remover o antigo,
migrar os dois lados gradualmente, só então remover o antigo — ganha, nesta trilha, **automação**:
cada fase é um passo de pipeline verificado, não uma sequência de comandos manuais lembrados de
memória por alguém que executou a migração da última vez.

## Linter de DDL perigoso

Certas operações de DDL são conhecidas por causar incidentes: **travas longas** (uma operação que
mantém a tabela bloqueada por tempo suficiente para a aplicação começar a falhar por timeout),
**índice criado sem a opção concorrente** (bloqueando escrita durante a criação), **renomear uma
coluna em uso** (quebrando instantaneamente qualquer código que ainda referencia o nome antigo). Um
**linter de DDL** reconhece esses padrões **antes** da migração ser aplicada em qualquer ambiente
real — **confira** o comportamento exato por versão do banco, porque o que é "perigoso" pode mudar
entre versões.

## Matriz de compatibilidade: app N-1 × schema N, e N × N+1

Durante um deploy gradual (*rolling*, canário), por um período as duas versões do **app** coexistem,
rodando contra o **mesmo** schema. A pergunta que a matriz de compatibilidade responde,
explicitamente: a versão anterior do app (N-1) continua funcionando corretamente contra o schema já
migrado para N? E a versão nova (N) funciona contra o schema ainda não migrado (N-1), se a ordem
inverter por algum motivo? Sem essa verificação, o deploy gradual tem uma janela de incompatibilidade
silenciosa, exatamente durante o período em que as duas versões coexistem de propósito.

## Ordem no deploy: migrar antes do app

A sequência correta é **migrar o schema primeiro, depois implantar o app novo** — nunca o contrário,
e nunca simultâneo sem ordem garantida. Se o app novo espera uma coluna que ainda não existe, ele
falha imediatamente; se o schema migra antes e o app antigo continua rodando por um tempo contra o
schema novo, a matriz de compatibilidade da seção anterior é exatamente o que garante que isso
funciona. Em Kubernetes, *sync waves* (`kubernetes/13`) coordenam essa ordem de forma declarativa.

```diagrama
ec-migrar-antes
```

## Banco efêmero por PR, e dados sintéticos ou mascarados

Um banco efêmero criado para cada PR (a mesma disciplina de ambiente efêmero do marco 05, aplicada
especificamente a banco de dados) permite testar uma migração isoladamente, sem competir por um banco
de homologação compartilhado. Os dados usados ali são **sintéticos ou mascarados**
(`dados-distribuidos/13`) — nunca PII real, mesmo num ambiente "só de teste", porque "só de teste" não
é controle de acesso.

## Migração de dados longa, e retomável

Uma migração que move ou transforma **dados** (não só schema) pode levar horas em volumes grandes —
e precisa ser **retomável**: se interrompida no meio (falha, timeout, intervenção manual), reiniciar
não deveria processar dados já migrados de novo, nem perder o progresso já feito. Isso exige que a
migração registre seu próprio progresso de forma durável, não dependa de rodar do início ao fim numa
única execução ininterrupta.

## Pipelines de dados e de modelos — por link

Qualidade de dados no CI e promoção de modelo (`engenharia-de-dados/06`, `ml-em-producao/05`, ambas
trilhas planejadas/existentes conforme o estado do repositório) já tratam, em profundidade, a
disciplina equivalente aplicada a pipelines de dados analíticos e de machine learning — este marco
não reensina isso, trata só o schema do banco **transacional** que serve a aplicação.

## Exemplo numa fintech

Renomear uma coluna (`saldo` para `saldo_disponivel`) num único passo, numa única migração, derruba a
versão anterior do app durante um deploy gradual: enquanto a versão nova já espera o nome novo e a
versão antiga ainda espera o nome antigo, um dos dois está, necessariamente, consultando uma coluna
que não existe mais com aquele nome. A saída correta é expand/contract: criar a coluna nova, popular
em paralelo, migrar os dois lados do código para usar a nova, e só então remover a antiga — nunca um
único passo.

## Hands-on

**Tutorial.** Construa `db/` com migrações versionadas e o linter de DDL perigoso.

**Desafio.** Construa a matriz de compatibilidade entre versões do app e do schema.

**Invariantes testáveis**

1. O linter **reprova** cada DDL perigoso de um conjunto de *fixtures* conhecidas (trava longa,
   índice sem opção concorrente, renomear coluna em uso) e **aprova** as *fixtures* seguras
   equivalentes.
2. A suíte de testes da **versão N-1** do app passa, sem modificação, contra o schema já migrado
   para **N**.
3. Aplicar todas as migrações **do zero** produz exatamente o mesmo schema que aplicá-las
   **incrementalmente** a partir de um estado anterior — *diff* entre os dois resultados é zero.
4. As migrações marcadas como idempotentes são **reaplicáveis** com segurança — reaplicar não produz
   erro nem efeito duplicado.
5. A massa de dados sintéticos usada em teste **não contém** padrões reconhecíveis de PII —
   verificado por varredura automatizada, não por confiança na origem dos dados.

**Complemento.** Escreva o expand/contract completo de uma mudança de schema real do seu próprio
trabalho, com as fases explícitas.

**Checagem**

1. Por que a ordem correta é sempre migrar o schema antes de implantar o app novo?
2. O que a matriz de compatibilidade N-1 × N e N × N+1 verifica, e por que essa verificação é
   necessária especificamente durante um deploy gradual?
3. Por que um linter de DDL perigoso precisa conhecer o comportamento específico da versão do banco,
   em vez de uma regra genérica única?
4. Por que uma migração de dados longa precisa ser retomável, e o que "retomável" exige do seu
   desenho?

> **Reencontro — `dados-distribuidos/11`; `dados-distribuidos/13`; `spring-boot/05`; `spring-boot/11`;
> `kubernetes/13`.** Expand/contract de `dados-distribuidos/11` ganha aqui a automação como passo de
> pipeline, não sequência manual. O mascaramento de dados de `dados-distribuidos/13` é exatamente a
> disciplina que torna o banco efêmero por PR seguro de usar. As transações de `spring-boot/05` são
> o que a aplicação executa contra o schema que este marco versiona e verifica. Os testes de
> integração de `spring-boot/11` são onde a matriz de compatibilidade é de fato exercitada. E as
> *sync waves* de `kubernetes/13` coordenam declarativamente a ordem entre migração de schema e
> deploy do app.

## Principais aprendizados

- Migrações versionadas e nunca editadas retroativamente são o histórico reprodutível de como o
  schema chegou ao estado atual.
- Um linter de DDL perigoso pega travas longas, índices sem opção concorrente e renomeações em uso
  antes de qualquer ambiente real sofrer o incidente.
- A matriz de compatibilidade N-1 × N e N × N+1 é necessária porque, durante deploy gradual, duas
  versões do app coexistem contra o mesmo schema por um período de propósito.
- A ordem correta é sempre migrar o schema antes de implantar o app — nunca o contrário, nunca
  simultâneo sem garantia de ordem.
- Uma migração de dados longa precisa registrar o próprio progresso de forma durável para ser
  retomável sem reprocessar ou perder trabalho já feito.
