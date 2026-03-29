/**
 * Live commentary composable — runs TWO simultaneous streams:
 *   'hero'  — Hero's perspective. Only hero's cards + public info.
 *   'tv'    — Norman Chad & Lon McEachern style dual-voice TV broadcast.
 *             Sees all hole cards, dramatic irony, witty banter.
 * Both streams generate in real time; switching modes is instant.
 */
import type { Card } from '~/utils/cards'
import { displayCard } from '~/utils/cards'
import { chenScore, bestHand, HAND_RANK_NAMES, HAND_RANKS, detectDraws } from '~/utils/handAnalysis'
import type { PlayerState } from '~/composables/useGameState'
import config from '@config'

export type CommentaryMode = 'hero' | 'tv'

export interface CommentaryLine {
  id: number
  text: string
  type: 'deal' | 'action' | 'street' | 'showdown' | 'aside'
  voice?: 'lon' | 'norman' // TV mode only
}

let lineId = 0
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function cardStr(c: [Card, Card]): string { return `${displayCard(c[0])} ${displayCard(c[1])}` }
function pairName(r: number): string {
  const n: Record<number, string> = { 14: 'aces', 13: 'kings', 12: 'queens', 11: 'jacks', 10: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'deuces' }
  return n[r] || `${r}s`
}
function isPair(c: [Card, Card]): boolean { return c[0].rank === c[1].rank }
function persona(name: string) { return config.personas.find(p => p.name === name) }

// ─── No-repeat picker: tracks used indices per pool to avoid repeats within a game ──
class UniquePool<T> {
  private items: T[]
  private used = new Set<number>()
  constructor(items: T[]) { this.items = items }
  pick(): T {
    if (this.used.size >= this.items.length) this.used.clear()
    let idx: number
    do { idx = Math.floor(Math.random() * this.items.length) } while (this.used.has(idx))
    this.used.add(idx)
    return this.items[idx]
  }
  reset() { this.used.clear() }
}

// ─── Norman Chad quip pools ───────────────────────────────────────

const normanFoldQuips = new UniquePool([
  `Another one bites the dust.`,
  `Didn't like what they saw. Can't blame them.`,
  `Out. Just like me at every family gathering.`,
  `Fold. The most underrated play in poker.`,
  `Smart fold. I wish I could fold on my mortgage payments.`,
  `Gone. Like my hair in the early 2000s.`,
  `They say discretion is the better part of valor. Also the better part of poker.`,
  `Folding. The one decision in poker that never costs you more money.`,
  `And they're out. Poker is 90% folding and 10% trying not to cry.`,
  `Another fold. This table is tighter than my ex-wife's grip on the remote control.`,
  `Muck it. Save those chips for a rainy day. Or a sunny day. Any day, really.`,
  `Out of the hand. Sometimes the best hand you play is the one you don't.`,
])

const normanBigFoldQuips = new UniquePool([
  `Folding THAT? In what universe?`,
  `They just threw away a premium hand. I fold my laundry with more reluctance.`,
  `Discipline. Or insanity. Fine line between the two.`,
  `I wouldn't have the discipline to fold that. Then again, discipline isn't my strong suit. Just ask my three ex-wives.`,
  `A laydown like that takes guts. Guts I don't have. I once called an all-in with jack-four suited.`,
  `That fold physically hurt me and I'm just watching.`,
])

const normanBluffQuips = new UniquePool([
  `Pure bluff! They have absolutely nothing. I respect the audacity.`,
  `Air ball! Betting on hope and a prayer. Mostly hope.`,
  `That's a bluff. I can tell because I've been bluffing my way through life for decades.`,
  `Nothing! Representing a hand they don't have. Just like my resume.`,
  `Complete air. The only thing emptier is my refrigerator.`,
  `Bluffing with nothing. That takes either courage or a complete lack of self-awareness. Both are useful in poker.`,
  `They're betting with air. Hot air, specifically. Like a politician at a fundraiser.`,
  `That's a stone-cold bluff. Colder than my apartment after my wife changed the Netflix password AND the thermostat.`,
])

const normanRaiseQuips = new UniquePool([
  `Building the pot. Smart poker.`,
  `Likes their hand. Can't blame them.`,
  `Solid bet. The kind of bet that says "I know what I'm doing." Or at least pretends to.`,
  `Value bet. Get those chips in while you can. That's also my philosophy at the buffet.`,
  `A raise. The second most aggressive move in poker. The most aggressive is ordering the lobster at the poker room restaurant.`,
  `Putting the pressure on. I wish I could raise at my job review like that.`,
  `That bet says "I have a hand." Of course, sometimes the bet lies. Bets are like dating profiles that way.`,
  `Raising it up. The poker equivalent of "let me speak to your manager."`,
])

