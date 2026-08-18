package course

import (
	"hash/fnv"
	"math/rand"
)

// shuffleOptions reorders a question's options deterministically and moves
// Answer to wherever the correct option landed.
//
// It exists to kill positional bias at the source: an author writing four
// questions in a row naturally drifts towards a favourite index, and a reader
// who notices can score without reading the milestone. Shuffling at build time
// makes the source index irrelevant, so authoring stops carrying that burden.
//
// The seed is derived from the content itself, so the same quiz always compiles
// to the same order — the JSON diffs cleanly and a reader who reloads the page
// does not see the options jump around.
func shuffleOptions(seed string, q *QuizQuestion) {
	if len(q.Options) < 2 || q.Answer < 0 || q.Answer >= len(q.Options) {
		return
	}

	h := fnv.New64a()
	h.Write([]byte(seed))
	rng := rand.New(rand.NewSource(int64(h.Sum64())))

	correct := q.Options[q.Answer]
	rng.Shuffle(len(q.Options), func(i, j int) {
		q.Options[i], q.Options[j] = q.Options[j], q.Options[i]
	})

	for i, o := range q.Options {
		if o == correct {
			q.Answer = i
			break
		}
	}
}
