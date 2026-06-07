package fetch

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/julio-pereira/tech-radar/internal/model"
	"github.com/mmcdole/gofeed"
)

type Result struct {
	Source model.Source
	Items  []model.FeedItem
	Err    error
}

func FetchSource(ctx context.Context, client *http.Client, userAgent string, src model.Source) Result {
	raw, err := fetchURL(ctx, client, userAgent, src.URL)
	if err != nil {
		return Result{Source: src, Err: fmt.Errorf("fetch %s: %w", src.ID, err)}
	}

	items, err := parse(src, raw)
	if err != nil {
		return Result{Source: src, Err: fmt.Errorf("parse %s: %w", src.ID, err)}
	}

	log.Printf("fetched %s: %d items", src.ID, len(items))
	return Result{Source: src, Items: items}
}

func fetchURL(ctx context.Context, client *http.Client, userAgent, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MB cap
}

func parse(src model.Source, data []byte) ([]model.FeedItem, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseString(string(data))
	if err != nil {
		return nil, err
	}

	items := make([]model.FeedItem, 0, len(feed.Items))
	for _, entry := range feed.Items {
		item := toFeedItem(src, entry)
		if item.URL == "" {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

func toFeedItem(src model.Source, entry *gofeed.Item) model.FeedItem {
	published := resolvePublished(entry)
	link := resolveLink(entry)
	id := resolveID(entry, link)
	summary := resolveSummary(entry)
	author := resolveAuthor(entry)

	return model.FeedItem{
		ID:          id,
		Title:       strings.TrimSpace(entry.Title),
		URL:         link,
		SourceID:    src.ID,
		SourceName:  src.Name,
		Category:    src.Category,
		PublishedAt: published,
		Summary:     summary,
		Author:      author,
	}
}

func resolvePublished(entry *gofeed.Item) time.Time {
	if entry.PublishedParsed != nil {
		return *entry.PublishedParsed
	}
	if entry.UpdatedParsed != nil {
		return *entry.UpdatedParsed
	}
	return time.Now()
}

func resolveLink(entry *gofeed.Item) string {
	if entry.Link != "" {
		return entry.Link
	}
	for _, l := range entry.Links {
		if l != "" {
			return l
		}
	}
	return ""
}

func resolveID(entry *gofeed.Item, link string) string {
	if entry.GUID != "" {
		return entry.GUID
	}
	return link
}

func resolveSummary(entry *gofeed.Item) string {
	text := entry.Description
	if text == "" {
		text = entry.Content
	}
	// Strip HTML tags — sanitization happens in normalize package
	return text
}

func resolveAuthor(entry *gofeed.Item) string {
	if entry.Author != nil && entry.Author.Name != "" {
		return entry.Author.Name
	}
	if len(entry.Authors) > 0 && entry.Authors[0].Name != "" {
		return entry.Authors[0].Name
	}
	return ""
}
