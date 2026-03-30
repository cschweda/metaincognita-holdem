<script setup lang="ts">
/**
 * Game setup screen — configure opponents, stakes, hero name,
 * and bot personas before starting a game.
 */
import config from '~/holdem.config'

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
}

export interface BotConfig {
  preset: string
  name: string
  vpip: number
  pfr: number
  aggression: number
  bluffFreq: number
  creativeFreq: number
}

const playerCount = ref(6)
const stakeLevel = ref(config.defaultStakeLevel)
const stackBB = ref(config.stackRange.defaultBB)
const heroName = ref(config.betting.defaultHeroName)
const showAdvanced = ref(false)

// Bot configurations
const botConfigs = ref<BotConfig[]>(
  generateDefaultBots(config.table.maxPlayers - 1)
)

function generateDefaultBots(count: number): BotConfig[] {
  const shuffled = [...config.personas].sort(() => Math.random() - 0.5)
  return Array.from({ length: count }, (_, i) => {
    const persona = shuffled[i % shuffled.length]
    return {
      preset: persona.name,
      name: persona.name,
      vpip: persona.vpip,
      pfr: persona.pfr,
      aggression: persona.aggression,
      bluffFreq: persona.bluffFreq,
      creativeFreq: persona.creativeFreq,
    }
  })
}

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
 * Generates a plain-English description of a bot's playstyle based on its stats.
 */
function describeBotStyle(bot: BotConfig): string {
  const parts: string[] = []

  // Tightness/looseness
  if (bot.vpip <= 0.15) parts.push('extremely tight')
  else if (bot.vpip <= 0.20) parts.push('tight')
  else if (bot.vpip <= 0.28) parts.push('moderately selective')
  else if (bot.vpip <= 0.35) parts.push('loose')
  else parts.push('very loose')

  // Aggression style
  if (bot.aggression >= 1.4) parts.push('highly aggressive')
  else if (bot.aggression >= 1.1) parts.push('aggressive')
  else if (bot.aggression >= 0.8) parts.push('balanced')
  else parts.push('passive')

  let desc = `This is a ${parts.join(', ')} player`

  // PFR vs VPIP ratio tells the story
  const pfrRatio = bot.pfr / bot.vpip
  if (pfrRatio > 0.8) desc += ' who raises most of the hands they play'
  else if (pfrRatio < 0.5) desc += ' who prefers calling over raising preflop'

  // Bluff tendency
  if (bot.bluffFreq >= 0.22) desc += '. Bluffs frequently — call them down with medium-strength hands.'
  else if (bot.bluffFreq >= 0.14) desc += '. Will bluff occasionally, especially in position.'
  else if (bot.bluffFreq <= 0.08) desc += '. Rarely bluffs — when they bet big, believe them.'
  else desc += '.'

  // Creative plays
  if (bot.creativeFreq >= 0.07) desc += ' Expect unorthodox plays like limp-reraises and check-raise bluffs.'

  return desc
}

const selectedStake = computed(() => config.stakes.find(s => s.level === stakeLevel.value)!)
const startingStack = computed(() => selectedStake.value.bb * stackBB.value)

const allPresetNames = computed(() => [
  ...config.personas.map(p => p.name),
  ...config.botPresets.map(p => p.name),
])

const activeBots = computed(() => botConfigs.value.slice(0, playerCount.value - 1))

function handleStart() {
  emit('start', {
    playerCount: playerCount.value,
    stakeLevel: stakeLevel.value,
    customBB: null,
    stackBB: stackBB.value,
    heroName: heroName.value,
    botConfigs: activeBots.value,
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6 space-y-6">
    <h1 class="text-3xl font-bold text-center text-white">
      Hold'em Simulator
    </h1>
    <p class="text-center text-gray-400 text-sm">
      Configure your table and start playing
    </p>

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
      <URange
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
      <URange
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
              <URange
                v-model="bot.vpip"
                :min="config.botCustomRanges.vpip.min"
                :max="config.botCustomRanges.vpip.max"
                :step="config.botCustomRanges.vpip.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">PFR: {{ (bot.pfr * 100).toFixed(0) }}%</label>
              <URange
                v-model="bot.pfr"
                :min="config.botCustomRanges.pfr.min"
                :max="config.botCustomRanges.pfr.max"
                :step="config.botCustomRanges.pfr.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">Aggression: {{ bot.aggression.toFixed(2) }}</label>
              <URange
                v-model="bot.aggression"
                :min="config.botCustomRanges.aggression.min"
                :max="config.botCustomRanges.aggression.max"
                :step="config.botCustomRanges.aggression.step"
                size="xs"
              />
            </div>
            <div>
              <label class="text-gray-500">Bluff: {{ (bot.bluffFreq * 100).toFixed(0) }}%</label>
              <URange
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
