# Projeto guia — fin-blueprint

> Componente do `fin-platform`. Não é um marco. O `fin-blueprint` é o **dossiê executável de
> arquitetura** do `fin-platform`: o lugar onde as decisões das outras trilhas viram um desenho
> único, numerado e verificável. Não tem API própria.

## O que você vai construir

Um repositório com cinco pastas: `model/` (C4 como código), `adr/` (decisões + lint),
`capacity/` (modelo de capacidade com testes), `contracts/` (OpenAPI + proto com detecção de
breaking change no CI) e `sim/` (simuladores em Go: balanceador, rate limiter, anel de consistent
hashing, motor de flags, disponibilidade composta).

**Contratos que o `fin-blueprint` tem com os vizinhos** — todos simuláveis com stub:

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | OpenAPI do `pix-gateway` (o contrato passa a ser governado aqui) | trilha `spring-boot` |
| consome | RPO/RTO e a taxa de escrita sustentável medida do `fin-store` | trilha `dados-distribuidos` |
| consome | SLOs e error budget por serviço | trilha `observabilidade` |
| consome | ADRs de cada `PROJETO.md` (índice único) | todas |
| serve | números de capacidade para dimensionar `requests`/`limits` e gatilhos de HPA | trilha `kubernetes` |
| serve | modelo C4 do `fin-platform` como fonte única dos diagramas | todas |

**O que este projeto não é.** Não reimplementa saga, outbox nem o ledger — esses já existem nas
trilhas donas. Os casos (09–12) usam **fakes** dos vizinhos e provam propriedades do *desenho*.

## Pré-requisitos

- Go 1.22+ (simuladores); Docker
- Uma ferramenta de C4 como código (Structurizr DSL ou LikeC4 — escolha uma e registre em ADR;
  LikeC4 é a recomendação padrão desta trilha por ser MIT e não exigir conta em serviço externo)
- `oasdiff` e `spectral` (OpenAPI); `buf` (proto)
- `k6` ou `pgbench` (uma medição real no marco 02)
- Toxiproxy (falha injetada no caso do marco 09)
- Confirme versões e licenças na Fase 0 do seu trabalho — todas as ferramentas acima são
  gratuitas e de código aberto.
- **Não precisa:** conta em cloud paga, Kubernetes, broker real — os fakes bastam.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `model/` C4 níveis 1–2 do `fin-platform` + `adr/0001` + `adr-lint` | O lint reprova uma ADR sem "gatilho de reversão"; todo contêiner do modelo tem `owner` e `criticidade` |
| 02 | `capacity/` com `capacity.yaml`, programa de cálculo e orçamento de latência | Três cenários batem com os valores calculados à mão; uma medição real fica dentro de 2× da previsão |
| 03 | Fitness tests de fronteira + papéis de banco por módulo | Uma violação plantada deixa o CI vermelho; o papel de A não lê tabela de B |
| 04 | `sim/lb` (RR, least-conn, P2C) e `sim/ring` (consistent hash) | Com um backend lento, P2C tem p99 menor que RR; adicionar o 5º nó move ≤ 1/5 + 5 p.p. das chaves |
| 05 | `contracts/` v1→v2 com `oasdiff`, `spectral` e `buf` no CI | 3 de 3 mudanças incompatíveis plantadas quebram o CI; a mudança aditiva passa |
| 06 | `sim/ratelimit` (token bucket, janela deslizante) + agregador de medição | 50 clientes nunca excedem limite + burst; faturamento = soma exata dos eventos com duplicata e fora de ordem |
| 07 | `STATE-MAP.md` com validação + decisão "precisa shardar?" por número | A resposta do modelo muda exatamente no limiar medido |
| 08 | Simulador de fila com admissão limitada | A lei de Little confere (±5%); sob 150% de carga, o p99 dos aceitos fica sob o SLO |
| 09 | Desenho do Pix + tabela de falhas com fake de SPI | Conservação: nenhum pagamento em dois estados terminais; soma de débitos = créditos + em trânsito |
| 10 | Cache de validade do consentimento com limite de obsolescência | Após a revogação, nenhuma requisição é admitida depois de `t + staleness` (teste de propriedade) |
| 11 | Simulador de fan-out + entrega de webhook | Ponto de cruzamento de custo encontrado; 1.000 eventos com 20% de falha → todos entregues, efeito processado uma vez |
| 12 | Serviço de decisão com orçamento de 80 ms e modo sombra | Com um enriquecimento fora, responde dentro do orçamento; a regra-sombra nunca muda a resposta |
| 13 | `sim/availability` + roteamento por célula | Simulação dentro de 0,1 p.p. da fórmula; matar 1 célula afeta ≤ 1/N dos tenants |
| 14 | Motor de flags + lint de flags + execução em paralelo (dark launch) | Mesmo usuário → mesma variante; ±1% em 100 mil; flag expirada derruba o CI; 0 divergências sem explicação |
| 15 | Documento de design completo do caso escolhido + `design-lint` | O lint reprova documento sem tabela de falhas, sem "não vamos fazer" ou com número sem origem em `capacity.yaml` |

## Definição de pronto (capstone)

- [ ] O modelo C4 do `fin-platform` compila em CI e todo contêiner tem dono e criticidade
- [ ] Todo número de qualquer documento aponta para uma chave de `capacity.yaml` — nenhum número
      "de cabeça"
- [ ] O modelo de capacidade foi confrontado com **uma medição real** e a diferença está escrita
- [ ] Nenhuma mudança incompatível de contrato passa no CI; a política de depreciação está escrita
- [ ] Existe rate limit por plano **e** medição de uso reconciliável com o faturamento
- [ ] Para cada dado do `STATE-MAP.md`: dono, consistência escolhida, RPO
- [ ] Toda decisão de "falhar aberto × fechado" está escrita como decisão de negócio, com dono
- [ ] A disponibilidade composta do caminho do Pix está calculada **e** simulada
- [ ] Toda feature flag tem dono e data de expiração, e o CI as faz cumprir
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Tráfego 3× o previsto pelo modelo.** O primeiro componente a saturar é o que o modelo apontou?
   Se não, qual premissa estava errada?
2. **Derrubar uma célula** sob carga. Quantos tenants sentiram? Bate com 1/N?
3. **PR com mudança incompatível** de contrato. O CI pegou? Quanto tempo até alguém perceber?
4. **Revogar um consentimento** durante pico de leitura. Qual o tempo real até a última requisição
   admitida? Está dentro do limite que você declarou?
5. **Flag expirada** em produção simulada. O sistema avisou antes de alguém abrir o código?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`. Aqui boa parte do hands-on é *modelar e medir*, que
custa mais que ler; os 915 min de leitura viram ~30h.
