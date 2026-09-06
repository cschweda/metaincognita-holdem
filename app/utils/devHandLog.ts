// app/utils/devHandLog.ts
/**
 * TEMPORARY debugging aid — a per-hand dump to the browser console.
 *
 * Added while chasing a river spot where a bot led its whole stack off with
 * king-high out of the small blind and the table badge blamed tilt.
 *
 * Design notes, both of them learned the hard way:
 *
 *  - It runs in EVERY build. The first cut hid it behind `import.meta.dev`,
 *    which deleted it from exactly the built artifact the game is normally
 *    played on. If this reaches a public deploy the dumps are visible to
 *    anyone who opens a console, so it comes out before that matters.
 *  - It prints ONE flat `console.log` per hand, as a single plain string.
 *    The first cut used `console.groupCollapsed` + `console.table`, which
 *    collapses to a line that is easy to miss among Vite/Pinia boot noise
 *    and, worse, cannot be copied out — a console table is a rendered
 *    widget, not text. Select the block and paste it; that is the point.
 *
 * What keeps it honest is WHEN it runs: only from the hand-end handler,
 * after the hand is decided. A bot's hole cards are never printed while a
 * decision is still pending, so an open console cannot be used to play the
 * hand in front of you.
 *
 * Console helpers, available on `window`:
 *   holdemHands()      last 10 hands as one pasteable string
 *   holdemHands(50)    last 50
 *   holdemCopy()       same, copied straight to the clipboard
 *   holdemLog('off')   stop logging   ('on' resumes; persists in localStorage)
 *
 * Delete this file and its two call sites in pages/index.vue to remove it.
 */
import type { Card } from './cards'
import { displayCard } from './cards'
import type { PlayerState } from '~/composables/useGameState'
import { effectiveTiltSeverity } from './botDecision'

const STORE_KEY = 'holdemHandLog'
const HISTORY_CAP = 200

/** Rendered hands, newest last. Kept so a bad hand can be pasted after the fact. */
const history: string[] = []

/** Stacks as they were at the deal, keyed by seat — filled by noteHandStart. */
let stacksAtDeal = new Map<number, number>()

/** Hand counter, owned here so per-decision lines need nothing threaded in. */
let handNo = 0

/**
 * localStorage can throw outright (Safari private mode, a browser set to
 * block site data). This is a debugging aid: it must never be the reason a
 * hand fails to end, so every access is guarded and failure means "on".
 */
function readSwitch(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORE_KEY) ?? null
  } catch {
    return null
  }
}

const isOff = (): boolean => readSwitch() === 'off'

const cards = (cs: Card[] | null): string => (cs && cs.length ? cs.map(displayCard).join(' ') : '')

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length))

/** Call at the top of a new hand, before any chips move. */
export function noteHandStart(players: PlayerState[]): void {
  stacksAtDeal = new Map(players.map(p => [p.id, p.chips]))
  handNo++
  if (!isOff()) console.log(`\n───────── hand #${handNo} dealt ─────────`)
}

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
  sb: number
}

export interface DecisionLogInput {
  street: string
  name: string
  position: string
  isHero: boolean
  holeCards: [Card, Card] | null
  board: Card[]
  chipsBefore: number
  chipsAfter: number
  pot: number
  toCall: number
  bb: number
  action: string          // 'fold' | 'check' | 'call' | 'raise' | 'all-in'
  amount: number          // chips committed by THIS action
  raiseTo: number         // total bet-to for a raise, else 0
  isAllIn: boolean
  tiltSeverity: number    // effective, not raw
}

/**
 * One line per decision, from every player, as it happens.
 *
 * This is the view that matters for "why did that bot shove?" — the hand
 * summary tells you what happened, this tells you what the bot could see
 * when it chose. Anything that commits a big share of a stack is flagged
 * with >>> so a weird shove can be found by eye or by grep.
 *
 * Note: this prints a bot's hole cards at the moment it acts, i.e. while the
 * hand is still live. That is unavoidable if the log is to explain the
 * decision, but it does mean an open console reveals the table. It is a
 * debugging build, not a shipping one.
 */
export function logDecision(d: DecisionLogInput): void {
  if (isOff()) return
  const bb = d.bb || 1
  const stackBB = (d.chipsBefore / bb).toFixed(0)
  const potOdds = d.toCall > 0 ? ` odds ${((d.toCall / (d.pot + d.toCall)) * 100).toFixed(0)}%` : ''
  const spr = d.pot > 0 ? (d.chipsBefore / d.pot).toFixed(1) : '-'

  let verb = d.action.toUpperCase()
  if (d.action === 'raise') verb = d.isAllIn ? `ALL-IN $${d.raiseTo}` : `RAISE to $${d.raiseTo}`
  else if (d.action === 'call') verb = `CALL $${d.amount}`

  // The share of the stack a decision commits is the single most useful
  // number for spotting a punt, so it is always shown for a raise or call.
  let commit = ''
  if (d.amount > 0 && d.chipsBefore > 0) {
    const pctStack = (d.amount / d.chipsBefore) * 100
    const pctPot = d.pot > 0 ? (d.amount / d.pot) * 100 : 0
    commit = `  (${pctStack.toFixed(0)}% stack${d.pot > 0 ? `, ${pctPot.toFixed(0)}% pot` : ''})`
  }

  const left = d.chipsAfter
  const flags: string[] = []
  if (d.isAllIn) flags.push('ALL-IN')
  // A bet that leaves under 6bb is the dust case the commit rule exists to
  // prevent; if one appears here, the rule did not fire and that is a bug.
  else if (d.amount > 0 && left > 0 && left < bb * 6) flags.push(`DUST $${left} left`)
  if (d.amount > 0 && d.chipsBefore > 0 && d.amount / d.chipsBefore >= 0.5) flags.push('COMMITS 50%+')
  if (d.tiltSeverity > 0) flags.push(`tilt ${d.tiltSeverity.toFixed(2)}`)
  const flag = flags.length ? `  >>> ${flags.join(' | ')}` : ''

  console.log(
    `  #${handNo} ${pad(d.street, 8)}${pad(d.position, 4)}${pad(d.name + (d.isHero ? '*' : ''), 22)}`
    + `${pad(cards(d.holeCards) || '--', 9)}| ${pad(cards(d.board) || '(preflop)', 18)}| `
    + `${pad(`${stackBB}bb`, 6)}${pad(`pot $${d.pot}`, 10)}${pad(`SPR ${spr}`, 9)}`
    + `${pad(`to call $${d.toCall}${potOdds}`, 22)}=> ${verb}${commit}${flag}`,
  )
}

