<script setup lang="ts">
/**
 * Real-time stats panel — hand analysis, draws, outs, equity,
 * pot odds, and action recommendation. Updates every street.
 */
import type { Card } from '~/utils/cards'
import { displayCard, SUIT_SYMBOLS } from '~/utils/cards'
import { HAND_RANK_NAMES, type HandAnalysis } from '~/utils/handAnalysis'
import { analyzeHand } from '~/utils/handAnalysis'

const props = defineProps<{
  holeCards: [Card, Card] | null
  community: Card[]
  street: string
  numOpponents: number
  position: string
}>()

const analysis = computed<HandAnalysis | null>(() => {
  if (!props.holeCards) return null
  return analyzeHand(
    props.holeCards,
    props.community,
    props.street,
    props.numOpponents,
    props.position,
  )
})

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

const equityBarWidth = computed(() => {
  return `${Math.max(2, analysis.value?.equity || 0)}%`
})

function formatHoleCards(cards: [Card, Card]): string {
  return `${displayCard(cards[0])} ${displayCard(cards[1])}`
}
</script>

<template>
  <div class="w-full lg:w-80 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 space-y-4 text-sm">
    <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
      Live Hand Analysis
    </h3>

    <template v-if="analysis && holeCards">
      <!-- Hero's Hand -->
      <div>
        <div class="flex items-center justify-between">
          <span class="text-gray-400 text-xs">Your Hand</span>
          <span class="font-mono text-base">{{ formatHoleCards(holeCards) }}</span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <span
            class="px-2 py-0.5 rounded text-xs font-semibold text-white"
            :class="tierColor"
          >
            {{ analysis.preflopTierLabel }}
          </span>
          <span class="text-gray-300 text-xs">Chen: {{ analysis.chenScore }}</span>
        </div>
      </div>

      <!-- Made Hand (postflop) -->
      <div v-if="street !== 'preflop'" class="border-t border-gray-700/50 pt-3">
        <div class="text-xs text-gray-400">Current Hand</div>
        <div class="text-base font-semibold text-white mt-0.5">
          {{ analysis.handDescription }}
        </div>
        <div v-if="analysis.madeHand" class="text-xs text-gray-500 mt-0.5">
          {{ HAND_RANK_NAMES[analysis.madeHand.rank] }}
        </div>
      </div>

      <!-- Equity Gauge -->
      <div class="border-t border-gray-700/50 pt-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-400">Equity</span>
          <span class="text-lg font-bold font-mono" :class="equityColor">
            {{ analysis.equity }}%
          </span>
        </div>
        <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="analysis.equity >= 50 ? 'bg-green-500' : analysis.equity >= 30 ? 'bg-yellow-500' : 'bg-red-500'"
            :style="{ width: equityBarWidth }"
          />
        </div>
        <div class="flex justify-between text-[0.6rem] text-gray-600 mt-0.5">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <!-- Draws & Outs (postflop only) -->
      <div v-if="street !== 'preflop' && analysis.draws.length > 0" class="border-t border-gray-700/50 pt-3">
        <div class="text-xs text-gray-400 mb-1.5">Draws &amp; Outs</div>
        <div class="space-y-1.5">
          <div
            v-for="(draw, i) in analysis.draws"
            :key="i"
            class="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1"
          >
            <span class="text-gray-200 text-xs">{{ draw.type }}</span>
            <span class="font-mono text-xs font-semibold text-blue-400">{{ draw.outs }} outs</span>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between text-xs">
          <span class="text-gray-400">
            Total outs: <span class="text-white font-semibold">{{ analysis.totalOuts }}</span>
          </span>
        </div>

        <!-- Probability to improve -->
        <div class="mt-1.5 space-y-0.5">
          <div class="flex justify-between text-xs">
            <span class="text-gray-400">Hit by next card</span>
            <span class="text-gray-200 font-mono">{{ analysis.probNextCard }}%</span>
          </div>
          <div v-if="street === 'flop'" class="flex justify-between text-xs">
            <span class="text-gray-400">Hit by river</span>
            <span class="text-gray-200 font-mono">{{ analysis.probByRiver }}%</span>
          </div>
        </div>

        <!-- Rule of 2/4 -->
        <div class="mt-1 text-[0.65rem] text-gray-500 italic">
          Rule of {{ street === 'flop' ? '4' : '2' }}: {{ analysis.totalOuts }} × {{ street === 'flop' ? '4' : '2' }} ≈ {{ analysis.totalOuts * (street === 'flop' ? 4 : 2) }}%
        </div>
      </div>

      <!-- No draws message -->
      <div v-if="street !== 'preflop' && analysis.draws.length === 0" class="border-t border-gray-700/50 pt-3">
        <div class="text-xs text-gray-400 mb-1">Draws &amp; Outs</div>
        <div class="text-xs text-gray-500 italic">No active draws detected</div>
      </div>

      <!-- Action Recommendation -->
      <div class="border-t border-gray-700/50 pt-3">
        <div class="text-xs text-gray-400 mb-1.5">Recommendation</div>
        <div
          class="rounded-lg px-3 py-2 text-center"
          :class="actionColor"
        >
          <div class="text-lg font-bold text-white tracking-wide">
            {{ analysis.action }}
          </div>
        </div>
        <p class="mt-2 text-xs text-gray-300 leading-relaxed">
          {{ analysis.reasoning }}
        </p>
      </div>

      <!-- Street-specific notes -->
      <div v-if="street === 'showdown'" class="border-t border-gray-700/50 pt-3">
        <div class="text-xs text-gray-400 mb-1">Showdown</div>
        <div class="text-xs text-gray-300">
          Click any player's cards to peek at their hand.
        </div>
      </div>
    </template>

    <!-- No cards dealt yet -->
    <div v-else class="text-center text-gray-500 text-xs py-8">
      Waiting for deal...
    </div>
  </div>
</template>
