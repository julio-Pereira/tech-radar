package normalize

import (
	"crypto/sha1"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/julio-pereira/tech-radar/internal/model"
	"github.com/microcosm-cc/bluemonday"
)

const maxSummaryRunes = 300

var sanitizer = bluemonday.StrictPolicy()

func Process(items []model.FeedItem, maxPerSource, maxTotal int) []model.FeedItem {
	items = dedup(items)
	items = sanitizeAll(items)
	items = sortByDate(items)
	items = limitPerSource(items, maxPerSource)
	if len(items) > maxTotal {
		items = items[:maxTotal]
	}
	return items
}

func dedup(items []model.FeedItem) []model.FeedItem {
	seen := make(map[string]struct{}, len(items))
	out := items[:0]
	for _, item := range items {
		key := canonicalID(item)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		item.ID = key
		out = append(out, item)
	}
	return out
}

func canonicalID(item model.FeedItem) string {
	raw := item.ID
	if raw == "" {
		raw = item.URL
	}
	h := sha1.New()
	h.Write([]byte(raw))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func sanitizeAll(items []model.FeedItem) []model.FeedItem {
	for i := range items {
		items[i].Summary = truncate(sanitizer.Sanitize(items[i].Summary), maxSummaryRunes)
		items[i].Title = sanitizer.Sanitize(items[i].Title)
		items[i].Author = sanitizer.Sanitize(items[i].Author)
	}
	return items
}

func truncate(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes]) + "…"
}

func sortByDate(items []model.FeedItem) []model.FeedItem {
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].PublishedAt.After(items[j].PublishedAt)
	})
	return items
}

func limitPerSource(items []model.FeedItem, max int) []model.FeedItem {
	count := make(map[string]int)
	out := make([]model.FeedItem, 0, len(items))
	for _, item := range items {
		// Curated series are always kept — they bypass the recency cap so the
		// full set stays available for the dedicated daily card and search.
		if item.Kind == model.KindSeries {
			out = append(out, item)
			continue
		}
		if count[item.SourceID] < max {
			out = append(out, item)
			count[item.SourceID]++
		}
	}
	return out
}
