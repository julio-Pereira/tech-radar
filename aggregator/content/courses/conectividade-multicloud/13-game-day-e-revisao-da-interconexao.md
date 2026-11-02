---
id: game-day-e-revisao-da-interconexao
title: "Game day e revisão da interconexão"
summary: "A interconexão está pronta quando sobrevive aos sete cenários do game day e a revisão roda como comando — não quando o ping responde."
estimatedMinutes: 70
references:
  - title: "Google SRE Book — Postmortem Culture"
    url: https://sre.google/sre-book/postmortem-culture/
  - title: "Principles of Chaos Engineering"
    url: https://principlesofchaos.org/
  - title: "containerlab"
    url: https://containerlab.dev/
---

## Pronto não é "o ping responde"

O ping responde no primeiro dia. A interconexão está pronta quando cada garantia dos marcos
anteriores foi **provocada e provada**: o failover converge, o vazamento é barrado, o certificado
vencido aparece no painel, o desligamento não deixa resíduo. Este marco junta tudo em duas coisas:
um **game day** com sete cenários e um comando, `make interconnect-review`, que roda todas as provas.

## Como conduzir um game day de rede

Cada cenário segue o mesmo roteiro:

1. **Hipótese escrita**: o que deve acontecer, em quanto tempo e com que sinal. "Com o primário
   derrubado, o tráfego converge em menos de 3 s, sem nenhum pacote pela internet, e o alerta de
   caminho secundário dispara."
2. **Critério de aborto**: o que faz parar o experimento e restaurar o caminho. No laboratório,
   raramente; num ambiente real, sempre.
3. **Comunicação**: quem é avisado antes, inclusive o NOC do fornecedor, se o cenário o afeta.
4. **Falha provocada** e **observação do sinal**.
5. **Post-mortem** de uma página — inclusive quando nada quebrou — e um **ajuste** com dono e prazo.

```diagrama
cm-game-day
```

## Os sete cenários

1. **O link primário cai** no meio do pico de Pix. Quanto tempo até convergir? Alguma requisição
   saiu pela internet? (marco 10)
2. **O fornecedor anuncia um /8 por engano.** O que o filtro de entrada e o `max-prefix` fazem? Quem
   é avisado? (marcos 03 e 11)
3. **O fornecedor muda a faixa** sem avisar: uma sub-rede nova. O que deixa de funcionar, e como você
   descobre? (marcos 02, 08 e 09)
4. **O certificado mTLS do fornecedor expira** com o IPsec de pé. O que o monitoramento mostra?
   (marcos 07 e 11)
5. **MTU errado depois de ligar o IPsec**: chamadas pequenas passam, respostas grandes travam. Como
   diagnosticar? (marco 07)
6. **Contrato encerrado.** O desligamento remove tudo? Sobrou alguma rota, regra ou credencial?
   (marco 09)
7. **Rota assimétrica**: ida por um caminho, volta pelo outro, e o firewall com estado descarta. Como
   evitar e como detectar? (marco 10)

## Post-mortem sem culpa, em uma página

O post-mortem existe para mudar o sistema, não para achar culpado. Uma página basta: o que se
esperava, o que aconteceu, a linha do tempo com os sinais, a causa no sistema (não na pessoa) e os
ajustes, cada um com dono e prazo. O mesmo formato vale para o cenário que passou: "funcionou" também
é um resultado, e documentar por que funcionou protege contra a mudança que vai quebrá-lo.

## `make interconnect-review`

O comando agrega as provas dos marcos 02 a 12 — detector de sobreposição, BGP, modelo de estados,
caminho pelo FCR, IaC offline, criptografia, segmentação, catálogo, failover, alertas e custo — e
produz um relatório. Três propriedades o tornam confiável:

- **falha** se qualquer prova falhar, sem "aviso" que ninguém lê;
- é **determinístico**: rodar duas vezes gera o mesmo relatório (sem data, ordem ou aleatoriedade
  solta);
- lista os **riscos abertos** com dono e prazo, e um risco injetado de propósito aparece lá.

## Priorizar riscos

O game day sempre acha mais do que dá para corrigir na semana. A priorização usa três eixos:
**impacto** (o que quebra, e para quantos clientes), **probabilidade** (quão perto o cenário está de
acontecer sozinho) e **facilidade de reversão** (um erro que se desfaz em um minuto pesa menos que um
que exige o fornecedor). Um vazamento de rota, de impacto alto e reversão lenta, vem antes de um
alerta com runbook incompleto.

## O que muda no ambiente real

O laboratório prova protocolo; não tem fila de aprovação, prazo de provisionamento nem fatura. No
primeiro contato com o ambiente real — o apêndice opcional do `PROJETO.md` —, as primeiras provas a
repetir são as que dependem de produto: a ordem das chaves, o tempo de convergência com as peças
reais, os limites do pacote e a cifra ponta a ponta com o FCR no meio, que a trilha marcou como "a
conferir".

## Passagem para a operação

A interconexão passa para a operação com: os runbooks do marco 11, os contatos de NOC do catálogo, o
calendário de manutenções dos provedores, a data de revisão de cada parceiro e o game day como
evento periódico, não único.

## Exemplo numa fintech

