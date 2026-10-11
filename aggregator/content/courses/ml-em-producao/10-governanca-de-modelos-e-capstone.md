---
id: governanca-de-modelos
title: "Governança de modelos e capstone"
summary: "O consentimento revogado precisa chegar ao modelo, e a organização precisa saber qual modelo viu o quê. Capstone da trilha."
estimatedMinutes: 55
references:
  - title: "Model Cards for Model Reporting (Mitchell et al.)"
    url: https://arxiv.org/abs/1810.03993
---

## Linhagem de treino

Assim como uma tabela ouro tem linhagem até o bruto (`engenharia-de-dados/09`, trilha planejada), um
modelo tem **linhagem de treino**: quais dados, quais consentimentos e qual janela temporal entraram no
dataset que o treinou. Sem essa linhagem, a pergunta "quais modelos usaram o consentimento X" não tem
resposta confiável — e essa pergunta é exatamente o que uma revogação em massa exige responder rápido.

## Revogação e modelo já treinado: não existe "desaprender" limpo

Um modelo treinado com dado de um consentimento depois revogado já absorveu esse dado nos próprios pesos —
não existe uma operação limpa de "remover só aquele cliente" de um modelo já treinado, da mesma forma que
não existe em `engenharia-de-dados/10` (trilha planejada) para dado já exportado. As políticas possíveis
são sempre um trade-off: **retreino periódico** (o modelo eventualmente "esquece" porque o dado revogado
sai da próxima janela de treino), **expiração do modelo por fração de dados revogados** (se X% do dado de
treino de um modelo foi revogado, o modelo é considerado expirado e deixa de ser promovido ou servido), ou
**treino só com dado agregado/anonimizado** quando a aplicação permitir. **A escolha entre essas políticas
é uma decisão de política documentada com o jurídico** — esta trilha ensina o mecanismo de cada opção e
testa a expiração, mas não decide qual política adotar.

## Retenção de modelos e do log de decisão, e inventário

Modelos antigos e logs de decisão têm política de retenção própria (distinta da retenção de dado bruto) —
por quanto tempo um modelo arquivado fica disponível para auditoria, por quanto tempo um log de decisão
precisa ser mantido para apoiar uma eventual revisão. Um **inventário de modelos** (quais existem, em que
estágio, treinados com qual dado) é o que torna possível responder a essas perguntas sem precisar
reconstruir a história a partir de fragmentos espalhados.

## Antipadrões

- **Vazamento** não detectado (marco 02): a assinatura clássica de métrica ótima no laboratório,
  resultado ruim em produção.
- ***Training/serving skew*** (marco 03): duas implementações da mesma feature, dois números.
- **Feedback ignorado** (marco 08): nunca explorar, e por isso nunca aprender fora do próprio passado.
- **Notebook em produção**: um pipeline de treino que vive só na máquina de alguém, sem versionamento nem
  rastreio — o "script de cron" desta trilha.
- **Métrica de vaidade**: otimizar uma métrica fácil de melhorar e difícil de conectar a valor de negócio
  real (marco 01).
- ***Accuracy*** em base desbalanceada: uma métrica que parece boa só porque a classe majoritária domina.
- **Modelo sem dono**: ninguém responsável por decidir retreino, aposentadoria ou resposta a um alerta de
  drift.
- **"ML porque sim"**: construir o sistema de ML quando a resposta correta, desde o marco 01, era um
  baseline simples.

## O que vem depois

Monitoramento contínuo (marco 07) e o ciclo de feedback (marco 08) não têm um ponto final — são disciplina
permanente, não um projeto que termina. LLMs e agentes autônomos ficam deliberadamente fora do escopo desta
trilha: os problemas que eles trazem (alucinação, custo de inferência, avaliação sem rótulo claro) merecem
tratamento próprio, não uma extensão apressada deste material.

## Exemplo numa fintech

Uma revogação em massa (20% dos consentimentos de uma coorte, por uma mudança de política de um parceiro)
chega de uma vez. A consulta de linhagem identifica que três modelos em produção foram treinados com mais
de 15% de dado agora revogado. A política de expiração, já configurada com limite de 10%, marca os três
como expirados automaticamente — o *registry* bloqueia qualquer tentativa de promover uma nova versão
deles ou de continuar servindo a versão atual, até que sejam retreinados com um conjunto de dados que
respeite o novo estado de consentimento.

## Hands-on

**Tutorial.** Implemente a consulta de linhagem de treino e a política de expiração por fração de dado
revogado.

**Desafio.** Simule uma revogação em massa e observe a cadeia de efeitos sobre os modelos em produção.

**Invariantes testáveis**

1. A consulta "quais modelos usaram o consentimento X" devolve o conjunto **correto** de modelos — testada
   contra um cenário conhecido do `sim-clientes`.
2. Quando a fração de dados revogados num modelo passa do limite configurado, o modelo é marcado
   **expirado** automaticamente, e o *registry* **bloqueia** sua promoção e seu *serving* — gate testado,
   não documentado como intenção.
