/**
 * Session stats tracking — persists to localStorage on every recorded hand.
 * Tracks hands played, wins/losses/folds, bankroll, per-hand records, and
 * provides JSON/CSV export downloads.
 */
import { ref, readonly, onMounted, onBeforeUnmount } from 'vue'

export interface PlayerHand {
  name: string
  position: string
  holeCards: string      // e.g. "Ah Kd"
  folded: boolean
  isHero: boolean
  chips?: number         // stack at the deal, before blinds
  seatIndex?: number
  preset?: string        // bots: the persona/preset the seat was built from
  profile?: import('~/utils/botConfig').BotStrategyFields // bots: strategy numbers, only when they differ from the preset
}

export interface HandRecord {
  handNumber: number
  holeCards: string      // hero's cards e.g. "Ah Kd"
  board: string          // e.g. "As Td 7c 2h 9s"
  result: 'won' | 'lost' | 'folded'
  profit: number         // hero's net for the hand: stack after minus stack at the deal
  position: string       // BTN, UTG, etc.
  potSize: number
  actions: string[]      // play-by-play log
  players: PlayerHand[]  // all players' cards + status
  winnerName?: string    // name of the hand winner
  // Optional — read by the PokerStars export when present (utils/pokerStarsExport.ts)
  playedAt?: string      // ISO time the hand was played: the export's date and part of its hand number
  sb?: number            // the blinds the hand was played at (else the session's stake is used)
  bb?: number
  buttonSeat?: number    // 0-based seat index of the button (else read from the position labels)
  handId?: string        // digits only: a ready-made unique hand number for the export
}

export interface SessionData {
  id: string
  startedAt: string
  stakeLevel: number
  playerCount: number
  startingStack: number
  handsPlayed: number
  handsWon: number
  handsLost: number
  handsFolded: number
  currentStack: number
  peakStack: number
  totalProfit: number
  hands: HandRecord[]
}

const STORAGE_KEY = 'holdem-session-stats'

export function useSessionStats() {
  const session = ref<SessionData>(createSession())

  let beforeUnloadHandler: (() => void) | null = null

  onBeforeUnmount(() => {
    if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler)
  })

  onMounted(() => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Shape check the fields recordHand mutates — a tampered payload
        // (hands not an array) would otherwise throw mid-game on every hand.
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.hands)) {
          session.value = parsed
        } else {
          throw new Error('unexpected session shape')
        }
      } catch (e) {
        console.warn('Failed to parse session data from localStorage — starting fresh:', e instanceof Error ? e.message : e)
        localStorage.removeItem(STORAGE_KEY)
      }
    }

    // Save on tab close
    beforeUnloadHandler = () => {
      trySave()
    }
    window.addEventListener('beforeunload', beforeUnloadHandler)
  })

  // All persistence goes through one guarded writer: localStorage.setItem
  // throws QuotaExceededError once a long session outgrows the ~5MB budget,
  // and recordHand runs at the tail of endHand — an uncaught throw there
  // would abort elimination bookkeeping and destabilize every later hand.
  let quotaWarned = false
  function trySave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session.value))
    } catch (e) {
      if (!quotaWarned) {
        quotaWarned = true
        console.warn('Session stats no longer fit in localStorage — the game continues, but stats will not survive a reload:', e instanceof Error ? e.message : e)
      }
    }
  }

  // Persistence is explicit: initSession and recordHand save, and the
  // beforeunload handler catches a tab close. The session is exposed
  // readonly, so those are the only mutation points — a deep watcher here
  // would walk the whole hand history on every change and serialize it a
  // second time after each save.

  function createSession(): SessionData {
    return {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      stakeLevel: 3,
      playerCount: 6,
      startingStack: 200,
      handsPlayed: 0,
      handsWon: 0,
      handsLost: 0,
      handsFolded: 0,
      currentStack: 200,
      peakStack: 200,
      totalProfit: 0,
      hands: [],
    }
  }

  function initSession(stakeLevel: number, playerCount: number, startingStack: number) {
    session.value = createSession()
    session.value.stakeLevel = stakeLevel
    session.value.playerCount = playerCount
    session.value.startingStack = startingStack
    session.value.currentStack = startingStack
    session.value.peakStack = startingStack
    trySave()
  }

  /**
   * `profit` is derived here, not taken from the caller: it is the hero's
   * real net for the hand — the stack after it minus the stack the session
   * last saw (the stack at the deal). A fold costs what was invested, a
   * split pot is the partial result, and the hands sum to `totalProfit`.
   */
  function recordHand(record: Omit<HandRecord, 'profit'>, newStack: number) {
    const profit = Math.round((newStack - session.value.currentStack) * 100) / 100
    session.value.handsPlayed++
    session.value.hands.push({ ...record, profit })

    if (record.result === 'won') session.value.handsWon++
    else if (record.result === 'lost') session.value.handsLost++
    else if (record.result === 'folded') session.value.handsFolded++

    session.value.currentStack = newStack
    session.value.totalProfit = newStack - session.value.startingStack
    session.value.peakStack = Math.max(session.value.peakStack, newStack)

    // Save to localStorage immediately (don't wait for debounced watch)
    trySave()
  }

  // The stats page edits the stored session directly (delete a hand, delete
  // the session) while the kept-alive game page still holds its own copy.
  // Called when the game page is shown again, so the next save does not put
  // the deleted hands back. Only the hand list is adopted — the stack and
  // counters are this table's to keep.
  function adoptStoredHands() {
    let stored: unknown = null
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { return }
    const s = stored as { id?: string; hands?: unknown } | null
    if (s && s.id === session.value.id && Array.isArray(s.hands)) {
      session.value.hands = s.hands as HandRecord[]
    } else if (!s) {
      session.value.hands = []
    }
  }

  // "New Session" at a running table: the hero keeps the chips in front of
  // them, so the new session starts from that stack — not from the original
  // buy-in, which would book the old session's result into the new one.
  function resetSession() {
    const prev = session.value
    initSession(prev.stakeLevel, prev.playerCount, prev.currentStack)
  }

  // ─── Export ────────────────────────────────────────────────
  function exportJSON(): string {
    return JSON.stringify(session.value, null, 2)
  }

  function csvEscape(val: unknown): string {
    const s = String(val ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  function exportCSV(): string {
    const headers = ['Hand #', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size']
    const rows = session.value.hands.map(h => [
      h.handNumber,
      csvEscape(h.holeCards),
      csvEscape(h.board),
      csvEscape(h.position),
      h.result,
      h.profit,
      h.potSize,
    ].join(','))
    return [headers.join(','), ...rows].join('\n')
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadJSON() {
    downloadFile(exportJSON(), `holdem-session-${session.value.id.slice(0, 8)}.json`, 'application/json')
  }

  function downloadCSV() {
    downloadFile(exportCSV(), `holdem-session-${session.value.id.slice(0, 8)}.csv`, 'text/csv')
  }

  return {
    session: readonly(session),
    initSession,
    recordHand,
    adoptStoredHands,
    resetSession,
    downloadJSON,
    downloadCSV,
  }
}
