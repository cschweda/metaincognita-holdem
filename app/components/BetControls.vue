<script setup lang="ts">
/**
 * Hero betting controls — fold, check/call, and raise/all-in buttons,
 * with pot-fraction presets (1/4, 1/2, 3/4, pot, all-in), a raise slider,
 * and a custom exact-amount input. Disabled when it's not the hero's turn.
 */

const props = withDefaults(defineProps<{
  pot: number
  toCall: number
  minRaise: number
  maxRaise: number // hero's remaining stack
  bb: number
  enabled?: boolean
}>(), {
  enabled: true,
})

const emit = defineEmits<{
  fold: []
  check: []
  call: [amount: number]
  raise: [amount: number]
}>()

// Default raise to half-pot (clamped to min/max) — more useful than min-raise on big pots
function defaultRaise(): number {
  const halfPot = Math.round(props.pot * 0.5)
  return Math.min(Math.max(halfPot, props.minRaise), props.maxRaise)
}

const raiseAmount = ref(defaultRaise())
const customInput = ref('')
const showCustom = ref(false)

// Reset raise amount to a sensible default when the situation changes
watch(() => [props.minRaise, props.maxRaise, props.pot], () => {
  raiseAmount.value = defaultRaise()
})

const canCheck = computed(() => props.toCall === 0)
const canRaise = computed(() => props.maxRaise > props.toCall)
const isAllIn = computed(() => raiseAmount.value >= props.maxRaise)

// Pot-fraction presets
const presets = computed(() => {
  const fractions = [
    { label: '¼ Pot', mult: 0.25 },
    { label: '½ Pot', mult: 0.5 },
    { label: '¾ Pot', mult: 0.75 },
    { label: 'Pot', mult: 1.0 },
  ]
  return fractions.map(f => {
    const raw = Math.round(props.pot * f.mult)
    const clamped = Math.min(Math.max(raw, props.minRaise), props.maxRaise)
    const isClamped = raw < props.minRaise // true if the fraction was below min-raise
    return { ...f, amount: clamped, raw, isClamped, disabled: clamped > props.maxRaise }
  })
})

function setRaise(amount: number) {
  raiseAmount.value = Math.min(Math.max(amount, props.minRaise), props.maxRaise)
  showCustom.value = false
}

function raisePreset(amount: number) {
  const clamped = Math.min(Math.max(amount, props.minRaise), props.maxRaise)
  raiseAmount.value = clamped
  emit('raise', clamped)
}

function applyCustom() {
  const val = parseFloat(customInput.value)
  if (!isNaN(val) && val >= props.minRaise) {
    setRaise(val)
  }
  showCustom.value = false
}

// Fold: executes immediately, brief undo window (2s) to cancel
const foldPending = ref(false)
const foldCountdown = ref(false)
let foldTimer: ReturnType<typeof setTimeout> | null = null

function handleFold() {
  if (foldPending.value) return // already pending
  foldPending.value = true
  nextTick(() => { foldCountdown.value = true })
  foldTimer = setTimeout(() => {
    foldPending.value = false
    foldCountdown.value = false
    emit('fold')
  }, 3000)
}

function cancelFold() {
  if (foldTimer) clearTimeout(foldTimer)
  foldPending.value = false
  foldCountdown.value = false
}

function handleCheckCall() {
  if (canCheck.value) {
    emit('check')
  } else {
    emit('call', Math.min(props.toCall, props.maxRaise))
  }
}

function handleRaise() {
  emit('raise', raiseAmount.value)
}

function formatAmount(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}
</script>

