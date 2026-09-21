---
id: segredos-e-chaves
title: "Segredos e chaves: o ciclo de vida"
summary: "Segredo, chave, credencial e certificado são quatro coisas diferentes, com ciclos de vida distintos. O padrão de duas versões válidas que rotaciona sem downtime — e o relógio que começa a correr no momento do vazamento, não da descoberta."
estimatedMinutes: 55
references:
  - title: "HashiCorp Vault — Documentation"
    url: https://developer.hashicorp.com/vault/docs
  - title: "OWASP Secrets Management Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
  - title: "Kubernetes External Secrets Operator"
    url: https://external-secrets.io/latest/
---

## Quatro coisas diferentes

O erro de origem deste tema é tratar tudo — senha de banco, chave de assinatura,
certificado TLS, token de API — como "**variável de ambiente**", indiferenciadamente.
São quatro categorias com ciclo de vida e controle próprios: **segredo** (um valor que
prova conhecimento, como uma senha), **chave** (material criptográfico usado para cifrar,
assinar ou derivar), **credencial** (o que autentica uma identidade — pode ser um segredo,
uma chave, ou os dois) e **certificado** (identidade assinada por uma autoridade,
vinculando uma chave pública a um titular, com validade declarada). Rotação de chave de
assinatura, expiração de certificado e vazamento de senha exigem processos diferentes —
tratar os quatro com a mesma receita ("é só uma env var") é a origem de boa parte dos
incidentes deste tema. `spring-boot/03` parou em "segredo fora do jar" — perfil por
ambiente, `@ConfigurationProperties`, configuração externalizada. Este marco começa onde
aquele para: o **ciclo de vida** completo da chave, não apenas onde o valor mora em tempo
de execução.

## Onde o segredo não pode estar

A lista, na ordem em que costuma surpreender: **repositório de código** — e, o detalhe
mais esquecido, **o histórico do git**, não só o estado atual (remover o arquivo num
commit novo não apaga o segredo do commit antigo); **camada da imagem de container** (um
`ARG` ou `COPY` num Dockerfile que grava o segredo numa camada, mesmo removido depois, numa
camada seguinte); **variável de ambiente exposta em `/proc/<pid>/environ`** e em **crash
dump** (qualquer ferramenta com acesso ao processo, ou qualquer dump de memória salvo após
uma falha, expõe o ambiente inteiro); **log de aplicação**; **ticket de suporte**; e o mais
humano de todos, **print de tela postado num canal de chat**. Cada um desses vetores já foi
a causa raiz de um incidente real documentado publicamente — nenhum é hipotético.

## Cofre

Um **cofre** (Vault, ou um KMS gerenciado) centraliza o armazenamento e resolve dois
problemas que "variável de ambiente" não resolve: **auditoria** (quem acessou qual segredo,
quando) e **dynamic secrets** — credenciais geradas sob demanda, com **lease**, que nascem
e morrem com o consumidor (um pod que pede uma credencial de banco recebe uma gerada
naquele momento, com TTL curto, e o cofre a revoga automaticamente quando o lease expira,
mesmo que o pod nunca a devolva explicitamente). No fluxo GitOps, **External Secrets**
resolve a ponte entre o cofre e o cluster sem que o segredo passe pelo repositório Git em
nenhum momento — *reencontro* direto da disciplina GitOps de `kubernetes`.

## Rotação sem downtime

O padrão central deste marco, e o que mais vale nomear explicitamente: **duas versões
válidas simultâneas** (a `n` e a `n-1`) durante uma janela de transição. É exatamente o
mecanismo do `kid` no JWKS do marco 04 (duas chaves publicadas, nenhum token em voo
invalidado) e é a mesma lógica do **expand/contract** de `dados-distribuidos/11` (duas
formas do schema coexistindo durante a migração). Três aplicações do mesmo padrão em três
trilhas diferentes não é coincidência — é hora de reconhecer isso como um **padrão geral
de rotação sem downtime**: nunca substituir o velho pelo novo de uma vez; sempre um período
em que os dois são aceitos, com um mecanismo explícito (`kid`, versão de schema, versão de
segredo) para o consumidor escolher qual usar.

## Revogação e vazamento

O detalhe que muda a régua de tempo de qualquer resposta a incidente: **o relógio de
exposição começa no momento em que o segredo vaza, não no momento em que alguém percebe**.
Um segredo commitado seis meses atrás e descoberto hoje esteve exposto seis meses, não
"desde agora". Isso exige um **playbook de rotação de emergência** escrito com
antecedência — decidir o procedimento durante o incidente é o pior momento possível para
decidir qualquer coisa. E a pergunta que mais vale fazer, honestamente, antes que vire
necessária: **quanto tempo levaria hoje para rotacionar a chave de assinatura do
`fin-idp`?** O marco 15 mede essa resposta de verdade, num game day — aqui, a pergunta já
vale ser feita e respondida por escrito.

## HSM e chave não-exportável

