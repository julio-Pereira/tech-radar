---
id: controle-de-mudanca-regulado
title: "Controle de mudança regulado"
summary: "Em banco, a mudança precisa ser autorizada, rastreável e reversível; a boa notícia é que a esteira pode fazer tudo isso melhor — e mais barato — que um comitê manual."
estimatedMinutes: 60
completion: quiz
references:
  - title: "SLSA — Supply-chain Levels for Software Artifacts"
    url: https://slsa.dev/
---

## O que o auditor pergunta

Cinco perguntas que qualquer auditoria de mudança em produção faz, nessa ordem: quem **mudou**?
Quem **aprovou**? O que foi **testado**? O que foi **implantado**? **Quando**? Uma esteira bem
desenhada responde às cinco automaticamente, a partir do próprio histórico de execução — sem que
ninguém precise reconstruir manualmente a história depois do fato, vasculhando logs de sistemas
diferentes que não se conversam.

## Segregação de funções: autor ≠ aprovador

O princípio mais básico de controle de mudança: quem **escreve** uma mudança não pode ser a mesma
pessoa que **aprova** ela para produção — mesmo que tecnicamente capaz, mesmo com boa intenção. A
auto-aprovação (incluindo o caso sutil de "aprovar o próprio *pull request* usando uma segunda
conta") é rejeitada estruturalmente, não por política de confiança. ***CODEOWNERS*** e revisores
obrigatórios configurados por área do código são o mecanismo que torna isso verificável, não apenas
esperado.

## Classes de mudança (vocabulário ITIL, **confira**)

Uma mudança **padrão** segue um caminho pré-aprovado desde que passe por todos os *gates*
automáticos (dos marcos 02–08) — sem aprovação manual adicional, porque o risco já foi mitigado pela
automação. Uma mudança **normal** exige aprovação explícita de alguém além do autor. Uma mudança
**emergencial** (*hotfix*, marco 07) fura o processo normal sob urgência real, com revisão
**retroativa obrigatória** dentro de um prazo — nunca sem revisão nenhuma, só adiada.

## Evidência como produto: registro por deploy, log imutável

Cada deploy em produção gera um **registro** com, no mínimo: autor, aprovador, checagens que
passaram, *digest* do artefato, hora, e classe de mudança. Esses registros vivem num **log
imutável encadeado por hash** — cada registro inclui o hash do anterior, de forma que qualquer
tentativa de adulterar um registro no meio da cadeia **quebra** a verificação de todos os
registros posteriores a ele, tornando a adulteração detectável, não apenas teoricamente impossível.

## Rastreabilidade: requisito → commit → build → artefato → deploy

A cadeia completa — de qual requisito motivou a mudança, até qual deploy específico a entregou,
passando por qual commit e qual artefato — deveria ser **seguível** sem reconstrução manual, numa
pergunta como "o requisito X já está em produção, e desde quando?". A proveniência do artefato
(`seguranca-aplicacao/12`) é um elo dessa cadeia, não a cadeia inteira.

## Caminho de emergência (*break-glass*): revisão retroativa com prazo

Um *hotfix* às 2h da manhã não pode esperar aprovação normal sem custar tempo que, numa emergência
real, é exatamente o que se está tentando economizar. O caminho de emergência (***break-glass***)
permite o deploy sem a aprovação normal — mas gera automaticamente uma **tarefa de revisão** com
prazo declarado (24h, por exemplo), e se essa revisão **não ocorrer** dentro do prazo, o relatório de
conformidade **reprova** — a urgência não é desculpa para pular a prestação de contas, só para
adiá-la.

```diagrama
ec-mudanca-regulada
```

## Retenção de evidência (**confira** prazos com compliance)

Por quanto tempo um registro de deploy precisa ficar disponível para auditoria é uma pergunta de
**política regulatória**, não de capacidade técnica de armazenamento — e os prazos exatos variam por
jurisdição e por tipo de sistema. **Confira** com compliance antes de implementar qualquer prazo
específico como se fosse definitivo.

## Conformidade como código, e mapeamento a controles

Cada controle regulatório relevante (continuidade, segurança da informação — **confira** as normas e
certificações aplicáveis ao contexto) deveria mapear para um mecanismo **verificável**, não para um
parágrafo de documento que descreve uma intenção. "Conformidade como código" significa: o controle é
um *gate*, um teste, uma política automatizada — algo que roda e produz um resultado binário, não uma
afirmação em prosa que ninguém verifica.

## O custo de um comitê de mudança manual

Um comitê que se reúne semanalmente para aprovar mudanças adiciona, em média, **dias** de espera por
mudança — tempo que o mapa de fluxo de valor do marco 01 classificaria inteiramente como espera, não
trabalho. A esteira com *gates* automáticos e segregação de funções estrutural substitui esse comitê
para a maioria das mudanças (classe "padrão"), reservando revisão manual de fato só para o que
realmente precisa de julgamento humano.

## Exemplo numa fintech

Um *hotfix* às 2h: o caminho de *break-glass* é usado, o deploy acontece sem esperar aprovação
normal, e uma tarefa de revisão com prazo de 24h é gerada automaticamente. Se essa revisão **não**
acontecer dentro das 24h — ninguém revisou o que foi feito, mesmo depois da urgência passar — o
relatório de conformidade do período **reprova** automaticamente, forçando a atenção de volta para
aquele *hotfix* específico, mesmo que o sistema já esteja estável há dias.

## Hands-on

**Tutorial.** Construa `evidencia/`, que gera, a partir de eventos sintéticos de pipeline, um
registro por deploy num log encadeado por hash.

**Desafio.** Implemente o fluxo de *break-glass* e o relatório de conformidade.

**Invariantes testáveis**

1. **Autor ≠ aprovador**: uma tentativa de auto-aprovação (mesma identidade em ambos os campos) é
   **rejeitada** estruturalmente.
2. Todo deploy de produção tem registro com os **seis campos** completos (autor, aprovador,
   checagens, *digest*, hora, classe de mudança).
3. O log encadeado **detecta adulteração**: um teste que altera um registro no meio da cadeia faz a
   verificação subsequente **falhar**, apontando exatamente onde a cadeia quebrou.
4. Um deploy via *break-glass* gera **automaticamente** uma tarefa de revisão com prazo; com
   **relógio falso** avançado além do prazo sem a revisão ter ocorrido, o relatório de conformidade
   **reprova**.
5. Uma mudança classificada como "padrão" só é **aceita** se todos os *gates* exigidos (dos marcos
   anteriores) já passaram — verificado antes de permitir o caminho sem aprovação manual.
6. A **classificação** da mudança (padrão, normal, emergencial) é uma **função pura**, testada em
   tabela com massa de dados conhecida — nunca uma decisão subjetiva de quem está implantando.

**Complemento.** Estime, com números do seu próprio contexto, quanto tempo adicional por mudança um
comitê de aprovação manual semanal acrescentaria, comparado ao fluxo automatizado deste marco.

**Checagem**

1. Por que a segregação de funções (autor ≠ aprovador) é estrutural, e não uma política de
   confiança?
2. O que cada um dos seis campos do registro de deploy existe para responder, entre as cinco
   perguntas que um auditor faz?
3. Por que um log encadeado por hash torna adulteração **detectável**, mesmo que não impossível de
   tentar?
4. Por que o caminho de *break-glass* exige revisão retroativa com prazo, em vez de dispensar
   revisão completamente dada a urgência?

> **Reencontro — `kubernetes/13`; `kubernetes/10`; `seguranca-aplicacao/12`; `seguranca-aplicacao/15`;
> `observabilidade/17`.** O GitOps de `kubernetes/13` já produz parte do rastro que a evidência deste
> marco formaliza e completa. RBAC e auditoria de `kubernetes/10` são o mecanismo de controle de
> acesso sobre quem pode fazer o quê, complementar à segregação de funções deste marco. A cadeia de
> suprimentos de `seguranca-aplicacao/12` fornece a proveniência do artefato que entra no registro de
> deploy. A detecção e resposta de `seguranca-aplicacao/15` é onde uma adulteração detectada pelo log
> encadeado se conecta a um processo de resposta a incidente. E a telemetria com PII controlada de
> `observabilidade/17` é o mesmo cuidado que o registro de evidência precisa ter ao decidir o que
> incluir no log.

## Principais aprendizados

- Uma esteira bem desenhada responde automaticamente às cinco perguntas que um auditor faz — quem
  mudou, quem aprovou, o que foi testado, o que foi implantado, quando — sem reconstrução manual.
- Segregação de funções (autor ≠ aprovador) é um mecanismo estrutural verificável, não uma política
  baseada em confiança.
- Um log imutável encadeado por hash torna adulteração detectável: alterar um registro quebra a
  verificação de tudo que vem depois dele na cadeia.
- Uma mudança classificada como "padrão" é pré-aprovada porque já passou por todos os *gates*
  automáticos — a automação substitui, para a maioria das mudanças, o comitê manual.
- *Break-glass* permite furar o processo normal sob urgência real, mas sempre com revisão
  retroativa obrigatória e prazo — urgência adia a prestação de contas, nunca a dispensa.
