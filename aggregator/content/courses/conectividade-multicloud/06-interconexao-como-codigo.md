---
id: interconexao-como-codigo
title: "Interconexão como código"
summary: "Interconexão criada no console é a mais difícil de auditar e de desfazer; como código, ela tem revisão, teste e desligamento."
estimatedMinutes: 65
references:
  - title: "Equinix Fabric — Terraform guide (cloud providers)"
    url: https://docs.equinix.com/terraform/guides/equinix_fabric_cloud_providers
  - title: "Terraform provider equinix"
    url: https://registry.terraform.io/providers/equinix/equinix/latest/docs
  - title: "Terraform — testes com mock providers"
    url: https://developer.hashicorp.com/terraform/language/tests/mocking
  - title: "The Twelve-Factor App — Config"
    url: https://12factor.net/config
---

## Por que a interconexão é o pior lugar para o console

Uma interconexão criada no portal funciona no dia seguinte e vira um problema no ano seguinte.
Ninguém lembra por que o filtro de saída anuncia aquele /22, quem aprovou o segundo parceiro, ou se
a conexão do Fabric que ninguém usa pode ser apagada. Ela atravessa três provedores — Azure, Equinix
e Google — e nenhum portal mostra o conjunto. E é a peça cujo erro tem o maior raio de explosão: um
anúncio errado expõe a rede inteira ao vizinho.

Como código, a interconexão ganha o que o resto da infraestrutura já tem: revisão por PR, histórico,
teste antes de aplicar e um desligamento que é o inverso exato da criação. A base de Terraform —
estado, plano, *drift*, módulos — está em `entrega-continua-e-devops/06`; este marco trata do que é
próprio da interconexão.

## Três provedores, uma ordem

A interconexão usa três providers: `azurerm`, `equinix` e `google`. A ordem do marco 04 vira
**dependência no grafo** do Terraform:

- o `azurerm_express_route_circuit` gera a **service key**; a conexão do Fabric para o Azure a
  recebe como chave de autenticação;
- o VLAN attachment do Google gera a **pairing key**; a conexão do Fabric para o Google a recebe da
  mesma forma;
- o private peering e a conexão do ExpressRoute Gateway vêm depois que o circuito está
  provisionado.

Quando o attachment é do fornecedor, em outra organização, ele não está no seu código: a pairing
key entra como **variável**, com a data de validade ao lado, e o seu código só cria a conexão do
Fabric. Quem é dono de cada recurso no código deve ser quem é dono do passo no mundo real.

A Equinix publica guias e módulos de exemplo para essas conexões (**conferir** a manutenção de cada
módulo antes de depender dele; alguns são projetos de laboratório, não parte do provider). O esquema
dos recursos de conexão mudou entre versões do provider: fixe a versão e confira os exemplos contra
ela.

```diagrama
cm-iac
```

## Testar sem conta: `terraform test` com mock provider

Testar a interconexão contra contas reais custa dinheiro e cria recursos que cobram desde a
service key. O **`mock_provider`** do `terraform test` (Terraform 1.7 ou mais novo) substitui um
provider por um falso: os recursos "existem" no teste, com valores calculados por você, e nenhuma
chamada sai da máquina. É o suficiente para provar o que importa aqui — a ordem e as ligações entre
recursos:

```hcl
mock_provider "azurerm" {
  mock_resource "azurerm_express_route_circuit" {
    defaults = { service_key = "00000000-0000-0000-0000-000000000001" }
  }
}
mock_provider "equinix" {}
mock_provider "google" {}

run "conexao_usa_a_service_key_do_circuito" {
  assert {
    condition     = module.fcr.chave_conexao_azure == module.azure_er.service_key
    error_message = "a conexão do Fabric não está ligada à service key do circuito"
  }
}
```

O mock não prova que a Equinix aceita a conexão nem que o BGP sobe — isso é o laboratório (protocolo)
e a documentação (produto). Prova que o código liga as peças na ordem certa, o que é exatamente o
erro que o console esconde.

## Segredos fora do código

A interconexão tem credenciais dos três provedores e a senha MD5 de cada sessão BGP. Pelo fator
III do 12-factor, configuração que muda por ambiente — e segredo acima de tudo — vem do ambiente,
não do repositório. As credenciais de API vêm do pipeline, por identidade de carga de trabalho
sempre que o provedor aceitar; a senha MD5 vem do cofre de segredos, por ambiente. Lembre que o
**estado** do Terraform guarda os valores dos recursos, inclusive os sensíveis: o backend remoto
precisa de criptografia e de acesso restrito, e quem pode ler o estado pode ler a senha.

## Política sobre o plano

