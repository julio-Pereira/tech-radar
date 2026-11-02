---
id: segmentacao-e-anuncio-minimo
title: "Segmentação e anúncio mínimo"
summary: "O roteador decide o que é alcançável; o firewall decide o que é permitido — e um fornecedor conectado deve alcançar só o que o contrato diz."
estimatedMinutes: 60
references:
  - title: "Equinix Fabric Cloud Router — filtros de rota"
    url: https://docs.equinix.com/fabric-cloud-router/bgp/fcr-route-filters
  - title: "Azure — grupos de segurança de rede"
    url: https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview
  - title: "Google Cloud — políticas de firewall"
    url: https://docs.cloud.google.com/firewall/docs/firewall-policies-overview
  - title: "MANRS — boas práticas de roteamento"
    url: https://www.manrs.org/
---

## Alcançável × permitido

Duas perguntas diferentes, respondidas por peças diferentes:

- **o que é alcançável** é decisão do roteamento: se não há rota, o pacote não tem para onde ir;
- **o que é permitido** é decisão do firewall: há rota, mas a regra deixa passar ou não.

Uma interconexão com fornecedor precisa das duas, e na ordem certa. O roteamento é a primeira
barreira, porque o que não é anunciado nem existe para o outro lado. O firewall é a segunda, porque
rota não é autorização: o fornecedor alcançar o /28 do `ledger-core` não quer dizer que qualquer
porta desse /28 deva responder.

## Anúncio mínimo

**Anúncio mínimo** é anunciar ao parceiro só o que o contrato diz que ele precisa alcançar — os /28
combinados, não a VNet inteira, muito menos o agregado corporativo. É a aplicação direta do filtro
de saída do marco 03 e do filtro por conexão do marco 05, com uma regra de negócio por trás: o
catálogo de parceiros (marco 09) diz, para cada um, a lista de prefixos, e o filtro é gerado dela.

O anúncio mínimo vale nos dois sentidos. O que você **aceita** do fornecedor também é mínimo: os
prefixos dele que você combinou, nada além — o vazamento de rota do marco 03 é o motivo.

## Filtro em mais de um ponto

O caminho tem três roteadores que podem filtrar: a borda Azure, o FCR e o Cloud Router do
fornecedor. Filtrar em um só ponto faz desse ponto o único que não pode errar. Filtrar nos três
transforma um erro de configuração num erro que ainda não abre a rede:

- na **borda Azure**, o que sai para o FCR: só os /28 da zona de parceiros;
- no **FCR**, por conexão: o que cada parceiro recebe e o que cada um pode anunciar;
- no **Cloud Router** do fornecedor: as rotas anunciadas customizadas, que ele controla — e que o
  contrato deve exigir.

O terceiro ponto é do fornecedor, e por isso você não pode contar só com ele.

```diagrama
cm-zona-parceiros
```

## Firewall que nega por padrão

Em cada nuvem, o firewall fica entre o caminho do parceiro e as cargas: no Azure, grupos de
segurança de rede (NSG) e, numa topologia de *hub*, o Azure Firewall; no Google, as regras e as
políticas de firewall da VPC. A regra-base é **negar tudo**; cada liberação tem origem, destino,
porta, **dono** e **motivo**, e nasce do catálogo de parceiros, não de um pedido avulso.

## Zona de parceiros

Uma **zona de parceiros** é uma VNet (ou VPC) de trânsito, dedicada a interconexões com terceiros,
entre o caminho privado e as redes de produção. Ela concentra o que é específico de parceiro — o
firewall, o NAT do marco 02, os registros de fluxo — e é a única coisa que o FCR enxerga do lado do
`fin-platform`. A rede corporativa não é anunciada para lá; a de produção só pelos /28 que cada
parceiro precisa.

## Zero trust: identidade além de IP

Segmentar por IP é necessário e não basta: um endereço diz de onde o pacote veio, não quem o
mandou. O modelo **zero trust** acrescenta a identidade do serviço: o mTLS do marco 07, com
certificado por organização, autentica o fornecedor em cada chamada, mesmo dentro do /28 permitido.
Rota, firewall e identidade: três decisões independentes, e o acesso só acontece quando as três
dizem sim.

