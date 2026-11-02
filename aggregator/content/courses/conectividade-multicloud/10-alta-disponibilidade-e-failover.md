---
id: ha-e-failover-de-interconexao
title: "Alta disponibilidade e failover"
summary: "Dois cabos no mesmo prédio não são redundância; redundância é independência provada por falha provocada."
estimatedMinutes: 70
references:
  - title: "Azure ExpressRoute — projeto para alta disponibilidade"
    url: https://learn.microsoft.com/azure/expressroute/designing-for-high-availability-with-expressroute
  - title: "Google Cloud — 99,9% de disponibilidade com Partner Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/partner-creating-999-availability
  - title: "RFC 5880 — BFD"
    url: https://www.rfc-editor.org/rfc/rfc5880
  - title: "Equinix Fabric Cloud Router — documentação"
    url: https://docs.equinix.com/fabric-cloud-router
---

## Redundância é independência

Duas conexões que passam pelo mesmo roteador, pela mesma porta ou pelo mesmo prédio caem juntas. O
nome do que elas compartilham é **domínio de falha**: tudo o que, ao falhar, derruba mais de um
caminho de uma vez. No caminho do `fin-platform` até o fornecedor, os domínios de falha são, do menor
para o maior:

- o **link** (um enlace físico ou lógico);
- a **porta** e o **roteador** de cada lado;
- o **FCR** (um roteador virtual, num metro);
- o **metro** inteiro (energia, prédio, fibra de chegada);
- o **provedor** (a Equinix, numa falha de plataforma).

Redundância é ter dois caminhos que não compartilham o domínio de falha que você quer cobrir. E só
existe depois de provada: um caminho secundário que nunca carregou tráfego é uma hipótese, não uma
redundância.

## O que cada peça oferece

- **ExpressRoute:** o circuito já vem com duas conexões, primária e secundária, em roteadores
  diferentes da Microsoft. Para cobrir a falha de uma peering location inteira, a resposta é um
  segundo circuito em outra localização (**conferir** as opções de alta resiliência vigentes).
- **Partner Interconnect:** dois attachments, um em cada **edge availability domain** do metro,
  cobrem a manutenção de um domínio (o caminho para 99,9%). O nível mais alto envolve mais de um
  metro (**conferir** a topologia exata, que a documentação consultada não detalhou).
- **FCR:** um FCR é um roteador num metro; um FCR só é um ponto único de falha. A forma de cobrir é
  um segundo FCR, cada um com as próprias conexões — ou o modelo de alta disponibilidade que o
  produto oferecer (**conferir**; a documentação consultada não confirmou).

O desenho desta trilha usa dois caminhos completos, em metros diferentes: no metro de São Paulo, o
circuito ER 1, o FCR 1 e o attachment do fornecedor ali; num segundo metro, o circuito ER 2 (noutra
peering location), o FCR 2 e um attachment do fornecedor noutra região — perto do desenho de 99,99%
do Google (**conferir** a topologia suportada, inclusive como os dois circuitos e os dois FCRs se
ligam no Fabric). Cada circuito tem as próprias duas conexões com a Microsoft.

O que os dois caminhos **ainda compartilham** precisa estar escrito: o ExpressRoute Gateway da VNet
(um só, com SKUs redundantes por zona — **conferir**), a região do `ledger-core` e a região da API do
fornecedor. Isso entra na conta do SLA mais abaixo, em série.

```diagrama
cm-failover
```

## Primário/secundário × ativo/ativo

Com dois caminhos, há duas formas de usá-los:

- **primário/secundário**: um caminho carrega tudo, o outro espera. É simples de raciocinar e de
  depurar;
- **ativo/ativo** com **ECMP** (múltiplos caminhos de custo igual): o tráfego se divide entre os dois.
  Usa a capacidade dos dois e não deixa um caminho "frio", mas a ida de uma conexão pode ir por um
  caminho e a volta pelo outro.

