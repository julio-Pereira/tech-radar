---
id: on-ramps-de-nuvem
title: "On-ramps: ExpressRoute e Partner Interconnect"
summary: "Cada nuvem tem a sua porta privada, com vocabulário, ordem de provisionamento e limites próprios; errar a ordem trava o projeto por dias."
estimatedMinutes: 65
references:
  - title: "Azure ExpressRoute — fluxos de provisionamento e estados do circuito"
    url: https://learn.microsoft.com/azure/expressroute/expressroute-workflows
  - title: "Azure ExpressRoute — requisitos de roteamento"
    url: https://learn.microsoft.com/azure/expressroute/expressroute-routing
  - title: "Google Cloud — visão geral do Partner Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/partner-overview
  - title: "Google Cloud — provisionamento do Partner Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/how-to/partner/provisioning-overview
  - title: "Google Cloud — ativar conexões do Partner Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/how-to/partner/activating-connections
---

## Duas portas, dois vocabulários

O caminho do `fin-platform` até o `FornecedorScore` tem duas pernas, uma em cada nuvem. No Azure, a
porta privada é o **ExpressRoute**; no Google Cloud, para quem chega por um provedor como a Equinix,
é o **Partner Interconnect**. As duas fazem a mesma coisa em essência — uma sessão BGP entre a
borda da nuvem e alguém de fora, sobre um link que não passa pela internet —, mas com nomes, chaves
e ordens diferentes. No meio fica o Fabric Cloud Router (marco 05), que só consegue rotear entre as
pernas depois que as duas existem.

Este marco não ensina a clicar no portal; ensina **o que existe, em que ordem e quem é dono de cada
passo**. É aí que o projeto trava: uma chave que expira, um estado que ninguém olhou, um passo que
dependia de outra organização.

## Azure ExpressRoute

O recurso central é o **circuito**: uma conexão lógica entre a sua rede e a Microsoft, contratada
com um provedor (aqui, a Equinix) numa **peering location** — o ponto físico onde o provedor
encontra a Microsoft, como São Paulo. Ao criar o circuito, o Azure devolve a **service key**, o
identificador que o provedor usa para saber qual circuito ligar. A cobrança do circuito começa
quando a service key é emitida, não quando o tráfego passa (**conferir** os termos vigentes).

O circuito tem dois estados que importam, e eles são independentes:

- o **estado do provedor**: `NotProvisioned` → `Provisioning` → `Provisioned`. Só o provedor o
  muda, quando conclui o lado dele com a service key;
- o **estado do circuito** do lado da Microsoft, que fica `Enabled` desde a criação.

Só com o provedor em `Provisioned` dá para configurar o **private peering**: a sessão BGP entre a
sua borda e os roteadores da Microsoft, que usam o AS 12076 (os ASNs 65515 a 65520 são reservados
para uso interno do Azure e não servem para o seu lado). O circuito tem **duas conexões**,
primária e secundária, cada uma com a sua sub-rede de peering (o exemplo da documentação usa duas
/30) e a sua sessão BGP. A Microsoft trata as duas como parte do mesmo serviço: um circuito com uma
só conexão funcionando é um circuito degradado, não uma economia (**conferir** os termos do SLA).

O circuito ainda não leva a nenhuma VNet. Para isso existe o **ExpressRoute Gateway**, um recurso
na sub-rede de gateway da VNet, com SKUs de banda e limites diferentes, e a **conexão** entre o
gateway e o circuito. O **FastPath** faz o tráfego de dados contornar o gateway para ganhar
latência, com requisitos de SKU próprios (**conferir**). O **Global Reach** liga dois circuitos
ExpressRoute entre si pelo backbone da Microsoft — serve para ligar dois sites seus, não para chegar
ao Google.

Há limite de prefixos que você pode anunciar no private peering, e ele depende do tipo de circuito
(**conferir** os números vigentes). Passar dele derruba a sessão: é o `max-prefix` do marco 03,
agora do lado da nuvem.

## Google Partner Interconnect

O recurso central é o **VLAN attachment** do tipo Partner, criado numa região e ligado a um
**Cloud Router** — o roteador gerenciado do Google que fala BGP com o lado de fora. No Partner
Interconnect, o Cloud Router usa o ASN **16550**, fixo.

Ao criar o attachment, o Google devolve uma **pairing key**, que termina em /1 ou /2. O sufixo
diz o **edge availability domain**: cada metro tem dois domínios de borda, com manutenção separada,
e a redundância real exige um attachment em cada um. A pairing key é o que o provedor usa para
achar o seu attachment — o papel da service key, do lado do Google — e tem validade limitada
(**conferir** o prazo). Expirou, o caminho é apagar o attachment e criar outro, com chave nova.

O attachment também tem estados:

- `PENDING_PARTNER`: criado, esperando o provedor;
- `PENDING_CUSTOMER`: o provedor configurou o lado dele; falta você **ativar**;
- `ACTIVE`: ativo, a sessão BGP pode subir.

A ativação existe para que ninguém ligue a sua VPC sem você ver; dá para pré-ativar o attachment na
criação, ao custo de abrir mão desse ponto de controle. Configure também o **MTU** do attachment (há
valores suportados — **conferir**) e as **rotas anunciadas** pelo Cloud Router: por padrão ele
anuncia as sub-redes da VPC, e o anúncio customizado é como você limita o que sai.

