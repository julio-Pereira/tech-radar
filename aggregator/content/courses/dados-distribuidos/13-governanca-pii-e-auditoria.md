---
id: governanca-e-pii
title: "Governança do dado: PII, criptografia e auditoria"
summary: "Classificação antes de controle, as três camadas de criptografia e o que cada uma não protege, tokenização de PAN, e a retenção regulatória contra o direito ao esquecimento."
estimatedMinutes: 50
references:
  - title: "PCI Security Standards Council — PCI DSS"
    url: https://www.pcisecuritystandards.org/standards/pci-dss/
  - title: "PostgreSQL — pgcrypto"
    url: https://www.postgresql.org/docs/current/pgcrypto.html
  - title: "PGAudit — Open Source PostgreSQL Audit Logging"
    url: https://www.pgaudit.org/
---

## Classificar antes de controlar

Sem classificação, "criptografe tudo" vira teatro caro: latência em toda leitura, chaves em todo
lugar, e nenhuma clareza sobre o que realmente está protegido. A classificação é o pré-requisito
de qualquer controle, e ela é uma tabela pequena:

| Classe | Exemplo no `fin-platform` | Controle mínimo |
| --- | --- | --- |
| Público | tarifas, catálogo de bancos | nenhum |
| Interno | volume agregado, métricas de negócio | acesso autenticado |
| Pessoal | nome, CPF, endereço, telefone | criptografia em coluna, acesso auditado |
| Sensível | biometria, dado de saúde | idem, com acesso justificado caso a caso |
| PCI | PAN, dados de cartão | tokenização — não guardar |

Toda coluna do `fin-store` recebe uma classe, e a classe determina o controle. É o inventário que
torna possível responder à pergunta que o regulador faz e que a maioria dos times não sabe
responder: **onde exatamente está o CPF do cliente?** A resposta correta não é "no banco" — é uma
lista de tabelas, colunas, cópias, backups, logs e ambientes.

## As três camadas de criptografia

**Em trânsito (TLS).** Protege contra quem está na rede. Resolvido e obrigatório, inclusive entre
a aplicação e o banco — o `sslmode=require` que muita configuração interna ainda não tem.

**Em repouso (disco, tablespace).** Protege contra o disco que sai do datacenter e contra o
snapshot vazado. **Não protege** contra quem tem acesso ao banco: para uma conexão autenticada, o
dado vem em claro, porque a descriptografia é transparente. É a camada mais fácil de ativar, e é a
que dá a falsa sensação de "estamos criptografados".

**Em coluna (aplicação ou `pgcrypto`).** Protege de verdade contra o dump vazado e contra o acesso
indevido ao banco, porque o dado só é legível por quem tem a chave. O preço é real e precisa ser
conhecido antes: **não dá para indexar, comparar por igualdade nem ordenar** o valor cifrado. Se
você precisa buscar por CPF, a saída é um índice sobre o **hash** determinístico (com sal por
aplicação, guardado à parte) e a coluna cifrada para a leitura.

O problema real, em todas as camadas, não é criptografar — é **gerenciar a chave**: onde ela vive,
quem a acessa, como é rotacionada, e o que acontece com o dado antigo depois da rotação. Chave no
mesmo banco que o dado cifrado é a versão criptográfica de deixar a chave debaixo do tapete.

## Tokenização: não guardar é a melhor proteção

Para PAN, a resposta não é criptografar melhor: é **não ter**. O número do cartão vai para um
cofre — provedor de tokenização ou serviço isolado com escopo PCI próprio — e o `fin-store` guarda
apenas o token, que não tem valor fora dali.

O ganho não é só de segurança: é de **escopo de auditoria**. Todo sistema que toca PAN entra no
escopo PCI-DSS, com todos os controles que isso implica. Concentrar o PAN num componente reduz o
escopo a ele — e essa redução é o argumento que convence a diretoria, porque tem custo em reais.

A armadilha é reconstituir o risco por acidente: guardar o token e também bandeira, últimos quatro
dígitos, validade e nome do portador. Cada campo isolado é permitido; o conjunto identifica. A
regra é a mesma da minimização de `arquitetura-eventos/05` — guarde o que a função exige, não o que
"pode ser útil".

## O dump de produção em homologação

É o incidente de LGPD mais comum e o mais evitável. Alguém precisa reproduzir um bug com dado
real, copia a base para homologação, e agora existem milhões de CPFs num ambiente com controle de
acesso frouxo, backup próprio e retenção que ninguém acompanha.

A correção é fazer da anonimização **parte do pipeline**, não um favor pedido ao time de dados:

- **Mascarar** o que precisa manter formato: CPF válido gerado, cartão de teste, e-mail de domínio
  interno.
- **Substituir** o que só precisa existir: nome, endereço, telefone.
- **Preservar** distribuição e relacionamentos, senão o ambiente não serve para testar — valores
  monetários com a mesma faixa, datas com a mesma dispersão, chaves estrangeiras íntegras.
- **Gerar sintético** para o que não precisa vir de produção, que costuma ser mais do que parece.

E a verificação que fecha: um teste que injeta um CPF conhecido em produção-simulada, roda o
pipeline e falha se ele aparecer do outro lado. Sem esse teste, a anonimização é uma intenção.

## Retenção contra direito ao esquecimento

A tensão é real e não se resolve com uma escolha: a regulação financeira exige guardar registros
transacionais por cinco anos, e a LGPD dá ao titular o direito de solicitar a exclusão dos seus
dados pessoais.

A saída é separar o que a lei exige de cada lado. O **registro contábil** — valor, data,
contraparte, identificador — é obrigação legal e permanece. O **dado pessoal identificável** ligado
a ele pode ser removido ou tornado irrecuperável, mantendo o registro íntegro e anônimo.