No cenário 6, o time encerra o parceiro de teste pelo catálogo, regenera a configuração e roda a
prova de inalcançabilidade: passa. Mas a varredura de resíduos encontra a entrada do fornecedor
ainda na zona DNS privada — o desligamento removia rota, filtro e regra, e esquecia o DNS, gerado
por outro módulo. O post-mortem de uma página leva a um ajuste: o DNS passa a ser gerado do mesmo
catálogo, e a prova de offboarding passa a verificar a resolução do nome.

## Hands-on

**Tutorial.** Escreva o `make interconnect-review` e o roteiro do game day, com a hipótese, o
critério de aborto e o sinal esperado de cada cenário.

**Desafio.** Execute os sete cenários no laboratório e escreva os sete post-mortems.

**Invariantes testáveis** — as da Definição de pronto, e além delas:

1. O comando **falha** se qualquer teste falhar.
2. Rodar duas vezes gera **o mesmo relatório**.
3. Um risco injetado de propósito (um filtro removido) aparece no relatório com dono e prazo.
4. Existe um post-mortem por cenário, com a estrutura mínima (lint).

**Complemento.** Rode o roteiro do game day, no papel, contra uma interconexão real sua: qual
cenário você não saberia responder hoje?

**Checagem**

1. O que torna uma hipótese de game day testável?
2. Por que escrever post-mortem de um cenário que passou?
3. Como impacto, probabilidade e reversão ordenam os riscos?
4. Que provas você repetiria primeiro no ambiente real, e por quê?

> **Reencontro — `arquitetura-de-solucoes/09`.** A revisão arquitetural do `fin-platform` ganha aqui
> uma entrada: a interconexão, com o relatório do `make interconnect-review` como evidência.

O ciclo de incidente de `observabilidade/15` é o formato do post-mortem deste marco, e o game day é o
incidente ensaiado.

As células e regiões de `system-design/13` e os dois caminhos do marco 10 respondem à mesma pergunta,
que o game day testa: o que sobrevive quando um domínio de falha inteiro cai.

## Principais aprendizados

- Pronto é sobreviver aos sete cenários e ter a revisão como comando.
- Cada cenário tem hipótese, aborto, comunicação, falha, sinal, post-mortem e ajuste.
- O comando falha de verdade, é determinístico e lista os riscos com dono e prazo.
- Riscos se ordenam por impacto, probabilidade e facilidade de reversão.
- O laboratório prova protocolo; o ambiente real ainda precisa provar o produto.

## Capstone

O `fin-interconnect` é a interconexão privada do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui ela fica pronta, do plano de faixas ao game day.

**Entrega**

- [ ] `decisao/arvore.yaml` e a ADR de conectividade, com gatilho de revisão (marco 01)
- [ ] `ipam/` com plano de faixas, detector de sobreposição e NAT para 100.64.0.0/10 (marco 02)
- [ ] `lab/` com eBGP, filtros, `max-prefix` e autenticação (marco 03)
- [ ] `estados/` com o ciclo de vida do circuito, do attachment e das conexões (marco 04)
- [ ] Topologia completa Azure ↔ FCR ↔ GCP gerada do `topologia.yaml` (marco 05)
- [ ] `iac/` com os três providers, `terraform test` offline e política sobre o plano (marco 06)
- [ ] IPsec sobre o caminho e mTLS na aplicação, com MSS ajustado (marco 07)
- [ ] Filtros, firewall e DNS privado gerados do catálogo (marco 08)
- [ ] `parceiros/` com catálogo, lint do contrato mínimo, onboarding e offboarding (marco 09)
- [ ] Dois caminhos independentes com BFD e o game day de failover (marco 10)
- [ ] `operacao/` com exporter, sonda, alertas e runbooks (marco 11)
- [ ] `custo/` com o modelo, a sensibilidade e o showback (marco 12)
- [ ] `make interconnect-review` e os sete post-mortems (este marco)

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Nenhuma faixa IP se sobrepõe entre o `fin-platform` e o fornecedor; o detector prova, e pega
      a sobreposição injetada
- [ ] Cada sessão BGP tem filtro de entrada e de saída, `max-prefix` e autenticação configurados
- [ ] O tráfego do `ledger-core` ao `FornecedorScore` passa **só** pelo FCR (traceroute e captura)
- [ ] O caminho é cifrado (IPsec) **e** autenticado na aplicação (mTLS); a captura não tem texto claro
- [ ] Só os prefixos combinados no contrato são anunciados, nos dois sentidos; o firewall nega por
      padrão
- [ ] Existem dois caminhos independentes; a queda de um converge dentro do alvo, sem rota pela
      internet
- [ ] Toda sessão e todo caminho têm alerta com runbook; o SLI de conectividade é calculado
- [ ] O fornecedor está no catálogo com contrato mínimo e desligamento **testado**
- [ ] A IaC dos três provedores passa em `terraform test` offline e na política; nenhum segredo no Git
- [ ] O modelo de custo é reproduzível, com preços fictícios declarados e análise de sensibilidade
- [ ] Nenhuma conta, recurso ou preço real; o apêndice do trilho real é opcional e fica fora das
      invariantes

**Antes de fechar**, responda por escrito à pergunta final da trilha: **qual das suas garantias só
vale porque o laboratório não tem prazo de provisionamento, aprovação de fornecedor nem faturamento —
e qual é o primeiro teste que você rodaria no ambiente real?**