A disponibilidade de 99,9% pede attachments nos dois edge availability domains de um metro; a de
99,99% envolve mais de uma região (**conferir** a topologia exata, que a documentação consultada
não detalhou).

## Quem é dono de cada passo

No cenário desta trilha, a VPC é do fornecedor, em outra organização do Google Cloud. Então:

| Passo | Dono |
| --- | --- |
| Criar o circuito e receber a service key | `fin-platform` |
| Criar o VLAN attachment e o Cloud Router | fornecedor |
| Entregar a pairing key ao `fin-platform` | fornecedor |
| Criar as duas conexões no Equinix Fabric | `fin-platform` (dono do FCR) |
| Ativar o attachment | fornecedor |
| Configurar o private peering e ligar o gateway | `fin-platform` |

```diagrama
cm-provisionamento
```

Duas organizações, duas chaves e dois relógios. A sequência só fecha se alguém for dono da ordem
inteira — e esse alguém é quem precisa da interconexão, não quem a fornece.

## O que o laboratório não mostra

O `lab/` emula as bordas como roteadores FRR e prova o que é **protocolo**: ASNs, sub-redes,
sessões, filtros. Não mostra a fila de aprovação do provedor, os prazos reais de cada estado, a
fatura que começa com a service key, as cotas de cada conta nem a pairing key que expira enquanto
o seu time espera. Isso o `estados/` modela, e a documentação oficial confirma.

## Exemplo numa fintech

O fornecedor cria o attachment numa sexta e manda a pairing key por e-mail. O time do
`fin-platform` ainda está esperando o provedor provisionar o circuito ExpressRoute, e só volta ao
assunto três semanas depois; a chave já expirou. O fornecedor precisa apagar o attachment e criar
outro, numa janela de mudança que, do lado dele, é mensal. Um mês de atraso por um passo que levaria
dez minutos — e nenhum dos dois times errou nada técnico. Faltou um dono para a ordem e um modelo
que dissesse "esta chave vence em tal data".

## Hands-on

**Tutorial.** No `lab/`, acrescente ao `topologia.yaml` as duas bordas: `azure-edge`, com dois
roteadores (primário e secundário) no AS 12076, e `gcp-edge`, com o Cloud Router no AS 16550. O
gerador produz as configs FRR a partir do arquivo:

```yaml
dominios:
  azure-edge:
    asn: 12076
    links:
      - { nome: primario, rede: 192.168.100.0/30 }
      - { nome: secundario, rede: 192.168.100.4/30 }
  gcp-edge:
    asn: 16550
    links:
      - { nome: dominio-1, rede: 169.254.10.0/29 }
```

Em `estados/`, escreva em Go o ciclo de vida do circuito, do attachment e das conexões do Fabric,
com as transições permitidas e quem pode dispará-las.

**Desafio.** Modele a ordem de provisionamento ponta a ponta, com a validade da pairing key, e faça
o modelo responder: "dado o estado de hoje, qual é o próximo passo e de quem é?".

**Invariantes testáveis**

1. O modelo de estados **rejeita** criar a conexão do Fabric sem uma service key ou pairing key
   válida (inclusive uma pairing key vencida).
2. Ativar o attachment antes de o provedor configurá-lo (fora de `PENDING_CUSTOMER`) é rejeitado.
3. A borda Azure emulada **exige** os dois links: um só é configuração inválida no gerador, que
   falha com mensagem clara.
4. ASNs e sub-redes do laboratório batem com o `topologia.yaml` (teste gerado a partir do arquivo,
   sem lista copiada à mão).

**Complemento.** Liste, no seu caso real, cada chave e cada aprovação do caminho: quem emite, quem
recebe, por onde é enviada e quando vence.

**Checagem**

1. Qual a diferença entre a service key e a pairing key, e quem emite cada uma?
2. Por que o attachment fica em outra organização neste cenário, e o que isso muda na ordem?
3. Por que um circuito com uma só conexão funcionando não é economia?
4. O que é um edge availability domain, e por que a redundância precisa dos dois?

> **Reencontro — `arquitetura-de-solucoes/05`.** As guardrails de nuvem dizem o que cada conta pode
> criar; o ExpressRoute e o attachment são recursos que precisam caber nelas, com dono e etiqueta.

A disponibilidade por região e por célula de `system-design/13` tem aqui a sua versão de rede: os
dois edge availability domains e as duas conexões do circuito são domínios de falha, e só contam se
o tráfego de fato puder passar pelos dois.

## Principais aprendizados

- ExpressRoute e Partner Interconnect fazem a mesma coisa com vocabulários diferentes: circuito e
  service key de um lado, VLAN attachment e pairing key do outro.
- Os estados (`NotProvisioned` → `Provisioned`; `PENDING_PARTNER` → `PENDING_CUSTOMER` → `ACTIVE`)
  dizem quem está esperando quem; leia-os antes de abrir chamado.
- A cobrança começa com a service key, e a pairing key vence: o tempo entre os passos custa dinheiro
  e retrabalho.
- Redundância é parte do produto: duas conexões no circuito, dois domínios de borda no Google.
- Com o fornecedor em outra organização, a ordem inteira precisa de um dono do seu lado.