O plano em JSON passa por um **motor de política** (o mesmo das trilhas `arquitetura-de-solucoes` e
`entrega-continua-e-devops`, por ADR) antes de qualquer `apply`. Para a interconexão, quatro regras
pegam os erros caros:

1. **toda conexão tem filtro de saída** — sem ele, o FCR anuncia tudo o que aprendeu;
2. **nenhum caminho único** — circuito com as duas conexões, attachments nos dois domínios;
3. **nenhum anúncio mais amplo que o limite** — por padrão, nada maior que um /24 sai para um
   parceiro, e o limite é parâmetro da política;
4. **todo recurso tem dono** — etiqueta de time e de parceiro, para o desligamento achar o que é de
   quem.

Cada regra vem com uma fixture que a viola, para provar que a regra reprova de fato.

## *Drift*

Alguém mudou o filtro no portal do Fabric às três da manhã para resolver um incidente. Agora o
código diz uma coisa e o roteador faz outra. Um `plan` agendado, que falha se houver diferença,
transforma o *drift* em alerta, e o caminho de volta é um PR: ou o código passa a refletir a
mudança, com revisão, ou o `apply` desfaz.

## Desligamento como código

Desligar uma interconexão é o mesmo grafo ao contrário: primeiro tirar as rotas (filtro de saída
vazio), depois a conexão do Fabric, por fim o circuito ou o attachment — e só então parar de pagar.
Um `destroy` sem ordem pode apagar o circuito enquanto a conexão ainda existe, ou deixar uma conexão
órfã cobrando. O marco 09 usa esse desligamento para o *offboarding* do fornecedor.

## Exemplo numa fintech

Um PR acrescenta o segundo parceiro: uma conexão nova no FCR, com BGP e limite de prefixos. O
`terraform test` passa; a política reprova: a conexão não tem filtro de saída. Se o PR tivesse
passado, o parceiro novo aprenderia a rota do `FornecedorScore`. O autor acrescenta o filtro, a
política passa, o plano real vai para revisão — e o revisor vê, numa linha, exatamente o que será
anunciado ao parceiro.

## Hands-on

**Tutorial.** Em `iac/`, escreva três módulos: `azure-er` (circuito, peering, gateway e conexão),
`fcr` (o FCR e as conexões, com BGP e filtros) e `gcp-partner` (o Cloud Router e o attachment, para
quando o attachment for seu). Escreva os testes com `mock_provider` para os três providers.

**Desafio.** Escreva as quatro regras de política sobre o plano em JSON, cada uma com uma fixture
que a viola.

**Invariantes testáveis**

1. `terraform test` passa **offline**: o teste falha se encontrar no ambiente uma credencial dos
   três provedores (`ARM_CLIENT_SECRET`, `GOOGLE_CREDENTIALS`, `EQUINIX_API_CLIENTSECRET` e afins).
2. No plano mockado, a conexão do Fabric **depende** da service key do circuito e da pairing key do
   attachment (o teste verifica a ligação, não só que o recurso existe).
3. A política reprova cada fixture: conexão sem filtro, caminho único, anúncio maior que o limite,
   recurso sem dono.
4. A varredura de segredos no repositório não encontra nada.

**Complemento.** Compare com o jeito como a sua empresa provisiona redes hoje: quem pode mudar uma
rota em produção, e onde fica o registro disso?

**Checagem**

1. Por que a conexão do Fabric depende da service key no grafo, e o que acontece se a ordem for
   ignorada?
2. O que o `mock_provider` prova, e o que ele não prova?
3. Por que a política roda sobre o plano, e não só no PR?
4. Como o *drift* aparece, e qual é o caminho de volta?

> **Reencontro — `engenharia-de-plataforma/05`.** Ambientes como serviço: a interconexão é um
> recurso de plataforma, oferecido por módulo e política, não por chamado.

As guardrails de `arquitetura-de-solucoes/05` dizem o que cada conta pode criar; as regras deste
marco são as mesmas guardrails, aplicadas ao que a interconexão anuncia.

A senha MD5 e as credenciais dos provedores seguem o ciclo de `seguranca-aplicacao/10`: cofre,
rotação e nenhum segredo no Git.

## Principais aprendizados

- Interconexão no console não tem revisão, histórico nem desligamento seguro; como código, tem.
- A ordem entre provedores vira dependência no grafo: a chave do circuito ou do attachment alimenta
  a conexão do Fabric.
- `terraform test` com `mock_provider` prova as ligações sem conta; protocolo e produto se provam em
  outro lugar.
- Política sobre o plano pega filtro ausente, caminho único, anúncio amplo e recurso sem dono.
- *Drift* vira alerta e PR; desligamento é o grafo ao contrário.
