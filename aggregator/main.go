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
	cacheDir := envOrDefault("CACHE_DIR", "cache")

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
			log.Printf("WARN source %s failed: %v — trying cache", r.Source.ID, r.Err)
			cached, cerr := loadCache(cacheDir, r.Source.ID)
			if cerr != nil {
				log.Printf("WARN no cache for %s: %v", r.Source.ID, cerr)
				failCount++
				continue
			}
			log.Printf("INFO using %d cached items for %s", len(cached), r.Source.ID)
			allItems = append(allItems, cached...)
			activeSources = append(activeSources, r.Source)
			continue
		}
		if err := saveCache(cacheDir, r.Source.ID, r.Items); err != nil {
			log.Printf("WARN could not save cache for %s: %v", r.Source.ID, err)
		}
		allItems = append(allItems, r.Items...)
		activeSources = append(activeSources, r.Source)
	}

	if failCount == len(cfg.Sources) {
		return fmt.Errorf("all %d sources failed with no cache fallback", failCount)
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
			return nil // errors captured in Result.Err, not propagated
		})
	}

	_ = g.Wait()
	return results
}

func saveCache(dir, sourceID string, items []model.FeedItem) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, sourceID+".json"), data, 0o644)
}

func loadCache(dir, sourceID string) ([]model.FeedItem, error) {
	data, err := os.ReadFile(filepath.Join(dir, sourceID+".json"))
	if err != nil {
		return nil, err
	}
	var items []model.FeedItem
	return items, json.Unmarshal(data, &items)
}

func loadConfig(path string) (*model.Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg model.Config
	return &cfg, yaml.Unmarshal(data, &cfg)
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
