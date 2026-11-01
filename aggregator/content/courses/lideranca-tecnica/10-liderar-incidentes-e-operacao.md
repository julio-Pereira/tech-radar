---
id: liderar-incidentes-e-operacao
title: "Liderar incidentes e operação"
summary: "O papel de quem lidera durante um incidente: quem comanda, quem escreve, quem fala com o negócio, e o acompanhamento das ações depois."
estimatedMinutes: 65
competencies: [operacao, confiabilidade]
references:
  - title: "Google SRE Book — Managing Incidents"
    url: https://sre.google/sre-book/managing-incidents/
  - title: "Google SRE Workbook — Incident Response"
    url: https://sre.google/workbook/incident-response/
---

## Os papéis de um incidente

Um incidente bem conduzido separa papéis explicitamente: o **comandante** (coordena, não
necessariamente conserta — decide prioridade e mantém visão geral), a **comunicação** (atualiza
partes interessadas em cadência regular, sem interromper quem está mitigando), o **escriba**
(mantém a linha do tempo em tempo real, não reconstruída depois de memória) e os **especialistas**
(mitigam e diagnosticam). Em incidentes pequenos uma pessoa acumula papéis; em incidentes grandes,
separar os papéis evita que a mesma pessoa tente coordenar e consertar ao mesmo tempo — o que
degrada as duas coisas.

## Quando passar o comando

O comandante de incidente não é necessariamente a pessoa mais sênior disponível — é quem está mais
disponível para **coordenar** sem estar no meio do diagnóstico técnico. Passar o comando
explicitamente (não silenciosamente) quando a pessoa certa aparece, ou quando um turno muda, evita o
vácuo de "todo mundo acha que outra pessoa está no comando".

## Severidade e critérios de escalada

Critérios de severidade definidos **antes** do incidente (não inventados durante a crise) tornam a
decisão de escalar — chamar mais gente, acordar alguém, avisar a diretoria — uma checagem contra
critério, não uma decisão sob pressão no calor do momento.

## Comunicação em camadas

Comunicação durante um incidente tem públicos diferentes: interna (o time técnico, detalhada),
negócio (impacto e previsão, sem jargão), cliente (quando aplicável, clara e sem prometer prazo que
não se pode cumprir) e regulador (quando a obrigação existe — **conferir** prazos e canais exigidos
com compliance). Cada público recebe atualização em **cadência declarada** (a cada 30 minutos, por
exemplo), não só quando "tem novidade", porque silêncio durante um incidente é, ele mesmo, uma
informação ruim.

```diagrama
lt-incidente
```

## Mitigar antes de diagnosticar

A prioridade durante um incidente ativo é **parar o sangramento**, não entender a causa raiz completa
— `observabilidade/15` já estabelece essa disciplina. Um rollback que resolve o sintoma imediatamente
é preferível a investigar a causa raiz enquanto o sistema continua no ar quebrado; a investigação
completa acontece depois, no *post-mortem*, com menos pressão de tempo.

## *Post-mortem* sem culpa como processo

Um *post-mortem* de qualidade (`observabilidade/15` introduz a prática) tem **linha do tempo**
precisa, **fatores contribuintes** (nunca uma única "causa raiz" simplista — incidentes complexos
quase sempre têm múltiplos fatores que se combinaram), e **ações** com dono, prazo e **critério de
verificação** — uma ação que não é checável depois não é uma ação real, é uma intenção. O
**acompanhamento** importa tanto quanto o documento: medir a taxa de ações concluídas no prazo e a
idade das pendentes revela se *post-mortems* viram ritual sem consequência.

## Linguagem de culpa

Frases como "falha humana", "descuido" ou atribuir a causa a uma pessoa nomeada são sinalizadas (não
proibidas automaticamente — o sinal é um alerta para revisão humana, porque às vezes a frase aparece
em contexto legítimo). O princípio por trás da sinalização: sistemas que permitem que um erro humano
individual cause um incidente grave têm uma falha de **design**, não só um erro de execução — e
focar na pessoa impede ver essa falha estrutural.

## Política de orçamento de erro

Um orçamento de erro (`observabilidade/12`) negociado previamente com o produto define, de forma
objetiva, quando a prioridade muda de "lançar funcionalidades novas" para "estabilizar" — por
exemplo, "congelar lançamentos não críticos quando o orçamento de erro do trimestre cai abaixo de
20%". Ter essa política acordada **antes** de um trimestre ruim evita a negociação ad-hoc sob
pressão, que tende a favorecer sempre o lançamento sobre a estabilidade.

## Saúde do plantão

Carga de plantão desigual (uma pessoa acionada desproporcionalmente mais vezes que as outras) é um
risco de saúde ocupacional e de retenção, não só um detalhe operacional. Medir a distribuição
(formalmente, com um índice como **Gini**) revela desigualdade que a percepção subjetiva às vezes
não captura — "todo mundo reclama igual" não significa "a carga é distribuída igual". Rodízio e
compensação por plantão (quando a política da instituição prevê — **conferir**) são as alavancas
principais de sustentabilidade.

## Revisão operacional periódica e prontidão de produção

Além da resposta a incidentes individuais, uma revisão operacional periódica (olhar tendências de
SLO, incidentes recorrentes, carga de plantão ao longo do tempo) captura problemas que nenhum
*post-mortem* isolado revela. E um checklist de **prontidão de produção** antes de um lançamento
importante (SLO definido, *runbook* escrito, alarme configurado, plano de rollback testado) é
prevenção mais barata do que resposta a incidente depois.

