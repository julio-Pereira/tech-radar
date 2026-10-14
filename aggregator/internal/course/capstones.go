package course

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"gopkg.in/yaml.v3"
)

// compileCapstones validates content/capstones.yaml (UX platform melhoria 7,
// phase 1 — map only, no fin-check verifier yet) and writes
// web/data/capstones.json. A missing file compiles to an empty map, not an
// error — no trilha has to declare a capstone component to exist.
func compileCapstones(path string, courses map[string]CompiledCourse, dataDir string) error {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return writeJSON(filepath.Join(dataDir, "capstones.json"),
			CapstoneMap{GeneratedAt: time.Now().UTC().Format(time.RFC3339)})
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	var entries []CapstoneEntry
	if err := yaml.Unmarshal(data, &entries); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}

	trackOf := make(map[string]string, len(entries)) // component -> track, also doubles as the dup/existence check
	for _, e := range entries {
		if e.Track == "" || e.Component == "" {
			return fmt.Errorf("%s: an entry is missing track or component", path)
		}
		if prev, dup := trackOf[e.Component]; dup {
			return fmt.Errorf("%s: duplicate component %q (tracks %q and %q)", path, e.Component, prev, e.Track)
		}
		trackOf[e.Component] = e.Track
	}

	deps := make(map[string][]string, len(entries))
	compiled := make([]CompiledCapstone, 0, len(entries))

	for _, e := range entries {
		course, ok := courses[e.Track]
		if !ok {
			return fmt.Errorf("%s: track %q does not exist", path, e.Track)
		}
		if len(course.Milestones) == 0 || !hasCapstoneSection(course.Milestones[len(course.Milestones)-1]) {
			return fmt.Errorf("%s: track %q's last milestone has no \"## Capstone\" section", path, e.Track)
		}
		for _, dep := range e.DependsOn {
			if _, ok := trackOf[dep]; !ok {
				return fmt.Errorf("%s: component %q depends on undeclared component %q", path, e.Component, dep)
			}
		}
		deps[e.Component] = e.DependsOn
		compiled = append(compiled, CompiledCapstone{
			Track: e.Track, TrackTitle: course.Title, Component: e.Component,
			DependsOn: e.DependsOn, Artifacts: e.Artifacts,
		})
	}

	if cycle := findDependencyCycle(deps); cycle != "" {
		return fmt.Errorf("%s: dependency cycle detected at component %q", path, cycle)
	}

	sort.Slice(compiled, func(i, j int) bool { return compiled[i].Component < compiled[j].Component })
	catalog := CapstoneMap{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Components: compiled}
	return writeJSON(filepath.Join(dataDir, "capstones.json"), catalog)
}

// hasCapstoneSection checks the already-split Sections (sections.go's own
// H2 divider) for a "Capstone" heading — no need to re-read/re-parse the
// milestone's raw markdown just for this.
func hasCapstoneSection(m CompiledMilestone) bool {
	for _, s := range m.Sections {
		if s.Title == "Capstone" {
			return true
		}
	}
	return false
}

// findDependencyCycle runs a 3-color DFS over the depends_on graph,
// returning the first component found inside a cycle, or "" if the graph
// is acyclic.
func findDependencyCycle(deps map[string][]string) string {
	const white, gray, black = 0, 1, 2
	color := make(map[string]int, len(deps))
	var found string

	var visit func(node string) bool
	visit = func(node string) bool {
		color[node] = gray
		for _, dep := range deps[node] {
			if color[dep] == gray {
				found = dep
				return true
			}
			if color[dep] == white && visit(dep) {
				return true
			}
		}
		color[node] = black
		return false
	}

	// Sorted iteration order so a cycle, if any, is reported deterministically.
	nodes := make([]string, 0, len(deps))
	for node := range deps {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	for _, node := range nodes {
		if color[node] == white && visit(node) {
			return found
		}
	}
	return ""
}
