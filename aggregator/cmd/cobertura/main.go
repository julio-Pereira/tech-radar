// Command cobertura prints the visual coverage report of the trilhas
// (diagram plan, Fase 5) as Markdown. CI appends it to the job summary and
// uploads it as an artifact.
//
//	go run ./cmd/cobertura [content/courses] > cobertura.md
package main

import (
	"fmt"
	"os"

	"github.com/julio-pereira/tech-radar/internal/course"
)

func main() {
	dir := "content/courses"
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
	rows, err := course.Cobertura(dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cobertura:", err)
		os.Exit(1)
	}
	fmt.Print(course.CoberturaMarkdown(rows))
}
