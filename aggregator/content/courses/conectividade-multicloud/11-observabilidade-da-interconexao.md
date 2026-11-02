---
id: observabilidade-da-interconexao
title: "Observabilidade da interconexão"
summary: "Rede que só é vista quando a aplicação reclama é rede sem dono; a sessão BGP é um SLI."
estimatedMinutes: 60
references:
  - title: "Azure Network Watcher — Connection Monitor"
    url: https://learn.microsoft.com/azure/network-watcher/connection-monitor-overview
  - title: "Google Cloud — Network Intelligence Center"
    url: https://docs.cloud.google.com/network-intelligence-center/docs
  - title: "Google Cloud — VPC Flow Logs"
    url: https://docs.cloud.google.com/vpc/docs/flow-logs
  - title: "FRRouting — documentação"
    url: https://docs.frrouting.org/
---

## Rede sem dono

Quando a interconexão só aparece no painel porque o antifraude reclamou de timeout, quem descobre o
problema é a aplicação, e quem responde é o time errado. A pergunta "é a rede ou é o fornecedor?"
leva uma hora porque ninguém olhava a rede antes. Observar a interconexão é dar a ela os sinais, os
alertas e o dono que qualquer serviço em produção tem.

## Os sinais

| Sinal | O que diz | Quando alertar |
| --- | --- | --- |
| Estado da sessão BGP | se há rota | sessão fora de `Established` |
| Prefixos recebidos e anunciados | se o vizinho mudou o que anuncia | variação acima do limiar, para cima ou para baixo |
| Perda, latência e jitter por caminho | a qualidade de cada caminho, separadamente | acima do orçamento |
| Caminho ativo | se o tráfego está no primário ou no secundário | tráfego no secundário fora de falha declarada |
| Uso de banda e 95º percentil | a capacidade (marco 12) | acima do limiar de capacidade |
| Estado do túnel IPsec | a cifra do caminho (marco 07) | túnel caído |
| Validade de certificados | o mTLS e o IPsec | vencimento em menos de N dias |

Dois desses merecem atenção especial. O **número de prefixos recebidos** é o sinal mais barato de
vazamento de rota: o fornecedor que anunciava dois prefixos e passou a anunciar trinta mudou algo,
e você precisa saber antes de o `max-prefix` derrubar a sessão. E o **caminho ativo** é o que
explica a latência: sem ele no painel, o p99 alto parece culpa do fornecedor.

## A sessão BGP é um SLI

Um **SLI de conectividade** mede, do ponto de vista do `ledger-core`, a fração do tempo em que a API
do fornecedor é alcançável pelo caminho privado dentro do orçamento de latência. Ele vem de uma
**sonda ativa** — uma chamada sintética contínua pelo caminho, não do tráfego real, que pode ser
pouco de madrugada. Sobre ele, um SLO (por exemplo, 99,95% das sondas dentro de 40 ms em 28 dias) e o
orçamento de erro que diz quando parar de mudar a interconexão.

A sessão BGP entra como SLI auxiliar: ela pode estar `Established` com o caminho perdendo pacotes,
mas se ela cair, nada passa.

```diagrama
cm-p99
```

## Registros de fluxo

Os **registros de fluxo** de cada nuvem — no Azure, os de rede virtual; no Google, os VPC Flow Logs
(**conferir** os nomes e as opções vigentes, que mudam) — dizem quem falou com quem, em que porta,
quando e quanto. Servem a duas coisas: auditoria ("o fornecedor só acessou o que devia?", marco 08)
e investigação ("a requisição chegou à borda ou morreu antes?"). Têm custo de volume e de retenção:
amostragem e prazo são decisões explícitas.

## Ferramentas nativas × visão unificada

Cada peça tem a sua ferramenta: o monitoramento de conexão do Azure, o Network Intelligence Center
do Google, a telemetria e os alertas do Equinix Fabric (**conferir** o que cada um oferece hoje).
Elas são boas para olhar uma peça; o incidente atravessa três. A visão que resolve é a unificada: as
métricas das três peças, a sonda e a latência da aplicação no mesmo stack LGTM do `fin-platform`, no
mesmo painel, com o mesmo relógio.

