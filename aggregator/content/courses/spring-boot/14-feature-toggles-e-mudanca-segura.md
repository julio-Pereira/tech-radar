---
id: feature-toggles-e-mudanca-segura
title: "Feature toggles e mudança segura"
summary: "Toggle separa deploy de release; sem dono, prazo e teste das duas variantes, vira dívida e incidente. OpenFeature no Spring com provider local, avaliação no ponto certo, kill switch sem deploy, rollout por hash estável medido em 100 mil clientes, a flag vencida que reprova o build e a auditoria de cada mudança."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, plataforma]
references:
  - title: "OpenFeature — Introduction"
    url: https://openfeature.dev/docs/reference/intro/
  - title: "OpenFeature Java SDK"
    url: https://openfeature.dev/docs/reference/sdks/server/java/
  - title: "OpenFeature — Evaluation Context"
    url: https://openfeature.dev/docs/reference/concepts/evaluation-context/
  - title: "flagd (open-feature/flagd)"
    url: https://github.com/open-feature/flagd
---

## Deploy não é release

Um *deploy* põe código novo em produção. Um *release* expõe o comportamento novo a quem usa. O
*feature toggle* separa os dois: o código do cálculo novo de tarifa vai para produção desligado, e é
ligado depois, para 1% dos clientes, depois para 5%, e desligado em segundos se a conciliação
divergir. Os **tipos de flag** (de *release*, operacional, de experimento, de permissão), o ciclo de
vida e a **dívida de flag** estão em `system-design/14`; o uso da flag na esteira, em
`entrega-continua-e-devops/03` e `/07`. Aqui o assunto é implementar e operar uma flag num serviço
Spring.

## OpenFeature: uma API neutra

O **OpenFeature** é uma especificação aberta, com SDK para Java (o 1.23.0 é a versão estável, sob
Apache 2.0), que separa o código que **avalia** uma flag do sistema que a **guarda**:

- o **cliente** (`OpenFeatureAPI.getInstance().getClient()`) é o que o código chama:
  `getBooleanValue("tarifa-nova-kill-switch", true, contexto)`;
- o ***provider*** é o adaptador para o sistema de flags. Trocar de fornecedor é trocar o *provider*,
  sem mudar o código de negócio;
- o ***evaluation context*** carrega o que a regra precisa saber: o `targetingKey` (o cliente), o
  segmento, o canal;
- os ***hooks*** rodam antes e depois de cada avaliação, e são o lugar da métrica e do *log* de qual
  variante cada requisição recebeu.

Sem SaaS pago, há duas opções de *provider* local. O **`InMemoryProvider`**, do próprio SDK, guarda
as flags num mapa e é o que os testes usam. O **flagd** é um serviço pequeno de código aberto (Apache 2.0),
que lê as flags de arquivo, HTTP ou Kubernetes e as serve, por HTTP ou gRPC, ao *provider* `flagd`
(`dev.openfeature.contrib.providers:flagd`, 0.15.0). A escolha entre os dois para produção é uma
ADR.

## Avaliar no ponto certo

Uma flag avaliada duas vezes na mesma requisição pode dar respostas diferentes, se alguém a mudar no
meio. Num cálculo financeiro, isso é uma tarifa calculada com metade de cada regra. A regra é:

- **avaliar uma vez por requisição**, na borda, e passar a decisão (o `Calculo` escolhido) para
  baixo;
- **nunca no meio de uma transação**: a decisão é tomada antes do `@Transactional` e não muda
  dentro dele;
- **o valor padrão é o caminho seguro**: se o *provider* cair, `getBooleanValue(..., padrão, ...)`
  devolve o padrão, e o padrão é o cálculo antigo.

## *Kill switch* e *rollout* por porcentagem

O ***kill switch*** é uma flag operacional que desliga o caminho novo sem *deploy* e sem reinício.
No `InMemoryProvider`, `updateFlags` troca o valor, e a próxima avaliação já vê o novo: a próxima
requisição usa o cálculo antigo.

O ***percentage rollout*** liga o caminho novo para P% dos clientes. A forma errada é sortear a cada
requisição (`random() < P`), porque o mesmo cliente "pisca" entre as duas tarifas. A certa é um
**hash estável**: o `SHA-256` de `flag + ":" + clienteId`, reduzido a um balde de 0 a 9.999, e o
cliente está no *rollout* se o balde for menor que P × 100. O mesmo cliente cai sempre no mesmo
balde, em qualquer réplica, e subir de 5% para 10% só acrescenta clientes, sem tirar ninguém. Pôr o
nome da flag no *hash* evita que os mesmos 5% de clientes sejam cobaias de todas as flags.

Medido em 100 mil clientes sintéticos: com 5%, a fração observada foi 4,98%; com 25%, 24,80%; com
50%, 49,68%. Os três ficaram dentro de ±1 ponto percentual.

## Dono, prazo e as duas variantes

Uma flag sem dono e sem data é dívida desde o dia em que nasce. O registro das flags do serviço é
código: cada uma com o **dono** (o time) e a **data de expiração**. Um teste lê o registro e reprova o
*build* quando uma flag vence, com o nome do dono na mensagem. Assim, a remoção vira trabalho
planejado, e não arqueologia.

