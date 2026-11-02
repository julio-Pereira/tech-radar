# `fin-interconnect` — projeto guia da trilha `conectividade-multicloud`

> **Stub.** Os marcos desta trilha ainda são placeholders; o conteúdo chega bloco a bloco. Este
> `PROJETO.md` já traz a especificação do projeto e o que a Fase 0 conferiu.

`fin-interconnect` é a **interconexão privada do `fin-platform`**: liga o `fin-platform` (Azure) ao
`FornecedorScore` (GCP) por um caminho privado via Equinix Fabric Cloud Router (FCR) — num
laboratório local que se comporta como a topologia real, mais a infraestrutura como código real
dos três provedores, testada offline. Não é um marco: é o projeto que você constrói enquanto lê a
trilha.

**Cenário.** O antifraude do `ledger-core` consulta o score do `FornecedorScore` a cada Pix acima de
um valor, com orçamento de latência de 40 ms no salto de rede (**fictício**) e sem trânsito pela
internet, por exigência de segurança. O fornecedor tem uma VPC própria em outra organização, e
quem cria o *VLAN attachment* é ele. O `FornecedorScore` é **fictício**: nada de empresa real.

## Estrutura do repositório

```
fin-interconnect/
  lab/         # containerlab, topologia.yaml, gerador de configs FRR, strongSwan
  ipam/        # modelo de endereçamento em Go: plano de faixas, alocação, sobreposição
  estados/     # ciclo de vida de provisionamento (circuito, attachment, conexão do Fabric)
  iac/         # módulos Terraform equinix + azurerm + google, terraform test com mock_provider, políticas
  parceiros/   # catálogo de fornecedores conectados e lint do contrato mínimo
  operacao/    # exporter, alertas, runbooks
  custo/       # modelo parametrizado, com preços fictícios declarados
  Makefile     # make lab-up | make lab-down | make test | make interconnect-review
```

O laboratório tem quatro domínios: `azure-edge` (emula o par de roteadores de borda da Microsoft no
ExpressRoute), `fcr` (emula o FCR), `gcp-edge` (emula o Cloud Router do Partner Interconnect) e
`fornecedor` (a API de score). Cada nuvem tem uma "VNet"/"VPC" com um host de aplicação.
Topologia, ASNs e faixas vêm de um único `topologia.yaml`, que gera as configs FRR.

## Integração com o `fin-platform`

Todos os vizinhos são simuláveis com stub.

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Chamada de score com mTLS e `deadline` | `ledger-core` / antifraude (trilha `go-fintech`) |
| consome | Políticas de nuvem como código | `fin-landscape` (`arquitetura-de-solucoes/05`) |
| consome | Pipeline de IaC | trilha `entrega-continua-e-devops` |
| serve | Métricas de rede (BGP, perda, latência) no stack LGTM | trilha `observabilidade` |
| serve | Entrada "interconexão" no catálogo de integrações | `fin-landscape` (`arquitetura-de-solucoes/02`) |

**O que este projeto não é.** Não cria recurso em nuvem, não usa conta paga, não reproduz o portal
da Equinix nem a aprovação de conexões; não é um curso de roteador.

## Pré-requisitos

- Docker e **containerlab**. O containerlab roda em Linux; em macOS ou Windows, use uma VM ou o
  WSL2 (o tutorial do marco 01 documenta o caminho).
- Imagens **FRRouting** e **strongSwan**; `tcpdump`/`tshark`.
- Go (toolchain atual).
- Terraform 1.7 ou mais novo (a versão que trouxe `mock_provider`), ou OpenTofu com suporte
  equivalente — ver a decisão abaixo.
- O motor de política já escolhido em ADR nas trilhas `arquitetura-de-solucoes` e
  `entrega-continua-e-devops`.
