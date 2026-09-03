/**
 * Observed opponent stats — VPIP / PFR / aggression factor / went-to-showdown
 * computed from the session's recorded hands (the per-hand action log plus
 * end-of-hand player status). Nothing here reads persona config: the HUD
 * shows what the bots have actually done at this table, the way a real HUD
 * would. Pure functions; no Vue.
 */
/** Structural, read-only view of a recorded hand — accepts HandRecord, the stats page's HandRow, and the readonly session. */
export interface RecordedHandLike {
  board?: string | null
  actions?: readonly string[] | null
  players?: readonly { name: string; folded: boolean; isHero?: boolean }[] | null
}

export interface ObservedPlayerStats {
  name: string
  handsPlayed: number
  vpip: number   // % of hands with a voluntary preflop call or raise
  pfr: number    // % of hands with a preflop raise
  af: number     // (bets + raises) / calls, all streets; capped at 5 with no calls
  wtsd: number   // % of flops seen that reached showdown
}

const AF_CAP = 5

/** Action lines are `${name} <verb> …`; require the verb right after the name so "Ann" never absorbs "Ann Smith raises". */
const VERBS = [' folds', ' checks', ' calls ', ' raises to ', ' goes ALL-IN ']
const actorIs = (line: string, name: string) => VERBS.some(v => line.startsWith(name + v))
const isRaise = (line: string) => line.includes(' raises to ') || line.includes(' goes ALL-IN ')
const isCall = (line: string) => line.includes(' calls ')
const isFold = (line: string) => line.endsWith(' folds')
const isFlopMarker = (line: string) => line.startsWith('--- FLOP')

/** A hand reached showdown when the board ran out and two or more players were still in. */
export function wentToShowdown(hand: { board?: string | null; players?: readonly { folded: boolean }[] | null }): boolean {
  if (!hand.board || !Array.isArray(hand.players)) return false
  const boardCards = hand.board.split(' ').filter(Boolean).length
  const unfolded = hand.players.filter(p => p && !p.folded).length
  return boardCards === 5 && unfolded >= 2
}

export function computeObservedStats(hands: readonly RecordedHandLike[]): Map<string, ObservedPlayerStats> {
  const acc = new Map<string, { hands: number; vpip: number; pfr: number; bets: number; calls: number; flops: number; showdowns: number }>()

  for (const hand of hands) {
    if (!hand || !Array.isArray(hand.players) || !Array.isArray(hand.actions)) continue
    const flopIdx = hand.actions.findIndex(isFlopMarker)
    const preflop = flopIdx >= 0 ? hand.actions.slice(0, flopIdx) : hand.actions
    const showdown = wentToShowdown(hand)

    for (const p of hand.players) {
      if (!p || p.isHero || typeof p.name !== 'string') continue
      const a = acc.get(p.name) ?? { hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, flops: 0, showdowns: 0 }
      a.hands++
      const mine = hand.actions.filter(l => actorIs(l, p.name))
      const minePreflop = preflop.filter(l => actorIs(l, p.name))
      if (minePreflop.some(l => isCall(l) || isRaise(l))) a.vpip++
      if (minePreflop.some(isRaise)) a.pfr++
      a.bets += mine.filter(isRaise).length
      a.calls += mine.filter(isCall).length
      const sawFlop = flopIdx >= 0 && !minePreflop.some(isFold)
      if (sawFlop) {
        a.flops++
        if (showdown && !p.folded) a.showdowns++
      }
      acc.set(p.name, a)
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  const out = new Map<string, ObservedPlayerStats>()
  for (const [name, a] of acc) {
    out.set(name, {
      name,
      handsPlayed: a.hands,
      vpip: pct(a.vpip, a.hands),
      pfr: pct(a.pfr, a.hands),
      af: a.calls > 0 ? Math.round((a.bets / a.calls) * 100) / 100 : a.bets > 0 ? AF_CAP : 0,
      wtsd: pct(a.showdowns, a.flops),
    })
  }
  return out
}
