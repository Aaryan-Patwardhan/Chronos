// Chronos ranking — a scaled-down version of the 4-stage pipeline in Meta's
// "Scaling the Instagram Explore recommendations system" (2023):
//   1 retrieval (several candidate sources) → 2 first-stage ranking (cheap,
//   keep ~100) → 3 value model (predicted engagement × weights) → 4 final
//   rerank with rules (e.g. never the same author twice in a row).
// The predictions are transparent formulas from features, not a trained
// model. Pure functions only: no network or database code in this file.

export type Surface = 'feed' | 'explore' | 'reels'
export const SURFACES: Surface[] = ['feed', 'explore', 'reels']
export type Source = 'following' | 'similar' | 'trending' | 'fresh'

export type Weights = {
  like: number
  comment: number
  save: number
  seeLess: number
  following: number
  similar: number
  trending: number
  fresh: number
}

export const DEFAULT_WEIGHTS: Weights = {
  like: 1,
  comment: 0.6,
  save: 0.8,
  seeLess: 1.5,
  following: 1,
  similar: 0.8,
  trending: 0.5,
  fresh: 0.3,
}

export const WEIGHT_MAX = 3

export type Candidate = {
  id: string
  author_id: string
  tags: string[]
  like_count: number
  comment_count: number
  report_count: number
  created_at: string
  sources: Source[]
}

export type Signals = {
  me: string
  following: Set<string>
  /** How much I engaged with each author / tag (likes = 1, saves = 1.5). */
  authorAffinity: Map<string, number>
  tagAffinity: Map<string, number>
  /** Authors / tags of posts I marked "see less". */
  seeLessAuthors: Map<string, number>
  seeLessTags: Map<string, number>
  /** Posts never to show: my "see less" and my reports. */
  hidden: Set<string>
}

export type Trace = {
  surface: Surface
  sources: Source[]
  firstStage: { score: number; kept: number; of: number }
  features: { authorAffinity: number; tagAffinity: number; popularity: number; ageHours: number; following: boolean; seeLessSimilarity: number }
  predictions: { like: number; comment: number; save: number; seeLess: number }
  weights: Weights
  value: number
  rules: string[]
  scoreRank: number
  finalPosition: number
}

export const FIRST_STAGE_KEEP = 100
export const MAX_RESULTS = 60
const REPORT_THRESHOLD = 2
const FRESH_HOURS = 6

const round = (n: number) => Math.round(n * 1000) / 1000
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Accepts user input and returns safe weights (each 0..WEIGHT_MAX). */
export function cleanWeights(input: unknown): Weights {
  const out = { ...DEFAULT_WEIGHTS }
  if (input && typeof input === 'object') {
    for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) {
      const v = Number((input as Record<string, unknown>)[key])
      if (Number.isFinite(v)) out[key] = Math.max(0, Math.min(WEIGHT_MAX, v))
    }
  }
  return out
}

/** Merges candidates from several sources; a post found twice keeps both sources. */
export function mergeSources(lists: [Source, Omit<Candidate, 'sources'>[]][]): Candidate[] {
  const byId = new Map<string, Candidate>()
  for (const [source, rows] of lists) {
    for (const row of rows) {
      const existing = byId.get(row.id)
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source)
      } else {
        byId.set(row.id, { ...row, tags: row.tags ?? [], sources: [source] })
      }
    }
  }
  return [...byId.values()]
}

type Scored = { c: Candidate; trace: Trace }

