---
id: disponibilidade-regiao-e-celulas
title: "Disponibilidade, multi-região e células"
summary: "Disponibilidade é uma conta — dependências em série multiplicam — e multi-região é decisão de custo × RPO × regulação, não de moda. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "Google SRE Book"
    url: https://sre.google/sre-book/table-of-contents/
  - title: "AWS Builders' Library"
    url: https://aws.amazon.com/builders-library/
completion: quiz
---

## Nove(s), e a aritmética que ninguém faz de cabeça

99,9% de disponibilidade é ~8,7 horas de indisponibilidade por ano; 99,95% é ~4,4 horas; 99,99% é
~52 minutos; 99,999% é ~5 minutos. Cada "nove" a mais custa desproporcionalmente mais engenharia e
operação — a diferença entre 99,9% e 99,99% não é "um pouco melhor", é uma ordem de grandeza de
disciplina operacional a mais.

## Composição em série multiplica, e a hipótese de independência quase nunca vale

Se um fluxo depende de **seis** serviços em série, cada um a 99,95%, a disponibilidade composta
**ingênua** é `0,9995^6 ≈ 99,7%` — pior que qualquer componente individual, porque basta **um**
falhar para o fluxo inteiro falhar. Essa é a aritmética que explica por que "cada serviço individual
está em 99,95%" não significa "o produto está em 99,95%".

A aritmética assume **independência** entre as falhas — e essa suposição quase nunca vale de
verdade: uma falha de rede regional, uma dependência comum (o mesmo banco, a mesma fila), um
problema de configuração propagado por deploy automatizado afetam vários componentes
**juntos**, correlacionados, não independentemente. Tratar dependências correlacionadas como se
fossem independentes faz a conta parecer mais otimista do que a realidade — o primeiro ajuste que
um cálculo honesto de disponibilidade composta precisa fazer é identificar **onde a independência
não vale** e tratar esses grupos como uma unidade de falha só.

Componentes **em paralelo** (redundância de verdade, sem dependência compartilhada) somam
disponibilidade em vez de multiplicar prejuízo: dois componentes independentes a 99% em paralelo,
com failover funcional, chegam perto de `1 - (0,01 × 0,01) = 99,99%` — a matemática inversa da
série, e a razão pela qual redundância genuína (não aparente) é a ferramenta mais poderosa de
disponibilidade.

## Orçamento de erro como contrapeso

Se o SLO é 99,9%, o **orçamento de erro** é os ~8,7 horas/ano que o sistema pode "gastar" em
indisponibilidade sem violar o compromisso — e esse orçamento é uma ferramenta de **decisão**, não
só de medição: gastar o orçamento todo logo no início do trimestre com deploys arriscados é uma
escolha legítima **se** o time aceita operar o resto do período sem margem nenhuma para mais
nenhuma falha.

## RPO/RTO como requisito, ativo-passivo × ativo-ativo

**RPO** (quanto dado você aceita perder) e **RTO** (quanto tempo você aceita ficar fora) são
requisitos de negócio, não números técnicos escolhidos pela engenharia isoladamente
(`dados-distribuidos/12` já ensinou isso para backup; aqui a mesma régua se aplica à região
inteira). **Ativo-passivo**: uma região serve tráfego, a outra fica pronta para assumir —
RTO maior (o failover leva tempo), RPO depende de quão síncrona é a replicação entre elas.
**Ativo-ativo**: as duas regiões servem tráfego simultaneamente — RTO quase zero (a outra região já
está servindo), e a complexidade se move para resolver conflito de escrita concorrente entre
regiões. **Warm standby** e ***pilot light*** são meios-termos: infraestrutura já provisionada mas
não servindo tráfego, ligada sob demanda — RTO intermediário, custo intermediário.

## Arquitetura celular e raio de explosão

Uma **célula** é uma réplica completa e independente da pilha, servindo um subconjunto de tenants —
se uma célula falha, só os tenants dela são afetados, nunca a base inteira. **Raio de explosão**
(*blast radius*) é literalmente esse subconjunto: dividir em `N` células do mesmo tamanho limita
qualquer falha a, no máximo, `1/N` dos tenants. **Shuffle sharding** mistura a atribuição de
tenants a células de um jeito que minimiza a chance de dois tenants específicos compartilharem
exatamente o mesmo conjunto de células — reduzindo a correlação de impacto entre clientes que, à
primeira vista, não têm relação nenhuma entre si.

