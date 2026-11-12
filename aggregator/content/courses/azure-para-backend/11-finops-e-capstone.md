---
id: finops-e-capstone
title: "FinOps no Azure e capstone"
summary: "Custo é requisito não funcional com dono; no Azure, o que surpreende na fatura raramente é a computação. Os vetores de custo de um backend, os escondidos (Private Endpoint por serviço, zonas DNS repetidas, ingestão e retenção de log), tags com herança no faturamento, budget com alerta previsto, reservas × savings plan × spot × Hybrid Benefit, o custo por mil transações — com um modelo que lê o código e mede quantidades cobráveis: a retenção de 30 para 365 dias num workspace deu 13.360 GB-mês retidos cobrados — e o capstone do fin-azure."
estimatedMinutes: 70
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [arquitetura, negocio]
references:
  - title: "Azure Private Link — Pricing"
    url: https://azure.microsoft.com/pricing/details/private-link/
  - title: "Azure Monitor Logs — Cost calculations and options"
    url: https://learn.microsoft.com/azure/azure-monitor/logs/cost-logs
  - title: "Cost Management — Decide between a savings plan and a reservation"
    url: https://learn.microsoft.com/azure/cost-management-billing/savings-plan/decide-between-savings-plan-reservation
  - title: "Cost Management — Group and allocate costs using tag inheritance"
    url: https://learn.microsoft.com/azure/cost-management-billing/costs/enable-tag-inheritance
  - title: "Azure Retail Prices REST API"
    url: https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices
---

## Custo é requisito, e tem dono

A tese é a do marco gêmeo (`aws-para-backend/11`): o custo entra na ADR com número e dono, não na fatura
depois. Isso pede:

- um **modelo** feito antes, a partir do código e do tráfego esperado;
- um **dono** por centro de custo;
- um **alerta** antes da fatura;
- uma **unidade de negócio**: o custo por mil transações Pix.

A plataforma como produto e o custo dela estão em `engenharia-de-plataforma/08`; o custo por transação como
requisito de evolução, em `system-design/14`.

## Os vetores de custo de um backend

| Vetor | Cobrado por | Onde aparece no `fin-azure` |
| --- | --- | --- |
| Computação | vCPU-segundo e GiB-segundo, ou hora de nó, ou execução | o Container Apps do `pix-gateway`, as funções do lote |
| Banco | vCore-hora, armazenamento, *backup*, RU/s | o Postgres do ledger, o Cosmos de idempotência |
| Rede privada | hora e GB do Private Endpoint, zona DNS privada, hora do Firewall | a rede fechada do marco 03 |
| Transferência | GB entre regiões e para a internet | o DR do marco 10, o *webhook* para fora |
| Armazenamento | GB-mês por redundância (LRS, ZRS, GZRS) e operações | os comprovantes no Blob |
| Observabilidade | GB de *log* ingerido, retenção além da incluída, consulta do Basic e do Auxiliary | o marco 09 |

## Os custos escondidos

**Private Endpoint por serviço.** O marco 03 fechou a rede com um Private Endpoint para cada serviço: Blob,
Service Bus, Postgres, Cosmos e Key Vault. Conferido em 12 nov 2026, pela página de preço, cada um cobra
**por hora** e **por GB processado, nos dois sentidos**: a escrita no Storage pelo *endpoint* conta como
saída, a leitura como entrada. Cinco serviços em três ambientes são quinze *endpoints* ligados o mês
inteiro, e o tráfego de toda chamada ao banco passa por eles. Não é motivo para abrir a rede; é motivo para
saber o número antes.

**Zonas DNS repetidas por *spoke*.** Cada zona `privatelink.*` é cobrada por zona e por consulta. Quando cada
*spoke* cria as próprias zonas, em vez de usar as do *hub*, a conta de DNS se multiplica pelo número de
*spokes* e, pior, a resolução quebra: o recurso de um *spoke* resolve o IP público no outro, a falha medida no
marco 03.

**Ingestão e retenção de *log*.** O *workspace* cobra por GB ingerido, e a ingestão em Analytics inclui 31
dias de retenção. Cada dia além disso soma GB-mês guardado. Um `retention_in_days = 365` aplicado a um
*workspace* inteiro "por segurança" guarda tudo um ano, inclusive a depuração. A retenção longa é por
**tabela**, para a auditoria (marco 09); o resto fica nos 30 dias.