## Rede ou fornecedor?

O antifraude reporta timeout no score. O caminho de investigação, com os sinais acima:

1. a sonda pelo caminho privado está boa? Se sim, a rede entrega; o problema está na API do
   fornecedor ou no `ledger-core`;
2. se a sonda piorou: qual caminho está ativo, e a perda está em qual trecho?
3. a sessão BGP mudou de estado ou de número de prefixos?
4. os registros de fluxo mostram a requisição chegando à borda do fornecedor?

Cada passo tem um painel e um dono. O que não se resolve do seu lado vira chamado ao **NOC do
fornecedor** ou à Equinix, com o horário e a evidência — e o contato está no catálogo do marco 09.

## Alertas com runbook e dono

Todo alerta da interconexão tem um **runbook** (o que olhar, o que fazer, quem chamar) e um dono.
Alguns têm dois donos: a sessão BGP com o fornecedor caiu às três da manhã, e o NOC do fornecedor
precisa ser acionado junto. Um alerta sem runbook acorda alguém que não sabe o que fazer.

## Exemplo numa fintech

Às 9h, o p99 do score está em 90 ms, e o time de aplicação abre chamado contra o fornecedor. O
painel da interconexão mostra outra história: o tráfego está no caminho secundário desde as 2h,
quando a manutenção da Equinix derrubou o primário. A manutenção terminou às 4h, a sessão do
primário voltou, mas o tráfego não voltou — o *local preference* do primário tinha sido zerado numa
mudança antiga e ninguém percebeu, porque o primário sempre esteve de pé. O alerta "tráfego no
secundário fora de falha declarada" teria disparado às 4h.

## Hands-on

**Tutorial.** No `lab/`, exporte as métricas do FRR (estado de sessão, prefixos), suba a sonda ativa
do `ledger-core` à API e monte os painéis no stack da trilha `observabilidade`.

**Desafio.** Escreva os alertas da tabela acima, cada um com runbook.

**Invariantes testáveis**

1. Derrubar uma sessão BGP dispara alerta em até N minutos (parametrizado), e o alerta tem link de
   runbook.
2. Uma variação de prefixos recebidos acima do limiar dispara alerta.
3. O SLI de conectividade é calculado da sonda e **cai** sob perda injetada.
4. Um alerta sem runbook reprova o lint.

**Complemento.** Quem é acordado hoje, no seu ambiente, quando o link com um fornecedor cai? E quem
deveria ser?

**Checagem**

1. Por que a sessão BGP é um SLI, e por que não basta sozinha?
2. Por que o número de prefixos recebidos é um sinal de segurança?
3. Como você separa "é a rede" de "é o fornecedor" num timeout?
4. Para que servem os registros de fluxo, e quanto eles custam?

> **Reencontro — `observabilidade/12`.** SLI, SLO e orçamento de erro valem para a rede como para
> qualquer serviço: o SLI de conectividade é a disponibilidade do caminho, medida por sonda.

O fluxo de incidente de `observabilidade/15`, do alerta à análise de causa, é o mesmo aqui, com uma
diferença: parte das evidências e da correção está com outra empresa, e o runbook precisa dizer como
chegar até ela.

Os registros de fluxo e a retenção das métricas de rede pesam no custo da observabilidade, e
`observabilidade/16` dá o método para decidir amostragem e prazo.

## Principais aprendizados

- A interconexão precisa de sinais, alertas e dono antes de a aplicação reclamar.
- Sessão BGP, prefixos, perda e latência por caminho, caminho ativo, túnel e certificados são os
  sinais.
- O SLI de conectividade vem de sonda ativa; a sessão BGP é auxiliar.
- Rede × fornecedor se resolve com sonda, caminho ativo, BGP e registros de fluxo, nessa ordem.
- Todo alerta tem runbook e dono — às vezes, do outro lado do contrato.
