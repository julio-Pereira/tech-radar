---
id: operar-credito-e-capstone
title: "Operar crédito e capstone"
summary: "Em crédito, a falha mais cara é a decisão errada em silêncio: o motor que cai, a política que mudou sem registro, a cobrança que ligou de madrugada."
estimatedMinutes: 60
---

## SLO do motor e da cobrança

O motor de decisão e a cobrança são serviços de produção com **SLO** (`observabilidade/12`):
disponibilidade e latência do motor, pontualidade e conformidade da régua. O orçamento de erro
funciona como freio — quando o *burn rate* indica que o orçamento vai estourar, **mudanças de
política e de modelo congelam** até a estabilidade voltar. A diferença em crédito é que "erro" não é
só *timeout*: uma decisão aplicada pela regra de degradação também consome orçamento, porque é uma
decisão pior do que a normal.

## Quando o *bureau* cai

A regra de degradação (marco 05) sai do papel aqui. Durante a indisponibilidade, o motor aplica **a
regra declarada e só ela** — recusar, aprovar com limite menor, ou fila manual — e **marca** cada
decisão como **degradada** no log. Quando a fonte volta, um relatório lista todas as decisões
degradadas e permite **reavaliá-las** pela política normal: a proposta aprovada com limite menor
pode receber a oferta completa; a recusada por degradação pode ser reconsiderada. A escolha de qual
regra usar continua sendo do risco; o time garante que ela é aplicada, registrada e reversível.

```diagrama
cr-degradacao
```

## Mudança de política e de modelo como mudança controlada

Publicar uma política nova é uma **mudança em produção** como qualquer outra, com mais exigências:
**sombra concluída** (campeã e desafiante, marco 05), **aprovação por alçada** (quem pode aprovar
qual tamanho de mudança), **janela** declarada, **plano de *rollback*** (voltar à versão anterior é
publicar de novo a anterior, nunca editar) e **registro**. Um *pipeline* que publica sem sombra ou
sem aprovação é recusado pelo próprio *pipeline*, não por convenção.

## Reprocessamento, contestação e auditoria

Às vezes é preciso **reprocessar** decisões ou cobranças — depois de um bug, de uma regra corrigida.
O reprocessamento roda sobre o log e os instantâneos, nunca sobre o estado atual das fontes, e gera
**novos** eventos, sem apagar os antigos. Quando um cliente **contesta** uma decisão ou uma cobrança,
a trilha de auditoria responde: o que o sistema viu, qual versão decidiu, que regra de contato foi
aplicada.

## Governança: comitê, alçadas e exceções

O **comitê de crédito** aprova políticas, apetite e exceções. As **alçadas** definem quem pode
aprovar o quê. Uma **exceção** (operar fora da política por um tempo, por um motivo) tem dono e
**prazo**, o mesmo molde de `arquitetura-de-solucoes/06` — e vence: uma exceção sem data de fim é
uma política nova que ninguém aprovou.

## Incidentes de crédito

Os incidentes que mais custam em crédito são **silenciosos**: uma cobrança indevida em massa, um
cálculo de parcela errado numa versão nova do `calc/`, uma política publicada com um *cutoff*
trocado. O roteiro é o de `observabilidade/15` — linha do tempo, fatores contribuintes, ações com
dono, prazo e verificação —, acrescido do que é próprio do crédito: **reversão** dos efeitos sobre
o cliente (estorno, correção de cadastro), **comunicação** ao cliente e, quando há obrigação, ao
regulador (**conferir** prazos e canais com compliance).

## *Game day*

O *game day* testa a operação, não só o código: injeta "*bureau* indisponível por 2 horas" e "pico
de inadimplência" na carteira sintética e observa se o motor degrada pela regra, se as decisões ficam
marcadas, se a reavaliação funciona, se o alarme da carteira dispara e se o *post-mortem* sai com
ações verificáveis.

## Exemplo numa fintech

A consulta ao *bureau* cai às 14h de uma segunda de pico. O `fin-lend` passa a aplicar a regra de
degradação aprovada pelo comitê — aprovar com limite reduzido **só** para clientes com dado interno
forte, e fila manual para o resto —, e marca 1.240 decisões como degradadas. O *bureau* volta às
16h10. No fim do dia, o *replay* das 1.240 decisões pela política normal mostra que 61 teriam saído
diferentes: 48 com limite maior e 13 recusadas. As 48 recebem a oferta completa; as 13 têm o limite
mantido, porque o contrato já foi formalizado, e entram no monitoramento. O comitê registra a
exceção por escrito, com o fim marcado para a volta do *bureau*.

## Hands-on

