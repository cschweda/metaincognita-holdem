<script setup lang="ts">
/**
 * Hand Analysis Modal — street-by-street breakdown of a completed hand.
 * Explains each action in context of player personas, board texture,
 * pot odds, and hand strength. Designed for players learning NLH who
 * want to understand WHY decisions were made.
 */
import config from '@config'
import { chenScore, chenPlusScore, bestHand, detectDraws, HAND_RANK_NAMES } from '~/utils/handAnalysis'
import type { Card, Suit } from '~/utils/cards'

interface PlayerInfo {
  name: string
  position: string
  holeCards: string
  folded: boolean
  isHero: boolean
}

interface HandData {
  hand_number: number
  hole_cards: string
  board: string | null
  result: string
  profit: number
  position: string
  pot_size: number
  actions: string[] | null
  players: PlayerInfo[] | null
  winnerName?: string
}

const props = defineProps<{
  hand: HandData
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

function handleClose() {
  emit('update:open', false)
  emit('close')
}

// ─── Parse cards from string ─────────────────────────────────
function parseCards(str: string): Card[] {
  if (!str || str === '?' || str === '---') return []
  const SUIT_MAP: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' }
  const RANK_MAP: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 }
  const cards: Card[] = []
  const tokens = str.trim().split(/\s+/)
  for (const t of tokens) {
    if (t.length < 2) continue
    const rankStr = t.slice(0, -1)
    const suitStr = t.slice(-1)
    const rank = RANK_MAP[rankStr]
    const suit = SUIT_MAP[suitStr]
    if (rank && suit) cards.push({ rank, suit })
  }
  return cards
}

// ─── Persona lookup ──────────────────────────────────────────
const FICTIONAL = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']

function getPersona(name: string) {
  return config.personas.find(p => p.name === name)
}

function playerType(name: string): string {
  const p = getPersona(name)
  if (!p) return 'Unknown'
  const isPro = !FICTIONAL.includes(name)
  if (p.vpip < 0.18) return isPro ? 'Tight pro' : 'Nit'
  if (p.vpip < 0.24 && p.aggression >= 1.1) return isPro ? 'TAG pro' : 'Tight-aggressive'
  if (p.vpip >= 0.30 && p.aggression >= 1.3) return isPro ? 'LAG pro' : 'Loose-aggressive'
  if (p.vpip >= 0.30 && p.aggression < 0.8) return isPro ? 'Loose pro' : 'Calling station'
  if (p.vpip >= 0.28) return isPro ? 'Loose pro' : 'Loose'
  return isPro ? 'Balanced pro' : 'Balanced'
}

function playerStyleNote(name: string): string {
  const p = getPersona(name)
  if (!p) return ''
  const isPro = !FICTIONAL.includes(name)
  const notes: string[] = []

  if (p.vpip >= 0.30) notes.push(`plays wide (VPIP ${(p.vpip * 100).toFixed(0)}%)`)
  else if (p.vpip < 0.20) notes.push(`plays tight (VPIP ${(p.vpip * 100).toFixed(0)}%)`)

  if (p.aggression >= 1.3) notes.push('very aggressive postflop')
  else if (p.aggression < 0.8) notes.push('passive — prefers calling to raising')

  if (p.bluffFreq >= 0.20) notes.push('frequent bluffer')
  else if (p.bluffFreq < 0.10) notes.push('rarely bluffs')

  if (p.tiltMultiplier && p.tiltMultiplier >= 2.0) notes.push('extremely tilt-prone')
  else if (p.tiltMultiplier && p.tiltMultiplier <= 0.4) notes.push('almost untiltable')

  if ((p as any).donkBetFreq > 0.15) notes.push('frequently donk-bets')

  if (isPro && p.threeBetFreq && p.threeBetFreq >= 0.16) notes.push('3-bets aggressively')

  if (p.leak) notes.push(p.leak)

  return notes.join('. ') + (notes.length ? '.' : '')
}

