---
id: hexagonal-e-clean-na-pratica
title: "Hexagonal e clean na prática"
summary: "Portas e adaptadores só valem o que custam se o núcleo realmente não conhece o mundo externo — e se a porta tem um teste de contrato que qualquer adaptador precisa passar."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Hexagonal Architecture (Alistair Cockburn)"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "The Clean Architecture (Robert C. Martin)"
    url: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
---

## Portas de entrada e de saída

Uma **porta de entrada** é como o mundo externo chama o núcleo (um caso de uso, uma interface de
aplicação). Uma **porta de saída** é como o núcleo chama o mundo externo (persistência,
mensageria, outro serviço) — mas a direção da **dependência de código** é sempre a mesma: o núcleo
define a interface da porta de saída, e um **adaptador** de fora a implementa. O núcleo nunca importa
o adaptador; é o adaptador que importa o núcleo.

## A regra de dependência e a inversão

"O núcleo não depende de nada externo" soa abstrato até ficar concreto: nenhum import de driver de
banco, nenhum import de biblioteca de transporte HTTP, nenhum import de framework de injeção de
dependência dentro do pacote do domínio. A **inversão de dependência** é o mecanismo que torna isso
possível sem o núcleo perder a capacidade de persistir ou comunicar — ele declara a interface que
precisa, e algo de fora a implementa e injeta.

## Onde ficam DTOs, mapeamento e transações

Um objeto de transferência de dados (DTO) que atravessa a porta de entrada não é o mesmo objeto de
domínio — existe um **mapeamento** explícito entre os dois, geralmente no adaptador de entrada, nunca
dentro do núcleo. O controle de transação (onde começa e termina um `BEGIN`/`COMMIT`) é
responsabilidade do adaptador de persistência ou de uma camada de orquestração fina, nunca do
agregado — o agregado garante sua própria invariante em memória; a transação é um detalhe de como
essa garantia é persistida.

## ACL como adaptador

A camada anticorrupção (ACL, `arquitetura-eventos/02`) que isola um sistema legado é, estruturalmente,
só mais um **adaptador** — implementa uma porta de saída que o núcleo define, e tudo que é específico
do formato ou do vocabulário do legado fica contido ali, nunca vazando para o domínio. Entender ACL
como caso particular de adaptador, não como conceito separado, simplifica onde ela deve morar na
estrutura de pacotes.

## Estrutura de pacotes: Java e Go, lado a lado

Em **Java**, o núcleo mora num pacote próprio (`dominio` ou `core`), com portas como interfaces
dentro dele, e adaptadores em pacotes separados que dependem do núcleo (nunca o contrário) — ArchUnit
verifica isso. Em **Go**, a convenção muda de forma sutil mas importante: **a interface é definida por
quem consome**, não por quem implementa — o núcleo declara a interface de que precisa, no seu próprio
pacote, e o adaptador a satisfaz estruturalmente, sem precisar importar o pacote do núcleo para
"implementar" formalmente nada (tipagem estrutural). E não existe pacote `utils` — cada
responsabilidade mora no pacote que a possui.

## Teste de contrato da porta: o mesmo teste, dois adaptadores

A prova de que a inversão de dependência realmente funciona é um **teste de contrato**: a mesma
suíte de testes roda contra o adaptador em memória (usado nos testes do núcleo) e contra o adaptador
real (SQL, por exemplo) — se os dois passam na mesma suíte, o núcleo realmente não percebe a
diferença entre eles. Se o teste de contrato não existe, "os dois adaptadores são intercambiáveis" é
uma afirmação de fé, não um fato verificado.

## Testar o núcleo sem framework

Um núcleo que não importa framework pode ser testado com testes unitários simples, sem subir
contexto de injeção de dependência, sem container de teste, sem mock de infraestrutura — só o
domínio, puro. Se testar o núcleo exige qualquer uma dessas coisas, é sinal de que algo externo
vazou para dentro.

## O custo de cerimônia, e quando é desperdício

Cada porta é uma interface extra; cada adaptador é um arquivo extra; cada DTO é um mapeamento extra.
Para um domínio real com regras que mudam e que precisam ser protegidas de infraestrutura volátil,
esse custo se paga. Para um CRUD simples sem lógica de negócio real, ou para um protótipo descartável,
o mesmo custo é só cerimônia sem retorno — a honestidade sobre quando **não** usar hexagonal é parte
do conteúdo, não uma nota de rodapé.

