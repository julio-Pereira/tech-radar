---
id: fabric-cloud-router
title: "Equinix Fabric Cloud Router"
summary: "O FCR transforma ligar duas nuvens de projeto de colocation em roteamento como serviço — e por isso a responsabilidade pelo roteamento passa a ser sua."
estimatedMinutes: 70
references:
  - title: "Equinix Fabric Cloud Router — documentação"
    url: https://docs.equinix.com/fabric-cloud-router
  - title: "Equinix Fabric Cloud Router — BGP"
    url: https://docs.equinix.com/fabric-cloud-router/bgp/fcr-bgp
  - title: "Equinix Fabric Cloud Router — filtros de rota"
    url: https://docs.equinix.com/fabric-cloud-router/bgp/fcr-route-filters
  - title: "Equinix Fabric Cloud Router — pacotes (API)"
    url: https://docs.equinix.com/fabric-cloud-router/fcr-api/fcr-packages-pricing-api
---

## O que é

O **Fabric Cloud Router** (FCR) é um roteador L3 virtual que a Equinix opera dentro do Equinix
Fabric, num **metro** — São Paulo, por exemplo. Não há hardware seu nem gaiola em colocation: você
cria o roteador, liga **conexões** a ele e ele **roteia entre elas**. Esse último ponto é o que
importa. O ExpressRoute e o Partner Interconnect do marco 04 são duas pernas que, sozinhas, só
chegam até o Fabric; é o FCR que recebe as rotas do Azure por uma conexão, as do Google por outra,
e faz uma rede alcançar a outra.

Antes do FCR, ligar duas nuvens por caminho privado era um projeto de colocation: comprar
roteadores, alugar espaço, contratar portas, operar o hardware. Com ele, é um recurso que se cria
por API. O que não mudou: o roteamento continua sendo seu. A Equinix opera a máquina; o que é
anunciado, filtrado e aceito é configuração sua.

## Pacotes

O FCR vem em **pacotes**, que limitam conexões, banda e rotas. Os números publicados hoje
(**conferir** antes de decidir):

| Pacote | Conexões | Banda | Rotas IPv4 / IPv6 |
| --- | --- | --- | --- |
| Lab | até 10 | 50 Mbps por conexão | 50 / 50 |
| Standard | até 25 (recomendado) | até 10 Gbps | 1.000 / 100 |
| Advanced | até 35 (recomendado) | até 50 Gbps | 4.000 / 250 |

A API também lista um pacote Premium, sem limites publicados. Dá para subir de pacote; descer, não,
durante o prazo contratado. O pacote Lab serve para experimentar, não para produção: o limite de
banda por conexão é a primeira coisa que o teste de carga encontra.

## Conexões e roteamento por conexão

Cada perna é uma **conexão** do FCR até um destino: o perfil de serviço de uma nuvem (Azure,
Google), uma porta sua, um parceiro. As conexões do FCR são do tipo IP, de camada 3 (**conferir** a
nomenclatura na API vigente). Em cada conexão você configura o roteamento:

- **direto**: os endereços IP da conexão, do lado do FCR;
- **BGP**: a sessão com o vizinho do outro lado, com ASN, autenticação MD5 e o limite de rotas
  recebidas. Estourou o limite, o FCR reseta a sessão por 5 minutos antes de tentar de novo;
- **filtros de rota** de entrada e de saída, ligados à conexão, e políticas de agregação;
- *AS-path prepend* e *AS override*, para influenciar o caminho do outro lado.

É o marco 03 aplicado peça a peça: cada conexão é uma sessão eBGP, e cada uma precisa do próprio
filtro de entrada, filtro de saída e limite de prefixos.

## Filtro por conexão: o que o FCR aprende não é o que ele anuncia

Por padrão, um roteador anuncia a cada vizinho o que aprendeu dos outros. Num FCR com o Azure, o
Google e um segundo parceiro, isso significa que o parceiro novo aprende a rota do fornecedor de
score — e o fornecedor aprende a do parceiro. Nenhum dos dois devia enxergar o outro.

O **filtro de saída por conexão** é o que impede: para a conexão do parceiro, anuncie só as faixas
do `fin-platform` que ele precisa; para a do fornecedor, idem. O FCR passa a ser um ponto central
de vários parceiros sem virar uma rede onde todos se veem. Esse é o mecanismo do anúncio mínimo que
o marco 08 transforma em regra.

```diagrama
cm-caminho
```

## Service profiles e Marketplace

As nuvens aparecem no Fabric como **service profiles**: o perfil do Azure ExpressRoute, os perfis
do Google Partner Interconnect (um por edge availability domain), e assim por diante. Um fornecedor
também pode publicar o próprio perfil no **Marketplace** do Fabric; aí a conexão vai direto até ele,
sem passar pela nuvem dele. Vale perguntar ao fornecedor se ele tem perfil: muda quem é dono de
cada passo.

## Metro e latência

O FCR fica num metro, e o tráfego entre as duas nuvens passa por ele. Com as duas regiões em São
Paulo, um FCR em São Paulo acrescenta pouco à latência; com o fornecedor em outra região, o metro
escolhido decide se o orçamento de 40 ms do cenário fecha. Escolha o metro medindo a latência até as
duas regiões, não pelo nome.

