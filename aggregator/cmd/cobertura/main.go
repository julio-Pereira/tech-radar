// Command cobertura prints the coverage report of the trilhas as Markdown:
// the visual coverage (diagram plan, Fase 5) and the glossary coverage —
// verbetes with a resolved marco, the ones that can enter #/revisar. CI
// appends it to the job summary and uploads it as an artifact.
//
//	go run ./cmd/cobertura [content/courses] > cobertura.md
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

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

	glossario, err := coberturaGlossario(dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cobertura do glossário:", err)
		os.Exit(1)
	}
	fmt.Print(course.CoberturaGlossarioMarkdown(glossario))
}

// coberturaGlossario compiles the content into a scratch directory (resolving
// "marco NN" needs the compiled milestones) and reads the glossary back.
func coberturaGlossario(dir string) ([]course.GlossarioCobertura, error) {
	tmp, err := os.MkdirTemp("", "cobertura-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)

	log.SetOutput(io.Discard) // compile WARNs belong to the build, not to this report
	if _, err := course.Compile(dir, filepath.Join(tmp, "courses")); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(tmp, "glossary.json"))
	if err != nil {
		return nil, err
	}
	var catalog course.GlossaryCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		return nil, err
	}
	return course.CoberturaGlossario(catalog.Entries), nil
}
