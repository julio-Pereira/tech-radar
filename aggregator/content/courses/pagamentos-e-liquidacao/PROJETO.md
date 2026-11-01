# `fin-rails` — projeto guia da trilha `pagamentos-e-liquidacao`

> **Stub.** Esta trilha ainda está em `course.yaml` + 10 marcos placeholder — ver o aviso em
> cada marco. Este `PROJETO.md` reproduz a especificação já fechada em
> `PLANO-trilha-pagamentos-e-liquidacao.md` §7; o conteúdo completo dos marcos chega bloco a
> bloco nas próximas PRs desta trilha.

Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
constrói enquanto lê a trilha. O `fin-rails` é a **camada de trilhos de pagamento** do
`fin-platform`: simuladores dos participantes (Pix, cartões, boleto) e um orquestrador que
recebe um pedido de pagamento, escolhe o trilho e o provedor, trata o resultado desconhecido,
posta no razão e se concilia.

## O que você vai construir

Seis partes: `sim-spi/` (SPI e DICT simulados, com limites, falhas e devoluções),
`sim-cartoes/` (emissor, bandeira e adquirente; autorização, captura, compensação e arquivos de
liquidação, com formato de mensagem didático), `sim-boleto/` (registro, linha digitável,
pagamento e baixa), `orquestrador/` (serviço Go: roteamento, máquina de estados por pagamento,
*webhooks*), `cofre/` (o único pacote que enxerga dados de cartão: tokenização) e `liquidez/`
(projeção de posição, *netting* e alertas). O `pix-gateway` (Spring Boot) é o cliente do
orquestrador.

## Contratos com os vizinhos (todos simuláveis com stub)

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Pedidos de pagamento com chave de idempotência | `pix-gateway`, trilha spring-boot |
| consome | Razão: reservar, capturar, liberar, estornar, postar | `fin-books`, trilha `ledger-e-contabilidade` (planejada) |
| consome | Regras de antifraude (decisão por transação) | `ledger-core`/antifraude, trilha go-fintech |
| serve | Eventos de pagamento (autorizado, liquidado, devolvido, em disputa) | `pix-stream`, trilha kafka |
| serve | Arquivos de liquidação e dados de conciliação | `fin-books`, trilha `ledger-e-contabilidade` (planejada) |
| serve | Métricas de aprovação, latência e funil por trilho | trilha observabilidade |
| serve | Pix iniciado por terceiros (consumo da mesma máquina de estados) | `open-finance-brasil` (planejada) |

**O que este projeto não é.** Não integra com participante real, não guarda PAN de verdade,
não implementa antifraude nem crédito e não substitui homologação com arranjos.

**Salvaguarda (inegociável).** Nenhum PAN, chave Pix, documento ou participante reais em
nenhuma hipótese — somente dados sintéticos com faixas reservadas a teste. Uma varredura
automática do repositório proíbe padrões de PAN/documento em log, arquivo e teste.

