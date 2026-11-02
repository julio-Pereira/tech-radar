Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum associado e
o marco onde o conceito aparece na prática. Este glossário cresce bloco a bloco com a trilha.

## Decisão

### Interconexão privada
**Em uma frase:** ligação entre duas redes que não passa pela internet pública, por um provedor de colocation ou pela própria nuvem.
**No fin-platform:** o caminho do `ledger-core`, em Azure, até o `FornecedorScore`, em GCP, via Fabric Cloud Router.
**Erro comum:** escolher pelo diagrama, não pelo volume, pela latência ou pela exigência de não usar internet.
**Onde na prática:** marco 01.

### Fabric Cloud Router (FCR)
**Em uma frase:** roteador L3 virtual da Equinix, num metro, que roteia entre as conexões que você liga a ele, sem hardware.
**No fin-platform:** o ponto onde a perna do ExpressRoute e a do Partner Interconnect se encontram.
**Erro comum:** achar que, por ser serviço, o roteamento deixa de ser responsabilidade sua.
**Onde na prática:** marco 05.

## Endereçamento

### Sobreposição de faixas
**Em uma frase:** duas redes que precisam se falar usando o mesmo espaço de endereços IP.
**No fin-platform:** o fornecedor usa 10.0.0.0/16, a mesma faixa da VNet de produção.
**Erro comum:** descobrir a colisão na véspera do go-live, quando renumerar já não é opção.
**Onde na prática:** marco 02.

## BGP

### BGP
**Em uma frase:** o protocolo pelo qual as redes anunciam umas às outras quais prefixos alcançam.
**No fin-platform:** toda perna da interconexão — ExpressRoute, FCR e Partner Interconnect — troca rotas por BGP.
**Erro comum:** tratar BGP como assunto só do time de redes e não saber ler o incidente.
**Onde na prática:** marco 03.
