<script setup lang="ts">
/**
 * Real-time stats panel — shows hand analysis (made hand, draws, outs, equity),
 * preflop ranges, hand improvement probabilities, action recommendations,
 * opponent tracked stats (VPIP/PFR/AF/WTSD), session summary, and
 * provides export (JSON/CSV) and session-reset controls.
 */
import type { Card, Suit } from '~/utils/cards'
import { displayCard, RANK_DISPLAY, SUIT_SYMBOLS } from '~/utils/cards'
import { HAND_RANK_NAMES, type HandAnalysis, analyzeHand } from '~/utils/handAnalysis'
import { getRelevantRanges, categorizeHands, type RangeInfo } from '~/utils/ranges'

interface PlayerStat {
  name: string
  handsPlayed: number
  vpip: number
  pfr: number
  af: number
  wtsd: number
}

const props = defineProps<{
  holeCards: [Card, Card] | null
  community: Card[]
  street: string
  numOpponents: number
  position: string
  pot?: number
  toCall?: number
  heroChips?: number
  playerStats?: PlayerStat[]
  heroTurn?: boolean
  heroFolded?: boolean
  heroWon?: boolean
  winAmount?: number
  heroWagered?: number
  heroNetProfit?: number
  winnerName?: string
  winnerCards?: string
  sessionStats?: {
    handsPlayed: number
    handsWon: number
    handsLost: number
    handsFolded: number
    totalProfit: number
    currentStack: number
    startingStack: number
    peakStack: number
  } | null
  supabaseConnected?: boolean
}>()

const emit = defineEmits<{
  fold: []
  check: []
  call: [amount: number]
  exportJson: []
  exportCsv: []
  resetSession: []
}>()

function handleActionClick() {
  if (!props.heroTurn || !analysis.value) return
  const action = analysis.value.action
  if (action === 'FOLD') emit('fold')
  else if (action === 'CHECK') emit('check')
  else if (action === 'CALL') emit('call', props.toCall || 0)
}

const isClickableAction = computed(() => {
  if (!props.heroTurn || !analysis.value) return false
  return ['FOLD', 'CHECK', 'CALL'].includes(analysis.value.action)
})

// ─── Hand Analysis ─────────────────────────────────────────────
const analysis = computed<HandAnalysis | null>(() => {
  if (!props.holeCards) return null
  return analyzeHand(
    props.holeCards,
    props.community,
    props.street,
    props.numOpponents,
    props.position,
    props.toCall || 0,
  )
})

// ─── Out Cards (specific cards that complete each draw) ────────
const outCards = computed<Map<number, string[]>>(() => {
  const result = new Map<number, string[]>()
  if (!analysis.value || !props.holeCards) return result

  const known = new Set<string>()
  for (const c of props.holeCards) known.add(`${c.rank}-${c.suit}`)
  for (const c of props.community) known.add(`${c.rank}-${c.suit}`)

  const allCards = [...props.holeCards, ...props.community]
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

  for (let i = 0; i < analysis.value.draws.length; i++) {
    const draw = analysis.value.draws[i]
    const cards: string[] = []

    if (draw.type.includes('Flush draw')) {
      // Find the flush suit (the one with 4 cards)
      const suitCounts = new Map<Suit, number>()
      for (const c of allCards) suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1)
      for (const [suit, count] of suitCounts) {
        if (count === 4) {
          for (let rank = 2; rank <= 14; rank++) {
            if (!known.has(`${rank}-${suit}`)) {
              cards.push(`${RANK_DISPLAY[rank]}${SUIT_SYMBOLS[suit]}`)
            }
          }
        }
      }
    } else if (draw.type.includes('straight')) {
      // Find ALL missing ranks that complete a straight (OESD has 2 windows)
      const uniqueRanks = [...new Set(allCards.map(c => c.rank))]
      const foundRanks = new Set<number>()
      for (let low = 1; low <= 10; low++) {
        const window = [low, low + 1, low + 2, low + 3, low + 4]
        const need = window.filter(r => {
          const actual = r === 1 ? 14 : r
          return !uniqueRanks.includes(actual) && !(r === 1 && uniqueRanks.includes(14))
        })
        if (need.length === 1) {
          const missingRank = need[0] === 1 ? 14 : need[0]
          if (!foundRanks.has(missingRank)) {
            foundRanks.add(missingRank)
            for (const suit of suits) {
              if (!known.has(`${missingRank}-${suit}`)) {
                cards.push(`${RANK_DISPLAY[missingRank]}${SUIT_SYMBOLS[suit]}`)
              }
            }
          }
        }
      }
    } else if (draw.type.includes('Full house') || draw.type.includes('Trips') || draw.type.includes('Set') || draw.type.includes('Quads')) {
      // Outs are remaining cards of the paired/trip ranks
      for (const rank of draw.cards) {
        for (const suit of suits) {
          if (!known.has(`${rank}-${suit}`)) {
            cards.push(`${RANK_DISPLAY[rank]}${SUIT_SYMBOLS[suit]}`)
          }
        }
      }
    } else if (draw.type.includes('overcard')) {
      for (const rank of draw.cards) {
        for (const suit of suits) {
          if (!known.has(`${rank}-${suit}`)) {
            cards.push(`${RANK_DISPLAY[rank]}${SUIT_SYMBOLS[suit]}`)
          }
        }
      }
    }

    result.set(i, cards)
  }
  return result
})

