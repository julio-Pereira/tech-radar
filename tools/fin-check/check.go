package main

import (
	"os"
	"os/exec"
	"strings"
)

type status int

const (
	statusOK status = iota
	statusMissing
	statusFailed
	statusSkipped
	statusRefused
)

func (s status) String() string {
	switch s {
	case statusOK:
		return "ok"
	case statusMissing:
		return "MISSING"
	case statusFailed:
		return "FAIL"
	case statusSkipped:
		return "skip"
	case statusRefused:
		return "REFUSED"
	default:
		return "?"
	}
}

func (s status) failing() bool {
	return s == statusMissing || s == statusFailed || s == statusRefused
}

type result struct {
	Path   string
	Check  string
	Status status
	Detail string
}

type runOptions struct {
	DryRun    bool
	AssumeYes bool
}

// confirmFunc asks the user to approve running a.Check in a.Path; returns
// true to proceed. Injectable so tests never have to touch a real stdin.
type confirmFunc func(prompt string) bool

// evaluateArtifact runs (or decides not to run) a single artifact check.
// "exists" is always evaluated for real — it's a read-only os.Stat, never
// a command. Anything else must first pass isAllowlisted; a manifest
// pulled from a public repo is not a trusted source of shell commands.
func evaluateArtifact(a Artifact, opts runOptions, confirm confirmFunc) result {
	r := result{Path: a.Path, Check: a.Check}

	if a.Check == "exists" {
		if _, err := os.Stat(a.Path); err != nil {
			r.Status = statusMissing
			r.Detail = "not found"
		} else {
			r.Status = statusOK
		}
		return r
	}

	if !isAllowlisted(a.Check) {
		r.Status = statusRefused
		r.Detail = `check not in allowlist (only "exists", "make <target>", "go test ./..." are allowed)`
		return r
	}

	if opts.DryRun {
		r.Status = statusSkipped
		r.Detail = "dry-run; pass -dry-run=false to run it"
		return r
	}

	if !opts.AssumeYes && !confirm(a.Check+" in "+a.Path) {
		r.Status = statusSkipped
		r.Detail = "declined"
		return r
	}

	fields := strings.Fields(a.Check)
	cmd := exec.Command(fields[0], fields[1:]...)
	cmd.Dir = a.Path
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		r.Status = statusFailed
		r.Detail = err.Error()
		return r
	}
	r.Status = statusOK
	return r
}
