<script setup lang="ts">
/**
 * Interactive bot analysis page — runs a live simulation in the browser,
 * shows results with metrics, bot stats, and the most interesting hands.
 */
import { runSimulation } from '~/utils/simulateBrowser'
import type { SimResult } from '~/utils/simulateBrowser'

defineOptions({ name: 'analysis' })
useHead({ title: 'Bot Analysis Report' })

const running = ref(false)
const runPhase = ref('')
const result6p = ref<SimResult | null>(null)
const result8p = ref<SimResult | null>(null)
const runTimestamp = ref<string | null>(null)
const runDuration = ref<number>(0)

async function runAnalysis() {
  running.value = true
  result6p.value = null
  result8p.value = null
  const startTime = Date.now()

  runPhase.value = 'Running 6-player simulation...'
  result6p.value = await runSimulation(1000, 6, () => {})

  runPhase.value = 'Running 8-player simulation...'
  result8p.value = await runSimulation(1000, 8, () => {})

  runDuration.value = Math.round((Date.now() - startTime) / 1000)
  runTimestamp.value = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  running.value = false
}

function downloadHandHistory() {
  if (!result6p.value && !result8p.value) return
  const parts = []
  if (result6p.value) parts.push(result6p.value.allHandsPS)
  if (result8p.value) parts.push(result8p.value.allHandsPS)
  const content = parts.join('\n\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `holdem-analysis-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function pct(n: number, total: number): string {
  return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'
}

const expandedHand = ref<number | null>(null)

const allInteresting = computed(() => {
  const hands = [
    ...(result6p.value?.interestingHands || []),
    ...(result8p.value?.interestingHands || []),
  ]
  return hands.sort((a, b) => b.interestScore - a.interestScore).slice(0, 3)
})
</script>

<template>
  <div class="min-h-screen bg-[#0a0a0f] text-gray-200">
    <div class="max-w-5xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-white">Bot Analysis Report</h1>
          <p class="text-gray-500 text-sm mt-1">Live simulation — pro personas only, $1/$2 Medium stakes</p>
        </div>
        <NuxtLink to="/">
          <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">Back</UButton>
        </NuxtLink>
      </div>

      <!-- Run Button -->
      <div class="mb-8">
        <button
          :disabled="running"
          class="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all"
          :class="running
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-500 text-white active:scale-[0.97]'"
          @click="runAnalysis"
        >
          {{ running ? 'Running Simulation...' : result6p ? 'Run New Simulation' : 'Run 2,000-Hand Simulation' }}
        </button>

        <!-- Spinner -->
        <div v-if="running" class="mt-4 flex items-center gap-3">
          <div class="flex gap-1.5">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
          </div>
          <span class="text-sm text-gray-400">{{ runPhase }}</span>
        </div>
      </div>

      <!-- Timestamp + Download -->
      <div v-if="runTimestamp && !running" class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3 text-xs text-gray-600">
          <span>{{ runTimestamp }}</span>
          <span>&middot;</span>
          <span>{{ runDuration }}s runtime</span>
          <span>&middot;</span>
          <span>2,000 total hands</span>
        </div>
        <button
          class="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          @click="downloadHandHistory"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PokerStars Hand History
        </button>
      </div>

      <template v-if="result6p && result8p && !running">
        <!-- Results for each table size -->
        <section
          v-for="sim in [
            { r: result6p, label: '6-Player Table' },
            { r: result8p, label: '8-Player Table' },
          ]"
          :key="sim.label"
          class="mb-10"
        >
          <h2 class="text-xl font-bold text-white mb-4">{{ sim.label }} &mdash; {{ sim.r.hands.toLocaleString() }} Hands</h2>

          <!-- Metrics Grid -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <UTooltip text="Average chips in the pot when the hand ends.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Avg Pot</div>
                <div class="text-lg font-bold font-mono text-white mt-1">${{ sim.r.avgPot }}</div>
              </div>
            </UTooltip>
            <UTooltip text="Hands where everyone folded preflop. Higher = tighter table.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Preflop Folds</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.preflopFoldOuts, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="How often the hand saw a flop (3 community cards). Real 6-max cash: ~25-35%.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Flops Seen</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.flopsSeen, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="Hands that reached showdown (cards revealed). Real 6-max: ~15-20%.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Showdowns</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.showdowns, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="3-bet or higher preflop (re-raise). Indicates aggression.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">3-Bet Pots</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.threeBetPots, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="Hands where at least one player went all-in.">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">All-Ins</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.allInHands, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="Hands that reached the turn (4th community card).">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Turns</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.turnsSeen, sim.r.hands) }}</div>
              </div>
            </UTooltip>
            <UTooltip text="Hands that reached the river (5th and final community card).">
              <div class="bg-gray-800/60 rounded-lg p-3 cursor-help">
                <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Rivers</div>
                <div class="text-lg font-bold font-mono text-white mt-1">{{ pct(sim.r.riversSeen, sim.r.hands) }}</div>
              </div>
            </UTooltip>
          </div>

          <!-- Bot Stats Table -->
          <div class="mt-6">
            <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Observed vs Configured Stats</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-700 text-gray-400 text-xs">
                    <th class="text-left py-2 px-2">Bot</th>
                    <th class="text-right px-2">
                      <UTooltip text="Voluntarily Put $ In Pot — % of hands played (not counting blinds). Higher = looser.">
                        <span class="cursor-help border-b border-dotted border-gray-600">VPIP</span>
                      </UTooltip>
                    </th>
                    <th class="text-right px-2 text-gray-600">Cfg</th>
                    <th class="text-right px-2">
                      <UTooltip text="Preflop Raise — % of hands raised preflop. Gap between VPIP and PFR = flat-call rate.">
                        <span class="cursor-help border-b border-dotted border-gray-600">PFR</span>
                      </UTooltip>
                    </th>
                    <th class="text-right px-2 text-gray-600">Cfg</th>
                    <th class="text-right px-2">
                      <UTooltip text="Aggression Factor — ratio of (bets + raises) / calls. Higher = more aggressive postflop.">
                        <span class="cursor-help border-b border-dotted border-gray-600">AF</span>
                      </UTooltip>
                    </th>
                    <th class="text-right px-2 text-gray-600">Cfg</th>
                    <th class="text-right px-2">
                      <UTooltip text="Win rate — % of hands won by this bot.">
                        <span class="cursor-help border-b border-dotted border-gray-600">Win%</span>
                      </UTooltip>
                    </th>
                    <th class="text-right px-2">
                      <UTooltip text="Number of times this bot went broke and rebought.">
                        <span class="cursor-help border-b border-dotted border-gray-600">Rebuys</span>
                      </UTooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in sim.r.botStats" :key="s.name" class="border-b border-gray-800/50">
                    <td class="py-1.5 px-2 text-white font-medium">{{ s.name }}</td>
                    <td
                      class="text-right px-2 font-mono"
                      :class="Math.abs(s.vpipHands / Math.max(s.handsPlayed, 1) * 100 - s.vpipCfg * 100) > 5 ? 'text-amber-400' : 'text-green-400'"
                    >
                      {{ (s.vpipHands / Math.max(s.handsPlayed, 1) * 100).toFixed(1) }}%
                    </td>
                    <td class="text-right px-2 font-mono text-gray-600">{{ (s.vpipCfg * 100).toFixed(0) }}%</td>
                    <td class="text-right px-2 font-mono text-gray-300">{{ (s.pfrHands / Math.max(s.handsPlayed, 1) * 100).toFixed(1) }}%</td>
                    <td class="text-right px-2 font-mono text-gray-600">{{ (s.pfrCfg * 100).toFixed(0) }}%</td>
                    <td class="text-right px-2 font-mono text-gray-300">{{ s.callCount > 0 ? (s.raiseCount / s.callCount).toFixed(2) : (s.raiseCount > 0 ? '2.0+' : '0') }}</td>
                    <td class="text-right px-2 font-mono text-gray-600">{{ s.afCfg.toFixed(2) }}</td>
                    <td class="text-right px-2 font-mono text-blue-400">{{ (s.wins / Math.max(s.handsPlayed, 1) * 100).toFixed(1) }}%</td>
                    <td class="text-right px-2 font-mono text-gray-500">{{ s.rebuys }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-gray-600 mt-2">Green = within 5% of config. Amber = &gt;5% deviation (tilt, table dynamics, variance).</p>
          </div>
        </section>

        <!-- Interesting Hands -->
        <section v-if="allInteresting.length > 0" class="mb-10">
          <h2 class="text-xl font-bold text-white mb-2">Most Interesting Hands</h2>
          <p class="text-xs text-gray-500 mb-4">Auto-selected by interest score: huge pots, coolers, all-in showdowns, 4-bet+ pots, multiway action.</p>
          <div class="space-y-3">
            <div
              v-for="hand in allInteresting"
              :key="'h-' + hand.handNumber + hand.potSize"
              class="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden"
            >
              <button
                class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-800/20 transition-colors"
                @click="expandedHand = expandedHand === hand.handNumber ? null : hand.handNumber"
              >
                <span class="text-gray-600 text-xs">{{ expandedHand === hand.handNumber ? '&#9660;' : '&#9654;' }}</span>
                <span class="text-xs text-gray-500 font-mono">#{{ hand.handNumber }}</span>
                <span class="text-white text-sm font-medium">{{ hand.winnerName }} wins ${{ hand.potSize }}</span>
                <span class="flex-1" />
                <span class="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-400 whitespace-nowrap">{{ hand.interestReason }}</span>
              </button>
              <div v-if="expandedHand === hand.handNumber" class="border-t border-gray-800/30 px-4 py-4 bg-gray-800/10">
                <div class="text-[0.6rem] text-gray-500 uppercase mb-2">PokerStars Format</div>
                <pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap text-gray-400 max-h-80 overflow-y-auto bg-gray-950 rounded-lg p-3">{{ hand.psFormat }}</pre>
              </div>
            </div>
          </div>
        </section>

        <!-- PokerStars Format Info -->
        <section class="mb-10">
          <h2 class="text-xl font-bold text-white mb-4">PokerStars Hand History Format</h2>
          <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-sm text-gray-300">
            <p>All hands export in <strong class="text-white">PokerStars format</strong> &mdash; the industry standard, compatible with PokerTracker 4, Hold'em Manager 3, and Equilab.</p>
            <p class="text-xs text-gray-500 mt-2">
              A pre-generated sample is available at
              <a href="/sample-hands.txt" class="text-blue-400 hover:text-blue-300 underline underline-offset-2" download>/sample-hands.txt</a>.
            </p>
          </div>
        </section>
      </template>

      <!-- Empty state -->
      <div v-if="!result6p && !running" class="text-center py-20 text-gray-600">
        <p class="text-lg mb-2">Click the button above to run a 2,000-hand simulation</p>
        <p class="text-sm">1,000 hands at a 6-player table + 1,000 hands at an 8-player table.</p>
        <p class="text-sm mt-1">Pro personas only. Results include observed vs configured stats and the most interesting hands.</p>
      </div>

      <footer class="border-t border-gray-800 pt-6 mt-10 text-center text-xs text-gray-600">
        <p>Hold'em Simulator &middot; Bot Analysis</p>
      </footer>
    </div>
  </div>
</template>
