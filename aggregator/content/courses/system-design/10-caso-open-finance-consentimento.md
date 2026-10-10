---
id: caso-open-finance-consentimento
title: "Caso: consentimento no Open Finance"
summary: "Aqui consistência é requisito de segurança: um consentimento revogado que ainda vale é incidente, não atraso. Cache de validade com limite de obsolescência declarado."
estimatedMinutes: 65
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## Por que este caso é diferente dos outros três

Nos outros casos desta seção, uma leitura atrasada é um incômodo (extrato desatualizado) ou algo
mitigável (resultado desconhecido resolvido por conciliação). Aqui, uma leitura atrasada é um
**incidente de segurança**: se um cliente revoga o consentimento que deu a um TPP para acessar seus
dados, e o sistema continua admitindo requisições daquele TPP por tempo indefinido depois da
revogação, isso é acesso não autorizado a dado financeiro — não "eventual consistência", um
problema que o regulador trata como falha de controle.

## Ciclo de vida do consentimento

Um consentimento nasce (o cliente autoriza um TPP a acessar um conjunto específico de dados, por um
período determinado), é consultado em cada requisição do TPP (leitura intensa — um TPP legítimo
consulta o mesmo consentimento centenas de vezes ao longo de sua validade), e morre por expiração
natural ou por **revogação explícita** do cliente a qualquer momento. A característica que decide o
desenho: **leitura é muito mais frequente que escrita** — isso favorece cache, mas o cache é
exatamente onde o requisito de segurança aperta.

## Cache de validade com limite de obsolescência declarado

A tentação óbvia — cachear o status do consentimento para não bater no banco em toda requisição —
só é aceitável com um **limite de obsolescência explicitamente declarado**: "o cache pode estar
atrasado em até N segundos em relação ao estado real". Esse número não é um detalhe técnico: é um
requisito de segurança com dono, que determina o pior caso de "quanto tempo depois da revogação uma
requisição ainda pode ser indevidamente aceita". Propagar a revogação via evento (invalidação ativa
do cache, não apenas TTL passivo) reduz esse pior caso — TTL sozinho garante só o limite superior,
nunca a reação imediata.

## Isolamento entre TPPs: o *noisy neighbor* regulatório

Cada TPP tem sua própria cota (marco 06), e a cota de um TPP não pode degradar a experiência dos
demais — um TPP mal comportado (bug no cliente dele, não má-fé) fazendo 10× sua cota não pode
elevar a latência percebida pelos outros TPPs que estão dentro do combinado. Isso é isolamento de
recurso compartilhado, a mesma preocupação de *noisy neighbor* em qualquer sistema multi-tenant
(marco 07), aqui com peso regulatório adicional: o Open Finance exige tratamento equitativo entre
participantes.

## Minimização de dados e auditoria

O TPP recebe **apenas** o escopo de dado que o consentimento específico autoriza — nunca o
superconjunto "já que estamos consultando mesmo". Toda leitura de dado pessoal sob consentimento
gera **registro de auditoria**: quem leu, o quê, quando, sob qual consentimento — sem esse registro,
não há como provar conformidade quando o regulador perguntar, e "provavelmente estava tudo certo"
não é resposta aceitável numa auditoria real.

## mTLS e FAPI: linkado, não reensinado

A camada de transporte (mTLS mútuo entre instituição e TPP) e o perfil de segurança de API
financeira (FAPI, que exige coisas como *request object* assinado e *pushed authorization
requests*) são mecanismo — `seguranca-aplicacao/05`, `/07` e `/08` já ensinam OAuth2/OIDC, FAPI e
autorização em profundidade. Este marco não repete isso: aqui a pergunta é onde, no fluxo de dados
entre instituições, a validade do consentimento é verificada e com qual atraso aceitável — a
camada de autenticação é pressuposta correta.

> **Reencontro — `seguranca-aplicacao/05`, `/07` e `/08`; `dados-distribuidos/09`; `kafka`.** OAuth2/
> OIDC, FAPI e autorização detalhada são daquele bloco; aqui eles são a base sobre a qual o
> consentimento é verificado. Cache com invalidação é o mesmo padrão de `dados-distribuidos/09`,
> aplicado a um dado com consequência de segurança em vez de só latência. A propagação da
> revogação por evento usa o mesmo transporte que qualquer outro evento de domínio nas trilhas de
> Kafka.

## Exemplo numa fintech

Um TPP lê o saldo de um cliente 20 vezes por segundo (uso legítimo, dashboard financeiro agregando
múltiplas instituições). O cliente revoga o consentimento às 14h00m00s. O desenho garante que,
com limite de obsolescência declarado de 2 segundos, nenhuma leitura é admitida depois de
14h00m02s — não "na próxima vez que o cache naturalmente expirar em até 5 minutos", que seria o
comportamento de um TTL passivo sem invalidação ativa.

## Hands-on

**Tutorial.** Documento de design completo no molde do marco 09, para o fluxo de consentimento.

**Desafio.** Cache de validade de consentimento com um **relógio falso** controlável no teste, e um
teste de propriedade: para qualquer intercalação aleatória de leituras e uma revogação, nenhuma
leitura é admitida depois de `t_revogação + staleness_declarada`.

**Invariantes testáveis**

1. Para centenas de intercalações aleatórias geradas no teste de propriedade, nenhuma leitura é
   admitida após o limite de obsolescência declarado em relação ao instante real da revogação.
2. Um TPP simulado a 10× sua cota não eleva o p99 de leitura dos demais TPPs simulados acima de um
   limiar declarado (medido por simulação, com os demais TPPs operando dentro da cota).
3. Toda leitura de dado sob consentimento gera um registro de auditoria — ou a requisição é negada;
   não existe terceira opção observada no teste.
4. Um TPP com consentimento para um escopo específico nunca recebe, em nenhuma resposta
   observada no teste, um campo fora desse escopo.

**Complemento.** Calcule o custo de reduzir o limite de obsolescência pela metade: quanto isso
aumenta a carga sobre o armazenamento de consentimentos, estimando pela razão de leitura/escrita
medida.

**Checagem**

1. Por que uma leitura atrasada de consentimento é tratada como incidente de segurança, e não como
   problema de latência comum?
2. O que o limite de obsolescência declarado garante, e por que TTL passivo sozinho não é
   suficiente?
3. O que isolamento entre TPPs protege, e por que ele tem peso regulatório além do técnico?
4. Por que minimização de escopo e registro de auditoria são, os dois, obrigatórios — e não um
   substituto do outro?

## Principais aprendizados

- Consistência de consentimento é requisito de segurança: uma leitura atrasada aqui é incidente,
  não um incômodo de UX — a diferença muda completamente a tolerância aceitável.
- Limite de obsolescência declarado, com invalidação ativa por evento (não só TTL passivo), é o
  que torna o pior caso de "janela de acesso indevido após revogação" um número conhecido.
- Isolamento entre TPPs (*noisy neighbor*) tem peso regulatório: o Open Finance exige tratamento
  equitativo entre participantes, não só boa prática de engenharia.
- Minimização de escopo e auditoria de toda leitura são obrigações paralelas, não substitutas uma
  da outra — uma limita o que é exposto, a outra prova o que foi acessado.
- mTLS, FAPI e OAuth2/OIDC são mecanismo pressuposto, ensinado em `seguranca-aplicacao`; este caso
  decide onde e com qual atraso a validade do consentimento é verificada sobre essa base.