## Como não virar "interface com uma implementação só" por reflexo

Criar uma porta (interface) para tudo, mesmo quando só existe e só vai existir um adaptador, é
cerimônia sem benefício real — a interface não está comprando flexibilidade nenhuma, só indireção. A
porta se justifica quando existe (ou é concretamente esperada) mais de um adaptador real, ou quando o
teste do núcleo precisa de um adaptador em memória para rodar rápido e isolado — não como reflexo
automático de "toda dependência deveria ser uma interface".

## Exemplo numa fintech

A porta `RepositorioDeContas` tem dois adaptadores: um em memória (usado nos testes de unidade do
núcleo, rápido, sem infraestrutura) e um em SQL (usado em produção). O núcleo que decide uma
transferência não muda uma linha quando o adaptador troca de um para o outro — e o teste de contrato
da porta, rodado contra os dois, é a prova de que essa afirmação não é otimismo.

## Hands-on

**Tutorial.** Implemente o núcleo sem framework e dois adaptadores para a mesma porta, em Java e em
Go.

**Desafio.** Escreva o teste de arquitetura que protege o núcleo de importar infraestrutura.

**Invariantes testáveis**

1. O pacote do núcleo **não importa** framework, driver de banco nem biblioteca de transporte —
   verificado por ArchUnit em Java e por verificação de `go list -deps` em Go.
2. Os dois adaptadores (memória e SQL) passam no **mesmo teste de contrato** da porta, sem
   adaptação do teste para cada um.
3. Trocar o adaptador usado **não altera nenhum arquivo** do núcleo — verificado por `diff` antes e
   depois da troca.
4. Um relatório mede a cerimônia (contagem de arquivos e linhas) de implementar o mesmo caso de uso
   simples com e sem hexagonal, sem concluir qual é "melhor" de forma absoluta.

**Complemento.** No material de `spring-boot/13` (hexagonal "sem cerimônia"), identifique o ponto
exato onde a cerimônia foi reduzida e justifique se essa redução é segura para o seu domínio ou não.

**Checagem**

1. Qual é a diferença entre porta de entrada e porta de saída, e por que a direção da dependência de
   código é a mesma nas duas?
2. Por que uma ACL é, estruturalmente, só mais um adaptador?
3. O que muda, na convenção de interfaces, entre Java e Go — e por que essa diferença existe?
4. O que um teste de contrato de porta prova que dois adaptadores "parecidos" não provam por si só?
5. Quando o custo de cerimônia do hexagonal não se paga?
6. Por que criar uma interface para toda dependência, por reflexo, não é a mesma coisa que aplicar
   inversão de dependência de forma útil?

> **Reencontro — `spring-boot/13`; `go-fintech/01`; `arquitetura-eventos/02`; `spring-boot/11`.**
> O hexagonal "sem cerimônia" do Spring Modulith em `spring-boot/13` é o ponto de referência direto
> deste marco para a pergunta "quando a cerimônia completa não compensa". A estrutura de pacotes Go
> de `go-fintech/01` é onde a convenção "interface definida por quem consome" se apoia na prática. A
> ACL de `arquitetura-eventos/02` é formalizada aqui como caso particular de adaptador. E o teste de
> contrato da porta usa a mesma disciplina de teste que prova comportamento real de
> `spring-boot/11`, aplicada à fronteira entre núcleo e infraestrutura em vez de entre serviços.

## Principais aprendizados

- A direção da dependência de código é sempre do adaptador para o núcleo, nas portas de entrada e de
  saída — o núcleo declara a interface, nunca importa quem a implementa.
- DTOs, mapeamento e controle de transação vivem nos adaptadores ou numa camada de orquestração fina,
  nunca dentro do agregado de domínio.
- Uma ACL é estruturalmente um adaptador comum, não um conceito à parte.
- Em Go, a interface é definida por quem consome, não por quem implementa — diferença real de
  convenção em relação a Java, não só estilo.
- Um teste de contrato de porta, rodado contra todos os adaptadores, é o que prova que eles são de
  fato intercambiáveis — sem ele, a afirmação é otimismo, não fato verificado.
