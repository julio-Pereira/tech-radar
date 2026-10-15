package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// Artifact and Component mirror the shape of web/data/capstones.json from
// the tech-radar aggregator (internal/course/model.go's CapstoneArtifact /
// CompiledCapstone) — duplicated here, not imported, because fin-check is
// meant to be copied into and run against the reader's own fin-platform
// repo, with no dependency on the tech-radar module.
type Artifact struct {
	Path  string `json:"path"`
	Check string `json:"check"`
}

type Component struct {
	Track      string     `json:"track"`
	TrackTitle string     `json:"trackTitle"`
	Component  string     `json:"component"`
	DependsOn  []string   `json:"dependsOn"`
	Artifacts  []Artifact `json:"artifacts"`
}

type Manifest struct {
	GeneratedAt string      `json:"generatedAt"`
	Components  []Component `json:"components"`
}

func loadManifest(path string) (Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("read manifest %s: %w", path, err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest %s: %w", path, err)
	}
	return m, nil
}
