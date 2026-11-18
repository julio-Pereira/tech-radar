package normalize

import (
	"strings"
	"testing"
	"time"

	"github.com/julio-pereira/tech-radar/internal/model"
)

var agora = time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

func fonte(allowed ...string) model.Source {
	return model.Source{ID: "f", URL: "https://feed.exemplo.com.br/rss", AllowedHosts: allowed}
}

func item(url string) model.FeedItem {
	return model.FeedItem{URL: url, PublishedAt: agora.Add(-time.Hour)}
}

func TestFilterLinks(t *testing.T) {
	src := fonte("radar.exemplo.com.br")
	casos := []struct {
		url    string
		motivo string // "" = mantido
	}{
		{"https://radar.exemplo.com.br/a", ""},
		{"HTTPS://Radar.Exemplo.com.br/a", ""},
		{"  https://radar.exemplo.com.br/a  ", ""},
		{"javascript:alert(1)", "esquema não permitido: javascript"},
		{"JavaScript:alert(1)", "esquema não permitido: javascript"},
		{"data:text/html;base64,PHNjcmlwdD4=", "esquema não permitido: data"},
		{"http://radar.exemplo.com.br/a", "esquema não permitido: http"},
		{"ftp://radar.exemplo.com.br/a", "esquema não permitido: ftp"},
		{"/caminho/relativo", "link relativo"},
		{"//radar.exemplo.com.br/a", "link relativo"},
		{"", "sem link"},
		{"https://radar.exemplo.com.br@evil.example/a", "link com usuário"},
		{"https://radar.exemplo.com.br:8443/a", "link com porta"},
		{"https://203.0.113.7/a", "host inválido"},
		{"https://[2001:db8::1]/a", "host inválido"},
		{"https://localhost/a", "host inválido"},
		{"https://rаdar.exemplo.com.br/a", "host inválido"}, // "а" cirílico
		{"https://evil.radar.exemplo.com.br/a", "host fora da lista da fonte: evil.radar.exemplo.com.br"},
		{"https://exemplo.com.br/a", "host fora da lista da fonte: exemplo.com.br"},
		{"https://feed.exemplo.com.br/a", "host fora da lista da fonte: feed.exemplo.com.br"},
	}
	for _, c := range casos {
		kept, dropped := Filter(src, []model.FeedItem{item(c.url)}, agora)
		switch {
		case c.motivo == "" && len(kept) != 1:
			t.Errorf("%q: descartado (%v), devia ser mantido", c.url, dropped)
		case c.motivo != "" && (len(dropped) != 1 || dropped[0].Reason != c.motivo):
			t.Errorf("%q: kept=%d dropped=%v, quer motivo %q", c.url, len(kept), dropped, c.motivo)
		}
	}
}

func TestFilterAllowlistPadraoEOHostDoFeed(t *testing.T) {
	src := fonte() // sem allowed_hosts: vale o host do feed
	if got := AllowedHosts(src); len(got) != 1 || got[0] != "feed.exemplo.com.br" {
		t.Fatalf("AllowedHosts = %v", got)
	}
	kept, _ := Filter(src, []model.FeedItem{item("https://feed.exemplo.com.br/x"), item("https://outro.exemplo.com.br/x")}, agora)
	if len(kept) != 1 || kept[0].URL != "https://feed.exemplo.com.br/x" {
		t.Fatalf("kept = %v", kept)
	}
}

func TestFilterDatas(t *testing.T) {
	src := fonte("radar.exemplo.com.br")
	semData := model.FeedItem{URL: "https://radar.exemplo.com.br/a"}
	futuro := model.FeedItem{URL: "https://radar.exemplo.com.br/b", PublishedAt: agora.Add(25 * time.Hour)}
	amanha := model.FeedItem{URL: "https://radar.exemplo.com.br/c", PublishedAt: agora.Add(23 * time.Hour)} // fuso adiantado
	kept, dropped := Filter(src, []model.FeedItem{semData, futuro, amanha}, agora)
	if len(kept) != 1 || kept[0].URL != amanha.URL {
		t.Fatalf("kept = %v", kept)
	}
	if len(dropped) != 2 || dropped[0].Reason != "item sem data" || dropped[1].Reason != "data no futuro" {
		t.Fatalf("dropped = %v", dropped)
	}
}

func TestFilterSeries(t *testing.T) {
	kept, dropped := FilterSeries([]model.FeedItem{
		{URL: "https://www.baeldung.com/spring-tutorial", Kind: model.KindSeries},
		{URL: "javascript:alert(1)", Kind: model.KindSeries},
	})
	if len(kept) != 1 || len(dropped) != 1 || !strings.HasPrefix(dropped[0].Reason, "esquema") {
		t.Fatalf("kept=%v dropped=%v", kept, dropped)
	}
}
