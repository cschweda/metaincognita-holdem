<script setup lang="ts">
/**
 * Pre-game setup screen — configure hero name, opponent count, stake level,
 * stack depth, and per-bot personas (with pro/fictional mix, preset selection,
 * advanced stat sliders, and dynamic name/description generation).
 */
import config from '@config'
import { dynamicBotName, describeBotStyle, FICTIONAL_NAMES } from '~/utils/botDescriptions'
import { shuffle } from '~/utils/shuffle'

const emit = defineEmits<{
  start: [settings: GameSettings]
}>()

export interface GameSettings {
  playerCount: number
  stakeLevel: number
  customBB: number | null
  stackBB: number
  heroName: string
  botConfigs: BotConfig[]
  guestMode: boolean
  commentaryMode: 'off' | 'hero' | 'tv'
}

export interface BotConfig {
  preset: string
  name: string
  vpip: number
  pfr: number
  aggression: number
  bluffFreq: number
  creativeFreq: number
  tiltMultiplier: number
  threeBetFreq?: number
  fourBetFreq?: number
  fiveBetFreq?: number
  donkBetFreq?: number
  limpFreq?: number
  styleBias?: Partial<Record<'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other', number>>
  betSizeMult?: number
  overbetFreq?: number
  leak?: string
}

const playerCount = ref(6)
const stakeLevel = ref(config.defaultStakeLevel)
const stackBB = ref(config.stackRange.defaultBB)
const heroName = ref(config.betting.defaultHeroName)
const showAdvanced = ref(false)
// Commentary mode — always defaults to Hero POV. No localStorage.
// The composable reads this via syncFromStorage() when the game starts.
type CommentaryChoice = 'off' | 'hero' | 'tv'
const commentaryChoice = ref<CommentaryChoice>('hero')

const proBots = config.personas.filter(p => !FICTIONAL_NAMES.includes(p.name))
const fictionalBots = config.personas.filter(p => FICTIONAL_NAMES.includes(p.name))

const maxPros = ref(playerCount.value - 1) // default: all pros (table size minus hero)

function generateDefaultBots(count: number): BotConfig[] {
  const proCount = Math.min(maxPros.value, proBots.length, count)
  const shuffledPros = shuffle(proBots).slice(0, proCount)
  const shuffledFictional = shuffle(fictionalBots)

  const pool = [...shuffledPros, ...shuffledFictional]
  const selected = pool.slice(0, count)

  return selected.map(persona => ({
    preset: persona.name,
    name: persona.name,
    vpip: persona.vpip,
    pfr: persona.pfr,
    aggression: persona.aggression,
    bluffFreq: persona.bluffFreq,
    creativeFreq: persona.creativeFreq,
    tiltMultiplier: persona.tiltMultiplier ?? 1.0,
    threeBetFreq: persona.threeBetFreq,
    fourBetFreq: persona.fourBetFreq,
    fiveBetFreq: persona.fiveBetFreq,
    donkBetFreq: persona.donkBetFreq,
    limpFreq: (persona as any).limpFreq,
    styleBias: (persona as any).styleBias,
    betSizeMult: (persona as any).betSizeMult,
    overbetFreq: (persona as any).overbetFreq,
    leak: persona.leak,
  }))
}

// Bot configurations
const botConfigs = ref<BotConfig[]>(
  generateDefaultBots(config.table.maxPlayers - 1)
)

function applyPreset(botIndex: number, presetName: string) {
  const preset = [...config.personas, ...config.botPresets].find(p => p.name === presetName)
  if (!preset) return
  const bot = botConfigs.value[botIndex]
  bot.preset = presetName
  bot.vpip = preset.vpip
  bot.pfr = preset.pfr
  bot.aggression = preset.aggression
  bot.bluffFreq = preset.bluffFreq
  bot.creativeFreq = preset.creativeFreq
  bot.tiltMultiplier = ('tiltMultiplier' in preset) ? (preset as any).tiltMultiplier : 1.0
  bot.threeBetFreq = (preset as any).threeBetFreq
  bot.fourBetFreq = (preset as any).fourBetFreq
  bot.fiveBetFreq = (preset as any).fiveBetFreq
  bot.leak = (preset as any).leak
  if ('leak' in preset) {
    bot.name = presetName
  }
}