// ─── Board texture description ───────────────────────────────
function describeBoard(boardCards: Card[]): string {
  if (boardCards.length < 3) return ''
  const ranks = boardCards.map(c => c.rank).sort((a, b) => b - a)
  const parts: string[] = []

  // High card
  const highNames: Record<number, string> = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten' }
  parts.push(`${highNames[ranks[0]] || ranks[0]}-high board`)

  // Suited
  const suitCounts = new Map<string, number>()
  for (const c of boardCards) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1)
  const maxSuit = Math.max(...suitCounts.values())
  if (maxSuit >= 3) parts.push('monotone (flush possible)')
  else if (maxSuit === 2 && boardCards.length >= 3) parts.push('two-tone (flush draw possible)')
  else parts.push('rainbow')

  // Paired
  const rankCounts = new Map<number, number>()
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1)
  if ([...rankCounts.values()].some(c => c >= 2)) parts.push('paired')

  // Connectedness
  const unique = [...new Set(ranks)].sort((a, b) => a - b)
  let connected = 0
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] - unique[i - 1] <= 2) connected++
  }
  if (connected >= 2) parts.push('connected (straight draws likely)')
  else if (connected === 0) parts.push('dry (few draws)')

  return parts.join(', ')
}

// ─── Hand strength description ───────────────────────────────
function describeHandStrength(holeCards: Card[], community: Card[]): string {
  if (community.length < 3) return ''
  const result = bestHand(holeCards, community)
  if (!result) return 'No made hand'
  return HAND_RANK_NAMES[result.rank] || 'Unknown'
}

function describeDraws(holeCards: Card[], community: Card[]): string {
  if (community.length < 3) return ''
  const draws = detectDraws(holeCards, community)
  if (draws.length === 0) return 'No draws'
  return draws.map(d => `${d.type} (${d.outs} outs)`).join(', ')
}

// ─── Parse action log into streets ───────────────────────────

interface StreetAnalysis {
  name: string
  board: string
  boardCards: Card[]
  actions: { player: string; action: string; amount?: number; raw: string }[]
  potAtStart: number
  potAtEnd: number
}

const streets = computed<StreetAnalysis[]>(() => {
  const acts = props.hand.actions
  if (!acts || acts.length === 0) return []

  const result: StreetAnalysis[] = []
  let current: StreetAnalysis | null = null
  let runningPot = 0

  for (const line of acts) {
    // Street markers
    if (line.includes('--- PREFLOP') || line.includes('--- DEAL')) {
      if (current) { current.potAtEnd = runningPot; result.push(current) }
      current = { name: 'Preflop', board: '', boardCards: [], actions: [], potAtStart: runningPot, potAtEnd: 0 }
      continue
    }
    if (line.includes('--- FLOP')) {
      if (current) { current.potAtEnd = runningPot; result.push(current) }
      const match = line.match(/FLOP:?\s*(.+?)\s*---/)
      const boardStr = match ? match[1].trim() : ''
      current = { name: 'Flop', board: boardStr, boardCards: parseCards(boardStr), actions: [], potAtStart: runningPot, potAtEnd: 0 }
      continue
    }
    if (line.includes('--- TURN')) {
      if (current) { current.potAtEnd = runningPot; result.push(current) }
      const match = line.match(/TURN:?\s*(.+?)\s*---/)
      const boardStr = match ? match[1].trim() : ''
      current = { name: 'Turn', board: boardStr, boardCards: parseCards(boardStr), actions: [], potAtStart: runningPot, potAtEnd: 0 }
      continue
    }
    if (line.includes('--- RIVER')) {
      if (current) { current.potAtEnd = runningPot; result.push(current) }
      const match = line.match(/RIVER:?\s*(.+?)\s*---/)
      const boardStr = match ? match[1].trim() : ''
      current = { name: 'River', board: boardStr, boardCards: parseCards(boardStr), actions: [], potAtStart: runningPot, potAtEnd: 0 }
      continue
    }

    if (!current) continue
    if (line.startsWith('---') || line.startsWith('  ')) continue // skip deal lines

    // Parse player actions
    const foldMatch = line.match(/^(.+?) folds$/)
    const checkMatch = line.match(/^(.+?) checks$/)
    const callMatch = line.match(/^(.+?) calls \$(\d+)$/)
    const raiseMatch = line.match(/^(.+?) raises to \$(\d+)$/)
    const allInMatch = line.match(/^(.+?) goes ALL-IN \$(\d+)$/)
    const sbMatch = line.match(/^(.+?): posts small blind \$(\d+)$/)
    const bbMatch = line.match(/^(.+?): posts big blind \$(\d+)$/)

    if (foldMatch) {
      current.actions.push({ player: foldMatch[1], action: 'fold', raw: line })
    } else if (checkMatch) {
      current.actions.push({ player: checkMatch[1], action: 'check', raw: line })
    } else if (callMatch) {
      const amt = parseInt(callMatch[2])
      runningPot += amt
      current.actions.push({ player: callMatch[1], action: 'call', amount: amt, raw: line })
    } else if (raiseMatch) {
      const amt = parseInt(raiseMatch[2])
      runningPot += amt
      current.actions.push({ player: raiseMatch[1], action: 'raise', amount: amt, raw: line })
    } else if (allInMatch) {
      const amt = parseInt(allInMatch[2])
      runningPot += amt
      current.actions.push({ player: allInMatch[1], action: 'all-in', amount: amt, raw: line })
    } else if (sbMatch) {
      runningPot += parseInt(sbMatch[2])
    } else if (bbMatch) {
      runningPot += parseInt(bbMatch[2])
    }
  }

  if (current) { current.potAtEnd = runningPot; result.push(current) }
  return result
})

