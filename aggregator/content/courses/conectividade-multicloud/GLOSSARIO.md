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

### On-ramp
**Em uma frase:** a porta de entrada privada de uma nuvem para quem vem de fora, como o ExpressRoute no Azure ou o Partner Interconnect no Google.
**No fin-platform:** as duas pernas do caminho até o Fabric Cloud Router.
**Erro comum:** achar que uma nuvem aceita a porta da outra; cada uma tem vocabulário e ordem próprios.
**Onde na prática:** marco 01, retomado no 04.

### Colocation
**Em uma frase:** um data center neutro onde várias redes e nuvens têm presença física e se interconectam.
**No fin-platform:** o metro de São Paulo onde o FCR fica, perto das regiões das duas nuvens.
**Erro comum:** escolher o metro pelo nome, sem medir a latência até as duas regiões.
**Onde na prática:** marco 01.

### Cross-Cloud Interconnect
**Em uma frase:** link físico gerenciado pelo Google entre a sua rede no Google Cloud e a sua rede em outra nuvem.
**No fin-platform:** não serve sozinho para o FornecedorScore, porque a VPC do outro lado é do fornecedor.
**Erro comum:** usá-lo para ligar uma rede que não é sua.
**Onde na prática:** marco 01.

### Serviço publicado
**Em uma frase:** um endpoint que o fornecedor expõe na sua nuvem (Private Service Connect, Private Link) sem anunciar redes.
**No fin-platform:** seria a saída se o fin-platform tivesse presença no Google Cloud.
**Erro comum:** abrir uma rede roteada quando só um serviço precisava aparecer.
**Onde na prática:** marco 01.

### VPN site a site
**Em uma frase:** túnel IPsec entre dois gateways, cifrado, mas passando pela internet.
**No fin-platform:** a opção que o contrato do FornecedorScore elimina, por exigir rede privada.
**Erro comum:** tratar cifrado como privado: o túnel ainda atravessa a internet.
**Onde na prática:** marco 01.

## Endereçamento

### Sobreposição de faixas
**Em uma frase:** duas redes que precisam se falar usando o mesmo espaço de endereços IP.
**No fin-platform:** o fornecedor usa 10.0.0.0/16, a mesma faixa da VNet de produção.
**Erro comum:** descobrir a colisão na véspera do go-live, quando renumerar já não é opção.
**Onde na prática:** marco 02.

### CIDR
**Em uma frase:** a notação que diz o começo de uma faixa e quantos bits são fixos, como 10.20.0.0/16.
**No fin-platform:** o plano de faixas do ipam/ é escrito em CIDR.
**Erro comum:** confundir o tamanho do prefixo com o número de hosts utilizáveis.
**Onde na prática:** marco 02.

### Agregação
**Em uma frase:** anunciar várias sub-redes contíguas de um dono como um bloco só.
**No fin-platform:** o fin-platform anuncia um agregado por ambiente, não cada /24.
**Erro comum:** fragmentar o plano e pagar uma linha de anúncio por pedaço.
**Onde na prática:** marco 02.

### IPAM
**Em uma frase:** a fonte da verdade do endereçamento: cada faixa com dono, ambiente e propósito.
**No fin-platform:** o ipam/ em Go detecta sobreposição a cada mudança do plano.
**Erro comum:** manter o plano numa planilha que ninguém confere contra o que está em produção.
**Onde na prática:** marco 02.

### RFC 1918
**Em uma frase:** as três faixas reservadas para redes privadas: 10/8, 172.16/12 e 192.168/16.
**No fin-platform:** a VNet de produção usa 10.0.0.0/16, a mesma faixa do fornecedor.
**Erro comum:** achar que privado quer dizer único; são justamente as faixas que mais colidem.
**Onde na prática:** marco 02.

### Espaço compartilhado (100.64.0.0/10)
**Em uma frase:** faixa do RFC 6598, criada para redes de operadoras, usada com frequência para interconexão e NAT entre organizações.
**No fin-platform:** os dois /28 de tradução com o fornecedor vêm dela.
**Erro comum:** usar sem conferir se a organização ou o fornecedor já a usam para outra coisa.
**Onde na prática:** marco 02.

