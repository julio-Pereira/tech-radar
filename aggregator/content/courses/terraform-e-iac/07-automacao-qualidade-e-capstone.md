---
id: automacao-qualidade-e-capstone
title: "Automação, qualidade e capstone"
summary: "IaC de time só muda por PR revisado, com o plan à vista e a política como portão. O apply do mesmo plano salvo no merge (medido: Saved plan is stale quando o estado mudou), o papel de plan que falhou ao gravar o estado depois de o provedor já ter alterado o recurso, tflint × Checkov × política própria, detecção de drift agendada e o Trivy comprometido em 2026 como argumento para fixar actions por SHA."
estimatedMinutes: 70
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, seguranca, confiabilidade]
references:
  - title: "Terraform — Running Terraform in automation"
    url: https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform
  - title: "TFLint"
    url: https://github.com/terraform-linters/tflint
  - title: "Checkov — Terraform scanning"
    url: https://www.checkov.io/7.Scan%20Examples/Terraform.html
  - title: "Aqua — Trivy supply chain attack: what you need to know"
    url: https://www.aquasec.com/blog/trivy-supply-chain-attack-what-you-need-to-know/
---

## A esteira da IaC

Num time, ninguém roda `apply` do laptop. A infraestrutura muda por PR, e a esteira aplica. O fluxo do
`fin-iac`, na ordem em que as verificações ficam mais caras:

1. `terraform fmt -check` e `validate`.
2. Análise estática: `tflint` e o analisador de segurança.
3. `terraform test` dos módulos tocados.
4. `plan` de cada estado e ambiente afetados, salvo com `-out`.
5. Política sobre o plano em JSON, no motor do catálogo (Conftest).
6. O resumo do plano comentado no PR.
7. Aprovação humana.
8. No *merge*: `apply` **do mesmo plano salvo**.

O passo 8 é o que separa uma esteira de um *script*. O revisor aprovou um plano específico. Se o `apply`
gerar um plano novo no *merge*, ele pode ser diferente do que foi revisado, porque o mundo mudou entre a
revisão e o *merge*. Aplicar o arquivo salvo garante que só o revisado é executado. E o Terraform recusa
um plano salvo que ficou velho: medido, um plano gerado no PR, seguido de outro `apply` no mesmo estado, e
o `apply` do arquivo salvo falhou com `Error: Saved plan is stale`. A esteira então refaz o plano e pede
nova revisão.

O artefato do plano tem dois cuidados. Ele contém valores sensíveis (marco 03), então tem acesso restrito
e retenção curta. E o *job* de `apply` confere o *hash* do arquivo contra o registrado no PR, para provar
que aplica o plano aprovado e não outro.

## Papéis separados: planejar não é aplicar

Na esteira, a credencial vem por OIDC (`entrega-continua-e-devops/02`), com dois papéis:

- **`plan`:** leitura no estado e leitura na nuvem. Roda em todo PR, inclusive de *branch* de qualquer
  pessoa.
- **`apply`:** escrita no estado e na nuvem. Roda só no *merge* da *branch* principal, com aprovação.

A separação precisa valer nas **duas** credenciais. O laboratório mostra por quê. No *backend* `pg`, um
papel só com `SELECT` na tabela de estado rodou o `plan` (com `PG_SKIP_SCHEMA_CREATION`,
`PG_SKIP_TABLE_CREATION` e `PG_SKIP_INDEX_CREATION`, porque o *backend* tenta criar o esquema ao
iniciar). Num `apply` com esse papel, o erro veio no fim: `permission denied for table states`. Mas a
credencial do **provedor** ainda era de escrita, e o recurso já tinha sido alterado no Postgres antes da
falha. O Terraform deixou um `errored.tfstate` local, e o estado remoto ficou para trás do mundo real.
Leitura só no estado não impede a mudança, só impede o registro dela.

## Análise estática: quem pega o quê

| Ferramenta | O que pega | Exemplo no `fin-iac` |
| --- | --- | --- |
| `tflint` (0.66.0) | erro de linguagem e convenção: variável sem tipo, declaração não usada, versão sem restrição | medido: `terraform_typed_variables`, `terraform_unused_declarations`, `terraform_required_version` |
| Checkov (3.4.3) | configuração insegura conhecida, por provedor | *bucket* público: `CKV_AWS_53`, `CKV_AWS_54`, `CKV_AWS_56` |
| política própria (Conftest) | regra do negócio, sobre o plano | recurso sem *tag* `owner`, `delete` em recurso crítico, mínimo de produção |