3. O pipeline completo, de dado a decisão, é **reproduzível ponta a ponta** — um teste de integração que
   atravessa todos os marcos anteriores.
4. Todos os critérios da **Definição de pronto** (`PROJETO.md`) passam sobre a plataforma completa.

**Complemento.** Escreva a política de expiração (limite de fração revogada, ação ao expirar) como
configuração testada, não como documento solto.

**Checagem**

1. Por que não existe uma operação limpa de "desaprender" um cliente específico de um modelo já treinado?
2. Quais são as três políticas possíveis para tratar revogação em modelo já treinado, e por que a escolha
   entre elas não é desta trilha?
3. Qual antipadrão desta trilha corresponde a "nunca explorar, e por isso nunca aprender fora do próprio
   passado"?
4. Por que LLMs e agentes autônomos ficam deliberadamente fora do escopo desta trilha?

> **Reencontro — todas as anteriores desta trilha; `engenharia-de-dados/10` (trilha planejada);
> `dados-distribuidos/13`; `observabilidade/16`.** A consulta de linhagem por consentimento e o mecanismo
> de expiração retomam diretamente a propagação de revogação de `engenharia-de-dados/10`. A governança de
> PII e auditoria de `dados-distribuidos/13` é o mesmo tipo de disciplina aplicada aqui a modelo em vez de
> tabela. E o inventário de modelos com custo e retenção segue o mesmo raciocínio de `observabilidade/16`
> sobre custo e escala de telemetria, aplicado a artefato de modelo.

## Principais aprendizados

- Linhagem de treino (quais dados, consentimentos e janela entraram em cada modelo) é o que torna possível
  responder "quais modelos usaram o consentimento X" com confiança.
- Não existe "desaprender" limpo de um modelo já treinado — só políticas de trade-off (retreino periódico,
  expiração por fração revogada, treino agregado), e a escolha entre elas é decisão de política com o
  jurídico, não desta trilha.
- Um inventário de modelos com retenção própria evita precisar reconstruir a história de cada modelo a
  partir de fragmentos espalhados.
- Os antipadrões desta trilha compartilham a mesma raiz dos antipadrões de `engenharia-de-dados`: decisão
  tomada sem o rigor que os marcos anteriores ensinaram.
- Monitoramento e feedback loop são disciplina permanente, sem ponto final — e LLMs/agentes ficam fora de
  escopo porque merecem tratamento próprio, não uma extensão apressada.

## Capstone

O `fin-offers` é o seu motor de ofertas com feedback loop — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ela fica pronta.

**Entrega**

- [ ] `sim-clientes/` com propensão latente, efeito real da oferta, rótulo atrasado, armadilha de
      vazamento e grupos sintéticos
- [ ] Baseline por regras e *harness* de avaliação offline, com *policy gate* testado exaustivamente
- [ ] Dataset de treino *point-in-time*, sem vazamento, com split temporal e hash reproduzível
- [ ] `features/` com definição única, paridade offline/online, e regra "a feature some com o
      consentimento"
- [ ] `treino/` reprodutível, com *model card*, gate de margem sobre o baseline e testes de comportamento
- [ ] `registry/` com estágios, gates de contrato e proveniência, *shadow* e rollback testados
- [ ] `servico-ofertas/` com *policy gate* no *serving*, fallback dentro do orçamento, e log de decisão
      com *replay*
- [ ] `monitoramento/` de drift e qualidade com alertas testados
- [ ] `experimentacao/` com atribuição determinística, SRM, propensão registrada e *guardrails*
- [ ] *Reason codes* reproduzíveis, auditoria de disparidade, e bloqueio de *proxy*
- [ ] Linhagem de treino por consentimento, e política de expiração de modelo testada

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Toda decisão é registrada e reproduzível (mesmas entradas + versão do modelo → mesma saída)
- [ ] Nenhuma feature de treino usa informação posterior ao instante da decisão (teste por construção)
- [ ] Cada feature tem um único caminho de cálculo; paridade offline/online provada
- [ ] Todo candidato passa pelo *policy gate* antes do modelo, em toda construção de candidatos e no
      *serving*
- [ ] Nenhum modelo é promovido sem superar o baseline em validação temporal, com calibração dentro do
      limite
- [ ] Existe *rollback* testado e *shadow* que não altera a resposta
- [ ] Drift e queda de qualidade têm alerta testado
- [ ] Existe grupo de controle/exploração e a probabilidade da ação é registrada para avaliação
      contrafactual
- [ ] Há limite de frequência de ofertas por cliente, aplicado e testado
- [ ] Toda oferta tem *reason codes*; atributos proibidos e *proxies* são barrados; disparidade é medida
- [ ] A revogação de consentimento propaga até features, conjuntos de treino e expiração/retreino de
      modelos, com política declarada
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página — inclusive se
nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das dez decisões que você tomou
aqui, qual só se sustenta porque o `sim-clientes` não tem o tipo de viés que uma base real teria — e como
você descobriria isso em produção?**