## Estabilidade estática: o plano de controle não pode ser dependência de disponibilidade

**Plano de controle** (o que decide configuração, rotas, scaling) e **plano de dados** (o que de
fato serve tráfego) precisam ser desacoplados na hora da falha: se o plano de controle cai, o plano
de dados deveria continuar servindo tráfego com a **última configuração conhecida boa**, não parar
porque não consegue consultar algo que decide "o que fazer agora". Um sistema que depende do plano
de controle estar no ar para o plano de dados funcionar introduziu uma dependência de
disponibilidade desnecessária no componente errado.

> **Reencontro — `dados-distribuidos/12`; `kubernetes/13`; `observabilidade/12`.** RPO/RTO como
> número medido e o ensaio cronometrado de restore são daquele marco — aqui eles sobem de escopo
> de "um backup" para "uma região inteira". GitOps e DR (`kubernetes/13`) implementam o plano de
> controle resiliente que este marco exige. SLO e orçamento de erro são o vocabulário de
> `observabilidade/12`, aqui aplicado à disponibilidade composta de um fluxo completo.

## Exemplo numa fintech

O caminho do Pix atravessa seis dependências em série, cada uma a 99,95%: a conta ingênua dá
99,7% — pior que qualquer dependência isolada. Investigar revela que duas delas compartilham o
mesmo cluster de banco: não são independentes, são uma unidade de falha só disfarçada de duas. A
disponibilidade real, recalculada com essa correção, é ainda mais baixa que a conta ingênua sugeria
— o tipo de surpresa que só aparece quando alguém faz a conta de verdade em vez de presumir.

## Hands-on

**Tutorial.** Calculadora de disponibilidade composta (série, paralelo, e grupos correlacionados
declarados manualmente) e uma simulação de Monte Carlo do mesmo cenário.

**Desafio.** Roteamento de tenants por célula via hash consistente (marco 04), e simulação de
perda de uma célula.

**Invariantes testáveis**

1. A disponibilidade estimada pela simulação de Monte Carlo fica a no máximo 0,1 ponto percentual
   da fórmula fechada, para o mesmo cenário.
2. Matar 1 de N células afeta, no máximo, `1/N + ε` dos tenants simulados.
3. O mapa tenant→célula é estável entre execuções (o mesmo tenant cai na mesma célula, dado o
   mesmo conjunto de células).
4. Adicionar uma dependência **em série** ao fluxo nunca aumenta a disponibilidade composta
   calculada — propriedade verificada por teste, não só assumida.

**Complemento.** Reutilize (ou declare como premissa, se não tiver feito aquela trilha) o RPO/RTO
medido num ensaio de restore, e calcule o custo de dobrar esse RPO: o que muda em replicação e em
infraestrutura para cortar pela metade o dado que se aceita perder.

**Checagem**

1. Por que a disponibilidade composta de seis serviços em série a 99,95% cada não é 99,95%?
2. O que a hipótese de independência assume, e por que ela quase nunca vale entre dependências
   reais?
3. O que raio de explosão mede, e como *shuffle sharding* reduz correlação de impacto entre
   tenants?
4. Por que o plano de controle não pode ser uma dependência de disponibilidade do plano de dados?

## Principais aprendizados

- Disponibilidade composta de dependências em série é sempre pior que a pior dependência
  individual — e a hipótese de independência entre elas quase nunca vale de verdade.
- Orçamento de erro é ferramenta de decisão, não só de medição: gastar tudo cedo é escolha
  legítima se o time aceita operar sem margem pelo resto do período.
- RPO e RTO são requisito de negócio em qualquer escopo — de um backup a uma região inteira — e
  ativo-ativo troca RTO baixo por complexidade de conflito de escrita concorrente.
- Arquitetura celular limita o raio de explosão a `1/N` dos tenants; *shuffle sharding* reduz a
  chance de dois tenants específicos compartilharem o mesmo conjunto de células.
- O plano de controle precisa ser desacoplado do plano de dados na hora da falha — servir tráfego
  com a última configuração boa conhecida, nunca travar por dependência cruzada desnecessária.