function randomizeAll() {
  botConfigs.value = generateDefaultBots(config.table.maxPlayers - 1)
}

function setAllSame(presetName: string) {
  for (let i = 0; i < botConfigs.value.length; i++) {
    applyPreset(i, presetName)
  }
}

/**
 * Generates a dynamic adjective-first-name based on stats.
 * E.g., "Loose Lucy" becomes "Aggro Lucy" if aggression is cranked up,
 * or "Nitty Lucy" if VPIP is dialed way down.
 */
// dynamicBotName and describeBotStyle imported from ~/utils/botDescriptions

const selectedStake = computed(() => config.stakes.find(s => s.level === stakeLevel.value)!)
const startingStack = computed(() => selectedStake.value.bb * stackBB.value)

const allPresetNames = computed(() => [
  ...config.personas.map(p => p.name),
  ...config.botPresets.map(p => p.name),
])

const activeBots = computed(() => botConfigs.value.slice(0, playerCount.value - 1))

const proCountOptions = computed(() => {
  const maxAllowed = Math.min(playerCount.value - 1, proBots.length)
  const options = []
  for (let i = 0; i <= Math.min(3, maxAllowed); i++) {
    options.push({ value: i, label: String(i) })
  }
  if (maxAllowed > 3) {
    options.push({ value: maxAllowed, label: 'All' })
  }
  // Deduplicate
  const seen = new Set<number>()
  return options.filter(o => { if (seen.has(o.value)) return false; seen.add(o.value); return true })
})

// Auto-update bot names when stats drift from preset defaults
watch(botConfigs, (bots) => {
  for (const bot of bots) {
    const newName = dynamicBotName(bot)
    if (newName !== bot.name) {
      bot.name = newName
    }
  }
}, { deep: true })

