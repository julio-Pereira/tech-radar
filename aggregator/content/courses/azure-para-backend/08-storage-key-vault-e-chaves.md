---
id: storage-key-vault-e-chaves
title: "Storage, Key Vault e chaves"
summary: "O vazamento clássico do Azure não é o contêiner público: é a chave da conta de storage, ou uma SAS longa, que dá acesso total e não passa pelo RBAC. Shared key desligada, SAS de delegação de usuário (até 7 dias), redundância e residência, imutabilidade travada para a SEC 17a-4, Key Vault × Managed HSM, soft delete e purge protection, CMK e o que acontece quando ela é revogada, envelope encryption — medido: no Azurite, o objeto cifrado não tem o CPF, e o AAD errado não abre."
estimatedMinutes: 55
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [seguranca, dados]
references:
  - title: "Azure Storage — Create a user delegation SAS"
    url: https://learn.microsoft.com/rest/api/storageservices/create-user-delegation-sas
  - title: "Azure Storage — Immutable storage for blob data"
    url: https://learn.microsoft.com/azure/storage/blobs/immutable-storage-overview
  - title: "Azure Key Vault — Soft-delete overview"
    url: https://learn.microsoft.com/azure/key-vault/general/soft-delete-overview
  - title: "Azure Key Vault — Managed HSM overview"
    url: https://learn.microsoft.com/azure/key-vault/managed-hsm/overview
---

## O vazamento é a chave, não o contêiner

O contêiner público é o vazamento que todo mundo conhece, e o Azure já o desliga com o `allow nested items to be
public`. O vazamento clássico do Azure é outro: a **chave da conta de storage**. Ela dá acesso total à conta, por
fora do RBAC, a quem a tiver. E quem tem papel de controle sobre a conta lista as chaves (o `listkeys` do marco 02).
Uma **SAS** (*shared access signature*) assinada com essa chave, com prazo de um ano, é a mesma coisa, num *link*.

## Storage: desligar a chave

Conferido em 12 nov 2026:

- com `shared access key` **desligada**, toda requisição, inclusive SAS, precisa ser autorizada pelo **Entra ID**.
  O valor padrão do campo é nulo, o que **equivale a ligada**: desligar é uma decisão explícita;
- a **SAS de delegação de usuário** é assinada com uma chave obtida pelo Entra ID, e não com a chave da conta. Ela
  vale **no máximo 7 dias**, qualquer que seja a política de expiração configurada. A SAS de conta, assinada com a
  chave, deixa de existir quando a *shared key* é desligada;
- o TLS mínimo recomendado é o **1.2**, e há uma política interna do Azure Policy que o exige.

A conta com dado classificado tem também o acesso de rede público desligado e um Private Endpoint (marco 03).

**Redundância e residência.** LRS (três cópias numa zona), ZRS (três zonas da região), GRS e GZRS (com cópia no
**par de regiões**). Para a conta no Brazil South, o GRS e o GZRS levam a cópia para o South Central US (marco 01).
Dado classificado fica em ZRS, ou em GRS com ADR de residência.

**Retenção.** O versionamento e o *soft delete* protegem do erro. Para a **retenção regulatória**, a imutabilidade
(WORM). Conferido em 12 nov 2026:

- a **retenção por tempo** existe na conta, no contêiner ou na versão;
- **só a política travada** (*locked*) deixa o *blob* no estado que atende a **SEC 17a-4(f)**. A destravada serve
  para teste: pode ser encurtada ou apagada. A travada não pode ser apagada nem encurtada, só estendida (até cinco
  vezes no contêiner). A orientação da Microsoft é travar em cerca de 24 horas;
- a ***legal hold*** não tem prazo e dura até ser retirada.

A política de retenção do dado, com o prazo que a área de *compliance* define, é de `dados-distribuidos/13`.

## Key Vault e Managed HSM

| | Key Vault (Standard / Premium) | Managed HSM |
| --- | --- | --- |
| O que é | cofre multilocatário de chaves, segredos e certificados | HSM dedicado, de um locatário só, só para chaves |
| Validação | Standard: FIPS 140-2 nível 1; Premium: FIPS 140-3 nível 3, com chaves em HSM | FIPS 140-3 nível 3 |
| Quando | segredos, certificados e a maioria das CMKs | exigência regulatória de HSM dedicado, controle total do domínio de segurança |