A regra de ouro é não duplicar. Se o Checkov já reprova *bucket* público, a política própria não repete
essa regra. Ela cuida do que só o seu negócio sabe. Duas ferramentas reprovando a mesma coisa geram duas
exceções para manter quando houver um caso legítimo.

**Por que Checkov, e não Trivy.** Em 19 mar 2026, credenciais vazadas foram usadas para publicar o Trivy
0.69.4 malicioso e reapontar quase todas as *tags* das *actions* `trivy-action` e `setup-trivy` para
código que roubava os segredos do *runner* (CVE-2026-33634). Quem fixava a *action* por *tag* rodou o
código malicioso. Quem fixava pelo SHA completo do *commit* não rodou. O ADR do `fin-iac` escolheu o
Checkov, instalado pelo PyPI com versão fixa. A lição vale para qualquer ferramenta da esteira: *action*
por SHA, ferramenta por versão exata.

## *Drift* agendado e custo

Um *job* agendado roda `plan -refresh-only -detailed-exitcode` em cada estado. Saída 2 significa que algo
mudou fora do Terraform. Medido: depois de um `ALTER ROLE ... CONNECTION LIMIT 999` direto no Postgres, o
plano mostrou `Objects have changed outside of Terraform` e `connection_limit = 30 -> 999`, com saída 2.
O *job* abre um alerta com o *diff*. Quem decide entre aplicar o código (reverter o *drift*) e incorporar
a mudança no código é uma pessoa.

Custo no PR (Infracost, CLI Apache 2.0) ajuda o revisor a ver que uma mudança dobra a conta. Ele exige
uma chave da API de preços. No `fin-iac`, fica fora da esteira obrigatória, porque ela roda sem
credencial.

## Orquestração e auditoria

Atlantis, HCP Terraform, Spacelift ou GitHub Actions puro fazem o mesmo fluxo com graus diferentes de
pronto. O critério de escolha:

- quem guarda o estado;
- onde ficam as credenciais;
- como se faz o bloqueio entre PRs;
- quanto custa.

O `fin-iac` usa Actions puro, com o estado no próprio *backend*. Em qualquer opção, cada `apply` deixa
evidência: o PR, o plano aprovado, o *hash* aplicado e quem aprovou. É a trilha de auditoria de mudança de
`entrega-continua-e-devops/09`.

> **E no OpenTofu?** O fluxo é o mesmo, com `tofu` no lugar de `terraform`. O Checkov e o `tflint`
> funcionam nos dois. O Terraform Policy, estável na 1.17 (`-policies`), é do Terraform. O plano salvo
> do OpenTofu pode ser cifrado (1.7), o que reduz o cuidado com o artefato.

## Exemplo numa fintech

Um time aplicava no *merge* com `terraform apply -auto-approve`, que gerava um plano novo. Um PR aprovado
na sexta mudava o tamanho de uma instância. O *merge* foi na segunda. No fim de semana, outro PR tinha
mudado a mesma instância. O `apply` da segunda executou um plano que ninguém tinha visto, que incluía
reverter a mudança do outro PR. A correção: plano salvo no PR, *hash* conferido no *merge*, e o
`Saved plan is stale` virou o sinal para refazer o plano e pedir nova revisão.

## Hands-on

**Tutorial.** Monte a esteira do `fin-iac` em GitHub Actions: `fmt`, `validate`, `tflint`, Checkov,
`terraform test` e `plan` com `-out`. A política roda sobre o plano em JSON, o resumo do plano é
comentado no PR, e o `apply` do artefato só roda no *merge*. Todas as *actions* são fixadas por SHA. O
laboratório (Postgres e `moto`) sobe como serviço do *job*.

**Desafio.** A esteira de IaC do `fin-iac`, com papéis separados de `plan` e `apply` e o *job* de
*drift*.

**Invariantes testáveis**

1. **Os portões reprovam o que devem.** Uma *fixture* com *bucket* público é reprovada pelo Checkov, e uma
   com recurso sem a *tag* `owner` é reprovada pela política própria. Cada regra tem a sua *fixture*, e a
   *fixture* conforme passa nas duas.