// ─── Ranges ────────────────────────────────────────────────────
const ranges = computed(() => getRelevantRanges(props.position, props.street))
const expandedRange = ref<number | null>(null)

function toggleRange(index: number) {
  expandedRange.value = expandedRange.value === index ? null : index
}

// ─── Pot Odds ──────────────────────────────────────────────────
const potOdds = computed(() => {
  const pot = props.pot || 0
  const toCall = props.toCall || 0
  if (toCall === 0) return null
  const ratio = pot / toCall
  const pct = (toCall / (pot + toCall)) * 100
  return { ratio: ratio.toFixed(1), percentage: pct.toFixed(1) }
})

const potOddsVerdict = computed(() => {
  if (!potOdds.value || !analysis.value) return null
  const equity = analysis.value.equity
  const needed = parseFloat(potOdds.value.percentage)
  if (equity >= needed) return { pass: true, text: 'Odds justify a call' }
  return { pass: false, text: 'Fold — odds don\'t justify' }
})

// ─── Expected Value (EV) ──────────────────────────────────────
const expectedValue = computed<number | null>(() => {
  if (!analysis.value) return null
  const pot = props.pot || 0
  const toCall = props.toCall || 0
  if (toCall === 0) return null // nothing to evaluate when not facing a bet
  const equity = analysis.value.equity / 100 // convert from 0-100 to 0-1
  // EV = (equity × total pot after calling) - call amount
  const ev = equity * (pot + toCall) - toCall
  return ev
})

// ─── SPR (Stack-to-Pot Ratio) ──────────────────────────────────
const spr = computed(() => {
  const pot = props.pot || 1
  const stack = props.heroChips || 0
  return (stack / pot).toFixed(1)
})

// ─── Style helpers ─────────────────────────────────────────────
const tierColor = computed(() => {
  if (!analysis.value) return 'bg-gray-700'
  switch (analysis.value.preflopTier) {
    case 'premium': return 'bg-green-600'
    case 'strong': return 'bg-blue-600'
    case 'playable': return 'bg-yellow-600'
    case 'marginal': return 'bg-orange-600'
    case 'trash': return 'bg-red-600'
  }
})

const equityColor = computed(() => {
  if (!analysis.value) return 'text-gray-400'
  const eq = analysis.value.equity
  if (eq >= 65) return 'text-green-400'
  if (eq >= 45) return 'text-blue-400'
  if (eq >= 30) return 'text-yellow-400'
  return 'text-red-400'
})

const actionColor = computed(() => {
  if (!analysis.value) return 'bg-gray-700'
  switch (analysis.value.action) {
    case 'RAISE': return 'bg-green-600'
    case 'CALL': return 'bg-yellow-600'
    case 'CHECK': return 'bg-gray-600'
    case 'FOLD': return 'bg-red-600'
  }
})

const positionTooltip = computed(() => {
  const pos = props.position
  if (pos.includes('BTN') || pos === 'D' || pos.includes('D/')) {
    return 'Button — best position. You act last postflop, giving you maximum information. Play a wide range.'
  }
  if (pos === 'CO') return 'Cutoff — second-best position. Wide opening range, good for steals.'
  if (pos === 'SB' || pos === 'D/SB') return 'Small Blind — worst postflop position. You act first every street. Play tighter unless stealing.'
  if (pos === 'BB') return 'Big Blind — you already have money in. Defend wider vs steals, but you\'re out of position postflop.'
  if (pos.startsWith('UTG')) return 'Under the Gun — earliest position. Play only strong hands (top 15%). Everyone acts after you.'
  if (pos.startsWith('MP')) return 'Middle Position — play solid hands. Tighter than late position, wider than UTG.'
  return `Position: ${pos}`
})

// Color for the recommendation reasoning text
const reasoningColor = computed(() => {
  if (!analysis.value) return 'text-gray-300'
  const eq = analysis.value.equity
  const action = analysis.value.action
  // Green: strong position, confident play
  if (action === 'RAISE' && eq >= 55) return 'text-green-400'
  if (action === 'RAISE') return 'text-green-400/80'
  // Yellow: marginal, proceed with caution
  if (action === 'CALL') return 'text-yellow-400/80'
  if (action === 'CHECK' && eq >= 40) return 'text-yellow-400/70'
  if (action === 'CHECK') return 'text-gray-400'
  // Red: weak, not recommended to continue
  if (action === 'FOLD') return 'text-red-400/80'
  return 'text-gray-300'
})

