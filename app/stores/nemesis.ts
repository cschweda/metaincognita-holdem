import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import config from '@config'
import {
  emptyModel, decayAndRecord, recordSizing as ruleRecordSizing,
  modelToHeroProfile, familiarityOf, describeReads,
} from '~/utils/heroModel'
import type { PersistentHeroModel } from '~/utils/heroModel'
import type { HeroHandRecord } from '~/stores/heroProfile'

const STORAGE_KEY = 'holdem-nemesis-v1'

export const useNemesisStore = defineStore('nemesis', () => {
  const cfg = config.nemesis
  const model = ref<PersistentHeroModel>(emptyModel())
  const storageWarning = ref(false)

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(model.value))
      storageWarning.value = false
    } catch {
      storageWarning.value = true
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistentHeroModel
      if (parsed?.version !== 1) return
      model.value = parsed
    } catch {
      // corrupted/unavailable storage → fresh book
    }
  }
  if (typeof localStorage !== 'undefined') load()

  const bookProfile = computed(() => modelToHeroProfile(model.value, cfg))
  const reads = computed(() => describeReads(model.value, cfg))

  function familiarityFor(name: string): number {
    return familiarityOf(model.value, name, cfg)
  }
  function record(rec: HeroHandRecord, opponents: string[]) {
    model.value = decayAndRecord(model.value, rec, opponents, cfg)
    save()
  }
  function recordSizing(avgSizing: number, wasStrong: boolean) {
    model.value = ruleRecordSizing(model.value, avgSizing, wasStrong)
    save()
  }
  function reset() {
    model.value = emptyModel()
    save()
  }

  return { model, storageWarning, bookProfile, reads, familiarityFor, record, recordSizing, reset }
})
