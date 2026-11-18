package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/julio-pereira/tech-radar/internal/fetch"
	"github.com/julio-pereira/tech-radar/internal/model"
	"github.com/julio-pereira/tech-radar/internal/normalize"
)

const (
	// maxCacheAge is the oldest cache a failing source may fall back to. Past
	// it, the source is left out of the radar instead of showing weeks-old
	// items under a fresh "updated" date.
	maxCacheAge = 14 * 24 * time.Hour
	// maxDiscardsLogged caps the WARN lines per source and build.
	maxDiscardsLogged = 5
)

// cacheFile is one source's last good fetch, already filtered.
type cacheFile struct {
	SavedAt time.Time        `json:"savedAt"`
	Items   []model.FeedItem `json:"items"`
}

// collect turns the fetch results into the feed's items and active sources.
//
// A fetched source has its items filtered (normalize.Filter). If more than
// half of them are discarded, the feed looks compromised or broken: the build
// keeps the source's previous cache and does not overwrite it. A failed or
// anomalous source falls back to its cache only if the cache is at most
// maxCacheAge old, and the cached items go through the filter again, since
// they may predate a rule. failed counts the sources left out.
func collect(results []fetch.Result, cacheDir string, now time.Time) (items []model.FeedItem, active []model.Source, failed int) {
	for _, r := range results {
		src := r.Source
		if r.Err == nil {
			kept, dropped := normalize.Filter(src, r.Items, now)
			logDiscards(src.ID, dropped)
			if !anomalous(len(r.Items), len(dropped)) {
				if err := saveCache(cacheDir, src.ID, kept, now); err != nil {
					log.Printf("WARN could not save cache for %s: %v", src.ID, err)
				}
				items = append(items, kept...)
				active = append(active, src)
				continue
			}
			log.Printf("WARN source %s: %d of %d items discarded (more than half) — keeping the previous cache, not overwriting it",
				src.ID, len(dropped), len(r.Items))
		} else {
			log.Printf("WARN source %s failed: %v — trying cache", src.ID, r.Err)
		}

		cached, err := loadCache(cacheDir, src.ID, now)
		if err != nil {
			log.Printf("WARN no usable cache for %s: %v — source left out of this build", src.ID, err)
			failed++
			continue
		}
		kept, dropped := normalize.Filter(src, cached, now)
		logDiscards(src.ID+" (cache)", dropped)
		log.Printf("INFO using %d cached items for %s", len(kept), src.ID)
		items = append(items, kept...)
		active = append(active, src)
	}
	return items, active, failed
}

// withSeriesSources keeps in the active list every source that owns a
// curated series, even when the source itself was left out of this build (a
// stale cache): the series are hand-picked links, not feed items, and without
// the source in the list the radar has no chip to filter them by.
func withSeriesSources(active, all []model.Source, series []model.FeedItem) []model.Source {
	seen := make(map[string]bool, len(active))
	for _, s := range active {
		seen[s.ID] = true
	}
	for _, it := range series {
		if seen[it.SourceID] {
			continue
		}
		for _, s := range all {
			if s.ID == it.SourceID {
				active = append(active, s)
				seen[s.ID] = true
				log.Printf("INFO source %s kept in the list for its curated series only", s.ID)
				break
			}
		}
	}
	return active
}

// anomalous reports whether more than half of a fetch was discarded.
func anomalous(total, dropped int) bool {
	return total > 0 && dropped*2 > total
}

func logDiscards(sourceID string, dropped []normalize.Discard) {
	for i, d := range dropped {
		if i == maxDiscardsLogged {
			log.Printf("WARN source %s: %d more items discarded", sourceID, len(dropped)-i)
			return
		}
		log.Printf("WARN source %s: item discarded (%s): %q", sourceID, d.Reason, d.URL)
	}
}

func saveCache(dir, sourceID string, items []model.FeedItem, now time.Time) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cacheFile{SavedAt: now.UTC(), Items: items}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, sourceID+".json"), data, 0o644)
}

// loadCache returns a source's cached items if the cache is recent enough. A
// cache in the old format (a bare list, with no date) counts as too old.
func loadCache(dir, sourceID string, now time.Time) ([]model.FeedItem, error) {
	data, err := os.ReadFile(filepath.Join(dir, sourceID+".json"))
	if err != nil {
		return nil, err
	}
	var c cacheFile
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("cache without a date (old format): %w", err)
	}
	if c.SavedAt.IsZero() {
		return nil, fmt.Errorf("cache without a date")
	}
	if age := now.Sub(c.SavedAt); age > maxCacheAge {
		return nil, fmt.Errorf("cache is %.0f days old (max %.0f)", age.Hours()/24, maxCacheAge.Hours()/24)
	}
	return c.Items, nil
}