<template>
  <div
    class="w-full max-w-3xl mx-auto rounded-xl border border-gray-700/50 bg-gray-900/80 backdrop-blur-sm p-4 space-y-3 transition-opacity"
    :class="enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'"
  >
    <!-- Row 1: Main action buttons -->
    <div class="flex gap-2">
      <!-- Fold: instant action with 2s undo window -->
      <UTooltip :text="foldPending ? 'Click to cancel — folding in 3s' : 'Surrender your hand'" class="flex-1">
        <button
          class="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all duration-[3000ms] active:scale-[0.97] relative overflow-hidden"
          :class="foldPending
            ? (foldCountdown ? 'bg-amber-800/70 text-amber-200 border-2 border-amber-500/60' : 'bg-amber-700/80 text-amber-100 border-2 border-amber-400')
            : 'bg-red-900/60 hover:bg-red-800/80 text-red-200 border border-red-700/40'"
          @click="foldPending ? cancelFold() : handleFold()"
        >
          <span class="relative z-10 flex items-center justify-center gap-2">
            <template v-if="foldPending">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" /></svg>
              Cancel Fold
            </template>
            <template v-else>Fold</template>
          </span>
          <!-- Countdown bar: shrinks from full to 0 over 3s, then fold executes -->
          <div
            v-if="foldPending"
            class="absolute bottom-0 left-0 h-1 bg-amber-400 transition-all ease-linear"
            :style="{ width: foldCountdown ? '0%' : '100%', transitionDuration: '3s' }"
          />
        </button>
      </UTooltip>

      <!-- Check / Call -->
      <UTooltip
        :text="canCheck
          ? 'Pass the action — no chips needed'
          : `Match the current bet of ${formatAmount(Math.min(toCall, maxRaise))}${toCall >= maxRaise ? ' (all your remaining chips)' : ''}`"
        class="flex-1"
      >
        <button
          class="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all
                 active:scale-[0.97]"
          :class="canCheck
            ? 'bg-gray-700/60 hover:bg-gray-600/80 text-gray-200 border border-gray-600/40'
            : 'bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 border border-blue-700/40'"
          @click="handleCheckCall"
        >
          <template v-if="canCheck">Check</template>
          <template v-else>
            Call <span class="tabular-nums">{{ formatAmount(Math.min(toCall, maxRaise)) }}</span>
            <span v-if="toCall >= maxRaise" class="text-xs opacity-70 ml-1">(all-in)</span>
          </template>
        </button>
      </UTooltip>

      <!-- Raise / Bet / All-In -->
      <UTooltip
        v-if="canRaise"
        :text="isAllIn
          ? `Push all your chips in — ${formatAmount(maxRaise)}`
          : `Increase the bet to ${formatAmount(raiseAmount)} (min ${formatAmount(minRaise)})`"
        class="flex-1"
      >
        <button
          class="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all
                 bg-green-900/60 hover:bg-green-800/80 text-green-200 border border-green-700/40
                 active:scale-[0.97]"
          @click="handleRaise"
        >
          <template v-if="isAllIn">
            All-In <span class="tabular-nums">{{ formatAmount(maxRaise) }}</span>
          </template>
          <template v-else>
            Raise <span class="tabular-nums">{{ formatAmount(raiseAmount) }}</span>
          </template>
        </button>
      </UTooltip>
    </div>

    <!-- Row 2: Raise presets + custom (only when raising is possible) -->
    <div v-if="canRaise" class="space-y-2">
      <!-- Preset buttons (primary raise interaction) -->
      <div class="flex gap-2">
        <UTooltip
          v-for="preset in presets"
          :key="preset.label"
          :text="preset.isClamped
            ? `${preset.label} (${formatAmount(preset.raw)}) is below the min-raise of ${formatAmount(minRaise)}`
            : `Raise to ${formatAmount(preset.amount)}`"
          class="flex-1"
        >
          <button
            class="w-full py-2.5 rounded-lg text-sm font-bold transition-all border
                   active:scale-[0.97]"
            :class="[
              raiseAmount === preset.amount
                ? 'bg-green-700/70 text-green-100 border-green-500/60 shadow-sm shadow-green-500/10'
                : 'bg-gray-800/70 text-gray-200 border-gray-700/50 hover:bg-gray-700/70 hover:border-gray-600/50',
              preset.isClamped ? 'opacity-40 cursor-not-allowed' : '',
            ]"
            :disabled="preset.isClamped"
            @click="!preset.isClamped && raisePreset(preset.amount)"
          >
            {{ preset.label }}
            <span class="block text-xs opacity-70 mt-0.5 tabular-nums font-mono">{{ formatAmount(preset.raw) }}</span>
          </button>
        </UTooltip>

        <!-- All-in button -->
        <UTooltip :text="`Go all-in for ${formatAmount(maxRaise)}`" class="flex-1">
          <button
            class="w-full py-2.5 rounded-lg text-sm font-bold transition-all border
                   active:scale-[0.97]"
            :class="raiseAmount === maxRaise
              ? 'bg-amber-700/70 text-amber-100 border-amber-500/60 shadow-sm shadow-amber-500/10'
              : 'bg-gray-800/70 text-gray-200 border-gray-700/50 hover:bg-gray-700/70'"
            @click="raisePreset(maxRaise)"
          >
            All-In
            <span class="block text-[0.6rem] opacity-60 mt-0.5 tabular-nums">{{ formatAmount(maxRaise) }}</span>
          </button>
        </UTooltip>
      </div>

      <!-- Slider -->
      <div class="flex items-center gap-3">
        <span class="text-[0.65rem] text-gray-500 w-16 text-right font-mono tabular-nums">{{ formatAmount(minRaise) }}</span>
        <input
          v-model.number="raiseAmount"
          type="range"
          :min="minRaise"
          :max="maxRaise"
          :step="bb"
          class="flex-1 h-2 appearance-none rounded-full bg-gray-700 cursor-pointer
                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500
                 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-green-300
                 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span class="text-[0.65rem] text-gray-500 w-16 font-mono tabular-nums">{{ formatAmount(maxRaise) }}</span>
      </div>

      <!-- Current raise display + min-raise indicator + custom input toggle -->
      <div class="flex items-center justify-between">
        <div class="text-sm">
          <span class="text-gray-400">Raise to: </span>
          <span class="text-green-400 font-bold font-mono tabular-nums">{{ formatAmount(raiseAmount) }}</span>
          <span v-if="isAllIn" class="text-amber-400 text-xs ml-1">(all-in)</span>
          <span class="text-gray-600 text-[0.6rem] ml-2">min {{ formatAmount(minRaise) }}</span>
        </div>
        <button
          class="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
          @click="showCustom = !showCustom"
        >
          {{ showCustom ? 'hide' : 'exact amount' }}
        </button>
      </div>

      <!-- Custom amount input -->
      <div v-if="showCustom" class="flex gap-2">
        <input
          v-model="customInput"
          type="number"
          :min="minRaise"
          :max="maxRaise"
          :step="bb"
          :placeholder="`${minRaise} – ${maxRaise}`"
          class="flex-1 bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white
                 placeholder-gray-500 focus:outline-none focus:border-green-500/50"
          @keyup.enter="applyCustom"
        />
        <button
          class="px-4 py-1.5 rounded-md bg-green-700/60 text-green-200 text-sm font-semibold
                 border border-green-600/40 hover:bg-green-600/60 active:scale-[0.97] transition-all"
          @click="applyCustom"
        >
          Set
        </button>
      </div>
    </div>
  </div>
</template>
