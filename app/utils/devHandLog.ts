// app/utils/devHandLog.ts
/**
 * TEMPORARY debugging aid — a per-hand dump to the browser console.
 *
 * Added while chasing a river spot where a bot led its whole stack off with
 * king-high out of the small blind and the table badge blamed tilt. Reading
 * that back from the UI alone meant reconstructing the hand from the action
 * log by eye; this prints the whole hand, player by player, in one group.
 *
 * This runs in EVERY build, dev or production. The first cut gated it behind
 * `import.meta.dev`, which meant it vanished from exactly the built artifact
 * the game is normally played on — invisible where it was needed. If this
 * ships to a public deploy the hand dumps are visible to anyone who opens a
 * console, so it comes out before that matters.
 *
 * What keeps it honest is WHEN it runs: only from the hand-end handler, after
 * the hand is decided. A bot's hole cards are never printed while a decision
 * is still pending, so an open console cannot be used to play the hand in
 * front of you.
 *
 * Off switch, no rebuild needed:  localStorage.holdemHandLog = 'off'
 * Back on:                        delete localStorage.holdemHandLog
 *
 * Delete this file and its single call site in pages/index.vue to remove it.
 */
import type { Card } from './cards'
import { displayCard } from './cards'
import type { PlayerState } from '~/composables/useGameState'
import { effectiveTiltSeverity } from './botDecision'

export interface DevHandLogInput {
  handNumber: number
  players: PlayerState[]
  positions: string[]
  community: Card[]
  pot: number
  winnerName: string
  winnerId: number
  actionLog: string[]
  bb: number
}

const cards = (cs: Card[] | null): string => (cs && cs.length ? cs.map(displayCard).join(' ') : '—')

/**
 * Reading localStorage can throw outright (Safari private mode, a browser set
 * to block site data), and this is a debugging aid — it must never be the
 * reason a hand fails to end. Any failure means "not switched off".
 */
function switchedOff(): boolean {
  try {
    return globalThis.localStorage?.getItem('holdemHandLog') === 'off'
  } catch {
    return false
  }
}

/** One console group per hand: seats, cards, tilt, stacks, then the action line. */
export function logHandToConsole(input: DevHandLogInput): void {
  if (switchedOff()) return
  const { handNumber, players, positions, community, pot, winnerName, winnerId, actionLog, bb } = input
  // handWinnerName is "Split: A & B" for a chopped pot, so no single name
  // matches; seat id is the reliable test and the split is called out on top.
  const split = winnerName.startsWith('Split')

  const rows = players
    .filter(p => !p.eliminated)
    .map(p => {
      const sev = effectiveTiltSeverity(p.tilt, p.tiltMultiplier)
      return {
        seat: p.id,
        who: p.name + (p.isHero ? ' (hero)' : ''),
        pos: positions[p.id] ?? '',
        cards: cards(p.holeCards),
        // Stack in bb is what actually drives the short-stack branches.
        stack: `$${p.chips}`,
        bb: +(p.chips / bb).toFixed(1),
        invested: `$${p.totalInvested}`,
        result: p.folded ? 'folded' : split ? 'split?' : p.id === winnerId ? 'WON' : 'lost',
        // Raw severity is the trigger level; effective is what the bot plays
        // at (severity x tiltMultiplier). They differ for every persona whose
        // multiplier is not 1, which is what made the badge misleading.
        tilt: p.tilt.tilted ? `${p.tilt.severity} raw / ${sev.toFixed(2)} eff (x${p.tiltMultiplier})` : '—',
      }
    })

  console.groupCollapsed(
    `%c#${handNumber}%c  ${community.length ? cards(community) : 'no flop'}  ·  pot $${pot}  ·  ${winnerName || 'no winner'}`,
    'font-weight:bold', 'font-weight:normal',
  )
  console.table(rows)
  console.log(actionLog.length ? actionLog.join('\n') : '(no actions logged)')
  console.groupEnd()
}
