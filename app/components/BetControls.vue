<script setup lang="ts">
/**
 * Betting controls — fold, check/call, raise with presets and custom slider.
 * Sits below the table. Disabled when it's not the hero's turn.
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

const raiseAmount = ref(props.minRaise)
const customInput = ref('')
const showCustom = ref(false)

// Keep raise amount within bounds when props change
watch(() => [props.minRaise, props.maxRaise], () => {
  raiseAmount.value = Math.max(props.minRaise, Math.min(raiseAmount.value, props.maxRaise))
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

function handleFold() {
  emit('fold')
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
      <!-- Fold -->
      <UTooltip text="Surrender your hand and lose any chips already in the pot" class="flex-1">
        <button
          class="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all
                 bg-red-900/60 hover:bg-red-800/80 text-red-200 border border-red-700/40
                 active:scale-[0.97]"
          @click="handleFold"
        >
          Fold
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
            Call {{ formatAmount(Math.min(toCall, maxRaise)) }}
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
            All-In {{ formatAmount(maxRaise) }}
          </template>
          <template v-else>
            Raise {{ formatAmount(raiseAmount) }}
          </template>
        </button>
      </UTooltip>
    </div>

    <!-- Row 2: Raise presets + custom (only when raising is possible) -->
    <div v-if="canRaise" class="space-y-2">
      <!-- Preset buttons -->
      <div class="flex gap-1.5">
        <UTooltip
          v-for="preset in presets"
          :key="preset.label"
          :text="preset.isClamped
            ? `${preset.label} (${formatAmount(preset.raw)}) is below the min-raise of ${formatAmount(minRaise)}`
            : `Raise to ${formatAmount(preset.amount)}`"
          class="flex-1"
        >
          <button
            class="w-full py-1.5 rounded-md text-xs font-semibold transition-all border
                   active:scale-[0.97]"
            :class="[
              raiseAmount === preset.amount
                ? 'bg-green-700/60 text-green-100 border-green-500/50'
                : 'bg-gray-800/60 text-gray-300 border-gray-700/40 hover:bg-gray-700/60',
              preset.isClamped ? 'opacity-50 cursor-not-allowed' : '',
            ]"
            :disabled="preset.isClamped"
            @click="!preset.isClamped && raisePreset(preset.amount)"
          >
            {{ preset.label }}
            <span class="block text-[0.6rem] opacity-60 mt-0.5">{{ formatAmount(preset.raw) }}</span>
          </button>
        </UTooltip>

        <!-- All-in button -->
        <UTooltip :text="`Go all-in for ${formatAmount(maxRaise)}`" class="flex-1">
          <button
            class="w-full py-1.5 rounded-md text-xs font-semibold transition-all border
                   active:scale-[0.97]"
            :class="raiseAmount === maxRaise
              ? 'bg-amber-700/60 text-amber-100 border-amber-500/50'
              : 'bg-gray-800/60 text-gray-300 border-gray-700/40 hover:bg-gray-700/60'"
            @click="raisePreset(maxRaise)"
          >
            All-In
            <span class="block text-[0.6rem] opacity-60 mt-0.5">{{ formatAmount(maxRaise) }}</span>
          </button>
        </UTooltip>
      </div>

      <!-- Slider -->
      <div class="flex items-center gap-3">
        <span class="text-[0.65rem] text-gray-500 w-12 text-right">{{ formatAmount(minRaise) }}</span>
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
        <span class="text-[0.65rem] text-gray-500 w-12">{{ formatAmount(maxRaise) }}</span>
      </div>

      <!-- Current raise display + min-raise indicator + custom input toggle -->
      <div class="flex items-center justify-between">
        <div class="text-sm">
          <span class="text-gray-400">Raise to: </span>
          <span class="text-green-400 font-bold font-mono">{{ formatAmount(raiseAmount) }}</span>
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
