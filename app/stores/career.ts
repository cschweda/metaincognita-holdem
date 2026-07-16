import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import config from '@config'
import {
  freshCareer, startSession as ruleStart, settleSession, evaluateMovement,
  isBust, archiveRun, refundAbandoned, buyInFor, sanitizeCareerState,
} from '~/utils/careerRules'
import type { CareerState, SessionEnd } from '~/utils/careerRules'

const STORAGE_KEY = 'holdem-career-v1'

function nowIso(): string {
  return new Date().toISOString()
}

export const useCareerStore = defineStore('career', () => {
  const cfg = config.career
  const stakes = config.stakes

  const state = ref<CareerState>(freshCareer(cfg, nowIso()))
  const storageWarning = ref(false)
  const lastMovement = ref<'up' | 'down' | 'bust' | null>(null)
  const hadAbandoned = ref(false)

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      storageWarning.value = false
    } catch {
      storageWarning.value = true
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      // localStorage is user-editable: shape-validate, don't just version-check.
      // An unusable payload keeps the fresh default instead of bricking pages.
      const sane = sanitizeCareerState(JSON.parse(raw), stakes, nowIso())
      if (!sane) return
      state.value = sane
      // Refresh mid-session: table state is gone — refund the buy-in
      // (accepted refresh-to-undo tradeoff, see the spec's edge cases)
      if (state.value.pendingSession) {
        state.value = refundAbandoned(state.value, nowIso())
        hadAbandoned.value = true
        save()
      }
    } catch {
      // corrupted/unavailable storage → keep the fresh default
    }
  }
  if (typeof localStorage !== 'undefined') load()

  const tierStake = computed(() => stakes.find(s => s.level === state.value.currentTier)!)
  const currentBuyIn = computed(() => buyInFor(state.value.currentTier, cfg, stakes))

  const promotionProgress = computed(() => {
    const maxTier = Math.max(...stakes.map(s => s.level))
    if (state.value.currentTier >= maxTier) return null
    const nextBuyIn = buyInFor(state.value.currentTier + 1, cfg, stakes)
    return {
      nextBuyIn,
      bankrollPct: Math.min(1, state.value.bankroll / (cfg.promoteBuyIns * nextBuyIn)),
      handsPct: Math.min(1, state.value.handsAtTier / cfg.promoteMinHands),
    }
  })

  const perTierStats = computed(() => {
    const byTier = new Map<number, { sessions: number; hands: number; net: number }>()
    for (const s of state.value.sessions) {
      if (s.endedBy === 'abandoned') continue
      const t = byTier.get(s.tier) ?? { sessions: 0, hands: 0, net: 0 }
      t.sessions++
      t.hands += s.hands
      t.net += s.cashOut - s.buyIn
      byTier.set(s.tier, t)
    }
    return [...byTier.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tier, t]) => {
        const bb = stakes.find(s => s.level === tier)!.bb
        return { tier, ...t, bb100: t.hands > 0 ? (t.net / bb) / t.hands * 100 : 0 }
      })
  })

  function startSession() {
    state.value = ruleStart(state.value, cfg, stakes, nowIso())
    save()
  }

  function settle(cashOut: number, hands: number, endedBy: SessionEnd) {
    state.value = settleSession(state.value, cashOut, hands, endedBy, nowIso())
    if (isBust(state.value, cfg, stakes)) {
      state.value = archiveRun(state.value, cfg, 'bust', nowIso())
      lastMovement.value = 'bust'
    } else {
      const r = evaluateMovement(state.value, cfg, stakes)
      state.value = r.state
      if (r.moved) lastMovement.value = r.moved
    }
    save()
  }

  function retire() {
    state.value = archiveRun(state.value, cfg, 'retired', nowIso())
    lastMovement.value = null
    save()
  }

  function clearMovement() {
    lastMovement.value = null
    hadAbandoned.value = false
  }

  return {
    state, storageWarning, lastMovement, hadAbandoned,
    tierStake, currentBuyIn, promotionProgress, perTierStats,
    startSession, settle, retire, clearMovement,
  }
})
