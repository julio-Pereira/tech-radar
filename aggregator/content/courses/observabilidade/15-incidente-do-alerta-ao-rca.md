---
id: incidente-e-rca
title: "Do alerta ao RCA"
summary: "Um método de quatro passos para não travar às 3h, a árvore de decisão por sintoma, e o post-mortem que produz aprendizado em vez de culpado."
estimatedMinutes: 50
references:
  - title: "Google SRE Book — Effective Troubleshooting"
    url: https://sre.google/sre-book/effective-troubleshooting/
  - title: "Google SRE Book — Postmortem Culture"
    url: https://sre.google/sre-book/postmortem-culture/
  - title: "Google SRE Book — Managing Incidents"
    url: https://sre.google/sre-book/managing-incidents/
---

## O método: quatro passos, nesta ordem

Às 3h da manhã ninguém improvisa bem. O valor de um método é remover decisões do momento
em que você está pior preparado para tomá-las.

**1. Avaliar o impacto — antes de investigar.**

Quantos clientes, quanto TPV, quais fluxos, desde quando. Isso decide a severidade, quem
acordar, e se há prazo regulatório de comunicação (marco 01). É o passo mais pulado e o
mais importante: sem ele, você pode gastar 40 minutos numa investigação elegante de algo
que afeta 0,1% do tráfego, ou tratar como rotina algo que já é reportável.

**2. Mitigar — antes de entender.**

Esta é a parte contraintuitiva para engenheiro: **restaurar o serviço vem antes de
descobrir a causa.** Reverter o deploy, tirar o nó do balanceamento, desligar a feature
flag, mudar para o PSP secundário.

A curiosidade sobre a causa raiz é legítima e ela custa dinheiro por minuto. Entender vem
depois, com o serviço no ar e você descansado.

**3. Diagnosticar — com hipótese e evidência.**

Formule uma hipótese, defina qual evidência a confirmaria ou refutaria, e busque **essa**
evidência. O anti-padrão é o passeio aleatório por dashboards, que às 3h dá a sensação de
progresso sem produzir nenhum.

Quatro perguntas que resolvem a maioria dos casos:

- **O que mudou?** Deploy, feature flag, configuração, certificado, mudança do parceiro. A
  maioria dos incidentes tem uma mudança recente por trás — daí a anotação de deploy do
  marco 14.
- **É nosso ou de dependência?** RED do serviço contra latência das dependências.
- **É tudo ou é um recorte?** Todos os PSPs ou um? Todas as instâncias ou uma? Todas as
  regiões? O recorte é meio caminho do diagnóstico.
- **Começou quando, exatamente?** O horário preciso, cruzado com a linha do tempo de
  mudanças.

**4. Comunicar — durante, não depois.**

