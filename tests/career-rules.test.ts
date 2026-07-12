import { describe, it, expect } from 'vitest'
import config from '../holdem.config'
import {
  freshCareer, buyInFor, startSession, settleSession,
  evaluateMovement, isBust, archiveRun, refundAbandoned,
} from '../app/utils/careerRules'
import type { CareerState } from '../app/utils/careerRules'

const cfg = config.career
const stakes = config.stakes
const NOW = '2026-07-12T12:00:00.000Z'

describe('career roster integrity', () => {
  it('every roster name resolves to a persona, every roster seats a 6-max table', () => {
    for (const [tier, names] of Object.entries(cfg.tiers)) {
      expect(names.length, `tier ${tier} needs >= playerCount-1 opponents`).toBeGreaterThanOrEqual(cfg.playerCount - 1)
      for (const name of names) {
        expect(config.personas.find(p => p.name === name), `unknown persona "${name}" in tier ${tier}`).toBeDefined()
      }
    }
  })
})

describe('buy-ins', () => {
  it('is 100bb of tier stake', () => {
    expect(buyInFor(1, cfg, stakes)).toBe(50)     // $0.50 bb
    expect(buyInFor(3, cfg, stakes)).toBe(200)    // $2 bb
    expect(buyInFor(6, cfg, stakes)).toBe(5000)   // $50 bb
  })
})

describe('session lifecycle', () => {
  it('start deducts the buy-in and records pending', () => {
    const s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    expect(s.bankroll).toBe(cfg.startingBankroll - 50)
    expect(s.pendingSession).toEqual({ tier: 1, buyIn: 50, startedAt: NOW })
  })
  it('start throws when a session is already pending', () => {
    const s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    expect(() => startSession(s, cfg, stakes, NOW)).toThrow()
  })
  it('start throws when bankroll cannot cover the buy-in', () => {
    const s: CareerState = { ...freshCareer(cfg, NOW), bankroll: 49 }
    expect(() => startSession(s, cfg, stakes, NOW)).toThrow()
  })
  it('settle banks the cash-out and counts hands', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = settleSession(s, 80, 42, 'leave', NOW)
    expect(s.bankroll).toBe(cfg.startingBankroll - 50 + 80)
    expect(s.handsAtTier).toBe(42)
    expect(s.totalHands).toBe(42)
    expect(s.pendingSession).toBeNull()
    expect(s.sessions).toHaveLength(1)
    expect(s.sessions[0]).toMatchObject({ tier: 1, buyIn: 50, cashOut: 80, hands: 42, endedBy: 'leave' })
    expect(s.peakBankroll).toBe(cfg.startingBankroll - 50 + 80)
  })
  it('settle without a pending session throws', () => {
    expect(() => settleSession(freshCareer(cfg, NOW), 0, 0, 'leave', NOW)).toThrow()
  })
})

describe('movement rules', () => {
  const at = (tier: number, bankroll: number, handsAtTier: number): CareerState => ({
    ...freshCareer(cfg, NOW), currentTier: tier, bankroll, handsAtTier,
  })
  it('promotes only when BOTH bankroll and hands gates pass', () => {
    // next stake from tier 1 is Low ($1 bb): 10 buy-ins = $1000
    expect(evaluateMovement(at(1, 1000, 100), cfg, stakes).moved).toBe('up')
    expect(evaluateMovement(at(1, 999, 100), cfg, stakes).moved).toBe(null)
    expect(evaluateMovement(at(1, 1000, 99), cfg, stakes).moved).toBe(null)
  })
  it('promotion resets handsAtTier and moves one tier', () => {
    const r = evaluateMovement(at(1, 1000, 150), cfg, stakes)
    expect(r.state.currentTier).toBe(2)
    expect(r.state.handsAtTier).toBe(0)
    expect(r.state.peakTier).toBe(2)
  })
  it('does not promote past the top tier', () => {
    expect(evaluateMovement(at(6, 10_000_000, 10_000), cfg, stakes).moved).toBe(null)
  })
  it('demotes below 2 buy-ins of the current stake', () => {
    // tier 3 buy-in $200 → floor $400
    expect(evaluateMovement(at(3, 399, 500), cfg, stakes).moved).toBe('down')
    expect(evaluateMovement(at(3, 400, 500), cfg, stakes).moved).toBe(null)
  })
  it('demotion resets handsAtTier and cannot go below tier 1', () => {
    const r = evaluateMovement(at(3, 100, 500), cfg, stakes)
    expect(r.state.currentTier).toBe(2)
    expect(r.state.handsAtTier).toBe(0)
    expect(evaluateMovement(at(1, 60, 0), cfg, stakes).moved).toBe(null)
  })
})

describe('bust and archive', () => {
  it('bust below one Micro buy-in', () => {
    expect(isBust({ ...freshCareer(cfg, NOW), bankroll: 49 }, cfg, stakes)).toBe(true)
    expect(isBust({ ...freshCareer(cfg, NOW), bankroll: 50 }, cfg, stakes)).toBe(false)
  })
  it('archive preserves history and starts a fresh run', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = settleSession(s, 500, 60, 'leave', NOW)
    s = archiveRun(s, cfg, 'retired', '2026-07-13T00:00:00.000Z')
    expect(s.bankroll).toBe(cfg.startingBankroll)
    expect(s.currentTier).toBe(1)
    expect(s.sessions).toHaveLength(0)
    expect(s.archivedRuns).toHaveLength(1)
    expect(s.archivedRuns[0]).toMatchObject({
      endedBy: 'retired', peakBankroll: cfg.startingBankroll - 50 + 500, totalHands: 60, sessionCount: 1,
    })
  })
})

describe('abandoned sessions', () => {
  it('refunds the buy-in and logs an abandoned record', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = refundAbandoned(s, NOW)
    expect(s.bankroll).toBe(cfg.startingBankroll)
    expect(s.pendingSession).toBeNull()
    expect(s.sessions[0]).toMatchObject({ endedBy: 'abandoned', cashOut: 50, hands: 0 })
  })
  it('is a no-op without a pending session', () => {
    const s = freshCareer(cfg, NOW)
    expect(refundAbandoned(s, NOW)).toEqual(s)
  })
})
