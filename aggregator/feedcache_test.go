package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/julio-pereira/tech-radar/internal/fetch"
	"github.com/julio-pereira/tech-radar/internal/model"
)

var agora = time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

var fonteTeste = model.Source{ID: "f", Name: "F", URL: "https://feed.exemplo.com.br/rss", AllowedHosts: []string{"radar.exemplo.com.br"}}

func bom(n int) model.FeedItem {
	return model.FeedItem{ID: fmt.Sprint("bom-", n), URL: fmt.Sprintf("https://radar.exemplo.com.br/%d", n), PublishedAt: agora.Add(-time.Hour)}
}

func ruim(n int) model.FeedItem {
	return model.FeedItem{ID: fmt.Sprint("ruim-", n), URL: fmt.Sprintf("https://phishing.example/%d", n), PublishedAt: agora.Add(-time.Hour)}
}

func gravarCache(t *testing.T, dir string, savedAt time.Time, items ...model.FeedItem) {
	t.Helper()
	if err := saveCache(dir, fonteTeste.ID, items, savedAt); err != nil {
		t.Fatal(err)
	}
}

func lerCache(t *testing.T, dir string) cacheFile {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, fonteTeste.ID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var c cacheFile
	if err := json.Unmarshal(data, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func urls(items []model.FeedItem) string {
	var out []string
	for _, it := range items {
		out = append(out, it.URL)
	}
	return strings.Join(out, " ")
}

func TestCollectFonteNormalGravaOCacheFiltrado(t *testing.T) {
	dir := t.TempDir()
	r := fetch.Result{Source: fonteTeste, Items: []model.FeedItem{bom(1), bom(2), ruim(1)}} // 1 de 3: não é anomalia
	items, active, failed := collect([]fetch.Result{r}, dir, agora)
	if failed != 0 || len(active) != 1 || urls(items) != urls([]model.FeedItem{bom(1), bom(2)}) {
		t.Fatalf("items=%s active=%d failed=%d", urls(items), len(active), failed)
	}
	c := lerCache(t, dir)
	if !c.SavedAt.Equal(agora) || urls(c.Items) != urls(items) {
		t.Fatalf("cache = %v %s", c.SavedAt, urls(c.Items))
	}
}

// O alarme de anomalia: mais da metade descartada mantém o cache anterior e não o sobrescreve.
func TestCollectAnomaliaMantemOCacheAnterior(t *testing.T) {
	dir := t.TempDir()
	ontem := agora.Add(-24 * time.Hour)
	gravarCache(t, dir, ontem, bom(1), bom(2))
	r := fetch.Result{Source: fonteTeste, Items: []model.FeedItem{bom(3), ruim(1), ruim(2)}} // 2 de 3
	items, active, failed := collect([]fetch.Result{r}, dir, agora)
	if failed != 0 || len(active) != 1 || urls(items) != urls([]model.FeedItem{bom(1), bom(2)}) {
		t.Fatalf("items=%s active=%d failed=%d", urls(items), len(active), failed)
	}
	if c := lerCache(t, dir); !c.SavedAt.Equal(ontem) || urls(c.Items) != urls([]model.FeedItem{bom(1), bom(2)}) {
		t.Fatalf("a anomalia sobrescreveu o cache: %v %s", c.SavedAt, urls(c.Items))
	}
}

func TestCollectAnomaliaSemCacheDeixaAFonteDeFora(t *testing.T) {
	r := fetch.Result{Source: fonteTeste, Items: []model.FeedItem{ruim(1), ruim(2), bom(1)}}
	items, active, failed := collect([]fetch.Result{r}, t.TempDir(), agora)
	if failed != 1 || len(active) != 0 || len(items) != 0 {
		t.Fatalf("items=%s active=%d failed=%d", urls(items), len(active), failed)
	}
}

func TestCollectMetadeExataNaoEAnomalia(t *testing.T) {
	r := fetch.Result{Source: fonteTeste, Items: []model.FeedItem{bom(1), ruim(1)}}
	items, _, _ := collect([]fetch.Result{r}, t.TempDir(), agora)
	if urls(items) != urls([]model.FeedItem{bom(1)}) {
		t.Fatalf("items=%s", urls(items))
	}
}

func TestCollectFonteComFalhaUsaSoCacheRecente(t *testing.T) {
	falha := fetch.Result{Source: fonteTeste, Err: errors.New("HTTP 503")}
	casos := []struct {
		nome  string
		idade time.Duration
		usado bool
	}{
		{"1 dia", 24 * time.Hour, true},
		{"14 dias", 14 * 24 * time.Hour, true},
		{"15 dias", 15 * 24 * time.Hour, false},
	}
	for _, c := range casos {
		dir := t.TempDir()
		gravarCache(t, dir, agora.Add(-c.idade), bom(1))
		items, _, failed := collect([]fetch.Result{falha}, dir, agora)
		if c.usado != (len(items) == 1) || c.usado != (failed == 0) {
			t.Errorf("cache de %s: items=%d failed=%d", c.nome, len(items), failed)
		}
	}
}

func TestCollectCacheNoFormatoAntigoNaoEUsado(t *testing.T) {
	dir := t.TempDir()
	antigo, _ := json.Marshal([]model.FeedItem{bom(1)}) // lista solta, sem data: o cache versionado até out 2026
	if err := os.WriteFile(filepath.Join(dir, fonteTeste.ID+".json"), antigo, 0o644); err != nil {
		t.Fatal(err)
	}
	items, _, failed := collect([]fetch.Result{{Source: fonteTeste, Err: errors.New("timeout")}}, dir, agora)
	if failed != 1 || len(items) != 0 {
		t.Fatalf("items=%d failed=%d", len(items), failed)
	}
}

func TestCollectFiltraDeNovoOsItensDoCache(t *testing.T) {
	dir := t.TempDir()
	gravarCache(t, dir, agora.Add(-time.Hour), bom(1), model.FeedItem{URL: "javascript:alert(1)", PublishedAt: agora})
	items, _, _ := collect([]fetch.Result{{Source: fonteTeste, Err: errors.New("timeout")}}, dir, agora)
	if urls(items) != urls([]model.FeedItem{bom(1)}) {
		t.Fatalf("items=%s", urls(items))
	}
}

// Aceite da Fase 3: o feed malicioso entra no build inteiro (run) e nenhum item dele chega ao feed.json.
func TestBuildComFeedMalicioso(t *testing.T) {
	malicioso, err := os.ReadFile("testdata/feed-malicioso.xml")
	if err != nil {
		t.Fatal(err)
	}
	limpo := []byte(`<?xml version="1.0"?><rss version="2.0"><channel><title>limpa</title>
<item><title>Artigo limpo</title><link>https://limpa.exemplo.com.br/artigo</link><guid>limpo-1</guid>
<pubDate>Tue, 17 Nov 2026 09:00:00 +0000</pubDate></item></channel></rss>`)
	srvMal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(malicioso) }))
	defer srvMal.Close()
	srvLimpo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(limpo) }))
	defer srvLimpo.Close()

	dir := t.TempDir()
	sources := fmt.Sprintf(`settings: {max_items_per_source: 20, max_total_items: 200, fetch_timeout_seconds: 5, user_agent: teste}
sources:
  - {id: mal, name: Mal, category: X, url: %q, allowed_hosts: [radar.exemplo.com.br]}
  - {id: limpa, name: Limpa, category: X, url: %q, allowed_hosts: [limpa.exemplo.com.br]}
`, srvMal.URL, srvLimpo.URL)
	escrever := func(nome, conteudo string) string {
		p := filepath.Join(dir, nome)
		if err := os.WriteFile(p, []byte(conteudo), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	saida := filepath.Join(dir, "feed.json")
	t.Setenv("SOURCES_FILE", escrever("sources.yaml", sources))
	t.Setenv("SERIES_FILE", escrever("series.yaml", "source_id: s\nsource_name: S\nseries: []\n"))
	t.Setenv("OUTPUT_FILE", saida)
	t.Setenv("CACHE_DIR", filepath.Join(dir, "cache"))
	t.Setenv("COURSES_CONTENT_DIR", filepath.Join(dir, "sem-trilhas"))
	t.Setenv("COURSES_OUTPUT_DIR", filepath.Join(dir, "courses"))

	if err := run(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(saida)
	if err != nil {
		t.Fatal(err)
	}
	var feed model.Feed
	if err := json.Unmarshal(data, &feed); err != nil {
		t.Fatal(err)
	}
	// 10 dos 12 itens do feed malicioso caem: a fonte inteira fica de fora (não há cache anterior).
	if urls(feed.Items) != "https://limpa.exemplo.com.br/artigo" {
		t.Fatalf("feed.json tem %s", urls(feed.Items))
	}
	if len(feed.Sources) != 1 || feed.Sources[0].ID != "limpa" {
		t.Fatalf("fontes ativas = %v", feed.Sources)
	}
	if _, err := os.Stat(filepath.Join(dir, "cache", "mal.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("a fonte anômala não pode gravar cache: %v", err)
	}
	if strings.Contains(string(data), "radar.exemplo.com.br") {
		t.Fatal("um item do feed malicioso chegou ao feed.json")
	}
}

func TestFonteDasSeriesFicaNaListaMesmoForaDoBuild(t *testing.T) {
	baeldung := model.Source{ID: "baeldung", Name: "Baeldung", Category: "Java/Spring"}
	outra := model.Source{ID: "go-blog", Name: "Go Blog", Category: "Go"}
	series := []model.FeedItem{{SourceID: "baeldung", Kind: model.KindSeries}, {SourceID: "baeldung", Kind: model.KindSeries}}

	got := withSeriesSources([]model.Source{outra}, []model.Source{baeldung, outra}, series)
	if len(got) != 2 || got[1].ID != "baeldung" {
		t.Fatalf("fontes = %v", got)
	}
	// Já ativa: não duplica.
	if got := withSeriesSources([]model.Source{baeldung, outra}, []model.Source{baeldung, outra}, series); len(got) != 2 {
		t.Fatalf("duplicou: %v", got)
	}
	// Série de uma fonte que não existe no sources.yaml: não inventa fonte.
	if got := withSeriesSources(nil, []model.Source{outra}, series); len(got) != 0 {
		t.Fatalf("inventou fonte: %v", got)
	}
}