// ─── Tabs ──────────────────────────────────────────────────────
const activeTab = ref<'hand' | 'ranges' | 'opponents' | 'session'>('hand')

function formatHoleCards(cards: [Card, Card]): string {
  return `${displayCard(cards[0])} ${displayCard(cards[1])}`
}

function isInRange(hands: string[]): boolean {
  if (!props.holeCards) return false
  const [a, b] = [...props.holeCards].sort((x, y) => y.rank - x.rank)
  const RANK_MAP: Record<number, string> = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' }
  const r1 = RANK_MAP[a.rank] || ''
  const r2 = RANK_MAP[b.rank] || ''
  if (a.rank === b.rank) return hands.includes(`${r1}${r2}`)
  const suffix = a.suit === b.suit ? 's' : 'o'
  return hands.includes(`${r1}${r2}${suffix}`)
}

function formatStatPct(val: number): string {
  return `${Math.round(val)}%`
}

function vpipLabel(vpip: number): string {
  if (vpip < 18) return 'Tight'
  if (vpip < 26) return 'Solid'
  if (vpip < 34) return 'Loose'
  return 'Very loose'
}

function afLabel(af: number): string {
  if (af < 0.8) return 'Passive'
  if (af < 1.5) return 'Balanced'
  if (af < 2.5) return 'Aggressive'
  return 'Hyper-aggressive'
}
</script>