Conferido em 12 nov 2026:

- **modelo de permissão.** O vault usa **RBAC** (papéis de dados como `Key Vault Secrets User` e `Key Vault Crypto
  User`) ou as *access policies* do modelo legado. O RBAC é o que entra no avaliador do marco 02 e no menor escopo;
- ***soft delete*.** Fica ligado, com retenção **de 7 a 90 dias** (90 por padrão), e a retenção não muda depois de
  salva;
- ***purge protection*.** É **opcional e vem desligada**. Ligada, ninguém, nem o administrador, apaga de vez o
  vault ou a chave antes do fim da retenção. Ligar não tem volta.

Sem *purge protection*, quem tem papel no vault apaga a CMK e a purga. Todo dado cifrado com ela fica ilegível.

**A operação permitida da chave.** A chave tem uma lista de operações (`wrapKey`, `unwrapKey`, `encrypt`, `decrypt`,
`sign`). A chave de envelope só precisa de `wrapKey` e `unwrapKey`, e o resto fica fora. É o menor privilégio no
nível da própria chave.

## CMK, e o que acontece quando ela some

Com **CMK** (*customer-managed key*), o Storage, o Cosmos e o Postgres cifram com uma chave sua, no Key Vault. A
identidade do serviço precisa do papel na chave. Conferido em 12 nov 2026, quando a chave é revogada, desligada ou
fica inalcançável:

- o **Storage** responde **403**. O dado continua cifrado e intacto, mas inacessível até a chave voltar;
- o **Cosmos DB** entra em estado de **revogação**, só com as operações de atualizar a identidade ou apagar a conta.
  Depois da correção, pode levar até uma hora para sair;
- o **Postgres Flexible Server** fica **inacessível**, em geral em até 60 minutos, e pode levar outros 60 para
  voltar.

Por isso a CMK tem *purge protection*, alarme de acesso e um teste de restauração.

## *Envelope encryption* na aplicação

Para o dado que a aplicação cifra antes de gravar (o arquivo de conciliação com CPF), o padrão é o envelope de
`seguranca-aplicacao/09`:

1. gerar uma chave de dados local e cifrar o arquivo com AES-GCM, com um **AAD** (dado autenticado) que diz o
   serviço e o arquivo;
2. **embrulhar** a chave de dados com a chave mestra do Key Vault (`wrapKey`) e descartar a chave em claro;
3. guardar o arquivo cifrado com a chave embrulhada ao lado;
4. para ler, desembrulhar (`unwrapKey`), que só funciona com o papel no vault, e abrir com o mesmo AAD.

O AAD errado não abre: o arquivo cifrado para a conciliação não abre no contexto de outro serviço, mesmo com a chave
certa.

**Segredos em execução.** O segredo é lido do Key Vault em tempo de execução. No Container Apps e no Functions, as
***Key Vault references*** trazem o segredo pela identidade do app, sem ele aparecer no código nem na imagem. O
**App Configuration** guarda a configuração que não é segredo, com referência ao Key Vault para o que é. O ciclo de
vida de segredos e chaves é de `seguranca-aplicacao/10`.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| S3 *Block Public Access* | acesso público desligado + **shared key desligada** | no Azure, a chave da conta é o vazamento que o RBAC não pega |
| URL pré-assinada por papel | SAS de delegação de usuário | até 7 dias, assinada pelo Entra ID |
| S3 Object Lock *compliance* | imutabilidade com a política **travada** | só a travada atende a SEC 17a-4 |
| KMS | Key Vault (Premium) / Managed HSM | a *purge protection* vem desligada |
| Secrets Manager | Key Vault (segredos) | a leitura em execução vem pelas *Key Vault references* |
| Parameter Store | App Configuration | com referência ao Key Vault para segredo |

O marco gêmeo é `aws-para-backend/08`.

> **Armadilha.** `Owner` na conta de storage lista as chaves e lê tudo. O RBAC de dados não protege nada enquanto a
> *shared key* continuar ligada.

