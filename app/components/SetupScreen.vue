<script setup lang="ts">
/**
 * Pre-game setup screen — configure hero name, opponent count, stake level,
 * stack depth, and per-bot personas (with pro/fictional mix, preset selection,
 * advanced stat sliders, and dynamic name/description generation).
 * Includes GitHub OAuth and email/password auth for cross-session stat persistence.
 */
import config from '@config'
import { useSupabase, isSupabaseConnectionFailed, isGitHubUser, signInWithGitHub, signUpWithEmail, signInWithEmail, validatePassword } from '~/composables/useSupabase'
import { dynamicBotName, describeBotStyle, FICTIONAL_NAMES } from '~/utils/botDescriptions'

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
  leak?: string
}

const playerCount = ref(6)
const stakeLevel = ref(config.defaultStakeLevel)
const stackBB = ref(config.stackRange.defaultBB)
const heroName = ref(config.betting.defaultHeroName)
const showAdvanced = ref(false)
const isLoggedIn = ref(false)
const supabaseAvailable = ref(!!useSupabase())
const showEmailAuth = ref(false)
const isSignUp = ref(false)
const emailInput = ref('')
const passwordInput = ref('')
const authError = ref<string | null>(null)
const authLoading = ref(false)
const authSuccess = ref<string | null>(null)

const passwordValidation = computed(() => validatePassword(passwordInput.value))

// Commentary toggle — syncs with the same localStorage key the composable reads
const commentaryEnabled = ref(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('holdem-commentary-enabled') !== 'false'
    : true,
)
watch(commentaryEnabled, (v) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-commentary-enabled', String(v))
})

onMounted(async () => {
  isLoggedIn.value = await isGitHubUser()
  // Re-check after async auth attempt — credentials may have been invalidated
  if (isSupabaseConnectionFailed()) {
    supabaseAvailable.value = false
  }
})

async function handleEmailAuth() {
  authError.value = null
  authSuccess.value = null

  if (!emailInput.value || !passwordInput.value) {
    authError.value = 'Email and password are required'
    return
  }

  if (isSignUp.value && !passwordValidation.value.valid) {
    authError.value = passwordValidation.value.message
    return
  }

  authLoading.value = true
  const fn = isSignUp.value ? signUpWithEmail : signInWithEmail
  const { success, error } = await fn(emailInput.value, passwordInput.value)
  authLoading.value = false

  if (success) {
    if (isSignUp.value) {
      authSuccess.value = 'Account created! Check your email if confirmation is required.'
    }
    isLoggedIn.value = true
    showEmailAuth.value = false
  } else {
    authError.value = error
  }
}

const proBots = config.personas.filter(p => !FICTIONAL_NAMES.includes(p.name))
const fictionalBots = config.personas.filter(p => FICTIONAL_NAMES.includes(p.name))

const maxPros = ref(2)