2. **O `apply` é o do PR.** O *job* de `apply` confere o *hash* do plano contra o registrado no PR e falha
   se forem diferentes. Um teste aplica outro `apply` no meio e exige que o plano salvo falhe com
   `Saved plan is stale`.
3. **O papel de `plan` não escreve.** Com as credenciais do papel de `plan` (estado e provedor), um
   `apply` falha **antes** de mudar o recurso: o teste confere que o objeto no Postgres não mudou.
4. **O *drift* vira alerta.** Uma *fixture* altera o Postgres direto. O *job* de *drift* sai com código 2
   e o alerta contém o atributo alterado.

**Complemento.** Acrescente o Infracost com a chave em segredo do repositório e veja o custo no
comentário do PR. Depois troque o Conftest pelo Terraform Policy (`-policies`, estável na 1.17) para a
regra de *tag* e compare o que muda na esteira.

**Checagem**

1. Por que o `apply` do *merge* deve usar o plano salvo no PR, e o que acontece se o estado mudou?
2. Por que a separação entre `plan` e `apply` precisa valer na credencial do provedor e não só na do
   estado?
3. Como dividir o trabalho entre `tflint`, o analisador de segurança e a política própria sem regra
   duplicada?
4. O que o caso do Trivy em 2026 ensina sobre fixar *actions*?

## Capstone

O `fin-iac` é o seu componente do `fin-platform`: a fundação de IaC que os componentes de nuvem consomem,
especificada no `PROJETO.md` desta trilha. Aqui ela fica pronta.

**Entrega**

- [ ] O banco do ledger protegido por `prevent_destroy`, pré-condição de retenção e política contra
      `delete` em recurso crítico (marco 01)
- [ ] Estados por fronteira, com bloqueio, versionamento e acesso separado (marco 02)
- [ ] O papel de aplicação do Postgres com a senha fora do estado e rotação por versão (marco 03)
- [ ] O módulo `postgres-servico` versionado, com teste de contrato e a v2.0.0 com `moved` (marco 04)
- [ ] Três ambientes do mesmo código, com a política de mínimos de produção (marco 05)
- [ ] Os recursos legados importados, reorganizados em módulo e divididos em dois estados (marco 06)
- [ ] A esteira de PR, com portões, plano salvo, papéis separados e *drift* agendado (marco 07)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] Concorrência: dois `apply` simultâneos, um falha com erro de bloqueio, e o plano seguinte sai vazio
- [ ] Recuperação: o estado corrompido volta pela versão anterior, com plano vazio depois
- [ ] Segredo: a varredura do estado e do plano salvo não acha a senha, e a *fixture* com `sensitive`
      reprova na mesma varredura
- [ ] Contrato: a suíte do módulo passa nas duas versões do provedor, e a atualização da v1 para a v2
      tem plano vazio
- [ ] Ambientes: os três `main.tf` têm o mesmo *hash*, e produção abaixo do mínimo é reprovada
- [ ] *Brownfield*: plano vazio depois da importação, nenhum `delete` na refatoração, e a soma dos
      endereços dos estados divididos é igual à do original
- [ ] Esteira: as *fixtures* violadoras são reprovadas, o plano velho falha, o papel de `plan` não muda
      nada, e o *drift* vira alerta
- [ ] Tudo roda em CI sem nenhuma credencial de nuvem

**A pergunta final.** Se o estado de produção sumisse agora, quanto tempo você levaria para voltar a um
`plan` vazio, e qual teste prova essa estimativa?

## Principais aprendizados

- IaC de time muda por PR. O `apply` do *merge* usa o plano salvo e revisado, e o `Saved plan is stale`
  é a proteção quando o mundo mudou.
- `plan` e `apply` têm papéis separados no estado **e** no provedor. Medido: só o estado de leitura deixa
  o recurso mudar e o estado ficar para trás.
- `tflint` para a linguagem, Checkov para segurança conhecida, política própria para o negócio, sem regra
  duplicada.
- *Drift* agendado com `-refresh-only -detailed-exitcode`; quem decide a correção é uma pessoa.
- Ferramenta da esteira por versão exata e *action* por SHA: o caso do Trivy em 2026.