// ─── Generate explanation for each action ────────────────────

function explainAction(
  act: { player: string; action: string; amount?: number },
  street: StreetAnalysis,
  streetIndex: number,
  actionIndex: number,
): string {
  const persona = getPersona(act.player)
  const player = props.hand.players?.find(p => p.name === act.player)
  const isHero = player?.isHero ?? false
  const holeCards = player ? parseCards(player.holeCards) : []
  const community = street.boardCards
  const pType = playerType(act.player)
  const isPro = persona ? !FICTIONAL.includes(act.player) : false

  // Preflop chen+ info
  if (street.name === 'Preflop' && holeCards.length === 2) {
    const chen = chenScore(holeCards as [Card, Card])
    const pos = player?.position ?? ''
    const chenP = chenPlusScore(holeCards as [Card, Card], pos)

    if (act.action === 'fold') {
      if (chen <= 4) return `${isHero ? 'You' : act.player} folded a weak hand (Chen ${chen}). ${persona ? `As a ${pType} (VPIP ${(persona.vpip * 100).toFixed(0)}%), this hand doesn't meet their opening threshold.` : ''}`
      if (chen >= 8) return `${isHero ? 'You' : act.player} folded a decent hand (Chen ${chen}). ${persona ? `Likely facing a raise — as a ${pType}, they're selective about which hands to defend with.` : 'Probably facing too much action.'}`
      return `${isHero ? 'You' : act.player} folded (Chen ${chen}). ${pos === 'UTG' || pos === 'UTG+1' ? 'Early position requires stronger hands to enter.' : 'Hand didn\'t meet their threshold for this spot.'}`
    }

    if (act.action === 'call') {
      const explanation = chen >= 10
        ? `Strong hand (Chen ${chen}) — flat-calling rather than raising, possibly to trap or because they're out of position.`
        : chen >= 7
          ? `Playable hand (Chen ${chen}, Chen+ ${chenP} from ${pos}). ${persona && persona.vpip >= 0.28 ? `As a loose player, ${act.player} calls with a wider range than most.` : 'Standard call in this position.'}`
          : `Marginal hand (Chen ${chen}). ${persona && persona.vpip >= 0.30 ? `${act.player} plays wide — they'll see flops with speculative hands hoping to connect.` : 'Speculative call, looking to hit the flop.'}`
      return `${isHero ? 'You' : act.player} called. ${explanation}`
    }

    if (act.action === 'raise' || act.action === 'all-in') {
      const sizing = act.amount ? `$${act.amount}` : ''
      if (chen >= 12) return `${isHero ? 'You' : act.player} raised ${sizing} with a premium hand (Chen ${chen}). Standard value raise — building the pot with a top-tier holding.`
      if (chen >= 8) return `${isHero ? 'You' : act.player} raised ${sizing} (Chen ${chen}, Chen+ ${chenP}). ${persona && persona.aggression >= 1.3 ? `As an aggressive ${pType}, they raise a wide range for value and as bluffs to put pressure on opponents.` : 'Solid raise with a strong starting hand.'}`
      if (persona && persona.bluffFreq >= 0.18) return `${isHero ? 'You' : act.player} raised ${sizing} with a weaker hand (Chen ${chen}). ${isPro ? `As a ${pType}, ${act.player} frequently raises with air to put opponents in tough spots. This is a "light" raise — they don't need a premium to apply pressure.` : `${act.player} is aggressive (bluff freq ${(persona.bluffFreq * 100).toFixed(0)}%) and raises wide to steal pots preflop.`}`
      return `${isHero ? 'You' : act.player} raised ${sizing} (Chen ${chen}). ${persona ? `With PFR ${(persona.pfr * 100).toFixed(0)}%, this is ${chen >= 6 ? 'within their raising range' : 'a light open — pushing fold equity'}.` : ''}`
    }

    if (act.action === 'check') {
      return `${isHero ? 'You' : act.player} checked (Chen ${chen}). ${pos === 'BB' ? 'Big blind option — no raise needed to continue.' : 'No additional investment required.'}`
    }
  }

  // Postflop
  if (community.length >= 3 && holeCards.length === 2) {
    const handName = describeHandStrength(holeCards as [Card, Card], community)
    const drawInfo = describeDraws(holeCards as [Card, Card], community)

    if (act.action === 'check') {
      if (handName.includes('Pair') || handName.includes('Two')) {
        return `${isHero ? 'You' : act.player} checked with ${handName.toLowerCase()}. ${persona && persona.aggression < 1.0 ? `As a passive player, ${act.player} prefers to check-call rather than lead out.` : isPro ? 'Checking to the raiser — pros rarely donk-bet, preferring to let the preflop aggressor continue.' : 'Pot control — protecting a medium-strength hand by keeping the pot small.'}`
      }
      if (handName === 'High Card') {
        const hasDraws = drawInfo !== 'No draws'
        if (hasDraws) return `${isHero ? 'You' : act.player} checked with ${drawInfo.toLowerCase()}. Waiting for a free card or planning to call a bet with draw equity.`
        return `${isHero ? 'You' : act.player} checked with nothing (${handName.toLowerCase()}). ${persona && persona.bluffFreq < 0.12 ? 'Not aggressive enough to bluff here — giving up on the hand.' : 'No hand and no draw — checking is the default with air unless you have a good bluffing spot.'}`
      }
      if (handName.includes('Straight') || handName.includes('Flush') || handName.includes('Full') || handName.includes('Four')) {
        return `${isHero ? 'You' : act.player} checked with a monster (${handName.toLowerCase()})! ${persona && persona.creativeFreq && persona.creativeFreq >= 0.07 ? `Trapping — ${act.player} likes to slow-play big hands to extract maximum value on later streets.` : 'Slow-playing to let opponents catch up or bluff into the big hand.'}`
      }
      return `${isHero ? 'You' : act.player} checked (${handName.toLowerCase()}).`
    }

    if (act.action === 'fold') {
      return `${isHero ? 'You' : act.player} folded ${handName.toLowerCase()}. ${street.name === 'River' ? 'Facing a bet on the river with a weak hand — folding is usually correct unless you have a strong read.' : `The bet was too large relative to hand strength.`} ${drawInfo !== 'No draws' ? `Had ${drawInfo.toLowerCase()} but the price wasn't right.` : ''}`
    }

    if (act.action === 'call') {
      if (handName.includes('Pair') || handName.includes('Two') || handName.includes('Three')) {
        return `${isHero ? 'You' : act.player} called with ${handName.toLowerCase()}. ${persona && persona.aggression < 0.9 ? `Classic ${pType} line — prefers to call down rather than raise.` : 'Continuing with a made hand — raising would narrow the range too much.'}`
      }
      if (drawInfo !== 'No draws') {
        return `${isHero ? 'You' : act.player} called with ${drawInfo.toLowerCase()}. ${street.name !== 'River' ? 'Calling to see the next card — hoping to complete the draw.' : 'Calling on the river, possibly with a missed draw that still beats some bluffs.'}`
      }
      return `${isHero ? 'You' : act.player} called (${handName.toLowerCase()}).`
    }

    if (act.action === 'raise' || act.action === 'all-in') {
      const sizing = act.amount ? `$${act.amount}` : ''
      if (handName.includes('Straight') || handName.includes('Flush') || handName.includes('Full') || handName.includes('Four')) {
        return `${isHero ? 'You' : act.player} raised ${sizing} for value with ${handName.toLowerCase()}! ${persona && persona.aggression >= 1.3 ? `${act.player} bets big with big hands — building the pot to extract maximum value.` : 'Strong value raise — getting money in with the best hand.'}`
      }
      if (handName === 'High Card' || handName === 'No made hand') {
        const boardDesc = describeBoard(community)
        return `${isHero ? 'You' : act.player} raised ${sizing} as a bluff! ${persona && persona.bluffFreq >= 0.16 ? `${isPro ? `Pro move — ${act.player} (bluff freq ${(persona.bluffFreq * 100).toFixed(0)}%) represents a strong hand on this ${boardDesc.split(',')[0]}. Opponents without a strong hand will often fold to this pressure.` : `${act.player} bluffs frequently (${(persona.bluffFreq * 100).toFixed(0)}%) — putting opponents to the test with air.`}` : `Bold bluff on a ${boardDesc.split(',')[0]}. Representing a hand they don't have.`}`
      }
      if (drawInfo !== 'No draws') {
        return `${isHero ? 'You' : act.player} raised ${sizing} as a semi-bluff with ${drawInfo.toLowerCase()}. ${isPro ? 'Pros love semi-bluffs — they can win by making opponents fold OR by completing the draw. Two ways to win.' : 'Raising with a draw to put pressure on opponents. If called, they still have outs to improve.'}`
      }
      return `${isHero ? 'You' : act.player} raised ${sizing} (${handName.toLowerCase()}). ${persona && persona.aggression >= 1.3 ? 'Aggressive player — builds pots with any edge.' : 'Value bet to grow the pot.'}`
    }
  }

  // Generic fallback
  if (act.action === 'fold') return `${isHero ? 'You' : act.player} folded.`
  if (act.action === 'check') return `${isHero ? 'You' : act.player} checked.`
  if (act.action === 'call') return `${isHero ? 'You' : act.player} called${act.amount ? ` $${act.amount}` : ''}.`
  if (act.action === 'raise') return `${isHero ? 'You' : act.player} raised${act.amount ? ` to $${act.amount}` : ''}.`
  if (act.action === 'all-in') return `${isHero ? 'You' : act.player} went all-in${act.amount ? ` $${act.amount}` : ''}!`
  return act.raw
}

