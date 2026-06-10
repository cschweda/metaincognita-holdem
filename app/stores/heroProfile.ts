import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import config from '@config'

export interface HeroHandRecord {
  enteredPot: boolean       // hero voluntarily put chips in (not just BB)
  faced3Bet: boolean        // hero faced a 3-bet this hand
  foldedTo3Bet: boolean     // hero folded to a 3-bet
  facedCbet: boolean        // hero faced a c-bet postflop
  foldedToCbet: boolean     // hero folded to a c-bet
  raiseCount: number        // number of raises/bets hero made
  callCount: number         // number of calls hero made
  checkCount: number        // number of checks hero made
}

export const useHeroProfileStore = defineStore('heroProfile', () => {
  const windowSize = config.sessionMemory.windowSize
  const recentHands = ref<HeroHandRecord[]>([])

  const heroVpip = computed(() => {
    if (recentHands.value.length === 0) return 0
    const entered = recentHands.value.filter(h => h.enteredPot).length
    return entered / recentHands.value.length
  })

  const heroFoldTo3Bet = computed(() => {
    const faced = recentHands.value.filter(h => h.faced3Bet)
    if (faced.length === 0) return 0
    return faced.filter(h => h.foldedTo3Bet).length / faced.length
  })

  const heroFoldToCbet = computed(() => {
    const faced = recentHands.value.filter(h => h.facedCbet)
    if (faced.length === 0) return 0
    return faced.filter(h => h.foldedToCbet).length / faced.length
  })

  const heroAggression = computed(() => {
    const totalRaises = recentHands.value.reduce((sum, h) => sum + h.raiseCount, 0)
    const totalCalls = recentHands.value.reduce((sum, h) => sum + h.callCount, 0)
    if (totalCalls === 0) return totalRaises > 0 ? 2.0 : 0
    return totalRaises / totalCalls
  })

  const handsTracked = computed(() => recentHands.value.length)

  function recordHeroAction(record: HeroHandRecord) {
    recentHands.value.push(record)
    if (recentHands.value.length > windowSize) {
      recentHands.value.shift()
    }
  }

  // ─── Bet-sizing tell ────────────────────────────────────────
  // Tracks hero's postflop bet sizings; at showdowns where hero's hand is
  // revealed, the hand's average sizing is classified strong/weak. After 8+
  // classified showdowns (4 strong + 4 weak), bots can read the pattern.
  interface ShowdownSizing { avgSizing: number; wasStrong: boolean }
  const showdownSizings = ref<ShowdownSizing[]>([])
  const pendingSizings = ref<number[]>([])

  function recordHeroBetSizing(betToPot: number) {
    pendingSizings.value.push(betToPot)
  }

  function finalizeHandSizing(showdown: { shown: boolean; strong: boolean } | null) {
    if (showdown?.shown && pendingSizings.value.length > 0) {
      const avg = pendingSizings.value.reduce((s, x) => s + x, 0) / pendingSizings.value.length
      showdownSizings.value.push({ avgSizing: avg, wasStrong: showdown.strong })
      if (showdownSizings.value.length > 30) showdownSizings.value.shift()
    }
    pendingSizings.value = []
  }

  const betSizingTell = computed(() => {
    const strong = showdownSizings.value.filter(r => r.wasStrong)
    const weak = showdownSizings.value.filter(r => !r.wasStrong)
    if (strong.length < 4 || weak.length < 4) return undefined
    const avg = (rs: ShowdownSizing[]) => rs.reduce((s, r) => s + r.avgSizing, 0) / rs.length
    const strongAvgSizing = avg(strong)
    const weakAvgSizing = avg(weak)
    if (Math.abs(strongAvgSizing - weakAvgSizing) < 0.15) {
      return { hasTell: false, bigWithValue: false, strongAvgSizing, weakAvgSizing }
    }
    return { hasTell: true, bigWithValue: strongAvgSizing > weakAvgSizing, strongAvgSizing, weakAvgSizing }
  })

  function reset() {
    recentHands.value = []
    showdownSizings.value = []
    pendingSizings.value = []
  }

  return {
    recentHands,
    heroVpip,
    heroFoldTo3Bet,
    heroFoldToCbet,
    heroAggression,
    handsTracked,
    recordHeroAction,
    recordHeroBetSizing,
    finalizeHandSizing,
    betSizingTell,
    reset,
  }
})