## DNS privado entre nuvens

O `ledger-core` chama o fornecedor por nome, não por IP. O nome precisa resolver para o endereço
privado do caminho — e só dentro da zona privada. As saídas usuais são uma zona DNS privada com o
registro do fornecedor e um encaminhamento condicional entre os resolvedores das duas nuvens.
O cuidado é o inverso: não expor ao fornecedor a sua zona interna inteira por um encaminhamento
amplo demais.

## Controle de saída e trânsito indevido

Dois usos do seu caminho que ninguém contratou:

- **saída para a internet**: o fornecedor usa a sua rota padrão, se você a anunciar, e passa a sair
  para a internet pela sua rede. Nunca anuncie a rota padrão a um parceiro;
- **trânsito entre parceiros**: o fornecedor A alcança o fornecedor B pelo seu FCR, porque o FCR
  aprendeu as duas rotas e anunciou uma ao outro. O filtro por conexão impede; o teste prova.

## Registro de fluxo

Os **registros de fluxo** (flow logs) das duas nuvens dizem quem falou com quem, quando e quanto.
São a evidência que a auditoria pede ("o fornecedor só acessou o que devia?") e o que o marco 11 usa
na observabilidade. Guarde-os pelo prazo que a política de retenção exigir.

## Exemplo numa fintech

Um analista abre um chamado: "libera a /16 para o fornecedor, que é mais fácil do que ficar pedindo
/28". O teste de segmentação roda com a mudança proposta e lista o que passaria a ser alcançável a
partir do fornecedor: o banco de dados do ledger, o servidor de build, o painel administrativo. O
chamado é fechado com o teste anexado. O que o fornecedor precisava era um segundo /28, com dono e
motivo, e ele entra pelo catálogo.

## Hands-on

**Tutorial.** No `lab/`, gere os filtros das três bordas e as regras de firewall a partir do
catálogo de parceiros, e emule a zona DNS privada com o registro do fornecedor.

**Desafio.** Prove a segmentação: escreva a varredura que, a partir do fornecedor, tenta todos os
destinos do `fin-platform` e compara com a lista do contrato.

**Invariantes testáveis**

1. A partir do fornecedor, **só** os destinos combinados respondem (varredura no laboratório).
2. Nenhum prefixo corporativo fora da lista aparece na tabela de rotas do `gcp-edge`.
3. Toda regra de firewall tem dono e motivo, e a regra padrão é negar (lint).
4. O fornecedor A **não** alcança o fornecedor B pelo `fcr`.
5. O nome do fornecedor resolve só dentro da zona privada.

**Complemento.** Desenhe a zona de parceiros do seu ambiente: onde fica o firewall, quem a enxerga e
o que ela anuncia.

**Checagem**

1. Por que o anúncio mínimo vem antes do firewall?
2. Por que filtrar em três pontos, se um bastaria?
3. Como um fornecedor alcançaria outro pelo seu FCR, e o que impede?
4. O que pode dar errado no encaminhamento de DNS entre nuvens?

> **Reencontro — `kubernetes/11`.** A NetworkPolicy faz dentro do cluster o que o firewall da zona
> de parceiros faz na borda: nega por padrão e libera por identidade e motivo.

As guardrails de `arquitetura-de-solucoes/05` são o lugar das regras que valem para toda conta,
como "nenhum parceiro recebe a rota padrão"; o catálogo deste marco é o detalhe por parceiro.

A borda de `system-design/04` controla o que entra pela internet; a zona de parceiros é a borda do
que entra pelo caminho privado, e merece o mesmo rigor.

## Principais aprendizados

- Roteamento decide o alcançável, firewall decide o permitido; um fornecedor precisa das duas
  barreiras.
- Anúncio mínimo: só os /28 do contrato, nos dois sentidos, gerados do catálogo.
- Filtre nos três roteadores; o do fornecedor é dele, então não conte só com ele.
- Zero trust acrescenta a identidade do serviço ao IP: rota, firewall e mTLS.
- Nunca anuncie a rota padrão a um parceiro, e prove que um parceiro não alcança o outro.
