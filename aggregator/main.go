package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/julio-pereira/tech-radar/internal/fetch"
	"github.com/julio-pereira/tech-radar/internal/model"
	"github.com/julio-pereira/tech-radar/internal/normalize"
	"golang.org/x/sync/errgroup"
	"gopkg.in/yaml.v3"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("aggregator: %v", err)
	}
}

func run() error {
	configPath := envOrDefault("SOURCES_FILE", "sources.yaml")
	outputPath := envOrDefault("OUTPUT_FILE", filepath.Join("..", "web", "data", "feed.json"))

	cfg, err := loadConfig(configPath)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	timeout := time.Duration(cfg.Settings.FetchTimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 15 * time.Second
	}

	client := &http.Client{Timeout: timeout}
	ctx := context.Background()

	results := fetchAll(ctx, client, cfg)

	var allItems []model.FeedItem
	activeSources := make([]model.Source, 0, len(cfg.Sources))
	failCount := 0

	for _, r := range results {
		if r.Err != nil {
			log.Printf("WARN source %s failed: %v", r.Source.ID, r.Err)
			failCount++
			continue
		}
		allItems = append(allItems, r.Items...)
		activeSources = append(activeSources, r.Source)
	}

	if failCount == len(cfg.Sources) {
		return fmt.Errorf("all %d sources failed", failCount)
	}

	maxPerSource := cfg.Settings.MaxItemsPerSource
	if maxPerSource == 0 {
		maxPerSource = 20
	}
	maxTotal := cfg.Settings.MaxTotalItems
	if maxTotal == 0 {
		maxTotal = 200
	}

	processed := normalize.Process(allItems, maxPerSource, maxTotal)

	feed := model.Feed{
		GeneratedAt: time.Now().UTC(),
		Sources:     activeSources,
		Items:       processed,
	}

	return writeFeed(outputPath, feed)
}

func fetchAll(ctx context.Context, client *http.Client, cfg *model.Config) []fetch.Result {
	results := make([]fetch.Result, len(cfg.Sources))
	g, ctx := errgroup.WithContext(ctx)

	for i, src := range cfg.Sources {
		i, src := i, src
		g.Go(func() error {
			results[i] = fetch.FetchSource(ctx, client, cfg.Settings.UserAgent, src)
			return nil // errors are captured in Result.Err, not propagated
		})
	}

	_ = g.Wait()
	return results
}

func loadConfig(path string) (*model.Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg model.Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func writeFeed(path string, feed model.Feed) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(feed, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	log.Printf("wrote %d items from %d sources to %s", len(feed.Items), len(feed.Sources), path)
	return nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
