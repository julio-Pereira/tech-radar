---
id: infraestrutura-como-codigo
title: "Infraestrutura como código com Terraform"
summary: "Infraestrutura como código vale pelo plano revisável e pela segunda execução que não muda nada; sem isso é um script que assusta."
estimatedMinutes: 70
completion: quiz
references:
  - title: "Terraform — documentation"
    url: https://developer.hashicorp.com/terraform/docs
  - title: "OpenTofu — documentation"
    url: https://opentofu.org/docs/
---

## Declarativo × imperativo, e o vocabulário básico

Um script imperativo diz **como** chegar a um estado ("crie este recurso, depois aquele"). Terraform
é **declarativo**: você descreve o estado **desejado** (HCL: provedores, recursos, variáveis,
saídas), e a ferramenta calcula o que precisa mudar para chegar lá a partir do estado atual — a
diferença importa porque o declarativo é mais fácil de revisar (o texto descreve o resultado, não o
caminho) e mais seguro de reaplicar.

## Estado: o que é, por que existe, e o fato de que segredos ficam ali

O **estado** é o registro de quais recursos reais correspondem a quais blocos de configuração — sem
ele, Terraform não saberia distinguir "crie este recurso" de "este recurso já existe, só confirme".
O estado precisa de **bloqueio** (para duas execuções simultâneas não corromperem o mesmo estado) e,
em equipe, de **armazenamento remoto** compartilhado. O fato pouco confortável que todo operador
precisa saber: **segredos frequentemente ficam no estado**, em texto claro, porque o estado registra
os valores reais dos recursos — inclusive os que vieram de uma variável marcada como sensível na
configuração. O estado nunca deveria ser versionado em texto puro num repositório Git.

## `plan` como artefato de revisão, e `apply` só pela pipeline

O comando `plan` produz uma previsão do que vai mudar — esse **plano** é o artefato que deveria ser
revisado por humanos (e por política automatizada, próxima seção), antes de qualquer `apply`. E o
`apply` em si deveria rodar **só pela pipeline**, nunca manualmente de uma máquina de desenvolvedor —
a mesma disciplina de "promoção sem reconstruir" do marco 05, aplicada a infraestrutura: o que
executa é exatamente o que foi revisado no plano, sob controle de acesso e evidência da pipeline.

## Idempotência, e *drift*

Aplicar a mesma configuração **duas vezes** deveria produzir, na segunda vez, um plano **vazio** —
nada para mudar, porque o estado real já corresponde ao desejado. Quando alguém muda um recurso
**manualmente**, fora do Terraform (um clique no console, um comando direto), o próximo `plan`
detecta essa diferença: é o ***drift***, e o `apply` subsequente o corrige, realinhando a realidade
com a configuração declarada — ou revela que a configuração precisa ser atualizada para refletir uma
mudança legítima que foi feita por fora.

## Módulos, e o que não modularizar

Um **módulo** agrupa recursos relacionados para reúso — mas modularizar prematuramente, antes de ter
um segundo caso de uso real do mesmo padrão, produz abstração sem necessidade, a mesma lição de
custo de cerimônia que `arquitetura-de-software/04` já ensinou para código de aplicação.

## Um estado por fronteira: o raio de explosão

Colocar **todos** os recursos de um sistema no mesmo estado significa que um erro de configuração em
qualquer parte pode, em teoria, afetar o `plan`/`apply` de tudo o mais que está no mesmo estado — o
**raio de explosão** de um erro é proporcional ao tamanho do estado compartilhado. Separar estados
por fronteira (um por ambiente, um por sistema, dependendo da escala) limita esse raio, ao custo de
coordenar referências entre estados diferentes quando um recurso de um depende de outro.

## `for_each` × `count`, e armadilhas de endereçamento

`count` indexa recursos por posição numérica (`recurso[0]`, `recurso[1]`) — remover um item do meio
de uma lista reindexada muda o **endereço** de todos os itens depois dele, levando Terraform a querer
destruir e recriar recursos que na verdade não mudaram de verdade, só de posição. `for_each` indexa
por **chave estável** (geralmente uma string), evitando esse problema — a escolha entre os dois não é
estilística, é sobre o que acontece quando a lista muda.

## `import`, `moved`, e o ciclo de vida completo

`import` traz um recurso que já existe (criado por fora do Terraform) para dentro do estado, sem
recriá-lo. O bloco `moved` registra que um recurso foi renomeado ou movido de módulo sem que isso
signifique destruir e recriar — sem ele, uma refatoração de nome no código HCL seria interpretada
como "destrua o antigo, crie um novo", mesmo que o recurso real devesse continuar o mesmo.

## Testes: `fmt`, `validate`, testes nativos com provedores simulados

`terraform fmt -check` verifica formatação consistente; `validate` verifica sintaxe e consistência
interna sem consultar nenhum provedor real. Testes nativos com provedores simulados (a versão exata
em que existem e seu formato — **confira** na Fase 0) permitem verificar comportamento sem criar
recurso real nenhum, inclusive em CI, sem custo de nuvem.

## Política sobre o plano, em JSON

