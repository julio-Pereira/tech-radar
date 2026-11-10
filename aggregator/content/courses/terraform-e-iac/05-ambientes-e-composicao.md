---
id: ambientes-e-composicao
title: "Ambientes e composição"
summary: "Ambientes diferem em valores, nunca em código; o resto é escolher onde ficam as costuras. Workspaces (vários estados do mesmo código, e o plano de homologação que o Terraform 1.15+ recusa aplicar em produção) × diretório por ambiente × Terragrunt e Stacks; a política que impede produção abaixo do mínimo mesmo se o tfvars pedir; a ordem de apply entre estados derivada de um grafo; e onde termina o Terraform e começa o GitOps."
estimatedMinutes: 55
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [plataforma, arquitetura]
references:
  - title: "Terraform — Workspaces"
    url: https://developer.hashicorp.com/terraform/language/state/workspaces
  - title: "Terraform — Stacks overview"
    url: https://developer.hashicorp.com/terraform/language/stacks
  - title: "Terragrunt — documentation"
    url: https://terragrunt.gruntwork.io/docs/
---

## Mesmo código, valores diferentes

Dev, homologação e produção precisam ser o **mesmo** sistema em tamanhos diferentes. Se o código de
produção diverge, o que passou em homologação não diz nada sobre produção. É o "construa uma vez,
promova" de `entrega-continua-e-devops/05`, aplicado à infraestrutura: o artefato promovido é o módulo
raiz numa versão, e o que muda por ambiente é um arquivo de valores.

Há três formas de organizar isso, cada uma com a costura num lugar diferente.

## *Workspaces*: vários estados do mesmo diretório

Um *workspace* do Terraform é um estado a mais para o mesmo código. `terraform workspace new producao`
cria um estado novo, e `terraform.workspace` diz qual está selecionado. No *backend* `pg`, cada
*workspace* vira uma linha na tabela de estados.

A vantagem é zero duplicação. O risco é o *workspace* selecionado ser estado invisível: o mesmo
`terraform apply` vai para homologação ou para produção conforme um comando digitado antes, em outra
janela. O Terraform 1.15 fechou um dos buracos. Medido: um plano gerado em `homologacao` e aplicado com
`producao` selecionado falhou com

```text
Error: The plan file describes changes to the "homologacao" workspace, but the
"producao" workspace is currently in use.
```

Mas um `apply` sem plano salvo, no *workspace* errado, continua indo para onde o seletor aponta. E todos
os ambientes compartilham o mesmo *backend* e as mesmas credenciais de acesso ao estado, o que impede dar
a produção um acesso mais restrito.

## Diretório por ambiente

O padrão do `fin-iac`:

```text
estados/
  dados/
    dev/            main.tf  backend.tf  terraform.tfvars
    homologacao/    main.tf  backend.tf  terraform.tfvars
    producao/       main.tf  backend.tf  terraform.tfvars
modulos/
  postgres-servico/
```

O `main.tf` de cada ambiente é só a chamada ao mesmo módulo, na mesma versão. O `backend.tf` aponta para
um estado separado, com acesso separado. A pasta em que se roda o comando **é** o ambiente: não há
seletor para esquecer. O custo é a repetição das chamadas. O invariante que controla isso é que os três
`main.tf` sejam idênticos, conferido por *hash*. O ambiente efêmero sob demanda de
`engenharia-de-plataforma/05` é mais uma pasta com a mesma chamada e outro `tfvars`.

## Ferramentas de composição

- **Terragrunt** (MIT, versão 1.2.1 em nov 2026) gera a configuração de *backend* e as chamadas por
  ambiente a partir de um arquivo, e roda vários estados em ordem de dependência. Ele tira a repetição do
  diretório por ambiente, ao custo de uma ferramenta a mais na esteira e no laptop.
- **Terraform Stacks** é um recurso do HCP Terraform, estável desde a HashiConf 2025, com a CLI
  `terraform stacks` desde a 1.13. Ele declara componentes e implantações (os ambientes) num só lugar, e o
  serviço orquestra a ordem. O custo é depender do HCP Terraform, que a trilha não usa.

O critério: comece pelo diretório por ambiente. Adote uma ferramenta quando a repetição virar fonte de
erro de verdade, e registre a escolha num ADR.

## O que pode variar, e o que não pode

O `tfvars` de cada ambiente muda tamanho (instâncias, réplicas, capacidade), nomes e *endpoints*. Há
valores que produção nunca pode ter abaixo de um mínimo, porque são regra de negócio ou de regulação:
retenção de dados, número de réplicas, criptografia ligada. Uma pré-condição no módulo (marco 01) protege
o mínimo absoluto. Uma política sobre o plano protege o mínimo **por ambiente**, lendo as variáveis que o
plano em JSON carrega:

```text
FAIL - producao.json - main - producao: replicas = 1, mínimo 2
FAIL - producao.json - main - producao: retencao_dias = 30, mínimo 1825
```

