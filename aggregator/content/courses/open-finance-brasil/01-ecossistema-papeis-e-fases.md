---
id: ecossistema-open-finance-papeis-e-fases
title: "Ecossistema, papéis e fases"
summary: "Antes de escrever uma linha, é preciso saber quem é quem — porque a maioria dos bugs de integração é um participante assumindo um papel que não tem."
estimatedMinutes: 50
references:
  - title: "Open Finance Brasil — Portal institucional"
    url: https://openfinancebrasil.org.br/
  - title: "Banco Central do Brasil — Open Finance"
    url: https://www.bcb.gov.br/estabilidadefinanceira/openfinance
---

## Os papéis do ecossistema

Quatro papéis organizam quem faz o quê: a **transmissora de dados** compartilha dados do cliente
sob consentimento; a **receptora de dados** consome esses dados em nome do cliente; a **detentora
de conta** mantém a conta e os fundos; a **iniciadora de transação de pagamento** (ITP) inicia um
pagamento em nome do cliente a partir de outra instituição. Uma mesma instituição pode acumular
vários papéis ao mesmo tempo (um banco é tipicamente transmissora e detentora simultaneamente), mas
cada chamada específica é feita **num** papel — e validar que o chamador realmente tem o papel que
está exercendo é a base de tudo que vem depois. **TPP** (*third-party provider*) é o termo
genérico para a instituição do lado de fora, não dono dos dados ou da conta em questão.

```diagrama
of-ecossistema
```

## Fases do ecossistema

O ecossistema foi (e continua sendo) implantado em **fases** — dados cadastrais e transacionais
primeiro, iniciação de pagamento depois, outros produtos financeiros em seguida (**conferir** a
organização e o calendário exatos vigentes, que evoluem com o tempo). Cada fase expande o conjunto
de APIs disponíveis e, frequentemente, os requisitos de segurança e desempenho associados — tratar
"o ecossistema" como uma coisa estática, sem fases, é um erro de modelagem que se manifesta como
"essa API não deveria existir ainda" ou o oposto.

## Governança e hierarquia de normas

Por trás das especificações técnicas existe uma **estrutura de governança** (o regulador que
estabelece a obrigação, uma estrutura que organiza a implementação técnica, e os padrões técnicos
propriamente ditos) — este marco não reproduz o texto de nenhuma norma, mas é importante saber que
essa hierarquia existe: uma dúvida sobre "o que a especificação técnica permite" às vezes só se
resolve subindo um nível, até a norma regulatória que a especificação implementa.

## A jornada ponta a ponta

A sequência completa de um fluxo de Open Finance — **descoberta** (o TPP encontra a detentora no
diretório) → **registro** (DCR, marco 02) → **consentimento** (o cliente autoriza, marco 04) →
**autorização** (o fluxo OAuth2/FAPI, marco 03) → **chamada** (a API de dados ou pagamento, marcos
05 e 07) → **revogação** (o cliente retira o consentimento, marco 04) — é o mapa que todo o resto
desta trilha preenche, marco a marco, com implementação real.

## O modelo de confiança: o diretório como autoridade

A pergunta central de segurança neste ecossistema não é "o que a requisição afirma sobre quem é o
chamador" — é "o que o **diretório de participantes** confirma". O diretório é a autoridade central
que certifica que uma organização é, de fato, um participante válido, com um papel válido, num
estado válido (não suspenso, não revogado). Qualquer decisão de confiança que não consulte o
diretório, direta ou indiretamente (via certificado emitido pela cadeia do ecossistema), está
confiando na palavra do próprio chamador — exatamente o que este modelo existe para evitar.

## Obrigações que viram requisito técnico

Disponibilidade mínima, desempenho máximo, prazo de propagação de uma revogação de consentimento —
tudo isso são obrigações regulatórias que, na prática de engenharia, viram **requisitos técnicos
testáveis** (**conferir** os valores exatos vigentes, que mudam por versão). A tradução de
"obrigação regulatória" para "teste automatizado que falha quando violado" é o fio condutor de
toda esta trilha, começando aqui e se tornando explícito no marco 09.

## O ecossistema como produto regulado

Diferente de um produto onde você escolhe a API que consome ou constrói, aqui o **contrato não é
seu**: ele é definido pelo ecossistema regulado, publicado como especificação, e sua única
liberdade de engenharia está em como você o implementa internamente — nunca em alterar o que ele
exige externamente. Essa inversão (o contrato vem de fora, imutável do seu ponto de vista) é o que
torna a camada anticorrupção do marco 05 uma necessidade estrutural, não uma escolha de estilo.

