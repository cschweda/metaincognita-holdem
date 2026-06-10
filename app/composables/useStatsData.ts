/**
 * Stats data composable — loads sessions/hands from localStorage,
 * computes lifetime stats, position stats, profit timeline, and provides
 * CRUD operations (delete session/hand/all). Extracted from stats.vue.
 */
import { toPokerStarsFormat, exportHandsAsPokerStars } from '~/utils/pokerStarsExport'
import { downloadFile } from '~/utils/downloadFile'
import type { SessionData, HandRecord } from './useSessionStats'

export interface SessionRow {
  id: string; started_at: string; ended_at: string | null
  stake_level: number; player_count: number; starting_stack: number
  hands_played: number; hands_won: number; hands_lost: number; hands_folded: number
  final_stack: number | null; peak_stack: number | null; total_profit: number
}

export interface HandRow {
  id: string; session_id: string; hand_number: number; hole_cards: string
  board: string | null; result: string; profit: number; position: string
  pot_size: number; stake_level: number; player_count: number; played_at: string
  actions: string[] | null
  players: { name: string; position: string; holeCards: string; folded: boolean; isHero: boolean }[] | null
}

export function useStatsData() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const sessions = ref<SessionRow[]>([])
  const hands = ref<HandRow[]>([])
  const localSession = ref<SessionData | null>(null)
  const selectedSession = ref<SessionRow | null>(null)
  const positionFilter = ref<string | null>(null)

  // ─── Data Loading ──────────────────────────────────────

  async function init() {
    try {
      const saved = localStorage.getItem('holdem-session-stats')
      if (saved) localSession.value = JSON.parse(saved)
    } catch (e) {
      console.warn('Failed to parse session stats from localStorage:', e instanceof Error ? e.message : e)
      localStorage.removeItem('holdem-session-stats')
    }

    mapLocalSessionToHands()
    loading.value = false
  }

  function mapLocalSessionToHands() {
    if (localSession.value?.hands) {
      hands.value = localSession.value.hands.map((h: HandRecord, i: number) => ({
        id: `local-${i}`, session_id: localSession.value!.id,
        hand_number: h.handNumber, hole_cards: h.holeCards, board: h.board,
        result: h.result, profit: h.profit, position: h.position,
        pot_size: h.potSize, stake_level: localSession.value!.stakeLevel,
        player_count: localSession.value!.playerCount,
        played_at: new Date().toISOString(),
        actions: h.actions || null, players: h.players || null,
      }))
    }
  }

  // ─── Delete Operations ─────────────────────────────────

  async function deleteAllData() {
    localStorage.removeItem('holdem-session-stats')
    sessions.value = []; hands.value = []; localSession.value = null
  }

  async function deleteSession(sessionId: string) {
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    hands.value = hands.value.filter(h => h.session_id !== sessionId)
    if (localSession.value?.id === sessionId) { localStorage.removeItem('holdem-session-stats'); localSession.value = null }
    if (selectedSession.value?.id === sessionId) selectedSession.value = null
  }

  async function deleteHand(handId: string) {
    hands.value = hands.value.filter(h => h.id !== handId)
    if (handId.startsWith('local-') && localSession.value?.hands) {
      const idx = parseInt(handId.replace('local-', ''), 10)
      if (idx >= 0) { localSession.value.hands.splice(idx, 1); localStorage.setItem('holdem-session-stats', JSON.stringify(localSession.value)) }
    }
  }

  // ─── Computed Stats ────────────────────────────────────

  const lifetimeStats = computed(() => {
    const totalHands = hands.value.length
    const won = hands.value.filter(h => h.result === 'won').length
    const lost = hands.value.filter(h => h.result === 'lost').length
    const folded = hands.value.filter(h => h.result === 'folded').length
    const totalProfit = hands.value.reduce((sum, h) => sum + h.profit, 0)
    const totalSessions = sessions.value.length
    const biggestWin = hands.value.reduce((max, h) => Math.max(max, h.profit), 0)
    const biggestLoss = hands.value.reduce((min, h) => Math.min(min, h.profit), 0)
    const avgPot = totalHands > 0 ? hands.value.reduce((sum, h) => sum + h.pot_size, 0) / totalHands : 0
    const avgProfit = totalSessions > 0 ? totalProfit / totalSessions : 0
    const handsPerSession = totalSessions > 0 ? Math.round(totalHands / totalSessions) : 0
    const foldPct = totalHands > 0 ? (folded / totalHands) * 100 : 0
    const showdownRate = totalHands > 0 ? ((won + lost) / totalHands) * 100 : 0
    const wonAtShowdown = (won + lost) > 0 ? (won / (won + lost)) * 100 : 0
    return { totalHands, won, lost, folded, totalProfit, totalSessions, biggestWin, biggestLoss, avgPot, avgProfit, handsPerSession, foldPct, showdownRate, wonAtShowdown }
  })

  const winRate = computed(() => lifetimeStats.value.totalHands === 0 ? 0 : (lifetimeStats.value.won / lifetimeStats.value.totalHands) * 100)

  const sessionSummary = computed(() => {
    const winning = sessions.value.filter(s => s.total_profit > 0).length
    const losing = sessions.value.filter(s => s.total_profit < 0).length
    const breakeven = sessions.value.filter(s => s.total_profit === 0).length
    const bestSession = sessions.value.reduce((best, s) => s.total_profit > best ? s.total_profit : best, 0)
    const worstSession = sessions.value.reduce((worst, s) => s.total_profit < worst ? s.total_profit : worst, 0)
    return { winning, losing, breakeven, bestSession, worstSession }
  })

  const positionStats = computed(() => {
    const source = selectedSession.value ? hands.value.filter(h => h.session_id === selectedSession.value!.id) : hands.value
    const map = new Map<string, { played: number; won: number; profit: number }>()
    for (const h of source) {
      const pos = h.position || 'Unknown'
      const entry = map.get(pos) || { played: 0, won: 0, profit: 0 }
      entry.played++; if (h.result === 'won') entry.won++; entry.profit += h.profit; map.set(pos, entry)
    }
    return [...map.entries()].map(([position, stats]) => ({ position, ...stats, winRate: (stats.won / stats.played) * 100 })).sort((a, b) => b.profit - a.profit)
  })

  const sessionHands = computed(() => selectedSession.value ? hands.value.filter(h => h.session_id === selectedSession.value!.id) : [])

  const profitTimeline = computed(() => {
    const source = selectedSession.value ? sessionHands.value : hands.value
    const recent = [...source].reverse().slice(-50)
    let running = 0
    return recent.map(h => { running += h.profit; return running })
  })

  const displayedHands = computed(() => {
    let source = selectedSession.value ? sessionHands.value : hands.value
    if (positionFilter.value) source = source.filter(h => h.position === positionFilter.value)
    return source
  })

  const recentHands = computed(() => {
    const source = selectedSession.value ? hands.value.filter(h => h.session_id === selectedSession.value!.id) : hands.value
    return source.slice(0, 20)
  })

  // ─── Helpers ───────────────────────────────────────────

  const stakeNames: Record<number, string> = { 1: 'Micro', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Big', 6: 'Nosebleed' }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function formatProfit(n: number): string {
    return `${n >= 0 ? '+' : ''}$${n}`
  }

  function getStakeFromLevel(level: number): { sb: number; bb: number } {
    const stakes: Record<number, { sb: number; bb: number }> = {
      1: { sb: 0.25, bb: 0.50 }, 2: { sb: 0.50, bb: 1 }, 3: { sb: 1, bb: 2 },
      4: { sb: 2.50, bb: 5 }, 5: { sb: 5, bb: 10 }, 6: { sb: 25, bb: 50 },
    }
    return stakes[level] || { sb: 1, bb: 2 }
  }

  function boardCards(board: string): string[] {
    return board.split(' ').filter(Boolean)
  }

  function drillIntoPosition(position: string) {
    positionFilter.value = position
  }

  // ─── Export Functions ──────────────────────────────────

  function csvEscape(val: unknown): string {
    const s = String(val ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  function exportLifetimeJSON() {
    downloadFile(JSON.stringify({ exportedAt: new Date().toISOString(), lifetime: lifetimeStats.value, winRate: winRate.value, sessionSummary: sessionSummary.value, positionStats: positionStats.value, sessions: sessions.value, hands: hands.value }, null, 2), `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
  }
  function exportLifetimeCSV() {
    const headers = ['Hand #', 'Session', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size', 'Stake', 'Players', 'Played At']
    const rows = hands.value.map(h => [h.hand_number, h.session_id.slice(0, 8), csvEscape(h.hole_cards), csvEscape(h.board || ''), csvEscape(h.position), h.result, h.profit, h.pot_size, h.stake_level, h.player_count, h.played_at].join(','))
    downloadFile([headers.join(','), ...rows].join('\n'), `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
  }
  function exportLifetimePokerStars() {
    const stakeLevel = hands.value[0] ? getStakeFromLevel(hands.value[0].stake_level) : { sb: 1, bb: 2 }
    downloadFile(exportHandsAsPokerStars(hands.value, stakeLevel), `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain')
  }
  function exportSessionJSON(s: SessionRow) {
    const sHands = hands.value.filter(h => h.session_id === s.id)
    downloadFile(JSON.stringify({ session: s, hands: sHands }, null, 2), `holdem-session-${s.id.slice(0, 8)}.json`, 'application/json')
  }
  function exportSessionCSV(s: SessionRow) {
    const sHands = hands.value.filter(h => h.session_id === s.id)
    const headers = ['Hand #', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size', 'Played At']
    const rows = sHands.map(h => [h.hand_number, csvEscape(h.hole_cards), csvEscape(h.board || ''), csvEscape(h.position), h.result, h.profit, h.pot_size, h.played_at].join(','))
    downloadFile([headers.join(','), ...rows].join('\n'), `holdem-session-${s.id.slice(0, 8)}.csv`, 'text/csv')
  }
  function exportSessionPokerStars(s: SessionRow) {
    const sHands = hands.value.filter(h => h.session_id === s.id)
    downloadFile(exportHandsAsPokerStars(sHands, getStakeFromLevel(s.stake_level)), `holdem-session-${s.id.slice(0, 8)}.txt`, 'text/plain')
  }
  function exportSingleHandPokerStars(h: HandRow) {
    downloadFile(toPokerStarsFormat(h, getStakeFromLevel(h.stake_level)), `holdem-hand-${h.hand_number}.txt`, 'text/plain')
  }

  return {
    // State
    loading, error, sessions, hands, localSession,
    selectedSession, positionFilter,
    // Computed
    lifetimeStats, winRate, sessionSummary, positionStats, sessionHands,
    profitTimeline, displayedHands, recentHands,
    // Actions
    init, deleteAllData, deleteSession, deleteHand,
    drillIntoPosition,
    // Export
    exportLifetimeJSON, exportLifetimeCSV, exportLifetimePokerStars,
    exportSessionJSON, exportSessionCSV, exportSessionPokerStars,
    exportSingleHandPokerStars,
    // Helpers
    stakeNames, formatDate, formatProfit, getStakeFromLevel, boardCards,
    downloadFile,
  }
}
