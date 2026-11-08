---
id: slices-maps-e-strings
title: "Slices, maps e strings: a semântica que derruba entrevista"
summary: "Slice é uma janela sobre um array compartilhado; quem não entende isso escreve bug que só aparece com dado de produção. Aliasing, capacidade, maps sem ordem e sem trava, strings em bytes e a variável de laço."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [confiabilidade, performance]
references:
  - title: "Go Slices: usage and internals (Go blog)"
    url: https://go.dev/blog/slices-intro
  - title: "Go maps in action (Go blog)"
    url: https://go.dev/blog/maps
  - title: "Strings, bytes, runes and characters in Go (Go blog)"
    url: https://go.dev/blog/strings
  - title: "Fixing For Loops in Go 1.22 (Go blog)"
    url: https://go.dev/blog/loopvar-preview
  - title: "Range Over Function Types (Go blog)"
    url: https://go.dev/blog/range-functions
---

## Um slice é três números

Um slice não é um array. É um **cabeçalho** de três campos: um ponteiro para um array, o
comprimento (`len`) e a capacidade (`cap`, quantos elementos cabem a partir do ponteiro até o fim do
array). Copiar um slice (passar como argumento, atribuir, devolver) copia os três números, **não os
elementos**. Dois slices podem olhar para o mesmo array, e escrever por um muda o que o outro vê.

```go
a := []int{1, 2, 3, 4}
b := a[:2]         // len 2, cap 4: mesma memória de a
b = append(b, 99)  // cabe na capacidade: escreve em a[2]
fmt.Println(a)     // [1 2 99 4]
```

É o **aliasing**, e a regra de `append` explica tudo: se o resultado cabe na capacidade, `append`
escreve no array existente e devolve um slice sobre ele; se não cabe, aloca um array novo, copia, e
a partir daí os dois slices são independentes. O mesmo código, portanto, compartilha ou não memória
conforme a capacidade que sobrou, e a capacidade depende de como o slice cresceu antes. É por isso
que o bug aparece com dado de produção e some no teste com três elementos.

Três ferramentas controlam isso:

- **`copy(dst, src)`** e **`slices.Clone(s)`** (pacote `slices`, Go 1.21) fazem uma cópia
  independente dos elementos.
- **A expressão de três índices `s[a:b:c]`** fixa a capacidade em `c-a`. Um `append` sobre ela
  além de `b` precisa realocar, então não escreve no array original. Ela protege contra `append`,
  mas não contra quem altera `t[0]` diretamente: para isso, só a cópia.
- **Sub-slice segura o array inteiro vivo.** Guardar `log[:10]` de um `log` de 50 MB mantém os
  50 MB na memória, porque o coletor de lixo vê o ponteiro para o array. Copie o pedaço que vai
  ficar.

## Maps: sem ordem, sem trava

Um `map` é uma tabela hash com três propriedades que caem em toda entrevista:

- **A ordem de iteração não é definida, e o runtime a embaralha de propósito**, para que ninguém
  dependa dela. Rodar `for k := range m` três vezes pode dar três ordens. Se a ordem é dado (um
  extrato, um arquivo de conciliação), ela vem de um slice ou de uma ordenação explícita
  (`slices.Sorted(maps.Keys(m))`), nunca do map.
- **Não é seguro para escrita concorrente.** Duas goroutines escrevendo no mesmo map (ou uma
  escrevendo enquanto outra lê) é data race, e o runtime detecta muitos desses casos e **aborta o
  processo** com `fatal error: concurrent map writes`. Não é `panic`: não há `recover` que salve.
  Proteja com `sync.Mutex`/`RWMutex` ou use `sync.Map` nos dois casos em que ele serve (marco 07).
  O porquê, no modelo de memória, está em `concorrencia-e-recursos/01`.
- **Chave inexistente devolve o zero value.** `saldos["bia"]` vale `0` se "bia" não existe, sem
  erro. Quando zero é um valor legítimo (um saldo pode ser zero), use `v, ok := m[k]`.

E um detalhe que surpreende quem vem de Java: um map de structs devolve **cópias**.
`contas["ana"].Saldo += 5` nem compila (`cannot assign to struct field ... in map`). O idioma é ler,
alterar e gravar de volta (`c := contas["ana"]; c.Saldo += 5; contas["ana"] = c`), ou guardar
ponteiros.

## Strings são bytes

Uma `string` é uma sequência **imutável de bytes**, em geral UTF-8. `len(s)` conta bytes, não
caracteres: `len("ação")` é 6, porque `ç` e `ã` ocupam dois bytes cada. O `for i, r := range s`
percorre **runes** (pontos de código), e `i` é o índice em bytes, então pula de 1 para 3. Indexar
`s[1]` devolve um byte, que pode ser metade de um caractere. Para contar caracteres, use
`utf8.RuneCountInString`; para montar texto em laço, `strings.Builder`, que evita uma alocação por
concatenação. Num campo de nome com limite de 40 caracteres, confundir bytes com caracteres corta
um nome acentuado no meio de uma letra.

