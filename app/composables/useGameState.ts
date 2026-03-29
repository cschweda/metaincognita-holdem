/**
 * Shared game state — reactive refs and computed properties used by
 * both the main game page (index.vue) and the replay page (replay.vue).
 */
import type { Card } from '~/utils/cards'
import type { TiltState } from '~/utils/botDecision'

export interface PlayerState {
  id: number
  name: string
  chips: number
  holeCards: [Card, Card] | null
  folded: boolean
  eliminated: boolean
  isHero: boolean
  lastAction: string | null
  currentBetAmount: number
  betThisRound: number
  totalInvested: number  // total chips invested this hand (blinds + all bets)
  tilt: TiltState
  tiltMultiplier: number
}

export function useGameState(bb: Ref<number>, currentBetRef?: Ref<number>) {
  const playerStates = ref<PlayerState[]>([])
  const dealerSeat = ref(0)
  const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
  const dealt = ref(false)
  const activeSeat = ref(-1)
  const pot = ref(0)
  const currentBet = currentBetRef ?? ref(0)
  const waitingForHero = ref(false)
  const allCommunity = ref<Card[]>([])
  const animating = ref(false)
  const handActionLog = ref<string[]>([])
  const streetAtEnd = ref<string>('preflop')
  const heroWonHand = ref(false)
  const heroWinAmount = ref(0)
  const heroTotalWagered = ref(0)
  const handWinnerName = ref('')
  const handWinnerId = ref(-1)
  const needsToAct = ref<Set<number>>(new Set())

  const hero = computed(() => playerStates.value[0])
  const heroHoleCards = computed(() => hero.value?.holeCards || null)

  const visibleCommunity = computed(() => {
    const s = street.value === 'showdown' ? streetAtEnd.value : street.value
    switch (s) {
      case 'preflop': return []
      case 'flop': return allCommunity.value.slice(0, 3)
      case 'turn': return allCommunity.value.slice(0, 4)
      case 'river': return allCommunity.value.slice(0, 5)
      default: return []
    }
  })

  const toCall = computed(() => {
    if (!hero.value) return 0
    return Math.max(0, currentBet.value - hero.value.betThisRound)
  })

  const minRaise = computed(() => {
    if (currentBet.value === 0) return bb.value
    return currentBet.value + bb.value
  })

  const maxRaise = computed(() => hero.value?.chips || 0)
  const heroTurn = computed(() => waitingForHero.value && !hero.value?.folded && street.value !== 'showdown')
  const heroBusted = computed(() => hero.value && hero.value.chips <= 0 && street.value === 'showdown')
  const activePlayers = computed(() => playerStates.value.filter(p => !p.folded && !p.eliminated))
  const activeNonAllIn = computed(() => activePlayers.value.filter(p => p.chips > 0))

  function resetGameState() {
    pot.value = 0
    currentBet.value = 0
    activeSeat.value = -1
    waitingForHero.value = false
    street.value = 'preflop'
    dealt.value = true
    heroWonHand.value = false
    heroWinAmount.value = 0
    heroTotalWagered.value = 0
    handWinnerId.value = -1
    handWinnerName.value = ''
    streetAtEnd.value = 'preflop'
  }

  return {
    playerStates, dealerSeat, street, dealt, activeSeat,
    pot, currentBet, waitingForHero, allCommunity, animating,
    handActionLog, streetAtEnd, heroWonHand, heroWinAmount,
    heroTotalWagered, handWinnerName, handWinnerId, needsToAct,
    hero, heroHoleCards, visibleCommunity, toCall, minRaise, maxRaise,
    heroTurn, heroBusted, activePlayers, activeNonAllIn,
    resetGameState,
  }
}
