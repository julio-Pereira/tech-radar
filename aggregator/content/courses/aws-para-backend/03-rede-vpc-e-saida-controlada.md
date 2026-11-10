---
id: rede-vpc-e-saida-controlada
title: "Rede: VPC e saída controlada"
summary: "Em fintech, a pergunta de rede que importa é por onde o dado sai; a resposta certa é por um lugar só, e conhecido. Sub-redes por AZ, security group × NACL, NAT Gateway e o custo dele (US$ 0,045/h e US$ 0,045/GB em us-east-1, nov 2026) × gateway endpoint gratuito, PrivateLink, Network Firewall, Transit Gateway e flow logs — com cinco regras sobre o plano que pegaram, no laboratório, o SSH aberto, o endpoint sem política e a rota privada para a internet."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [seguranca, plataforma]
references:
  - title: "Amazon VPC — Gateway endpoints"
    url: https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
  - title: "Amazon VPC — Pricing for NAT gateways"
    url: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
  - title: "What is AWS Network Firewall?"
    url: https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html
  - title: "AWS Prescriptive Guidance — Centralized egress"
    url: https://docs.aws.amazon.com/prescriptive-guidance/latest/transitioning-to-multiple-aws-accounts/centralized-egress.html
---

## A pergunta certa é por onde o dado sai

Equipes de rede costumam começar pela entrada: quem consegue chegar ao serviço. Em fintech, a pergunta
que derruba auditoria é a outra: **por onde o dado sai**. Um serviço com dado de cliente que alcança
qualquer endereço da internet pode mandar esse dado para qualquer lugar, por um erro ou por um ataque. A
resposta certa é "por um lugar só, e conhecido", com uma lista do que pode sair.

## A VPC e as sub-redes

Uma **VPC** é a rede privada da conta numa região, com um CIDR (`10.40.0.0/16`, por exemplo). Ela se divide
em **sub-redes**, e cada sub-rede pertence a **uma** AZ. O desenho padrão do `fin-aws` tem três camadas, em
três AZs:

| Camada | Rota padrão (`0.0.0.0/0`) | O que mora nela |
| --- | --- | --- |
| pública | *internet gateway* | só o *load balancer* público e o NAT Gateway |
| aplicação | nenhuma, ou o NAT / o *firewall* de saída | os serviços |
| dados | nenhuma | bancos e caches |

O que faz uma sub-rede ser "pública" é só a **tabela de rotas**: uma rota para o *internet gateway*.
Nenhuma sub-rede de aplicação ou de dado tem essa rota.

## *Security group* × NACL

| | *Security group* | NACL |
| --- | --- | --- |
| Onde | na interface de rede (instância, tarefa, função na VPC) | na sub-rede |
| Estado | **com estado**: a resposta de uma conexão permitida volta sozinha | **sem estado**: a ida e a volta precisam de regra |
| Regras | só `Allow` | `Allow` e `Deny`, avaliadas em ordem |
| Referência | aceita outro *security group* como origem | só CIDR |

O *security group* é a ferramenta do dia a dia. Uma regra do tipo "o *security group* da aplicação aceita
o do *load balancer* na porta 8443" não depende de endereço, e por isso sobrevive a escala e
reimplantação. A NACL fica para a negação grossa por sub-rede, como bloquear uma faixa inteira.

## Sair para os serviços da AWS sem passar pela internet

Um serviço numa sub-rede privada que chama o DynamoDB ou o S3 precisa de um caminho. O caminho preguiçoso
é o **NAT Gateway**: ele funciona, mas leva o tráfego para os *endpoints* públicos da AWS e cobra por
isso. Em `us-east-1`, conferido em 10 nov 2026: **US$ 0,045 por hora** de NAT Gateway e **US$ 0,045 por GB**
processado, além da transferência normal. Tráfego entre AZs custa **US$ 0,01 por GB em cada direção**. Um
NAT Gateway numa AZ só, servindo as três, paga as duas tarifas e vira ponto único de falha.