O mecanismo que operacionaliza isso é o **crypto-shredding**: os dados pessoais são cifrados com
uma chave por titular; apagar a chave torna aquele conteúdo irrecuperável em todos os lugares onde
ele existe — inclusive nos backups, onde um `DELETE` jamais chegaria.

> **Reencontro — o triângulo se fecha.** `kafka/13` aplicou crypto-shredding ao dado no broker,
> `observabilidade/17` tratou de redaction na telemetria, e `arquitetura-eventos/05` da minimização
> no contrato do evento. O mesmo dado pessoal está nos três lugares **e no banco**. Uma solicitação
> de exclusão que só apaga a linha da tabela deixa o CPF vivo no tópico, no trace e no backup.

E o cuidado prático: crypto-shredding exige inventário. Se a chave do titular também protegia algo
que precisa sobreviver, apagá-la destrói o que não devia — e isso só se descobre depois.

## Auditoria de acesso ao dado

A pergunta do regulador é direta: **quem consultou a conta desse cliente, e por quê?** Responder
exige registro de acesso, não só de alteração.

O que colocar em prática, em ordem de valor:

1. **Acesso de aplicação com identidade propagada.** Se todo acesso chega ao banco como o mesmo
   usuário técnico, a auditoria mostra que "a aplicação leu" — informação inútil. O identificador
   de quem pediu precisa chegar ao registro.
2. **`pgaudit`** para registrar comandos por classe, com atenção ao volume: auditar todo `SELECT`
   de um banco transacional gera mais log que dado.
3. **Acesso humano just-in-time.** DBA com acesso permanente e irrestrito é o maior risco de
   vazamento de uma fintech. O modelo defensável é acesso temporário, aprovado, com escopo e
   registro — e o acesso de emergência existe, com aprovação posterior obrigatória.
4. **Alerta sobre padrão, não sobre evento.** Um `SELECT` numa conta é rotina; quinhentos por um
   analista às 2h da manhã é o que precisa acordar alguém.

## Exemplo numa fintech

O que o regulador pede como evidência de controle de acesso a dado de cliente, e como gerar isso
a partir do que já existe:

| Evidência pedida | Como o `fin-store` produz |
| --- | --- |
| Inventário de dado pessoal | classificação por coluna, versionada com o schema |
| Quem tem acesso e a que | roles do banco, revisadas trimestralmente, com aprovação registrada |
| Registro de acessos | `pgaudit` nas tabelas de classe pessoal, com identidade propagada |
| Comprovação de anonimização | relatório do pipeline, com o teste de injeção de PII |
| Atendimento a exclusão | log de chaves destruídas, com data e solicitação de origem |

O ponto que economiza meses: **quase toda essa evidência é subproduto de controles que existem por
outra razão**. Se a classificação está no schema, o inventário é gerado. Se o acesso é
just-in-time, o registro já existe. Governança montada como relatório manual para a auditoria dura
até a segunda auditoria.

## Hands-on

**Desafio — pipeline de anonimização com prova.** Construa o processo que gera a cópia de
homologação do `fin-store`:

1. Classifique cada coluna das tabelas principais — a saída é um arquivo versionado junto do
   schema.
2. Implemente o pipeline: máscara para o que precisa manter formato, substituição para o resto,
   preservando distribuição de valores e integridade referencial.
3. Escreva o **teste de injeção**: insira um CPF e um e-mail conhecidos na origem, rode o
   pipeline, e falhe se qualquer um deles aparecer no destino — inclusive em colunas de texto
   livre, `jsonb` e logs gerados durante o processo.
4. Meça o tempo do pipeline sobre um volume realista. Se ele não cabe na janela, ninguém vai usá-lo
   — e a base virará cópia direta de novo.

**Invariantes testáveis**

1. Nenhum CPF, e-mail ou telefone real existe fora de produção — provado pelo teste de injeção.
2. Toda coluna tem classe atribuída, e a classificação é versionada junto do schema.
3. Nenhuma chave de criptografia vive no mesmo banco que o dado que ela protege.
4. Uma solicitação de exclusão é atendida em todos os lugares onde o dado pessoal existe — banco,
   backup, tópico e telemetria.

**Complemento.** Faça o exercício do inventário: procure CPF em lugares onde ele não deveria estar
— campos de texto livre, `jsonb` de payload do parceiro, logs de aplicação, mensagens de erro
gravadas. O resultado costuma ser a parte mais desconfortável desta trilha.

**Checagem**

1. Por que classificar é pré-requisito de criptografar, e não o contrário?
2. O que a criptografia em repouso **não** protege, e qual camada resolve isso?
3. Por que tokenizar o PAN reduz custo, e não só risco?
4. Como conviver retenção de 5 anos e direito ao esquecimento, e o que o crypto-shredding exige
   antes de ser usado?

## Principais aprendizados

- Classificação por coluna vem antes de qualquer controle; sem ela, "criptografe tudo" é teatro
  caro e o inventário não existe.
- Criptografia em repouso não protege contra quem acessa o banco; a proteção real contra dump
  vazado é em coluna, e ela custa índice e comparação.
- Tokenizar PAN reduz o escopo de auditoria PCI — e guardar bandeira, validade e últimos dígitos
  junto reconstitui o risco que se queria eliminar.
- Anonimização é parte do pipeline, com teste de injeção de PII; sem o teste, é uma intenção.
- Retenção e esquecimento convivem separando registro contábil de dado pessoal, e crypto-shredding
  exige inventário de onde cada chave foi usada.
