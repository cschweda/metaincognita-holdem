/**
 * Live commentary composable — runs TWO simultaneous streams:
 *   'hero'  — Hero's perspective. Only hero's cards + public info.
 *   'tv'    — Chorman Nad & Mon LeEachern style dual-voice TV broadcast.
 * Quip pools in commentaryQuips.ts. Strategic generators in commentaryStrategic.ts.
 */
import type { Card } from '~/utils/cards'
import { displayCard } from '~/utils/cards'
import { chenScore, bestHand, HAND_RANK_NAMES, HAND_RANKS, detectDraws, totalOuts as dedupOuts, estimateEquity, describeHand } from '~/utils/handAnalysis'
import type { PlayerState } from '~/composables/useGameState'
import config from '@config'
import {
  pick, normanFoldQuips, normanBigFoldQuips, normanBluffQuips, normanRaiseQuips,
  normanCallQuips, normanCheckQuips, normanAllinQuips, normanAllinJunkQuips,
  normanShowdownWinQuips, normanShowdownLoseQuips, normanCoolerQuips,
  normanForeshadowQuips, normanStreetHitQuips, normanStreetMissQuips,
  normanGenericQuips, normanRandomBanter, normanBoardQuips, normanPocketPairQuips,
  normanDrawQuips, normanRiverQuips, normanPotSizeQuips, normanHeadsUpQuips,
  normanSelfAwareQuips, normanSliderUpQuips, normanSliderDownQuips,
  normanPersonaQuip, resetAllQuipPools,
  lonBoardAnalysis, pickBoardAnalysis, lonPlayerReads, lonPotAnalysis, lonTiltReads,
  lonStreetTransition, lonShowdownAnalysis, lonBotPlayReads, resetLonPools,
  normanBanterAfterMon, lonReactsToNorman, normanBotAwarenessExtra,
  lonFoldAssessment, normanFoldReactionQuips,
  lonChipObservation, normanChipQuips,
} from '~/utils/commentaryQuips'
import { strategicFlopObs, strategicActionObs, strategicShowdownObs } from '~/utils/commentaryStrategic'

export type CommentaryMode = 'hero' | 'tv'

export interface CommentaryLine {
  id: number
  text: string
  type: 'deal' | 'action' | 'street' | 'showdown' | 'aside'
  voice?: 'lon' | 'norman'
}

let lineId = 0
function cardStr(c: [Card, Card]): string { return `${displayCard(c[0])} ${displayCard(c[1])}` }
function pairName(r: number): string {
  const n: Record<number, string> = { 14: 'aces', 13: 'kings', 12: 'queens', 11: 'jacks', 10: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'deuces' }
  return n[r] || `${r}s`
}
function isPair(c: [Card, Card]): boolean { return c[0].rank === c[1].rank }
function persona(name: string) { return config.personas.find(p => p.name === name) }

// Slider state (module-level, set by composable watchers)
let _normanSilence = 40
function normanFeelsLikeIt(): boolean {
  if (_normanSilence >= 100) return false
  return Math.random() * 100 >= _normanSilence
}
let _lonAnalysis = 60
function lonWantsToAnalyze(): boolean { return Math.random() * 100 < _lonAnalysis }
let _normanSerious = 30
function normanWantsToBeSerious(): boolean { return Math.random() * 100 < _normanSerious }
/** When serious slider is high, Chorman prefers banter/analysis over quips. */
function normanPrefersBanter(): boolean { return _normanSerious >= 50 && Math.random() * 100 < _normanSerious }

/**
 * Optionally prefix an action quip with a player-specific intro (~35% of the time).
 * Only for action-specific quips where a player just did something.
 * "Degreanu there. Another one bites the dust."
 */
function personalizeQuip(quip: string, name: string): string {
  if (!name || Math.random() > 0.35) return quip
  const displayName = name === 'Hero' ? 'Hero' : name.split(' ')[0]
  return pick([
    `${displayName} there. `,
    `${displayName}. `,
    `That's ${displayName}. `,
    `Oh, ${displayName}. `,
    `${displayName} — `,
  ]) + quip
}

// Alias strategic generators
const normanStrategicFlopObs = strategicFlopObs
const normanStrategicActionObs = strategicActionObs
const normanStrategicShowdownObs = strategicShowdownObs


interface GS {
  playerStates: Ref<PlayerState[]>
  street: Ref<string>
  dealt: Ref<boolean>
  pot: Ref<number>
  allCommunity: Ref<Card[]>
  visibleCommunity: ComputedRef<Card[]>
  handActionLog: Ref<string[]>
  heroTurn: ComputedRef<boolean>
  heroWonHand: Ref<boolean>
  heroWinAmount: Ref<number>
  handWinnerName: Ref<string>
  activePlayers: ComputedRef<PlayerState[]>
  positions?: ComputedRef<string[]> | Ref<string[]>  // position labels by seat index
  bb?: Ref<number> | ComputedRef<number>              // big blind amount
}

