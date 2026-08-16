---
id: cqrs-e-projecoes
title: "CQRS: separar quem decide de quem responde"
summary: "A escada de adoção do barato ao caro, a projeção como consumidor idempotente e descartável por design, e o lag da projeção como métrica de produto."
estimatedMinutes: 50
references:
  - title: "Martin Fowler — CQRS"
    url: https://martinfowler.com/bliki/CQRS.html
  - title: "Microservices.io — CQRS pattern"
    url: https://microservices.io/patterns/data/cqrs.html
  - title: "Greg Young — CQRS Documents"
    url: https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf
---

## O que CQRS é, e o que ele não é

CQRS é uma frase só: **dois modelos, um para decidir e outro para responder**.

O modelo de escrita é rico em invariante. Ele existe para dizer "não" — saldo insuficiente,
conta bloqueada, limite estourado — e é o agregado do marco 02. O modelo de leitura existe
para responder rápido a uma pergunta específica de tela: o extrato dos últimos 90 dias, a
posição consolidada, a lista de pagamentos pendentes.

Eles são diferentes porque as perguntas são diferentes. Um modelo que protege invariantes é
normalizado, pequeno e cuidadoso; um modelo que responde telas é desnormalizado, redundante
e otimizado para uma consulta específica. Forçar os dois no mesmo esquema é como se acaba
com um `JOIN` de sete tabelas na tela mais acessada do app.

O que CQRS **não** é, e é confundido o tempo todo:

- **não é event sourcing.** São ortogonais. Dá para ter CQRS com um banco relacional comum e
  nenhum evento persistido (marco 07 trata do outro).
- **não é microsserviços.** Cabe inteiro dentro de um processo.
- **não são dois bancos obrigatoriamente.** Ver a escada abaixo.

## A escada de adoção

Do barato ao caro. Suba um degrau quando a dor aparecer — não antes:

**Degrau 1 — consultas separadas no mesmo modelo.** Você para de usar as entidades de
domínio para responder consulta e escreve SQL direto, ou uma projeção em memória, com DTOs
próprios. Custo quase zero. Já resolve a maior parte dos casos em que "o ORM está lento".

**Degrau 2 — read model materializado no mesmo banco.** Uma tabela desnormalizada,
atualizada na mesma transação ou por trigger/job. Você ganha consulta trivial e mantém
consistência forte, porque tudo está no mesmo commit. **A maioria dos casos deveria parar
aqui**, e essa é a frase que quase nenhuma apresentação de CQRS diz.

**Degrau 3 — read model em outro store, alimentado por evento.** É aqui que entra assincronia,
janela de inconsistência, reprojeção, monitoramento de lag e um segundo sistema para operar.
Você sobe quando precisa de um store diferente (busca textual, série temporal, escala de
leitura muito maior que a de escrita) ou quando o dono do read model é outro contexto.

O degrau 3 é o que as pessoas chamam de "CQRS" e é o mais caro dos três. Subir direto para
ele, sem ter sentido a dor dos degraus 1 e 2, é a definição de complexidade especulativa.

## Projeção: consumidor idempotente e descartável

Uma **projeção** é o consumidor que lê o fluxo de eventos e constrói o read model. Três
propriedades definem uma projeção que funciona:

**Idempotente.** O mesmo evento aplicado duas vezes produz o mesmo estado. Sem isso,
qualquer reentrega corrompe a leitura, e reentrega vai acontecer — o broker é at-least-once
(a peça que fecha isso do lado do consumidor é o marco 08).

**Determinística.** Os mesmos eventos, na mesma ordem, produzem o mesmo resultado. Nada de
`now()`, nada de chamar serviço externo cujo retorno varia, nada de aleatoriedade. Sem
determinismo, reprojetar não dá o mesmo extrato, e você perde a propriedade seguinte.

**Descartável por design.** Você pode apagar o read model inteiro e reconstruí-lo do fluxo.
É isso que transforma bug de projeção em não-evento: corrige o código, apaga, reprojeta.
Times que têm medo de reprojetar acabaram de perder o principal benefício do padrão — e
quase sempre é porque a projeção não é determinística.

Uma KTable do `kafka/09` é exatamente uma projeção: estado por chave, reconstruível pelo
changelog. Mesmo conceito, outro nome, outra camada.

**A projeção nunca é fonte da verdade.** Ela é uma cópia derivada, e a verdade mora no
modelo de escrita. No dia em que alguém escreve direto no read model, o padrão acabou — e a
divergência aparece semanas depois, na conciliação.

## Lag da projeção: métrica de produto

