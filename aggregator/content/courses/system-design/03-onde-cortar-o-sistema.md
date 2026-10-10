---
id: onde-cortar-o-sistema
title: "Onde cortar o sistema"
summary: "Decomposição é decisão sobre acoplamento, propriedade de dado e equipe — não sobre tecnologia. Os sinais de monolito distribuído, e fitness functions para manter a fronteira."
estimatedMinutes: 60
references:
  - title: "The C4 model for visualising software architecture"
    url: https://c4model.com/
---

## Contexto delimitado como fronteira candidata

Um **contexto delimitado** (bounded context) é uma área do domínio em que um termo tem um único
significado consistente. "Conta" no `ledger-core` é uma linha contábil com saldo; "conta" no
`pix-gateway` pode ser só um identificador de roteamento. Tentar unificar os dois numa única
entidade compartilhada entre serviços é o primeiro sintoma de corte errado: dois times passam a
negociar o significado de uma palavra em vez de construir.

**Lei de Conway** não é piada de corredor: a arquitetura de um sistema tende a espelhar a estrutura
de comunicação da organização que o constrói. Um time único mantendo dois serviços que precisam
coordenar toda mudança juntos não ganhou microsserviços — ganhou um monolito com latência de rede
entre as partes.

## Acoplamento: o que de fato se mede

**Acoplamento aferente** é quantos consumidores dependem de você; **eferente**, de quantos você
depende. Um serviço com acoplamento aferente alto é caro de mudar (quebra muita gente); com
eferente alto, é frágil (depende de muita gente). **Acoplamento temporal** é precisar que outro
serviço esteja no ar *agora*, na mesma chamada — o oposto de comunicação assíncrona. **Acoplamento
de dado** é dois serviços lendo ou escrevendo a mesma tabela — o antipadrão mais caro de desfazer,
porque exige migração de dado, não só de código.

## Monolito modular × microsserviço: os critérios reais

A decisão não é sobre tamanho de time nem sobre moda. Cinco critérios, nesta ordem de peso prático:

1. **Autonomia de deploy** — este módulo precisa publicar numa cadência diferente do resto?
2. **Escala independente** — a carga deste módulo varia numa proporção muito diferente do resto?
3. **Isolamento de falha** — uma falha aqui não pode derrubar o resto?
4. **Isolamento regulatório** — este módulo tem requisito de auditoria, residência de dado ou
   certificação que o resto não tem?
5. **Tamanho de time** — existe um time dedicado, com contexto suficiente, para ser dono disso?

Se a resposta é "não" para os cinco, é módulo dentro do monolito, não serviço separado. Cortar sem
nenhum desses critérios presente é pagar o custo de rede, deploy e observabilidade distribuída por
nada.

## Sinais de monolito distribuído

O desenho mais caro de todos: parece microsserviços (vários deploys, vários repositórios, uma rede
entre as partes) mas se comporta como um monolito acoplado (um deploy depende do outro na prática,
uma mudança de schema exige coordenar três times, nenhum serviço sobrevive à queda do outro). Os
sinais: chamadas síncronas em cadeia para completar uma única operação de negócio; schemas de banco
compartilhados entre "serviços" distintos; deploys que precisam ser coordenados em ordem específica.
O custo de um monolito distribuído é pior que o de um monolito de verdade: você paga a complexidade
operacional de distribuído sem ganhar nenhuma das vantagens de isolamento.

## Fitness functions: manter a fronteira depois de desenhada

Um diagrama de arquitetura não impede ninguém de importar um pacote interno de outro módulo às
3h da manhã sob pressão de prazo. **Fitness functions** são testes executáveis que verificam uma
propriedade arquitetural continuamente — a fronteira vira regra de CI, não boa intenção em
documento. O exemplo mais direto: um teste que falha se o código do módulo `payments` importa
qualquer classe interna do módulo `ledger` fora da interface pública declarada.

> **Reencontro — `spring-boot/13`.** Spring Modulith implementa exatamente essa verificação via
> teste para um monolito modular — a mesma disciplina de fitness function, aplicada antes de
> qualquer rede entrar em jogo. `arquitetura-eventos/02` já tratou contexto delimitado como
> fronteira de modelagem tática; aqui ela vira critério de **onde cortar o processo**, não só o
> código.

## Exemplo numa fintech

Cortar o `pix-gateway` do `ledger-core`: por qual critério? "Porque é Pix" não é critério — é
nome. O critério real: o `pix-gateway` fala com o SPI, um sistema externo com SLA e protocolo
próprios, e precisa escalar e falhar de forma independente do ledger (uma instabilidade do SPI não
pode travar o resto da contabilidade). Isso é isolamento de falha e escala independente — dois dos
cinco critérios, presentes com clareza. Já separar "serviço de depósito" de "serviço de saque" só
porque são verbos diferentes, sem nenhum dos cinco critérios presente, é corte por estética.

## Hands-on

**Tutorial.** Escreva um teste de arquitetura (ArchUnit em Java, ou um script equivalente em Go
inspecionando imports) que falha se o módulo `payments` importar qualquer tipo interno de `ledger`
fora da interface pública. Desenhe um esquema de banco onde cada módulo tem seu próprio **papel**
(role) de conexão, sem acesso de escrita às tabelas de outro módulo.

**Desafio.** Construa uma matriz de decisão para três cortes candidatos do `fin-platform`
(critério × peso × nota 1-5), com a soma ponderada decidindo, e um gatilho de reversão explícito
para a decisão vencedora.

**Invariantes testáveis**

1. Uma violação de dependência plantada de propósito (um import direto de `ledger.internal` a
   partir de `payments`) deixa o fitness function vermelho.
2. Não existe ciclo de dependência entre módulos (verificado por um grafo de imports).
3. O papel de banco do módulo A não consegue fazer `SELECT` em nenhuma tabela do módulo B — testado
   executando a query com as credenciais do papel e esperando erro de permissão.
4. A matriz de decisão tem soma de pesos igual a 100, e a decisão final muda quando o peso de
   qualquer critério varia ±20% — o teste mostra a sensibilidade da escolha, não só o resultado.

**Complemento.** Meça o custo real de um salto de rede no corte proposto: latência adicional e a
nova superfície de falha (o que acontece quando o serviço do outro lado está fora do ar).

**Checagem**

1. Por que "porque é Pix" não é um critério válido para justificar um corte de serviço?
2. Quais são os cinco critérios para decidir entre monolito modular e microsserviço, e o que
   acontece quando nenhum deles está presente?
3. Quais são os sinais de um monolito distribuído, e por que ele custa mais que um monolito comum?
4. O que uma fitness function faz que um diagrama de arquitetura não faz?

## Principais aprendizados

- Decomposição é decisão sobre acoplamento, propriedade de dado e estrutura de equipe — nunca
  sobre moda de tecnologia ou nome de domínio.
- Os cinco critérios (autonomia de deploy, escala independente, isolamento de falha, isolamento
  regulatório, tamanho de time) decidem corte; sem nenhum presente, é módulo, não serviço.
- Monolito distribuído paga o custo operacional de rede sem ganhar isolamento real — é o pior dos
  dois mundos, não um meio-termo.
- Fitness functions transformam fronteira de diagrama em regra de CI — a única forma de uma
  fronteira sobreviver a um prazo apertado.
- Acoplamento de dado (duas "unidades" lendo a mesma tabela) é o antipadrão mais caro de desfazer,
  porque a correção exige migrar dado, não só reorganizar código.