O plano gerado pode ser exportado em formato JSON e avaliado por um **motor de política** (o mesmo
motor compartilhado com `arquitetura-de-solucoes/05`, por ADR) — negando automaticamente um plano que
viole uma regra (criar recurso sem *tag* obrigatória, por exemplo) **antes** do `apply`, sem depender
de um revisor humano notar manualmente.

## Terraform × OpenTofu; Kubernetes/Helm × Terraform

A relação entre Terraform e seu *fork* aberto OpenTofu, incluindo a questão de licença de cada um,
muda com o tempo — **confira** a situação vigente antes de fixar a ferramenta em ADR. E a fronteira
entre o que Kubernetes/Helm gerencia (o que roda **dentro** do cluster) e o que Terraform gerencia (a
infraestrutura **em volta** do cluster — redes, contas, o cluster em si) é uma decisão de "quem é
dono do quê" que precisa estar explícita, não implícita.

## Exemplo numa fintech

Um módulo cria um "ambiente" (um diretório, um arquivo de configuração, uma chave gerada
aleatoriamente) — tudo com provedores locais, sem nuvem. Uma mudança manual no arquivo gerado (alguém
edita diretamente, fora do fluxo) é detectada pelo próximo `plan`, que mostra exatamente a diferença —
e o `apply` subsequente a corrige, restaurando o conteúdo declarado.

## Hands-on

**Tutorial.** Implemente um módulo local (provedores `local`, `random`, `null`, `terraform_data`),
com `plan`, `apply`, `destroy`.

**Desafio.** Escreva o teste do módulo e a política sobre o plano.

**Invariantes testáveis**

1. `terraform fmt -check` e `validate` **passam**.
2. **Aplicar duas vezes**: o segundo `plan` está **vazio** (`-detailed-exitcode` retorna 0) — nada
   para mudar na segunda execução.
3. Uma **mudança manual** no recurso gerenciado é detectada pelo `plan` seguinte (código de saída 2)
   e **corrigida** pelo próximo `apply`.
4. A política **nega** o plano de uma *fixture* deliberadamente violadora (um recurso sem a *tag*
   `owner`, por exemplo) e **aprova** a *fixture* conforme — as duas verificadas no mesmo teste.
5. O arquivo de **estado não está versionado** no controle de versão — verificado checando
   `.gitignore` e a listagem de arquivos rastreados pelo Git.
6. **Demonstração** (não correção, só prova do risco): um valor marcado como "secreto" na
   configuração aparece em **texto claro** no arquivo de estado, confirmando por que o estado nunca
   pode ser tratado como seguro por padrão.

**Complemento.** Desenhe como você dividiria o estado do `fin-platform` inteiro por fronteira (um
estado por sistema? por ambiente? uma combinação?), com a justificativa do raio de explosão
resultante de cada escolha.

**Checagem**

1. Por que o estado precisa de bloqueio, e o que acontece sem ele?
2. Por que o estado "frequentemente contém segredos em texto claro", mesmo quando a configuração
   marca uma variável como sensível?
3. Qual é a diferença prática entre `count` e `for_each` quando um item é removido do meio de uma
   lista?
4. Por que um estado único para todo o sistema aumenta o raio de explosão de um erro de
   configuração?
5. O que a política sobre o plano, em JSON, permite verificar **antes** do `apply`, que um revisor
   humano sozinho poderia deixar passar?
6. Por que `apply` deveria rodar só pela pipeline, nunca manualmente de uma máquina de
   desenvolvedor?

> **Reencontro — `kubernetes/13`; `seguranca-aplicacao/10`; `dados-distribuidos/12`;
> `observabilidade/14`.** O GitOps de `kubernetes/13` é o equivalente, para manifestos Kubernetes, do
> `apply` só pela pipeline deste marco — a mesma disciplina, aplicada à camada que fica dentro do
> cluster. Segredos e chaves de `seguranca-aplicacao/10` são exatamente o tipo de valor que acaba, de
> forma perigosa, dentro do estado do Terraform. O backup e PITR de `dados-distribuidos/12` é onde a
> mesma preocupação de "o que acontece se este artefato crítico (estado, backup) for perdido ou
> corrompido" já apareceu. E os *dashboards* de `observabilidade/14` são onde um *drift* detectado
> repetidamente deveria aparecer como sinal, não só como linha de log isolada.

## Principais aprendizados

- Infraestrutura como código vale pelo plano revisável e pela idempotência (segunda execução sem
  mudança) — sem essas duas propriedades, é só um script imperativo com sintaxe declarativa.
- O estado frequentemente contém segredos em texto claro, mesmo de variáveis marcadas como
  sensíveis — e por isso nunca deveria ser versionado em texto puro.
- `apply` só pela pipeline, nunca manualmente, é a mesma disciplina de "promoção sem reconstruir" do
  marco 05, aplicada à infraestrutura.
- `for_each` com chave estável evita que remover um item do meio de uma lista force a recriação de
  todos os itens posteriores — `count` não tem essa proteção.
- Um estado por fronteira limita o raio de explosão de um erro de configuração, ao custo de
  coordenar referências entre estados separados.
