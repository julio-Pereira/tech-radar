package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeManifest(t *testing.T, dir string, m Manifest) string {
	t.Helper()
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "capstones.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRun_FixtureWithAllArtifactsPresent(t *testing.T) {
	dir := t.TempDir()
	artifactPath := filepath.Join(dir, "fin-obs", "slo.yaml")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(artifactPath, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeManifest(t, dir, Manifest{Components: []Component{
		{Track: "observabilidade", Component: "fin-obs", Artifacts: []Artifact{
			{Path: artifactPath, Check: "exists"},
		}},
	}})

	var stdout, stderr bytes.Buffer
	code := run([]string{"-manifest", manifestPath}, &stdout, &stderr, strings.NewReader(""))
	if code != 0 {
		t.Errorf("exit code = %d, want 0; stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "[ok]") {
		t.Errorf("stdout missing [ok]: %s", stdout.String())
	}
}

func TestRun_FixtureWithMissingArtifactFailsNonZero(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, Manifest{Components: []Component{
		{Track: "observabilidade", Component: "fin-obs", Artifacts: []Artifact{
			{Path: filepath.Join(dir, "fin-obs", "slo.yaml"), Check: "exists"},
		}},
	}})

	var stdout, stderr bytes.Buffer
	code := run([]string{"-manifest", manifestPath}, &stdout, &stderr, strings.NewReader(""))
	if code != 1 {
		t.Errorf("exit code = %d, want 1", code)
	}
	if !strings.Contains(stdout.String(), "[MISSING]") {
		t.Errorf("stdout missing [MISSING]: %s", stdout.String())
	}
}

func TestRun_UnknownComponentFilterIsAnError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, Manifest{Components: []Component{
		{Track: "observabilidade", Component: "fin-obs"},
	}})

	var stdout, stderr bytes.Buffer
	code := run([]string{"-manifest", manifestPath, "-component", "does-not-exist"}, &stdout, &stderr, strings.NewReader(""))
	if code != 2 {
		t.Errorf("exit code = %d, want 2", code)
	}
}

func TestRun_MissingManifestFileIsAnError(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"-manifest", "/nonexistent/capstones.json"}, &stdout, &stderr, strings.NewReader(""))
	if code != 2 {
		t.Errorf("exit code = %d, want 2", code)
	}
}