- **Não precisa:** conta Azure, GCP ou Equinix, nem licença paga.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `decisao/arvore.yaml` + ADR de conectividade | Cada cenário-gabarito leva à opção esperada; ADR com gatilho de revisão |
| 02 | `ipam/` com plano de faixas e detector de sobreposição | Nenhuma sobreposição no plano; a injetada é detectada; reservas por sub-rede respeitadas |
| 03 | `lab/` mínimo: dois roteadores em eBGP | Sessão `Established`; só os prefixos permitidos aceitos; `max-prefix` derruba a sessão sob vazamento |
| 04 | Bordas Azure e GCP emuladas + modelo de estados dos on-ramps | ASNs e sub-redes conforme `topologia.yaml`; ordem de provisionamento inválida rejeitada |
| 05 | Topologia completa Azure ↔ FCR ↔ GCP | O host Azure alcança a API do fornecedor só pelo caminho do FCR; filtro por conexão aplicado |
| 06 | `iac/` com módulos e `terraform test` offline | Plano mockado com as dependências na ordem certa; nenhum segredo em código; política reprova anúncio amplo |
| 07 | IPsec sobre o caminho privado + mTLS | Captura no enlace do FCR sem texto claro; MTU/MSS sem fragmentação; mTLS rejeita cliente sem certificado |
| 08 | Filtros e firewalls como código | Só os /28 combinados trafegam; prefixo corporativo nunca chega ao fornecedor; *default deny* provado |
| 09 | `parceiros/` catálogo + contrato mínimo + desligamento | Lint de contrato; o *offboarding* remove rota, regra e segredo, e o teste prova inalcançável |
| 10 | Caminhos primário e secundário + BFD + game day | Queda do primário: convergência abaixo do alvo, 0 pacotes para a internet, sem assimetria |
| 11 | Exporter + alertas + runbooks | Sessão derrubada dispara alerta com runbook; SLI de conectividade calculado |
| 12 | Modelo de custo e capacidade | Ponto de equilíbrio VPN × FCR reproduzível; a sensibilidade lista onde a decisão inverte |
| 13 | `make interconnect-review` + post-mortems | O comando roda tudo e falha se algo falhar; relatório determinístico |

## Definição de pronto (capstone)

- [ ] Nenhuma faixa IP se sobrepõe entre `fin-platform` e fornecedor; o detector prova (e pega a injetada)
- [ ] Cada sessão BGP tem filtro de entrada e de saída, `max-prefix` e senha ou TTL de segurança configurados
- [ ] O tráfego `ledger-core` → `FornecedorScore` passa **só** pelo FCR (prova por traceroute e captura)
- [ ] O caminho é cifrado (IPsec) **e** autenticado na aplicação (mTLS); a captura não tem texto claro
- [ ] Só os prefixos combinados no contrato são anunciados, nos dois sentidos; o firewall nega por padrão
- [ ] Existem dois caminhos independentes; a queda de um converge dentro do alvo, sem rota pela internet
- [ ] Toda sessão e todo caminho têm alerta com runbook; o SLI de conectividade é calculado
- [ ] O fornecedor está no catálogo com contrato mínimo e procedimento de desligamento **testado**
- [ ] A IaC dos três provedores passa em `terraform test` offline e na política; nenhum segredo no Git
- [ ] O modelo de custo é reproduzível, com preços fictícios declarados e análise de sensibilidade
- [ ] Nenhuma conta, recurso ou preço real; o apêndice "trilho real" é opcional e fora das invariantes

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **O link primário cai** no meio do pico de Pix. Quanto tempo até convergir? Alguma requisição saiu pela internet?
2. **O fornecedor anuncia um /8 por engano.** O que o `max-prefix` e o filtro fazem? Quem é avisado?
3. **O fornecedor muda a faixa** sem avisar (nova sub-rede). O que deixa de funcionar e como você descobre?
4. **O certificado mTLS do fornecedor expira** com o IPsec de pé. O que o monitoramento mostra?
5. **MTU errado depois de ligar o IPsec**: chamadas pequenas passam, respostas grandes travam. Como diagnosticar?
6. **Contrato encerrado.** O desligamento remove tudo? Sobrou alguma rota, regra ou credencial?
7. **Rota assimétrica**: ida por um caminho, volta pelo outro, e o firewall com estado descarta. Como evitar e como detectar?