export function rank(
  candidates: Candidate[],
  signals: Signals,
  weights: Weights,
  surface: Surface,
  now = Date.now(),
): { ordered: Candidate[]; traces: Map<string, Trace> } {
  const ageHours = (c: Candidate) => Math.max(0, (now - new Date(c.created_at).getTime()) / 3_600_000)
  const recency = (c: Candidate) => Math.exp(-ageHours(c) / 48)

  // ── Stage 2: first-stage ranking (cheap) ─────────────────────────────
  const eligible = candidates.filter((c) => c.author_id !== signals.me && !signals.hidden.has(c.id))
  const cheap = (c: Candidate) => c.sources.reduce((s, src) => s + weights[src], 0) + 0.5 * recency(c)
  const firstStage = eligible
    .map((c) => ({ c, score: cheap(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, FIRST_STAGE_KEEP)

  // ── Stage 3: value model ─────────────────────────────────────────────
  const maxLikes = Math.max(1, ...firstStage.map(({ c }) => c.like_count))
  const scored: Scored[] = firstStage.map(({ c, score }) => {
    const authorAffinity = clamp01((signals.authorAffinity.get(c.author_id) ?? 0) / 3)
    const tagAffinity = clamp01(Math.max(0, ...c.tags.map((t) => (signals.tagAffinity.get(t) ?? 0) / 5)))
    const popularity = Math.log1p(c.like_count) / Math.log1p(maxLikes)
    const r = recency(c)
    const following = signals.following.has(c.author_id)
    const seeLessSimilarity = clamp01(Math.max(
      signals.seeLessAuthors.get(c.author_id) ?? 0,
      ...c.tags.map((t) => (signals.seeLessTags.get(t) ?? 0) / 2),
    ))
    const f = following ? 1 : 0

    const predictions = {
      like: sigmoid(-2 + 2.2 * authorAffinity + 1.8 * tagAffinity + 1.2 * popularity + 0.8 * r + 0.8 * f),
      comment: sigmoid(-3 + 2.5 * authorAffinity + 1.0 * f + 0.6 * tagAffinity),
      save: sigmoid(-2.5 + 2.4 * tagAffinity + 0.8 * popularity),
      seeLess: sigmoid(-3 + 4 * seeLessSimilarity - 1 * tagAffinity),
    }
    const value =
      weights.like * predictions.like +
      weights.comment * predictions.comment +
      weights.save * predictions.save -
      weights.seeLess * predictions.seeLess +
      weights.fresh * r

    return {
      c,
      trace: {
        surface,
        sources: c.sources,
        firstStage: { score: round(score), kept: firstStage.length, of: eligible.length },
        features: {
          authorAffinity: round(authorAffinity),
          tagAffinity: round(tagAffinity),
          popularity: round(popularity),
          ageHours: Math.round(ageHours(c)),
          following,
          seeLessSimilarity: round(seeLessSimilarity),
        },
        predictions: {
          like: round(predictions.like),
          comment: round(predictions.comment),
          save: round(predictions.save),
          seeLess: round(predictions.seeLess),
        },
        weights,
        value: round(value),
        rules: [],
        scoreRank: 0,
        finalPosition: 0,
      },
    }
  })

  // ── Stage 4: final rerank with rules ─────────────────────────────────
  for (const s of scored) {
    if (s.c.report_count >= REPORT_THRESHOLD) {
      s.trace.value = round(s.trace.value * 0.3)
      s.trace.rules.push(`Moved down: reported by ${s.c.report_count} people`)
    }
    if (ageHours(s.c) < FRESH_HOURS) {
      s.trace.value = round(s.trace.value + 0.15)
      s.trace.rules.push(`Boosted: posted less than ${FRESH_HOURS} hours ago`)
    }
  }
  const byValue = [...scored].sort((a, b) => b.trace.value - a.trace.value)
  byValue.forEach((s, i) => (s.trace.scoreRank = i + 1))

  const ordered: Scored[] = []
  const remaining = [...byValue]
  while (remaining.length && ordered.length < MAX_RESULTS) {
    const prev = ordered[ordered.length - 1]
    const prev2 = ordered[ordered.length - 2]
    const blockedReason = (s: Scored): string | null => {
      if (prev && s.c.author_id === prev.c.author_id) return 'Moved down: same author as the post above it'
      const tag = s.c.tags[0]
      if (tag && prev && prev2 && prev.c.tags[0] === tag && prev2.c.tags[0] === tag) {
        return `Moved down: would be the 3rd #${tag} post in a row`
      }
      return null
    }
    let index = remaining.findIndex((s) => blockedReason(s) === null)
    if (index === -1) index = 0
    for (let i = 0; i < index; i++) {
      const reason = blockedReason(remaining[i])
      if (reason && !remaining[i].trace.rules.includes(reason)) remaining[i].trace.rules.push(reason)
    }
    ordered.push(remaining.splice(index, 1)[0])
  }

  const traces = new Map<string, Trace>()
  ordered.forEach((s, i) => {
    s.trace.finalPosition = i + 1
    traces.set(s.c.id, s.trace)
  })
  return { ordered: ordered.map((s) => s.c), traces }
}
