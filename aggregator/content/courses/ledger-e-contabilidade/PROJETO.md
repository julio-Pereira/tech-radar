# `fin-books` — projeto guia da trilha `ledger-e-contabilidade`

> **Stub.** Esta trilha ainda está em `course.yaml` + 10 marcos placeholder — ver o aviso em
> cada marco. Este `PROJETO.md` reproduz a especificação já fechada em
> `PLANO-trilha-ledger-e-contabilidade.md` §7; o conteúdo completo dos marcos chega bloco a
> bloco nas próximas PRs desta trilha.

Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
constrói enquanto lê a trilha. O `fin-books` é o **razão do `fin-platform`**: recebe pedidos de
movimentação, registra lançamentos balanceados e imutáveis, mantém saldos, reserva e libera
valores, fecha períodos, converte moedas e se concilia com o mundo externo.

## O que você vai construir

Seis partes: `ledger/` (serviço Go com PostgreSQL: contas, lançamentos, saldos, reservas),
`contabil/` (plano de contas parametrizado e balancete), `fx/` (taxas e conversão),
`fechamento/` (períodos e snapshots), `conciliacao/` (motor de casamento e fila de exceções) e
`sim/` (simulador de contrapartes e de arquivos de liquidação, com falhas injetáveis). Mais
`invariantes/`: a suíte de propriedades que cresce a cada marco.

## Contratos com os vizinhos (todos simuláveis com stub)

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Pedidos de movimentação com chave de idempotência | `pix-gateway`, trilha spring-boot |
| consome | Eventos de liquidação/arquivos de contraparte (simulados) | trilha `pagamentos-e-liquidacao` |
| serve | API de lançamento, saldo, extrato e reserva | `pix-gateway`, `ledger-core`, antifraude |
| serve | Eventos de lançamento postado (via *outbox*) | `pix-stream`, trilha kafka |
| serve | Balancete e arquivos de fechamento | auditoria, trilha engenharia-de-dados |
| consome | Estado do consentimento (apenas rotulagem de origem) | `open-finance-brasil` (planejada) |

**O que este projeto não é.** Não é um core bancário completo, não faz cálculo de provisão de
crédito, não executa pagamentos (apenas registra) e não toca em dado real.

**Pré-requisitos.** Go (toolchain atual); Docker com PostgreSQL local (alternativa em memória
para os marcos 01-03, 05-07); `psql`; biblioteca de teste de propriedade em Go (por ADR).
**Não precisa:** conta em nuvem, ferramenta paga. Confirmar versões e licenças na Fase 0.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Esquema de contas + `Postar(lançamento)` com validação de balanceamento | Lançamento desbalanceado é rejeitado; para qualquer sequência aleatória, Σ débitos = Σ créditos |
| 02 | Saldos derivados (contábil, disponível) + saldo materializado verificável | Saldo materializado = soma dos lançamentos (reconstrução); conta interna e de cliente separadas |
| 03 | Journal imutável + estorno/ajuste + idempotência de posting | Sem `UPDATE`/`DELETE` (permissão do banco); mesma chave 2x = 1 lançamento; estorno devolve o saldo anterior |
| 04 | Reserva (hold) com expiração, captura parcial e liberação | Disponível = contábil − holds ativos; sob concorrência nunca excede o disponível; hold expirado libera |
| 05 | Rateio por maior resto e acúmulo de juros | Σ das partes = total; juros diários reproduzem o valor esperado numa tabela de casos |
| 06 | Contas por moeda + conversão com taxa e conta de câmbio | Cada moeda balanceia isoladamente; ganho/perda cambial fecha a diferença |
| 07 | Períodos, fechamento diário e balancete | Período fechado rejeita lançamento; balancete fecha (Σ saldos devedores = Σ credores) |
| 08 | `conciliacao/` com casamento 1:1, 1:N e fila de exceções | Dados com divergências plantadas: todas encontradas e classificadas; casamento determinístico |
| 09 | Carga com contas quentes + reconstrução a partir do journal | Sob concorrência, 0 violações; reconstrução = estado atual; relação de vazão entre estratégias |
| 10 | Trilha de auditoria + verificação "contas de controle = soma dos clientes" + runbook | `make audit` passa; adulteração do journal é detectada |

## Definição de pronto (capstone)

- [ ] Todo lançamento é balanceado (Σ débitos = Σ créditos por moeda); lançamento desbalanceado nunca persiste
- [ ] O journal é imutável: o papel de aplicação não tem `UPDATE`/`DELETE`; correção só por estorno/ajuste
- [ ] Saldo materializado é igual à soma dos lançamentos, verificado por reconstrução completa
- [ ] A mesma chave de idempotência não gera dois lançamentos, inclusive com *retries* concorrentes
- [ ] Saldo disponível nunca fica negativo por concorrência (salvo conta marcada), com reserva e captura
- [ ] Arredondamento e rateio conservam o total (nenhum centavo criado ou perdido)
- [ ] Cada moeda balanceia isoladamente; a conversão tem taxa, hora e conta de ganho/perda
- [ ] Período fechado é imutável; o balancete fecha
- [ ] A conciliação encontra e **classifica** todas as divergências plantadas, de forma determinística
- [ ] Reconstrução do estado a partir do journal reproduz o estado atual
- [ ] A soma dos saldos de clientes é igual às contas de controle
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Duas requisições idênticas chegam ao mesmo tempo** (o cliente reenviou). Quantos lançamentos existem?
2. **Mil débitos concorrentes numa conta quente.** O disponível ficou negativo? Qual foi a vazão?
3. **Alguém precisa corrigir um lançamento de três meses atrás** (período fechado). Como corrigir sem editar?
4. **O parceiro envia um arquivo de liquidação com 3 divergências** (duplicado, valor diferente, faltante). Todas são classificadas?
5. **A taxa de câmbio chega atrasada.** Que taxa foi usada? Como ficou o ganho/perda?
6. **O saldo materializado diverge da soma dos lançamentos.** O que detecta? Como reconstruir sem parar?
7. **Restaurar o banco de um ponto no tempo.** O que se perde? Como a conciliação revela o buraco?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 610 min de leitura viram ~20h porque o hands-on é
escrever a invariante, bombardear o ledger com operações aleatórias e concorrentes, e plantar a
divergência de propósito.
