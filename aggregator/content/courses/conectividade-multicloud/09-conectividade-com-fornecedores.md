---
id: conectividade-com-fornecedores
title: "Conectividade com fornecedores"
summary: "Conectar um fornecedor é um contrato com uma rede dentro: sem dono, prazo, escalonamento e desligamento, o link sobrevive ao contrato."
estimatedMinutes: 60
references:
  - title: "Google Cloud — visão geral do Partner Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/partner-overview
  - title: "Equinix Fabric Cloud Router — documentação"
    url: https://docs.equinix.com/fabric-cloud-router
  - title: "Banco Central do Brasil — busca de normas (nuvem, terceiros, segurança cibernética)"
    url: https://www.bcb.gov.br/estabilidadefinanceira/buscanormas
---

## Um contrato com uma rede dentro

Os marcos anteriores trataram o fornecedor como uma rede: faixas, ASN, filtros, túnel. Este o trata
como o que ele também é: uma **outra empresa**, com o próprio time, as próprias janelas de mudança e
um contrato que um dia acaba. A interconexão costuma ser bem desenhada na entrada e esquecida na
saída. O link é técnico; o que o mantém seguro ao longo dos anos é contratual e operacional.

## Três modelos de conexão

Quem cria o quê depende de onde o fornecedor está:

- **o fornecedor está numa nuvem e cria o attachment**: o caso desta trilha. Ele cria o VLAN
  attachment na organização dele e manda a pairing key; você cria a conexão no Fabric (marco 04);
- **o fornecedor publica um service profile no Fabric**: a conexão vai do seu FCR direto ao perfil
  dele, sem passar pela nuvem dele; ele aprova a conexão do lado dele (marco 05);
- **o fornecedor tem porta própria em colocation**: você conecta o FCR a uma porta dele no Fabric, e
  ele opera o roteador do outro lado.

O modelo muda quem tem cada chave, quem aprova e quem você chama quando cai.

## Quem paga o quê

Cada peça tem uma fatura, e nem todas vão para quem usa:

| Peça | Quem costuma pagar |
| --- | --- |
| FCR e as conexões do Fabric | quem as cria (o `fin-platform`) |
| Circuito ExpressRoute e gateway | o `fin-platform` |
| VLAN attachment e Cloud Router | o dono da VPC (o fornecedor) |
| Saída de dados de cada nuvem | quem envia: cada lado paga a saída da própria nuvem |

Os modelos de cobrança de cada nuvem e da Equinix mudam e têm variações (**conferir** antes de
negociar); o que o contrato precisa dizer é quem paga cada linha, para que nenhuma delas vire
surpresa ou motivo de desligar o link sem aviso.

## Quem responde por quê

Quatro partes operam o caminho, e o incidente às três da manhã precisa saber quem chamar:

| Atividade | Redes (`fin-platform`) | Aplicação (`ledger-core`) | Equinix | Fornecedor |
| --- | --- | --- | --- | --- |
| FCR, filtros e conexões | responsável | consultado | executa a plataforma | informado |
| Attachment e Cloud Router | informado | — | — | responsável |
| Certificados do mTLS | consultado | responsável | — | responsável pelo dele |
| Incidente de caminho | responsável | informado | escalonamento | escalonamento |
| Desligamento | responsável | consultado | executa | executa o lado dele |

## Contrato mínimo de conectividade

O contrato comercial cobre preço e prazo. O de conectividade, anexo a ele, cobre o que a rede
precisa:

- **prefixos e ASN** dos dois lados, e o que acontece se o fornecedor quiser mudar;
- **janelas de manutenção** e **aviso prévio** de mudança;
- **NOC e escalonamento** 24×7, com nomes e telefones, e o prazo de resposta;
- **SLA do caminho**, calculado como composto (abaixo);
- **requisitos de criptografia**: mTLS obrigatório, IPsec onde houver (marco 07);
- **registros para auditoria**: o que cada lado guarda, por quanto tempo, e como entrega;
- **data de revisão**: quando o contrato de conectividade é revisto, mesmo sem mudança.

## SLA composto

O caminho do `ledger-core` ao fornecedor passa por peças em série: o gateway e o circuito no Azure,
o FCR, o attachment no Google. Se qualquer uma falhar, o caminho falha. A disponibilidade do
conjunto é, no máximo, o **produto** das disponibilidades de cada peça — e, por isso, sempre menor
ou igual à da peça mais fraca. Com números ilustrativos de 99,95%, 99,99% e 99,9%, o caminho fica
em cerca de 99,84%: umas 14 horas de indisponibilidade possível por ano, e não os 52 minutos que
o número mais bonito sugere. A redundância do marco 10 é como o SLA do caminho volta a subir.

## Risco de terceiro e regulação

