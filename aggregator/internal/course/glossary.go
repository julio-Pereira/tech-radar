package course

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// glossaryHeadingRe matches a term heading ("### Termo"); glossarySectionRe
// matches a grouping heading ("## Grupo") — present for readability in the
// authored file but carrying no data of its own, so it only ever finalizes
// whatever term was in progress, same as a new "###" would.
var glossaryHeadingRe = regexp.MustCompile(`^###\s+(.+?)\s*$`)
var glossarySectionRe = regexp.MustCompile(`^##\s+`)

// glossaryFieldRe matches one of the four required bold-labeled lines —
// "**Em uma frase:** ..." — matched by position (1st/2nd/3rd/4th line after
// the heading), not by the label text itself: the 2nd field's label names
// the trilha's own product ("No fin-platform:", "No fin-offers:"...), which
// legitimately varies, so only its presence is required, never its wording.
var glossaryFieldRe = regexp.MustCompile(`^\*\*[^*:]+:\*\*\s*(.*)$`)

// glossaryMarcoRe pulls the first "marco NN" out of the free-text "Onde na
// prática" field — real content writes that field as prose ("marco 02,
// retomado no 04, 07 e 08."), so only the first number is ever treated as
// the entry's own marco; the rest is just narrative, not another field.
var glossaryMarcoRe = regexp.MustCompile(`(?i)marco\s+(\d{2})`)

// inlineCodeRe and inlineEmphasisRe strip the handful of inline markdown
// marks real glossary terms use ("### WAL e `fsync`", "### *Schema drift*")
// down to plain text — the front end shows Term/Summary via textContent,
// same convention as quiz question/option text, so literal backticks or
// asterisks must never reach the reader.
var inlineCodeRe = regexp.MustCompile("`([^`]*)`")
var inlineEmphasisRe = regexp.MustCompile(`\*{1,3}([^*]+)\*{1,3}|_{1,3}([^_]+)_{1,3}`)

func stripInlineMarkup(s string) string {
	s = inlineCodeRe.ReplaceAllString(s, "$1")
	return inlineEmphasisRe.ReplaceAllString(s, "$1$2")
}

// parseGlossaryEntries extracts every "### Termo" block from a glossary
// markdown file. A term missing any of the four required fields is a build
// error — same reasoning as Completion and ReviewEvery: a malformed entry
// must fail loudly, not silently vanish from the index. Anchor and Summary
// are filled here (derived purely from the term/field text); Slug, Track,
// and MarcoID are course-specific and filled in by the caller.
func parseGlossaryEntries(source []byte) ([]GlossaryEntry, error) {
	lines := strings.Split(string(source), "\n")
	var entries []GlossaryEntry
	var term string
	var fields []string // raw field bodies, in the order they appear

	finalize := func() error {
		if term == "" {
			return nil
		}
		if len(fields) != 4 {
			return fmt.Errorf("verbete %q tem %d campo(s) em negrito, esperado 4 (Em uma frase / No <produto> / Erro comum / Onde na prática)", term, len(fields))
		}
		marco := ""
		if m := glossaryMarcoRe.FindStringSubmatch(fields[3]); m != nil {
			marco = m[1]
		}
		entries = append(entries, GlossaryEntry{
			Term:    term,
			Anchor:  slugify(term),
			Summary: fields[0],
			Marco:   marco,
		})
		term, fields = "", nil
		return nil
	}

	for _, line := range lines {
		if m := glossaryHeadingRe.FindStringSubmatch(line); m != nil {
			if err := finalize(); err != nil {
				return nil, err
			}
			term = stripInlineMarkup(m[1])
			continue
		}
		if glossarySectionRe.MatchString(line) {
			if err := finalize(); err != nil {
				return nil, err
			}
			continue
		}
		if term == "" {
			continue // preamble prose before the first term, or between a "##" and the next "###"
		}
		if m := glossaryFieldRe.FindStringSubmatch(line); m != nil {
			fields = append(fields, stripInlineMarkup(strings.TrimSpace(m[1])))
		}
	}
	if err := finalize(); err != nil {
		return nil, err
	}
	return entries, nil
}

// compileGlossary reads every course's glossary file (course.yaml's
// `glossary` field — most courses have none yet) and returns the flattened,
// cross-trilha entry list, sorted for stable diffs. One malformed glossary
// is logged and skipped — same best-effort policy as everything else here;
// TestGlossaryEntriesValid is what turns a real malformed entry into a hard
// CI failure.
func compileGlossary(contentDir string, courses map[string]CompiledCourse, bridgeIdx bridgeIndex) ([]GlossaryEntry, error) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		return nil, fmt.Errorf("read courses dir %s: %w", contentDir, err)
	}

	var all []GlossaryEntry
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, e.Name())
		manifest, err := ParseManifest(filepath.Join(dir, manifestName))
		if err != nil || manifest.Slug == "" || manifest.Glossary == "" {
			continue
		}
		course, ok := courses[manifest.Slug]
		if !ok {
			continue // course itself failed to compile; already WARN-logged there
		}

		data, err := os.ReadFile(filepath.Join(dir, manifest.Glossary))
		if err != nil {
			log.Printf("WARN skipping glossary for %s: %v", manifest.Slug, err)
			continue
		}
		parsed, err := parseGlossaryEntries(data)
		if err != nil {
			log.Printf("WARN skipping glossary for %s: %v", manifest.Slug, err)
			continue
		}
		for _, entry := range parsed {
			entry.Slug = manifest.Slug
			entry.Track = course.Title
			if entry.Marco != "" {
				entry.MarcoID = bridgeIdx[manifest.Slug][entry.Marco]
			}
			all = append(all, entry)
		}
	}

	sort.Slice(all, func(i, j int) bool {
		if all[i].Term != all[j].Term {
			return all[i].Term < all[j].Term
		}
		return all[i].Slug < all[j].Slug
	})
	return all, nil
}

// writeGlossary writes the compiled catalog to dataDir/glossary.json.
func writeGlossary(entries []GlossaryEntry, dataDir string) error {
	catalog := GlossaryCatalog{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Entries: entries}
	return writeJSON(filepath.Join(dataDir, "glossary.json"), catalog)
}