## *Tags*, *budget* e quem paga

- **A *tag* do recurso.** A *tag* `cost-center` é obrigatória pela política do marco 01. No Azure, o
  recurso **não herda** a *tag* do *resource group* por padrão; a política com efeito `modify` copia a
  *tag* na criação.
- **A herança no faturamento.** Conferido em 12 nov 2026: a ***tag inheritance*** do Cost Management aplica
  as *tags* da assinatura e do *resource group* aos **registros de uso**, não aos recursos. Ela leva de 8 a 24
  horas para valer, e os *budgets* passam a filtrar pelas *tags* herdadas cerca de um dia depois.
- **Alerta previsto.** O ***budget*** aceita alertas por gasto **real** e por gasto **previsto**: até 5 de
  cada tipo. O previsto avisa no começo do mês que o fim vai estourar. O *budget* vai no código, como qualquer
  outro recurso.
- **Detecção de anomalia.** O Cost Management avisa do desvio do padrão: o *workspace* que dobrou num dia, o
  *endpoint* que ninguém sabe de onde veio.

## Comprar melhor: reserva, *savings plan*, *spot* e Hybrid Benefit

Conferido em 12 nov 2026:

| Opção | O que você troca | Quando |
| --- | --- | --- |
| **Reserva** | compromisso de 1 ou 3 anos com um tamanho, uma família e uma região | carga estável e previsível; com uso cheio, dá mais desconto que o *savings plan*. Também para banco (Postgres, SQL, Cosmos) |
| ***Savings plan for compute*** | compromisso de gasto por hora, em 1 ou 3 anos | carga que muda de família ou de região. O compromisso não usado na hora se perde, e ele não cobre *software*, rede nem armazenamento |
| ***Spot*** | capacidade que o Azure toma de volta com **30 segundos** de aviso, pelos *Scheduled Events*, por desconto grande | lote, CI e reprocessamento. Nunca o caminho síncrono do pagamento |
| **Azure Hybrid Benefit** | usar a licença Windows Server ou SQL Server que você já tem | só desconta a licença; a computação continua cobrada |

Com reserva e *savings plan* juntos, a **reserva é aplicada primeiro**. Desde **1 jul 2026**, as reservas de
VM de várias séries antigas (Dv3, Ev3 e outras) não são mais vendidas nem renovadas; a Microsoft recomenda o
*savings plan* ou a migração para séries novas.

A ordem é a do marco gêmeo: **primeiro o *rightsizing***, com o Azure Advisor e o uso medido; **depois o
compromisso**, sobre a base já ajustada. Os percentuais de desconto mudam; a conta se faz com o preço do dia.

## O preço vem da API, não da memória

A fonte do preço é a **Azure Retail Prices API** (`prices.azure.com`), pública e sem autenticação, filtrada por
serviço, região e medidor. O modelo de custo **separa a quantidade do preço**:

- a **quantidade cobrável** vem do código e do perfil de tráfego: horas de *endpoint*, zonas, GB ingeridos,
  GB-mês retidos. Ela não muda com o preço do dia e é o que o teste compara;
- o **preço** é uma entrada datada, com a região e a fonte, e o modelo multiplica no fim.

O laboratório desta trilha não alcançou a API de preços. Por isso as invariantes estão em quantidades, e o
custo em reais sai quando você roda o modelo com um arquivo de preços tirado da API.

## A unidade: custo por mil transações

> custo por mil = custo mensal do caminho do Pix ÷ transações do mês × 1.000

O total sobe e desce com o volume. O custo por mil mostra se a arquitetura ficou mais cara para fazer a mesma
coisa, e vai para o painel do produto.

## "Como você reduziria a conta?"

A resposta de sênior começa por **medir**, como no marco gêmeo:

1. **Onde está o dinheiro:** o Cost Management por *tag* e por serviço, e os três maiores itens.
2. **O que é desperdício:** *workspace* com retenção de um ano para tudo, zonas DNS repetidas, *endpoint* de
   ambiente desligado, disco órfão, VM superdimensionada, ambiente de teste ligado no fim de semana.
3. **O que é arquitetura**, com a decisão escrita: o Private Endpoint por serviço, a redundância de zona, o DR.
   A redução aqui troca custo por segurança ou resiliência.
