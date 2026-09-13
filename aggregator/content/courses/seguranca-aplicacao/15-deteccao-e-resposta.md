---
id: deteccao-e-resposta
title: "Detecção, log de segurança e resposta"
summary: "Três artefatos diferentes — log de aplicação, log de segurança, trilha de auditoria — e a pergunta que define o desenho da terceira: quem pode apagar? Se o operador pode, não é trilha de auditoria."
estimatedMinutes: 55
references:
  - title: "OWASP Logging Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
  - title: "NIST SP 800-61 — Computer Security Incident Handling Guide"
    url: https://csrc.nist.gov/pubs/sp/800/61/r2/final
  - title: "MITRE ATT&CK"
    url: https://attack.mitre.org/
---

## Três artefatos diferentes

O termo "log" esconde três coisas com requisitos diferentes. **Log de aplicação** existe
para depurar comportamento — *reencontro* de `observabilidade/17`. **Log de segurança**
registra eventos relevantes para detectar e investigar incidente. **Trilha de auditoria**
é a mais exigente das três, e o que a distingue não é o conteúdo — é o requisito de
**não repúdio e integridade**: **append-only** (nunca editável, só adicionável),
**encadeamento por hash** (cada registro inclui o hash do anterior, tornando qualquer
alteração retroativa detectável), **retenção WORM** (Write Once, Read Many). A pergunta
que define se um sistema tem trilha de auditoria de verdade, ou apenas um log com nome
pomposo: **quem pode apagar um registro?** Se a resposta inclui qualquer operador do
próprio sistema — por mais privilegiado que seja — **não é trilha de auditoria**, porque
a garantia que ela existe para dar (isto realmente aconteceu, e ninguém pode negar depois)
já está quebrada por desenho.

## Os eventos que precisam existir

A lista é deliberadamente curta — não porque pouco importe, mas porque uma lista longa
demais **não é seguida**, o mesmo princípio da checklist do marco 13. Os eventos mínimos:
**autenticação** (sucesso **e** falha — falha é tão relevante quanto sucesso), **falha de
autorização**, **mudança de permissão**, **acesso a dado sensível**, **uso de acesso
quebra-vidro**, **rotação de credencial**, e, incorporados por este marco, **logout e
encerramento de sessão** e **desprovisionamento** (*reencontro* direto do marco 06 — é
esse registro que permite provar, numa auditoria, que o desligado realmente perdeu acesso,
e quando).

**Falha de autorização é o sinal mais subestimado da lista inteira.** Ela não é ruído —
**é o BOLA sendo tentado, em tempo real**. Um sistema que não registra tentativa de
autorização negada não tem como distinguir "um usuário clicou no lugar errado uma vez" de
"alguém está varrendo sistematicamente `id`s sequenciais, uma tentativa por vez, esperando
achar um que funcione".

## Detectar sem afogar

O desafio operacional de qualquer sistema de detecção é separar **sinal de ataque** de
**ruído de operação normal** — alertar demais é, na prática, equivalente a não alertar,
porque a equipe aprende a ignorar. Todo **alerta de segurança precisa vir com runbook
obrigatório** — *reencontro* de `observabilidade/13`: um alerta sem procedimento de
resposta associado é ansiedade, não ação. **Honeytoken** é um mecanismo de detecção com
uma relação custo-precisão rara: um valor plantado deliberadamente — uma credencial falsa
numa tabela, um registro que não deveria nunca ser acessado em operação legítima — que,
se usado, **só pode significar uma coisa**: alguém acessou algo que não deveria ter
acessado. Custo de implementação quase zero, taxa de falso positivo próxima de zero.

## Responder

Sob pressão, a decisão central de resposta a incidente é uma tensão real: **conter**
(cortar o acesso do atacante imediatamente) contra **preservar evidência** (uma contenção
abrupta pode destruir o rastro necessário para entender o que aconteceu e para eventual
ação legal). Não existe resposta genérica certa — depende do incidente — mas a decisão
precisa ser **deliberada**, não reflexo. **Cadeia de custódia** formaliza quem tocou em
qual evidência, quando, e como, para que ela permaneça utilizável depois. O **prazo de
comunicação ao regulador e à ANPD** não é opcional nem flexível — é definido por norma, e
o relógio começa a correr no momento da descoberta do incidente. O **post-mortem
blameless** — *reencontro* de `observabilidade/15` — usa o mesmo método daquela trilha; a
diferença aqui é que existe um **adversário adaptativo** do outro lado, que reage às suas
defesas, ao contrário de uma falha de infraestrutura, que não tem intenção.

## Exemplo numa fintech

A notificação de incidente ao **BACEN** e à **ANPD** exige mais do que descrever o que
aconteceu — exige provar, com evidência, **que o controle estava ativo naquele momento
específico**, não que ele existia em geral no sistema. "Temos MFA" não responde à pergunta
que o regulador faz; "o log mostra que MFA estava habilitado e foi verificado nesta conta,
nesta data, neste evento" responde. É a diferença entre afirmar um controle e provar que
ele funcionou quando precisou funcionar.

## Hands-on

**Tutorial — evento de segurança estruturado, com alerta e runbook.** Implemente um evento
de segurança estruturado no `fin-platform` para pelo menos dois dos eventos mínimos da
lista (por exemplo, falha de autorização e uso de acesso quebra-vidro), ligando cada um a
um alerta com runbook associado.

**Desafio — game day "chave de assinatura vazada".** Simule a descoberta de que a chave de
assinatura do `fin-idp` vazou. Execute o procedimento de rotação de emergência do marco 10
do início ao fim, **cronometrando** cada etapa: da detecção à rotação completa. Escreva o
post-mortem.

**Invariantes testáveis**

1. O tempo total do game day (detecção → rotação completa) é medido e registrado no
   post-mortem, não estimado depois de memória.
2. Todo token emitido pela chave comprometida deixa de ser aceito ao final do
   procedimento.
3. Nenhum cliente legítimo fica sem acesso além da janela de transição declarada durante
   a rotação.
4. O post-mortem segue o formato blameless — descreve o que aconteceu e por que o sistema
   permitiu, não quem errou.

**Complemento.** Plante um honeytoken no `fin-platform` (uma credencial de teste que nunca
deveria ser usada em operação legítima) e configure um alerta de alta prioridade para
qualquer uso dele. Documente o runbook associado.

**Checagem**

1. Qual pergunta única decide se um sistema tem trilha de auditoria de verdade, e por quê?
2. Por que falha de autorização é o sinal mais subestimado entre os eventos de segurança
   mínimos?
3. O que um honeytoken oferece que a maioria dos outros mecanismos de detecção não
   oferece?
4. Por que "temos o controle X implementado" não é suficiente para uma notificação de
   incidente ao regulador?

## Principais aprendizados

- Log de aplicação, log de segurança e trilha de auditoria são três artefatos diferentes;
  a trilha de auditoria exige não repúdio e integridade — e a pergunta que a define é
  "quem pode apagar um registro?".
- A lista de eventos mínimos é curta de propósito, e passa a incluir logout/encerramento
  de sessão e desprovisionamento; falha de autorização é o BOLA sendo tentado em tempo real.
- Todo alerta de segurança precisa de runbook obrigatório; honeytoken é detecção de alta
  precisão com custo quase zero.
- Responder a incidente exige decidir deliberadamente entre conter e preservar evidência;
  o post-mortem é blameless, mas com um adversário adaptativo do outro lado.
- Evidência de conformidade regulatória precisa provar que o controle estava ativo naquele
  momento específico, não apenas que existe em geral no sistema.