## A variável de laço mudou no Go 1.22

Até o Go 1.21, a variável de um `for` era **uma só**, reaproveitada a cada iteração: uma closure
criada no laço via sempre o último valor. Desde o Go 1.22, **cada iteração cria uma variável nova**.
O detalhe que derruba entrevista: a regra nova vale conforme a **linha `go` do `go.mod`** (marco 01),
não conforme o toolchain instalado.

```go
var fs []func()
for i := 0; i < 3; i++ {
	fs = append(fs, func() { fmt.Print(i) })
}
for _, f := range fs {
	f()
}
// go 1.22 ou mais novo no go.mod: 012
// go 1.21 ou mais velho:          333
```

O Go 1.22 também passou a aceitar `range` sobre inteiro (`for i := range 3`), e o 1.23 trouxe
`range` sobre função, os **iteradores** do pacote `iter`: uma função que entrega valores um a um para
o laço de quem chama. Isso abre uma alternativa à cópia: em vez de devolver um slice, você devolve um
`iter.Seq[T]` que entrega cada elemento por valor, e quem chama não tem um slice para alterar.

## Exemplo numa fintech

O extrato de uma conta guarda as linhas num slice interno, em ordem de chegada, e um índice
`map[id]posição` para descartar duplicatas. A paginação foi escrita assim:

```go
func (s *Statement) Page(n int) []Line {
	start, end := s.bounds(n)
	return s.lines[start:end] // uma janela sobre o array interno
}
```

Um cliente da API pede a página 0 e, para montar a resposta, faz `append` de uma linha de "saldo
anterior". Como o slice interno tinha capacidade sobrando (cresceu em lotes), o `append` escreve
**dentro do array do extrato**, por cima da primeira linha da página 1. O cliente seguinte que pede a
página 1 recebe a linha errada. O teste passava porque usava 3 linhas, e o slice de teste não tinha
capacidade sobrando.

A correção que fecha o bug é a cópia (`slices.Clone`), ou um iterador que entrega as linhas por valor.
Repare também no índice: se alguém for "otimizar" o extrato iterando o `map` em vez do slice, a
ordem do extrato passa a variar entre chamadas. Ordem é dado, não sorte.

## Hands-on

**Tutorial.** Reproduza o bug. Escreva o `Statement` com `Add` e com o `Page` acima, preencha 5
linhas, dê ao slice interno capacidade sobrando (`s.lines = slices.Grow(s.lines, 10)`), faça
`append` na página 0 e mostre, num teste, que a página 1 passou a começar com a linha intrusa. Depois
corrija `Page` com `slices.Clone`.

**Desafio.** Um `Statement.Page(n)` seguro para uma API real: cópia por página, um `PageSeq(n)
iter.Seq[Line]` como alternativa sem cópia, e `sync.RWMutex` porque muitos leitores consultam o
extrato enquanto lançamentos chegam.

**Invariantes testáveis**

1. Alterar um elemento ou dar `append` no slice devolvido por `Page` não muda nenhuma página
   seguinte nem o estado interno (compare o slice interno antes e depois, com capacidade sobrando).
2. Ler a mesma página 50 vezes produz sempre a mesma sequência, e `PageSeq` concorda com `Page`
   elemento a elemento, embora o extrato tenha um `map` por dentro.
3. `go test -race` fica verde com 8 goroutines lendo páginas (por `Page` e por `PageSeq`) enquanto
   outra adiciona linhas.

**Complemento.** Meça com `testing.AllocsPerRun` o custo de cada estratégia: `Page` aloca a cópia
(uma alocação por chamada), `PageSeq` percorre a página sem alocar. Em seguida, responda no código:
qual o risco de o laço de quem chama ficar lento com o `RLock` do `PageSeq` preso?

**Checagem**

1. Por que o mesmo `append` às vezes altera o slice original e às vezes não?
2. A expressão `s[a:b:c]` protege o extrato contra que tipo de alteração, e contra qual não protege?
3. Por que escrita concorrente em map não pode ser tratada com `recover`?
4. Num módulo com `go 1.21` no `go.mod`, compilado com o Go 1.27, o laço com closures imprime `012` ou
   `333`? Por quê?

## Principais aprendizados

- Slice é ponteiro, `len` e `cap`; `append` compartilha memória enquanto cabe na capacidade.
- Devolver uma janela sobre estado interno entrega o estado interno: copie, ou devolva um iterador.
- Map não tem ordem nem trava; ordem é dado, e escrita concorrente sem trava aborta o processo.
- `len` de string conta bytes; `range` percorre runes.
- A variável de laço por iteração depende da linha `go` do módulo.