4. **Só então, comprar melhor:** reserva ou *savings plan* sobre a base ajustada, e *spot* para o
   interrompível.
5. **Como impedir a volta:** a regra sobre o código e o *budget* com alerta previsto.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| NAT sem *gateway endpoint* | Private Endpoint por serviço, zonas DNS repetidas | no Azure, o *endpoint* privado é cobrado por hora e por GB em todo serviço |
| CloudWatch Logs sem retenção | *workspace* com retenção longa para tudo | o padrão é 30 dias; o desperdício é aumentar para todas as tabelas |
| *tag* de alocação ativada | *tag inheritance* no Cost Management | a herança vale para o registro de uso, não para o recurso |
| AWS Budgets | Cost Management *budgets* | até 5 alertas reais e 5 previstos por *budget* |
| *Savings Plans* e reservas | *savings plan for compute* e reservas | a reserva é aplicada primeiro; reservas de séries antigas acabaram em jul 2026 |
| *Spot*, aviso de dois minutos | *Spot*, aviso de 30 segundos | o tempo para drenar é quatro vezes menor |

O marco gêmeo é `aws-para-backend/11`.

> **O que o laboratório não reproduz.** O modelo usa um perfil de tráfego que é hipótese e não tem preço: ele
> mede quantidades cobráveis. Ele não reproduz os níveis de compromisso do *workspace*, o desconto de reserva,
> o nível gratuito nem a fatura. Ele prova uma coisa: **uma mudança no código muda a quantidade cobrável, e o
> teste mostra quanto**, antes do *merge*.

## Exemplo numa fintech

A fatura de observabilidade triplicou em dois meses, sem aumento de volume. O Cost Management mostrou o
crescimento no *workspace* do `pix-gateway`. Depois de uma auditoria, alguém tinha mudado a retenção do
*workspace* inteiro para 365 dias, para "garantir a auditoria". Isso guardou um ano de *log* de depuração,
enquanto a tabela que a auditoria pedia, a do Key Vault, estava em outro *workspace*, com 30 dias. A correção:

- o *workspace* voltou para 30 dias, e a retenção longa foi para as tabelas de auditoria (marco 09);
- o modelo de custo passou a rodar na esteira, comparando a quantidade cobrável com a versão anterior;
- a retenção acima do incluído sem ADR passou a reprovar o PR.

## Hands-on

**Tutorial.** Escreva o modelo de custo do `fin-azure` (`custo/custo.py`). Ele lê o código Terraform (com o
`python-hcl2`), um perfil de tráfego (transações por mês, GB por *endpoint*, GB de *log* por dia e por centro
de custo) e, se houver, um arquivo de preços com data, região e fonte. Ele imprime as quantidades cobráveis
por medidor e por centro de custo, e o custo por mil transações quando há preço.

**Desafio.** O modelo de custo provado como teste, sobre o código.

**Invariantes testáveis**

1. **Quantidade por medidor e por centro de custo.** O modelo calcula as duas. Medido, com 5 *endpoints*, 5
   zonas centralizadas e 75 GB de *log* por dia: **3.650 horas de *endpoint***, 1.000 GB processados, 5
   zonas-mês e **2.250 GB ingeridos** por mês (`pix` 1.200, `ledger` 750, `plataforma` 300), sem retenção
   cobrada.
2. **Zona repetida é sinalizada.** Uma mudança que cria as zonas `privatelink.*` em cada *spoke*, em vez de
   usar as do *hub*, reprova. Medido: as zonas foram de **5 para 15**, cada nome 3 vezes.
3. **Retenção acima do incluído exige ADR.** Medido: o *workspace* do `pix` com 365 dias, sem ADR, foi de 0
   para **13.360 GB-mês retidos cobrados** (40 GB por dia × 334 dias além dos 31), e o teste reprovou.
4. **Tudo com centro de custo, e um *budget* previsto.** Todo recurso com *tags* tem `cost-center`, e
   existe um *budget* com alerta `Forecasted`. Medido: a mutação com um *endpoint* sem a *tag* e o *budget* só
   com alerta real foi reprovada nas duas.

**Complemento.** Com uma assinatura real, crie o *budget* com alerta previsto **antes** de tudo, ligue a *tag
inheritance* e, depois de uma semana com o ambiente de teste no ar, compare o Cost Management por *tag* com o
modelo rodado com os preços da Retail Prices API. Destrua tudo no fim.

