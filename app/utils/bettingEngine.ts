/**
 * Shared no-limit betting rules — THE single source of truth consumed by the
 * live game (useGameEngine), both simulators, and the exploit probe.
 *
 * Rules enforced here:
 *  - Minimum raise: currentBet + max(lastRaiseIncrement, bb); sub-min raises
 *    are clamped up (which may put the player all-in).
 *  - Half-raise rule: an all-in raise below the minimum does NOT reopen
 *    action for players who already acted at the current bet level.
 *  - Termination: needsToAct empties; a skip-guard breaks only if a full
 *    orbit passes with nobody able to act (never a lap-count cap, which
 *    can truncate legitimate multi-raise rounds).
 */

export interface EnginePlayer {
  id: number
  chips: number
  betThisRound: number
  totalInvested: number
  folded: boolean
  eliminated?: boolean
}

export interface BettingRound {
  players: EnginePlayer[]
  currentBet: number
  lastRaiseIncrement: number
  pot: number
  bb: number
  needsToAct: Set<number>
}

export type EngineAction =
  | { type: 'fold' } | { type: 'check' } | { type: 'call' }
  | { type: 'raise'; amount: number }

export interface AppliedAction {
  type: 'fold' | 'check' | 'call' | 'raise'
  amount: number       // chips moved for call; raise-to total for raise; 0 otherwise
  isAllIn: boolean
  reopened: boolean    // true only for a FULL raise (half-raise rule)
}

const canAct = (p: EnginePlayer) => !p.folded && !p.eliminated && p.chips > 0
const inHand = (p: EnginePlayer) => !p.folded && !p.eliminated

/** Reset needsToAct to everyone who can still act. Call at the start of each street. */
export function startBettingRound(round: BettingRound): void {
  round.needsToAct = new Set(round.players.filter(canAct).map(p => p.id))
}

/**
 * Apply one action, mutating players/pot/currentBet/needsToAct in place.
 * Returns what actually happened (amounts clamped to legality).
 */
export function applyEngineAction(round: BettingRound, seatId: number, action: EngineAction): AppliedAction {
  const p = round.players.find(pl => pl.id === seatId)!

  if (action.type === 'fold') {
    p.folded = true
    round.needsToAct.delete(p.id)
    return { type: 'fold', amount: 0, isAllIn: false, reopened: false }
  }

  if (action.type === 'check') {
    round.needsToAct.delete(p.id)
    return { type: 'check', amount: 0, isAllIn: false, reopened: false }
  }

  if (action.type === 'call') {
    const callAmt = Math.min(round.currentBet - p.betThisRound, p.chips)
    p.chips -= callAmt
    p.betThisRound += callAmt
    p.totalInvested += callAmt
    round.pot += callAmt
    round.needsToAct.delete(p.id)
    return { type: 'call', amount: callAmt, isAllIn: p.chips <= 0, reopened: false }
  }

  // raise
  const prevBet = round.currentBet
  const minRaiseAmt = prevBet === 0
    ? round.bb
    : prevBet + Math.max(round.lastRaiseIncrement, round.bb)

  let raiseTotal = Math.min(action.amount, p.chips + p.betThisRound)
  const isAllIn = raiseTotal >= p.chips + p.betThisRound

  // Enforce minimum raise — unless it's an all-in for less
  if (!isAllIn && raiseTotal < minRaiseAmt) {
    raiseTotal = Math.min(minRaiseAmt, p.chips + p.betThisRound)
  }

  // Half-raise rule: an incomplete raise (all-in below min) doesn't reopen action
  const isFullRaise = raiseTotal >= minRaiseAmt

  const toAdd = raiseTotal - p.betThisRound
  p.chips -= toAdd
  p.betThisRound = raiseTotal
  p.totalInvested += toAdd
  round.pot += toAdd
  if (raiseTotal > round.currentBet) round.currentBet = raiseTotal
  if (isFullRaise) round.lastRaiseIncrement = Math.max(raiseTotal - prevBet, round.bb)

  round.needsToAct.delete(p.id)
  if (isFullRaise) {
    for (const ap of round.players) {
      if (ap.id !== p.id && canAct(ap)) round.needsToAct.add(ap.id)
    }
  }

  return { type: 'raise', amount: raiseTotal, isAllIn: p.chips <= 0, reopened: isFullRaise }
}

/**
 * Synchronous betting loop for simulators and the exploit probe.
 * The live game keeps its own async loop (thinking delays, hero input)
 * but delegates per-action legality to applyEngineAction above.
 */
export function runBettingRound(
  round: BettingRound,
  startSeat: number,
  decide: (p: EnginePlayer, round: BettingRound) => EngineAction,
  onApplied?: (p: EnginePlayer, action: EngineAction, result: AppliedAction) => void,
): void {
  const count = round.players.length
  let seat = startSeat
  let skips = 0

  while (round.needsToAct.size > 0) {
    const p = round.players[seat % count]!
    if (!round.needsToAct.has(p.id) || !canAct(p)) {
      if (!canAct(p)) round.needsToAct.delete(p.id) // stale all-in/folded entries drop out
      seat = (seat + 1) % count
      if (++skips > count) break
      continue
    }
    if (round.players.filter(inHand).length <= 1) break

    const action = decide(p, round)
    const result = applyEngineAction(round, p.id, action)
    onApplied?.(p, action, result)
    skips = 0

    if (round.players.filter(inHand).length <= 1) break
    seat = (seat + 1) % count
  }
}