Os ***VPC endpoints*** levam o tráfego para o serviço sem sair da rede da AWS:

- **Gateway endpoint**, só para **S3 e DynamoDB**. É uma entrada na tabela de rotas, **sem custo** por hora
  nem por GB.
- **Interface endpoint** (PrivateLink), para os demais serviços (SQS, Secrets Manager, KMS, STS...). É uma
  interface de rede na sub-rede, com DNS privado, e **é cobrado** por hora e por GB.

Os dois aceitam uma **política de *endpoint***, que é a última barreira: mesmo que um papel tenha
permissão larga, o *endpoint* do DynamoDB da VPC do ledger só deixa passar chamadas para a tabela
`ledger-lancamentos`. Um *endpoint* sem política aceita tudo.

## A saída para a internet, num lugar só

Alguns serviços precisam sair para a internet: a API de um parceiro, o DICT do Pix, um provedor de
antifraude. O padrão é a **saída centralizada**:

- uma VPC de saída, na conta de rede compartilhada (marco 01);
- o **AWS Network Firewall** ou um *proxy* com lista de domínios permitidos;
- o NAT Gateway atrás dele;
- as VPCs dos serviços ligadas por **Transit Gateway**.

O Network Firewall filtra domínios pelo **SNI** do TLS, sem ler o conteúdo cifrado. Dois cuidados
conferidos na documentação:

- no modelo centralizado, a variável `HOME_NET` precisa incluir os CIDRs de todas as VPCs atendidas, ou a
  inspeção de domínio só vale para a VPC do *firewall*;
- o SNI pode ser forjado. Por isso a AWS recomenda combinar o *firewall* com o Route 53 Resolver DNS
  Firewall.

**Transit Gateway × *peering*.** O *VPC peering* liga duas VPCs, sem transitividade. Ele é barato e simples
para poucos pares. O **Transit Gateway** é um roteador central, com tabelas de rota e segmentação, e é o
que permite a saída centralizada e a inspeção. Com mais de três ou quatro VPCs, ou com qualquer exigência
de inspeção, a escolha é o Transit Gateway.

**DNS e endereços.** O **Route 53 Resolver** resolve nomes privados entre VPCs e com a rede local. Os
CIDRs da AWS não podem sobrepor os das outras nuvens e dos parceiros (`conectividade-multicloud/02`). A
segmentação e o anúncio mínimo de rotas seguem `conectividade-multicloud/08`.

**Auditoria.** Os ***VPC flow logs*** registram quem falou com quem, em cada interface. Eles são a
evidência de que a saída só aconteceu pelo lugar certo. A segmentação dentro do *cluster* fica em
`kubernetes/11`, e o TLS na borda em `seguranca-aplicacao/11`.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| VNet | VPC | na AWS, cada sub-rede pertence a uma AZ; no Azure, a sub-rede é regional |
| NSG | *security group* (+ NACL) | o *security group* aceita outro *security group* como origem; a NACL, sem estado, não tem par direto no NSG |
| Private Endpoint | *interface endpoint* (PrivateLink) | para S3 e DynamoDB existe o *gateway endpoint*, gratuito, sem equivalente no Azure |
| Azure Firewall | AWS Network Firewall | os dois filtram por domínio; no AWS, a inspeção centralizada passa pelo Transit Gateway |
| vWAN / *hub* | Transit Gateway | o Transit Gateway é só o roteador; o *hub* gerenciado do vWAN não tem par direto |

## Provar a rede sobre o plano

A rede do `fin-aws` é Terraform, e as cinco regras do Desafio rodam sobre o JSON do `plan`, sem conta.
No laboratório (provedor `aws` 6.72.0, 18 recursos), o plano com duas violações deixadas de propósito
reprovou nas duas:

```text
FAIL - plan.json - main - aws_security_group.app aceita 0.0.0.0/0 na porta 22
FAIL - plan.json - main - s3 sem gateway endpoint com política restrita a recursos do serviço
```

Uma mutação que pôs uma rota para o *internet gateway* na tabela das sub-redes de aplicação também
reprovou. Uma armadilha da regra: no JSON do plano, o bloco `route` do `aws_route_table` aparece na
configuração como **atributo** com uma lista de `references`, e não como lista de blocos. A primeira versão
da regra procurava a lista de blocos e não pegou a mutação. Toda regra precisa de uma *fixture* que a faça
falhar.

## Exemplo numa fintech

O `ledger-core` gravava no DynamoDB a partir de sub-redes privadas, pelo único NAT Gateway da VPC, numa
AZ só. Ninguém tinha olhado o caminho: funcionava. A fatura mostrou o custo de processamento do NAT e de
transferência entre AZs crescendo com o volume de lançamentos. A auditoria perguntou por que o tráfego do
ledger saía para um *endpoint* público. Um *gateway endpoint* para o DynamoDB, com política restrita à
tabela do ledger, resolveu as duas coisas e removeu o NAT do caminho do dado.

## Hands-on

**Tutorial.** Escreva a VPC do `fin-aws` em Terraform: três AZs, sub-redes públicas, de aplicação e de
dados, *internet gateway* só na tabela pública, e rode o `plan` sem conta. Leia no JSON como o `route` e
as referências aparecem.

**Desafio.** A rede do `fin-aws` em três AZs, com *gateway endpoints* para S3 e DynamoDB, *security
groups* por camada e *flow logs*.

**Invariantes testáveis** (sobre o plano)

1. **Nenhuma sub-rede de aplicação ou de dado tem rota para *internet gateway*.** A mutação que acrescenta
   a rota reprova.
2. **Nenhum *security group* aceita `0.0.0.0/0` em entrada**, exceto o do *load balancer* público, na porta
   443. A *fixture* com SSH aberto reprova.
3. **S3 e DynamoDB por *gateway endpoint* com política restrita** ao *bucket* e à tabela do serviço. O
   *endpoint* sem política reprova.
4. ***Flow logs* em todas as VPCs.** A *fixture* sem `aws_flow_log` reprova.
5. **Nenhum CIDR sobrepõe as bordas das outras nuvens.** A regra lê os CIDRs das bordas (o `topologia.yaml`
   de `conectividade-multicloud`, ou uma *fixture* equivalente) e usa `net.cidr_intersects`. Uma borda
   `10.40.128.0/17` contra a VPC `10.40.0.0/16` reprova.

**Complemento.** Com uma conta real e orçamento criado antes, suba um NAT Gateway por uma hora, envie 1 GB
por ele e compare o custo com o mesmo tráfego por *gateway endpoint* no Cost Explorer do dia seguinte.
Destrua tudo no fim.

**Checagem**

1. O que torna uma sub-rede pública?
2. Quando usar NACL, se o *security group* já filtra?
3. Por que o *gateway endpoint* de S3 e DynamoDB é preferível ao NAT, e quando ele não serve?
4. O que o Network Firewall vê do tráfego TLS, e o que ele não vê?

## Principais aprendizados

- A pergunta que importa é por onde o dado sai; a resposta é um lugar só, com lista de domínios.
- Pública é a sub-rede com rota para o *internet gateway*. Aplicação e dados nunca têm essa rota.
- *Security group* com estado, por interface, referenciando outro *security group*; NACL sem estado, por
  sub-rede.
- Para S3 e DynamoDB, *gateway endpoint* gratuito e com política; NAT custa por hora, por GB e entre AZs.
- Saída centralizada com Network Firewall e Transit Gateway; *peering* para poucos pares.
- *Flow logs* são a evidência. As regras sobre o plano precisam de uma *fixture* que as faça falhar.