Saída real do Conftest sobre o plano de produção. Com o `tfvars` de dev (7 dias, 1 réplica), a mesma
política aprovou. O `tfvars` pode pedir menos, mas não passa.

## A ordem entre estados

Com o estado dividido por fronteira (marco 02), os estados dependem uns dos outros: a aplicação precisa
do banco, e o banco precisa da rede. A ordem de `apply` num ambiente novo é rede → dados → aplicação, e a
de destruição é a inversa. No `fin-iac`, essa ordem não fica na cabeça de ninguém: um arquivo declara as
dependências entre estados, o *script* da esteira deriva a ordem topológica, e um ciclo é erro. É o mesmo
grafo do marco 01, um nível acima.

## Terraform × GitOps

O Terraform cuida do que está **em volta** do *cluster*: rede, contas, bancos gerenciados, o *cluster* em
si. O GitOps (`kubernetes/13`) cuida do que roda **dentro**: manifestos, *releases*, configuração das
aplicações. A costura entre os dois é uma saída do Terraform (o *endpoint* do banco, o papel de IAM do
serviço) publicada onde o GitOps lê. Gerenciar manifestos do Kubernetes pelo Terraform, ou criar bancos a
partir do *cluster*, mistura dois ciclos de vida: um `apply` do Terraform passa a reverter o que o
controlador do *cluster* acabou de aplicar.

> **E no OpenTofu?** *Workspaces* e diretórios funcionam igual. O OpenTofu aceita `for_each` em blocos
> de configuração de provedor desde a 1.9. Com isso, um só módulo raiz pode configurar um provedor por
> região ou por conta e instanciar os recursos em cada um. O Terraform não tem isso. O Stacks não existe
> no OpenTofu.

## Exemplo numa fintech

Um time usava *workspaces* para os três ambientes. Uma engenheira investigava um problema em homologação,
com o *workspace* `homologacao` selecionado no terminal. Foi chamada para uma reunião, voltou, abriu outro
terminal no mesmo diretório e rodou um `apply` para testar uma correção. O outro terminal estava em
`producao`, selecionado na véspera para conferir um valor. A correção, ainda incompleta, foi para
produção. O time migrou para diretório por ambiente: a pasta é o ambiente, o estado de produção tem acesso
próprio, e o *script* de `apply` recusa produção sem a variável que só a esteira define.

## Hands-on

**Tutorial.** Rode o mesmo código em dois *workspaces* e reproduza o erro de aplicar o plano de um no
outro. Depois converta para diretório por ambiente: três pastas chamando o módulo `postgres-servico` do
marco 04, cada uma com seu `backend.tf` e seu `terraform.tfvars`.

**Desafio.** Os três ambientes do `fin-iac` (dev, homologação e produção) para os estados de rede, dados
e aplicação, com a política de mínimos e o *script* de `apply`.

**Invariantes testáveis**

1. **O código dos três é o mesmo.** O teste calcula o *hash* do `main.tf` de cada ambiente, para cada
   estado, e exige igualdade. Só o `tfvars` e o `backend.tf` podem diferir.
2. **Produção não fica abaixo do mínimo.** A política reprova o plano de produção com retenção abaixo de
   1825 dias, menos de 2 réplicas ou criptografia desligada, mesmo que o `tfvars` peça, e aprova o plano
   de dev com valores menores. As duas *fixtures* rodam no mesmo teste.
3. **A ordem vem de um grafo.** O *script* lê o arquivo de dependências entre estados e imprime a ordem
   de `apply`. Um teste com uma *fixture* que tem ciclo (aplicação → dados → aplicação) exige que o
   *script* falhe.
4. **Produção só pela esteira.** O *script* de `apply` recusa o diretório de produção quando a variável
   de confirmação, definida só no *job* de produção da esteira, está ausente. O teste roda o *script* sem
   a variável e exige a recusa.

**Complemento.** Reescreva os três ambientes com Terragrunt e compare: linhas de configuração, o que a
esteira precisa instalar e o que muda na revisão de um PR. Registre a decisão num ADR.

**Checagem**

1. O que é, de fato, um *workspace*, e qual risco ele cria que o diretório por ambiente não cria?
2. Por que uma pré-condição no módulo não basta para o mínimo de produção, e o que a política
   acrescenta?
3. Como a ordem de `apply` entre estados é derivada, e o que um ciclo indica?
4. Onde fica a costura entre Terraform e GitOps, e o que dá errado quando os dois gerenciam o mesmo
   objeto?

## Principais aprendizados

- Ambientes diferem em valores, nunca em código; o artefato promovido é o módulo raiz versionado.
- *Workspace* é um estado a mais com um seletor invisível. Desde a 1.15, o plano salvo recusa o
  *workspace* errado; o `apply` sem plano, não.
- Diretório por ambiente: a pasta é o ambiente, com estado e acesso próprios. Terragrunt e Stacks entram
  por ADR.
- O mínimo de produção vive numa política sobre o plano, que lê as variáveis do JSON.
- A ordem entre estados vem de um grafo declarado; ciclo é erro.
- Terraform em volta do *cluster*, GitOps dentro.