export function useCommentary(gs: GS) {
  const heroLines = ref<CommentaryLine[]>([])
  const tvLines = ref<CommentaryLine[]>([])
  // Always start as Hero POV enabled. Setup screen sets these directly via handleStart().
  const enabled = ref(true)
  const mode = ref<CommentaryMode>('hero')

  // Sliders are 0-100 percentages; storage is user-editable, so a non-numeric
  // value must fall back (NaN would silently disable both commentators and
  // then get persisted back as the string "NaN").
  function loadSlider(key: string, fallback: number): number {
    if (typeof localStorage === 'undefined') return fallback
    const v = parseInt(localStorage.getItem(key) || String(fallback), 10)
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback
  }
  const normanSilence = ref(loadSlider('holdem-norman-silence', 40))
  const lonAnalysis = ref(loadSlider('holdem-lon-analysis', 60))
  const normanSerious = ref(loadSlider('holdem-norman-serious', 30))

  // No localStorage for enabled/mode — set directly by handleStart() from setup screen choice
  let prevSilence = -1
  watch(normanSilence, v => {
    const wasHigher = prevSilence >= 0 && v > prevSilence
    const wasLower = prevSilence >= 0 && v < prevSilence
    _normanSilence = v
    if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-norman-silence', String(v))
    // Norman reacts to being adjusted (only during a game, not on init)
    if (prevSilence >= 0 && enabled.value && mode.value === 'tv' && Math.abs(v - prevSilence) >= 10) {
      if (wasHigher) addTV(pick(normanSliderDownQuips), 'aside', 'norman')
      else if (wasLower) addTV(pick(normanSliderUpQuips), 'aside', 'norman')
    }
    prevSilence = v
  }, { immediate: true })
  watch(lonAnalysis, v => { _lonAnalysis = v; if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-lon-analysis', String(v)) }, { immediate: true })
  watch(normanSerious, v => { _normanSerious = v; if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-norman-serious', String(v)) }, { immediate: true })

  const lines = computed(() => mode.value === 'tv' ? tvLines.value : heroLines.value)

  // Which voice speaks next in TV mode (alternates)
  let nextVoice: 'lon' | 'norman' = 'lon'

  // Always generate both streams regardless of enabled — so switching mid-hand shows full history
  function addHero(text: string, type: CommentaryLine['type'] = 'aside') {
    heroLines.value = [...heroLines.value, { id: ++lineId, text, type }]
  }
  function addTV(text: string, type: CommentaryLine['type'] = 'aside', voice?: 'lon' | 'norman') {
    const v = voice || nextVoice
    nextVoice = v === 'lon' ? 'norman' : 'lon'
    tvLines.value = [...tvLines.value, { id: ++lineId, text, type, voice: v }]
  }
  function clear() {
    heroLines.value = []; tvLines.value = []; nextVoice = 'lon'
    resetAllQuipPools()
    resetLonPools()
  }

  // ─── Helpers ─────────────────────────────────────────────

  function activePl(): PlayerState[] { return gs.playerStates.value.filter(p => !p.folded && !p.eliminated && p.holeCards) }
  function findPl(name: string) { return gs.playerStates.value.find(p => p.name === name) }
  function hero(): PlayerState { return gs.playerStates.value[0] }
  function playerPos(p: PlayerState): string {
    return gs.positions?.value[p.id] ?? ''
  }
  function handStr(p: PlayerState, community: Card[]): string | null {
    if (!p.holeCards || community.length < 3) return null
    const r = bestHand(Array.from(p.holeCards), community)
    return r ? HAND_RANK_NAMES[r.rank] : null
  }

  /**
   * When Chorman speaks, decide between a quip, strategic observation, or Mon-banter.
   * Uses normanSerious slider: high = more strategic/banter, low = more quips.
   * name is optional — when provided, quips are sometimes personalized.
   */
  /**
   * Gated Chorman speech — respects the frequency slider.
   * Use for ALL Norman lines except slider reactions and banter responses.
   * Returns true if Norman actually spoke.
   */
  function normanSays(text: string, type: CommentaryLine['type'] = 'action'): boolean {
    if (!normanFeelsLikeIt()) return false
    addTV(text, type, 'norman')
    return true
  }

  function tryStrategicNorman(fallbackQuip: () => string, type: CommentaryLine['type'] = 'action', strategicFn?: () => string | null): boolean {
    if (!normanFeelsLikeIt()) return false  // frequency gate — Chorman might skip this one
    // High serious: prefer strategic obs first, banter second, quip last
    if (normanWantsToBeSerious() && strategicFn) {
      const obs = strategicFn()
      if (obs) { addTV(obs, type, 'norman'); return true }
    }
    // When serious is high but no strategic obs available, use Mon-banter instead of quip
    if (normanPrefersBanter() && Math.random() < 0.40) {
      addTV(normanBanterAfterMon.pick(), type, 'norman')
      return true
    }
    addTV(fallbackQuip(), type, 'norman')
    return false
  }

  // ─── DEAL ───────────────────────────────────────────────

  // ── Grounded table-flow state: real winners window + tilt episodes ──
  const recentWinnerNames: string[] = []          // last 10 pot winners
  let announcedHeaterFor: string | null = null    // one heater callout per streak
  const announcedTilted = new Set<number>()       // one tilt callout per episode

  function onDeal() {
    const h = hero()
    if (!h.holeCards) return
    const chen = chenScore(h.holeCards)
    const cards = cardStr(h.holeCards)

    // ── Hero stream ──
    if (isPair(h.holeCards)) {
      const pair = pairName(h.holeCards[0].rank)
      addHero(chen >= 14
        ? pick([`Pocket ${pair}. Now we're talking.`, `We pick up pocket ${pair}. Premium hand.`, `${cards}. That'll play nicely.`])
        : pick([`Pocket ${pair}. Set mining territory.`, `${cards}. A pair — let's see a flop.`]),
      'deal')
    } else if (chen >= 10) {
      addHero(pick([`${cards}. Strong hand. Let's build a pot.`, `We pick up ${cards}. Premium territory.`, `${cards}. This is a raising hand.`]), 'deal')
    } else if (chen >= 7) {
      addHero(pick([`${cards}. Playable in the right spot.`, `We get ${cards}. Position matters here.`, `${cards}. Decent — depends on what happens preflop.`]), 'deal')
    } else {
      addHero(pick([`${cards}. Rough start.`, `We get ${cards}. Probably a fold unless we get a free look.`, `${cards}. Not much to work with here.`]), 'deal')
    }
    const playerCount = gs.playerStates.value.filter(p => !p.eliminated).length
    if (Math.random() < 0.35) {
      addHero(pick([`${playerCount} players at the table.`, `${playerCount - 1} opponents to get through.`]), 'deal')
    }

    // ── TV stream (Lon & Norman banter) ──
    addTV(pick([
      `New hand. Let's see what the cards have in store.`,
      `Cards are in the air. Here we go.`,
      `Fresh hand dealt. The tension builds.`,
    ]), 'deal', 'lon')

    // ── Grounded reads: announce REAL tilt episodes (actual TiltState, not a
    // guess) and REAL heaters (actual winners window). The bots genuinely
    // widen/steam when tilted and tighten up against a heater, so Mon's
    // observations describe behavior that is actually happening.
    for (const p of gs.playerStates.value) {
      if (p.isHero || p.eliminated) continue
      if (p.tilt?.tilted && !announcedTilted.has(p.id)) {
        announcedTilted.add(p.id)
        const sev = p.tilt.severity >= 1.0
        addTV(sev
          ? pick([
              `${p.name} has lost real pots back to back — that's genuine tilt territory. Expect wider opens, bigger bluffs, thinner calls.`,
              `${p.name} is steaming. The losses were real, and the next few hands will be played angry.`,
            ])
          : pick([
              `${p.name} just dropped a couple of pots. A little frustration creeping in — watch for looser entries.`,
              `Quiet tilt watch on ${p.name} after those losses. Nothing wild yet, but the range is widening.`,
            ]), 'deal', 'lon')
        if (normanFeelsLikeIt()) {
          const tq = normanPersonaQuip(p.name)
          if (tq) normanSays(tq, 'deal')
        }
        break // one tilt callout per deal
      }
      if (!p.tilt?.tilted) announcedTilted.delete(p.id)
    }
    if (recentWinnerNames.length >= 6) {
      const winCounts = new Map<string, number>()
      for (const n of recentWinnerNames) winCounts.set(n, (winCounts.get(n) ?? 0) + 1)
      const [hotName, hotWins] = [...winCounts.entries()].sort((a, b) => b[1] - a[1])[0]!
      if (hotWins >= 4 && hotName !== announcedHeaterFor) {
        announcedHeaterFor = hotName
        addTV(`${hotName} has won ${hotWins} of the last ${recentWinnerNames.length} pots. Tables tighten up against a heater — fewer bluffs at them, more trapping.`, 'deal', 'lon')
        if (normanFeelsLikeIt()) normanSays(pick([
          `${hotName} is running so hot I want to stand next to them at the buffet.`,
          `Somebody check ${hotName}'s sleeves. That's four pots faster than my last marriage ended.`,
        ]), 'deal')
      } else if (hotWins < 4) {
        announcedHeaterFor = null
      }
    }

    // Hero hand reaction — with pocket pair specifics
    if (isPair(h.holeCards) && h.holeCards[0].rank >= 11) {
      const pName = pairName(h.holeCards[0].rank) as keyof typeof normanPocketPairQuips
      const pairQuips = normanPocketPairQuips[pName]
      addTV(`Hero looks down at pocket ${pairName(h.holeCards[0].rank)}.`, 'deal', 'lon')
      addTV(pairQuips ? pick(pairQuips) : normanRaiseQuips.pick(), 'deal', 'norman')
    } else if (chen >= 10) {
      addTV(pick([`Hero looks down at ${cards}. That's a premium hand.`, `${cards} for Hero. Very strong.`]), 'deal', 'lon')
      addTV(pick([`Finally a hand worth playing. My ex-wife never had that kind of luck.`, `Oh, Hero's got a real hand. Unlike my poker game last Tuesday.`, `That's the kind of hand that makes you sit up straight.`, `Now THAT'S a starting hand. I get excited just looking at it. Which is sad, if you think about it.`]), 'deal', 'norman')
    } else if (chen <= 4) {
      addTV(`Hero picks up ${cards}.`, 'deal', 'lon')
      addTV(pick([`${cards}? I've gotten better hands from a vending machine.`, `That hand is so bad, even my mother-in-law would fold it.`, `Hero's going to need a miracle. Or several miracles.`, `That's the poker equivalent of getting socks for Christmas.`, `I wouldn't play that hand with someone else's chips.`]), 'deal', 'norman')
    } else {
      addTV(`${cards} for Hero.`, 'deal', 'lon')
    }

    // Occasional self-aware / bot-awareness quip (knows this is a simulation)
    if (Math.random() < 0.10) {
      addTV(Math.random() < 0.5 ? pick(normanSelfAwareQuips) : normanBotAwarenessExtra.pick(), 'aside', 'norman')
    }

    // Opponent hands
    const players = gs.playerStates.value.filter(p => !p.eliminated && p.holeCards)
    const monsters = players.filter(p => !p.isHero && p.holeCards && chenScore(p.holeCards!) >= 12)
    const junk = players.filter(p => !p.isHero && p.holeCards && chenScore(p.holeCards!) <= 2)

    if (monsters.length >= 2) {
      addTV(`${monsters[0].name} has ${cardStr(monsters[0].holeCards!)} and ${monsters[1].name} has ${cardStr(monsters[1].holeCards!)}.`, 'deal', 'lon')
      addTV(pick([`Two big hands. Somebody's going to the ATM after this one.`, `Collision course! This is why we watch poker, folks.`, `Oh boy. Both of them are loaded. This pot is going to be a monster.`, `Two premiums at the same table? That's like two people showing up to a party in the same outfit. Except with money on the line.`]), 'deal', 'norman')
    } else if (monsters.length === 1) {
      const m = monsters[0]
      addTV(`${m.name} is sitting on ${cardStr(m.holeCards!)}.`, 'deal', 'lon')
      const pq = normanPersonaQuip(m.name)
      if (pq) {
        addTV(pq, 'deal', 'norman')
      } else if (isPair(m.holeCards!)) {
        addTV(pick([`Pocket ${pairName(m.holeCards![0].rank)}. That's a hand that plays itself.`, `${m.name} with a big pocket pair. Somebody's about to donate.`]), 'deal', 'norman')
      } else {
        addTV(pick([`Strong hand for ${m.name}. Let's see if they get action.`, `${m.name}'s in business. Now who's going to pay them off?`]), 'deal', 'norman')
      }
    }

    if (junk.length > 0 && Math.random() < 0.5) {
      const j = pick(junk)
      addTV(`${j.name} was dealt ${cardStr(j.holeCards!)}.`, 'deal', 'lon')
      addTV(pick([
        `That hand should come with an apology note.`,
        `I've seen better cards in a game of Go Fish.`,
        `${j.name} got the deck's leftovers. The poker gods have a sense of humor.`,
        `My marriage had better odds than that hand.`,
      ]), 'deal', 'norman')
    }

    // Occasional chip-aware commentary (~20% of hands)
    if (Math.random() < 0.20) {
      const bbVal = gs.bb?.value || 2
      const chipObs = lonChipObservation(
        gs.playerStates.value.map(p => ({ name: p.name, chips: p.chips, isHero: p.isHero, eliminated: p.eliminated })),
        bbVal,
      )
      if (chipObs) {
        addTV(chipObs, 'aside', 'lon')
        if (normanFeelsLikeIt()) addTV(normanChipQuips.pick(), 'aside', 'norman')
      }
    }
  }

  // ─── ACTION ─────────────────────────────────────────────

  function onAction(entry: string) {
    if (entry.startsWith('---') || entry.startsWith('Flop:') || entry.startsWith('Turn:') || entry.startsWith('River:')) return

    // ── BLINDS ──
    const sbMatch = entry.match(/^(.+?) posts SB \$(\d+)/)
    const bbMatch = entry.match(/^(.+?) posts BB \$(\d+)/)
    if (sbMatch) {
      addHero(sbMatch[1] === hero().name ? `We post the small blind — $${sbMatch[2]}.` : `${sbMatch[1]} posts small blind $${sbMatch[2]}.`, 'action')
      addTV(`${sbMatch[1]} posts the small blind, $${sbMatch[2]}.`, 'action', 'lon')
      return
    }
    if (bbMatch) {
      addHero(bbMatch[1] === hero().name ? `We post the big blind — $${bbMatch[2]}.` : `${bbMatch[1]} posts big blind $${bbMatch[2]}.`, 'action')
      addTV(`${bbMatch[1]} posts the big blind, $${bbMatch[2]}.`, 'action', 'lon')
      addTV(pick([`And we're off. Let the action begin.`, `Blinds are in. Time to play some poker.`, `Money in the pot. Now things get interesting.`, normanGenericQuips.pick()]), 'action', 'norman')
      return
    }

    const foldM = entry.match(/^(.+?) folds/)
    const callM = entry.match(/^(.+?) calls \$(\d+)/)
    const raiseM = entry.match(/^(.+?) raises to \$(\d+)/)
    const betM = entry.match(/^(.+?) bets \$(\d+)/)
    const checkM = entry.match(/^(.+?) checks/)
    const allinM = entry.match(/^(.+?) goes ALL-IN \$(\d+)/)

    // ── FOLD ──
    if (foldM) {
      const name = foldM[1]
      const pl = findPl(name)
      if (!pl) return

      if (pl.isHero && pl.holeCards) {
        const chen = chenScore(pl.holeCards)
        addHero(chen >= 10
          ? pick([`We fold ${cardStr(pl.holeCards)}. Tough laydown.`, `Folding ${cardStr(pl.holeCards)}. Didn't like the action.`])
          : pick([`We fold. On to the next one.`, `Easy fold. Let's see how this plays out.`]),
        'action')
        addTV(chen >= 10
          ? pick([`Hero folds ${cardStr(pl.holeCards)}.`, `Hero lays down ${cardStr(pl.holeCards)}. Big fold.`])
          : `Hero folds.`, 'action', 'lon')
        normanSays(personalizeQuip(chen >= 10 ? normanBigFoldQuips.pick() : normanFoldQuips.pick(), 'Hero'), 'action')
        return
      }

      // Non-hero fold
      addHero(pick([`${name} folds.`, `${name} is out.`, `${name} mucks it.`]), 'action')

      if (pl.holeCards) {
        const chen = chenScore(pl.holeCards)
        const community = gs.visibleCommunity.value
        const pos = playerPos(pl)
        const facingRaise = gs.street.value === 'preflop' && gs.handActionLog.value.some(e => e.includes('raises'))

        if (community.length >= 3) {
          const hand = handStr(pl, community)
          if (hand && ['Two Pair', 'Three of a Kind', 'Straight', 'Flush'].includes(hand)) {
            addTV(`${name} folds ${hand}!`, 'action', 'lon')
            normanSays(personalizeQuip(normanBigFoldQuips.pick(), name), 'action')
          } else {
            addTV(`${name} folds.`, 'action', 'lon')
            normanSays(personalizeQuip(normanFoldQuips.pick(), name), 'action')
          }
        } else if (chen >= 8 || (chen <= 4 && pos)) {
          // Interesting preflop fold — Mon gives position-aware assessment, Chorman reacts
          const assessment = lonFoldAssessment(name, cardStr(pl.holeCards), pos, chen, gs.street.value, facingRaise)
          addTV(assessment, 'action', 'lon')
          if (chen >= 10) {
            normanSays(normanBigFoldQuips.pick(), 'action')
          } else {
            normanSays(normanFoldReactionQuips.pick(), 'action')
          }
        } else {
          addTV(`${name} folds ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          normanSays(personalizeQuip(normanFoldQuips.pick(), name), 'action')
        }
      }
      return
    }

    // Occasional pot size, heads-up, or SPR quip
    const activeCount = activePl().length
    const bbVal = gs.bb?.value || 2
    if (activeCount === 2 && Math.random() < 0.15) {
      addTV(normanHeadsUpQuips.pick(), 'aside', 'norman')
    } else if (gs.pot.value > 200 && Math.random() < 0.1) {
      addTV(normanPotSizeQuips.pick(), 'aside', 'norman')
    }
    // SPR observation on flop/turn when pot is significant
    if (gs.street.value !== 'preflop' && gs.pot.value > bbVal * 10 && Math.random() < 0.12) {
      const activePls = activePl()
      const smallestActive = Math.min(...activePls.map(p => p.chips))
      const spr = smallestActive / Math.max(gs.pot.value, 1)
      if (spr < 2) {
        addTV(pick([
          `The effective stack-to-pot ratio is below 2. At this depth, someone is likely pot-committed.`,
          `With this much in the pot relative to the remaining stacks, folding becomes very difficult for anyone still in.`,
          `Shallow SPR here. The math says if you're still in the hand, you're probably going to the river with it.`,
        ]), 'aside', 'lon')
      } else if (spr < 4) {
        addTV(pick([
          `Stack-to-pot ratio is getting low. Commitment decisions are coming soon.`,
          `With the pot this size relative to stacks, one more bet commits someone to the hand.`,
          `Low SPR territory. The next bet will likely define who's all-in and who's not.`,
        ]), 'aside', 'lon')
      }
    }

    // ── ALL-IN ──
    if (allinM) {
      const name = allinM[1]
      const amount = parseInt(allinM[2])
      const pl = findPl(name)

      addHero(pick([`${name} goes ALL-IN! $${amount}.`, `ALL-IN from ${name}! $${amount} on the line.`, `${name} shoves $${amount}. Big decision coming.`]), 'action')

      // Chip context for all-in
      if (pl && amount <= bbVal * 12 && lonWantsToAnalyze()) {
        const bbs = Math.round(amount / bbVal)
        addTV(pick([
          `Only ${bbs} big blinds behind that shove. When you're that short, you take your spot and go with it.`,
          `A ${bbs}-big-blind all-in. At this stack depth, almost any reasonable hand justifies a shove.`,
          `${bbs} big blinds is desperation territory. The blinds will eat that stack in a few orbits.`,
        ]), 'aside', 'lon')
      }

      if (pl?.holeCards) {
        const community = gs.visibleCommunity.value
        const hand = community.length >= 3 ? handStr(pl, community) : null
        if (hand && ['Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'].includes(hand)) {
          addTV(`${name} shoves $${amount} with ${hand}!`, 'action', 'lon')
          normanSays(personalizeQuip(normanAllinQuips.pick(), name), 'action')
        } else if (pl.holeCards && chenScore(pl.holeCards) <= 4 && gs.street.value === 'preflop') {
          addTV(`${name} goes all-in with ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          // Tilt reads only when the player is ACTUALLY tilted (real TiltState) —
          // otherwise it's just a loose shove, not a meltdown
          if (lonWantsToAnalyze()) {
            addTV(pl.tilt?.tilted ? lonTiltReads.pick() : pick([
              `Nothing in the recent hands explains that — it's not tilt, it's just maximum pressure with minimum hand.`,
              `That's not a frustrated shove, that's a calculated one. Pure fold-equity poker.`,
            ]), 'action', 'lon')
          }
          normanSays(personalizeQuip(normanAllinJunkQuips.pick(), name), 'action')
        } else {
          addTV(`ALL-IN from ${name}! $${amount}.`, 'action', 'lon')
          // Real call math instead of a canned pot-odds line
          if (lonWantsToAnalyze()) {
            const potNow = gs.pot.value
            const needPct = Math.round((amount / Math.max(potNow + amount, 1)) * 100)
            addTV(`The pot sits at $${potNow}. Calling costs $${amount} — that's about ${needPct}% equity needed to continue.`, 'action', 'lon')
          }
          normanSays(personalizeQuip(normanAllinQuips.pick(), name), 'action')
        }
      } else {
        addTV(`${name} shoves for $${amount}!`, 'action', 'lon')
        normanSays(personalizeQuip(normanAllinQuips.pick(), name), 'action')
      }
      return
    }

    // ── RAISE / BET ──
    if (raiseM || betM) {
      const match = raiseM || betM!
      const name = match[1]
      const amount = parseInt(match[2])
      const pl = findPl(name)
      const per = pl ? persona(pl.name) : null

      addHero(pick([
        `${name} makes it $${amount}.`,
        `$${amount} from ${name}.`,
        per ? `${name} ${raiseM ? 'raises' : 'bets'} $${amount}. ${per.vpip > 0.28 ? 'They play a lot of hands.' : 'Tight player raising — respect it.'}` : `${name} ${raiseM ? 'raises to' : 'bets'} $${amount}.`,
      ]), 'action')

      if (pl?.holeCards) {
        const community = gs.visibleCommunity.value
        const pos = playerPos(pl)
        const chen = chenScore(pl.holeCards)
        const isBluff = community.length >= 3
          ? (() => { const h = bestHand(Array.from(pl.holeCards!), community); return h ? h.rank <= HAND_RANKS.HIGH_CARD : true })()
          : chen <= 4

        // Position-aware preflop commentary for notable opens
        const earlyPos = ['UTG', 'UTG+1'].includes(pos)
        const latePos = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO'].includes(pos)
        const posLabel = pos === 'BTN' || pos === 'D' || pos === 'D/BTN' ? 'the button'
          : pos === 'CO' ? 'the cutoff' : pos === 'UTG' ? 'under the gun'
          : pos === 'UTG+1' ? 'UTG+1' : pos === 'SB' || pos === 'D/SB' ? 'the small blind' : ''

        // Occasional range/style observation from Mon (~15% of preflop raises)
        if (gs.street.value === 'preflop' && per && lonWantsToAnalyze() && Math.random() < 0.15) {
          const vpipPct = Math.round(per.vpip * 100)
          if (per.vpip <= 0.18 && earlyPos) {
            addTV(pick([
              `${name} only plays about ${vpipPct}% of hands. A raise from ${posLabel} narrows their range to premiums — big pairs, big aces.`,
              `With a ${vpipPct}% VPIP from ${posLabel}, you're looking at a very strong range. Aces through jacks, ace-king, maybe ace-queen.`,
              `This is a tight player raising from early position. Their range is narrow and strong. Proceed with caution.`,
            ]), 'aside', 'lon')
          } else if (per.vpip >= 0.30 && latePos) {
            addTV(pick([
              `${name} plays ${vpipPct}% of hands. From ${posLabel}, their range is very wide — any pair, any suited ace, most broadways, suited connectors.`,
              `A ${vpipPct}% VPIP player on ${posLabel}. This could be anything from aces to suited junk. Their range is enormous.`,
              `Loose player in position. That raise could be premium or it could be a steal attempt. Wide range from ${posLabel}.`,
            ]), 'aside', 'lon')
          } else if (per.vpip >= 0.30 && earlyPos) {
            addTV(pick([
              `A loose player raising from ${posLabel} — ${vpipPct}% VPIP. Even loose players tighten up in early position, but their range is still wider than most.`,
              `${name} is known to play wide. Even from early position, they could have a lot of hands here.`,
            ]), 'aside', 'lon')
          }
        }

        if (isBluff) {
          // Junk raise — Mon includes position when it's notable (EP junk = very notable)
          const posNote = earlyPos && gs.street.value === 'preflop' && pos
            ? ` from ${posLabel}` : ''
          addTV(`${name} ${raiseM ? 'raises to' : 'bets'} $${amount}${posNote} with ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          if (earlyPos && gs.street.value === 'preflop') {
            // Mon adds position-aware critique, then Chorman reacts
            addTV(`Opening that hand from ${posLabel}? That's either a read or a mistake. Probably a mistake.`, 'action', 'lon')
            addTV(pick([
              `${posLabel} with THAT? I've seen braver decisions, but not smarter ones.`,
              `Opening junk from early position. That's either genius or... well, let's go with "creative."`,
              `From ${posLabel}? With those cards? My ex-wife makes better decisions, and she once bet on a three-legged horse.`,
              `That's a bold open from early position. Bold. Not good. Bold.`,
            ]), 'action', 'norman')
          } else {
            tryStrategicNorman(
              () => normanBluffQuips.pick(), 'action',
              () => normanStrategicActionObs(name, 'bet', amount, gs.pot.value, hero().holeCards, gs.visibleCommunity.value),
            )
          }
        } else {
          const hand = community.length >= 3 ? handStr(pl, community) : null
          // Include position for notable preflop raises (premium from late position, etc.)
          const posNote = gs.street.value === 'preflop' && posLabel && chen >= 10 && lonWantsToAnalyze()
            ? ` from ${posLabel}` : ''
          addTV(`${name} ${raiseM ? 'raises to' : 'bets'} $${amount}${posNote}${hand && lonWantsToAnalyze() ? ` with ${hand}` : ''}.`, 'action', 'lon')
          if (normanFeelsLikeIt()) {
            const pq = Math.random() < 0.4 ? normanPersonaQuip(name) : null
            tryStrategicNorman(
              () => pq || normanRaiseQuips.pick(), 'action',
              () => normanStrategicActionObs(name, 'raise', amount, gs.pot.value, hero().holeCards, gs.visibleCommunity.value),
            )
          }
        }
      } else {
        addTV(`${name} makes it $${amount}.`, 'action', 'lon')
        // Mon occasionally adds a player read, pot analysis, or bot play observation
        if (lonWantsToAnalyze() && Math.random() < 0.3) {
          addTV(Math.random() < 0.35 ? lonBotPlayReads.pick() : lonPlayerReads.pick(), 'action', 'lon')
        }
        if (normanFeelsLikeIt()) {
          tryStrategicNorman(
            () => normanRaiseQuips.pick(), 'action',
            () => normanStrategicActionObs(name, 'raise', amount, gs.pot.value, hero().holeCards, gs.visibleCommunity.value),
          )
        }
      }
      return
    }

    // ── CALL ──
    if (callM) {
      const name = callM[1]
      const amount = parseInt(callM[2])
      const pl = findPl(name)

      addHero(pick([`${name} calls $${amount}.`, `Flat call from ${name} — $${amount}.`, `${name} puts in $${amount} to call.`]), 'action')

      if (pl?.holeCards) {
        const community = gs.visibleCommunity.value
        if (community.length >= 3) {
          const hands = activePl().filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.score[0] - a.result!.score[0])
          if (hands.length > 0 && hands[0].player.name === name) {
            addTV(`${name} just calls with the best hand.`, 'action', 'lon')
            normanSays(personalizeQuip(normanCallQuips.pick(), name), 'action')
            return
          }
          const draws = gs.street.value !== 'river' ? detectDraws(Array.from(pl.holeCards!), community) : []
          if (draws.length > 0) {
            addTV(lonWantsToAnalyze() ? `${name} calls $${amount}, chasing the ${draws[0].type.toLowerCase()}.` : `${name} calls $${amount}.`, 'action', 'lon')
            normanSays(personalizeQuip(normanCallQuips.pick(), name), 'action')
            return
          }
        }
        addTV(lonWantsToAnalyze() ? `${name} calls $${amount} with ${cardStr(pl.holeCards)}.` : `${name} calls $${amount}.`, 'action', 'lon')
        normanSays(personalizeQuip(normanCallQuips.pick(), name), 'action')
      } else {
        addTV(`${name} calls $${amount}.`, 'action', 'lon')
        normanSays(personalizeQuip(normanCallQuips.pick(), name), 'action')
      }
      return
    }

    // ── CHECK ──
    if (checkM) {
      const name = checkM[1]
      addHero(pick([`${name} checks.`, `Check from ${name}.`, `${name} taps the table.`]), 'action')
      addTV(`${name} checks.`, 'action', 'lon')
      // Randomly pick between action-specific quip (personalized) and random banter (not personalized)
      normanSays(Math.random() < 0.85 ? personalizeQuip(normanCheckQuips.pick(), name) : normanRandomBanter.pick(), 'action')
    }
  }

  // ─── STREET ─────────────────────────────────────────────

  function onStreet(streetName: string) {
    const community = gs.visibleCommunity.value
    const players = activePl()
    if (players.length < 2) return
    const h = hero()

    if (streetName === 'flop' && community.length >= 3) {
      const boardStr = community.slice(0, 3).map(displayCard).join(' ')

      // Hero stream — hand + board texture + equity + draws
      addHero(pick([`Flop: ${boardStr}.`, `The flop comes ${boardStr}.`]), 'street')
      if (h.holeCards && !h.folded) {
        const hand = bestHand(Array.from(h.holeCards), community)
        const draws = detectDraws(Array.from(h.holeCards), community)
        const handDesc = describeHand(h.holeCards, community)
        const numOpp = activePl().length - 1

        // What we made
        if (hand && hand.rank >= HAND_RANKS.TWO_PAIR) {
          addHero(`We flopped ${handDesc}. Strong hand.`, 'street')
        } else if (hand && hand.rank === HAND_RANKS.ONE_PAIR) {
          addHero(`${handDesc}.`, 'street')
        } else if (hand && hand.rank <= HAND_RANKS.HIGH_CARD) {
          addHero(`Missed the flop. ${handDesc}.`, 'street')
        }

        // Draws
        if (draws.length > 0) {
          const totalOuts = dedupOuts(draws)
          const drawNames = draws.map(d => d.type.toLowerCase()).join(' + ')
          addHero(`Draw: ${drawNames} (${totalOuts} outs).`, 'street')
        }

        // Board texture note
        const flopCards = community.slice(0, 3)
        const flopSuits = flopCards.map(c => c.suit)
        const flopRanks = flopCards.map(c => c.rank)
        const isMonoFlop = flopSuits[0] === flopSuits[1] && flopSuits[1] === flopSuits[2]
        const isTwoToneFlop = !isMonoFlop && (flopSuits[0] === flopSuits[1] || flopSuits[1] === flopSuits[2] || flopSuits[0] === flopSuits[2])
        const isPairedFlop = flopRanks[0] === flopRanks[1] || flopRanks[1] === flopRanks[2] || flopRanks[0] === flopRanks[2]
        const sortedFlop = [...flopRanks].sort((a, b) => a - b)
        const isConnectedFlop = sortedFlop[2] - sortedFlop[0] <= 4

        const textures: string[] = []
        if (isMonoFlop) textures.push('monotone — flush draws likely')
        else if (isTwoToneFlop) textures.push('two-tone')
        if (isPairedFlop) textures.push('paired board')
        if (isConnectedFlop && !isPairedFlop) textures.push('connected — straight draws possible')
        if (flopRanks.includes(14)) textures.push('ace-high')
        if (textures.length > 0) addHero(`Board texture: ${textures.join(', ')}.`, 'aside')

        // Quick equity
        if (numOpp >= 1) {
          const eq = Math.round(estimateEquity(h.holeCards, community, numOpp, 200) * 10) / 10
          addHero(`Equity vs ${numOpp} opponent${numOpp > 1 ? 's' : ''}: ~${eq}%.`, 'aside')
        }

        // Additional board observations
        if (isPairedFlop) {
          const pairRank = flopRanks.find((r, i) => flopRanks.indexOf(r) !== i)
          const heroHasTrips = h.holeCards.some(c => c.rank === pairRank)
          if (heroHasTrips) addHero(`We have trips with the paired board. Strong.`, 'aside')
          else addHero(`Paired board — full house draws in play. Be aware of trips.`, 'aside')
        }

        // High card board with low hero cards
        const heroMax = Math.max(h.holeCards[0].rank, h.holeCards[1].rank)
        const boardMax = Math.max(...flopRanks)
        if (boardMax >= 12 && heroMax <= 10 && hand && hand.rank <= HAND_RANKS.ONE_PAIR) {
          addHero(`High cards on the board and our cards are low. Proceed carefully.`, 'aside')
        }

        // Player count
        const playersLeft = activePl().length
        if (playersLeft >= 4) addHero(`${playersLeft} players saw this flop — multiway pot.`, 'aside')
      }

      // TV stream
      addTV(`Flop comes ${boardStr}.`, 'street', 'lon')
      // Mon's board analysis (alongside Chorman's board texture quip)
      let monSpokeOnFlop = false
      if (lonWantsToAnalyze()) {
        addTV(pickBoardAnalysis(community.slice(0, 3)), 'street', 'lon')
        // ~20% chance Mon follows up with a bot play observation on interesting boards
        if (Math.random() < 0.20) addTV(lonBotPlayReads.pick(), 'street', 'lon')
        monSpokeOnFlop = true
      }

      // Board texture quip from Norman
      const flopCards = community.slice(0, 3)
      const suits = flopCards.map(c => c.suit)
      const ranks = flopCards.map(c => c.rank)
      const isMonotone = suits[0] === suits[1] && suits[1] === suits[2]
      const isPaired = ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]
      const sortedRanks = [...ranks].sort((a, b) => a - b)
      const maxGap = Math.max(sortedRanks[1] - sortedRanks[0], sortedRanks[2] - sortedRanks[1])
      const isConnected = maxGap <= 2
      const isRainbow = suits[0] !== suits[1] && suits[1] !== suits[2] && suits[0] !== suits[2]
      const isDry = isRainbow && !isConnected && !isPaired

      if (isMonotone) {
        normanSays(pick(normanBoardQuips.allOneSuit), 'street')
      } else if (isPaired) {
        normanSays(pick(normanBoardQuips.paired), 'street')
      } else if (ranks.every(r => r >= 11)) {
        normanSays(pick(normanBoardQuips.allBroadway), 'street')
      } else if (ranks.every(r => r <= 9)) {
        normanSays(pick(normanBoardQuips.allLow), 'street')
      } else if (isConnected) {
        normanSays(pick(normanBoardQuips.connected), 'street')
      } else if (isDry) {
        normanSays(pick(normanBoardQuips.dry), 'street')
      } else if (ranks.includes(14)) {
        normanSays(pick(normanBoardQuips.ace), 'street')
      } else {
        normanSays(pick(normanBoardQuips.scary), 'street')
      }

      // Inter-voice banter: Mon reacts to Norman's joke, or Norman responds to Mon's analysis
      if (monSpokeOnFlop && Math.random() < 0.20) {
        // Norman responds to Mon's analysis with banter
        addTV(normanBanterAfterMon.pick(), 'aside', 'norman')
      } else if (!monSpokeOnFlop && normanFeelsLikeIt() && Math.random() < 0.15) {
        // Mon briefly reacts to Norman's joke, then pivots back to analysis
        addTV(lonReactsToNorman.pick(), 'aside', 'lon')
      }

      // Analyze all players
      const hits: string[] = []
      const misses: string[] = []
      for (const p of players) {
        if (!p.holeCards) continue
        const hand = bestHand(Array.from(p.holeCards), community)
        if (hand && hand.rank >= HAND_RANKS.TWO_PAIR) {
          hits.push(`${p.isHero ? 'Hero' : p.name} flopped ${HAND_RANK_NAMES[hand.rank]}`)
        } else if (hand && hand.rank <= HAND_RANKS.HIGH_CARD) {
          misses.push(p.isHero ? 'Hero' : p.name)
        }
      }
      if (hits.length > 0) {
        addTV(`${hits[0]}!`, 'street', 'lon')
        if (hits.length >= 2) {
          addTV(pick([`AND ${hits[1]}! This is going to be a bloodbath.`, `${hits[1]} too! Oh mama.`]), 'street', 'norman')
        } else {
          tryStrategicNorman(
            () => normanStreetHitQuips.pick(), 'street',
            () => normanStrategicFlopObs(hero().holeCards, community, gs.playerStates.value),
          )
        }
      }
      if (misses.length > 0 && hits.length > 0) {
        tryStrategicNorman(
          () => normanStreetMissQuips.pick(), 'street',
          () => normanStrategicFlopObs(hero().holeCards, community, gs.playerStates.value),
        )
      }

      // Foreshadowing
      if (gs.allCommunity.value.length >= 5 && Math.random() < 0.4) {
        for (const p of players) {
          if (!p.holeCards) continue
          const now = bestHand(Array.from(p.holeCards), community)
          const later = bestHand(Array.from(p.holeCards), gs.allCommunity.value)
          if (later && now && later.rank > now.rank && later.rank >= HAND_RANKS.STRAIGHT) {
            addTV(normanForeshadowQuips.pick(), 'aside', 'norman')
            break
          }
        }
      }
    }

    if (streetName === 'turn' && community.length >= 4) {
      const turnCard = displayCard(community[3])
      addHero(pick([`Turn: ${turnCard}.`, `The ${turnCard} on the turn.`]), 'street')
      if (h.holeCards && !h.folded) {
        const turnComm = community.slice(0, 4)
        const flopH = bestHand(Array.from(h.holeCards), community.slice(0, 3))
        const turnH = bestHand(Array.from(h.holeCards), turnComm)
        const turnDesc = describeHand(h.holeCards, turnComm)
        const turnDraws = detectDraws(Array.from(h.holeCards), turnComm)
        const numOpp = activePl().length - 1

        if (turnH && flopH && turnH.rank > flopH.rank) {
          addHero(`Improved to ${turnDesc}.`, 'street')
        } else {
          addHero(`${turnDesc}.`, 'street')
        }

        if (turnDraws.length > 0) {
          const totalOuts = dedupOuts(turnDraws)
          addHero(`${turnDraws.map(d => d.type.toLowerCase()).join(' + ')} — ${totalOuts} outs to improve.`, 'aside')
        }

        if (numOpp >= 1) {
          const eq = Math.round(estimateEquity(h.holeCards, turnComm, numOpp, 200) * 10) / 10
          addHero(`Equity vs ${numOpp}: ~${eq}%.`, 'aside')
        }

        // Situational board notes
        const turnC = community[3]
        const flopRanks = community.slice(0, 3).map(c => c.rank)
        const flopMaxRank = Math.max(...flopRanks)
        // Ace appearing on a low board
        if (turnC.rank === 14 && flopMaxRank <= 10) {
          addHero(`Ace on the turn changes everything. Anyone with an ace just took the lead.`, 'aside')
        }
        // Flush completing
        const turnSuits = turnComm.map(c => c.suit)
        const suitCounts = new Map<string, number>()
        for (const s of turnSuits) suitCounts.set(s, (suitCounts.get(s) || 0) + 1)
        if ([...suitCounts.values()].some(c => c >= 3)) {
          const heroSuited = h.holeCards[0].suit === h.holeCards[1].suit
          const flushSuit = [...suitCounts.entries()].find(e => e[1] >= 3)?.[0]
          const heroHasFlushCard = h.holeCards.some(c => c.suit === flushSuit)
          if (heroHasFlushCard) addHero(`Three ${flushSuit} on the board — we have one. Flush draw possible.`, 'aside')
          else addHero(`Three of one suit on board. Watch for a flush — we don't have one.`, 'aside')
        }
        // Board pairing
        const allRanks = turnComm.map(c => c.rank)
        const rankCounts = new Map<number, number>()
        for (const r of allRanks) rankCounts.set(r, (rankCounts.get(r) || 0) + 1)
        if ([...rankCounts.values()].some(c => c >= 2) && !flopRanks.some((r, i) => flopRanks.indexOf(r) !== i)) {
          addHero(`Board paired on the turn. Full house draws are now possible.`, 'aside')
        }

        // Player count
        const playersLeft = activePl().length
        if (playersLeft >= 3) addHero(`${playersLeft} players still in the hand.`, 'aside')
      }

      addTV(`Turn: ${turnCard}.`, 'street', 'lon')
      let monSpokeOnTurn = false
      if (lonWantsToAnalyze() && Math.random() < 0.4) {
        addTV(Math.random() < 0.25 ? lonBotPlayReads.pick() : lonStreetTransition.pick(), 'street', 'lon')
        monSpokeOnTurn = true
      }
      // Turn board texture quip
      {
        const turnC = community[3]
        const flopSuits = community.slice(0, 3).map(c => c.suit)
        const flushPossible = flopSuits.filter(s => s === turnC.suit).length >= 2
        if (flushPossible) normanSays(pick(normanBoardQuips.turnScare), 'street')
        else normanSays(pick(normanBoardQuips.turnBrick), 'street')
        // Mon reacts to Norman's turn quip, then pivots to analysis
        if (!monSpokeOnTurn && Math.random() < 0.12) addTV(lonReactsToNorman.pick(), 'aside', 'lon')
      }
      if (monSpokeOnTurn && Math.random() < 0.18) {
        // Norman responds to Mon's turn analysis with banter
        normanSays(normanBanterAfterMon.pick(), 'aside')
      }
      for (const p of players) {
        if (!p.holeCards) continue
        const flopH = bestHand(Array.from(p.holeCards), community.slice(0, 3))
        const turnH = bestHand(Array.from(p.holeCards), community.slice(0, 4))
        if (turnH && flopH && turnH.rank > flopH.rank && turnH.rank >= HAND_RANKS.STRAIGHT) {
          addTV(`${p.isHero ? 'Hero' : p.name} just made ${HAND_RANK_NAMES[turnH.rank]}.`, 'street', 'lon')
          addTV(normanStreetHitQuips.pick(), 'street', 'norman')
          break
        }
      }

      if (gs.allCommunity.value.length >= 5 && Math.random() < 0.35) {
        for (const p of players) {
          if (!p.holeCards) continue
          const turnH = bestHand(Array.from(p.holeCards), community.slice(0, 4))
          const fullH = bestHand(Array.from(p.holeCards), gs.allCommunity.value)
          if (fullH && turnH && fullH.rank > turnH.rank && fullH.rank >= HAND_RANKS.TWO_PAIR) {
            addTV(normanForeshadowQuips.pick(), 'aside', 'norman')
            break
          }
        }
      }
    }

    if (streetName === 'river' && community.length >= 5) {
      const riverCard = displayCard(community[4])
      addHero(pick([`River: ${riverCard}.`, `The ${riverCard} on the river. Final card.`]), 'street')
      if (h.holeCards && !h.folded) {
        const turnH = bestHand(Array.from(h.holeCards), community.slice(0, 4))
        const riverH = bestHand(Array.from(h.holeCards), community)
        const riverDesc = describeHand(h.holeCards, community)
        const numOpp = activePl().length - 1

        if (riverH && turnH && riverH.rank > turnH.rank) {
          addHero(`River improves us! ${riverDesc}.`, 'street')
        } else {
          addHero(`Final hand: ${riverDesc}.`, 'street')
        }

        if (numOpp >= 1) {
          const eq = Math.round(estimateEquity(h.holeCards, community, numOpp, 200) * 10) / 10
          addHero(`Final equity: ~${eq}%.`, 'aside')
        }

        // Situational river notes
        const rvCard = community[4]
        const turnMaxRank = Math.max(...community.slice(0, 4).map(c => c.rank))
        if (rvCard.rank === 14 && turnMaxRank <= 10) {
          addHero(`Ace on the river. If you don't have one, be cautious — someone else might.`, 'aside')
        }
        // Flush completing on river
        const rvSuitCount = community.filter(c => c.suit === rvCard.suit).length
        if (rvSuitCount >= 3) {
          const heroHasIt = h.holeCards.some(c => c.suit === rvCard.suit)
          if (heroHasIt && riverH && riverH.rank === HAND_RANKS.FLUSH) addHero(`We made the flush.`, 'aside')
          else if (!heroHasIt) addHero(`Possible flush on the board. We don't have it.`, 'aside')
        }
        // Straight possible (4 to a straight on board)
        const boardRanks = [...new Set(community.map(c => c.rank))].sort((a, b) => a - b)
        let maxRun = 1, run = 1
        for (let i = 1; i < boardRanks.length; i++) {
          if (boardRanks[i] - boardRanks[i - 1] <= 2) { run++; maxRun = Math.max(maxRun, run) }
          else run = 1
        }
        if (maxRun >= 4 && riverH && riverH.rank !== HAND_RANKS.STRAIGHT) {
          addHero(`Board is very connected — straights are possible. We don't have one.`, 'aside')
        }

        const playersLeft = activePl().length
        if (playersLeft >= 3) addHero(`${playersLeft} players to the river. Pot is $${gs.pot.value}.`, 'aside')
      }

      addTV(`River: ${riverCard}.`, 'street', 'lon')
      // River board quip — check if a draw completed
      const riverC = community[4]
      const riverSuit = riverC.suit
      const flushComplete = community.filter(c => c.suit === riverSuit).length >= 3
      if (flushComplete) {
        addTV(pick(normanBoardQuips.riverComplete), 'street', 'norman')
      } else if (normanFeelsLikeIt()) {
        // Random choice: river quip, brick quip, or random banter
        const r = Math.random()
        if (r < 0.4) addTV(normanRiverQuips.pick(), 'street', 'norman')
        else if (r < 0.7) addTV(pick(normanBoardQuips.riverBrick), 'street', 'norman')
        else addTV(normanRandomBanter.pick(), 'aside', 'norman')
      }
      const hands = players.filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.score[0] - a.result!.score[0])
      if (hands.length >= 2) {
        const best = hands[0]
        const second = hands[1]
        if (best.result!.rank >= HAND_RANKS.STRAIGHT) {
          addTV(`${best.player.isHero ? 'Hero' : best.player.name} has ${HAND_RANK_NAMES[best.result!.rank]}.`, 'street', 'lon')
          addTV(normanStreetHitQuips.pick(), 'street', 'norman')
        }
        if (best.result!.rank === second.result!.rank && best.result!.score[0] === second.result!.score[0]) {
          addTV(normanGenericQuips.pick(), 'street', 'norman')
        }
      }
    }
  }

  // ─── SHOWDOWN ───────────────────────────────────────────

  function onShowdown() {
    const winner = gs.handWinnerName.value
    const amount = gs.heroWinAmount.value
    const heroWon = gs.heroWonHand.value
    const h = hero()
    if (!winner) return

    // Track real pot winners for grounded heater commentary (skip split pots)
    if (!winner.startsWith('Split:')) {
      recentWinnerNames.push(winner)
      if (recentWinnerNames.length > 10) recentWinnerNames.shift()
    }

    if (heroWon) {
      addHero(pick([`We take it down! $${amount} pot.`, `$${amount} coming our way. Nice hand.`, `We win $${amount}. Good result.`]), 'showdown')
      addTV(`Hero wins $${amount}!`, 'showdown', 'lon')
      const monAnalyzedShowdown = lonWantsToAnalyze()
      if (monAnalyzedShowdown) addTV(lonShowdownAnalysis.pick(), 'showdown', 'lon')
      if (monAnalyzedShowdown && Math.random() < 0.25) {
        addTV(normanBanterAfterMon.pick(), 'showdown', 'norman')
      } else tryStrategicNorman(
        () => normanShowdownWinQuips.pick(), 'showdown',
        () => normanStrategicShowdownObs(true, gs.pot.value, hero().holeCards, gs.visibleCommunity.value),
      )
    } else if (h.folded) {
      addHero(pick([`${winner} takes it. We were already out.`, `Pot goes to ${winner}. Good thing we folded.`]), 'showdown')
      addTV(`${winner} takes the pot.`, 'showdown', 'lon')
      // Chorman comments on the winner, not on folding (hero already folded earlier)
      const winnerQuip = normanPersonaQuip(winner)
      if (winnerQuip) {
        normanSays(winnerQuip, 'showdown')
      } else {
        normanSays(personalizeQuip(pick([
          `Takes it down without a fight. Nice.`,
          `Scoops the pot. Everyone else decided they had better things to do.`,
          `Collects the chips. Easiest money at the table.`,
          `Wins it. Sometimes you don't need a showdown.`,
          `Takes it. The best hand is the one that doesn't get called.`,
        ]), winner), 'showdown')
      }
    } else {
      addHero(pick([`${winner} takes it. We come up short.`, `Pot goes to ${winner}. That one hurts.`, `${winner} wins. Tough break.`]), 'showdown')
      addTV(`${winner} takes the pot from Hero.`, 'showdown', 'lon')
      tryStrategicNorman(
        () => normanShowdownLoseQuips.pick(), 'showdown',
        () => normanStrategicShowdownObs(false, gs.pot.value, hero().holeCards, gs.visibleCommunity.value),
      )
    }

    // TV: cooler detection
    const ap = activePl()
    const community = gs.visibleCommunity.value
    if (community.length >= 5 && ap.length >= 2) {
      const hands = ap.filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.score[0] - a.result!.score[0])
      if (hands.length >= 2 && hands[0].result!.rank >= HAND_RANKS.FLUSH && hands[1].result!.rank >= HAND_RANKS.STRAIGHT) {
        addTV(`${HAND_RANK_NAMES[hands[0].result!.rank]} over ${HAND_RANK_NAMES[hands[1].result!.rank]}.`, 'showdown', 'lon')
        addTV(normanCoolerQuips.pick(), 'showdown', 'norman')
      }
    }
  }

  // ─── HERO CRITIQUE ──────────────────────────────────────

  function onHeroTurn() {
    const h = hero()
    if (!h.holeCards) return
    const community = gs.visibleCommunity.value
    const chen = chenScore(h.holeCards)

    if (community.length >= 3) {
      const hand = bestHand(Array.from(h.holeCards), community)
      // No draws on the river — all cards are dealt, no more outs
      const isRiver = gs.street.value === 'river'
      const draws = isRiver ? [] : detectDraws(Array.from(h.holeCards), community)
      if (hand && hand.rank >= HAND_RANKS.FLUSH) {
        addHero(pick([`We have ${HAND_RANK_NAMES[hand.rank]}. Bet for value.`, `${HAND_RANK_NAMES[hand.rank]}. Time to build the pot.`]), 'aside')
        addTV(`Hero has ${HAND_RANK_NAMES[hand.rank]}. Decision time.`, 'aside', 'lon')
        addTV(pick([`If Hero doesn't bet here, I'm turning off my TV.`, `Big hand, big decision. Don't mess this up, Hero.`, `You HAVE to bet that. Even I would bet that, and I'm terrible.`]), 'aside', 'norman')
      } else if (hand && hand.rank <= HAND_RANKS.HIGH_CARD && draws.length === 0) {
        addHero(pick([`Nothing here. Careful.`, `We missed. Fold-or-bluff territory.`]), 'aside')
        addTV(`Hero has nothing.`, 'aside', 'lon')
        addTV(pick([`Hero's got air. Do they have the guts to bluff?`, `Nothing for Hero. Fold or pretend. Story of my life.`, `Hero has nothing. Join the club. I've been president of that club for years.`]), 'aside', 'norman')
      } else if (draws.length > 0 && draws[0].outs >= 8) {
        addHero(pick([`Big draw — ${draws[0].outs} outs. The math might justify chasing.`, `${draws[0].type}. Interesting spot.`]), 'aside')
        addTV(`Hero has ${draws[0].outs} outs to the ${draws[0].type.toLowerCase()}.`, 'aside', 'lon')
        addTV(normanDrawQuips.pick(), 'aside', 'norman')
      }
    } else if (gs.street.value === 'preflop' && chen >= 12) {
      addHero(pick([`Premium hand. Let's raise.`, `Strong preflop. Time to build a pot.`]), 'aside')
      addTV(`Hero with a premium hand preflop.`, 'aside', 'lon')
      addTV(pick([`This is the spot Hero's been waiting for. Don't blow it.`, `Premium hand. Now the question is: how much to charge admission.`]), 'aside', 'norman')
    }
  }

  // ─── Watchers ───────────────────────────────────────────

  // Detect new hand: the handActionLog ref is reassigned to a new array each deal
  let prevLogRef: string[] | null = null
  watch(() => gs.handActionLog.value, (newLog) => {
    if (newLog === prevLogRef) return // same array, just mutated
    prevLogRef = newLog
    if (!gs.dealt.value) return
    clear()
    onDeal()
  })

  watch(() => gs.street.value, (s, old) => {
    if (s === old) return
    if (s === 'flop' || s === 'turn' || s === 'river') onStreet(s)
    if (s === 'showdown') nextTick(() => onShowdown())
  })

  let lastLogLen = 0
  watch(() => gs.handActionLog.value, () => { lastLogLen = 0 })
  watch(() => gs.handActionLog.value.length, (n) => {
    if (n <= lastLogLen) { lastLogLen = n; return }
    gs.handActionLog.value.slice(lastLogLen).forEach(e => onAction(e))
    lastLogLen = n
  })

  watch(() => gs.heroTurn.value, (t) => {
    if (!t) return
    if (gs.street.value === 'preflop' && gs.handActionLog.value.length < 3) return
    onHeroTurn()
  })

  return { lines: readonly(lines), enabled, mode, normanSilence, normanSerious, lonAnalysis, clear }
}