const normanCallQuips = new UniquePool([
  `Flat call. Let's see what develops.`,
  `Wants to see more cards. Fair enough.`,
  `Calling. Not glamorous, but effective. Like a sensible sedan.`,
  `A call. The most passive move in poker. Also the most passive move in my personal life.`,
  `Smooth call. They're either trapping or confused. Hard to tell sometimes.`,
  `Just a call. Sometimes you gotta take the scenic route.`,
  `Calling station? Or genius slow-play? History will decide. Probably calling station.`,
  `Flat call there. Keeping it cool. Cooler than the other side of the pillow.`,
])

const normanCheckQuips = new UniquePool([
  `No bet. Keeping the pot small. Like my ambitions.`,
  `Check. Cautious play there.`,
  `Doesn't like it enough to bet. Join the club.`,
  `Tap tap. Moving on. Just like my last relationship.`,
  `A check. The poker equivalent of "I'll have what she's having."`,
  `Checking. The safest play in poker. Also the most boring, but we don't judge here.`,
  `Check. No bet. In poker, sometimes doing nothing is the right play. Try telling that to my therapist.`,
  `Checking it down. The poker equivalent of taking a nap. Aggressive napping.`,
])

const normanAllinQuips = new UniquePool([
  `Somebody's about to be very happy or very sad. Just like prom night.`,
  `All the chips in the middle. This is poker, baby.`,
  `The big move! Hold on to your seats. And your wallets.`,
  `All-in! The most exciting two words in poker. The least exciting two words? "Nice fold."`,
  `Everything in the middle. That's either confidence or desperation. In poker, it's hard to tell the difference.`,
  `All-in! My heart rate just went up. And I'm a commentator.`,
  `Shove! That's the kind of move that makes or breaks a tournament. And a spirit.`,
  `All the marbles! I haven't been this excited since I found a twenty in my coat pocket.`,
])

const normanAllinJunkQuips = new UniquePool([
  `ALL-IN with THAT?! I've made better decisions at 3 AM at a Waffle House.`,
  `That's either genius or insanity. Going with insanity.`,
  `Shoved with garbage. My kind of player. Reminds me of myself, actually.`,
  `All-in with nothing. That's not poker, that's a cry for help.`,
  `They just shoved with junk. The poker gods are going to have something to say about this.`,
  `Going all-in with that hand is like bringing a pool noodle to a sword fight.`,
])

const normanShowdownWinQuips = new UniquePool([
  `Beautiful. Played that perfectly. Unlike my last three marriages.`,
  `Hero cashes in. That's how you do it, folks.`,
  `And Hero takes the pot. Skill? Luck? Yes.`,
  `Hero wins! Even a blind squirrel finds a nut sometimes. Not that Hero is a blind squirrel.`,
  `Winner winner, chicken dinner. I never understood that expression. Why chicken? Why not steak?`,
  `Hero rakes it in. That's the good stuff right there.`,
])

const normanShowdownLoseQuips = new UniquePool([
  `Ouch. Poker finds new ways to hurt you every day.`,
  `Hero is not going to sleep well tonight. Then again, who does?`,
  `And that's poker. The cruelest game ever invented by someone who hated happiness.`,
  `Tough beat. I've been there. I live there, actually. I've set up a tent.`,
  `Hero takes the L. It happens. It happens to me a lot, but it happens.`,
  `That one stings. Like a bee. A poker bee. The worst kind of bee.`,
])

const normanCoolerQuips = new UniquePool([
  `A cooler! Both huge hands. That's the kind of hand that makes players quit poker. Temporarily.`,
  `Brutal. Did nothing wrong and still lost. Poker in a nutshell.`,
  `That's a cooler, folks. The only thing cooler is my alimony payments.`,
  `Two monster hands collide. Poker is a beautiful, terrible game.`,
  `Cooler city. Population: one very sad poker player.`,
])