### NAT
**Em uma frase:** tradução de endereços que faz cada lado enxergar o outro por uma faixa diferente da real.
**No fin-platform:** resolve a colisão de 10.0.0.0/16 com o fornecedor.
**Erro comum:** ignorar o custo: logs com endereço traduzido, tabela a guardar e sensibilidade à assimetria.
**Onde na prática:** marco 02.

## BGP

### BGP
**Em uma frase:** o protocolo pelo qual as redes anunciam umas às outras quais prefixos alcançam.
**No fin-platform:** toda perna da interconexão — ExpressRoute, FCR e Partner Interconnect — troca rotas por BGP.
**Erro comum:** tratar BGP como assunto só do time de redes e não saber ler o incidente.
**Onde na prática:** marco 03.

### Sistema autônomo
**Em uma frase:** uma rede sob uma única política de roteamento, identificada por um ASN.
**No fin-platform:** o fin-platform, o FCR e cada nuvem são sistemas autônomos diferentes no caminho.
**Erro comum:** tratar a nuvem inteira como uma rede só, sem perceber os sistemas autônomos no meio.
**Onde na prática:** marco 03.

### ASN
**Em uma frase:** o número que identifica um sistema autônomo no BGP; há faixas públicas e privadas.
**No fin-platform:** o lado do fin-platform usa um ASN privado; o Azure usa 12076 e o Google 16550 nas pernas da interconexão.
**Erro comum:** escolher um ASN que a nuvem reserva para uso próprio e a sessão não subir.
**Onde na prática:** marco 03.

### ASN privado
**Em uma frase:** faixas reservadas pelo RFC 6996 para redes que não falam com a internet: 64512–65534 e 4200000000–4294967294.
**No fin-platform:** os roteadores emulados do lab/ usam ASNs privados.
**Erro comum:** usar um ASN público que pertence a outra organização.
**Onde na prática:** marco 03.

### eBGP
**Em uma frase:** a sessão BGP entre sistemas autônomos diferentes.
**No fin-platform:** toda sessão da interconexão é eBGP.
**Erro comum:** aplicar intuições de iBGP, como confiar em tudo que vem do vizinho.
**Onde na prática:** marco 03.

### Sessão BGP
**Em uma frase:** a conexão TCP na porta 179 entre dois roteadores, que só troca rotas em Established.
**No fin-platform:** uma sessão por perna: Azure–FCR e FCR–Google.
**Erro comum:** achar que a sessão de pé garante tráfego; o filtro pode estar descartando tudo.
**Onde na prática:** marco 03.

### Prefixo
**Em uma frase:** uma faixa anunciada no BGP, como 10.40.0.0/16.
**No fin-platform:** o FornecedorScore anuncia só os /28 combinados.
**Erro comum:** anunciar a VNet inteira porque dá menos trabalho.
**Onde na prática:** marco 03.

### Melhor caminho
**Em uma frase:** a rota que o BGP escolhe entre várias para o mesmo destino, por uma ordem de critérios.
**No fin-platform:** o caminho pelo FCR 1 vence porque o FCR 2 anuncia com prepend; o secundário fica de reserva.
**Erro comum:** esquecer que o encaminhamento segue o prefixo mais específico antes de qualquer atributo do BGP.
**Onde na prática:** marco 03.

### Local preference
**Em uma frase:** atributo dentro do seu AS que diz por qual saída preferir; maior vence.
**No fin-platform:** só serve num roteador seu que veja os dois caminhos; com dois FCRs, o primário se declara no anúncio (marco 10).
**Erro comum:** esperar que o vizinho a respeite: ela não atravessa o eBGP.
**Onde na prática:** marco 03.

### AS path prepend
**Em uma frase:** repetir o próprio ASN num anúncio para alongar o caminho e torná-lo menos preferido do outro lado.
**No fin-platform:** o FCR 2 anuncia com prepend para o Azure e para o Google, e o caminho pelo FCR 1 vira o primário.
**Erro comum:** usar prepend para decidir a sua saída, que é papel da local preference.
**Onde na prática:** marco 03.