// ─── Showdown summary ────────────────────────────────────────
const showdownSummary = computed(() => {
  if (!props.hand.players) return ''
  const winner = props.hand.players.find(p => p.name === props.hand.winnerName)
  const nonFolded = props.hand.players.filter(p => !p.folded)

  if (nonFolded.length <= 1) {
    // Everyone folded
    return winner ? `${winner.isHero ? 'You' : winner.name} won $${props.hand.pot_size} uncontested — all opponents folded.` : ''
  }

  // Showdown
  const board = parseCards(props.hand.board ?? '')
  if (!winner || board.length < 5) return ''

  const winnerCards = parseCards(winner.holeCards)
  if (winnerCards.length < 2) return ''

  const winnerHand = bestHand(winnerCards as [Card, Card], board)
  const winnerHandName = winnerHand ? HAND_RANK_NAMES[winnerHand.rank] : 'Unknown'

  const loserDescs = nonFolded
    .filter(p => p.name !== winner.name)
    .map(p => {
      const cards = parseCards(p.holeCards)
      if (cards.length < 2) return `${p.name} (unknown)`
      const hand = bestHand(cards as [Card, Card], board)
      return `${p.isHero ? 'You' : p.name} had ${hand ? HAND_RANK_NAMES[hand.rank].toLowerCase() : 'unknown'} (${p.holeCards})`
    })

  return `${winner.isHero ? 'You' : winner.name} won $${props.hand.pot_size} at showdown with ${winnerHandName.toLowerCase()} (${winner.holeCards}). ${loserDescs.join('; ')}.`
})