Esse último ponto importa por causa do **firewall com estado**: ele precisa ver a ida e a volta da
mesma conexão. Com ECMP e firewalls diferentes em cada caminho, a resposta chega a um firewall que
nunca viu a conexão abrir e é descartada. Ativo/ativo exige estado compartilhado entre os firewalls,
ou hashing simétrico nos dois sentidos; sem isso, primário/secundário é o desenho seguro.

## Como declarar o primário quando não há roteador seu no meio

O *local preference* do marco 03 só funciona num roteador seu que veja os dois caminhos. Neste
desenho, esse roteador não existe: o FCR 1 e o FCR 2 têm um caminho cada, e as bordas são da Microsoft
e do Google. Sem nada declarado, as duas nuvens tendem a usar os dois caminhos em ECMP — o ativo/ativo
que você queria evitar.

A preferência se expressa no que cada FCR **anuncia**:

- para o **Azure**, o FCR 2 anuncia com *AS-path prepend*, e o caminho mais curto pelo FCR 1 vence; o
  gateway também aceita um peso por conexão (**conferir** como o ExpressRoute desempata entre
  circuitos);
- para o **Google**, o FCR 2 anuncia com *prepend* ou MED, e o Cloud Router prefere o caminho do FCR 1
  (**conferir** como o Cloud Router desempata, inclusive com a prioridade das rotas anunciadas).

As duas metades precisam ser feitas: a preferência de um lado decide a ida, a do outro decide a
volta.

## Detecção e convergência

O failover tem duas partes: **detectar** que o caminho morreu e **convergir** para o outro. Com os
temporizadores padrão do BGP, detectar pode levar de 90 s a 3 minutos, porque a sessão só cai quando
o hold timer expira. O **BFD** detecta em frações de segundo e derruba a sessão BGP junto. A
convergência que segue é rápida: as rotas do caminho morto somem, as do outro já estavam lá.

O tempo total vira um número que você declara — o **alvo de convergência** — e um teste que o mede
com uma sonda contínua, enquanto o primário é derrubado de propósito.

## Assimetria

Com firewall com estado no caminho, a ida e a volta precisam usar o mesmo caminho, em regime e em
falha (o ExpressRoute em si não exige simetria; o firewall, sim). A assimetria aparece quando um
lado converge e o outro não, ou quando o *prepend* foi esquecido em um dos anúncios: a ida vai pelo
secundário, a volta insiste no primário que já não existe, ou vai por um firewall que não viu a ida.
O teste de failover verifica os dois sentidos, não só se o ping voltou.

## VPN de backup pela internet: uma decisão explícita

Um caminho de backup por VPN pela internet é barato e cobre a falha da Equinix inteira. Mas o
contrato do `FornecedorScore` exige que o tráfego não passe pela internet. Então o backup por VPN não
é "um extra de segurança": é uma violação do contrato que só acontece no pior momento. A decisão
precisa ser explícita — aceita, com o contrato revisto e o tráfego cifrado, ou proibida, com a rota
padrão bloqueada e um teste que prove que nenhum pacote sai pela internet durante a falha.

## SLA composto, em série e em paralelo

O marco 09 mostrou que peças em **série** multiplicam as disponibilidades, e o caminho fica abaixo da
peça mais fraca. Caminhos em **paralelo** fazem o contrário: o conjunto só fica indisponível se os
dois caírem ao mesmo tempo. Com dois caminhos independentes de 99,84% cada, a indisponibilidade do
par é o produto das indisponibilidades: 0,16% × 0,16%, cerca de 0,0003% — mais de 99,99%.

A conta só vale para a parte que é de fato **independente**. O que os caminhos compartilham fica em
série com o par. No desenho desta trilha, com números ilustrativos: duas pernas de 99,9% em paralelo
dão 1 − 0,1% × 0,1% = 99,9999%; multiplicadas pelo gateway compartilhado, de 99,95%, o **SLA
composto** do caminho fica em cerca de 99,95%. A parte compartilhada domina. Para subir mais, não
adianta uma terceira perna: é preciso reduzir o que é compartilhado. E se os dois caminhos
estivessem no mesmo metro, a manutenção do metro derrubaria os dois, e o número cairia para o do
metro.