const normanForeshadowQuips = new UniquePool([
  `I've seen the future, and someone's going to like it.`,
  `Spoiler alert: the deck has a surprise in store.`,
  `Oh, I peeked at what's coming. You're not going to believe it.`,
  `The poker gods are setting something up here. I can feel it in my bones. And my bones are usually wrong, but not today.`,
  `Something's brewing. I can feel it. Like when you know the pizza delivery guy is close.`,
  `The next card is going to change everything. And I do mean everything.`,
])

const normanStreetHitQuips = new UniquePool([
  `Now we're cooking with gas.`,
  `That's a board you dream about. Unlike my recurring nightmare about the WSOP.`,
  `Bingo. That card changed the whole complexion of this hand.`,
  `Oh my. Things just got very interesting.`,
  `That card! You can almost hear the chips rattling.`,
])

const normanStreetMissQuips = new UniquePool([
  `Whiffed completely. This could be trouble.`,
  `Absolutely nothing. Like my bank account after Vegas.`,
  `Missed by a mile. That's a bad feeling. I know that feeling well.`,
  `Nothing there. The board said "not today, friend."`,
])

// ─── Persona-specific Norman quips ───────────────────────────────
const normanPersonaQuips: Record<string, string[]> = {
  'Hill Phellmuth': [
    `There's Phellmuth. The man who thinks he invented poker. He didn't. But try telling him that.`,
    `Phellmuth at the table. If this doesn't go his way, expect fireworks. And by fireworks I mean a tantrum.`,
    `Phellmuth's involved. This is either going to be brilliant or a meltdown. No in-between with that guy.`,
    `Oh, Phellmuth. The Poker Brat himself. I've seen calmer people at the DMV.`,
  ],
  'Naniel Degreanu': [
    `Degreanu's in the hand. The man can read souls. Or so he claims on his vlog.`,
    `Degreanu with the suited connectors again. The man loves speculative hands more than I love buffets.`,
    `That's Degreanu. Always chatting, always smiling, always taking your money.`,
  ],
  'Ihil Pvey': [
    `Pvey at the table. The man is a machine. I've never seen him blink. Literally never.`,
    `Pvey's involved. This is the guy who plays perfect poker. It's annoying, frankly.`,
    `Pvey. The human calculator. Makes my brain hurt just watching him.`,
  ],
  'Boyle Drunson': [
    `Drunson in the hand. The Godfather of Poker. This man was playing poker before most of us were born.`,
    `That's Drunson. Old school. Power poker. He wrote the book on it. Literally.`,
    `Drunson's involved. Super/System in action, folks.`,
  ],
  'Kabe Gaplan': [
    `Gaplan's in! Welcome Back, Kotter fans rejoice. Vinnie Barbarino would be proud.`,
    `That's Gaplan. The man went from teaching the Sweathogs to crushing poker. What a career arc.`,
    `Gaplan at the table. "Up your nose with a rubber hose" — that's what he's saying to the other players' chip stacks.`,
    `Gaplan's involved. Horseshack would be raising here too. "Ooh ooh ooh, Mr. Kotter!"`,
  ],
  'Dom Twan': [
    `Dom Twan. The "durrrr" challenge guy. He bets like he's allergic to folding.`,
    `Twan's in. This kid plays poker like he stole somebody's bankroll. Which, in a way, he has. Many times.`,
    `That's Twan. Online legend. The man who made "durrrr" a poker term.`,
  ],
  'Bean-Robert Jellande': [
    `Jellande's involved. The man bets like money is just paper. Which, technically, it is.`,
    `That's Jellande. Fearless. Reckless? Maybe. But mostly fearless.`,
    `Jellande at the table. He'd bluff his own grandmother. And probably has.`,
  ],
  'Mike the Mouth': [
    `Mike the Mouth! If he loses this one, clear the blast radius.`,
    `The Mouth is in. Solid player until he loses, then it's like watching a pinball machine tilt.`,
    `Mike the Mouth at the table. The man's poker face is "no face at all — just shouting."`,
  ],
  'Tennifer Jilly': [
    `Jilly's in the hand. She's unpredictable. One hand she's a nit, next hand she's a maniac. It's unsettling.`,
    `That's Jilly. She'll either fold everything or bluff you off the table. Flip a coin.`,
  ],
  'Rhip Ceese': [
    `Ceese at the table. The legend. The man has more bracelets than a jewelry store.`,
    `That's Ceese. Near-zero leaks. Playing against him is like playing against a wall. A very expensive wall.`,
  ],
  'Utu Sngar': [
    `Sngar's involved. Genius-level reads. The man sees things the rest of us can't.`,
    `That's Sngar. Fearless and brilliant. A terrifying combination at a poker table.`,
  ],
  'Serik Eidel': [
    `Eidel in the hand. The Quiet Assassin. You won't hear him coming. You'll just hear your chips leaving.`,
    `That's Eidel. Patience of a saint. I couldn't sit that still if you paid me. Well, maybe if you paid me a lot.`,
  ],
  'Sanessa Velbst': [
    `Velbst at the table. Fearless aggressor. She 3-bets like it's going out of style.`,
    `That's Velbst. She doesn't just play poker, she attacks it.`,
  ],
  'Aatrik Pantonius': [
    `Pantonius. Finnish ice. The man's blood temperature is somewhere below freezing.`,
    `That's Pantonius. Calm, precise, and completely terrifying.`,
  ],
  'Ncotty Sguyen': [
    `Sguyen's in. Loose-aggressive with flair. If poker were a dance, he'd be doing the cha-cha.`,
    `That's Sguyen. Watch out — he tilts on bad beats, and when he tilts, chips fly everywhere.`,
  ],
  'Mhris Coneymaker': [
    `Coneymaker at the table. Online grinder turned live pro. He's seen more flops than a pancake house.`,
    `That's Coneymaker. The internet kid. He's played more hands than most of us have had meals.`,
  ],
  'Cohnny Jhan': [
    `Jhan's in the hand. Old-school tight-aggressive. The man doesn't waste chips.`,
    `That's Jhan. Patient as a cat watching a mouse hole. And just as deadly.`,
  ],
  'Krynn Benney': [
    `Benney at the table. Modern GTO high-roller. She plays poker like a chess grandmaster plays chess.`,
    `That's Benney. Creative lines, big pots. The new school of poker.`,
  ],
  'Entonio Asfandiari': [
    `Asfandiari's involved! The Magician. He makes your chips disappear. Get it? Magician? I'll see myself out.`,
    `That's Asfandiari. Constant pressure. Playing against him is like being in a wind tunnel of aggression.`,
  ],
  'Lhil Paak': [
    `Paak's in the hand. Unorthodox, analytical, and just weird enough to be dangerous.`,
    `That's Paak. He floats bets like a butterfly and stings like a bee. I might be mixing metaphors.`,
  ],
}

