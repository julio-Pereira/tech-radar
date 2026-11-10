---
id: s3-kms-e-segredos
title: "S3, KMS e segredos"
summary: "O vazamento clássico de nuvem é um bucket aberto; o clássico de fintech é a chave sem dono e sem rotação. Block Public Access em duas camadas, criptografia envelope com KMS e contexto de criptografia (medido: o contexto errado não abre o objeto), política de chave com dono, rotação de 90 a 2.560 dias, Object Lock para o que não pode ser apagado, Secrets Manager × Parameter Store, URL pré-assinada com prazo curto — e a política que reprova o plano do bucket classificado sem nada disso (medido: 3 regras)."
estimatedMinutes: 55
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [seguranca, dados]
references:
  - title: "Amazon S3 — Blocking public access to your Amazon S3 storage"
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
  - title: "AWS KMS — Encryption context"
    url: https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html
  - title: "AWS KMS — Rotate AWS KMS keys"
    url: https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html
  - title: "Amazon S3 — Locking objects with Object Lock"
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
  - title: "Amazon S3 — Download and upload objects with presigned URLs"
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
---

## Dois vazamentos clássicos

O vazamento clássico de nuvem é um ***bucket* aberto**: um extrato, um arquivo de liquidação ou um
*dump* de banco lido por qualquer um que tenha a URL. O clássico de fintech é mais silencioso: a
**chave sem dono**. Ela tem uma política que deixa qualquer papel da conta decifrar, nenhuma rotação e
ninguém que saiba dizer quem a usa.

Este marco trata das duas coisas na AWS. A criptografia em si (AEAD, envelope, o que não inventar) é de
`seguranca-aplicacao/09`, e o ciclo de vida de segredos e chaves é de `seguranca-aplicacao/10`.

## S3: o que mudou, e o que continua seu

Três fatos de comportamento, conferidos em 10 nov 2026:

- **Consistência forte** de leitura depois de escrita, em toda operação, desde dez 2020. Não há mais
  "esperar o objeto aparecer".
- **Criptografia padrão** com SSE-S3 em todo objeto novo, desde jan 2023. Ela protege contra o disco
  roubado, não contra um papel com permissão de leitura.
- ***Block Public Access* ligado e ACLs desligadas** por padrão em *bucket* novo, desde abr 2023.