> **O que o emulador não reproduz.** O Azurite aceita a chave padrão de desenvolvimento e não aplica RBAC, Private
> Endpoint nem imutabilidade. O Lowkey Vault é um dublê de teste, não um Key Vault: ele não reproduz o RBAC, a
> *purge protection* nem a CMK de outros serviços, e no laboratório ele exigiu a operação `decrypt` para o
> `unwrapKey`, o que o Key Vault não faz. As regras sobre o código provam a configuração; o comportamento da CMK
> revogada, só uma assinatura mostra.

## Exemplo numa fintech

Os arquivos de conciliação, com CPF, ficavam numa conta de storage com o acesso público desligado. Um *script* de
integração com o parceiro de contabilidade usava uma **SAS de conta**, assinada com a chave, válida por um ano e
colada num arquivo de configuração. O arquivo vazou num repositório. A SAS dava leitura de toda a conta, e a única
forma de cortá-la era girar a chave, o que derrubou outros três serviços que também usavam a chave. A correção:

- a *shared key* foi desligada;
- o parceiro passou a receber SAS de delegação de usuário, de horas, gerada por uma identidade que só lê o prefixo
  dele;
- o contêiner regulatório ganhou imutabilidade travada de 5 anos;
- uma regra sobre o código reprova a conta classificada com *shared key*.

## Hands-on

**Tutorial.** No `lab/`, com o Azurite e o Lowkey Vault, escreva o adaptador de envelope do `ledger-core` em Go
(`azkeys` e `azblob` 1.8.3): a chave de dados local, o AES-GCM com AAD e o `wrapKey` na chave mestra.

**Desafio.** O armazenamento de conciliação e os segredos do `fin-azure`, com as regras sobre o código em
`politicas/chaves.rego`.

**Invariantes testáveis**

1. **Storage classificado fechado.** Toda conta com dado classificado tem *shared key* desligada, acesso público
   desligado (de *blob* e de rede), TLS 1.2 e imutabilidade **travada** no contêiner regulatório.
2. **Residência.** Dado classificado em redundância sem cópia geográfica, ou com ADR de residência.
3. **Vault com dono.** Todo Key Vault usa RBAC e tem *purge protection*. A identidade da aplicação só tem papéis de uso
   (`Key Vault Secrets User`, `Key Vault Crypto User`) no vault do serviço.

   Medido: o código bom passou nas 6 regras. A *fixture* ruim foi reprovada em **7 achados**:
   - a imutabilidade destravada;
   - o vault sem *purge protection* e sem RBAC;
   - a aplicação com `Key Vault Administrator`;
   - o TLS 1.0;
   - o GRS sem ADR;
   - a *shared key* ligada.
4. **Envelope.** Medido com o Azurite e o Lowkey Vault:
   - o objeto gravado **não contém o CPF**;
   - o AAD certo abre;
   - o AAD de outro arquivo, o de outro serviço e a ausência de AAD dão **`InvalidTag`**.

   A chave mestra foi criada só com as operações de embrulho; sem elas, o Lowkey Vault recusou a operação.
5. **Segredo fora do código.** Nenhum segredo na imagem nem no código de infraestrutura (varredura), e a leitura em
   execução é pela identidade.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, crie uma conta com CMK no Key Vault,
desligue a chave e meça quanto tempo a conta leva para responder 403, e quanto leva para voltar depois de religar.
Destrua tudo no fim.

**Checagem**

1. Por que a *shared key* ligada anula o RBAC de dados?
2. Qual a diferença entre a SAS de conta e a SAS de delegação de usuário?
3. O que a *purge protection* impede, e por que ela importa para a CMK?
4. O que acontece com o Storage, o Cosmos e o Postgres quando a CMK é revogada?

## Principais aprendizados

- O vazamento do Azure é a chave da conta e a SAS longa. *Shared key* desligada, explicitamente: o padrão equivale a
  ligada.
- SAS de delegação de usuário, de no máximo 7 dias, pelo Entra ID.
- GRS e GZRS levam a cópia para o par; o do Brazil South está nos Estados Unidos.
- Só a imutabilidade travada atende a SEC 17a-4.
- Key Vault com RBAC, *soft delete* de 7 a 90 dias e *purge protection*, que vem desligada e não tem volta.
- CMK revogada: 403 no Storage, revogação no Cosmos, inacessível no Postgres. Envelope medido: sem o CPF, e o AAD
  errado não abre.
