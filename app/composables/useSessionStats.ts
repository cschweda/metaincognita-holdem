/**
 * Session stats tracking — persists to localStorage with reactive watch,
 * and syncs to Supabase in background (auto-save every 60s + sendBeacon on tab close).
 * Tracks hands played, wins/losses/folds, bankroll, per-hand records, and
 * provides JSON/CSV export downloads.
 */
import { useSupabase, ensureAnonSession } from './useSupabase'

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
  const userId = ref<string | null>(null)
  const supabaseReady = ref(false)

  // Initialize
  let autoSaveInterval: ReturnType<typeof setInterval> | null = null
  let beforeUnloadHandler: (() => void) | null = null

  onBeforeUnmount(() => {
    if (autoSaveInterval) clearInterval(autoSaveInterval)
    if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler)
  })

  onMounted(async () => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        session.value = JSON.parse(saved)
      } catch (e) {
        console.warn('Failed to parse session data from localStorage — starting fresh:', e instanceof Error ? e.message : e)
        localStorage.removeItem(STORAGE_KEY)
      }
    }

    // Set up Supabase anonymous session
    userId.value = await ensureAnonSession()
    supabaseReady.value = !!userId.value

    // Auto-save session to Supabase every 60 seconds
    autoSaveInterval = setInterval(() => {
      if (session.value.handsPlayed > 0) saveSessionToSupabase()
    }, 60000)

    // Save on tab close (uses sendBeacon for reliability)
    beforeUnloadHandler = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session.value))
      if (userId.value && session.value.handsPlayed > 0) {
        const runtimeConfig = useRuntimeConfig()
        const body = JSON.stringify({
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
        // sendBeacon cannot include custom headers, so we use a Blob with
        // the apikey in the URL as a query param (Supabase supports this).
        // RLS policies on the sessions table ensure only the owning user can upsert.
        const beaconUrl = `${runtimeConfig.public.supabaseUrl}/rest/v1/sessions?apikey=${encodeURIComponent(runtimeConfig.public.supabaseKey)}`
        navigator.sendBeacon(
          beaconUrl,
          new Blob([body], { type: 'application/json' })
        )
      }
    }
    window.addEventListener('beforeunload', beforeUnloadHandler)
  })

  // Auto-save to localStorage on changes (debounced to avoid serializing on every mutation)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(session, (val) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    }, 1000)
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
    sessionCreatedInSupabase.value = false
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

  const sessionCreatedInSupabase = ref(false)

  async function ensureSessionExists() {
    if (sessionCreatedInSupabase.value) return
    const sb = useSupabase()
    if (!sb || !userId.value) return

    // Insert only — don't overwrite existing session data with zeros
    const { error } = await sb.from('sessions').insert({
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
      total_profit: session.value.totalProfit,
    }).select().maybeSingle()
    // Ignore duplicate key errors (session already exists from prior save)
    if (!error || error.code === '23505') sessionCreatedInSupabase.value = true
    else console.warn('Failed to create session:', error.message)
  }

  async function saveHandToSupabase(record: HandRecord) {
    const sb = useSupabase()
    if (!sb || !userId.value) return

    // Ensure session row exists before inserting hand (FK constraint)
    await ensureSessionExists()

    const { error } = await sb.from('hands').insert({
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
      actions: record.actions || [],
      players: record.players || [],
    })
    if (error) console.warn('Failed to save hand:', error.message)
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
    } catch (e: unknown) {
      console.warn('Failed to save session to Supabase:', e instanceof Error ? e.message : e)
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