O degrau 3 traz uma janela de inconsistência, e o marco 04 já deu a régua: janela declarada
tem número, dono, monitoramento e frase para o cliente.

O **lag da projeção** — quanto tempo entre o fato e ele aparecer na leitura — é a
materialização desse número. Ele não é métrica de infraestrutura: é métrica de produto, e
quem responde por ela é quem responde pelo extrato, não quem responde pelo cluster.

Alerte por ele em termos de sintoma: "o extrato está mais de 30s atrás" diz o que o cliente
sente; "consumer lag alto" diz o que a infra vê e dispara em backfill legítimo (é a mesma
distinção de sintoma e causa de `observabilidade/13`).

E a **reprojeção completa** precisa ser rotina ensaiada, não hipótese: quanto tempo leva
reconstruir o extrato inteiro? Se ninguém sabe, você não tem a operação — tem a intenção.

## Exemplo numa fintech

No `fin-platform`, o ledger é o modelo de escrita: lançamentos imutáveis, invariante de que
a soma fecha em zero, saldo protegido por transação. Duas projeções vivem dele:

- **Extrato** — lista paginada por conta e período, com filtro e busca. Desnormalizado,
  otimizado para a tela, reconstruível.
- **Posição consolidada** — a visão do cliente com todas as contas. Agregação cara em SQL,
  trivial como projeção.

E existe a distinção que o negócio já batizou: **saldo disponível × saldo contábil**. O
contábil é o agregado. O disponível desconta reservas em voo e é calculado pelo dono — não é
uma segunda verdade, é uma função da primeira.

O erro clássico aqui é deixar o saldo disponível virar uma projeção mantida por outro
contexto. Ele parece só mais um read model, e não é: ele participa da decisão de aprovar ou
recusar um débito, e decisão exige o modelo de escrita. **Se a leitura decide, ela não é
read model** — é o agregado com outro nome, e você acabou de espalhar uma invariante.

## Hands-on

**Tutorial — projeção de extrato em Go.**

1. Escreva um consumidor que lê `payments.authorized` e `settlement.completed` e mantém uma
   tabela `extrato(account_id, event_id, occurred_at, tipo, amount, saldo_apos)`.
2. Faça a idempotência pela chave `(account_id, event_id)` — a inserção duplicada não pode
   alterar o estado.
3. Garanta determinismo: nada de `now()` na projeção; a data vem do `occurredAt` do evento.
4. Escreva o comando `reprojetar`: apaga a tabela e reprocessa desde o início do fluxo.
5. Exponha o lag da projeção como métrica: `now - occurredAt` do último evento aplicado.
6. `git commit -m "feat: projeção de extrato com reprojeção e métrica de lag"`.

**Desafio — reprojeção idêntica.** Rode a projeção sobre um conjunto de eventos, guarde o
resultado, apague tudo e reprojete. Prove que o extrato final é **idêntico** ao anterior —
byte a byte, ou por hash das linhas ordenadas. Se não for, encontre a fonte de
não-determinismo antes de seguir para o marco 07.

**Invariantes testáveis**

1. Aplicar o mesmo evento 3× produz exatamente o mesmo estado do read model.
2. Reprojeção completa produz um extrato idêntico ao anterior, comprovado por hash.
3. Nenhuma escrita no read model vem de outro lugar que não a projeção — grep no repo prova.
4. O lag da projeção é exposto como métrica e tem um limiar declarado.

**Complemento.** Introduza de propósito um `time.Now()` na projeção e rode o teste de
reprojeção. Ele deve falhar. Um teste que não falha quando você quebra a propriedade não
está testando nada.

**Checagem**

1. Quais são os três degraus da escada de adoção, e por que a maioria deveria parar no 2?
2. Por que determinismo é pré-requisito para "descartável por design"?
3. Por que o lag da projeção é métrica de produto e não de infraestrutura?
4. Por que o saldo disponível não pode ser uma projeção mantida por outro contexto?

## Principais aprendizados

- CQRS é separar o modelo que decide do que responde — e não é event sourcing, nem
  microsserviços, nem dois bancos obrigatoriamente.
- A escada tem três degraus, e a maioria dos casos deveria parar no 2: read model
  materializado no mesmo banco, consistente no mesmo commit.
- Projeção é idempotente, determinística e descartável. Medo de reprojetar é sintoma de
  não-determinismo, e custa o principal benefício do padrão.
- Projeção nunca é fonte da verdade; no dia em que alguém escreve direto nela, o padrão
  acabou e a divergência aparece na conciliação.
- Se a leitura participa de uma decisão, ela não é read model — é agregado com outro nome, e
  a invariante acabou de ser espalhada.
