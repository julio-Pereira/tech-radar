---
id: explicabilidade-e-decisao-automatizada
title: "Explicabilidade, justiça e decisão automatizada"
summary: "Quando uma decisão automatizada afeta o cliente, é preciso poder explicar, revisar e medir a disparidade — e provar que se fez."
estimatedMinutes: 60
completion: quiz
references:
  - title: "Lei Geral de Proteção de Dados (Lei nº 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
---

## Decisão automatizada e direito de revisão (conferir o texto vigente)

A LGPD trata do direito do titular a solicitar revisão de decisões tomadas unicamente de forma automatizada
que afetem seus interesses — o texto exato, o alcance e as exceções devem ser conferidos na fonte vigente,
nunca assumidos a partir deste marco. O que esta trilha garante tecnicamente, independente do texto exato
da norma: toda decisão de oferta pode ser **reexecutada** com as entradas e a versão do modelo **históricas**,
para que uma revisão tenha algo concreto para revisar.

## *Reason codes*, e por que eles precisam ser estáveis

Um ***reason code*** é uma explicação estruturada de por que uma decisão específica foi tomada — "renda
estável nos últimos 6 meses" e "sem oferta do mesmo produto nos últimos 90 dias", por exemplo. Modelos
simples ou monótonos tornam essa explicação direta; para modelos mais complexos, técnicas de importância
local (o que pesou mais nesta decisão específica) ou global (o que pesa mais em geral) entram em nível
conceitual, sem a trilha ensinar a matemática por trás. O que importa operacionalmente: a explicação
precisa ser **estável** — a mesma decisão, reexecutada, produz os mesmos *reason codes*, não uma
justificativa diferente a cada vez que alguém pergunta.

## Revisão humana, e a trilha de auditoria

Quando uma revisão é solicitada, ela precisa reexecutar a decisão original (entradas e versão históricas)
e permitir que uma pessoa avalie o resultado — não simplesmente rodar o modelo atual sobre os dados atuais,
que produziria uma resposta diferente da decisão original e não responderia à pergunta que foi feita.

## Atributos proibidos e *proxies*

Atributos protegidos (os critérios que a trilha trata como sensíveis, conferir política de compliance)
nunca entram como feature — isso é verificado automaticamente no CI do registro de features (marco 03). Mas
não basta remover o atributo direto: um ***proxy*** (uma feature que não é o atributo protegido, mas
**correlaciona fortemente** com ele — CEP correlacionando com raça ou classe social, por exemplo) pode
reintroduzir o mesmo problema por um caminho indireto. Detectar proxy exige medir correlação ou informação
mútua entre cada feature candidata e o atributo protegido, **antes** de aceitar a feature no registro.

## Métricas de disparidade, e seus limites

**Razão de impacto** (a taxa de resultado favorável de um grupo dividida pela de outro) e **diferença de
oportunidade** (a diferença na taxa de acerto entre grupos) são duas formas comuns de medir disparidade —
cada uma captura um aspecto diferente de "justiça", e nenhuma é a métrica definitiva. Auditar disparidade
exige ter, em ambiente controlado, o grupo sintético correspondente ao atributo protegido **sem usá-lo como
feature** — o grupo existe só para medir o resultado, nunca para alimentar a decisão.

## Adequação da oferta, e o ponto sensível do crédito

Regras de defesa do consumidor (conferir) tocam a **adequação** da oferta ao perfil do cliente — mostrar
uma oferta tecnicamente elegível mas inadequada ao perfil pode violar princípios de proteção ao consumidor
mesmo sem violar nenhuma regra de elegibilidade formal. A **oferta de crédito** é o ponto mais sensível
desta trilha: o modelo decide *se oferece* o produto de crédito, não *o limite ou a taxa* — essa segunda
decisão é do motor de risco, fora de escopo (decisão 1 do plano desta trilha), mas a linha entre as duas
precisa ficar clara em qualquer implementação real.

## Exemplo numa fintech

Um cliente entra em contato perguntando por que não recebeu a oferta de aumento de limite. O time precisa
reproduzir a decisão de três meses atrás — não rodar o modelo atual, que já pode ter sido retreinado e
responder diferente — e apresentar os *reason codes* daquela decisão específica, com a versão do modelo e
das features usadas naquele momento.

## Hands-on

**Tutorial.** Implemente *reason codes* reproduzíveis para cada decisão do serviço de ofertas.

**Desafio.** Audite disparidade sobre grupos sintéticos e detecte um *proxy* plantado no conjunto de
features.

**Invariantes testáveis**

1. Toda oferta mostrada ou negada tem *reason codes* **reproduzíveis** — o *replay* da mesma decisão
   produz os mesmos códigos.
2. A lista de **features proibidas** é verificada no CI do registro; nenhuma feature do modelo em produção
   está nessa lista.
3. Um ***proxy*** plantado deliberadamente (uma feature com correlação alta ao atributo protegido
   sintético) é **detectado** pelo teste de correlação; as features limpas passam sem alarme falso.
4. A métrica de disparidade é calculada automaticamente no pipeline de avaliação, e um **modelo enviesado
   plantado reprova o gate** de promoção.
5. Um pedido de revisão **reexecuta** a decisão com as entradas e a versão **históricas** do modelo e das
   features — não com o estado atual.

**Complemento.** Estime o custo operacional de uma revisão manual por decisão, extrapolado para o volume
esperado de pedidos de revisão.

**Checagem**

1. O que esta trilha garante tecnicamente para apoiar o direito de revisão, independente do texto exato da
   norma?
2. Por que remover o atributo protegido direto da lista de features não basta para evitar discriminação?
3. O que distingue razão de impacto de diferença de oportunidade como métricas de disparidade?
4. Por que um grupo sintético correspondente ao atributo protegido é usado só em auditoria, nunca como
   feature?
5. Qual é a linha entre o que esta trilha decide (oferecer o produto de crédito) e o que fica fora de
   escopo (limite e taxa)?
6. Por que uma revisão precisa reexecutar a decisão com dados históricos, e não rodar o modelo atual sobre
   os dados atuais?

> **Reencontro — `engenharia-de-dados/10` (trilha planejada); `seguranca-aplicacao/08`, `/14`;
> `observabilidade/17`.** A revisão de decisão automatizada aplica a mesma disciplina de dado como
> primeira classe de `engenharia-de-dados/10`, aqui para decisão em vez de dado bruto. A detecção de
> *proxy* e o controle de acesso ao atributo protegido reusam autorização de `seguranca-aplicacao/08`, e o
> ponto sensível de oferta de crédito dialoga com fraude e abuso de `/14`. E a trilha de auditoria completa
> do *reason code* usa a mesma disciplina de telemetria com PII controlada de `observabilidade/17`.

## Principais aprendizados

- Toda afirmação sobre decisão automatizada e LGPD precisa ser conferida no texto vigente; o que a trilha
  garante tecnicamente é a reexecução da decisão com dados históricos, independente do texto exato.
- *Reason codes* precisam ser estáveis: a mesma decisão reexecutada produz a mesma explicação, sempre.
- Remover o atributo protegido como feature não basta — um *proxy* correlacionado pode reintroduzir o
  mesmo problema por um caminho indireto, e precisa ser detectado antes de entrar no registro.
- Razão de impacto e diferença de oportunidade medem aspectos diferentes de disparidade; nenhuma é
  definitiva, e um modelo enviesado detectado reprova o gate de promoção.
- O modelo decide se oferece o produto de crédito; limite e taxa são decisão de um motor de risco separado,
  fora do escopo desta trilha — a linha entre as duas precisa ficar clara.