Para uma instituição regulada, conectar um fornecedor que processa dados de clientes é contratação
de serviço relevante, com exigências do Banco Central sobre política de segurança cibernética e
contratação de serviços de processamento, armazenamento de dados e computação em nuvem — a
Resolução CMN nº 4.893/2021 é a referência usual (**conferir** a norma vigente, suas alterações e se
ela se aplica ao seu caso). A trilha não interpreta a norma; ensina o mecanismo que qualquer
exigência desse tipo pede: inventário do fornecedor, avaliação de risco, contrato com cláusulas de
segurança e de saída, e evidência de que o desligamento acontece.

## Onboarding e offboarding

O **onboarding** é um checklist que termina num teste: contrato mínimo completo, entrada no
catálogo, filtros e regras gerados, DNS, certificados, e a varredura do marco 08 provando que o
fornecedor alcança só o que deve.

O **offboarding** é o mesmo checklist ao contrário, e é o que mais falta: tirar a rota (anúncio e
aceite), o filtro, a regra de firewall, o registro DNS, a credencial, o certificado e a conexão do
Fabric — e provar que o fornecedor ficou **inalcançável** e que nada dele sobrou na configuração
gerada. Como tudo nasce do catálogo, desligar é remover a entrada e regenerar.

```diagrama
cm-parceiro
```

## Exemplo numa fintech

O contrato do `FornecedorScore` é encerrado: o antifraude troca de fornecedor. O time de aplicação
tira a chamada do código; ninguém abre chamado para a rede. Seis meses depois, uma auditoria
encontra a rota do fornecedor ainda anunciada, a conexão do Fabric ainda ativa e cobrando, e a
regra de firewall ainda liberando o /28 dele. Nenhuma peça estava quebrada; faltava o estado
"desligado" no ciclo de vida do parceiro, e um teste que provasse que ele ficou inalcançável.

## Hands-on

**Tutorial.** Escreva `parceiros/catalogo.yaml`, a fonte dos filtros, regras e DNS dos marcos 05 a
08, e o lint do contrato mínimo:

```yaml
parceiros:
  - id: fornecedor-score
    dono_interno: time-antifraude
    noc: { email: noc@fornecedor.example, telefone: "+55 11 0000-0000" }
    asn: 64600
    prefixos_dele: [100.64.10.0/28]   # como o enxergamos, depois do NAT do marco 02
    prefixos_nossos: [100.64.20.0/28]
    criptografia: { mtls: obrigatorio, ipsec: onde-suportado }
    revisao: 2027-05-01
    estado: conectado
```

**Desafio.** Automatize o onboarding e o offboarding: mudar o `estado` para `desligado` regera a
configuração e roda a prova.

**Invariantes testáveis**

1. Todo parceiro tem dono interno, contato de NOC, prefixos, ASN, data de revisão e requisito de
   criptografia (lint).
2. O **offboarding** remove rota, filtro, regra, DNS e credencial; o teste prova o fornecedor
   **inalcançável** e sem resíduo na configuração gerada.
3. Um parceiro com revisão vencida quebra o CI (o teste usa um relógio falso).
4. O SLA composto é calculado do catálogo e nunca é maior que o do componente mais fraco.

**Complemento.** Levante o contrato de rede de um fornecedor real seu: que itens do contrato mínimo
existem, e quais estão só na cabeça de alguém?

**Checagem**

1. Como o modelo de conexão muda quem cria cada peça?
2. Quem paga a saída de dados num caminho entre duas nuvens?
3. O que o contrato mínimo de conectividade tem que o contrato comercial não tem?
4. O que precisa ser removido no offboarding, e como você prova?

> **Reencontro — `arquitetura-de-solucoes/04`.** Comprar ou construir também é escolher fornecedor:
> o critério de saída — quanto custa desligar — entra na decisão desde o começo.

A governança de `arquitetura-de-solucoes/06` pede exceção com dono e prazo; o parceiro conectado é
uma exceção à regra "nada de fora entra na rede", e a data de revisão é o prazo dela.

A cadeia de suprimentos de `seguranca-aplicacao/12` trata dependências de código; o fornecedor
conectado é uma dependência de rede, com o mesmo raciocínio: inventário, confiança verificada e
remoção quando não serve mais.

## Principais aprendizados

- Um fornecedor conectado é um contrato com uma rede dentro; a rede sobrevive ao contrato se
  ninguém a desligar.
- O modelo de conexão define quem cria, quem aprova e quem paga cada peça.
- O contrato mínimo de conectividade fixa prefixos, ASN, janelas, NOC, SLA, criptografia,
  auditoria e revisão.
- O SLA de peças em série é o produto delas, nunca maior que o da mais fraca.
- Offboarding é remover a entrada do catálogo, regenerar e provar que o fornecedor ficou
  inalcançável.
