# Projeto guia — pix-gateway

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `pix-gateway` é a porta de entrada: recebe a iniciação de pagamento, garante
> idempotência e publica o fato para o `pix-stream`.

## O que você vai construir

O serviço Java que uma fintech expõe ao mundo: recebe `POST /payments`, valida, persiste,
garante que a mesma requisição repetida não cobra duas vezes, e publica o evento pela
tabela de outbox. Em volta disso, o que separa um serviço de produção de um exemplo de
tutorial: perfis por ambiente, transação com fronteira explícita, resiliência com
circuit breaker, OAuth2 no padrão FAPI, Actuator com métricas de negócio, testes de
integração com Testcontainers e um deploy que sobrevive a rollback.

Se você não fez a trilha de kafka, publique a outbox num tópico de um Kafka local em
container — o contrato (tópico `payments.initiated`, chave = id do pagamento, como o relay
do marco 06 publica) é o que importa.

## Pré-requisitos

- JDK 25 e Maven ou Gradle (JDK 21 funciona com os avisos indicados nos marcos 07 e 12)
- Docker (Testcontainers sobe Postgres e Kafka nos testes; o marco 12 roda a imagem com um
  Postgres em container)
- ~6 GB de RAM livres
- `curl` ou `httpie`, e um gerador de carga simples para o marco 07
- **Não precisa:** licença comercial, conta em cloud paga, nenhum starter proprietário.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Repo + `POST /payments` respondendo `501 Not Implemented`, com teste | `mvn test` verde e `curl` respondendo `501` |
| 02 | Uma auto-configuração própria, com `@ConditionalOnProperty` | Desligar por propriedade e ver o bean sumir do contexto |
| 03 | Perfis `dev`/`prod`, segredo fora do jar, config externalizada | Subir os dois perfis sem recompilar |
| 04 | Fronteiras de proxy entendidas: `@Transactional` que de fato aplica | Teste que prova que a chamada interna **não** abre transação |
| 05 | Persistência com Postgres e Flyway, locking escolhido e justificado | Teste de débito concorrente: metade sucede, metade recebe "saldo insuficiente", saldo final ≥ 0 |
| 06 | Idempotência por chave de negócio + tabela de outbox | Requisição repetida não gera segundo pagamento nem segundo evento |
| 07 | Endpoint de fan-out sob carga, com e sem virtual threads | Tempo total e pico de `hikaricp.connections.pending` medidos nas quatro combinações |
| 08 | Circuit breaker, timeout e retry com backoff no cliente do PSP | Com 100% de erro no PSP, o circuito abre e o fallback responde `202` sem chamar o PSP |
| 09 | OAuth2 resource server no padrão FAPI, escopos por operação | Token sem o escopo certo recebe 403, com teste, e a negativa sai no log `AUDIT` |
| 10 | Actuator + Micrometer, métricas de negócio e healthcheck honesto | `payment_initiate_seconds_*` por PSP e resultado no Prometheus; readiness não checa dependência externa |
| 11 | Testes de integração com Testcontainers (Postgres + Kafka) | Suíte roda do zero em máquina limpa, sem serviço pré-instalado |
| 12 | Imagem OCI sem root, deploy com migração expand/contract | Rollback da aplicação funciona com o schema já migrado |
| 13 | Reorganização em módulos, com dependência entre eles testada | Teste de arquitetura falha se um módulo importar o interno do outro |

## Definição de pronto (capstone)

- [ ] A imagem do marco 12 sobe em máquina limpa com só um Postgres em container
- [ ] A mesma requisição enviada 100 vezes gera **um** pagamento e **um** evento
- [ ] Nenhum dual-write: o evento entra no outbox na mesma transação do pagamento
- [ ] Suíte de integração com Testcontainers verde, sem dependência de ambiente
- [ ] Token sem escopo é negado, o teste está no repo, e a negativa aparece no log `AUDIT`
- [ ] Migração de schema compatível com a versão anterior, com rollback exercitado
- [ ] Métricas de negócio no Actuator, e a readiness não derruba tudo quando o PSP cai
- [ ] Uma ADR por bloco: fronteira transacional, idempotência, resiliência, segurança

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Repetir a mesma requisição** 100 vezes em paralelo. Um pagamento ou cem?
2. **Derrubar o Postgres** no meio de uma transação com outbox. Sobrou evento órfão ou
   pagamento sem evento?
3. **Injetar 100% de erro no PSP.** O circuito abriu? Depois de aberto, quantas chamadas
   novas chegaram ao PSP, e o cliente recebeu `202` ou erro?
4. **Fazer deploy da versão nova** com a migração aplicada e depois **rollback**. A
   versão antiga ainda funciona com o schema novo?
5. **Enviar um token expirado e um sem escopo.** Os dois são negados com o código certo
   (`401` e `403`), e cada negativa aparece no log `AUDIT` com o id de correlação?