### Filtro de rota
**Em uma frase:** regra que aceita ou descarta prefixos na entrada ou na saída de uma sessão.
**No fin-platform:** toda sessão tem filtro de entrada e de saída gerado do catálogo de parceiros.
**Erro comum:** filtrar só a entrada e confiar no vizinho para a saída.
**Onde na prática:** marco 03.

### max-prefix
**Em uma frase:** limite de prefixos que um vizinho pode anunciar; ao estourar, a sessão cai.
**No fin-platform:** derruba a sessão se o fornecedor anunciar um /8 por engano.
**Erro comum:** achar que derrubar a sessão é pior que aceitar milhares de rotas de um vizinho com defeito.
**Onde na prática:** marco 03.

### Vazamento de rota
**Em uma frase:** anunciar adiante uma rota que não devia, desviando tráfego de terceiros.
**No fin-platform:** o fornecedor anunciando a faixa de outro parceiro do fin-platform.
**Erro comum:** achar que só acontece na internet pública.
**Onde na prática:** marco 03.

### BFD
**Em uma frase:** protocolo leve que detecta a queda de um vizinho em frações de segundo e avisa o BGP.
**No fin-platform:** ligado nas duas pernas para o failover não depender dos temporizadores do BGP.
**Erro comum:** contar com o hold timer padrão e perder dezenas de segundos de tráfego.
**Onde na prática:** marco 03, retomado no 10.

### Rota assimétrica
**Em uma frase:** a ida por um caminho e a volta por outro.
**No fin-platform:** aparece depois do failover, quando o primário volta antes do outro lado perceber.
**Erro comum:** achar que é problema só do BGP; é o firewall com estado que descarta.
**Onde na prática:** marco 03, retomado no 10.

## Peças

### ExpressRoute
**Em uma frase:** a porta privada do Azure: um circuito contratado com um provedor numa peering location, com sessões BGP até a Microsoft.
**No fin-platform:** a perna Azure do caminho até o FCR, no metro de São Paulo.
**Erro comum:** tratar o circuito como pronto quando o provedor ainda está em NotProvisioned.
**Onde na prática:** marco 04.

### Circuito ExpressRoute
**Em uma frase:** a conexão lógica entre a sua rede e a Microsoft, com duas conexões (primária e secundária) e estado próprio do provedor.
**No fin-platform:** um circuito com a Equinix como provedor, ligado ao FCR.
**Erro comum:** usar só uma das duas conexões e chamar isso de economia.
**Onde na prática:** marco 04.

### Peering location
**Em uma frase:** o ponto físico onde o provedor encontra a Microsoft, como São Paulo.
**No fin-platform:** a mesma cidade do metro do FCR, para não somar latência.
**Erro comum:** escolher a peering location sem olhar onde fica o resto do caminho.
**Onde na prática:** marco 04.

### Service key
**Em uma frase:** o identificador que o Azure devolve ao criar o circuito e que o provedor usa para saber qual circuito ligar.
**No fin-platform:** entra na conexão do Fabric para o Azure como chave de autenticação, saída do próprio recurso do circuito.
**Erro comum:** emitir a chave muito antes de usá-la: a cobrança do circuito começa ali.
**Onde na prática:** marco 04, também no marco 06.

### Private peering
**Em uma frase:** a sessão BGP do circuito ExpressRoute que leva às redes privadas (VNets) do Azure.
**No fin-platform:** a sessão entre o FCR e os roteadores da Microsoft, no AS 12076.
**Erro comum:** escolher para o seu lado um ASN que o Azure reserva (65515 a 65520).
**Onde na prática:** marco 04.

### ExpressRoute Gateway
**Em uma frase:** o gateway na VNet que liga o circuito à rede virtual, com SKUs de banda e limites diferentes.
**No fin-platform:** a saída do ledger-core rumo ao circuito.
**Erro comum:** esquecer que o circuito sozinho não chega a nenhuma VNet.
**Onde na prática:** marco 04.

### Partner Interconnect
**Em uma frase:** a porta privada do Google Cloud para quem chega por um provedor parceiro, como a Equinix.
**No fin-platform:** a perna Google do caminho, do lado do fornecedor.
**Erro comum:** confundir com o Dedicated Interconnect, que exige porta física própria em colocation.
**Onde na prática:** marco 04.