## `spec-versions.yaml`: o contrato com a realidade

Como toda regra, prazo, nome de campo e versão de especificação citados nesta trilha mudam com o
tempo, este marco introduz o arquivo `spec-versions.yaml`: um registro versionado de **qual**
versão de cada especificação está em uso, com a data em que foi lida. Qualquer afirmação
"conferir" ao longo da trilha remete, em última instância, a esse arquivo — não à memória de quem
escreveu o conteúdo.

## Exemplo numa fintech

Uma fintech quer mostrar o saldo do cliente dentro do seu próprio aplicativo: ela é uma
**receptora** de dados; o banco onde o cliente mantém a conta é a **transmissora** e **detentora**.
Nenhum dos dois se conhecia antes — eles só confiam um no outro porque ambos aparecem, com os
papéis corretos, no mesmo diretório de participantes.

## Hands-on

**Tutorial.** Crie `spec-versions.yaml` e o mapa de papéis como dado estruturado (quem pode exercer
qual papel, em qual fase).

**Desafio.** Gere, a partir do mapa, a matriz "quem pode chamar o quê" como uma tabela testável.

**Invariantes testáveis**

1. Uma chamada feita por um participante **sem** a capacidade do papel exigido (por exemplo, uma
   receptora pura chamando uma API de iniciação de pagamento) é **recusada** — verificado contra
   uma tabela de casos que cobre todas as combinações relevantes de papel × operação.
2. O mapa de papéis é a **única fonte** usada tanto para gerar a matriz de testes quanto para o
   roteamento real — uma varredura automática confirma que nenhuma lista equivalente está
   duplicada em outro lugar do código.
3. Mudar a versão registrada em `spec-versions.yaml` **sem** atualizar o mapa de papéis
   correspondente **quebra** um teste de consistência dedicado — a desatualização nunca passa
   silenciosamente.
4. O mapa de papéis é **serializável e idempotente**: serializar, desserializar e serializar de
   novo produz exatamente a mesma representação (propriedade de *round-trip*).

**Complemento.** Desenhe, por escrito, a jornada de um cliente cujo próprio banco atua, ao mesmo
tempo, como transmissor de dados dele mesmo **e** como iniciador de pagamentos em nome dele para
outra instituição.

**Checagem**

1. Por que uma mesma instituição pode acumular vários papéis, mas uma chamada específica precisa
   ser validada contra **um** papel exercido naquele momento?
2. Por que o diretório de participantes, e não o que a requisição afirma, é a base da decisão de
   confiança neste ecossistema?
3. O que significa, na prática, dizer que o ecossistema é implantado em fases — e por que isso
   importa para o desenho de uma integração?
4. Por que `spec-versions.yaml` existe como um arquivo versionado, em vez de os valores regulatórios
   serem simplesmente escritos direto no código?

> **Reencontro — `system-design/10`.** O caso de consentimento daquele marco já desenhou o
> problema de cache e validade de consentimento em nível de sistema; esta trilha constrói, a
> partir do marco 04, a implementação real por trás desse desenho.

A modelagem de ameaça de `seguranca-aplicacao/01` é o ponto de partida para pensar, estruturalmente,
por que um participante que assume um papel que não tem é uma ameaça real, não só um bug de
validação; e o contrato de API como superfície estável de `system-design/05` é exatamente o tipo de
contrato que este ecossistema impõe de fora para dentro. O mapeamento de capacidades de
`arquitetura-de-solucoes/01` é a mesma disciplina de "o que este sistema realmente oferece",
aplicada aqui aos papéis do ecossistema em vez de a sistemas internos.

## Principais aprendizados

- Os quatro papéis (transmissora, receptora, detentora, iniciadora) definem quem pode fazer o
  quê — e uma instituição pode acumular vários papéis, mas cada chamada exerce um só.
- O ecossistema evolui em fases, expandindo APIs e requisitos disponíveis — não é uma coisa
  estática.
- A confiança vem do diretório de participantes, nunca do que a própria requisição afirma sobre
  quem a enviou.
- Obrigações regulatórias (disponibilidade, desempenho, prazo de propagação) viram requisitos
  técnicos testáveis — o fio condutor de toda a trilha.
- O contrato deste ecossistema vem de fora e é imutável do seu ponto de vista — a liberdade de
  engenharia está só em como implementá-lo internamente.
