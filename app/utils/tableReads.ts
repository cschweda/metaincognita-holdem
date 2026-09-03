/**
 * Table reads — what kind of table is this? A rolling window of PUBLIC,
 * table-wide signals (bets, checks, flops seen, showdowns reached) → two
 * booleans the bot brain may act on. Nothing here looks at cards. Pure and
 * framework-free: the live engine, both simulators and the exploit probe
 * own a state object each and call the same three functions, so the CI
 * probe gate measures exactly what the live table does.
 */
export interface TableReadConfig {
  windowHands: number
  minHands: number
  minFlops: number          // showdownHeavy needs at least this many flops in the window (passivity is unaffected)
  passiveAt: number         // passivity = checks / (checks + bets)
  showdownHeavyAt: number   // showdowns / flops seen
  thinValueBoost: number    // river thin-value frequency × (station table)
  riverBluffPenalty: number // river bluff-raise frequency × (station table)
}

export interface TableReads {
  passive: boolean
  showdownHeavy: boolean
}

interface HandSample { bets: number; checks: number; sawFlop: boolean; showdown: boolean }

export interface TableReadState {
  current: { bets: number; checks: number }
  hands: HandSample[]
}

export function createTableReadState(): TableReadState {
  return { current: { bets: 0, checks: 0 }, hands: [] }
}

/** A bet or raise (all-ins included) or a check. Calls and folds are not counted. */
export function noteTableAction(state: TableReadState, type: 'bet' | 'check'): void {
  if (type === 'bet') state.current.bets++
  else state.current.checks++
}

/** Close the hand: push its sample, keep the window, reset the accumulators. */
export function finishTableHand(state: TableReadState, hand: { sawFlop: boolean; showdown: boolean }, windowHands: number): void {
  state.hands.push({ bets: state.current.bets, checks: state.current.checks, sawFlop: hand.sawFlop, showdown: hand.showdown })
  while (state.hands.length > windowHands) state.hands.shift()
  state.current = { bets: 0, checks: 0 }
}

export function tableReadStats(state: TableReadState): { hands: number; passivity: number; showdownPerFlop: number; flops: number } {
  let bets = 0, checks = 0, flops = 0, showdowns = 0
  for (const h of state.hands) {
    bets += h.bets; checks += h.checks
    if (h.sawFlop) { flops++; if (h.showdown) showdowns++ }
  }
  return {
    hands: state.hands.length,
    passivity: bets + checks > 0 ? checks / (bets + checks) : 0,
    showdownPerFlop: flops > 0 ? showdowns / flops : 0,
    flops,
  }
}

/** undefined below minHands; otherwise the three reads. */
export function readTable(state: TableReadState, cfg: TableReadConfig): TableReads | undefined {
  if (state.hands.length < cfg.minHands) return undefined
  const s = tableReadStats(state)
  // Below minFlops the showdown ratio is too noisy to read (a handful of
  // flops can sit at 0% or 100% by chance) — only passivity, which accrues
  // every hand rather than just flopped ones, is exempt from this guard.
  const enoughFlops = s.flops >= cfg.minFlops
  return {
    passive: s.passivity >= cfg.passiveAt,
    showdownHeavy: enoughFlops && s.showdownPerFlop >= cfg.showdownHeavyAt,
  }
}
