// app/utils/heroRecord.ts
/**
 * Derive the hero's per-hand behavior record from the hand action log —
 * the input to the bots' session read and to the Nemesis book.
 *
 * Every actor line the engine logs is `<name> <verb> ...`; the only other
 * lines are the `--- FLOP/TURN/RIVER: ... ---` markers. Matching only
 * "line starts with this name" is not a complete actor test: it still
 * matches when the candidate name is a whitespace-delimited prefix of a
 * different, longer actor name ("Wild" inside "Wild Wendy raises..."),
 * the mirror image of a name embedded in a longer one ("Sam" inside
 * "Solid Sam calls..."). Requiring an action verb immediately after the
 * name closes both directions of the collision.
 */
import type { HeroHandRecord } from '~/stores/heroProfile'

/**
 * The verbs the engine's action log can follow an actor's name with
 * (app/composables/useGameEngine.ts is the only writer). Anchoring on
 * them is what stops a hero named "Mike" from absorbing "Mike the
 * Mouth ..." lines — a name prefix alone is not enough.
 */
const ACTION_VERBS = ['folds', 'checks', 'calls', 'raises', 'goes'] as const

/** True when `name` is the actor of this log line (not merely mentioned in it). */
export function actedInLine(line: string, name: string): boolean {
  if (name.length === 0 || !line.startsWith(`${name} `)) return false
  const rest = line.slice(name.length + 1)
  return ACTION_VERBS.some(v => rest.startsWith(v))
}

const isRaiseLine = (a: string) => a.includes('raises') || a.includes('ALL-IN')

export function parseHeroHandRecord(
  log: string[],
  heroName: string,
  opts: { heroFolded: boolean; heroTotalWagered: number; bb: number },
): HeroHandRecord {
  const byHero = (a: string) => actedInLine(a, heroName)
  const flopMarkIdx = log.findIndex(a => a.startsWith('--- FLOP'))
  const preflopLog = flopMarkIdx >= 0 ? log.slice(0, flopMarkIdx) : log
  const turnMarkIdx = log.findIndex(a => a.startsWith('--- TURN'))
  const flopLog = flopMarkIdx >= 0
    ? log.slice(flopMarkIdx + 1, turnMarkIdx >= 0 ? turnMarkIdx : undefined)
    : []

  // Hero faced a 3-bet: hero raised preflop, then someone else re-raised
  const heroOpenIdx = preflopLog.findIndex(a => byHero(a) && isRaiseLine(a))
  const reRaiseAfterIdx = heroOpenIdx >= 0
    ? preflopLog.findIndex((a, i) => i > heroOpenIdx && !byHero(a) && isRaiseLine(a))
    : -1
  const faced3Bet = reRaiseAfterIdx >= 0
  const foldedTo3Bet = faced3Bet
    && preflopLog.some((a, i) => i > reRaiseAfterIdx && byHero(a) && a.includes('folds'))

  // Hero faced a c-bet: someone else led the flop while hero was still in
  const heroFoldedPreflop = preflopLog.some(a => byHero(a) && a.includes('folds'))
  const flopLeadIdx = flopLog.findIndex(isRaiseLine)
  const facedCbet = !heroFoldedPreflop && flopLeadIdx >= 0 && !byHero(flopLog[flopLeadIdx]!)
  const foldedToCbet = facedCbet
    && flopLog.some((a, i) => i > flopLeadIdx && byHero(a) && a.includes('folds'))

  return {
    enteredPot: !opts.heroFolded || opts.heroTotalWagered > opts.bb,
    faced3Bet,
    foldedTo3Bet,
    facedCbet,
    foldedToCbet,
    raiseCount: log.filter(a => byHero(a) && isRaiseLine(a)).length,
    callCount: log.filter(a => byHero(a) && a.includes('calls')).length,
    checkCount: log.filter(a => byHero(a) && a.includes('checks')).length,
  }
}
