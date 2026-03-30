/**
 * Session stats tracking — persists to localStorage and optionally Supabase.
 * Tracks hands played, wins, losses, bankroll, and per-hand results.
 */
import { useSupabase, ensureAnonSession } from './useSupabase'

export interface HandRecord {
  handNumber: number
  holeCards: string      // e.g. "Ah Kd"
  board: string          // e.g. "As Td 7c 2h 9s"
  result: 'won' | 'lost' | 'folded'
  profit: number         // +/- from this hand
  position: string       // BTN, UTG, etc.
  potSize: number
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
  const userId = ref<string | null>(null)
  const supabaseReady = ref(false)

  // Initialize
  onMounted(async () => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        session.value = JSON.parse(saved)
      } catch {}
    }

    // Set up Supabase anonymous session
    userId.value = await ensureAnonSession()
    supabaseReady.value = !!userId.value
  })

  // Auto-save to localStorage on changes
  watch(session, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
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

    // Save to Supabase in background
    saveHandToSupabase(record)
  }

  async function saveHandToSupabase(record: HandRecord) {
    const sb = useSupabase()
    if (!sb || !userId.value) return

    try {
      await sb.from('hands').insert({
        user_id: userId.value,
        session_id: session.value.id,
        hand_number: record.handNumber,
        hole_cards: record.holeCards,
        board: record.board,
        result: record.result,
        profit: record.profit,
        position: record.position,
        pot_size: record.potSize,
        stake_level: session.value.stakeLevel,
        player_count: session.value.playerCount,
        played_at: new Date().toISOString(),
      })
    } catch (e) {
      // Silently fail — localStorage is the fallback
    }
  }

  async function saveSessionToSupabase() {
    const sb = useSupabase()
    if (!sb || !userId.value) return

    try {
      await sb.from('sessions').upsert({
        id: session.value.id,
        user_id: userId.value,
        started_at: session.value.startedAt,
        stake_level: session.value.stakeLevel,
        player_count: session.value.playerCount,
        starting_stack: session.value.startingStack,
        hands_played: session.value.handsPlayed,
        hands_won: session.value.handsWon,
        hands_lost: session.value.handsLost,
        hands_folded: session.value.handsFolded,
        final_stack: session.value.currentStack,
        peak_stack: session.value.peakStack,
        total_profit: session.value.totalProfit,
        ended_at: new Date().toISOString(),
      })
    } catch (e) {
      // Silently fail
    }
  }

  function resetSession() {
    // Save current session to Supabase before resetting
    saveSessionToSupabase()
    const prev = session.value
    initSession(prev.stakeLevel, prev.playerCount, prev.startingStack)
  }

  // ─── Export ────────────────────────────────────────────────
  function exportJSON(): string {
    return JSON.stringify(session.value, null, 2)
  }

  function exportCSV(): string {
    const headers = ['Hand #', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size']
    const rows = session.value.hands.map(h => [
      h.handNumber,
      h.holeCards,
      h.board,
      h.position,
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
    userId: readonly(userId),
    supabaseReady: readonly(supabaseReady),
    initSession,
    recordHand,
    resetSession,
    saveSessionToSupabase,
    downloadJSON,
    downloadCSV,
  }
}
