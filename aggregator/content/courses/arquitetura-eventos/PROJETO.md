# Projeto guia — fin-flow

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `fin-flow` é o que faltava no `fin-platform`: o **orquestrador de liquidação** e as
> **projeções** que amarram `pix-gateway`, `ledger-core` e `pix-stream`. Ele só existe
> como saga + projeção — não há nele nenhuma tela, nenhum CRUD.

## O que você vai construir

O fluxo de liquidação de uma fintech, modelado antes de ser codificado. Primeiro o
domínio: quais eventos existem, quem é dono de qual invariante, o que pode ser
eventualmente consistente e o que nunca pode. Depois o contrato, a projeção, a saga.

**Contratos que o `fin-flow` assume dos vizinhos** — e que você pode simular com um stub
de 50 linhas se não fez a trilha correspondente:

| Direção | Tópico / interface | Origem |
| --- | --- | --- |
| consome | `payments.initiated` (chave `accountId`) | `pix-gateway`, trilha spring-boot |
| consome | `payments.authorized` / `payments.rejected` | antifraude do `ledger-core`, trilha go-fintech |
| produz | `settlement.requested` / `.completed` / `.compensated` | este componente |
| consulta | lançamento no ledger (síncrono, idempotente por chave de negócio) | `ledger-core` |

O `pix-stream` (trilha kafka) é o transporte. **Nada aqui ensina a configurar o broker** —
se você se pegar ajustando `acks` ou `min.insync.replicas`, está na trilha errada: aquilo
é `kafka`, isto aqui é a decisão de modelagem que vem antes.

## Pré-requisitos

- Um editor de texto e uma parede (física ou virtual) para o event storming do marco 03
- JDK 21+ para o agregado e o orquestrador; Go 1.22+ para as projeções e consumidores
- Docker para um broker local e um Postgres — qualquer broker serve, os padrões da trilha
  são neutros
- Os stubs dos vizinhos, ou as trilhas `spring-boot` / `go-fintech` / `kafka` feitas
- **Não precisa:** conta em cloud paga, Temporal/Camunda, licença comercial. O marco 09
  compara ferramentas de saga; a implementação do capstone é caseira de propósito.

## Incrementos por marco

Os marcos 01–04 são **de papel** — e isso é deliberado. O bloco de domínio produz os
documentos que decidem todo o código dos blocos seguintes. Pular esta parte para "começar
a codar" é exatamente como se produz um monolito distribuído.

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `SINCRONO-OU-EVENTO.md`: 10 interações do `fin-platform` classificadas | Cada linha tem a invariante que justifica, não uma preferência |
| 02 | `CONTEXTOS.md`: fronteiras, agregados e o dono de cada invariante | Toda invariante tem exatamente um dono; "saldo" aparece uma vez só |
| 03 | `EVENTOS.md`: catálogo de eventos vindo de um event storming solo | Todo evento tem nome no passado, dono, disparo e consumidor conhecido |
| 04 | `CONSISTENCIA.md`: 5 invariantes classificadas com janela e custo de errar | Cada janela tem número, dono e a frase escrita para o cliente |
| 05 | Envelope canônico e catálogo versionado | Um consumidor descobre o evento sem perguntar no Slack |
| 06 | Projeção de extrato em Go, consumindo `pix-stream` | Reprojetar do zero produz extrato idêntico ao anterior |
| 07 | Agregado `Account` como fold de eventos, com snapshot | Replay total e snapshot+delta dão o mesmo saldo |
| 08 | Inbox no consumidor de liquidação | 3 reentregas e 1 evento fora de ordem: ledger fecha idêntico |
| 09 | Orquestrador com máquina de estado persistida | Matar o orquestrador no meio: retoma sem duplicar débito |
| 10 | Decisão escrita de mecanismo para 5 interações | O único caso polêmico está defendido por escrito |
| 11 | `correlationId`/`causationId` e o painel de sagas | "Onde está o pagamento X?" respondido em < 30s, sem abrir o banco |
| 12 | Suíte given/when/then + teste de idempotência | O teste pega o bug do consumidor não idempotente do marco 08 |
| 13 | ADR de extração de um contexto, com gatilho de reversão | A classificação do marco 01 foi respeitada — ou a divergência está justificada |

## Definição de pronto (capstone)

- [ ] Todo evento do catálogo tem nome no passado, dono, versão e consumidor conhecido
- [ ] Toda invariante tem **exatamente um** dono, e as transacionais estão dentro de um agregado
- [ ] Toda janela de inconsistência tem número, monitoramento e frase escrita para o cliente
- [ ] Reprojeção completa produz um extrato idêntico ao anterior — provado por teste
- [ ] Reentrega tripla do mesmo evento não altera o saldo — provado por teste
- [ ] A saga retoma depois de morrer no meio, sem duplicar débito nem perder compensação
- [ ] Nenhuma saga fica pendurada sem alerta; existe painel de sagas por idade
- [ ] Nenhum evento de domínio interno vazou como contrato público
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Reenviar o mesmo evento 3 vezes** e injetar um fora de ordem. O ledger fecha idêntico?
2. **Matar o orquestrador** no meio de uma liquidação. Ela retoma, duplica ou some?
3. **Fazer o estorno chegar depois do fechamento** — o hotspot do marco 03. Quem decide?
4. **Atrasar a projeção em 10 minutos** e olhar o extrato do cliente. A janela de
   inconsistência que você declarou no marco 04 aguenta esse número?
5. **Publicar um evento com um campo novo obrigatório.** Qual consumidor quebra, e em
   quanto tempo você descobre?

## Regra do tempo declarado

`estimatedHours` da trilha é ~2× a soma dos `estimatedMinutes` dos marcos: leitura mais
hands-on. O número não é chute nem marketing — se você ler tudo e não fizer nada, gasta
metade e aprende bem menos que metade.
