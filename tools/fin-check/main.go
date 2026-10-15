// fin-check verifies that a reader's own fin-platform repo has the
// artifacts a tech-radar trilha's capstone promised, using the published
// capstones.json manifest. It never trusts that manifest with arbitrary
// shell commands — see allowlist.go.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Stdin))
}

func run(args []string, stdout, stderr io.Writer, stdin io.Reader) int {
	fs := flag.NewFlagSet("fin-check", flag.ContinueOnError)
	fs.SetOutput(stderr)
	manifestPath := fs.String("manifest", "capstones.json", "path to the published capstones.json manifest")
	component := fs.String("component", "", "only check this component (default: all)")
	dryRun := fs.Bool("dry-run", true, "print what a command check would run without executing it (exists checks always run for real)")
	yes := fs.Bool("yes", false, "skip interactive confirmation before running a command (only with -dry-run=false)")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	manifest, err := loadManifest(*manifestPath)
	if err != nil {
		fmt.Fprintln(stderr, "fin-check:", err)
		return 2
	}

	opts := runOptions{DryRun: *dryRun, AssumeYes: *yes}
	confirm := stdinConfirm(stdin, stderr)

	failed := false
	matched := false
	for _, c := range manifest.Components {
		if *component != "" && c.Component != *component {
			continue
		}
		matched = true
		fmt.Fprintf(stdout, "== %s (%s) ==\n", c.Component, c.TrackTitle)
		for _, a := range c.Artifacts {
			r := evaluateArtifact(a, opts, confirm)
			fmt.Fprintf(stdout, "  [%s] %s: %s", r.Status, r.Path, r.Check)
			if r.Detail != "" {
				fmt.Fprintf(stdout, " (%s)", r.Detail)
			}
			fmt.Fprintln(stdout)
			if r.Status.failing() {
				failed = true
			}
		}
	}

	if *component != "" && !matched {
		fmt.Fprintf(stderr, "fin-check: no component %q in manifest\n", *component)
		return 2
	}
	if failed {
		return 1
	}
	return 0
}

func stdinConfirm(stdin io.Reader, stderr io.Writer) confirmFunc {
	return func(prompt string) bool {
		fmt.Fprintf(stderr, "run %s? [y/N] ", prompt)
		scanner := bufio.NewScanner(stdin)
		if !scanner.Scan() {
			return false
		}
		switch scanner.Text() {
		case "y", "Y", "yes":
			return true
		default:
			return false
		}
	}
}