## Fase 0: fatos de produto conferidos

Conferidos em 02/11/2026, por busca nas fontes oficiais (a documentação muda; **confira** de novo ao
escrever cada marco). O que não foi confirmado fica marcado e não pode entrar no texto como fato.

| Fato | Situação | Fonte |
| --- | --- | --- |
| Pacotes do FCR: Lab (até 10 conexões, 50 Mbps por conexão, 50/50 rotas IPv4/IPv6), Standard (recomendado até 25 conexões, até 10 Gbps, 1.000/100 rotas), Advanced (recomendado até 35 conexões, até 50 Gbps, 4.000/250 rotas); a API também lista PREMIUM, sem limites publicados | confirmado (Premium sem limites) | [FCR](https://docs.equinix.com/fabric-cloud-router), [pacotes (API)](https://docs.equinix.com/fabric-cloud-router/fcr-api/fcr-packages-pricing-api) |
| Upgrade de pacote permitido; downgrade não, durante o prazo contratado | confirmado | [FCR](https://docs.equinix.com/fabric-cloud-router) |
| FCR: BGP por conexão, filtros de rota de entrada e de saída e políticas de agregação, ligados às conexões | confirmado | [filtros de rota](https://docs.equinix.com/fabric-cloud-router/bgp/fcr-route-filters), [BGP](https://docs.equinix.com/fabric-cloud-router/bgp/fcr-bgp) |
| FCR: autenticação MD5, limite de rotas por peer (ao estourar, reseta a sessão por 5 minutos), *AS-path prepend* e *AS override* | confirmado | [BGP](https://docs.equinix.com/fabric-cloud-router/bgp/fcr-bgp) |
| FCR: modelo de alta disponibilidade (dois FCRs, primário e secundário) e funções de NAT, firewall ou IPsec só via Network Edge | **não confirmado** | — |
| ExpressRoute: a Microsoft usa o AS 12076 no *private peering*; ASNs 65515 a 65520 reservados para uso interno | confirmado | [requisitos de roteamento](https://learn.microsoft.com/azure/expressroute/expressroute-routing) |
| ExpressRoute: estados do provedor NotProvisioned → Provisioning → Provisioned; o *peering* exige o circuito provisionado e habilitado | confirmado | [workflows](https://learn.microsoft.com/azure/expressroute/expressroute-workflows) |
| ExpressRoute: ida e volta podem passar por pares de roteadores diferentes (não exige simetria) | confirmado | [requisitos de roteamento](https://learn.microsoft.com/azure/expressroute/expressroute-routing) |
| ExpressRoute: *private peering* com sub-redes primária e secundária /30 | exemplo nas fontes, regra **não confirmada** | [roteamento](https://learn.microsoft.com/azure/expressroute/expressroute-routing) |
| ExpressRoute: MACsec só no ExpressRoute Direct; IPsec (VPN Gateway) sobre o *private peering* suportado | confirmado | [criptografia](https://learn.microsoft.com/azure/expressroute/expressroute-about-encryption) |
| Partner Interconnect: o Cloud Router usa o ASN 16550; a *pairing key* termina em /1 ou /2, conforme o *edge availability domain* | confirmado | [visão geral](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/partner-overview) |
| Partner Interconnect: a topologia exata de 99,9% e de 99,99% | 99,9% confirmado; 99,99% **não detalhado** | [99,9%](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/partner-creating-999-availability) |
| HA VPN over Cloud Interconnect funciona com Dedicated e com Partner Interconnect | confirmado | [HA VPN over Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/ha-vpn-interconnect) |
| MACsec no Partner Interconnect cobre só o trecho entre o roteador do Google e o do provedor | confirmado | [MACsec](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview) |
| HA VPN do GCP e VPN Gateway do Azure ponta a ponta com o FCR no meio | **não confirmado** (risco 4 do plano) | — |
| Cross-Cloud Interconnect: AWS, Azure, Oracle Cloud e Alibaba Cloud | confirmado | [CCI](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview) |
| `mock_provider` no `terraform test`: Terraform 1.7 ou mais novo | confirmado (fontes secundárias) | [mocking](https://developer.hashicorp.com/terraform/language/tests/mocking) |
| `mock_provider` no `tofu test` (OpenTofu): versão exata | **não confirmado** | — |

As URLs de interconexão do Google migraram de `cloud.google.com` para `docs.cloud.google.com`
(redirecionamento 301), e a documentação do FCR tem endereço novo em
`docs.equinix.com/fabric-cloud-router`. O `course.yaml` já usa os endereços novos.

## Decisões de ferramenta (ADR)

**Contexto.** As invariantes rodam sem conta paga, num laboratório local e em testes offline.
Licença e versão importam porque o leitor reproduz tudo na própria máquina.

**Decisão.**

- **Laboratório:** containerlab, com imagens FRRouting (roteamento e BGP) e strongSwan (IPsec).
  As três são de código aberto e amplamente usadas; **conferir** versão e licença ao fixar as
  imagens no marco 01.
- **IaC:** módulos escritos para rodar em Terraform 1.7+ **e** em OpenTofu. O `terraform test`
  com `mock_provider` é o caminho principal; o equivalente do OpenTofu entra quando a versão for
  confirmada. A licença do Terraform (BUSL) e a do OpenTofu (MPL) estão a **conferir** — a escolha
  final é do leitor e não muda as invariantes.
- **Política sobre o plano:** o mesmo motor de política das trilhas `arquitetura-de-solucoes` e
  `entrega-continua-e-devops`, sem um segundo motor.

**Alternativas consideradas.** Laboratório com VMs (mais pesado, sem ganho para o que se prova);
GNS3 ou EVE-NG (interface gráfica, pior para teste automatizado); testes de IaC contra conta real
(descartado: custo e o princípio "sem conta paga").

**Gatilho de revisão.** O containerlab deixar de funcionar no WSL2 ou numa VM Linux comum; o
OpenTofu ou o Terraform remover o `mock_provider`; o FCR ganhar um emulador oficial.

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 825 min de leitura viram ~28h porque o hands-on é
montar o laboratório, quebrar o caminho de propósito e provar o que sobreviveu.

## Apêndice opcional — trilho real

> **Fora das invariantes, com custo e limpeza por sua conta.** Nada da trilha depende deste roteiro.
> Todos os nomes e valores estão a **conferir** na documentação vigente, e o último passo é destruir
> tudo e conferir o faturamento.

1. Planejar faixas sem sobreposição, metro (ex.: São Paulo), ASNs e redundância.
2. Equinix: criar o FCR no metro (portal, API ou Terraform), escolhendo o pacote.
3. Azure: criar o circuito ExpressRoute com provedor Equinix e *peering location* do metro, e obter
   a *service key*; criar o ExpressRoute Gateway na VNet; no Fabric, criar a conexão FCR → perfil
   "Azure ExpressRoute" com a key; configurar o *private peering* e ligar o circuito ao gateway.
4. GCP (na organização do fornecedor ou na sua): Cloud Router e *VLAN attachment* do tipo
   *Partner*, que gera a *pairing key*; no Fabric, conexão FCR → perfil Google Cloud com a key;
   ativar o attachment.
5. BGP nas duas pernas do FCR, filtros e anúncios mínimos; IPsec (VPN sobre o caminho privado) e
   mTLS.
6. Rodar os testes da trilha contra o ambiente real; **destruir tudo** (`terraform destroy`) e
   conferir o faturamento.
