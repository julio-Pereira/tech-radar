---
id: operar-a-plataforma-de-dados
title: "Operar a plataforma de dados"
summary: "A plataforma de dados é um serviço de produção: custo, SLO, recuperação e antipadrões. Capstone da trilha."
estimatedMinutes: 55
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## Custo por tabela e por consulta: o FinOps de dados

Sem visibilidade de quanto cada tabela custa para manter (armazenamento, processamento de
transformação, consultas que ela recebe), não há como decidir racionalmente o que vale a pena
manter, compactar com mais frequência, ou aposentar. **Custo por tabela** e **custo por consulta**
tornam essa decisão baseada em número, não em intuição — a mesma disciplina de FinOps que qualquer
sistema de produção precisa, aplicada especificamente à camada de dados.

## Retenção e *tiering*

Nem todo dado precisa ficar no armazenamento mais rápido (e mais caro) para sempre. **Tiering**:
dado recente e frequentemente consultado fica "quente"; dado histórico, raramente acessado, migra
para armazenamento "frio", mais barato, com latência de acesso maior — aceitável para algo que
raramente é consultado, mas pode ser necessário manter (retenção regulatória, por exemplo). A
política de retenção do marco 10 decide **por quanto tempo** guardar; *tiering* decide **onde**
guardar enquanto isso.

## DR do lake: o que é reconstruível, e o que não é

**RPO** e **RTO** (`dados-distribuidos/12`) aplicados ao lake inteiro, com uma distinção que
importa mais aqui do que em quase qualquer outro sistema: dado **reconstruível** (uma tabela ouro
que pode ser recalculada do zero a partir do bruto, se o bruto sobreviver) tem um RPO/RTO
efetivamente diferente de dado **não reconstruível** (o bruto em si — se ele for perdido, não há
"recalcular", porque a fonte original, a transmissora, pode não ter mais aquele dado disponível
para reconsulta, ou a janela de consulta dela já pode ter passado). Backup e replicação do bruto
merecem o tratamento mais rigoroso exatamente por essa razão.

## *Schema evolution* na plataforma, migração, e antipadrões

À medida que a plataforma cresce, modelos mudam, tabelas são renomeadas, pipelines inteiros são
substituídos — a mesma disciplina de expand/contract de `dados-distribuidos/11` vale para evoluir
uma tabela ouro sem quebrar consumidores de uma vez. Os **antipadrões** que fecham esta trilha, cada
um com uma raiz comum — decisão de dado tomada sem o rigor que os treze marcos anteriores
ensinaram:

- **Script de cron**: um pipeline sem idempotência, sem observabilidade, disfarçado de solução
  simples (marco 01).
- **Pântano de dados**: acumular tudo no bruto sem disciplina de camadas, até ninguém mais saber o
  que existe ali nem se é seguro usar.
- **"Bronze consumido por diretoria"**: a disciplina que `dados-distribuidos/14` já nomeou,
  reencontrada aqui com a mesma gravidade.
- **Painel sem dono**: uma métrica exibida que ninguém é responsável por manter correta — o mesmo
  problema do SLO sem dono do marco 09, manifestado num painel em vez de um sistema.
- **Dado sem consentimento**: qualquer linha no bruto sem `consentId` válido — o antipadrão mais
  grave desta trilha inteira, porque viola a premissa sobre a qual tudo o resto foi construído.

## O que vem depois

Esta trilha entrega tabelas confiáveis, com consentimento, qualidade e linhagem — a base sobre a
qual `ml-em-producao` constrói features e decisões de oferta. O que acontece quando o **modelo**
começa a moldar os próprios dados que o treinam (o feedback loop) é tratado ali, não aqui.

> **Reencontro — `dados-distribuidos/12`; `observabilidade/16`; `kubernetes/14`.** RPO/RTO e o
> ensaio de restore cronometrado são o mesmo rigor daquele marco, aqui aplicado à escala de um
> lake inteiro. `observabilidade/16` trata custo e cardinalidade de telemetria — o mesmo raciocínio
> de custo observável aplicado a dado. `kubernetes/14` já tratou "quando não usar" como parte da
> maturidade de uma plataforma — a mesma pergunta que esta trilha aplicou ao segundo store em
> `dados-distribuidos/06`, agora ao nível da plataforma de dados inteira.

## Exemplo numa fintech

O lake do `fin-insight` cresce por dois anos sem revisão de custo nem de retenção. Uma auditoria de
FinOps encontra: três tabelas prata que ninguém consulta há seis meses, ainda recebendo escrita
diária; um painel de "volume por transmissora" sem dono, exibindo um número que diverge do real há
semanas sem que ninguém tenha notado; e, o achado mais sério, uma cópia de homologação com dado de
um `consentId` revogado há quatro meses — o antipadrão de dado sem consentimento, numa plataforma
que, no papel, tinha "resolvido" revogação no marco 10.

