package course

import (
	"fmt"
	"math"
	"unicode/utf8"
)

// Layout mirror (C1, C4): the same grid arithmetic web/js/courses/diagram.js
// uses to place boxes, so the compiler can tell the author — before anything
// is drawn — that an edge would cut through another box, or that the drawing
// would be too wide to read without scrolling. Keep the constants in sync
// with diagram.js; diagram-real.spec.js checks the rendered result.
const (
	layoutCellWMin   = 140.0
	layoutCellWMax   = 200.0
	layoutCellH      = 48.0
	layoutNodeCharW  = 7.4
	layoutGapXMin    = 56.0
	layoutGapXMax    = 210.0
	layoutCharW      = 6.8
	layoutGapY       = 60.0
	layoutMargin     = 40.0
	layoutGroupLabel = 20.0
	layoutSeqColMin  = 150.0
	layoutSeqColMax  = 200.0
	layoutChartW     = 640.0

	// Above this natural width the drawing no longer fits the widened figure
	// on a 1280px desktop (C1).
	diagramaLarguraMax = 1100.0
)

type gridLayout struct {
	cellW, gapX float64
	maxCol      int
}

func edgeTextLen(a DiagramaAresta) int {
	n := utf8.RuneCountInString(a.Rotulo)
	if a.Estilo == "falha" || a.Estilo == "compensacao" {
		n += 2 // "✕ " / "↩ "
	}
	return n
}

func newGridLayout(d Diagrama) gridLayout {
	longest := 0
	for _, n := range d.Nos {
		longest = max(longest, utf8.RuneCountInString(n.Rotulo))
	}
	cellW := math.Max(layoutCellWMin, math.Min(layoutCellWMax, math.Ceil(float64(longest)*layoutNodeCharW+28)))
	rowOf := map[string]int{}
	for _, n := range d.Nos {
		rowOf[n.ID] = n.Row
	}
	label := 0
	for _, a := range d.Arestas {
		if a.De != a.Para && rowOf[a.De] == rowOf[a.Para] && a.Rotulo != "" {
			label = max(label, edgeTextLen(a))
		}
	}
	gapX := math.Max(layoutGapXMin, math.Min(layoutGapXMax, math.Ceil(float64(label)*layoutCharW+28)))
	maxCol := 0
	for _, n := range d.Nos {
		maxCol = max(maxCol, n.Col)
	}
	for _, g := range d.Grupos {
		maxCol = max(maxCol, g.Col+g.Cols-1)
	}
	return gridLayout{cellW: cellW, gapX: gapX, maxCol: maxCol}
}

func (l gridLayout) center(col, row float64) (float64, float64) {
	x := layoutMargin + col*(l.cellW+l.gapX) + l.cellW/2
	y := layoutMargin + layoutGroupLabel + row*(layoutCellH+layoutGapY) + layoutCellH/2
	return x, y
}

// diagramaLarguraNatural is the drawing's width at 100% (before the viewBox
// grows to fit labels that stick out, which is a few pixels at most).
func diagramaLarguraNatural(d Diagrama) float64 {
	switch d.Tipo {
	case "sequencia":
		return 2*layoutMargin + float64(len(d.Participantes))*seqCol(d)
	case "grafico":
		return layoutChartW
	}
	l := newGridLayout(d)
	return layoutMargin + float64(l.maxCol)*(l.cellW+l.gapX) + l.cellW + layoutMargin
}

// edgeCrossings returns, for each edge whose straight segments (or bends,
// with via) pass through a box other than its own two ends, a message
// naming both (C4). The check runs on the same coordinates the renderer
// uses, so a diagram that compiles never shows a line over a box.
func edgeCrossings(d Diagrama) []string {
	l := newGridLayout(d)
	type box struct {
		id                     string
		x0, y0, x1, y1, cx, cy float64
	}
	var boxes []box
	byID := map[string]box{}
	for _, n := range d.Nos {
		cx, cy := l.center(float64(n.Col), float64(n.Row))
		b := box{n.ID, cx - l.cellW/2, cy - layoutCellH/2, cx + l.cellW/2, cy + layoutCellH/2, cx, cy}
		boxes = append(boxes, b)
		byID[n.ID] = b
	}
	var out []string
	for _, a := range d.Arestas {
		if a.De == a.Para {
			continue
		}
		from, to := byID[a.De], byID[a.Para]
		pts := [][2]float64{{from.cx, from.cy}}
		for _, v := range a.Via {
			x, y := l.center(v.Col, v.Row)
			pts = append(pts, [2]float64{x, y})
		}
		pts = append(pts, [2]float64{to.cx, to.cy})
	boxes:
		for _, b := range boxes {
			if b.id == a.De || b.id == a.Para {
				continue
			}
			for i := 0; i+1 < len(pts); i++ {
				// One pixel of tolerance: a line that only grazes a corner
				// does not hide any text.
				if segmentHitsBox(pts[i], pts[i+1], b.x0+1, b.y0+1, b.x1-1, b.y1-1) {
					out = append(out, fmt.Sprintf("aresta %s→%s atravessa %q: mude a posição ou declare via: [{col, row}] para desviar", a.De, a.Para, b.id))
					continue boxes
				}
			}
		}
	}
	return out
}

// segmentHitsBox is Liang–Barsky clipping: does the segment p→q enter the
// axis-aligned box?
func segmentHitsBox(p, q [2]float64, x0, y0, x1, y1 float64) bool {
	dx, dy := q[0]-p[0], q[1]-p[1]
	t0, t1 := 0.0, 1.0
	for _, c := range [][2]float64{{-dx, p[0] - x0}, {dx, x1 - p[0]}, {-dy, p[1] - y0}, {dy, y1 - p[1]}} {
		pk, qk := c[0], c[1]
		if pk == 0 {
			if qk < 0 {
				return false
			}
			continue
		}
		r := qk / pk
		if pk < 0 {
			t0 = math.Max(t0, r)
		} else {
			t1 = math.Min(t1, r)
		}
		if t0 > t1 {
			return false
		}
	}
	return true
}

// seqCol is the distance between lifelines: as wide as the longest
// participant or message label needs, between 150 and 200px.
func seqCol(d Diagrama) float64 {
	part, msg := 0, 0
	for _, p := range d.Participantes {
		part = max(part, utf8.RuneCountInString(p.Rotulo))
	}
	for _, m := range d.Mensagens {
		msg = max(msg, utf8.RuneCountInString(m.Rotulo))
	}
	need := math.Max(float64(part)*layoutNodeCharW+40, float64(msg)*layoutCharW+24)
	return math.Max(layoutSeqColMin, math.Min(layoutSeqColMax, math.Ceil(need)))
}