### VLAN attachment
**Em uma frase:** o recurso do Google Cloud que liga uma VPC ao Partner Interconnect, preso a um Cloud Router e a uma região.
**No fin-platform:** criado pelo fornecedor, na organização dele; o fin-platform só recebe a pairing key.
**Erro comum:** esquecer de ativar: o attachment fica parado em PENDING_CUSTOMER.
**Onde na prática:** marco 04.

### Pairing key
**Em uma frase:** a chave que o Google devolve ao criar o VLAN attachment e que o provedor usa para achá-lo; termina em /1 ou /2.
**No fin-platform:** chega por e-mail do fornecedor e entra no código como variável, com a data de validade.
**Erro comum:** deixar a chave vencer enquanto o resto do caminho não fica pronto.
**Onde na prática:** marco 04, também no marco 06.

### Cloud Router
**Em uma frase:** o roteador gerenciado do Google Cloud que fala BGP com o lado de fora; no Partner Interconnect, usa o ASN 16550.
**No fin-platform:** o vizinho BGP do FCR na perna do fornecedor.
**Erro comum:** deixar o anúncio padrão, que manda todas as sub-redes da VPC.
**Onde na prática:** marco 04.

### Edge availability domain
**Em uma frase:** cada um dos dois domínios de borda de um metro do Google, com manutenção separada.
**No fin-platform:** o fornecedor precisa de um attachment em cada domínio para a redundância contar.
**Erro comum:** pôr os dois attachments no mesmo domínio e perder os dois na mesma manutenção.
**Onde na prática:** marco 04.

### Equinix Fabric
**Em uma frase:** a plataforma de interconexão da Equinix, onde vivem as conexões, os perfis de serviço e o FCR.
**No fin-platform:** o lugar onde as duas pernas se encontram.
**Erro comum:** achar que chegar ao Fabric já liga as duas nuvens: falta quem roteie entre elas.
**Onde na prática:** marco 05.

### Service profile
**Em uma frase:** a forma como uma nuvem ou um fornecedor aparece no Equinix Fabric para receber conexões.
**No fin-platform:** os perfis do Azure ExpressRoute e do Google Partner Interconnect, um por domínio de borda.
**Erro comum:** não perguntar se o fornecedor tem perfil próprio no Marketplace.
**Onde na prática:** marco 05.

### Network Edge
**Em uma frase:** appliances virtuais de fabricantes de rede rodando no Equinix Fabric, para funções que o FCR não tem.
**No fin-platform:** candidato para o NAT do marco 02, se a função for necessária no meio do caminho.
**Erro comum:** pôr um appliance por hábito: é mais uma peça para operar e licenciar.
**Onde na prática:** marco 05.

### Pacote do FCR
**Em uma frase:** o nível contratado do FCR, que limita conexões, banda e rotas.
**No fin-platform:** Standard para produção; o Lab só para experimentar.
**Erro comum:** usar o Lab em produção e descobrir o limite de banda no teste de carga.
**Onde na prática:** marco 05.

## Como código

### Mock provider
**Em uma frase:** um provider falso no terraform test, que dá valores aos recursos sem chamar nenhuma API.
**No fin-platform:** prova a ligação entre a service key e a conexão do Fabric sem conta em nenhum provedor.
**Erro comum:** achar que o teste com mock prova que o provedor aceita o recurso.
**Onde na prática:** marco 06.

### Política sobre o plano
**Em uma frase:** regras que leem o plano do Terraform em JSON e reprovam a mudança antes do apply.
**No fin-platform:** reprova conexão sem filtro de saída, caminho único, anúncio amplo e recurso sem dono.
**Erro comum:** escrever a regra sem uma fixture que a viole, e nunca saber se ela reprova.
**Onde na prática:** marco 06.

### Drift
**Em uma frase:** a diferença entre o que o código declara e o que existe de fato no provedor.
**No fin-platform:** um plan agendado acusa o filtro mudado no portal durante um incidente.
**Erro comum:** corrigir no portal de novo, em vez de voltar por PR.
**Onde na prática:** marco 06.

## Segurança