Um **HSM** (Hardware Security Module) guarda a chave de um jeito que muda a pergunta de
segurança inteira: a chave **nunca sai do dispositivo** — operações de assinatura e
cifragem acontecem dentro do HSM, e o que sai é o resultado, não a chave. Isso elimina uma
classe inteira de risco (exfiltração da chave via memória, disco, backup) ao custo de
infraestrutura dedicada. É por isso que reguladores frequentemente **exigem** chave
não-exportável para chave de assinatura de instituição financeira — no Brasil, a
infraestrutura **ICP-Brasil** aplica esse requisito na prática, com a chave privada do
certificado do participante vivendo em hardware certificado, não em arquivo.

## Exemplo numa fintech

Um certificado que **expira no sábado à noite** é o roteiro clássico de incidente evitável:
ninguém está de plantão olhando dashboard às 23h de sábado, e o certificado simplesmente
para de funcionar, derrubando um fluxo inteiro sem aviso. **Alerta com antecedência em
30, 15 e 7 dias não é conveniência — é controle**, no mesmo sentido em que um teste
automatizado é controle: sem ele, a expiração é surpresa; com ele, é evento agendado. E o
alerta só funciona se tiver **dono nomeado** — um alerta que cai numa caixa de e-mail que
ninguém lê é, na prática, nenhum alerta.

## Hands-on

**Tutorial — rotacionar a chave de assinatura do `fin-idp` com dois `kid` ativos.**
Execute a rotação completa: gere a nova chave, publique-a no JWKS junto com a antiga (dois
`kid`), comece a assinar novos tokens com a nova chave, aguarde a expiração natural dos
tokens assinados pela antiga, e só então remova a antiga do JWKS. **Cronometre** cada
etapa.

**Desafio — segredo no histórico falha o build.** Implemente uma varredura do histórico
completo do repositório do `fin-platform` (não apenas o estado atual) que **falha o build**
ao encontrar um padrão de segredo. Escreva também o procedimento de rotação de emergência
para cada tipo de credencial usada no `fin-platform` (chave de assinatura, senha de banco,
segredo de client OAuth2, certificado mTLS).

```bash
# varredura do histórico completo (não só o HEAD) com gitleaks
gitleaks detect --source . --log-opts="--all" --exit-code 1
```

**Invariantes testáveis**

1. Um segredo plantado deliberadamente num commit antigo (não no HEAD) é detectado pela
   varredura.
2. Durante a rotação da chave de assinatura, nenhum token emitido antes da rotação falha
   a validação.
3. O tempo total da rotação (do início ao momento em que a chave antiga é removida) é
   medido e registrado.
4. Cada tipo de credencial do `fin-platform` tem um procedimento de rotação de emergência
   escrito, não apenas a rotação de rotina.

**Complemento.** Configure um dynamic secret com lease curto para a credencial de banco de
um dos serviços do `fin-platform` (via Vault em modo dev) e prove que a credencial
realmente para de funcionar depois que o lease expira, sem qualquer ação manual de
revogação.

```bash
# suba o Vault em modo dev (nunca em produção — token de root fixo, sem persistência)
docker run -d --name fin-platform-vault -p 8200:8200 \
  -e 'VAULT_DEV_ROOT_TOKEN_ID=root-dev-token' hashicorp/vault:1.18

export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=root-dev-token

vault secrets enable database

vault write database/config/pix-gateway-db \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@localhost:5432/pix?sslmode=disable" \
  allowed_roles="pix-gateway-role" username="vaultadmin" password="troque-isto"

vault write database/roles/pix-gateway-role \
  db_name=pix-gateway-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1m" max_ttl="5m"

# gere a credencial dinâmica e anote o lease_id
vault read database/creds/pix-gateway-role

# depois de 1 minuto (default_ttl), tente conectar com a credencial gerada — falha
```

**Checagem**

1. Por que tratar segredo, chave, credencial e certificado como "a mesma coisa" costuma
   ser a origem do problema, e não só uma simplificação inofensiva?
2. Por que remover um segredo do estado atual do repositório não é suficiente para
   considerá-lo protegido?
3. Qual é o padrão comum entre a rotação de chave de assinatura (`kid`), o expand/contract
   de schema e a rotação de segredo em geral?
4. Por que o relógio de exposição de um segredo vazado começa no momento do vazamento, e
   não no momento da descoberta — e o que isso muda no playbook de resposta?

## Principais aprendizados

- Segredo, chave, credencial e certificado são quatro coisas diferentes, com ciclo de vida
  e controle próprios — "é só uma env var" é a origem do problema, não uma simplificação.
- Segredo não pode estar no histórico do git, na camada de uma imagem, em `/proc`, em
  crash dump, em log, em ticket ou em print de tela — cada um já foi causa raiz real.
- Rotação sem downtime segue um padrão único, repetido em três trilhas: duas versões
  válidas simultâneas durante uma janela de transição, nunca substituição instantânea.
- O relógio de exposição de um vazamento começa no momento do vazamento, não da
  descoberta — o playbook de rotação de emergência precisa existir antes de ser necessário.
- HSM com chave não-exportável muda a pergunta de segurança: a chave nunca sai do
  dispositivo, e é por isso que reguladores o exigem para chave de assinatura.
