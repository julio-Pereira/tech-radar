package normalize

import (
	"net/url"
	"strings"
	"time"

	"github.com/julio-pereira/tech-radar/internal/model"
)

// maxFutureSkew is how far ahead of the build an item's date may be. A feed
// that dates its items in the future would pin them to the top of the radar.
const maxFutureSkew = 24 * time.Hour

// Discard is one item left out of the feed, and why.
type Discard struct {
	URL    string
	Reason string
}

// Filter keeps the items a source may publish. An item is discarded when its
// link is not https, has no valid host, carries user info or a port, or points
// to a host outside the source's allowlist; and when it has no date or a date
// more than a day in the future. Series items are curated by hand and only go
// through the link check.
func Filter(src model.Source, items []model.FeedItem, now time.Time) (kept []model.FeedItem, dropped []Discard) {
	allowed := AllowedHosts(src)
	for _, it := range items {
		if reason := checkItem(it, allowed, now); reason != "" {
			dropped = append(dropped, Discard{URL: it.URL, Reason: reason})
			continue
		}
		kept = append(kept, it)
	}
	return kept, dropped
}

// FilterSeries applies the link check to the curated series, which have no
// source feed (and so no allowlist) and no date.
func FilterSeries(items []model.FeedItem) (kept []model.FeedItem, dropped []Discard) {
	for _, it := range items {
		if _, reason := safeHost(it.URL); reason != "" {
			dropped = append(dropped, Discard{URL: it.URL, Reason: reason})
			continue
		}
		kept = append(kept, it)
	}
	return kept, dropped
}

// AllowedHosts is the source's allowlist, lower-cased; when the source
// declares none, it is the host of the feed URL itself.
func AllowedHosts(src model.Source) []string {
	if len(src.AllowedHosts) > 0 {
		out := make([]string, len(src.AllowedHosts))
		for i, h := range src.AllowedHosts {
			out[i] = strings.ToLower(strings.TrimSpace(h))
		}
		return out
	}
	if u, err := url.Parse(src.URL); err == nil && u.Hostname() != "" {
		return []string{strings.ToLower(u.Hostname())}
	}
	return nil
}

func checkItem(it model.FeedItem, allowed []string, now time.Time) string {
	host, reason := safeHost(it.URL)
	if reason != "" {
		return reason
	}
	if !contains(allowed, host) {
		return "host fora da lista da fonte: " + host
	}
	if it.PublishedAt.IsZero() {
		return "item sem data"
	}
	if it.PublishedAt.After(now.Add(maxFutureSkew)) {
		return "data no futuro"
	}
	return ""
}

// safeHost returns the lower-cased host of an absolute https URL, or the
// reason the URL can't go to an href: another scheme (javascript:, data:,
// http:), a relative URL, user info, a port, or a malformed host.
func safeHost(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "sem link"
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", "link inválido"
	}
	if !strings.EqualFold(u.Scheme, "https") {
		if u.Scheme == "" {
			return "", "link relativo"
		}
		return "", "esquema não permitido: " + strings.ToLower(u.Scheme)
	}
	if u.User != nil {
		return "", "link com usuário"
	}
	if u.Port() != "" {
		return "", "link com porta"
	}
	host := strings.ToLower(u.Hostname())
	if !validHost(host) {
		return "", "host inválido"
	}
	return host, ""
}

// validHost accepts a DNS name with at least one dot: letters, digits and
// hyphens in each label, no empty label, no leading or trailing hyphen. IP
// literals and single-label names are refused: no feed links to them.
func validHost(h string) bool {
	if len(h) == 0 || len(h) > 253 || !strings.Contains(h, ".") {
		return false
	}
	for _, label := range strings.Split(h, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
				return false
			}
		}
	}
	// The top-level label is never all digits (that would be an IPv4 literal).
	tld := h[strings.LastIndex(h, ".")+1:]
	return strings.Trim(tld, "0123456789") != ""
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