### MACsec
**Em uma frase:** criptografia no enlace, entre dois equipamentos ligados diretamente.
**No fin-platform:** não vai de ponta a ponta no caminho com o FCR: no Azure só existe no ExpressRoute Direct, e no Partner Interconnect cobre só o trecho Google–provedor.
**Erro comum:** contar com o MACsec como se cifrasse o caminho inteiro.
**Onde na prática:** marco 07.

### IPsec
**Em uma frase:** criptografia do pacote IP entre dois gateways, num túnel que esconde o cabeçalho interno.
**No fin-platform:** túnel entre as bordas Azure e Google por cima do caminho do FCR, onde o produto permite.
**Erro comum:** deixar o tráfego seguir em claro quando o túnel cai.
**Onde na prática:** marco 07.

### MSS clamping
**Em uma frase:** o gateway reescreve o tamanho máximo de segmento TCP para que o pacote, já encapsulado, caiba no enlace.
**No fin-platform:** ajustado nos gateways do túnel para que a resposta grande do score atravesse.
**Erro comum:** não ajustar e ver só as respostas grandes travarem, sem erro.
**Onde na prática:** marco 07.

### Falha fechada
**Em uma frase:** quando a proteção cai, o tráfego para, em vez de seguir sem ela.
**No fin-platform:** sem o túnel IPsec, não há rota para a API do fornecedor.
**Erro comum:** configurar uma rota alternativa em claro "para não parar o antifraude".
**Onde na prática:** marco 07.

### Anúncio mínimo
**Em uma frase:** anunciar ao parceiro só os prefixos que o contrato diz que ele precisa alcançar, e aceitar dele só os combinados.
**No fin-platform:** só os /28 do catálogo, gerados para cada conexão do FCR.
**Erro comum:** anunciar a VNet inteira ou o agregado corporativo porque "é mais fácil".
**Onde na prática:** marco 08.

### Zona de parceiros
**Em uma frase:** uma VNet ou VPC de trânsito, dedicada a terceiros, entre o caminho privado e as redes de produção.
**No fin-platform:** concentra firewall, NAT e registros de fluxo de todos os parceiros.
**Erro comum:** ligar o parceiro direto na VNet de produção.
**Onde na prática:** marco 08.

### Trânsito indevido
**Em uma frase:** um parceiro alcançando outro pelo seu roteador, porque você anunciou a rota de um ao outro.
**No fin-platform:** o filtro por conexão do FCR impede que o FornecedorScore alcance o parceiro de PLD.
**Erro comum:** achar que o FCR isola os parceiros sozinho.
**Onde na prática:** marco 08.

### DNS privado
**Em uma frase:** resolução de nomes que só funciona dentro de uma zona privada, para endereços privados.
**No fin-platform:** o nome da API do fornecedor resolve para o endereço do caminho privado só dentro da zona.
**Erro comum:** encaminhar consultas de forma ampla e expor ao fornecedor a zona interna inteira.
**Onde na prática:** marco 08.

### Registro de fluxo
**Em uma frase:** o registro, por nuvem, de quem falou com quem, quando e quanto.
**No fin-platform:** a evidência de que o fornecedor acessou só o que devia.
**Erro comum:** não guardar pelo prazo da política de retenção.
**Onde na prática:** marco 08, também no marco 11.

## Fornecedor

### Contrato mínimo de conectividade
**Em uma frase:** o anexo técnico ao contrato comercial com prefixos, ASN, janelas, NOC, SLA do caminho, criptografia, auditoria e revisão.
**No fin-platform:** o lint do catálogo de parceiros reprova quem não tem todos os campos.
**Erro comum:** achar que o contrato comercial cobre o que a rede precisa.
**Onde na prática:** marco 09.

### Catálogo de parceiros
**Em uma frase:** a fonte única de cada parceiro conectado, da qual se geram filtros, regras e DNS.
**No fin-platform:** parceiros/catalogo.yaml, com dono, NOC, prefixos, ASN, criptografia e data de revisão.
**Erro comum:** configurar um parceiro à mão, fora do catálogo.
**Onde na prática:** marco 09.