## FCR × Network Edge

O FCR roteia. Se você precisa de uma função que ele não oferece — NAT para a colisão do marco 02,
firewall com estado, um túnel IPsec terminado no meio do caminho —, a resposta usual da Equinix é o
**Network Edge**: appliances virtuais de fabricantes de rede rodando no Fabric (**conferir** quais
funções o FCR oferece hoje e quais exigem appliance; a Fase 0 não confirmou). Um appliance é mais
uma peça para operar, com licença e atualização. Use quando a função for necessária, não por
hábito.

## Portal, API e Terraform

O FCR e as conexões podem ser criados pelo Fabric Portal, pela API ou pelo provider Terraform
`equinix`. O portal serve para aprender; em produção, a interconexão vive como código (marco 06),
com revisão e histórico.

## O que é da Equinix e o que é seu

| Da Equinix | Seu |
| --- | --- |
| Operar o roteador virtual e a infraestrutura do metro | Escolher pacote e metro |
| Disponibilidade da plataforma, conforme o SLA contratado | Configurar cada conexão: ASN, MD5, limite de rotas |
| Cumprir o limite do pacote | Filtros de entrada e de saída por conexão |
| Entregar as conexões aos perfis de nuvem | Decidir o que cada parceiro enxerga |
| | Redundância: um FCR só é um ponto único de falha (marco 10) |

## O que o laboratório não mostra

O `fcr` do laboratório é um FRR com uma sessão por conexão e os filtros gerados do `topologia.yaml`.
Ele prova o roteamento entre conexões e o efeito de cada filtro. Não mostra o provisionamento e os
estados das conexões no Fabric, o limite real do pacote, o SLA, a manutenção da plataforma nem a
fatura.

## Exemplo numa fintech

O `ledger-core` roda em Azure São Paulo e chama o score do `FornecedorScore` em GCP São Paulo. O FCR
fica no metro de São Paulo, com duas conexões: uma ao circuito ExpressRoute e outra ao attachment do
Partner Interconnect do fornecedor. No ano seguinte, um segundo parceiro, de prevenção a lavagem de
dinheiro, entra com uma terceira conexão — sem projeto novo de colocation, só mais um recurso. A
revisão do PR pega o que faltava: a conexão nova sem filtro de saída teria anunciado ao parceiro a
rota do fornecedor de score.

## Hands-on

**Tutorial.** Complete a topologia do `lab/`: `azure-edge` ↔ `fcr` ↔ `gcp-edge`, com uma VNet
emulada (host do `ledger-core`) atrás da borda Azure e uma VPC emulada (API do fornecedor) atrás da
borda Google. A configuração do `fcr` sai do gerador, como as outras:

```yaml
dominios:
  fcr:
    asn: 65010
    conexoes:
      - { nome: azure, vizinho: azure-edge, saida: [fornecedor-score] }
      - { nome: gcp, vizinho: gcp-edge, saida: [fin-platform-prod] }
```

**Desafio.** Acrescente um terceiro parceiro com a própria conexão e configure os filtros de saída
para que ele alcance só o `fin-platform`.

**Invariantes testáveis**

1. O host Azure alcança a API do fornecedor, e o **traceroute passa pelo `fcr`** (asserção sobre os
   saltos, não só sobre a resposta).
2. Desligar a conexão do `fcr` com o `gcp-edge` torna o fornecedor **inalcançável**: não existe
   outro caminho.
3. O parceiro novo **não** enxerga o fornecedor: nem rota na tabela, nem resposta a ping.
4. Os prefixos na tabela do `fcr` são a união dos permitidos por conexão, nada além.
5. A configuração do `fcr` é gerada do `topologia.yaml`: o teste regera e compara, e falha se alguém
   editou à mão.

**Complemento.** Quantos parceiros, no seu contexto, justificariam um FCR em vez de uma VPN por
parceiro? Escreva o número e o porquê.

**Checagem**

1. O que o FCR faz que as duas pernas sozinhas não fazem?
2. Por que cada conexão precisa do próprio filtro de saída?
3. Quando um appliance no Network Edge entra no desenho?
4. Como você escolhe o metro do FCR?
5. O que continua sendo responsabilidade sua num serviço gerenciado?
6. Por que o FCR fica mais vantajoso quanto mais parceiros houver?

> **Reencontro — `arquitetura-de-solucoes/04`.** Comprar ou construir: o FCR é a versão "comprar"
> do roteador em colocation. Você troca hardware e operação física por pacote, limite e
> dependência de um fornecedor — e mantém a configuração do roteamento.

Cada conexão do FCR é uma integração do catálogo de `arquitetura-de-solucoes/02`: tem dono, contrato
e um parceiro do outro lado. O `fin-interconnect` registra a interconexão como uma entrada desse
catálogo.

## Principais aprendizados

- O FCR é um roteador L3 virtual num metro; o que ele acrescenta às pernas é rotear entre as
  conexões.
- Os pacotes limitam conexões, banda e rotas; o Lab não é para produção.
- Cada conexão é uma sessão eBGP com ASN, MD5, limite de rotas e filtros próprios.
- Sem filtro de saída por conexão, os parceiros se enxergam entre si.
- A Equinix opera a plataforma; o que é anunciado e aceito continua sendo seu.
