---
id: dashboards-e-correlacao
title: "Dashboards e correlação"
summary: "Três níveis de painel para três perguntas diferentes, dashboard como código, e os saltos entre sinais que encurtam o MTTR."
estimatedMinutes: 45
references:
  - title: "Grafana — Best Practices for Dashboards"
    url: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/
  - title: "Grafana — Provisioning Dashboards"
    url: https://grafana.com/docs/grafana/latest/administration/provisioning/
  - title: "Prometheus — Exemplars"
    url: https://prometheus.io/docs/prometheus/latest/feature_flags/#exemplars-storage
---

## Três níveis, três perguntas

O erro mais comum é o painel único com 60 gráficos, que não responde bem a pergunta
nenhuma. Cada nível tem um leitor e uma pergunta:

**1. Executivo — "estamos bem?"** Três a cinco números grandes: TPV, taxa de autorização,
error budget restante, incidentes abertos. Leitura em **10 segundos**, sem interpretação.
O público inclui quem não é de engenharia.

**2. Serviço — "o que está errado?"** RED do serviço, saturação dos recursos, dependências.
É o painel do plantão, e ele precisa apontar a **direção** da investigação em um minuto.

**3. Debug — "por quê?"** Métricas específicas, por instância, por partição, por endpoint.
Ninguém olha até precisar, e por isso pode ser denso.

A hierarquia funciona quando os níveis **se ligam**: do executivo se navega ao serviço, do
serviço ao debug, e do debug ao trace ou ao log. O que se está construindo é o caminho de
uma investigação, não uma coleção de gráficos.

## Princípios de layout

- **O mais importante em cima, à esquerda.** É onde o olho vai primeiro.
- **Mesma janela de tempo em todos os painéis.** Comparar gráficos com janelas diferentes
  produz conclusão errada, e acontece o tempo todo.
- **Linha de referência do SLO** nos gráficos de SLI, para o gráfico se interpretar sozinho.
- **Comparação com o período anterior** (`offset 7d`) onde há sazonalidade (marco 08) —
  transforma "isso é ruim?" em resposta imediata.
- **Unidades e legendas explícitas.** "0.0234" sem unidade já causou incidente.
- **Poucos gráficos por painel.** Se precisa rolar muito, provavelmente são dois painéis.

E o teste que vale mais que qualquer regra: **entregue o painel a alguém que não o
construiu, durante um incidente simulado.** Se essa pessoa não chega à direção certa em um
minuto, o painel falhou — independentemente de quão completo ele seja.

## Dashboard como código

Painel construído a mão na UI é o `kubectl edit` da observabilidade (marco 02 da trilha
Kubernetes): ninguém sabe quem mudou, não há revisão, e o cluster novo não o tem.

O JSON versionado em Git, provisionado por arquivo ou por ConfigMap, entrega revisão em
PR, histórico de mudança, reprodutibilidade e o mesmo painel em todos os ambientes.

A objeção honesta: editar JSON de Grafana à mão é ruim. O fluxo que funciona é **editar na
UI, exportar, commitar** — e ferramentas como Grafonnet ou Terraform ajudam quando o número
de painéis cresce. O ponto não é o formato; é que a fonte da verdade esteja no Git.

## Correlação: os saltos que encurtam o MTTR

O valor real de uma stack integrada não está em ter os quatro sinais — está em **saltar
entre eles sem copiar e colar identificador**.

Os saltos que importam:

- **Métrica → trace**, via **exemplar** (marco 07). Você vê o pico no p99, clica no ponto,
  e abre o trace daquela requisição específica. Sem exemplar, você anota o horário e vai
  procurar um trace lento à mão.
- **Trace → log**, via `trace_id` (marco 09). Do span com erro para as linhas de log
  daquela requisição, em todos os serviços.
- **Trace → profile** (marco 11). Do span lento cujos filhos não somam o tempo, para o
  flame graph do período.
- **Log → trace**, o caminho inverso: da linha de erro que alguém colou no chat, para a
  jornada completa.
- **Alerta → runbook → painel** (marco 13), que é o começo de tudo às 3h.

Cada salto que não existe é feito à mão, e cada um feito à mão custa minutos de MTTR
(marco 02). É por isso que a instrumentação consistente dos marcos 05 e 09 — `trace_id` em
todo log, exemplars nos histogramas — paga exatamente no pior momento.

E a **correlação temporal barata que quase ninguém usa**: uma anotação de deploy no
Grafana. Ver a linha vertical do deploy no mesmo gráfico onde a métrica virou responde
"foi o deploy?" instantaneamente, e essa é a primeira pergunta de metade dos incidentes.

## Exemplo numa fintech

O painel de plantão do `fin-platform`, com a ordem sendo o próprio raciocínio:

1. **Negócio** (marco 08): TPV com `offset 7d`, taxa de autorização por PSP, fila de
   liquidação.
2. **SLO** (marco 12): error budget restante e burn rate atual.
3. **RED** do `pix-gateway` e do `ledger-core`, com exemplars ligados.
4. **Saturação**: pool Hikari, lag por partição, throttling de CPU.
5. **Dependências**: latência e taxa de erro por PSP, com o service graph (marco 10).
6. **Anotações de deploy** sobrepostas em tudo.

As duas primeiras seções respondem "tem incidente e qual o tamanho?" — que é o que o
plantão precisa nos primeiros 30 segundos, e é o que permite comunicar impacto sem
tradução. As demais respondem "onde?".

## Hands-on

**Desafio — os três níveis e a prova do minuto.**

1. Construa os três painéis (executivo, serviço, debug) do `fin-platform`, com navegação
   entre eles.
2. Ligue **exemplars** no histograma de latência e prove o salto métrica → trace.
3. Configure o `trace_id` como link no Loki, provando o salto trace ↔ log.
4. Adicione anotações de deploy.
5. Exporte os JSONs e **commite** no repositório, provisionados por ConfigMap.

**Invariantes testáveis:**

- **O teste do minuto:** injete uma falha (o PSP degradando, por exemplo) e peça a alguém
  que **não** construiu o painel para encontrar a direção certa em **1 minuto**, começando
  pelo painel executivo. Cronometre. Se falhar, o problema é o painel, não a pessoa —
  ajuste e repita.
- **O teste dos três cliques:** do alerta ao trace da requisição problemática em no máximo
  três cliques. Cronometre.
- **Reprodutibilidade:** apague um painel na UI, rode o provisionamento, e ele volta
  idêntico. Isso prova que o Git é a fonte da verdade.
- **A anotação:** faça um deploy durante carga e confirme que a linha aparece nos gráficos
  de SLI.

**Complemento — a poda.** Pegue um painel existente no seu trabalho e conte quantos
gráficos ele tem. Para cada um, responda: qual decisão ele apoia? Delete os que não têm
resposta. A maioria dos painéis encolhe pela metade, e melhora.

**Checagem.** (a) Qual pergunta cada um dos três níveis responde? (b) Para que serve um
exemplar? (c) Por que painel construído só na UI é um problema? (d) Qual é o teste
definitivo de um painel de plantão?

## Principais aprendizados

- Três níveis para três perguntas; o painel único com 60 gráficos não responde bem a
  nenhuma.
- Painel é código: editar na UI, exportar e commitar — a fonte da verdade fica no Git.
- Os saltos entre sinais (exemplar, `trace_id`, trace↔profile) são onde o MTTR é ganho ou
  perdido; cada salto ausente vira trabalho manual às 3h.
- O teste de um painel de plantão é alguém que não o construiu chegar à direção certa em um
  minuto.
