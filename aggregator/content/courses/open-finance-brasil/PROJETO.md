# `fin-opengate` — projeto guia da trilha `open-finance-brasil`

> **Stub.** Esta trilha ainda está em `course.yaml` + 10 marcos placeholder — ver o aviso em
> cada marco. Este `PROJETO.md` reproduz a especificação já fechada em
> `PLANO-trilha-open-finance-brasil.md` §7; o conteúdo completo dos marcos chega bloco a
> bloco nas próximas PRs desta trilha.

Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
constrói enquanto lê a trilha. O `fin-opengate` é o **portão de Open Finance** do `fin-platform`:
expõe, no papel de transmissor/detentor, APIs de dados e de iniciação de pagamento sob
consentimento; e, no papel de iniciador/receptor, consome as de outras instituições — tudo contra
um diretório e uma CA simulados, com um *harness* que prova a conformidade.

## O que você vai construir

Seis partes: `diretorio-sim/` (diretório de participantes, emissão de SSA e JWKS, CA simulada,
revogação), `transmissor/` (servidor de autorização, consentimento, APIs de dados e de pagamento),
`iniciador/` (cliente com registro dinâmico, fluxo de consentimento e pagamento, resiliência por
detentora), `conformidade/` (*harness* de contrato + casos negativos + relatório de evidência),
`sim/` (detentora e TPP simulados com falhas injetáveis) e `spec-versions.yaml` (versões das
especificações em uso).

## Contratos com os vizinhos (todos simuláveis com stub)

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Saldos, extrato, contas e limites (por conta) | `fin-books`, trilha `ledger-e-contabilidade` |
| consome | Iniciação de Pix e consulta de estado terminal | `fin-rails`, trilha `pagamentos-e-liquidacao`, `pix-gateway` |
| consome | Cadastro e produtos do cliente | core/legado simulado (ACL) |
| serve | Eventos de consentimento (criado, autorizado, revogado) via *outbox* | `pix-stream`, trilha kafka, `engenharia-de-dados` |
| serve | Telemetria e métricas de negócio (por TPP, endpoint, resultado) | stack de `observabilidade` |
| serve | Trilha de auditoria de acesso a dado sob consentimento | `seguranca-aplicacao`, auditoria |

**O que este projeto não é.** Não é participante real do ecossistema, não usa certificado nem
diretório reais, não substitui a certificação oficial e não implementa produto de crédito ou
investimento — só o acesso a seus dados como API.

**Pré-requisitos.** Go (toolchain atual); Docker (PostgreSQL local, **opcional** — há alternativa
em memória para 01-03, 05-06, 08); OpenSSL ou a biblioteca `crypto/x509` para a CA simulada; uma
ferramenta de validação de OpenAPI (por ADR). **Não precisa:** conta em nuvem, certificado real,
ferramenta paga. Confirmar versões e licenças na Fase 0.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `spec-versions.yaml` + mapa de papéis/fases executável (quem pode chamar o quê) | Tabela de casos: chamada fora do papel é recusada |
| 02 | `diretorio-sim/` + registro dinâmico no `transmissor/` | SSA adulterada, expirada ou de participante revogado é recusada; certificado fora da CA é recusado |
| 03 | Servidor de autorização com PAR, *request object* e token vinculado ao certificado | Suíte negativa FAPI: cada violação recebe a recusa certa |
| 04 | Máquina de estados do consentimento + revogação + eventos | Transição inválida rejeitada; revogação corta o acesso dentro do limite declarado |
| 05 | APIs de dados sobre o core simulado, com contrato canônico | Resposta valida contra o OpenAPI; escopo sem consentimento devolve a recusa certa; paginação íntegra |
| 06 | Medição de latência/disponibilidade por endpoint e por TPP | Relatório reproduz o valor esperado com relógio falso; TPP excedente não afeta os demais |
| 07 | Consentimento de pagamento + iniciação idempotente + estados | Mesma chave 2x = 1 pagamento; consentimento de pagamento só vale uma vez; estados terminais únicos |
| 08 | `iniciador/` com registro, descoberta e *circuit breaker* por detentora | Detentora lenta não derruba as outras; pagamento com resultado desconhecido é resolvido por consulta |
| 09 | `conformidade/` com relatório de evidência e matriz de versões | `make conformance` passa; remover um campo obrigatório de uma resposta faz **falhar** |
| 10 | Runbooks, painel de SLO por TPP e game day | Incidente simulado detectado, mitigado e documentado |

## Definição de pronto (capstone)

- [ ] Todo participante é identificado pelo diretório (certificado + SSA); nada que a requisição *afirma* substitui isso
- [ ] SSA/certificado adulterado, expirado, de participante revogado ou fora da CA é recusado, com o erro certo
- [ ] O servidor de autorização recusa **cada** violação do perfil de segurança testada (suíte negativa)
- [ ] Token roubado e usado com outro certificado é recusado (vinculação ao certificado)
- [ ] Consentimento só transita por estados válidos; revogado, expira ou muda, o acesso cessa dentro do limite **declarado**
- [ ] Nenhuma API devolve dado fora do escopo **e** do consentimento; a recusa é a especificada
- [ ] Respostas validam contra o contrato; paginação não perde nem repete item
- [ ] Iniciação de pagamento é idempotente; o consentimento de pagamento não é reutilizável; estado terminal único
- [ ] Um TPP que excede a cota não degrada os demais; a medição de SLA reproduz o esperado
- [ ] O iniciador isola falhas por detentora; resultado desconhecido é resolvido por consulta, nunca por novo débito
- [ ] `make conformance` produz relatório de evidência e **falha** quando um requisito é violado de propósito
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **O diretório fica fora do ar por 30 minutos.** O que continua funcionando? O que o cache de chaves permite? Quando a coisa vira insegura?
2. **O certificado de um TPP expira durante um fluxo de pagamento.** O que o usuário vê? O que é registrado?
3. **O cliente revoga o consentimento enquanto o TPP está paginando.** Quantas páginas ainda saem? O limite declarado vale?
4. **Um TPP envia 10x a cota.** Os outros percebem? O que aparece no painel?
5. **Uma nova versão da API é publicada e metade dos TPPs ainda usa a anterior.** Como as duas coexistem? Quando a antiga morre?
6. **O core legado devolve um campo nulo que o contrato exige.** Onde isso é detectado — no teste, no *harness* ou pelo TPP?
7. **A detentora responde ao pagamento com timeout.** O iniciador cobra de novo? Como resolve?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 610 min de leitura viram ~20h porque o hands-on é
montar o diretório simulado, escrever o caso negativo de cada requisito e rodar o *harness*
contra as próprias falhas.

## Versão de referência dos diagramas

Os diagramas de consentimento (marco 04) e de iniciação de pagamento (marco 07) usam os status
`AWAITING_AUTHORISATION`, `AUTHORISED`, `REJECTED` e `CONSUMED`. Esses nomes foram conferidos em
novembro de 2026 em documentação pública de participantes, não no texto oficial. Antes de
implementar, **confira** a versão vigente das APIs de consentimento e de pagamentos no portal de
especificações do Open Finance Brasil. Se ela tiver outros status, como um `EXPIRED` separado,
atualize os diagramas junto com o código.