/** Renders one hand as a flat block of text. Exported for testing. */
export function renderHand(input: DevHandLogInput): string {
  const { handNumber, players, positions, community, pot, winnerName, winnerId, actionLog, bb, sb } = input
  // handWinnerName is "Split: A & B" for a chopped pot, so no single name
  // matches; seat id is the reliable test and the chop is called out on top.
  const split = winnerName.startsWith('Split')
  const live = players.filter(p => !p.eliminated)

  const seats = live.map(p => {
    const before = stacksAtDeal.get(p.id)
    const delta = before === undefined ? null : p.chips - before
    const sev = effectiveTiltSeverity(p.tilt, p.tiltMultiplier)
    const result = p.folded ? 'folded' : split ? 'SPLIT' : p.id === winnerId ? 'WON' : 'lost'
    const money = before === undefined
      ? `$${p.chips}`
      : `$${before} -> $${p.chips} (${delta! >= 0 ? '+' : ''}${delta})`
    // Tilt is the whole reason this log exists: raw severity is the trigger
    // level, effective is what applyTilt actually scales the bot by. They
    // differ for every persona whose multiplier is not 1.
    const tilt = p.tilt.tilted
      ? `  TILT ${p.tilt.severity} raw / ${sev.toFixed(2)} eff (x${p.tiltMultiplier}, ${p.tilt.handsRemaining} hands left)`
      : ''
    return '  ' + pad(positions[p.id] ?? '?', 4)
      + pad(p.name + (p.isHero ? ' (hero)' : ''), 24)
      + pad(cards(p.holeCards) || '--', 9)
      + pad(`${(p.chips / bb).toFixed(0)}bb`, 7)
      + pad(money, 24)
      + pad(`in $${p.totalInvested}`, 10)
      + result + tilt
  })

  const bar = '='.repeat(78)
  return [
    bar,
    `HAND #${handNumber}  ·  $${sb}/$${bb}  ·  pot $${pot}  ·  ${winnerName || 'no winner'}`,
    `board: ${cards(community) || '(no flop — everyone folded preflop)'}`,
    bar,
    ...seats,
    '',
    ...(actionLog.length ? actionLog : ['(no actions logged)']),
    bar,
  ].join('\n')
}

/** One flat, selectable, pasteable block per hand. */
export function logHandToConsole(input: DevHandLogInput): void {
  if (isOff()) return
  const text = renderHand(input)
  history.push(text)
  if (history.length > HISTORY_CAP) history.shift()
  console.log(text)
}

/**
 * Installs the console helpers and prints a one-time banner.
 *
 * The banner is the diagnostic that matters: if it is NOT in your console on
 * page load, the build you are looking at does not contain this file, and no
 * amount of playing hands will produce output. That was the actual failure
 * the first two times round.
 */
export function installHandLogHelpers(): void {
  const w = globalThis as Record<string, unknown>
  if (w.__holdemHandLogInstalled) return
  w.__holdemHandLogInstalled = true

  w.holdemHands = (n = 10): string => history.slice(-n).join('\n\n') || '(no hands logged yet)'
  w.holdemCopy = async (n = 10): Promise<string> => {
    const text = history.slice(-n).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      return `copied ${Math.min(n, history.length)} hand(s) to the clipboard`
    } catch {
      // Clipboard needs a secure context and, in some browsers, a user
      // gesture — neither is guaranteed from a console call.
      console.log(text)
      return 'clipboard blocked; the hands were printed above instead'
    }
  }
  w.holdemLog = (mode: 'on' | 'off'): string => {
    try {
      if (mode === 'off') globalThis.localStorage?.setItem(STORE_KEY, 'off')
      else globalThis.localStorage?.removeItem(STORE_KEY)
      return `hand log ${mode}`
    } catch {
      return 'could not persist the setting (storage blocked)'
    }
  }

  console.log(
    `%c HOLDEM HAND LOG ACTIVE %c every hand prints below${isOff() ? ' — currently OFF via holdemLog("on")' : ''}\n`
    + 'holdemHands(n) = last n hands as text · holdemCopy(n) = copy to clipboard · holdemLog("off") = stop',
    'background:#00DC82;color:#000;font-weight:bold;padding:2px 6px;border-radius:3px',
    'color:inherit',
  )
}
