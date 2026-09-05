// app/utils/heroRecord.ts
/**
 * Derive the hero's per-hand behavior record from the hand action log —
 * the input to the bots' session read and to the Nemesis book.
 *
 * Every line the engine logs starts with the actor's name ("Hero calls $4",
 * "--- FLOP: ... ---"), so the actor test anchors at the start of the line.
 * A substring test misattributes a name-sharing bot's actions to the hero.
 */
import type { HeroHandRecord } from '~/stores/heroProfile'

/** True when `name` is the actor of this log line (not merely mentioned in it). */
export function actedInLine(line: string, name: string): boolean {
  return name.length > 0 && line.startsWith(`${name} `)
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
