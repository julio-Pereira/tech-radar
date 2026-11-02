# `fin-lend` — projeto guia da trilha `credito-e-risco`

`fin-lend` é o **crédito do `fin-platform`**: contratos como máquina de estados, cronogramas,
razão, política de decisão versionada, limites, cobrança, provisão e relatórios de carteira,
sobre uma carteira sintética (50 mil contratos, 36 meses de histórico, determinísticos por
semente).

## Estrutura do repositório

```
fin-lend/
  calc/              # Price, SAC, CET, antecipação, pro rata (decimal, sem float)
  contrato/          # máquina de estados + eventos + cronograma
  razao/             # interface do razão; adaptador fin-books e razão mínimo em memória
  politica/          # regras, versões, knock-outs, tabela de estratégia, log de decisão
  risco/             # KS, AUC, PSI, calibração, perda esperada, vintage, roll rate
  limites/           # limite por cliente/produto/carteira, reservas, concentração
  cobranca/          # régua, buckets, renegociação, janelas de contato, baixa
  provisao/          # estágios, gatilhos, ECL, lançamentos
  alm/               # escada de liquidez e cenários
  carteira/          # gerador sintético + relatórios as-of
  regras.yaml        # parâmetros regulatórios fictícios, com fonte "conferir"
  casos/             # tabelas de casos escritas à mão (golden)
  Makefile           # make test | make carteira | make relatorio | make game-day
```

## Integração com o `fin-platform`

| Direção | O quê | Com quem |
| --- | --- | --- |
| consome | Razão (postar contrato, juros, provisão) | `fin-books` (trilha `ledger-e-contabilidade`) |
| consome | Renda e comportamento vindos de dados de Open Finance (sintéticos) | `fin-opengate`, `fin-store` |
| consome | Pagamentos de parcela (boleto/Pix) | `fin-rails` |
| consome | Modelo de risco/oferta como serviço | `ml-em-producao` |
| serve | Posição de carteira e liquidez | `fin-books` (fechamento), `fin-obs` |
| serve | Indicadores de risco e eventos de contrato | `pix-stream` / `fin-flow` |

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Máquina de estados do contrato | Só transições válidas; estado terminal sem saída; evento fora de ordem recusado |
| 02 | `calc/` (Price, SAC, CET, antecipação) | Tabelas à mão reproduzidas; Σ amortizações = principal; saldo final zero |
| 03 | Cronograma → lançamentos no razão | Razão balanceado; saldo devedor derivado = cronograma; *replay* reproduz |
| 04 | Ingestão de dados de entrada + qualidade | Campo faltante/atrasado trata-se por regra declarada; consulta externa com custo e *cache* |
| 05 | Política versionada + motor + log de decisão | Decisão determinística; monotonicidade; versão fixada; *replay* |
| 06 | `risco/` (KS, AUC, PSI, calibração, EL) | Casos escritos à mão; AUC de modelo aleatório ≈ 0,5; PSI de distribuições iguais = 0 |
| 07 | `limites/` com reserva e liberação | Soma de saques concorrentes ≤ limite (teste com corrida); liberação idempotente |
| 08 | `cobranca/` com relógio falso | Buckets corretos; nenhum contato fora da janela; renegociação conserva o devido |
| 09 | `provisao/` por estágios | Provisão = Σ ECL do gabarito; migração de estágio nunca reduz sem cura; lançamento balanceado |
| 10 | `alm/` escada de liquidez | Escada soma = Σ fluxos; cenário pior nunca melhora a cobertura |
| 11 | Relatórios *as-of* de carteira | Mesmo relatório em duas execuções = idêntico; vintage e *roll rate* do gabarito |
| 12 | Game day + `make relatorio` completo | Evidências do capstone presentes e verificadas |

## Definição de pronto (capstone)

Do pedido de empréstimo ao provisionamento, **ponta a ponta e consistente com o razão**: (a)
proposta decidida pela política vigente e registrada; (b) contrato originado com cronograma; (c)
desembolso, juros, pagamentos, atraso e renegociação lançados no razão; (d) cobrança conforme
janelas; (e) provisão por estágio no fechamento; (f) relatório de carteira reproduzível; (g)
*game day* de indisponibilidade de consulta externa e pico de inadimplência com *post-mortem*.

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 720 min viram ~24h porque o hands-on é escrever e
provar cada parte.

## Versão de referência dos diagramas

Os diagramas de provisão seguem, de forma simplificada, o modelo de perda esperada da
**Resolução CMN nº 4.966/2021**, em vigor desde 1º de janeiro de 2025. Ela foi alterada depois,
entre outras, pela Resolução CMN nº 5.100/2023 e pela Resolução BCB nº 352/2023; **confira** o
texto consolidado vigente no portal de normas do Banco Central antes de implementar.

| Diagrama | Marco | O que simplifica |
| --- | --- | --- |
| `cr-estagios` | 09 | Três estágios (12 meses, vida inteira, problemático), cura com período de observação e baixa; não mostra as exceções nem os critérios completos de ativo problemático |
| `cr-provisao-fechamento` | 09 | Da ECL por contrato ao lançamento no fechamento; não mostra desconto, cenários nem as contas contábeis exatas |
| `cr-perda-esperada` | 06 | EL = PD × LGD × EAD num único horizonte, sem desconto a valor presente |
| `cr-buckets` | 08 | Faixas de atraso e renegociação; as faixas são as usuais de mercado, não as de uma norma específica |

Os **valores** usados nos diagramas e nos exemplos são **ilustrativos** e, na prática, declarados
pela política de cada instituição: o gatilho de SICR de "atraso acima de 30 dias", a PD de vida
inteira de 15% do exemplo do marco 09, os limiares de PSI e as faixas de atraso. Se a norma ou a
política mudar, atualize os diagramas junto com o código.
