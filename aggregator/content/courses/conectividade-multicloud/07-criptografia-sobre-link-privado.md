---
id: criptografia-sobre-link-privado
title: "Criptografia sobre link privado"
summary: "Privado não é cifrado: quem decide se trafegar em claro é aceitável é o seu modelo de ameaça, não o folheto."
estimatedMinutes: 65
references:
  - title: "Azure ExpressRoute — opções de criptografia"
    url: https://learn.microsoft.com/azure/expressroute/expressroute-about-encryption
  - title: "Google Cloud — HA VPN over Cloud Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/ha-vpn-interconnect
  - title: "Google Cloud — MACsec para Cloud Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview
  - title: "strongSwan — documentação"
    url: https://docs.strongswan.org/
---

## Privado não é cifrado

"Link privado" quer dizer que o tráfego não passa pela internet pública. Não quer dizer que ninguém
possa lê-lo. O ExpressRoute via provedor e o Partner Interconnect transportam os pacotes como
chegam: se a aplicação mandou HTTP em claro, ele atravessa em claro o enlace do provedor, o Equinix
Fabric e o FCR. O meio é mais restrito que a internet, mas tem gente: o provedor, a Equinix, quem
opera os roteadores de borda das nuvens, quem tiver acesso ao meio físico.

Se trafegar em claro por esse caminho é aceitável é uma decisão do **modelo de ameaça**, não do
folheto do produto. E para o score do `FornecedorScore`, que leva CPF, a resposta quase sempre é
não.

## O que cada camada protege

Três camadas de criptografia podem existir no caminho, e cada uma protege um trecho diferente:

- **MACsec** cifra o **enlace**, entre dois equipamentos ligados diretamente. No Azure, só existe no
  ExpressRoute Direct (portas físicas suas na Microsoft), não no circuito via provedor. No Google,
  no Partner Interconnect, cobre só o trecho entre o roteador do Google e o do provedor. Num caminho
  com o FCR no meio, o MACsec não vai de ponta a ponta.
- **IPsec** cifra o **pacote IP** entre dois gateways. No Azure, um VPN Gateway pode estabelecer
  túneis sobre o private peering do ExpressRoute; no Google, o **HA VPN over Cloud Interconnect** faz
  o mesmo sobre os attachments, inclusive no Partner Interconnect. Quem roteia no meio — o FCR —
  enxerga só os endereços externos dos dois gateways.
- **mTLS** cifra e autentica na **aplicação**: o `ledger-core` e a API de score se identificam por
  certificado, e o conteúdo vai cifrado do processo de um ao processo do outro. É o que o mundo FAPI
  já exige, e o único que diz *quem* está do outro lado.

```diagrama
cm-camadas
```

A combinação exata desta trilha — VPN Gateway do Azure sobre o ExpressRoute, HA VPN do Google sobre
o Partner Interconnect, os dois se falando através do FCR — **não foi confirmada** na documentação
dos três fornecedores (**conferir** antes de desenhar). Se não for suportada como desenhado, as
saídas são um appliance de VPN no Network Edge, terminando o IPsec no meio do caminho, ou o **mTLS
obrigatório** como camada de cifra, com IPsec onde o produto permitir. Em qualquer caso, o mTLS
fica: é a camada que não depende do caminho.

## Defesa em profundidade tem preço

Cada camada custa. O IPsec limita a banda ao que o gateway aguenta (o SKU do VPN Gateway e o número
de túneis do HA VPN viram teto do caminho), acrescenta latência de cifra e consome CPU nos gateways.
O mTLS custa handshake e gestão de certificados. A pergunta não é "qual é a mais segura", é "qual
ameaça cada uma cobre, e qual sobra sem ela":

| Ameaça | MACsec (via provedor) | IPsec | mTLS |
| --- | --- | --- | --- |
| Leitura no enlace físico | parcial | sim | sim |
| Leitura no provedor ou no FCR | não | sim | sim |
| Serviço falso do outro lado | não | não | sim |
| Leitura dentro da VNet ou da VPC | não | não | sim |

## MTU e MSS: o bug clássico

Encapsular custa bytes. O IPsec acrescenta cabeçalhos a cada pacote, e um pacote que cabia no enlace
deixa de caber. E o enlace pode nem ter os 1.500 bytes que se supõem: o VLAN attachment do Partner
Interconnect usa MTU de 1.440 por padrão, e o attachment cifrado para HA VPN fica em 1.440 (**conferir**
os valores vigentes), enquanto o lado Azure costuma estar em 1.500. Meça o MTU do caminho inteiro; não
suponha. Se nada for ajustado, o resultado é traiçoeiro: requisições pequenas
passam, o handshake TLS às vezes passa, e as **respostas grandes travam**, porque os pacotes cheios
são descartados e a mensagem ICMP que avisaria do tamanho também é filtrada no caminho.

A correção é o **MSS clamping**: o gateway reescreve o tamanho máximo de segmento TCP anunciado no
início da conexão, para que cada pacote, já encapsulado, caiba no enlace. Os gateways das nuvens
publicam valores recomendados de MTU e MSS para os seus túneis (**conferir** os valores vigentes de
cada um); o seu teste prova que o valor escolhido funciona com uma resposta grande de verdade.

