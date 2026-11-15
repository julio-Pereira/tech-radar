# Auditoria — adendo: testes A/B como estratégia de *release*

Adendo a `entrega-continua-e-devops/07` (`release-e-rollback-por-slo`), do plano de 14 nov 2026 (vaga Itaú
Engenharia de Software Sênior, Go/AWS: "Blue-Green Deployment, Canary Release e testes A/B").

## Fase 0 — estado real e conferências (14 nov 2026)

- **Marco 07 no `main`:** 60 minutos, 6 invariantes, 4 questões de quiz (a de *canary* é a 2, sobre janela
  e tolerância). Σ da trilha 630, `estimatedHours` 21, sem comentário de cálculo no `course.yaml`.
- **Glossários:** `ml-em-producao` já tem **SRM** e ***Guardrail***. Dos 5 verbetes do plano, entram só 3
  (teste A/B, unidade de aleatorização, efeito mínimo detectável). O SRM ganhou um dono único em
  `conceitos.yaml` (`ml-em-producao/08`, que cita "SRM"). O *guardrail* não virou conceito: o apelido
  ligaria os *guardrails* de governança das trilhas de nuvem, que são outra coisa; o texto remete a
  `ml-em-producao/08` pela ponte.
- **Ferramenta de `kubernetes/13`:** Argo Rollouts. Conferido no repositório, na v1.10.2
  (`docs/features/experiment.md`): o `Experiment` sobe ReplicaSets efêmeras e divide o tráfego **por peso**,
  com análise junto. Serve à análise de *canary*; o A/B por cliente continua sendo da *flag*. Citado por
  link na caixa da seção nova, sem exercício.
- **Nomes de serviço da AWS:** ficam para o Bloco 3 (Fase 2), conferidos na documentação antes de
  publicar.

## Fase 1 — Blocos 1 e 2

- Seção **"Canary não é teste A/B"** depois da análise de *canary*, com a tabela de quatro colunas
  (*rolling* incluído), unidade de aleatorização, atribuição determinística, pré-registro, armadilhas, o
  lugar de cada um na esteira, o lançamento escuro e o parágrafo de fintech marcado **conferir**.
- `estimatedMinutes` do 07: 60 → **70**. Σ = **640**; `estimatedHours` continua **21** (640 × 2 / 60 =
  21,3). O `course.yaml` ganhou o comentário do cálculo, e a regra do tempo do `PROJETO.md` passou a 640.
- Quiz: a questão 2 virou "*canary* × teste A/B"; 4 questões, nenhuma com a resposta certa como a única
  opção mais longa.
- `PROJETO.md` do `fin-pipeline`: a linha do marco 07 ganhou "atribuição e análise de experimento" e as
  provas; a definição de pronto ganhou o pré-registro do experimento.

### Medições (Go 1.24, só a biblioteca padrão, sementes fixas)

| Invariante | Resultado |
| --- | --- |
| 7. atribuição fixa | a mesma variante em 1.000 chamadas e em 200 clientes conferidos numa segunda instância do processo |
| 8. divisão declarada | 50.250 × 49.750 em 100 mil, dentro de ±0,5 ponto |
| 9. sais diferentes | tabela cruzada de 24.862 a 25.207 por célula; a atribuição ingênua (sem experimento nem sal) concordou nos dois experimentos em 10.000 de 10.000, a correta em 5.044 |
| 10. SRM | p = 0,11 na correta; p = 2 × 10⁻¹⁰ com 3% dos eventos de uma variante perdidos. O qui-quadrado conferiu com a tabela (3,841 e 5,991 a 5%; 10,828 a 0,1%) |
| 11. guarda | conclusão de 90% para 93% ("melhor"), latência p95 de 350 para 520 ms com tolerância de 100: encerra pela latência |
| 12. intervalo | efeito real de 2 pontos: IC de 1,4 a 2,5 pontos, "melhor"; efeito zero: "sem diferença" |
| 13. espiar (demonstração) | 1.000 simulações com efeito zero: espiando a cada um de 20 passos, 225 falsos positivos (22,5%); olhando só no fim, 48 (4,8%) |
| 14. atributo proibido | o experimento que varia `tarifa` e o sem guardas são recusados |

Um teste do laboratório nasceu tautológico (comparava a atribuição consigo mesma) e foi reescrito para
contrastar a atribuição ingênua com a correta entre dois experimentos.

## Fase 2 — Bloco 3: pontes (15 nov 2026)

| Marco | Ponte | Volta em `entrega-continua-e-devops/07` |
| --- | --- | --- |
| `kubernetes/13` | parágrafo depois do *blue-green*: canary responde "é seguro?", o A/B responde "é melhor?"; o `Experiment` do Argo Rollouts, por link, sem exercício | já existia (caixa "Na ferramenta" e Reencontro) |
| `system-design/14` | parágrafo na seção de *feature flags*: o que a *flag* de experimento pede além da de *release* | já existia (Reencontro) |
| `ml-em-producao/08` | Reencontro: a mesma atribuição e o mesmo SRM, com a funcionalidade como objeto | já existia (seção nova) |
| `aws-para-backend/04` | "As três estratégias na AWS" e a linha nova da tabela Azure → AWS | acrescentada no Reencontro |
| `ia-na-engenharia/07` | já existia desde a Fase 3 da trilha ("O desenho do piloto") | acrescentada no Reencontro |

### Conferências desta fase

Os nomes de serviço foram conferidos em fontes oficiais, e não publicados de memória. O acesso direto às
páginas de documentação estava bloqueado no ambiente, então a conferência foi pela busca restrita aos domínios
oficiais (`docs.aws.amazon.com`, `aws.amazon.com`, `learn.microsoft.com`), com as URLs nas referências do marco.

- **Argo Rollouts v1.10.2** (clone local, `docs/features/experiment.md`): o `Experiment` sobe ReplicaSets
  efêmeras com análise junto, e divide o tráfego **por peso**. A documentação o cita para testes A/B/C.
- **ECS:** *blue/green* nativo desde jul 2025; linear e canary nativos desde out 2025 (`strategy` com
  `BLUE_GREEN`, `LINEAR` ou `CANARY`); ALB, NLB, Service Connect e VPC Lattice; *rollback* por alarme do
  CloudWatch. O CodeDeploy continua disponível.
- **AppConfig:** *flags* com variantes por regra sobre o contexto (anúncio de jul 2024), avaliadas no
  AppConfig Agent; experimentação gerenciada lançada em jun 2026 (o histórico da documentação registra 22 jun,
  e o anúncio, 1º jul).
- **CloudWatch Evidently:** suporte encerrado em out 2025. A documentação dá 16 out 2025, e o anúncio
  original, 17 out; o marco diz só "out 2025".
- **Azure:** o Container Apps divide o tráfego entre revisões por peso; as *feature flags* do App
  Configuration têm variantes e o cenário de experimento, que aparecia como *preview* na data da conferência.
  O marco registra o *preview* com a data. A busca não achou anúncio de descontinuação da integração com o
  Split, e o marco não cita o Split pelo nome.