## Hands-on

**Tutorial.** Produza um relatório de custo por tabela sobre a plataforma construída ao longo da
trilha.

**Desafio.** Simule a perda do bucket/diretório do lake e meça o tempo de restauração.

**Invariantes testáveis**

1. Todos os invariantes da **Definição de pronto** (abaixo) passam sobre a plataforma completa.
2. A simulação de perda do bucket é seguida de uma restauração **cronometrada**, com o tempo
   registrado e comparado ao RTO declarado.
3. O relatório de custo por tabela está completo — toda tabela ouro tem um custo estimado
   associado, não "a maioria".

**Complemento.** Escreva o *runbook* de "o painel está errado": os passos de diagnóstico, desde
"qual tabela alimenta esse painel" (via linhagem, marco 09) até "qual execução do pipeline
produziu o valor suspeito".

**Checagem**

1. Por que custo por tabela e por consulta tornam a decisão de aposentar uma tabela baseada em
   número, não em intuição?
2. Qual é a diferença de tratamento entre dado reconstruível e não reconstruível na estratégia de
   DR do lake?
3. Qual dos antipadrões desta trilha é o mais grave, e por quê?
4. O que esta trilha entrega para `ml-em-producao`, e o que fica deliberadamente fora de escopo?

## Principais aprendizados

- Custo por tabela e por consulta tornam a decisão de manter, compactar ou aposentar uma tabela
  baseada em número — a mesma disciplina de FinOps aplicada à camada de dados.
- Dado reconstruível (recalculável a partir do bruto) e não reconstruível (o bruto em si, que pode
  depender de uma janela de consulta da transmissora que já passou) merecem estratégias de DR
  diferentes.
- Os antipadrões desta trilha compartilham uma raiz: decisão tomada sem o rigor que os marcos
  anteriores ensinaram — e dado sem consentimento é o mais grave de todos, porque quebra a premissa
  fundadora da plataforma inteira.
- *Schema evolution* na escala da plataforma segue o mesmo princípio de expand/contract de uma
  única coluna — fases compatíveis, nunca uma troca abrupta.
- O que esta trilha entrega é a tabela confiável; o que o modelo faz com ela, incluindo o feedback
  loop que molda os próprios dados de treino, é o assunto de `ml-em-producao`.

## Capstone

O `fin-insight` é a sua plataforma de dados do receptor — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ela fica pronta.

**Entrega**

- [ ] `fake-transmissor/` com falhas injetáveis, `ingestor/` idempotente contra ele
- [ ] `politica/` (consentimento, finalidade, retenção como código) e a visão `dado_utilizavel`
- [ ] Modelo dimensional com SCD2, sem sobreposição nem lacuna de vigência
- [ ] `lake/` em Parquet particionado, com poda comprovada e procedimento de apagar medido
- [ ] Modelos SQL incrementais com testes de dados, e backfill seguro
- [ ] DAGs orquestrados (ADR da ferramenta escolhida), com backfill idempotente e limite de
      paralelismo
- [ ] Suíte de qualidade nas três camadas, com quarentena e reconciliação contra o
      `fake-transmissor`
- [ ] Linhagem emitida (OpenLineage), painel de freshness/volume/schema, análise de impacto
- [ ] Varredura de revogação por `consentId` cobrindo todas as camadas, incluindo cache e
      homologação
- [ ] Agregação em streaming reconciliada com batch, dado atrasado tratado como correção
- [ ] Camada semântica com contrato de consumo que quebra o CI, e controle de acesso que nega
      consulta direta ao bruto
- [ ] Relatório de custo por tabela e ensaio de DR cronometrado

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] Todo registro bruto tem `consentId`, finalidade, validade e origem — verificado por teste de
      esquema
- [ ] Nenhuma consulta de consumo devolve dado de consentimento revogado, expirado, ou de
      finalidade diferente
- [ ] A revogação de um consentimento torna ilegível (ou remove) seus dados em **todas** as
      camadas, caches e extratos dentro do SLO declarado
- [ ] Todo passo do pipeline é idempotente: reexecução e backfill dão o mesmo resultado
- [ ] Toda fonte externa tem contrato; mudança de schema da transmissora derruba a execução com
      alerta antes de poluir a prata
- [ ] Existe reconciliação com a transmissora, com classificação de divergência
- [ ] Toda coluna ouro tem linhagem rastreável até a origem
- [ ] Freshness, volume e schema têm SLO, dono e alerta testado
- [ ] Nenhum PII em log, métrica ou rótulo
- [ ] Política (finalidade, validade, retenção) é código versionado e testado
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das treze
decisões que você tomou aqui, qual só se sustenta porque o `fake-transmissor` se comporta melhor
que uma transmissora real — e o que você mediria no primeiro contato com uma de verdade?**