Atualização em intervalo fixo, mesmo sem novidade ("seguimos investigando, sem impacto
novo"). Silêncio faz stakeholder virar interrupção, e interrupção durante incidente
aumenta o MTTR.

Em incidente longo, separe os papéis: quem investiga não é quem comunica. Uma pessoa fazendo
os dois faz mal os dois.

## Árvore de decisão por sintoma

| Sintoma | Primeira verificação | Depois |
| --- | --- | --- |
| Taxa de erro subiu | houve deploy? qual status e qual rota? | é nosso ou da dependência? |
| Latência subiu, erro estável | saturação: pool, fila, lag, throttling | trace do span dominante |
| Taxa de autorização caiu, sem erro técnico | é um PSP ou todos? | motivos de recusa (marco 08) |
| Fila crescendo | consumo parou ou produção subiu? | lag por partição |
| Um recorte só afetado | o que ele tem de diferente? | versão, região, tipo de conta |
| Tudo verde e cliente reclama | sonda sintética; o tráfego chega? | black-box (marco 01) |

A última linha é a mais importante e a menos praticada: **quando todos os painéis estão
verdes e o cliente reclama, o problema está antes da sua instrumentação** — DNS,
certificado, balanceador, rede do parceiro. Continuar olhando métricas internas é olhar
onde a luz está acesa.

## Post-mortem blameless

Duas propriedades, e as duas são não-negociáveis:

**Sem culpado.** Não porque as pessoas são infalíveis, mas porque a alternativa não
funciona: onde há punição, ninguém escreve o que realmente aconteceu, e o documento vira
ficção. "Erro humano" nunca é causa raiz — é onde a investigação **começa**. Se uma pessoa
conseguiu derrubar produção com um comando, a pergunta é por que o sistema permitiu.

**Com ação.** Post-mortem sem ação com dono e prazo é redação. E a ação precisa ser
**verificável**: "melhorar o monitoramento" não é ação; "adicionar alerta de burn rate no
fluxo de liquidação, dono X, até dia Y" é.

A estrutura que funciona, em uma página:

1. **Resumo** em três linhas: o que quebrou, por quanto tempo, qual impacto.
2. **Impacto** quantificado: clientes, TPV, SLA.
3. **Linha do tempo**: início real, detecção, mitigação, resolução. As diferenças entre
   esses horários são o MTTD e o MTTR (marco 02) — e são o dado mais acionável do
   documento.
4. **Causa raiz**, perseguida além do primeiro nível plausível.
5. **Por que não foi detectado antes?** A pergunta mais valiosa, e a que quase sempre gera
   a melhor ação.
6. **O que funcionou bem.** Reforça a prática boa e evita que o documento seja só uma lista
   de falhas.
7. **Ações**, com dono e prazo.

O item 5 merece atenção: se o MTTD foi de 40 minutos, o incidente durou 40 minutos a mais
do que precisava, e melhorar detecção costuma ser mais barato do que evitar a falha.

## Game day

Post-mortem aprende com o incidente que aconteceu. **Game day** produz o incidente em
horário combinado, com todo mundo acordado.

Como fazer com que valha:

- **Hipótese explícita antes:** "se derrubarmos um broker, o produtor continua e o lag não
  cresce". O exercício testa a hipótese, e uma hipótese refutada é o melhor resultado.
- **Cronometre o MTTD e o MTTR.** O objetivo é o número, não a sensação.
- **Não avise a hora exata.** Avise o dia.
- **Post-mortem mesmo quando nada quebrou** — inclusive para registrar que a detecção
  funcionou, e em quanto tempo.

Cenários naturais no `fin-platform`, herdados das outras trilhas: matar um pod durante um
pagamento, drenar um nó, derrubar um broker com produtor rodando, parar o consumidor por 30
minutos, injetar poison pill, degradar a latência do PSP, estourar memória e ver o OOMKill.

## Exemplo numa fintech

Além da engenharia, o incidente numa instituição de pagamento tem uma camada que outros
setores não têm: **prazo regulatório de comunicação**.

Isso muda o passo 1 do método: a avaliação de impacto não serve só para dimensionar a
resposta técnica, ela dispara (ou não) um relógio externo. E muda o que a telemetria
precisa entregar: quem não consegue reconstruir a linha do tempo — quando começou, o que
foi afetado, quantos clientes, quando normalizou — não tem um problema de engenharia, tem
um problema regulatório.

O post-mortem, nesse contexto, é insumo de um relatório externo. Manter a linha do tempo
precisa e quantificada deixa de ser higiene e vira obrigação.

## Hands-on

**Desafio — game day cronometrado.**

1. Escolha **três** cenários das trilhas anteriores e escreva a **hipótese** de cada um
   antes de executar.
2. Alguém injeta a falha em horário combinado, sem avisar qual.
3. O time responde seguindo os quatro passos, **usando os runbooks do marco 13**.

**Invariantes testáveis** — meça, não estime:

- **MTTD**: da injeção ao alerta disparar.
- **MTTA**: do alerta ao primeiro reconhecimento humano.
- **MTTR**: da injeção à mitigação confirmada.
- Para cada cenário: a hipótese se confirmou? **Hipótese refutada é o resultado mais
  valioso** do exercício.
- Os runbooks levaram ao diagnóstico? Cada ponto onde alguém precisou improvisar é uma
  lacuna do runbook — anote na hora.

4. Post-mortem de uma página **de cada cenário**, com a estrutura de sete itens, mesmo
   naqueles em que nada quebrou.

**Complemento — o post-mortem retroativo.** Pegue um incidente real do seu trabalho dos
últimos meses e escreva o post-mortem no formato acima. Preencher a linha do tempo é a
parte reveladora: se você **não consegue** reconstruí-la a partir da telemetria, essa é a
sua maior lacuna de observabilidade — e é a conclusão mais útil deste marco.

**Complemento — a árvore de decisão.** Adapte a tabela de sintomas ao seu sistema, com os
comandos e painéis concretos de cada linha. Coloque no runbook geral, e teste com alguém
que não a escreveu.

**Checagem.** (a) Por que mitigar vem antes de diagnosticar? (b) Todos os painéis verdes e
o cliente reclama — onde está o problema? (c) Por que "erro humano" não é causa raiz?
(d) Qual pergunta do post-mortem costuma gerar a melhor ação?

## Principais aprendizados

- Avaliar impacto, mitigar, diagnosticar, comunicar — nesta ordem; restaurar o serviço vem
  antes de entender a causa.
- Diagnóstico é hipótese mais evidência; o passeio por dashboards dá sensação de progresso
  sem produzir nenhum.
- Blameless não é gentileza, é a condição para o documento ser verdadeiro; e ação sem dono,
  prazo e verificabilidade é redação.
- Game day com hipótese explícita e tempos cronometrados; hipótese refutada é o melhor
  resultado possível.