### Offboarding
**Em uma frase:** o desligamento de um parceiro: remover rota, filtro, regra, DNS, credencial, certificado e conexão, e provar.
**No fin-platform:** mudar o estado no catálogo para desligado, regenerar e rodar a prova de inalcançabilidade.
**Erro comum:** tirar a chamada do código e esquecer a rota anunciada.
**Onde na prática:** marco 09.

### Risco de terceiro
**Em uma frase:** o risco que um fornecedor traz à sua operação, avaliado antes de contratar e revisto depois.
**No fin-platform:** o FornecedorScore processa CPF e entra no inventário de terceiros.
**Erro comum:** tratar a certificação do fornecedor como substituta da sua avaliação.
**Onde na prática:** marco 09.

## Operação

### Domínio de falha
**Em uma frase:** tudo o que, ao falhar, derruba mais de um caminho de uma vez: link, porta, roteador, FCR, metro, provedor.
**No fin-platform:** os dois caminhos usam FCRs diferentes para não compartilhar o roteador.
**Erro comum:** chamar de redundante dois links que passam pelo mesmo FCR.
**Onde na prática:** marco 10.

### Alvo de convergência
**Em uma frase:** o tempo máximo declarado entre a queda de um caminho e o tráfego estável no outro.
**No fin-platform:** medido por sonda contínua no game day de failover.
**Erro comum:** nunca medir e descobrir o número real no primeiro incidente.
**Onde na prática:** marco 10.

### ECMP
**Em uma frase:** múltiplos caminhos de custo igual, com o tráfego dividido entre eles.
**No fin-platform:** descartado no desenho inicial por causa dos firewalls com estado.
**Erro comum:** usar ECMP com firewalls que não compartilham estado e quebrar a volta.
**Onde na prática:** marco 10.

### SLA composto
**Em uma frase:** a disponibilidade de um caminho calculada das peças: produto em série, complemento do produto das falhas em paralelo.
**No fin-platform:** o caminho em série fica abaixo da peça mais fraca; as pernas em paralelo passam de 99,99%, mas o gateway compartilhado, em série, limita o conjunto.
**Erro comum:** somar caminhos em paralelo que compartilham o metro como se fossem independentes.
**Onde na prática:** marco 10, também no marco 09.

### Sonda ativa
**Em uma frase:** uma chamada sintética contínua pelo caminho, que mede alcance e latência mesmo sem tráfego real.
**No fin-platform:** a fonte do SLI de conectividade do ledger-core até a API de score.
**Erro comum:** medir só o tráfego real, que de madrugada é pouco demais.
**Onde na prática:** marco 11.

### SLI de conectividade
**Em uma frase:** a fração do tempo em que o destino é alcançável pelo caminho privado dentro do orçamento de latência.
**No fin-platform:** calculado da sonda, com SLO e orçamento de erro.
**Erro comum:** usar o estado da sessão BGP como único sinal.
**Onde na prática:** marco 11.

### 95º percentil
**Em uma frase:** o maior valor que sobra depois de descartar os 5% de amostras mais altas de um período.
**No fin-platform:** comparado com a banda contratada para planejar capacidade.
**Erro comum:** planejar pela média, que esconde o uso sustentado alto.
**Onde na prática:** marco 12.

### Ponto de equilíbrio
**Em uma frase:** o volume em que duas opções de custo fixo e marginal diferentes custam o mesmo.
**No fin-platform:** a VPN empata com o FCR em 45 TB por mês no modelo fictício.
**Erro comum:** decidir por um ponto só, sem análise de sensibilidade.
**Onde na prática:** marco 12.

### Showback
**Em uma frase:** a atribuição do custo compartilhado a cada parceiro ou time, sem cobrança efetiva.
**No fin-platform:** o fixo do FCR dividido entre os parceiros, e a soma fechando com o total.
**Erro comum:** deixar o custo da interconexão sem dono, até ninguém saber quando desligar.
**Onde na prática:** marco 12.

### Game day
**Em uma frase:** um exercício em que se provoca uma falha de propósito, com hipótese, sinal e post-mortem.
**No fin-platform:** os sete cenários da interconexão, rodados no laboratório.
**Erro comum:** rodar sem hipótese escrita e chamar qualquer resultado de sucesso.
**Onde na prática:** marco 13.
