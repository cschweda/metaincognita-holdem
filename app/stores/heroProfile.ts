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

  function reset() {
    recentHands.value = []
  }

  return {
    recentHands,
    heroVpip,
    heroFoldTo3Bet,
    heroFoldToCbet,
    heroAggression,
    handsTracked,
    recordHeroAction,
    reset,
  }
})
