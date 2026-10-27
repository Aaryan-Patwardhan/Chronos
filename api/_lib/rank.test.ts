import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, cleanWeights, mergeSources, rank, type Candidate, type Signals } from './rank'

const now = Date.parse('2026-10-27T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

const signals = (over: Partial<Signals> = {}): Signals => ({
  me: 'me',
  following: new Set(),
  authorAffinity: new Map(),
  tagAffinity: new Map(),
  seeLessAuthors: new Map(),
  seeLessTags: new Map(),
  hidden: new Set(),
  ...over,
})

const post = (id: string, author: string, tags: string[], extra: Partial<Candidate> = {}): Candidate => ({
  id, author_id: author, tags, like_count: 10, comment_count: 0, report_count: 0,
  created_at: hoursAgo(24), sources: ['trending'], ...extra,
})

describe('rank', () => {
  it('never shows the same author twice in a row when another post is available', () => {
    const cands = [post('a1', 'alice', ['food']), post('a2', 'alice', ['food']), post('b1', 'bob', ['tech'])]
    const { ordered, traces } = rank(cands, signals(), DEFAULT_WEIGHTS, 'feed', now)
    for (let i = 1; i < ordered.length - 1; i++) expect(ordered[i].author_id).not.toBe(ordered[i - 1].author_id)
    const moved = [...traces.values()].flatMap((t) => t.rules)
    expect(moved).toContain('Moved down: same author as the post above it')
  })

  it('never shows the same main tag three times in a row when another is available', () => {
    const cands = ['a', 'b', 'c'].map((a) => post(`${a}`, a, ['food'], { like_count: 50 }))
    cands.push(post('d', 'd', ['travel'], { like_count: 1 }))
    const { ordered } = rank(cands, signals(), DEFAULT_WEIGHTS, 'feed', now)
    expect(ordered.slice(0, 3).every((c) => c.tags[0] === 'food')).toBe(false)
  })

  it('removes my own posts and posts I marked "see less"', () => {
    const cands = [post('mine', 'me', ['x']), post('hid', 'bob', ['x']), post('ok', 'carol', ['x'])]
    const { ordered } = rank(cands, signals({ hidden: new Set(['hid']) }), DEFAULT_WEIGHTS, 'feed', now)
    expect(ordered.map((c) => c.id)).toEqual(['ok'])
  })

  it('moves heavily reported posts down and explains why', () => {
    const cands = [post('bad', 'bob', ['x'], { report_count: 3, like_count: 99 }), post('good', 'carol', ['y'])]
    const { ordered, traces } = rank(cands, signals(), DEFAULT_WEIGHTS, 'feed', now)
    expect(ordered[0].id).toBe('good')
    expect(traces.get('bad')!.rules[0]).toMatch(/reported by 3 people/)
  })

  it('ranks posts from tags I engage with higher', () => {
    const cands = [post('food', 'a', ['food']), post('tech', 'b', ['tech'])]
    const { ordered } = rank(cands, signals({ tagAffinity: new Map([['tech', 5]]) }), DEFAULT_WEIGHTS, 'feed', now)
    expect(ordered[0].id).toBe('tech')
  })
})

describe('helpers', () => {
  it('cleanWeights clamps and ignores junk', () => {
    expect(cleanWeights({ like: 99, save: -4, comment: 'x' })).toMatchObject({ like: 3, save: 0, comment: DEFAULT_WEIGHTS.comment })
  })

  it('mergeSources keeps every source that found a post', () => {
    const row = { id: 'p', author_id: 'a', tags: [], like_count: 0, comment_count: 0, report_count: 0, created_at: hoursAgo(1) }
    const [merged] = mergeSources([['following', [row]], ['trending', [row]]])
    expect(merged.sources).toEqual(['following', 'trending'])
  })
})