function normanPersonaQuip(name: string): string | null {
  const quips = normanPersonaQuips[name]
  if (!quips || quips.length === 0) return null
  return pick(quips)
}

const normanGenericQuips = new UniquePool([
  `You know what they say — poker is a hard way to make an easy living.`,
  `This reminds me of my second marriage. A lot of bluffing and someone's going home broke.`,
  `I love this game. It's the only place where losing money feels like a learning experience.`,
  `Poker: where you can do everything right and still lose. Just like parallel parking.`,
  `My therapist says I should stop comparing life to poker. I raised.`,
  `You know, poker and golf have a lot in common. In both, I'm terrible but I keep coming back.`,
  `This is good poker. Unlike the poker I play, which is more of a charitable donation.`,
])

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
}

export function useCommentary(gs: GS) {
  const heroLines = ref<CommentaryLine[]>([])
  const tvLines = ref<CommentaryLine[]>([])
  const enabled = ref(typeof localStorage !== 'undefined' ? localStorage.getItem('holdem-commentary-enabled') !== 'false' : true)
  const mode = ref<CommentaryMode>((typeof localStorage !== 'undefined' ? localStorage.getItem('holdem-commentary-mode') as CommentaryMode : null) || 'hero')

  watch(enabled, v => { if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-commentary-enabled', String(v)) })
  watch(mode, v => { if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-commentary-mode', v) })

  const lines = computed(() => mode.value === 'tv' ? tvLines.value : heroLines.value)

  // Which voice speaks next in TV mode (alternates)
  let nextVoice: 'lon' | 'norman' = 'lon'

  function addHero(text: string, type: CommentaryLine['type'] = 'aside') {
    if (!enabled.value) return
    heroLines.value = [...heroLines.value, { id: ++lineId, text, type }]
  }
  function addTV(text: string, type: CommentaryLine['type'] = 'aside', voice?: 'lon' | 'norman') {
    if (!enabled.value) return
    const v = voice || nextVoice
    nextVoice = v === 'lon' ? 'norman' : 'lon'
    tvLines.value = [...tvLines.value, { id: ++lineId, text, type, voice: v }]
  }
  function clear() {
    heroLines.value = []; tvLines.value = []; nextVoice = 'lon'
    // Reset all quip pools on new hand so full variety is available
    normanFoldQuips.reset(); normanBigFoldQuips.reset(); normanBluffQuips.reset()
    normanRaiseQuips.reset(); normanCallQuips.reset(); normanCheckQuips.reset()
    normanAllinQuips.reset(); normanAllinJunkQuips.reset()
    normanShowdownWinQuips.reset(); normanShowdownLoseQuips.reset(); normanCoolerQuips.reset()
    normanForeshadowQuips.reset(); normanStreetHitQuips.reset(); normanStreetMissQuips.reset()
    normanGenericQuips.reset()
  }

  // ─── Helpers ─────────────────────────────────────────────

  function activePl(): PlayerState[] { return gs.playerStates.value.filter(p => !p.folded && !p.eliminated && p.holeCards) }
  function findPl(name: string) { return gs.playerStates.value.find(p => p.name === name) }
  function hero(): PlayerState { return gs.playerStates.value[0] }
  function handStr(p: PlayerState, community: Card[]): string | null {
    if (!p.holeCards || community.length < 3) return null
    const r = bestHand(Array.from(p.holeCards), community)
    return r ? HAND_RANK_NAMES[r.rank] : null
  }

  // ─── DEAL ───────────────────────────────────────────────

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

    // Hero hand reaction
    if (chen >= 10) {
      addTV(pick([`Hero looks down at ${cards}. That's a premium hand.`, `${cards} for Hero. Very strong.`]), 'deal', 'lon')
      addTV(pick([`Finally a hand worth playing. My ex-wife never had that kind of luck.`, `Oh, Hero's got a real hand. Unlike my poker game last Tuesday.`, `That's the kind of hand that makes you sit up straight.`, `Now THAT'S a starting hand. I get excited just looking at it. Which is sad, if you think about it.`]), 'deal', 'norman')
    } else if (chen <= 4) {
      addTV(`Hero picks up ${cards}.`, 'deal', 'lon')
      addTV(pick([`${cards}? I've gotten better hands from a vending machine.`, `That hand is so bad, even my mother-in-law would fold it.`, `Hero's going to need a miracle. Or several miracles.`, `That's the poker equivalent of getting socks for Christmas.`, `I wouldn't play that hand with someone else's chips.`]), 'deal', 'norman')
    } else {
      addTV(`${cards} for Hero.`, 'deal', 'lon')
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
        addTV(chen >= 10 ? normanBigFoldQuips.pick() : normanFoldQuips.pick(), 'action', 'norman')
        return
      }

      // Non-hero fold
      addHero(pick([`${name} folds.`, `${name} is out.`, `${name} mucks it.`]), 'action')

      if (pl.holeCards) {
        const chen = chenScore(pl.holeCards)
        const community = gs.visibleCommunity.value
        if (chen >= 10 && gs.street.value === 'preflop') {
          addTV(`${name} folds ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          addTV(normanBigFoldQuips.pick(), 'action', 'norman')
        } else if (community.length >= 3) {
          const hand = handStr(pl, community)
          if (hand && ['Two Pair', 'Three of a Kind', 'Straight', 'Flush'].includes(hand)) {
            addTV(`${name} folds ${hand}!`, 'action', 'lon')
            addTV(normanBigFoldQuips.pick(), 'action', 'norman')
          } else {
            addTV(`${name} folds.`, 'action', 'lon')
            addTV(normanFoldQuips.pick(), 'action', 'norman')
          }
        } else {
          addTV(`${name} folds ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          addTV(normanFoldQuips.pick(), 'action', 'norman')
        }
      }
      return
    }

    // ── ALL-IN ──
    if (allinM) {
      const name = allinM[1]
      const amount = parseInt(allinM[2])
      const pl = findPl(name)

      addHero(pick([`${name} goes ALL-IN! $${amount}.`, `ALL-IN from ${name}! $${amount} on the line.`, `${name} shoves $${amount}. Big decision coming.`]), 'action')

      if (pl?.holeCards) {
        const community = gs.visibleCommunity.value
        const hand = community.length >= 3 ? handStr(pl, community) : null
        if (hand && ['Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'].includes(hand)) {
          addTV(`${name} shoves $${amount} with ${hand}!`, 'action', 'lon')
          addTV(normanAllinQuips.pick(), 'action', 'norman')
        } else if (pl.holeCards && chenScore(pl.holeCards) <= 4 && gs.street.value === 'preflop') {
          addTV(`${name} goes all-in with ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          addTV(normanAllinJunkQuips.pick(), 'action', 'norman')
        } else {
          addTV(`ALL-IN from ${name}! $${amount}.`, 'action', 'lon')
          addTV(normanAllinQuips.pick(), 'action', 'norman')
        }
      } else {
        addTV(`${name} shoves for $${amount}!`, 'action', 'lon')
        addTV(normanAllinQuips.pick(), 'action', 'norman')
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
        const isBluff = community.length >= 3
          ? (() => { const h = bestHand(Array.from(pl.holeCards!), community); return h ? h.rank <= HAND_RANKS.HIGH_CARD : true })()
          : chenScore(pl.holeCards) <= 4
        if (isBluff) {
          addTV(`${name} ${raiseM ? 'raises to' : 'bets'} $${amount} with ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          addTV(normanBluffQuips.pick(), 'action', 'norman')
        } else {
          const hand = community.length >= 3 ? handStr(pl, community) : null
          addTV(`${name} ${raiseM ? 'raises to' : 'bets'} $${amount}${hand ? ` with ${hand}` : ''}.`, 'action', 'lon')
          const pq = Math.random() < 0.4 ? normanPersonaQuip(name) : null
          addTV(pq || normanRaiseQuips.pick(), 'action', 'norman')
        }
      } else {
        addTV(`${name} makes it $${amount}.`, 'action', 'lon')
        const pq = Math.random() < 0.4 ? normanPersonaQuip(name) : null
        addTV(pq || normanRaiseQuips.pick(), 'action', 'norman')
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
          const hands = activePl().filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.values[0] - a.result!.values[0])
          if (hands.length > 0 && hands[0].player.name === name) {
            addTV(`${name} just calls with the best hand.`, 'action', 'lon')
            addTV(normanCallQuips.pick(), 'action', 'norman')
            return
          }
          const draws = detectDraws(Array.from(pl.holeCards!), community)
          if (draws.length > 0) {
            addTV(`${name} calls $${amount}, chasing the ${draws[0].type.toLowerCase()}.`, 'action', 'lon')
            addTV(normanCallQuips.pick(), 'action', 'norman')
            return
          }
        }
        addTV(`${name} calls $${amount} with ${cardStr(pl.holeCards)}.`, 'action', 'lon')
        addTV(normanCallQuips.pick(), 'action', 'norman')
      } else {
        addTV(`${name} calls $${amount}.`, 'action', 'lon')
        addTV(normanCallQuips.pick(), 'action', 'norman')
      }
      return
    }

    // ── CHECK ──
    if (checkM) {
      const name = checkM[1]
      addHero(pick([`${name} checks.`, `Check from ${name}.`, `${name} taps the table.`]), 'action')
      addTV(`${name} checks.`, 'action', 'lon')
      addTV(normanCheckQuips.pick(), 'action', 'norman')
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

      // Hero stream
      addHero(pick([`Flop: ${boardStr}.`, `The flop comes ${boardStr}.`]), 'street')
      if (h.holeCards && !h.folded) {
        const hand = bestHand(Array.from(h.holeCards), community)
        const draws = detectDraws(Array.from(h.holeCards), community)
        if (hand && hand.rank >= HAND_RANKS.TWO_PAIR) addHero(`We flopped ${HAND_RANK_NAMES[hand.rank]}!`, 'street')
        else if (draws.some(d => d.outs >= 8)) addHero(`We picked up a ${draws[0].type.toLowerCase()} draw — ${draws[0].outs} outs.`, 'street')
        else if (hand && hand.rank <= HAND_RANKS.HIGH_CARD) addHero(`Missed the flop completely.`, 'street')
      }

      // TV stream
      addTV(`Flop comes ${boardStr}.`, 'street', 'lon')
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
          addTV(normanStreetHitQuips.pick(), 'street', 'norman')
        }
      }
      if (misses.length > 0 && hits.length > 0) {
        addTV(normanStreetMissQuips.pick(), 'street', 'norman')
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
        const flopH = bestHand(Array.from(h.holeCards), community.slice(0, 3))
        const turnH = bestHand(Array.from(h.holeCards), community.slice(0, 4))
        if (turnH && flopH && turnH.rank > flopH.rank && turnH.rank >= HAND_RANKS.TWO_PAIR) addHero(`The turn improves us to ${HAND_RANK_NAMES[turnH.rank]}!`, 'street')
      }

      addTV(`Turn: ${turnCard}.`, 'street', 'lon')
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
        const hand = bestHand(Array.from(h.holeCards), community)
        if (hand && hand.rank >= HAND_RANKS.STRAIGHT) addHero(`We end up with ${HAND_RANK_NAMES[hand.rank]}.`, 'street')
      }

      addTV(`River: ${riverCard}.`, 'street', 'lon')
      const hands = players.filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.values[0] - a.result!.values[0])
      if (hands.length >= 2) {
        const best = hands[0]
        const second = hands[1]
        if (best.result!.rank >= HAND_RANKS.STRAIGHT) {
          addTV(`${best.player.isHero ? 'Hero' : best.player.name} has ${HAND_RANK_NAMES[best.result!.rank]}.`, 'street', 'lon')
          addTV(normanStreetHitQuips.pick(), 'street', 'norman')
        }
        if (best.result!.rank === second.result!.rank && best.result!.values[0] === second.result!.values[0]) {
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

    if (heroWon) {
      addHero(pick([`We take it down! $${amount} pot.`, `$${amount} coming our way. Nice hand.`, `We win $${amount}. Good result.`]), 'showdown')
      addTV(`Hero wins $${amount}!`, 'showdown', 'lon')
      addTV(normanShowdownWinQuips.pick(), 'showdown', 'norman')
    } else if (h.folded) {
      addHero(pick([`${winner} takes it. We were already out.`, `Pot goes to ${winner}. Good thing we folded.`]), 'showdown')
      addTV(`${winner} takes the pot.`, 'showdown', 'lon')
      addTV(normanFoldQuips.pick(), 'showdown', 'norman')
    } else {
      addHero(pick([`${winner} takes it. We come up short.`, `Pot goes to ${winner}. That one hurts.`, `${winner} wins. Tough break.`]), 'showdown')
      addTV(`${winner} takes the pot from Hero.`, 'showdown', 'lon')
      addTV(normanShowdownLoseQuips.pick(), 'showdown', 'norman')
    }

    // TV: cooler detection
    const ap = activePl()
    const community = gs.visibleCommunity.value
    if (community.length >= 5 && ap.length >= 2) {
      const hands = ap.filter(p => p.holeCards).map(p => ({ player: p, result: bestHand(Array.from(p.holeCards!), community) })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.values[0] - a.result!.values[0])
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
      const draws = detectDraws(Array.from(h.holeCards), community)
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
        addTV(pick([`A draw. The most hopeful hand in poker. And the most heartbreaking.`, `Drawing hand. Hope springs eternal. So does disappointment.`]), 'aside', 'norman')
      }
    } else if (gs.street.value === 'preflop' && chen >= 12) {
      addHero(pick([`Premium hand. Let's raise.`, `Strong preflop. Time to build a pot.`]), 'aside')
      addTV(`Hero with a premium hand preflop.`, 'aside', 'lon')
      addTV(pick([`This is the spot Hero's been waiting for. Don't blow it.`, `Premium hand. Now the question is: how much to charge admission.`]), 'aside', 'norman')
    }
  }

  // ─── Watchers ───────────────────────────────────────────

  watch(() => gs.handActionLog.value, () => {
    if (!enabled.value || !gs.dealt.value) return
    if (gs.handActionLog.value.length <= 1 && gs.street.value === 'preflop') { clear(); onDeal() }
  })

  watch(() => gs.street.value, (s, old) => {
    if (!enabled.value || s === old) return
    if (s === 'flop' || s === 'turn' || s === 'river') onStreet(s)
    if (s === 'showdown') nextTick(() => onShowdown())
  })

  let lastLogLen = 0
  watch(() => gs.handActionLog.value, () => { lastLogLen = 0 })
  watch(() => gs.handActionLog.value.length, (n) => {
    if (!enabled.value || n <= lastLogLen) { lastLogLen = n; return }
    gs.handActionLog.value.slice(lastLogLen).forEach(e => onAction(e))
    lastLogLen = n
  })

  watch(() => gs.heroTurn.value, (t) => {
    if (!enabled.value || !t) return
    if (gs.street.value === 'preflop' && gs.handActionLog.value.length < 3) return
    onHeroTurn()
  })

  return { lines: readonly(lines), enabled, mode, clear }
}