O padrão bom não protege o *bucket* antigo, nem o que alguém criou com o padrão desligado. O ***Block Public
Access*** tem quatro chaves (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`,
`RestrictPublicBuckets`) e existe em **duas camadas**:

- na **conta**, valendo para todo *bucket* dela;
- em cada ***bucket***.

O mais restritivo vence. Com as quatro ligadas na conta, nenhuma política de *bucket* consegue torná-lo
público. Numa organização (marco 01), uma SCP impede que alguém desligue isso.

**Dado classificado pede mais que o padrão:**

- SSE-KMS com **chave do cliente**, para que a leitura dependa também da política da chave;
- uma política de *bucket* que **nega acesso sem TLS** (`aws:SecureTransport` falso);
- versionamento, para que uma sobrescrita não apague o anterior.

## KMS e criptografia envelope

O KMS não cifra o seu arquivo de 2 GB. Ele cifra uma **chave de dados**. O padrão é a **criptografia
envelope**:

1. a aplicação pede `GenerateDataKey` ao KMS e recebe a chave de dados em claro e cifrada;
2. cifra o objeto localmente, com AES-GCM, usando a chave em claro, e descarta essa chave da memória;
3. guarda o objeto cifrado com a chave de dados **cifrada** ao lado;
4. para ler, manda a chave cifrada para `Decrypt` no KMS, que só responde se a política deixar.

A chave mestra nunca sai do KMS, e cada chamada de `Decrypt` fica no CloudTrail. O SSE-KMS do S3 faz isso
por você, por objeto.

**Contexto de criptografia.** Toda chamada de cifragem pode levar um **contexto**, um mapa de pares
chave-valor não secretos, como `servico=ledger-core`. Ele entra como dado autenticado: para decifrar, é
preciso apresentar exatamente o mesmo contexto. Medido no `moto` 5.2.5, com envelope e AES-GCM:

| Tentativa de decifrar | Resultado |
| --- | --- |
| com o contexto certo | abriu |
| com o contexto errado | `InvalidCiphertextException` |
| sem contexto | `InvalidCiphertextException` |

O objeto guardado não continha o texto em claro em nenhum *byte*. O contexto tem dois usos:

- fica no CloudTrail, e diz **para quê** a chave foi usada;
- vira **condição na política** (`kms:EncryptionContext:servico`). Um papel autorizado a decifrar
  extratos não decifra, com a mesma chave, o que foi cifrado para outro serviço.

## A chave com dono

A **política de chave** é o primeiro filtro do KMS: sem ela permitir, nenhuma política de IAM basta. Uma
chave com dono tem:

- **administração separada do uso.** O papel `kms-admin` gerencia a chave (`kms:*`), mas não é o papel da
  aplicação;
- **uso restrito por contexto.** Os papéis de serviço têm só `kms:Encrypt`, `kms:Decrypt` e
  `kms:GenerateDataKey*`, com a condição do contexto de criptografia;
- **rotação ligada.**

A **rotação automática**, conferida em 10 nov 2026, roda a cada **365 dias** por padrão. O período é
configurável de **90 a 2.560 dias** desde abr 2024, e existe a rotação **sob demanda**. Ela vale para chaves
simétricas com material gerado pelo KMS. A rotação troca o material novo para cifrar e mantém os
antigos para decifrar o que já existe, então nada precisa ser recifrado. Cada rotação acrescenta US$ 1 por
mês à chave, até a segunda; as seguintes não somam.

Apagar uma chave tem **espera obrigatória** (de 7 a 30 dias). Depois disso, todo dado cifrado com ela está
perdido. O alarme sobre `ScheduleKeyDeletion` é o de `seguranca-aplicacao/10`.

## O que não pode ser apagado: Object Lock

O arquivo da conciliação (`ledger-e-contabilidade/08`) e a trilha de auditoria precisam de **retenção que
nem o administrador desfaz**. O **Object Lock** do S3, com versionamento, tem dois modos:

- **governança:** quem tem `s3:BypassGovernanceRetention`, e manda o cabeçalho de *bypass*, pode apagar ou
  encurtar a retenção. Serve para testar e para proteger de erro;
- ***compliance*:** **nenhum usuário**, nem o *root* da conta, apaga a versão ou encurta a retenção até ela
  vencer. O modo não muda depois.

A **retenção legal** (*legal hold*) é separada: trava a versão sem prazo, até alguém tirar. Antes de
ligar o modo *compliance* num *bucket* de produção, teste em governança. Um prazo errado no *compliance*
não tem volta, e o armazenamento é cobrado até o fim dele. A política de retenção vem de
`dados-distribuidos/13`.

## Segredos: Secrets Manager × Parameter Store

| | Secrets Manager | Parameter Store |
| --- | --- | --- |
| Para quê | segredo com rotação: senha de banco, credencial de parceiro | configuração, e segredo simples (`SecureString`, cifrado com KMS) |
| Rotação | nativa, com função de rotação; integrada ao RDS | não tem; é sua |
| Preço (conferido em 10 nov 2026) | US$ 0,40 por segredo por mês + US$ 0,05 por 10.000 chamadas | padrão sem custo; avançado US$ 0,05 por parâmetro por mês |
| Entre contas | política de recurso no segredo | parâmetro avançado compartilhável |

A aplicação **não lê segredo de variável de ambiente fixada no *deploy***, a não ser que a plataforma a
injete a partir do gerenciador. O ECS faz isso (`secrets` na definição da tarefa), e no EKS o caminho é o
*driver* CSI de segredos. O fator III dos *twelve-factor* pede configuração no ambiente. Um segredo
copiado no Terraform, no *state* ou no repositório não é configuração: é vazamento. O *state* que guarda
segredo é o problema de `terraform-e-iac/03`.

**Rotação de senha de banco** sem queda pede duas versões válidas ao mesmo tempo. A estratégia de usuário
alternado do Secrets Manager faz isso. A aplicação relê o segredo quando a conexão falha por autenticação,
em vez de guardá-lo para sempre na memória.

## URL pré-assinada

Para o cliente baixar o próprio extrato sem passar pelo serviço, a URL **pré-assinada** carrega uma
assinatura com as credenciais de quem a gerou. Conferido em 10 nov 2026:

- assinada com credencial de **usuário IAM** (SigV4), vale **até 7 dias**;
- assinada com credencial **temporária** (um papel), **expira junto com a credencial**, o que vier
  primeiro.

O que vale para o desenho:

- a URL é um **portador**: qualquer um que a tenha baixa o objeto até ela expirar. Prazo de minutos, não
  de dias;
- a permissão é a de **quem assinou**. Quem gera a URL deve ser um papel que só lê o prefixo do cliente;
- ela vai para o *log* do *proxy*, para o histórico do navegador e para o encaminhamento por *e-mail*.
  Nunca a registre inteira.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Blob Storage, com acesso público desligado na conta de armazenamento | S3 com *Block Public Access* na conta e no *bucket* | na AWS, a conta inteira trava todo *bucket*; a SCP impede desfazer |
| Key Vault (chaves) | KMS | o KMS tem política de chave como filtro obrigatório e contexto de criptografia como condição |
| Key Vault (segredos) | Secrets Manager ou Parameter Store | a rotação nativa existe no Secrets Manager; o Parameter Store é configuração |
| Armazenamento imutável (WORM) | Object Lock (governança ou *compliance*) | o modo *compliance* trava até o *root* |
| SAS (*shared access signature*) | URL pré-assinada | a SAS de delegação de usuário, assinada com credencial do Entra ID, é a parente da pré-assinada por papel |

> **O que o emulador não reproduz.** O `moto` cifra de verdade e exige o contexto de criptografia, mas não
> avalia a política de chave nas chamadas. A prova de "o papel X não decifra" é feita sobre o plano, não
> sobre o emulador. Ele também não reproduz o CloudTrail, a rotação no tempo, a espera de exclusão
> da chave nem a retenção do Object Lock no modo *compliance*.

## Exemplo numa fintech

O serviço de extratos gravava os PDFs num *bucket* com SSE-KMS, usando uma chave compartilhada. Para
"simplificar", a política da chave dava `kms:*` ao papel de cada aplicação. Um serviço de relatórios, com
um papel que lia o *bucket* de extratos para contar arquivos, passou a decifrar o conteúdo e gravar trechos
num *data lake* sem classificação. A auditoria só achou porque o CloudTrail mostrava `Decrypt` de um
serviço que não tinha nada a ver com extratos. A correção:

- a chave ganhou dono (o papel `kms-admin`);
- os serviços passaram a ter só cifrar e decifrar, com a condição `kms:EncryptionContext:servico`;
- o serviço de extratos passou a cifrar com `servico=extratos`;
- uma política sobre o plano barra a volta do `kms:*`.

## Hands-on

**Tutorial.** No `lab/`, com o `moto` no *compose*, escreva em Go (AWS SDK for Go v2, `service/kms`) o
adaptador de criptografia envelope do `ledger-core`: `GenerateDataKey` com contexto, AES-GCM local, e o
objeto gravado com a chave cifrada ao lado. Leia de volta com o contexto certo e com um errado.

**Desafio.** O *bucket* de extratos e a chave dele, provados sobre o plano. O Terraform do módulo tem sete
recursos (conta, *bucket*, BPA, criptografia, política de *bucket*, chave e política de chave), e as regras
ficam em `politicas/dados.rego`.

**Invariantes testáveis**

1. **Nenhum *bucket* público.** O plano tem o *Block Public Access* da conta com as quatro chaves ligadas, e
   cada *bucket* tem o seu. A *fixture* sem eles é reprovada.
2. ***Bucket* classificado, chave do cliente e TLS.** Todo *bucket* com `data-classification` confidencial
   ou restrito tem SSE-KMS com chave do cliente e uma política que nega acesso sem TLS. Medido: a *fixture*
   `extratos` sem os dois, e sem o BPA do *bucket*, foi reprovada em 3 regras.
3. **A chave tem dono.** Na política de chave, `kms:*` só vai para o papel `kms-admin`. Todo outro principal
   tem a condição `kms:EncryptionContext:servico`. Medido: a mutação com o papel da aplicação recebendo
   `kms:*` sem condição foi reprovada nas duas regras de KMS.
4. **Contexto obrigatório.** O teste do adaptador decifra com o contexto certo e recebe
   `InvalidCiphertextException` com o errado e sem nenhum. O objeto guardado não contém o texto em claro.
5. **Nenhum segredo no plano.** Nenhum valor de segredo aparece no plano nem no *state*. A senha do banco
   vem do Secrets Manager por referência (`manage_master_user_password`), e a regra reprova a *fixture* com
   `password` literal.

**Complemento.** Com uma conta real e orçamento criado antes, crie a chave e o *bucket* do desafio, ligue a
rotação com período de 90 dias e confira o `Decrypt` e o contexto no CloudTrail. Gere uma URL pré-assinada
com um papel de 15 minutos e confirme o 403 depois. Agende a exclusão da chave com 7 dias e destrua o
resto.

**Checagem**

1. Por que a criptografia padrão do S3 não protege contra um papel com permissão de leitura?
2. O que a criptografia envelope tira do KMS, e o que ela deixa nele?
3. Para que serve o contexto de criptografia, além da auditoria?
4. Quando governança, quando *compliance*, no Object Lock?
5. Quando Secrets Manager, quando Parameter Store?
6. Por que uma URL pré-assinada precisa de prazo curto e de um papel de quem assina com pouco acesso?

## Principais aprendizados

- *Block Public Access* em duas camadas, a conta e o *bucket*. O mais restritivo vence, e a SCP impede
  desfazer.
- A criptografia padrão protege o disco. O dado classificado pede SSE-KMS com chave do cliente e TLS
  obrigatório.
- Envelope: o KMS cifra a chave de dados, e a chave mestra nunca sai dele. O contexto de criptografia
  é autenticado (medido) e vira condição na política.
- Chave com dono: administração separada do uso, contexto obrigatório e rotação de 90 a 2.560 dias.
- Object Lock *compliance* trava até o *root*; teste em governança antes.
- Secrets Manager para segredo com rotação, Parameter Store para configuração. Nenhum segredo no
  *state*. URL pré-assinada com prazo curto, expirando com a credencial de quem assinou.