## Manutenção: falha planejada

A janela de manutenção do provedor é uma falha anunciada com antecedência. É a melhor oportunidade
de provar o failover — e a pior hora para descobrir que ele nunca funcionou. Cada aviso de
manutenção entra no calendário com a pergunta: qual caminho cai, e o outro aguenta sozinho?

## Exemplo numa fintech

A Equinix agenda uma manutenção no metro de São Paulo para as 23h de uma sexta, a janela em que o
`fin-platform` fecha o dia. O caminho secundário existia no desenho, mas nunca tinha carregado
tráfego. Quando o primário cai, o tráfego vai para o secundário — e volta pelo primário, porque o
*prepend* estava configurado só de um lado. O firewall descarta as respostas; o antifraude passa a
aprovar Pix por timeout, na regra de contingência. Um game day na semana anterior teria encontrado a
assimetria em dez minutos.

## Hands-on

**Tutorial.** No `lab/`, acrescente o segundo caminho completo: segundos links nas bordas, um
segundo `fcr` e o segundo attachment emulado, com BFD ligado em todas as sessões. Declare o primário
pelo que cada `fcr` anuncia: o `fcr` 2 anuncia com *prepend* para as duas bordas.

**Desafio.** Automatize o game day: uma sonda contínua do `ledger-core` à API, a queda provocada do
primário e a medição do tempo de convergência e do caminho de ida e de volta.

**Invariantes testáveis**

1. Com o primário derrubado, o tráfego converge para o secundário em **menos que o alvo declarado**
   (medido pela sonda contínua; o alvo é parâmetro).
2. Durante a falha, **0 pacotes** saem por caminho não autorizado.
3. Ida e volta usam o mesmo caminho em regime e em falha; assimetria detectada reprova o teste.
4. Sem BFD, a convergência é **mais lenta** que com BFD (o teste compara a ordem, não um valor).
5. O SLA composto calculado do `topologia.yaml` — partes compartilhadas em série com as pernas em
   paralelo — bate com o gabarito.

**Complemento.** Quais domínios de falha o seu ambiente real compartilha entre caminhos que você
chama de redundantes?

**Checagem**

1. O que é um domínio de falha, e por que dois links no mesmo FCR não são redundância de FCR?
2. Por que ativo/ativo com ECMP pode quebrar um firewall com estado?
3. O que o BFD muda no tempo de failover, e o que ele não muda?
4. Por que a VPN de backup pela internet é uma decisão, e não um extra?
5. Por que caminhos em paralelo só melhoram o SLA se forem independentes?
6. Por que a janela de manutenção do provedor é uma oportunidade?

> **Reencontro — `system-design/13`.** Regiões e células são domínios de falha da aplicação; o par de
> caminhos deste marco é o mesmo raciocínio aplicado à rede, com o metro no lugar da região.

O RTO e o RPO de `dados-distribuidos/12` medem quanto tempo e quantos dados se perdem num desastre; o
alvo de convergência deste marco é o RTO do caminho de rede, e precisa ser medido do mesmo jeito.

O game day e o post-mortem de `observabilidade/15` são o formato do teste de failover: hipótese,
falha provocada, sinal e aprendizado.

## Principais aprendizados

- Redundância é não compartilhar o domínio de falha que se quer cobrir, e só existe depois de provada.
- ExpressRoute tem duas conexões, Partner Interconnect dois domínios; um FCR só é ponto único de
  falha, e um metro só também.
- Primário/secundário é o desenho seguro com firewall com estado; sem roteador seu no meio, o
  primário se declara no que cada FCR anuncia, nos dois sentidos.
- BFD encurta a detecção; o alvo de convergência é declarado e medido.
- Em paralelo, o SLA composto sobe só na parte independente; o que é compartilhado fica em série e
  domina.