<template>
  <div class="w-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden text-sm">
    <!-- Tab bar -->
    <div class="flex border-b border-gray-700/50">
      <button
        v-for="tab in (['hand', 'session', 'ranges', 'opponents'] as const)"
        :key="tab"
        class="flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
        :class="activeTab === tab
          ? 'text-white bg-gray-800/60 border-b-2 border-green-500'
          : 'text-gray-500 hover:text-gray-300'"
        @click="activeTab = tab"
      >
        {{ tab === 'hand' ? 'Live' : tab === 'session' ? 'Session' : tab === 'ranges' ? 'Ranges' : 'Table' }}
      </button>
    </div>

    <div class="p-4 space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto">

      <!-- ═══ LIVE HAND TAB ═══ -->
      <template v-if="activeTab === 'hand'">
        <template v-if="analysis && holeCards">
          <!-- Hero's Hand -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-gray-400 text-xs">Your Hand</span>
              <span class="font-mono text-base">{{ formatHoleCards(holeCards) }}</span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-semibold text-white" :class="tierColor">
                {{ analysis.preflopTierLabel }}
              </span>
              <UTooltip text="Classic Chen formula — raw preflop hand strength (0-20). Based on pairs, suited cards, connectedness, and high cards. Does not account for position or playstyle.">
                <span class="text-gray-500 text-xs border-b border-dotted border-gray-600 cursor-help">Chen: {{ analysis.chenScore }}</span>
              </UTooltip>
              <UTooltip text="Chen+ — position- and style-adjusted hand strength. Adds bonuses for late position (BTN/CO), suited connectors for loose players, and big cards for tight-aggressive players. This is what bots use for decisions.">
                <span class="text-gray-300 text-xs font-semibold border-b border-dotted border-gray-600 cursor-help">Chen+: {{ analysis.chenMaxScore }}</span>
              </UTooltip>
              <UTooltip :text="positionTooltip">
                <span class="text-gray-500 text-xs border-b border-dotted border-gray-600 cursor-help">Pos: {{ position }}</span>
              </UTooltip>
            </div>
          </div>

          <!-- Made Hand -->
          <div v-if="street !== 'preflop'" class="border-t border-gray-700/50 pt-3">
            <div class="text-xs text-gray-400">Current Hand</div>
            <div class="text-base font-semibold text-white mt-0.5">{{ analysis.handDescription }}</div>
            <div v-if="analysis.madeHand" class="text-xs text-gray-500 mt-0.5">
              {{ HAND_RANK_NAMES[analysis.madeHand.rank] }}
            </div>
          </div>

          <!-- Equity -->
          <div class="border-t border-gray-700/50 pt-3">
            <div class="flex items-center justify-between mb-1">
              <UTooltip text="Your chance of winning this hand if all remaining cards are dealt out. Calculated via Monte Carlo simulation (300-500 random runouts).">
                <span class="text-xs text-gray-400 border-b border-dotted border-gray-600 cursor-help">Equity vs {{ numOpponents }} opponent{{ numOpponents > 1 ? 's' : '' }}</span>
              </UTooltip>
              <span class="text-lg font-bold font-mono" :class="equityColor">{{ analysis.equity }}%</span>
            </div>
            <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="analysis.equity >= 50 ? 'bg-green-500' : analysis.equity >= 30 ? 'bg-yellow-500' : 'bg-red-500'"
                :style="{ width: `${Math.max(2, analysis.equity)}%` }"
              />
            </div>
          </div>

          <!-- Hand Probabilities -->
          <div v-if="analysis.handProbabilities && analysis.handProbabilities.length > 0" class="border-t border-gray-700/50 pt-3">
            <UTooltip text="Probability of making each hand rank by the river, calculated from 400 random board runouts. Green = your current hand. Blue/yellow = possible improvements.">
              <div class="text-xs text-gray-400 mb-2 border-b border-dotted border-gray-600 cursor-help inline-block">
                {{ street === 'preflop' ? 'Chance by River' : street === 'river' || street === 'showdown' ? 'Final Hand' : 'Chance to Improve' }}
              </div>
            </UTooltip>
            <div class="space-y-1">
              <template v-for="hp in analysis.handProbabilities" :key="hp.rank">
                <div
                  v-if="hp.probability > 0 || hp.current"
                  class="flex items-center gap-2 text-xs"
                >
                  <span class="w-24 truncate" :class="hp.current ? 'text-green-400 font-semibold' : 'text-gray-400'">
                    {{ hp.name }}
                  </span>
                  <div class="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="hp.current ? 'bg-green-500' : hp.probability >= 20 ? 'bg-blue-500' : hp.probability >= 5 ? 'bg-yellow-500/70' : 'bg-gray-600'"
                      :style="{ width: `${Math.max(hp.probability > 0 ? 2 : 0, hp.probability)}%` }"
                    />
                  </div>
                  <span
                    class="w-12 text-right font-mono"
                    :class="hp.current ? 'text-green-400' : hp.probability >= 20 ? 'text-blue-400' : hp.probability >= 5 ? 'text-yellow-400' : 'text-gray-600'"
                  >
                    {{ hp.current && hp.probability === 100 ? '✓' : `${hp.probability}%` }}
                  </span>
                </div>
              </template>
            </div>
          </div>

          <!-- Pot Odds -->
          <div v-if="potOdds" class="border-t border-gray-700/50 pt-3">
            <UTooltip text="The ratio between the pot and the amount you need to call. If your equity exceeds the required percentage, calling is mathematically profitable.">
              <div class="text-xs text-gray-400 mb-1 border-b border-dotted border-gray-600 cursor-help inline-block">Pot Odds</div>
            </UTooltip>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-gray-800/50 rounded px-2 py-1">
                <div class="text-gray-500">Ratio</div>
                <div class="text-white font-mono">{{ potOdds.ratio }} : 1</div>
              </div>
              <div class="bg-gray-800/50 rounded px-2 py-1">
                <div class="text-gray-500">Need</div>
                <div class="text-white font-mono">{{ potOdds.percentage }}%</div>
              </div>
            </div>
            <div v-if="potOddsVerdict" class="mt-1.5 text-xs font-semibold"
              :class="potOddsVerdict.pass ? 'text-green-400' : 'text-red-400'">
              {{ potOddsVerdict.pass ? '✓' : '✗' }} {{ potOddsVerdict.text }}
            </div>
          </div>

          <!-- Expected Value (EV) -->
          <div v-if="expectedValue !== null" class="border-t border-gray-700/50 pt-3">
            <div class="flex items-center justify-between">
              <UTooltip text="Expected Value — the average profit or loss of calling this bet over many hands. Positive EV (+EV) means the call is profitable long-term. Calculated as: (equity × pot) - ((1 - equity) × call amount). Fold EV is always $0.">
                <span class="text-xs text-gray-400 border-b border-dotted border-gray-600 cursor-help">Expected Value</span>
              </UTooltip>
              <span class="text-lg font-bold font-mono" :class="expectedValue >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ expectedValue >= 0 ? '+' : '' }}${{ expectedValue.toFixed(1) }}
              </span>
            </div>
            <div class="text-[0.6rem] mt-0.5" :class="expectedValue >= 0 ? 'text-green-500/70' : 'text-red-500/70'">
              {{ expectedValue >= 0 ? '+EV — profitable call long-term' : '-EV — calling loses money long-term' }}
            </div>
          </div>

          <!-- SPR -->
          <div v-if="heroChips && pot" class="border-t border-gray-700/50 pt-3">
            <div class="flex items-center justify-between text-xs">
              <UTooltip text="Stack-to-Pot Ratio — your remaining stack divided by the pot. Low SPR (<4) means you're committed; high SPR (>10) means be careful putting your whole stack in.">
                <span class="text-gray-400 border-b border-dotted border-gray-600 cursor-help">SPR (Stack-to-Pot)</span>
              </UTooltip>
              <span class="text-white font-mono">{{ spr }}</span>
            </div>
            <div class="text-[0.6rem] text-gray-500 mt-0.5">
              <template v-if="parseFloat(spr) < 4">Low SPR — commit with strong hands</template>
              <template v-else-if="parseFloat(spr) < 10">Medium SPR — standard play</template>
              <template v-else>High SPR — be cautious committing your stack</template>
            </div>
          </div>

          <!-- Draws & Outs -->
          <div v-if="street !== 'preflop'" class="border-t border-gray-700/50 pt-3">
            <UTooltip text="Draws are incomplete hands that could improve (e.g., 4 cards to a flush). Outs are the specific cards that complete your draw. More outs = better chance of improving.">
              <div class="text-xs text-gray-400 mb-1.5 border-b border-dotted border-gray-600 cursor-help inline-block">Draws &amp; Outs</div>
            </UTooltip>
            <template v-if="analysis.draws.length > 0">
              <div class="space-y-2">
                <div v-for="(draw, i) in analysis.draws" :key="i"
                  class="bg-gray-800/50 rounded px-2 py-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-gray-200 text-xs">{{ draw.type }}</span>
                    <span class="font-mono text-xs font-semibold text-blue-400">{{ draw.outs }} outs</span>
                  </div>
                  <div v-if="outCards.get(i)?.length" class="mt-1 text-[0.65rem] font-mono text-gray-400 leading-relaxed">
                    {{ outCards.get(i)!.join('  ') }}
                  </div>
                </div>
              </div>
              <div class="mt-2 text-xs text-gray-400">
                Total: <span class="text-white font-semibold">{{ analysis.totalOuts }}</span> outs
              </div>
              <div class="mt-1 space-y-0.5">
                <div class="flex justify-between text-xs">
                  <span class="text-gray-400">Next card</span>
                  <span class="text-gray-200 font-mono">{{ analysis.probNextCard }}%</span>
                </div>
                <div v-if="street === 'flop'" class="flex justify-between text-xs">
                  <span class="text-gray-400">By river</span>
                  <span class="text-gray-200 font-mono">{{ analysis.probByRiver }}%</span>
                </div>
              </div>
              <div class="mt-1 text-[0.65rem] text-gray-500 italic">
                Rule of {{ street === 'flop' ? '4' : '2' }}: {{ analysis.totalOuts }} × {{ street === 'flop' ? '4' : '2' }} ≈ {{ analysis.totalOuts * (street === 'flop' ? 4 : 2) }}%
              </div>
            </template>
            <div v-else class="text-xs text-gray-500 italic">No active draws</div>
          </div>

          <!-- Hand result (showdown or fold) -->
          <div v-if="street === 'showdown'" class="border-t border-gray-700/50 pt-3 space-y-3">
            <!-- Result banner -->
            <div
              class="rounded-lg px-4 py-3 text-center"
              :class="heroWon ? 'bg-green-600/30 border border-green-500/30' : heroFolded ? 'bg-gray-700/30 border border-gray-600/30' : 'bg-red-600/20 border border-red-500/20'"
            >
              <div class="text-2xl font-bold" :class="heroWon ? 'text-green-400' : heroFolded ? 'text-gray-400' : 'text-red-400'">
                {{ heroWon ? 'YOU WIN' : heroFolded ? 'YOU FOLDED' : 'YOU LOSE' }}
              </div>
            </div>

            <!-- Winner info (always shown) -->
            <div v-if="winnerName" class="bg-gray-800/40 rounded-lg p-3">
              <div class="text-xs text-gray-400 mb-1">Winner</div>
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-base font-semibold" :class="heroWon ? 'text-green-400' : 'text-white'">
                    {{ winnerName }}
                  </span>
                  <span v-if="winnerCards" class="text-sm font-mono text-gray-300 ml-2">{{ winnerCards }}</span>
                </div>
                <span class="text-green-400 font-mono font-bold">+${{ winAmount || 0 }}</span>
              </div>
            </div>

            <!-- Detailed hand financials -->
            <div class="bg-gray-800/40 rounded-lg p-3 space-y-2">
              <div class="text-xs text-gray-400 mb-1">Your Result</div>
              <div class="flex justify-between text-xs">
                <span class="text-gray-400">Pot size</span>
                <span class="text-yellow-400 font-mono">${{ winAmount || 0 }}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-gray-400">You wagered</span>
                <span class="text-gray-200 font-mono">${{ heroWagered || 0 }}</span>
              </div>
              <div v-if="heroWon" class="flex justify-between text-xs">
                <span class="text-gray-400">You collected</span>
                <span class="text-green-400 font-mono">${{ winAmount || 0 }}</span>
              </div>
              <div class="flex justify-between text-xs border-t border-gray-700/30 pt-2">
                <span class="text-gray-300 font-semibold">Net profit</span>
                <span
                  class="font-mono font-bold text-sm"
                  :class="(heroNetProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'"
                >
                  {{ (heroNetProfit || 0) >= 0 ? '+' : '' }}${{ heroNetProfit || 0 }}
                </span>
              </div>
            </div>

            <!-- Hand made (if hero didn't fold) -->
            <div v-if="analysis?.madeHand && !heroFolded" class="bg-gray-800/40 rounded-lg p-3">
              <div class="text-xs text-gray-400 mb-1">Your hand</div>
              <div class="text-sm font-semibold text-white">{{ analysis.handDescription }}</div>
              <div class="text-xs text-gray-500">{{ HAND_RANK_NAMES[analysis.madeHand.rank] }}</div>
            </div>
          </div>

          <!-- Recommendation (hidden after fold or showdown) -->
          <div v-if="!heroFolded && street !== 'showdown'" class="border-t border-gray-700/50 pt-3">
            <UTooltip text="Suggested action based on your equity, position, draws, and pot odds. Green = confident play. Yellow = marginal, proceed carefully. Red = weak, consider folding.">
              <div class="text-xs text-gray-400 mb-1.5 border-b border-dotted border-gray-600 cursor-help inline-block">Recommendation</div>
            </UTooltip>
            <button
              class="w-full rounded-lg px-3 py-2 text-center transition-all"
              :class="[
                actionColor,
                isClickableAction
                  ? 'cursor-pointer hover:brightness-125 active:scale-[0.97] ring-1 ring-white/10'
                  : 'cursor-default',
              ]"
              :disabled="!isClickableAction"
              @click="handleActionClick"
            >
              <div class="text-lg font-bold text-white tracking-wide">
                {{ analysis.action }}
              </div>
              <div v-if="isClickableAction && heroTurn" class="text-[0.6rem] text-white/50 mt-0.5">
                click to {{ analysis.action.toLowerCase() }}
              </div>
            </button>
            <p class="mt-2 text-xs leading-relaxed" :class="reasoningColor">{{ analysis.reasoning }}</p>
          </div>
        </template>
        <div v-else class="text-center text-gray-500 text-xs py-8">Waiting for deal...</div>
      </template>

      <!-- ═══ RANGES TAB ═══ -->
      <template v-if="activeTab === 'ranges'">
        <div class="text-xs text-gray-400 mb-2">
          Position: <span class="text-white font-semibold">{{ position }}</span>
        </div>

        <div v-for="(range, i) in ranges" :key="i" class="border-t border-gray-700/50 pt-3">
          <button
            class="w-full flex items-center justify-between text-left"
            @click="toggleRange(i)"
          >
            <div>
              <div class="text-xs font-semibold text-white">{{ range.action }}</div>
              <div class="text-[0.65rem] text-gray-400">{{ range.description }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-green-400">{{ range.percentage }}%</span>
              <span class="text-gray-500 text-xs">{{ expandedRange === i ? '▲' : '▼' }}</span>
            </div>
          </button>

          <!-- Expanded hand list -->
          <div v-if="expandedRange === i" class="mt-2 bg-gray-800/50 rounded-lg p-2">
            <div class="mb-1.5">
              <span class="text-[0.6rem] text-gray-500">{{ range.hands.length }} combos</span>
            </div>
            <!-- Pairs -->
            <div v-if="categorizeHands(range.hands).pairs.length" class="mb-1">
              <span class="text-[0.6rem] text-yellow-500 font-semibold">Pairs: </span>
              <span class="text-[0.6rem] text-gray-300">
                {{ categorizeHands(range.hands).pairs.join(' ') }}
              </span>
            </div>
            <!-- Suited -->
            <div v-if="categorizeHands(range.hands).suited.length" class="mb-1">
              <span class="text-[0.6rem] text-blue-400 font-semibold">Suited: </span>
              <span class="text-[0.6rem] text-gray-300">
                {{ categorizeHands(range.hands).suited.join(' ') }}
              </span>
            </div>
            <!-- Offsuit -->
            <div v-if="categorizeHands(range.hands).offsuit.length">
              <span class="text-[0.6rem] text-gray-400 font-semibold">Offsuit: </span>
              <span class="text-[0.6rem] text-gray-300">
                {{ categorizeHands(range.hands).offsuit.join(' ') }}
              </span>
            </div>

            <!-- Is hero's hand in range? -->
            <div v-if="holeCards" class="mt-2 border-t border-gray-700/30 pt-1.5">
              <span class="text-[0.6rem]"
                :class="isInRange(range.hands) ? 'text-green-400' : 'text-red-400'">
                {{ isInRange(range.hands) ? '✓ Your hand is in this range' : '✗ Your hand is outside this range' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Facing aggression ranges -->
        <div class="border-t border-gray-700/50 pt-3 mt-2">
          <div class="text-xs font-semibold text-gray-300 mb-2">Facing Aggression</div>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between bg-gray-800/50 rounded px-2 py-1">
              <span class="text-gray-300">3-Bet range</span>
              <span class="text-green-400 font-mono">~8%</span>
            </div>
            <div class="flex justify-between bg-gray-800/50 rounded px-2 py-1">
              <span class="text-gray-300">Call vs 3-Bet</span>
              <span class="text-yellow-400 font-mono">~12%</span>
            </div>
            <div class="flex justify-between bg-gray-800/50 rounded px-2 py-1">
              <span class="text-gray-300">4-Bet range</span>
              <span class="text-orange-400 font-mono">~3.5%</span>
            </div>
            <div class="flex justify-between bg-gray-800/50 rounded px-2 py-1">
              <span class="text-gray-300">5-Bet range</span>
              <span class="text-red-400 font-mono">~1.5%</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ═══ SESSION TAB ═══ -->
      <template v-if="activeTab === 'session'">
        <template v-if="sessionStats">
          <!-- Key metrics -->
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
              <div class="text-2xl font-bold font-mono text-white">{{ sessionStats.handsPlayed }}</div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Hands Played</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
              <div
                class="text-2xl font-bold font-mono"
                :class="sessionStats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'"
              >
                {{ sessionStats.totalProfit >= 0 ? '+' : '' }}${{ sessionStats.totalProfit }}
              </div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Profit / Loss</div>
            </div>
          </div>

          <!-- Win/Loss/Fold breakdown -->
          <div class="border-t border-gray-700/50 pt-3">
            <div class="text-xs text-gray-400 mb-2">Results</div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-green-400">Won</span>
                <div class="flex items-center gap-2">
                  <div class="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full" :style="{ width: `${sessionStats.handsPlayed ? (sessionStats.handsWon / sessionStats.handsPlayed) * 100 : 0}%` }" />
                  </div>
                  <span class="text-white font-mono w-8 text-right">{{ sessionStats.handsWon }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-red-400">Lost</span>
                <div class="flex items-center gap-2">
                  <div class="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-red-500 rounded-full" :style="{ width: `${sessionStats.handsPlayed ? (sessionStats.handsLost / sessionStats.handsPlayed) * 100 : 0}%` }" />
                  </div>
                  <span class="text-white font-mono w-8 text-right">{{ sessionStats.handsLost }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Folded</span>
                <div class="flex items-center gap-2">
                  <div class="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-gray-500 rounded-full" :style="{ width: `${sessionStats.handsPlayed ? (sessionStats.handsFolded / sessionStats.handsPlayed) * 100 : 0}%` }" />
                  </div>
                  <span class="text-white font-mono w-8 text-right">{{ sessionStats.handsFolded }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Stack info -->
          <div class="border-t border-gray-700/50 pt-3">
            <div class="text-xs text-gray-400 mb-2">Bankroll</div>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              <div class="bg-gray-800/50 rounded px-2 py-1.5 text-center">
                <div class="text-gray-500 text-[0.6rem]">Current</div>
                <div class="text-white font-mono font-semibold">${{ sessionStats.currentStack }}</div>
              </div>
              <div class="bg-gray-800/50 rounded px-2 py-1.5 text-center">
                <div class="text-gray-500 text-[0.6rem]">Peak</div>
                <div class="text-green-400 font-mono font-semibold">${{ sessionStats.peakStack }}</div>
              </div>
              <div class="bg-gray-800/50 rounded px-2 py-1.5 text-center">
                <div class="text-gray-500 text-[0.6rem]">Start</div>
                <div class="text-gray-300 font-mono font-semibold">${{ sessionStats.startingStack }}</div>
              </div>
            </div>
          </div>

          <!-- Win rate -->
          <div v-if="sessionStats.handsPlayed > 0" class="border-t border-gray-700/50 pt-3">
            <div class="text-xs text-gray-400 mb-1">Win Rate</div>
            <div class="text-lg font-bold font-mono"
              :class="(sessionStats.handsWon / sessionStats.handsPlayed) >= 0.3 ? 'text-green-400' : 'text-red-400'">
              {{ ((sessionStats.handsWon / sessionStats.handsPlayed) * 100).toFixed(1) }}%
            </div>
          </div>

          <!-- Supabase status -->
          <div class="border-t border-gray-700/50 pt-3">
            <div class="flex items-center gap-1.5 text-[0.6rem]">
              <div class="w-1.5 h-1.5 rounded-full" :class="supabaseConnected ? 'bg-green-500' : 'bg-gray-600'" />
              <span class="text-gray-500">{{ supabaseConnected ? 'Syncing to cloud' : 'Local only' }}</span>
            </div>
          </div>

          <!-- Export & Reset -->
          <div class="border-t border-gray-700/50 pt-3 space-y-2">
            <div class="flex gap-2">
              <button
                class="flex-1 py-1.5 rounded-md text-xs font-semibold bg-gray-800/60 text-gray-300 border border-gray-700/40 hover:bg-gray-700/60 transition-all"
                @click="emit('exportJson')"
              >
                Export JSON
              </button>
              <button
                class="flex-1 py-1.5 rounded-md text-xs font-semibold bg-gray-800/60 text-gray-300 border border-gray-700/40 hover:bg-gray-700/60 transition-all"
                @click="emit('exportCsv')"
              >
                Export CSV
              </button>
            </div>
            <button
              class="w-full py-1.5 rounded-md text-xs font-semibold bg-red-900/30 text-red-400 border border-red-800/30 hover:bg-red-900/50 transition-all"
              @click="emit('resetSession')"
            >
              New Session
            </button>
          </div>
        </template>
        <div v-else class="text-center text-gray-500 text-xs py-8">
          Play a hand to start tracking...
        </div>
      </template>

      <!-- ═══ OPPONENTS TAB ═══ -->
      <template v-if="activeTab === 'opponents'">
        <template v-if="playerStats && playerStats.length > 0">
          <div
            v-for="player in playerStats"
            :key="player.name"
            class="border-t border-gray-700/50 pt-3 first:border-0 first:pt-0"
          >
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-semibold text-white">{{ player.name }}</span>
              <span class="text-[0.6rem] text-gray-500">{{ player.handsPlayed }} hands</span>
            </div>

            <template v-if="player.handsPlayed >= 10">
              <div class="grid grid-cols-2 gap-1 text-xs">
                <div class="bg-gray-800/50 rounded px-2 py-1">
                  <div class="text-gray-500 text-[0.6rem]">VPIP</div>
                  <div class="text-white font-mono">{{ formatStatPct(player.vpip) }}</div>
                  <div class="text-[0.55rem]" :class="player.vpip < 25 ? 'text-blue-400' : 'text-orange-400'">
                    {{ vpipLabel(player.vpip) }}
                  </div>
                </div>
                <div class="bg-gray-800/50 rounded px-2 py-1">
                  <div class="text-gray-500 text-[0.6rem]">PFR</div>
                  <div class="text-white font-mono">{{ formatStatPct(player.pfr) }}</div>
                </div>
                <div class="bg-gray-800/50 rounded px-2 py-1">
                  <div class="text-gray-500 text-[0.6rem]">AF</div>
                  <div class="text-white font-mono">{{ player.af.toFixed(1) }}</div>
                  <div class="text-[0.55rem]" :class="player.af < 1 ? 'text-blue-400' : player.af > 2 ? 'text-red-400' : 'text-gray-400'">
                    {{ afLabel(player.af) }}
                  </div>
                </div>
                <div class="bg-gray-800/50 rounded px-2 py-1">
                  <div class="text-gray-500 text-[0.6rem]">WTSD</div>
                  <div class="text-white font-mono">{{ formatStatPct(player.wtsd) }}</div>
                </div>
              </div>

              <!-- Read -->
              <div class="mt-1.5 text-[0.65rem] text-gray-400 italic leading-snug">
                <template v-if="player.vpip < 18 && player.af > 1">
                  Tight-aggressive — only plays strong hands, bets them hard. Don't bluff.
                </template>
                <template v-else-if="player.vpip < 18">
                  Nit — folds too much. 3-bet liberally, steal their blinds.
                </template>
                <template v-else-if="player.vpip > 32 && player.af > 1.5">
                  LAG/Maniac — wide range with aggression. Call down lighter, trap with monsters.
                </template>
                <template v-else-if="player.vpip > 30 && player.af < 0.8">
                  Calling station — plays too many hands, never folds. Don't bluff, value bet thin.
                </template>
                <template v-else-if="player.af > 1.8">
                  Aggressive — puts pressure on. Be prepared to play back with medium+ hands.
                </template>
                <template v-else>
                  Balanced player — few exploitable tendencies so far.
                </template>
              </div>
            </template>
            <div v-else class="text-xs text-gray-500 italic">
              Need {{ 10 - player.handsPlayed }} more hands for stats
            </div>
          </div>
        </template>
        <div v-else class="text-xs text-gray-500 italic py-4 text-center">
          Opponent stats build up as hands are played. In this demo, stats are based on bot persona defaults.
        </div>

        <!-- Simulated stats from bot personas -->
        <div v-if="!playerStats || playerStats.length === 0" class="space-y-3 mt-2">
          <slot name="botStats" />
        </div>
      </template>

    </div>
  </div>
</template>

