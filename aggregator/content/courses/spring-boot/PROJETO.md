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
compose — o contrato (`payments.initiated`, chave `accountId`) é o que importa.

## Pré-requisitos

- JDK 21+ e Maven ou Gradle
- Docker (Postgres e Kafka em compose; Testcontainers usa o mesmo daemon)
- ~6 GB de RAM livres
- `curl` ou `httpie`, e um gerador de carga simples para o marco 07
- **Não precisa:** licença comercial, conta em cloud paga, nenhum starter proprietário.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Repo + `POST /payments` retornando 201, com teste | `mvn test` verde e `curl` respondendo |
| 02 | Uma auto-configuração própria, com `@ConditionalOnProperty` | Desligar por propriedade e ver o bean sumir do contexto |
| 03 | Perfis `dev`/`prod`, segredo fora do jar, config externalizada | Subir os dois perfis sem recompilar |
| 04 | Fronteiras de proxy entendidas: `@Transactional` que de fato aplica | Teste que prova que a chamada interna **não** abre transação |
| 05 | Persistência com Postgres, isolamento escolhido e justificado | Teste de concorrência que expõe write skew no nível errado |
| 06 | Idempotência por chave de negócio + tabela de outbox | Requisição repetida não gera segundo pagamento nem segundo evento |
| 07 | Endpoint sob carga com virtual threads, pool dimensionado | Comparação medida: p99 antes e depois, com o mesmo gerador |
| 08 | Circuit breaker, timeout e retry com backoff no cliente do PSP | Injetar 100% de erro no PSP e o serviço não colapsa |
| 09 | OAuth2 resource server no padrão FAPI, escopos por operação | Token sem o escopo certo recebe 403, com teste |
| 10 | Actuator + Micrometer, métricas de negócio e healthcheck honesto | Taxa de autorização exposta; readiness não checa dependência externa |
| 11 | Testes de integração com Testcontainers (Postgres + Kafka) | Suíte roda do zero em máquina limpa, sem serviço pré-instalado |
| 12 | Imagem OCI sem root, deploy com migração expand/contract | Rollback da aplicação funciona com o schema já migrado |
| 13 | Reorganização em módulos, com dependência entre eles testada | Teste de arquitetura falha se um módulo importar o interno do outro |

## Definição de pronto (capstone)

- [ ] `docker compose up` + `mvn spring-boot:run` sobe o serviço em máquina limpa
- [ ] A mesma requisição enviada 100 vezes gera **um** pagamento e **um** evento
- [ ] Nenhum dual-write: o evento sai da outbox, na mesma transação do pagamento
- [ ] Suíte de integração com Testcontainers verde, sem dependência de ambiente
- [ ] Token sem escopo é negado; o teste está no repo
- [ ] Migração de schema compatível com a versão anterior, com rollback exercitado
- [ ] Métricas de negócio no Actuator, e a readiness não derruba tudo quando o PSP cai
- [ ] Uma ADR por bloco: fronteira transacional, idempotência, resiliência, segurança

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Repetir a mesma requisição** 100 vezes em paralelo. Um pagamento ou cem?
2. **Derrubar o Postgres** no meio de uma transação com outbox. Sobrou evento órfão ou
   pagamento sem evento?
3. **Injetar 100% de erro no PSP.** O circuit breaker abriu, ou o pool esgotou primeiro?
4. **Fazer deploy da versão nova** com a migração aplicada e depois **rollback**. A
   versão antiga ainda funciona com o schema novo?
5. **Enviar um token expirado e um sem escopo.** Os dois são negados com o código certo,
   e a negativa aparece em algum log auditável?