function generateDefaultBots(count: number): BotConfig[] {
  const proCount = Math.min(maxPros.value, proBots.length, count)
  const shuffledPros = [...proBots].sort(() => Math.random() - 0.5).slice(0, proCount)
  const shuffledFictional = [...fictionalBots].sort(() => Math.random() - 0.5)

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
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div />
      <h1 class="text-3xl font-bold text-center text-white">
        No Limit Hold'em Simulator
      </h1>
      <SupabaseStatus />
    </div>
    <div class="flex items-center justify-center gap-3">
      <p class="text-gray-400 text-sm">Configure your table and start playing</p>
      <NuxtLink to="/stats">
        <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-bar-chart-2">
          View Stats
        </UButton>
      </NuxtLink>
    </div>

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

    <!-- Auth status + Start -->
    <!-- Supabase not configured or connection failed — local storage only -->
    <div v-if="!supabaseAvailable" class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full" :class="isSupabaseConnectionFailed() ? 'bg-red-500' : 'bg-gray-500'" />
        <span class="text-sm text-gray-300">{{ isSupabaseConnectionFailed() ? 'Connection Failed — Local Only' : 'Local Storage Only' }}</span>
      </div>
      <div class="text-xs text-gray-500 mt-0.5">
        {{ isSupabaseConnectionFailed()
          ? 'Supabase credentials appear invalid or the connection failed. Stats will be saved to this browser only. Check your SUPABASE_URL and SUPABASE_KEY environment variables.'
          : 'No database configured. Session stats are saved to this browser\'s local storage. Lifetime stats across sessions are not available. To enable cloud persistence, configure Supabase environment variables.'
        }}
      </div>
    </div>
    <!-- Signed in -->
    <div v-else-if="isLoggedIn" class="bg-green-900/20 border border-green-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-green-500" />
        <span class="text-sm text-green-300">Signed in</span>
      </div>
      <div class="text-xs text-green-400/60 mt-0.5">Hands and stats will be saved to your account across sessions and devices</div>
    </div>
    <!-- Not signed in but Supabase is available -->
    <div v-else class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3 space-y-3">
      <div>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-yellow-500" />
          <span class="text-sm text-gray-300">Not signed in</span>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">Stats tracked for this session only. Sign in for lifetime stats across sessions and devices.</div>
      </div>

      <!-- OAuth buttons -->
      <button
        class="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold
               bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 transition-all active:scale-[0.98]"
        @click="signInWithGitHub()"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Sign in with GitHub
      </button>

      <!-- Divider -->
      <div class="flex items-center gap-3">
        <div class="flex-1 h-px bg-gray-700" />
        <span class="text-xs text-gray-600">or</span>
        <div class="flex-1 h-px bg-gray-700" />
      </div>

      <!-- Email/Password toggle -->
      <button
        v-if="!showEmailAuth"
        class="w-full py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        @click="showEmailAuth = true"
      >
        Sign in with email and password
      </button>

      <!-- Email/Password form -->
      <div v-if="showEmailAuth" class="space-y-2">
        <div class="flex gap-2 text-xs">
          <button
            class="flex-1 py-1.5 rounded-md font-semibold transition-colors"
            :class="!isSignUp ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="isSignUp = false; authError = null"
          >
            Sign In
          </button>
          <button
            class="flex-1 py-1.5 rounded-md font-semibold transition-colors"
            :class="isSignUp ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="isSignUp = true; authError = null"
          >
            Create Account
          </button>
        </div>

        <UInput
          v-model="emailInput"
          type="email"
          placeholder="Email address"
          size="sm"
          @keyup.enter="handleEmailAuth"
        />
        <div>
          <UInput
            v-model="passwordInput"
            type="password"
            placeholder="Password"
            size="sm"
            @keyup.enter="handleEmailAuth"
          />
          <div v-if="isSignUp && passwordInput" class="mt-1 text-[0.6rem]"
            :class="passwordValidation.valid ? 'text-green-400' : 'text-gray-500'">
            {{ passwordValidation.message }}
          </div>
        </div>

        <div v-if="authError" class="text-xs text-red-400">{{ authError }}</div>
        <div v-if="authSuccess" class="text-xs text-green-400">{{ authSuccess }}</div>

        <UButton
          :loading="authLoading"
          color="primary"
          block
          size="sm"
          @click="handleEmailAuth"
        >
          {{ isSignUp ? 'Create Account' : 'Sign In' }}
        </UButton>

        <div v-if="isSignUp" class="text-[0.55rem] text-gray-600 text-center">
          Password must be at least 8 characters with uppercase, lowercase, and a number
        </div>
      </div>
    </div>

    <!-- Commentary Toggle -->
    <div class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-300 font-medium">Live Commentary</span>
            <span class="text-[0.55rem] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400 uppercase">Optional</span>
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            {{ commentaryEnabled
              ? 'Real-time play-by-play in the left column. Switch between Hero POV and WSOP-style TV Broadcast with Norman Chad & Lon McEachern commentary.'
              : 'Commentary is off. The game plays without the commentary panel.'
            }}
          </div>
        </div>
        <button
          class="relative w-10 h-5.5 rounded-full transition-colors shrink-0 ml-3"
          :class="commentaryEnabled ? 'bg-green-600' : 'bg-gray-700'"
          @click="commentaryEnabled = !commentaryEnabled"
        >
          <div
            class="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform"
            :class="commentaryEnabled ? 'translate-x-[1.2rem]' : 'translate-x-0.5'"
          />
        </button>
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