// ─── Key takeaway ────────────────────────────────────────────
const keyTakeaway = computed(() => {
  const h = props.hand
  if (!h.players) return ''
  const hero = h.players.find(p => p.isHero)
  if (!hero) return ''

  if (h.result === 'folded') {
    const heroCards = parseCards(hero.holeCards)
    if (heroCards.length === 2) {
      const chen = chenScore(heroCards as [Card, Card])
      if (chen >= 8) return `You folded a playable hand (Chen ${chen}). Sometimes folding strong hands is correct when facing heavy action — it depends on position, stack depth, and opponent tendencies.`
      return `You folded a weak hand (Chen ${chen}). Good discipline — playing too many weak hands is the most common leak in poker.`
    }
    return 'You folded preflop.'
  }

  if (h.result === 'won') {
    if (h.profit > h.pot_size * 0.5) return `Nice pot! You won $${h.profit}. Look for spots like this where you can build the pot with strong hands.`
    return `You won a small pot ($${h.profit}). Small pots are the bread and butter of winning players.`
  }

  // Lost
  const board = parseCards(h.board ?? '')
  const heroCards = parseCards(hero.holeCards)
  if (heroCards.length === 2 && board.length >= 3) {
    const handName = describeHandStrength(heroCards as [Card, Card], board)
    if (handName === 'High Card') return `You lost with just high card. Consider folding earlier on future boards where you don't connect — chasing with nothing is expensive.`
    if (handName.includes('One Pair')) return `You lost with one pair. One pair is a common hand that often looks strong but can be beaten. On coordinated boards, be cautious about putting too much money in with just one pair.`
  }
  return `You lost $${Math.abs(h.profit)} in this hand. Review the action to see if there was a point where folding would have saved chips.`
})

