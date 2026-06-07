package model

import "time"

type Source struct {
	ID       string `yaml:"id"       json:"id"`
	Name     string `yaml:"name"     json:"name"`
	Category string `yaml:"category" json:"category"`
	URL      string `yaml:"url"      json:"-"`
}

// Kind values for FeedItem.
const (
	KindArticle = "article"
	KindSeries  = "series"
)

type FeedItem struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	URL        string    `json:"url"`
	SourceID   string    `json:"sourceId"`
	SourceName string    `json:"sourceName"`
	Category   string    `json:"category"`
	PublishedAt time.Time `json:"publishedAt"`
	Summary    string    `json:"summary"`
	Author     string    `json:"author,omitempty"`
	// Kind is "article" for normal feed entries or "series" for curated
	// evergreen guides injected from series.yaml. Empty implies "article".
	Kind string `json:"kind,omitempty"`
}

type Series struct {
	ID       string `yaml:"id"`
	Title    string `yaml:"title"`
	URL      string `yaml:"url"`
	Category string `yaml:"category"`
	Summary  string `yaml:"summary"`
}

type SeriesConfig struct {
	SourceID   string   `yaml:"source_id"`
	SourceName string   `yaml:"source_name"`
	Series     []Series `yaml:"series"`
}

type Feed struct {
	GeneratedAt time.Time  `json:"generatedAt"`
	Sources     []Source   `json:"sources"`
	Items       []FeedItem `json:"items"`
}

type Config struct {
	Settings struct {
		MaxItemsPerSource    int    `yaml:"max_items_per_source"`
		MaxTotalItems        int    `yaml:"max_total_items"`
		FetchTimeoutSeconds  int    `yaml:"fetch_timeout_seconds"`
		UserAgent            string `yaml:"user_agent"`
	} `yaml:"settings"`
	Sources []Source `yaml:"sources"`
}