## Evitar o herói

Um sistema que depende de uma pessoa específica "salvar o dia" repetidamente não é resiliente — é
frágil com um ponto único de falha humana. O papel do líder técnico em operação inclui,
deliberadamente, tornar o "herói" desnecessário: *runbooks* que qualquer pessoa de plantão consiga
seguir, automação do que é repetitivo, e desencorajar ativamente a cultura que recompensa o herói
individual em vez do sistema robusto.

## O incidente que não é seu para comandar

Às vezes o papel certo do líder técnico mais sênior presente não é assumir o comando — é dar suporte
a quem está comandando (mesmo sendo menos sênior) e garantir que a pessoa certa, com mais contexto
técnico específico daquele sistema, está envolvida. Assumir o comando automaticamente por
hierarquia, quando outra pessoa está mais bem posicionada para coordenar aquele incidente específico,
é um erro comum.

*Evidência.* [P] comando de incidente e *post-mortem* sem culpa vêm de prática consolidada da
disciplina de SRE (Google e equivalentes). [E] equidade e qualidade de sono em plantão têm
associação com saúde ocupacional documentada em pesquisa (**conferir** os estudos específicos e sua
aplicabilidade ao seu contexto). [O] a cadência exata de comunicação e os critérios de severidade
dependem da organização e da criticidade do sistema.

## Exemplo numa fintech

São 02:10, o Pix está fora, e você é a pessoa mais sênior no canal de incidente. Em vez de assumir
tudo, você confirma quem está de plantão (a pessoa que conhece melhor o sistema afetado) como
comandante, se oferece como apoio técnico, e garante que alguém assume comunicação com o negócio —
três papéis, três pessoas, nenhuma tentando fazer tudo sozinha às 02:10.

## Hands-on

**Tutorial.** Rode `lint postmortem` e `modelos/plantao` do `fin-leadkit` sobre 12 meses de
incidentes e escalas sintéticas do Time Pix.

**Desafio.** Conduza o incidente simulado (dados sintéticos do Pix fora do ar) e escreva o
*post-mortem* com ações verificáveis.

**Invariantes testáveis**

1. `lint postmortem` reprova um documento **sem linha do tempo, sem fatores contribuintes, sem
   impacto descrito, ou com qualquer ação sem dono, prazo ou critério de verificação**.
2. O léxico de linguagem de culpa ("falha humana", "descuido", nome próprio como causa) é
   **sinalizado** (não bloqueado) por um lexicão configurável — e a documentação do `fin-leadkit`
   explica por que é só um alerta, não uma reprovação automática.
3. MTTD, MTTR e a **taxa de ações concluídas no prazo** calculados sobre o histórico sintético
   reproduzem o gabarito, dentro da tolerância declarada.
4. O **índice de Gini** da carga de plantão sobre a escala sintética reproduz o valor esperado, e
   uma escala simulada mais equitativa **reduz** esse índice — propriedade verificável comparando
   duas escalas sobre o mesmo histórico.
5. A função de política de orçamento de erro devolve **"congelar lançamentos não críticos"** quando
   o consumo do orçamento excede o limite configurado, para uma tabela de casos de teste.
6. A **linha do tempo** do incidente simulado é cronologicamente ordenada e sem lacunas maiores que
   N minutos sem justificativa registrada — lacuna não justificada é sinalizada.

**Complemento.** Escreva, em uma página, o protocolo de comando de incidente que você seguiria hoje
no seu contexto real.

**Checagem**

1. Por que separar os papéis de comandante, comunicação e escriba evita que a mesma pessoa degrade
   coordenação e diagnóstico ao tentar fazer as duas coisas ao mesmo tempo?
2. Por que mitigar antes de diagnosticar é a prioridade correta durante um incidente ativo?
3. Por que a linguagem de culpa é sinalizada, mas não bloqueada automaticamente, segundo este marco?
4. Por que uma escala de plantão "sentida como igual" pela equipe pode, ainda assim, ter
   desigualdade real revelada pelo índice de Gini?

> **Pontes — `observabilidade/15`; `observabilidade/13`; `observabilidade/12`.**
> O *post-mortem* sem culpa de `observabilidade/15` é a prática que este marco estende com o papel
> específico de **quem lidera** o incidente, não só de como escrever o documento depois. A condução
> de incidente até a causa de `observabilidade/13` é onde os papéis de comandante e escriba deste
> marco se aplicam na prática. E o orçamento de erro de `observabilidade/12` é o dado de entrada
> direto da política de congelamento de lançamentos discutida aqui.

## Principais aprendizados

- Separar comandante, comunicação, escriba e especialistas evita que uma pessoa só degrade
  coordenação e diagnóstico ao mesmo tempo.
- Mitigar antes de diagnosticar é a prioridade certa durante um incidente ativo.
- Um *post-mortem* de qualidade tem linha do tempo, fatores contribuintes (plural) e ações
  verificáveis com dono, prazo e critério.
- Linguagem de culpa é sinalizada, não proibida — o sinal existe para revisão humana, não decisão
  automática.
- Carga de plantão desigual é risco de saúde e retenção; medir formalmente revela desigualdade que
  a percepção subjetiva às vezes esconde.