function handleStart() {
  emit('start', {
    playerCount: playerCount.value,
    stakeLevel: stakeLevel.value,
    customBB: null,
    stackBB: stackBB.value,
    heroName: heroName.value,
    botConfigs: activeBots.value,
    guestMode: false,
    commentaryMode: commentaryChoice.value,
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6 space-y-6">
    <!-- Top status bar -->
    <div class="flex items-center justify-between py-2 px-1 mb-4 border-b border-gray-800/40 text-xs text-gray-500">
      <div class="flex items-center gap-3">
        <NuxtLink to="/stats" class="hover:text-gray-300 transition-colors">Stats</NuxtLink>
        <NuxtLink to="/analysis" class="hover:text-gray-300 transition-colors">Bot Analysis</NuxtLink>
      </div>
    </div>

    <h1 class="text-3xl font-bold text-center text-white">
      No Limit Hold'em Simulator
    </h1>
    <p class="text-gray-400 text-sm text-center">Configure your table and start playing</p>

    <!-- Hero Name -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
      <UInput v-model="heroName" placeholder="Hero" size="lg" />
    </div>

    <!-- Number of Opponents -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-2">
        Opponents: {{ playerCount - 1 }}
      </label>
      <USlider
        v-model="playerCount"
        :min="config.table.minPlayers"
        :max="config.table.maxPlayers"
        :step="1"
      />
      <div class="flex justify-between text-xs text-gray-500 mt-1">
        <span>Heads-up</span>
        <span>Full ring</span>
      </div>
    </div>

    <!-- Stake Level -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-2">Stake Level</label>
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="stake in config.stakes"
          :key="stake.level"
          :variant="stakeLevel === stake.level ? 'solid' : 'outline'"
          :color="stakeLevel === stake.level ? 'primary' : 'neutral'"
          size="sm"
          @click="stakeLevel = stake.level"
        >
          <div class="text-center">
            <div class="font-semibold">{{ stake.name }}</div>
            <div class="text-xs opacity-70">${{ stake.sb }}/${{ stake.bb }}</div>
          </div>
        </UButton>
      </div>
    </div>

    <!-- Stack Depth -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-2">
        Stack: {{ stackBB }} BB (${{ startingStack }})
      </label>
      <USlider
        v-model="stackBB"
        :min="config.stackRange.minBB"
        :max="config.stackRange.maxBB"
        :step="10"
      />
      <div class="flex justify-between text-xs text-gray-500 mt-1">
        <span>Short (50 BB)</span>
        <span>Deep (200 BB)</span>
      </div>
    </div>

    <!-- Player mix -->
    <div class="bg-gray-800/30 border border-gray-700/20 rounded-lg px-4 py-3 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-200">Your Table</div>
          <div class="text-xs text-gray-500">
            {{ activeBots.filter(b => proBots.some(p => p.name === b.name)).length }} pro{{ activeBots.filter(b => proBots.some(p => p.name === b.name)).length !== 1 ? 's' : '' }},
            {{ activeBots.filter(b => !proBots.some(p => p.name === b.name)).length }} fictional
          </div>
        </div>
        <UButton
          icon="i-lucide-shuffle"
          color="primary"
          variant="soft"
          size="sm"
          @click="randomizeAll"
        >
          Shuffle Players
        </UButton>
      </div>

      <!-- Pro count selector -->
      <div class="flex items-center justify-between">
        <label class="text-xs text-gray-400">Pro players per table</label>
        <div class="flex items-center gap-1.5">
          <button
            v-for="n in proCountOptions"
            :key="n.value"
            class="px-2 h-7 rounded-md text-xs font-semibold transition-all"
            :class="maxPros === n.value
              ? 'bg-amber-700/60 text-amber-100 border border-amber-500/50'
              : 'bg-gray-800/60 text-gray-400 border border-gray-700/40 hover:bg-gray-700/60'"
            @click="maxPros = n.value; randomizeAll()"
          >
            {{ n.label }}
          </button>
        </div>
      </div>

      <!-- Player list -->
      <div class="grid gap-1.5">
        <div
          v-for="(bot, i) in activeBots"
          :key="i"
          class="flex items-center justify-between bg-gray-900/40 rounded-lg px-3 py-2"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-[0.6rem] text-gray-600 w-4 text-right">{{ i + 1 }}</span>
            <span class="text-sm font-medium" :class="proBots.some(p => p.name === bot.name) ? 'text-amber-300' : 'text-gray-200'">
              {{ bot.name }}
            </span>
            <span
              v-if="proBots.some(p => p.name === bot.name)"
              class="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400/80 border border-amber-700/30"
            >
              PRO
            </span>
          </div>
          <div class="flex items-center gap-3 text-[0.65rem] text-gray-500">
            <span>V:{{ (bot.vpip * 100).toFixed(0) }}%</span>
            <span>A:{{ bot.aggression.toFixed(1) }}</span>
            <USelect
              :model-value="bot.name"
              :items="allPresetNames"
              size="2xs"
              class="w-40"
              @update:model-value="(v: string) => applyPreset(i, v)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Advanced Bot Config -->
    <div>
      <button
        class="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
        @click="showAdvanced = !showAdvanced"
      >
        <UIcon :name="showAdvanced ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4" />
        Advanced: Bot Configuration
      </button>

      <div v-if="showAdvanced" class="mt-3 space-y-4">
        <!-- Quick actions -->
        <div class="flex gap-2 flex-wrap">
          <UButton size="xs" variant="outline" color="neutral" @click="randomizeAll">
            Randomize All
          </UButton>
          <UButton
            v-for="preset in config.botPresets"
            :key="preset.name"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="setAllSame(preset.name)"
          >
            All {{ preset.name }}
          </UButton>
        </div>

        <!-- Per-bot config -->
        <div
          v-for="(bot, i) in activeBots"
          :key="i"
          class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-2"
        >
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-12">Bot {{ i + 1 }}</span>
            <UInput
              v-model="bot.name"
              size="xs"
              class="flex-1"
              placeholder="Bot name"
            />
            <USelect
              :model-value="bot.preset"
              :items="allPresetNames"
              size="xs"
              class="w-36"
              @update:model-value="(v: string) => applyPreset(i, v)"
            />
          </div>

          <!-- Stat sliders -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <label class="text-gray-500">VPIP: {{ (bot.vpip * 100).toFixed(0) }}%</label>
              <USlider
                v-model="bot.vpip"
                :min="config.botCustomRanges.vpip.min"
                :max="config.botCustomRanges.vpip.max"
                :step="config.botCustomRanges.vpip.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">PFR: {{ (bot.pfr * 100).toFixed(0) }}%</label>
              <USlider
                v-model="bot.pfr"
                :min="config.botCustomRanges.pfr.min"
                :max="config.botCustomRanges.pfr.max"
                :step="config.botCustomRanges.pfr.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">Aggression: {{ bot.aggression.toFixed(2) }}</label>
              <USlider
                v-model="bot.aggression"
                :min="config.botCustomRanges.aggression.min"
                :max="config.botCustomRanges.aggression.max"
                :step="config.botCustomRanges.aggression.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">Bluff: {{ (bot.bluffFreq * 100).toFixed(0) }}%</label>
              <USlider
                v-model="bot.bluffFreq"
                :min="config.botCustomRanges.bluffFreq.min"
                :max="config.botCustomRanges.bluffFreq.max"
                :step="config.botCustomRanges.bluffFreq.step"
                size="xs"
              />
            </div>
          </div>

          <!-- Dynamic bot description -->
          <p class="text-xs text-gray-400 italic leading-snug">
            {{ describeBotStyle(bot) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Persistence note -->
    <div class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-emerald-500" />
        <span class="text-sm text-gray-300">Local Storage</span>
      </div>
      <p class="text-xs text-gray-500 mt-1">Session stats are saved in this browser. Export hands as JSON/CSV/PokerStars format anytime.</p>
    </div>

    <!-- Commentary Mode -->
    <div class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-300 font-medium">Live Commentary</span>
        <span class="text-[0.55rem] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400 uppercase">Optional</span>
      </div>
      <div class="flex rounded-lg overflow-hidden border border-gray-700/50">
        <button
          v-for="opt in ([
            { value: 'off', label: 'Off' },
            { value: 'hero', label: 'Hero POV' },
            { value: 'tv', label: 'TV Broadcast' },
          ] as const)"
          :key="opt.value"
          class="flex-1 py-2 text-xs font-semibold transition-colors"
          :class="commentaryChoice === opt.value
            ? 'bg-gray-700 text-white'
            : 'text-gray-500 hover:text-gray-300'"
          @click="commentaryChoice = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="text-xs text-gray-500">
        <template v-if="commentaryChoice === 'off'">No commentary panel. Standard poker trainer experience.</template>
        <template v-else-if="commentaryChoice === 'hero'">Real-time text play-by-play from your perspective. Only your cards are visible — opponents face-down.</template>
        <template v-else>WSOP-style TV broadcast with Chorman Nad &amp; Mon LeEachern (our homage to Norman Chad &amp; Lon McEachern). All cards shown face-up — like watching poker on TV. You still make all decisions.</template>
      </div>
    </div>

    <!-- Start Button -->
    <UButton
      size="xl"
      color="primary"
      block
      @click="handleStart"
    >
      Deal Me In
    </UButton>
  </div>
</template>
