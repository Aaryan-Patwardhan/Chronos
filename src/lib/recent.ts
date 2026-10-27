// Recent searches, kept only on this device (per account).
export type Recent = { kind: 'user'; username: string; avatar_url: string } | { kind: 'tag'; tag: string }

const key = (me: string) => `chronos:recent-search:${me}`
const same = (a: Recent, b: Recent) =>
  a.kind === b.kind && (a.kind === 'user' ? a.username === (b as typeof a).username : a.tag === (b as { tag: string }).tag)

export function loadRecent(me: string): Recent[] {
  try { return JSON.parse(localStorage.getItem(key(me)) ?? '[]') as Recent[] } catch { return [] }
}
export function addRecent(me: string, item: Recent): Recent[] {
  const next = [item, ...loadRecent(me).filter((r) => !same(r, item))].slice(0, 8)
  try { localStorage.setItem(key(me), JSON.stringify(next)) } catch { /* storage blocked */ }
  return next
}
export function clearRecent(me: string): Recent[] {
  try { localStorage.removeItem(key(me)) } catch { /* storage blocked */ }
  return []
}