**Pré-requisitos.** Go (toolchain atual); Docker (PostgreSQL e filas locais); biblioteca de
teste de propriedade em Go (por ADR); relógio falso; `promtool`. **Não precisa:** conta em
nuvem, credenciais de arranjo, ferramenta paga. Confirmar versões e licenças na Fase 0.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `fluxo/` com participantes, fluxos de informação e de fundos de 4 cenários | Σ in = Σ out por cenário (inclui taxas); nenhum fluxo de informação move fundos; cada participante mapeado a uma conta do razão |
| 02 | `sim-spi/` + cliente: DICT, QR, mensagens | CRC e dígitos verificadores corretos (propriedade); consulta ao DICT respeita limite; mensagem ida e volta idêntica |
| 03 | Agendamento, recorrência, devolução e fluxo de MED | Σ devoluções ≤ original; agenda determinística com calendário; MED termina em um estado terminal; fundos conservados |
| 04 | `sim-cartoes/` + `cofre/` | Mensagem ida e volta idêntica; *timeout* gera reversão uma vez; PAN só existe no `cofre/` (teste de arquitetura e varredura) |
| 05 | Compensação, agenda de recebíveis e arquivo de liquidação | Bruto − taxas = líquido; parcelas somam o total (maior resto); arquivo concilia com as capturas |
| 06 | `sim-boleto/` + tabela de escolha de trilho | Linha digitável ida e volta, dígitos corretos; pagamento duplicado detectado; escolha de trilho é função testada |
| 07 | `liquidez/` com projeção e *netting* | Net = Σ bruto; posição nunca abaixo do colchão no cenário 24x7; alerta dispara no limite |
| 08 | Máquina de disputas com prazos | Prazo respeitado (relógio falso); lançamentos de disputa conservam fundos; ingestão idempotente |
| 09 | `orquestrador/` com 2 provedores simulados | Retentativa em outro provedor **nunca** cobra duas vezes; *webhook* com assinatura e proteção contra replay; um estado terminal por pagamento |
| 10 | SLOs, sondas sintéticas, calendário de mudança e `make rails-review` | SLO calculado e violável; falha de trilho aciona degradação/roteamento; revisão falha se qualquer verificação falhar |

## Definição de pronto (capstone)

- [ ] Todo pagamento termina em **um** estado terminal e conserva o dinheiro (Σ in = Σ out, taxas incluídas)
- [ ] Informação e fundos são modelados separadamente; nenhum evento de informação move saldo
- [ ] Toda regra de trilho (limite, prazo, horário, código) vem de configuração marcada "conferir"; trocar o valor não exige mudar código
- [ ] Resultado desconhecido é resolvido por consulta/reversão, nunca por nova cobrança às cegas, em **todos** os trilhos
- [ ] Nenhum PAN, chave ou documento aparece em log, métrica, arquivo ou teste fora do `cofre/` (varredura automática)
- [ ] Devoluções, estornos e disputas respeitam seus limites de valor e de prazo
- [ ] Os arquivos de liquidação conciliam com as capturas; divergências plantadas são classificadas
- [ ] Retentativa entre provedores não duplica cobrança; *webhooks* têm assinatura, janela de tempo e idempotência
- [ ] Existe projeção de liquidez com alerta e colchão para operação 24x7
- [ ] SLOs de aprovação e latência por trilho existem, com sonda sintética e alerta testado
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **O SPI simulado não responde** a 30% dos pedidos por 10 minutos. O orquestrador cobra duas vezes? Quanto ficou "em análise"?
2. **O mesmo pedido chega duas vezes** (cliente reenviou) em trilhos diferentes. Quantos pagamentos existem?
3. **O autorizador de cartão cai depois de aprovar.** O hold é liberado exatamente uma vez?
4. **O arquivo de liquidação traz 3 divergências** (duplicada, valor, faltante). A conciliação classifica todas?
5. **Uma devolução maior que o original é pedida.** Quem rejeita, e com que mensagem?
6. **O provedor A degrada.** O roteamento troca de provedor sem duplicar? E a conciliação do dia?
7. **Sexta à noite, a reserva de liquidez cai abaixo do colchão.** O que alerta? Qual a ação?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 610 min de leitura viram ~20h porque o hands-on é
derrubar o simulador, duplicar a mensagem, atrasar o arquivo e conferir que o dinheiro se
conserva.

## Versão de referência dos diagramas

O diagrama do MED (marco 03) usa nomes descritivos dos estados (notificado, bloqueio cautelar,
rastreio de fundos, em análise, devolvido, liberado), não os códigos do regulamento. Os prazos de
recebíveis no marco 05 (D+30, D+60, D+90) são **ilustrativos**. Antes de implementar,
**confira** a versão vigente do regulamento do Pix e do MED, e o cronograma do arranjo de cartão.
Se algo mudar, atualize os diagramas junto com o código.