// ─── Player summary cards ────────────────────────────────────
const playerSummaries = computed(() => {
  if (!props.hand.players) return []
  return props.hand.players.map(p => {
    const persona = getPersona(p.name)
    return {
      ...p,
      type: playerType(p.name),
      styleNote: playerStyleNote(p.name),
      isPro: persona ? !FICTIONAL.includes(p.name) : false,
      vpip: persona ? (persona.vpip * 100).toFixed(0) : '?',
      pfr: persona ? (persona.pfr * 100).toFixed(0) : '?',
      aggression: persona ? persona.aggression.toFixed(2) : '?',
    }
  })
})
</script>

<template>
  <UModal :open="props.open" @update:open="(v: boolean) => { if (!v) handleClose() }">
    <template #content>
      <div class="bg-gray-950 text-white max-h-[85vh] overflow-y-auto">
        <!-- Header -->
        <div class="sticky top-0 bg-gray-950 z-10 border-b border-gray-800 px-6 py-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold">Hand #{{ hand.hand_number }} Analysis</h2>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ hand.hole_cards }} | {{ hand.position }} | Pot ${{ hand.pot_size }}
                <span :class="hand.result === 'won' ? 'text-green-400' : hand.result === 'lost' ? 'text-red-400' : 'text-gray-400'" class="ml-2 font-semibold uppercase">{{ hand.result }}</span>
              </div>
            </div>
            <button @click="handleClose()" class="text-gray-500 hover:text-white text-xl">&times;</button>
          </div>
        </div>

        <div class="px-6 py-4 space-y-6">

          <!-- Key Takeaway -->
          <div class="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
            <div class="text-[0.6rem] text-blue-400 uppercase font-bold mb-1">Key Takeaway</div>
            <div class="text-sm text-blue-200 leading-relaxed">{{ keyTakeaway }}</div>
          </div>

          <!-- Player Profiles -->
          <div>
            <div class="text-[0.6rem] text-gray-500 uppercase font-bold mb-2">Players at the Table</div>
            <div class="grid grid-cols-1 gap-2">
              <div
                v-for="p in playerSummaries"
                :key="p.name"
                class="bg-gray-900/50 rounded-lg px-3 py-2 text-xs"
                :class="{ 'border border-amber-800/30': p.isHero }"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span :class="p.isHero ? 'text-amber-400' : 'text-white'" class="font-semibold">{{ p.name }}</span>
                    <span class="text-gray-600">{{ p.position }}</span>
                    <span v-if="p.isPro" class="px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded text-[0.5rem] font-bold">PRO</span>
                    <span class="text-gray-500">{{ p.type }}</span>
                  </div>
                  <div class="flex items-center gap-3 text-gray-500">
                    <span>VPIP {{ p.vpip }}%</span>
                    <span>PFR {{ p.pfr }}%</span>
                    <span>AF {{ p.aggression }}</span>
                  </div>
                </div>
                <div v-if="p.styleNote" class="text-gray-600 mt-1 leading-relaxed">{{ p.styleNote }}</div>
              </div>
            </div>
          </div>

          <!-- Street-by-Street Analysis -->
          <div v-for="(street, si) in streets" :key="si" class="space-y-2">
            <!-- Street header -->
            <div class="flex items-center gap-3">
              <div class="text-sm font-bold" :class="{
                'text-yellow-400': street.name === 'Preflop',
                'text-green-400': street.name === 'Flop',
                'text-amber-400': street.name === 'Turn',
                'text-red-400': street.name === 'River',
              }">
                {{ street.name }}
              </div>
              <div v-if="street.board" class="font-mono text-white text-sm">{{ street.board }}</div>
              <div class="text-xs text-gray-600">Pot: ${{ street.potAtStart }}</div>
            </div>

            <!-- Board texture (postflop only) -->
            <div v-if="street.boardCards.length >= 3" class="text-xs text-gray-500 bg-gray-900/30 rounded px-3 py-1.5">
              Board texture: {{ describeBoard(street.boardCards) }}
            </div>

            <!-- Actions -->
            <div class="space-y-1.5 pl-3 border-l-2 border-gray-800">
              <div
                v-for="(act, ai) in street.actions"
                :key="ai"
                class="text-xs"
              >
                <!-- Action line -->
                <div class="flex items-start gap-2">
                  <span class="font-mono shrink-0 w-5 text-center" :class="{
                    'text-red-400': act.action === 'fold',
                    'text-gray-500': act.action === 'check',
                    'text-blue-400': act.action === 'call',
                    'text-green-400': act.action === 'raise',
                    'text-yellow-400': act.action === 'all-in',
                  }">
                    {{ act.action === 'fold' ? '✗' : act.action === 'check' ? '—' : act.action === 'call' ? '→' : act.action === 'raise' ? '↑' : '⚡' }}
                  </span>
                  <div>
                    <span class="text-gray-300 font-semibold">{{ act.raw }}</span>
                    <div class="text-gray-500 mt-0.5 leading-relaxed">
                      {{ explainAction(act, street, si, ai) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Showdown -->
          <div v-if="showdownSummary" class="bg-gray-900/50 rounded-xl p-4">
            <div class="text-[0.6rem] text-gray-500 uppercase font-bold mb-1">Showdown</div>
            <div class="text-sm text-gray-300 leading-relaxed">{{ showdownSummary }}</div>
          </div>

        </div>
      </div>
    </template>
  </UModal>
</template>