## Falha fechada

Se o túnel IPsec cair, o tráfego precisa **parar**, não seguir em claro pelo caminho privado que
continua de pé. Isso é uma decisão de roteamento: a rota para a API do fornecedor só existe *através*
do túnel, e o caminho sem túnel não a anuncia. Falha aberta — "se o IPsec cair, pelo menos
funciona" — transforma uma queda do gateway num vazamento de CPF que ninguém percebe.

No Azure há uma armadilha específica: quando o mesmo prefixo chega pelo ExpressRoute e pela VPN, o
ExpressRoute tende a vencer (**conferir** a precedência vigente). Se o prefixo do fornecedor vazar
pelo FCR para o circuito, fora do túnel, o tráfego passa a ir em claro sem que nada caia. O filtro do
FCR precisa impedir que esse prefixo chegue ao circuito, e o teste de captura do Hands-on é o que
prova.

## Chaves e certificados

Os certificados do IPsec e do mTLS vencem; as chaves pré-compartilhadas do IPsec não vencem, mas
precisam de rotação do mesmo jeito. Tudo no cofre, por ambiente, com renovação automática e alerta
antes do vencimento. Um
certificado vencido derruba a integração do mesmo jeito que um ataque, e é bem mais comum.

## O modelo de ameaça decide

O modelo de ameaça responde quem tem acesso a cada trecho: o meio físico, o provedor, o roteador
virtual, a rede dentro de cada nuvem. A classificação do dado decide a exigência: o score com CPF é
**dado pessoal** sob a LGPD, e a política interna de classificação diz o que isso exige no
transporte (**conferir** a política da sua organização). "É link privado" responde só a primeira
linha da tabela acima.

## Exemplo numa fintech

A auditoria interna pergunta se o score, que leva o CPF do cliente, trafega cifrado até o
fornecedor. A primeira resposta do time é "é link privado, não passa pela internet". A auditoria
não aceita: quer saber quem pode ler o tráfego no provedor e no FCR, e o que acontece se a cifra
falhar. A resposta que fecha o achado tem três partes: mTLS obrigatório entre o `ledger-core` e a
API, com certificado por organização; IPsec entre as bordas onde o produto permite; e um teste
automatizado que captura o tráfego no enlace e prova que o CPF não aparece — inclusive com o túnel
derrubado.

## Hands-on

**Tutorial.** No `lab/`, suba um túnel IPsec (strongSwan) entre `azure-edge` e `gcp-edge`, por cima
do caminho do `fcr`, e configure mTLS entre o host do `ledger-core` e a API do fornecedor, com uma
CA local de teste.

**Desafio.** Ajuste MTU e MSS para que uma resposta de 64 KB atravesse o túnel, e mostre o
travamento sem o ajuste.

**Invariantes testáveis**

1. Uma captura no enlace do `fcr` **não contém** o CPF de teste nem cabeçalhos HTTP em claro.
2. Um cliente sem certificado é **rejeitado** pela API (mTLS).
3. Com o MSS ajustado, a resposta de 64 KB atravessa sem fragmentação nem travamento; sem o ajuste,
   ela **trava** (o teste demonstra as duas situações).
4. Derrubar o IPsec **interrompe** o tráfego, em vez de deixá-lo seguir em claro (falha fechada).

**Complemento.** Escreva o parágrafo que você entregaria ao auditor, com cada camada, o trecho que
ela protege e o teste que prova.

**Checagem**

1. Por que "link privado" não responde à pergunta "está cifrado?"?
2. Que trecho cada camada (MACsec, IPsec, mTLS) protege no caminho com o FCR?
3. Por que só as respostas grandes travam quando o MSS não é ajustado?
4. O que é falha fechada, e como o roteamento a garante?
5. Por que o mTLS fica mesmo quando o IPsec funciona?
6. Quem decide se trafegar em claro é aceitável?

> **Reencontro — `seguranca-aplicacao/07`.** O mTLS deste marco é o mesmo do FAPI: certificado como
> identidade da organização, validado de verdade, não só desenhado no diagrama.

O modelo de ameaça de `seguranca-aplicacao/01`, com fronteiras de confiança no diagrama de fluxo de
dados, é onde o provedor, a Equinix e o FCR aparecem como fronteiras: cada um é um trecho que alguém
além de você opera.

O `spring-boot/09` mostra o mesmo FAPI do lado do serviço Java: a configuração do cliente mTLS que
o `ledger-core` usa para chamar o fornecedor.

## Principais aprendizados

- Privado não é cifrado: o caminho via provedor e o FCR transportam o que receberem.
- MACsec protege o enlace, IPsec o pacote entre gateways, mTLS a conversa entre aplicações; só o
  mTLS diz quem está do outro lado.
- Encapsular exige ajuste de MTU e MSS, ou as respostas grandes travam em silêncio.
- Túnel caído tem de parar o tráfego: falha fechada é decisão de roteamento.
- O modelo de ameaça e a classificação do dado decidem a exigência, e um teste de captura a prova.