Enquanto a flag existe, há **dois caminhos de código**, e os dois precisam passar na mesma suíte de
contrato: um teste parametrizado roda os mesmos casos contra o cálculo antigo e o novo. O caminho que
não está ligado hoje é o que vai ser ligado às três da manhã num incidente.

Para uma **migração** de cálculo, a flag pode rodar os dois em paralelo e comparar os resultados
antes de trocar (`system-design/14`). Para uma **migração de schema**, a flag acompanha o
*expand/contract* de `dados-distribuidos/11`.

## Auditoria de mudança

Ligar uma flag em produção é uma mudança em produção, e num ambiente regulado precisa de registro:
quem, quando, o quê (`entrega-continua-e-devops/09`). O lado do sistema de flags é o registro
principal (o *commit* no repositório do flagd, o log do console). No serviço, o SDK do OpenFeature
emite um evento a cada mudança de configuração: `onProviderConfigurationChanged` recebe a lista de
flags alteradas. Esse evento vira um registro de auditoria local, que mostra quando cada réplica viu
a mudança.

## *Hotfix*, *rollback*, *roll-forward* ou desligar a flag

| Situação | Ação |
| --- | --- |
| o comportamento novo está atrás de uma flag e deu errado | **desligar a flag**: segundos, sem *deploy* |
| o *deploy* quebrou algo que não está atrás de flag | ***rollback*** para a versão anterior |
| a correção é pequena e o *rollback* desfaria outras mudanças necessárias | ***roll-forward***: uma versão nova com a correção |
| um defeito em produção que não pode esperar o ciclo normal | ***hotfix***: um ramo curto da versão em produção, com o mesmo pipeline |

A flag é a saída mais rápida, mas só para o que ela cobre. Desligar a flag não desfaz o que já foi
gravado: as tarifas cobradas com o cálculo novo continuam no banco, e a conciliação precisa delas.

## Exemplo numa fintech

O cálculo novo de tarifa Pix (R$ 0,50 fixo mais 0,5%, com teto) foi ligado para 5% dos clientes. Na
manhã seguinte, a conciliação divergiu em centavos para clientes com valores altos: o teto estava
sendo aplicado antes da parcela fixa. O plantão desligou o *kill switch*, e a próxima requisição de
cada cliente já usou o cálculo antigo, sem *deploy*. A correção foi o teste de contrato que faltava,
rodando contra as duas variantes, e a flag voltou a 5% dois dias depois.

## Hands-on

**Tutorial.** Ponha o OpenFeature no `pix-gateway` com o `InMemoryProvider`. Leia uma flag booleana
num *controller*, troque o valor com `updateFlags` num teste, e veja a próxima requisição mudar.

**Desafio.** O *rollout* progressivo do cálculo novo de tarifa: um *kill switch*, uma porcentagem, o
*hash* estável por cliente, o registro de flags com dono e data, e a auditoria das mudanças.

**Invariantes testáveis**

1. O mesmo cliente recebe sempre a mesma variante para a mesma porcentagem: 1.000 clientes,
   avaliados 6 vezes cada, nunca trocam de cálculo.
2. Com a porcentagem em P%, a fração observada em 100 mil clientes sintéticos fica em P ± 1 p.p., para
   P = 5, 25 e 50.
3. As duas variantes passam na suíte de contrato da tarifa, num teste parametrizado: escala de 2
   casas, valor entre zero e o teto, e tarifa monotônica no valor.
4. Desligar o *kill switch* faz a próxima requisição usar o caminho antigo, sem reinício: com 100%
   ligado, o cliente recebe o novo; depois de `updateFlags` com o *kill switch* desligado, o antigo.
5. Uma flag vencida reprova o *build* com o nome do dono. O teste roda o registro com um relógio falso
   na data de vencimento e exige a mensagem com a flag e o dono.
6. Toda mudança de valor de flag gera um registro de auditoria. Duas mudanças produzem pelo menos dois
   registros, com a flag alterada. O teste espera o evento com um prazo, e não com um `sleep` fixo,
   porque o SDK entrega os eventos noutra thread.

**Complemento.** Troque o `InMemoryProvider` pelo flagd, com as flags num arquivo, e prove o
invariante 4 mudando o arquivo com o serviço rodando.

**Checagem**

1. Por que avaliar a flag uma vez por requisição, e nunca no meio de uma transação?
2. Por que o *rollout* por porcentagem usa um *hash* estável, e não um sorteio?
3. O que um teste de flag vencida garante que uma convenção de time não garante?
4. Quando desligar a flag resolve, e quando é preciso um *rollback*?

## Principais aprendizados

- *Deploy* não é *release*: a flag separa os dois.
- OpenFeature: cliente, *provider*, contexto e *hooks*; o *provider* troca sem mudar o código.
- Avalie uma vez por requisição, antes da transação, com o caminho seguro como padrão.
- *Rollout* por *hash* estável de flag e cliente: determinístico e dentro de ±1 p.p. medido.
- Toda flag tem dono e data, e o *build* reprova a vencida.
- As duas variantes passam no mesmo contrato.
- Desligar a flag é o mais rápido, mas só cobre o que está atrás dela.
