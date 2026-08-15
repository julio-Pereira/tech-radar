---
id: seguranca-e-lgpd
title: "Segurança, governança e LGPD"
summary: "mTLS e ACLs por princípio do menor privilégio, e o conflito central: direito ao esquecimento dentro de um log que existe para ser imutável."
estimatedMinutes: 55
references:
  - title: "Apache Kafka — Security"
    url: https://kafka.apache.org/documentation/#security
  - title: "Apache Kafka — Authorization and ACLs"
    url: https://kafka.apache.org/documentation/#security_authz
  - title: "Lei Geral de Proteção de Dados (Lei 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
---

## As três camadas

Um cluster Kafka sem configuração de segurança aceita qualquer conexão, de qualquer um,
para qualquer tópico. As três camadas são independentes e todas necessárias:

**1. Criptografia em trânsito (TLS).** Sem ela, credencial SASL/PLAIN e conteúdo de
mensagem trafegam em claro. Numa fintech, TLS entre clientes e brokers **e** entre brokers
(`security.inter.broker.protocol`).

**2. Autenticação (quem é você).**

- **mTLS** — o cliente apresenta certificado, e o principal vem do DN. Sem senha para
  rotacionar, ao custo de gerir uma PKI e a revogação.
- **SASL/SCRAM** — usuário e senha com hash, credenciais no próprio cluster. Simples e
  funciona bem; a rotação é sua.
- **SASL/OAUTHBEARER e JWT bearer** — token do provedor de identidade corporativo,
  de vida curta. É o caminho que se alinha com a identidade de workload do marco 10 da
  trilha Kubernetes — mesma ideia: sem segredo de longa duração para vazar.

**3. Autorização (o que você pode).** ACLs por principal, recurso e operação:

```bash
kafka-acls.sh --add \
  --allow-principal User:CN=ledger-consumer \
  --operation Read --topic payments.authorized --group ledger-projector
```

Duas armadilhas de ACL que produzem incidente:

- **Esquecer a ACL do grupo.** `Read` no tópico sem `Read` no `group` faz o consumidor
  falhar de um jeito pouco óbvio. É o erro nº 1 de quem liga ACLs pela primeira vez.
- **`allow.everyone.if.no.acl.found=true`** — o padrão histórico transforma "esqueci de
  criar a ACL" em "todo mundo pode". Numa fintech, isso fica `false`, e a consequência é
  que **toda** integração nova precisa de ACL explícita. É o comportamento desejado.

O princípio é o mesmo do RBAC: um principal por serviço, com as menores permissões que
ainda funcionam, e a prova é a **negação** — testar o que a aplicação não consegue fazer.

## O conflito central: LGPD × log imutável

Aqui está a tensão que dá nome ao marco.

O Kafka é um log **append-only**. Não existe `UPDATE`, não existe `DELETE` por registro.
E a LGPD dá ao titular o direito de solicitar a eliminação dos seus dados pessoais.

As soluções ingênuas não funcionam:

- **Esperar a retenção expirar** — pode ser semanas, e o prazo legal de resposta é menor.
  E não resolve para tópico compactado, que guarda a última versão para sempre.
- **Tombstone + compaction** — enviar `null` para a chave. **Só funciona em tópico
  compactado**, é assíncrono (marco 02), e apaga apenas o registro daquela chave: o CPF que
  aparece dentro de eventos de *outras* chaves continua lá.
- **Reescrever o tópico** — copiar tudo para um tópico novo omitindo os registros do
  titular, e trocar produtores e consumidores. Tecnicamente possível, operacionalmente
  inviável como rotina.

### Crypto-shredding

A resposta que funciona: **não guarde o dado pessoal em claro; guarde-o cifrado com uma
chave por titular, e apague a chave.**

```
evento = { payment_id, account_id, pii_cifrada: enc(K_titular, {cpf, nome}), ... }
```

A chave `K_titular` vive num KMS ou cofre, fora do Kafka. Ao receber o pedido de
eliminação, você **destrói a chave**. O log continua íntegro e imutável — e o conteúdo
pessoal vira bytes irrecuperáveis.

Isso satisfaz os dois lados: o registro contábil permanece (o regulador exige), e o dado
pessoal deixa de ser recuperável (a LGPD exige). É a técnica que reconcilia duas
obrigações que pareciam incompatíveis.

O que ela exige, e não é pouco:

- **Gestão de chaves por titular** — milhões de chaves, com ciclo de vida próprio. É o
  custo real da abordagem.
- **Decidir o que é pessoal no momento do design**, não depois. Cifrar retroativamente
  exige reescrever o log.
- **Consumidores que lidam com a ausência.** Depois do shredding, a decifragem falha — e o
  consumidor precisa tratar isso como estado esperado, não como erro. Um relatório
  histórico passa a mostrar "titular removido" no lugar do nome, e isso é correto.
- **A chave apagada em todos os lugares**, inclusive backups do KMS. Chave num backup é
  dado recuperável.