**Checagem**

1. Quais são os custos escondidos de uma rede privada no Azure, e como cada um aparece no código?
2. Quando reserva e quando *savings plan*, e qual é aplicado primeiro?
3. Onde *spot* serve num sistema de pagamentos, e o que o aviso de 30 segundos exige do serviço?
4. Por que o modelo de custo testa quantidades, e não reais?

## Capstone

O `fin-azure` é o seu componente do `fin-platform`: o `fin-platform` desenhado para o Azure, especificado no
`PROJETO.md` desta trilha. Aqui ele fica pronto, e nada nele exige uma assinatura.

**Entrega**

- [ ] *Management groups*, assinaturas e iniciativas de Azure Policy como código, com *tags* obrigatórias e
      localizações permitidas (marco 01)
- [ ] Identidades sem segredo e atribuições no menor escopo, com a matriz de acesso provada pelo avaliador
      (marco 02)
- [ ] Rede *hub-spoke* sem *endpoint* público, com Private Endpoint e DNS privado provados pelo resolvedor
      (marco 03)
- [ ] A computação escolhida por ADR, com o `pix-gateway` no alvo e a imagem por *digest* (marco 04)
- [ ] Mensageria idempotente, com DLQ, sessões e carga grande por referência (marco 05)
- [ ] A função de lote com orquestração determinística e escala que cabe no banco (marco 06)
- [ ] Bancos com HA *zone-redundant*, PITR, autenticação pelo Entra ID e a chave de partição analisada
      (marco 07)
- [ ] *Storage* sem *shared key*, Key Vault com *purge protection*, envelope com AAD e segredos fora do código
      (marco 08)
- [ ] Alertas a partir dos SLOs, *diagnostic settings* em todo recurso com dado e o Activity Log exportado
      (marco 09)
- [ ] O plano de DR com RPO, RTO, residência e acesso à região, e o *game day* com post-mortem (marco 10)
- [ ] O modelo de custo com as quantidades cobráveis e o custo por mil transações (marco 11)

**Critérios de pronto, cada um provado por um teste ou por um comando**

- [ ] Governança: a *fixture* com recurso fora das localizações permitidas e sem *tag* é reprovada
- [ ] Identidade: o avaliador e a regra sobre o código reprovam o papel amplo demais e o segredo de *service principal*
- [ ] Rede: o resolvedor mostra a zona só no *hub* resolvendo o IP público, e a regra reprova o *endpoint*
      público
- [ ] Mensageria: com o *lock* expirando, cada lançamento aparece uma vez com o *inbox*
- [ ] Dados: 50 `create` concorrentes da mesma chave dão um item, e o *batch* com falha não aplica metade
- [ ] Chaves: o AAD errado não decifra, e a regra reprova o cofre sem *purge protection*
- [ ] Operação: todo SLO, fila e conta do Cosmos tem alerta, e todo recurso com dado manda *log*
- [ ] DR: a ADR passa na tabela de regras, e a cópia geográfica de dado classificado sem ADR reprova
- [ ] Custo: a zona repetida e a retenção sem ADR aumentam a quantidade cobrável e reprovam
- [ ] Tudo roda em CI sem nenhuma variável `ARM_*` ou `AZURE_*` real

**A pergunta final.** Que dado do seu plano sai hoje da geografia Brasil, por qual caminho (*backup*, cópia de
*storage*, *log*, réplica), e qual ADR diz que pode?

## Principais aprendizados

- Custo é requisito não funcional: modelo antes, dono por centro de custo, alerta antes da fatura.
- Os escondidos no Azure: Private Endpoint por hora e por GB em cada serviço, zonas DNS repetidas por
  *spoke*, ingestão e retenção de *log*.
- A *tag* do recurso não é herdada; a *tag inheritance* vale para o registro de uso (nov 2026).
- Reserva primeiro, *savings plan* para o que muda; *spot* com 30 segundos de aviso só para o que pode ser
  refeito.
- O preço vem da Retail Prices API, datado; o teste compara quantidades. Medido: 365 dias num *workspace*
  deram 13.360 GB-mês retidos cobrados.
- Na entrevista, a resposta começa por medir, separa desperdício de arquitetura e termina com a regra que
  impede a volta.
