/**
 * Session stats tracking — persists to localStorage with reactive watch.
 * Tracks hands played, wins/losses/folds, bankroll, per-hand records, and
 * provides JSON/CSV export downloads.
 */
export interface PlayerHand {
  name: string
  position: string
  holeCards: string      // e.g. "Ah Kd"
  folded: boolean
  isHero: boolean
  chips?: number         // stack at start of hand
  seatIndex?: number
}

export interface HandRecord {
  handNumber: number
  holeCards: string      // hero's cards e.g. "Ah Kd"
  board: string          // e.g. "As Td 7c 2h 9s"
  result: 'won' | 'lost' | 'folded'
  profit: number         // +/- from this hand
  position: string       // BTN, UTG, etc.
  potSize: number
  actions: string[]      // play-by-play log
  players: PlayerHand[]  // all players' cards + status
  winnerName?: string    // name of the hand winner
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

  // Auto-save to localStorage on changes (debounced to avoid serializing on every mutation)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(session, () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(trySave, 1000)
  }, { deep: true })

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
  }

  function recordHand(record: HandRecord, newStack: number) {
    session.value.handsPlayed++
    session.value.hands.push(record)

    if (record.result === 'won') session.value.handsWon++
    else if (record.result === 'lost') session.value.handsLost++
    else if (record.result === 'folded') session.value.handsFolded++

    session.value.currentStack = newStack
    session.value.totalProfit = newStack - session.value.startingStack
    session.value.peakStack = Math.max(session.value.peakStack, newStack)

    // Save to localStorage immediately (don't wait for debounced watch)
    trySave()
  }

  function resetSession() {
    const prev = session.value
    initSession(prev.stakeLevel, prev.playerCount, prev.startingStack)
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
    resetSession,
    downloadJSON,
    downloadCSV,
  }
}