### Minimização: a defesa mais barata

Antes de qualquer criptografia, a pergunta: **esse campo precisa mesmo estar no evento?**

O antifraude precisa do CPF ou de um identificador estável derivado dele? O consumidor de
liquidação precisa do nome do titular? Quase sempre a resposta é não, e o campo estava ali
porque alguém copiou o objeto de domínio inteiro para dentro do evento.

Dado que não existe no evento não precisa ser cifrado, não precisa ser apagado e não
aparece na DLQ, no data lake, no log do consumidor nem no trace. **A minimização é a única
medida que resolve o problema em todos os lugares de uma vez** — e a mais barata.

## Governança

Segurança técnica sem governança é temporária. Quatro artefatos que sustentam:

- **Catálogo de eventos** — quais tópicos existem, quem é o dono, qual o schema, qual a
  classificação do dado. Sem catálogo, ninguém sabe onde há PII, e o pedido de eliminação
  não tem resposta possível.
- **Ownership explícito** — `CODEOWNERS` no repositório de schemas (marco 07): quem revisa
  mudança de contrato.
- **Classificação de dado** por tópico: público, interno, pessoal, sensível. É o que
  determina retenção, criptografia e quem recebe ACL.
- **Data lineage** — de onde o dado veio e para onde foi. Numa arquitetura de eventos, o
  caminho de um CPF pode passar por seis tópicos e três sinks, e responder "onde está esse
  dado?" exige esse mapa.

## Exemplo numa fintech

**PAN de cartão nunca em claro no evento.** PCI-DSS não é negociável, e a característica
que torna o vazamento caro é a propagação: uma vez que o PAN entrou num tópico, ele está
no log do broker, nas réplicas, nos backups, no data lake do marco 11, na DLQ, e
provavelmente no log de aplicação de dois consumidores. Não há como recolher.

O desenho do `pix-stream`:

- **Tokenização na borda** — o PAN é substituído por um token antes de virar evento. O
  valor real vive num cofre com acesso auditado, e quase nenhum serviço precisa dele.
- **CPF cifrado por chave de titular** onde é indispensável; ausente onde não é.
- **ACLs por tópico e por principal**, com `allow.everyone.if.no.acl.found=false`.
- **Auditoria de quem lê qual tópico** — o `authorizer` loga as decisões, e esse log vai
  para fora do cluster (mesmo raciocínio do audit log do marco 10 da trilha Kubernetes).

## Hands-on

**Desafio — crypto-shredding com prova.** É o desafio de invariante mais direto da trilha:
o critério não é "implemente", é "prove que o dado ficou ilegível".

1. Gere uma chave AES por titular, guardada num cofre local (Vault em modo dev, ou um mapa
   em arquivo — o ponto é a separação, não o produto).
2. Produza 1.000 eventos em `payments.initiated` com o campo `pii` cifrado com a chave do
   respectivo titular.
3. Um consumidor decifra e imprime o CPF de um titular específico — prove que funciona.

**Invariantes testáveis:**

- **Apague a chave** daquele titular. O mesmo consumidor, rodando de novo sobre **as mesmas
  mensagens**, não consegue mais recuperar o CPF — e falha de forma **tratada**, não com
  stack trace.
- Os eventos dos **outros** titulares continuam legíveis. Um teste que afirma os dois lados.
- O tópico não foi alterado: o offset e o conteúdo bruto das mensagens são idênticos antes
  e depois. Compare o hash do payload — é isso que prova que o log continua imutável.
- Um teste que percorre todos os campos em claro do evento e **falha** se encontrar padrão
  de CPF ou PAN.

**Complemento — ACLs e a prova da negação.** Ligue `allow.everyone.if.no.acl.found=false`
e crie um principal por serviço com o mínimo. Escreva um script que afirma, para cada
serviço, **pelo menos três operações que ele não consegue realizar** (escrever no tópico do
outro, ler o tópico de auditoria, criar tópico). E provoque de propósito o erro de esquecer
a ACL de `group` — registre a mensagem de erro, para reconhecê-la no futuro.

**Checagem.** (a) Por que tombstone + compaction não resolve o direito ao esquecimento
sozinho? (b) O que crypto-shredding preserva que a reescrita do tópico destrói? (c) Por que
minimização é mais eficaz que criptografia? (d) `allow.everyone.if.no.acl.found=true` —
qual é o risco concreto?

## Principais aprendizados

- TLS, autenticação (mTLS/SCRAM/OAUTHBEARER) e ACLs são camadas independentes; ACL de
  tópico sem ACL de grupo quebra o consumidor.
- Direito ao esquecimento num log append-only se resolve por crypto-shredding: apaga-se a
  chave, o log permanece íntegro e o conteúdo vira bytes.
- Minimizar PII no evento é a defesa mais barata e a única que vale em todos os lugares por
  onde o dado passaria.
- Sem catálogo, ownership e classificação, não há como responder onde o dado pessoal está —
  e sem isso não há conformidade.