**Tutorial.** Implemente `make game-day` com as injeções "*bureau* indisponível por 2h" e "pico de
inadimplência".

**Desafio.** Conduza o *game day* e escreva o *post-mortem* com ações verificáveis.

**Invariantes testáveis**

1. Durante a indisponibilidade, o motor aplica a **regra de degradação declarada** — e só ela — e
   toda decisão fica **marcada como degradada** no log.
2. Após a normalização, o relatório de decisões degradadas lista **cada uma** e permite a
   **reavaliação** pela política normal.
3. O SLO do motor é medido por *burn rate*, e a política **congela mudanças** quando o orçamento
   estoura.
4. Uma mudança de política em produção exige **sombra concluída**, **aprovação por alçada** e
   **plano de *rollback*** — teste do *pipeline* de publicação.
5. O *post-mortem* tem linha do tempo, fatores contribuintes e ações com dono, prazo e verificação.
6. `make relatorio` roda **de ponta a ponta** e produz os artefatos do capstone.

**Complemento.** Escreva, em uma página, a política de degradação do crédito da sua instituição.

**Checagem**

1. Por que uma decisão degradada consome orçamento de erro mesmo sem *timeout*?
2. Por que reavaliar as decisões degradadas depois que a fonte volta?
3. O que torna uma mudança de política uma mudança controlada?
4. Por que uma exceção precisa ter prazo?

> **Reencontro — `observabilidade/12` e `/15`.** O orçamento de erro como freio de mudanças e o
> *post-mortem* sem culpa estão lá; aqui eles ganham o que é próprio do crédito: decisão degradada
> como erro, e reversão dos efeitos sobre o cliente.

A governança de exceções de `arquitetura-de-solucoes/06` é o molde do comitê e das alçadas; e a
governança de modelos de `ml-em-producao/10` é o equivalente, do lado do modelo, da mudança de
política controlada deste marco.

## Principais aprendizados

- Motor e cobrança têm SLO; decisão degradada também consome orçamento de erro.
- Na indisponibilidade, só a regra declarada; cada decisão marcada e reavaliável depois.
- Mudança de política exige sombra, alçada, janela e *rollback* — verificados pelo *pipeline*.
- Reprocessamento roda sobre o log e gera novos eventos; contestação se responde pela auditoria.
- Exceção tem dono e prazo; incidente de crédito inclui reverter o efeito sobre o cliente.

## Capstone

O `fin-lend` é o crédito executável do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui ele fica pronto, do pedido de empréstimo ao
provisionamento, consistente com o razão.

**Entrega**

- [ ] Máquina de estados do contrato com idempotência de comando (marco 01)
- [ ] `calc/` com Price, SAC, CET e antecipação, reproduzindo as tabelas à mão (marco 02)
- [ ] Cronograma postado no razão, com imputação, renegociação e conciliação (marco 03)
- [ ] `entrada/` com consulta em cascata, *cache* e instantâneo (marco 04)
- [ ] `politica/` versionada, motor puro e log de decisão com *replay* (marco 05)
- [ ] `risco/` com KS, AUC, PSI, calibração e perda esperada (marco 06)
- [ ] `limites/` com reserva atômica e concentração por grupo (marco 07)
- [ ] `cobranca/` com régua, portão de contato e relógio falso (marco 08)
- [ ] `provisao/` por estágios, com lançamento no fechamento e relatório de auditoria (marco 09)
- [ ] `alm/` com escada de vencimentos e estresse (marco 10)
- [ ] Relatórios *as-of* de vintage e migração (marco 11)
- [ ] `make game-day` e `make relatorio` (este marco)

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] A proposta é decidida pela política vigente, e o *replay* do log reproduz decisão e motivos
- [ ] Nenhum valor monetário passa por `float`; as tabelas à mão batem ao centavo
- [ ] Desembolso, juros, pagamentos, atraso e renegociação geram lançamentos balanceados, e o saldo
      do razão é igual ao do cronograma em qualquer data
- [ ] Soma de saques concorrentes ≤ limite, com `-race`
- [ ] Nenhum contato sai fora da janela, acima do limite diário ou para cliente em proteção
- [ ] Provisão por estágio no fechamento, com relatório de auditoria somando exatamente o lançamento
- [ ] Relatório de carteira reproduzível *as-of* e reconciliado com o razão
- [ ] *Game day* de indisponibilidade de consulta externa e de pico de inadimplência, com
      *post-mortem*

**Antes de fechar**, responda por escrito à pergunta final da trilha: **das decisões de crédito que
o `fin-lend` reproduz por *replay*, qual depende de um dado que, na sua instituição, você não
consegue congelar — e o que isso muda na defesa dessa decisão?**
