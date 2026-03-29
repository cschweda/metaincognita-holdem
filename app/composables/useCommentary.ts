/**
 * Live commentary composable — runs TWO simultaneous streams:
 *   'hero'  — Hero's perspective. Only hero's cards + public info.
 *   'tv'    — Chorman Nad & Mon LeEachern style dual-voice TV broadcast.
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
  `Fold city. Population: growing.`,
  `And just like that, they're gone. Like my youth.`,
  `Smart. Save those chips. They don't grow on trees. I checked.`,
  `Fold. The poker equivalent of ghosting someone.`,
  `Another one out. This hand is getting heads-up real fast.`,
  `Gone faster than my paycheck on a Friday night.`,
  `That fold was easier than my divorce. And quicker.`,
  `Out. See ya. Wouldn't wanna be ya. Actually, I wouldn't wanna be any of us.`,
  `Fold. The silent killer of poker dreams. And also the savior of bankrolls.`,
  `Gone. Vanished. Poof. Like my 401k after my last Vegas trip.`,
  `And another one folds. It's like watching dominoes, except the dominoes have feelings.`,
  `Mucked it. Wise decision. I say that about everything I don't understand.`,
  `Out of the hand. Into the void. Where all folded hands go to live their best lives.`,
  `Fold. In Spanish, that's "fold." I took four years of Spanish and that's all I remember.`,
])

const normanBigFoldQuips = new UniquePool([
  `Folding THAT? In what universe?`,
  `They just threw away a premium hand. I fold my laundry with more reluctance.`,
  `Discipline. Or insanity. Fine line between the two.`,
  `I wouldn't have the discipline to fold that. Then again, discipline isn't my strong suit. Just ask my three ex-wives.`,
  `A laydown like that takes guts. Guts I don't have. I once called an all-in with jack-four suited.`,
  `That fold physically hurt me and I'm just watching.`,
  `Folding that is like returning a winning lottery ticket. Nobody does that. NOBODY.`,
  `I'm going to need a moment. That fold was... I can't even talk about it.`,
  `That's the kind of fold that haunts you at 3 AM. Trust me, I know.`,
  `If I folded that hand, I'd want a receipt. For emotional damages.`,
  `My jaw just hit the floor. And it's a long way down from this commentary booth.`,
  `That fold is going to be on their deathbed highlight reel. "Remember when I folded those aces?"`,
  `Laying that down is like giving back a winning lottery ticket. I'm physically ill.`,
  `That fold takes more discipline than I've shown in my entire life. Combined.`,
  `I'm going to need therapy after watching that fold. More therapy.`,
  `Folding that is like returning a puppy. Technically the right call, but emotionally devastating.`,
  `That laydown is either the best fold of the year or the worst. There is no in-between.`,
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
  `Bluffing with napkins. Absolute napkins. I've had better hands in a game of War.`,
  `That's not a bet, that's a lie with chips. A very expensive lie.`,
  `I admire the commitment. Wrong, but committed. That's my dating life in a nutshell.`,
  `They say fake it 'til you make it. This is the "fake it" part.`,
  `Betting with nothing. The audacity. The chutzpah. The... stupidity? No, let's go with "bravery."`,
  `Complete air. I've seen more substance in a soap bubble.`,
  `That bluff is so bold it should have its own Netflix special.`,
  `Nothing. Nada. Zilch. Zero. But hey, nice bet sizing.`,
  `They're selling a story. A fiction. A fairy tale. "Once upon a time, I had a good hand." The end.`,
  `That's a bluff so pure it belongs in a museum. The Museum of Bad Decisions.`,
  `Betting with nothing. I've done that in life. It doesn't work there either.`,
  `Complete air. The hand is empty. The bet is full. That's poker, baby.`,
  `Bluffing. The art of lying with chips instead of words. At least chips don't stutter.`,
  `They've got nothing but confidence. Which, in poker, is sometimes enough. And sometimes not.`,
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
  `A nice raise there. Making everyone pay for the privilege of seeing more cards.`,
  `That's a bet that means business. Monkey business, but business nonetheless.`,
  `Chips in the middle. That's where they belong. Not in your stack collecting dust.`,
  `Raise! The most beautiful word in poker. The second most beautiful word? "Double."`,
  `Pumping it up. I love aggression at the poker table. In traffic, not so much.`,
  `That's a statement bet. The statement is: "I'm better than you." We'll see about that.`,
  `A raise. In poker, if you're not raising, you're just renting your seat.`,
  `Chips flying into the pot. Music to a poker player's ears. Nails on a chalkboard to a poker player's wallet.`,
  `Raising. The universal language of "I think I'm better than you."`,
  `A raise. Because checking is for people who don't believe in themselves. Or their cards.`,
  `Bet. The poker equivalent of planting a flag and saying "this pot is mine."`,
  `A nice raise. Confident. Commanding. Like a substitute teacher who actually knows the material.`,
  `Chips in the middle. That's commitment. More commitment than I've shown in any relationship.`,
  `Raising it up. Fortune favors the bold. It also bankrupts the bold, but let's stay positive.`,
  `That bet says "come and get me." Which is either courage or an invitation to disaster.`,
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
  `A call. The poker equivalent of "I'm not mad, I'm just disappointed."`,
  `Flat call. Playing it close to the vest. My vest, incidentally, is from 1997.`,
  `Calling. The safe choice. Like ordering vanilla. Nothing wrong with vanilla.`,
  `Just a call. Keeping their options open, like my Tinder profile.`,
  `Smooth as butter. A nice flat call there.`,
  `Calling. Not folding, not raising. The Goldilocks of poker decisions.`,
  `A call. Sometimes you just want to see what happens next. Like watching a car accident. In slow motion. With chips.`,
  `Flat call. They want to dance, but they don't want to lead.`,
  `Calling. The poker equivalent of "sure, why not." The unofficial motto of my life.`,
  `A call. Keeping the dream alive. The dream of winning this pot. We all have dreams.`,
  `Flat call. No drama. No excitement. Just pure, uncut poker. The good stuff.`,
  `Calling. Because raising takes energy and folding takes courage. Calling takes neither.`,
  `A call. The most noncommittal move in poker. It's like saying "maybe" to a wedding invitation.`,
  `Calling. The Switzerland of poker moves. Neutral. Boring. Effective.`,
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
  `Check. The universal sign for "I've got nothing but I'm not ready to admit it."`,
  `Tap tap tap. That's either a check or a nervous twitch. In poker, it's both.`,
  `A check. Bold move, doing nothing. I do nothing professionally and it hasn't worked out great.`,
  `Checking. The poker equivalent of hitting the snooze button.`,
  `Check. Free card. The best price in poker. I love free things. Free cards, free buffets, free advice that I ignore.`,
  `No bet. Just vibes. Poker vibes.`,
  `Check. They're either trapping or they have absolutely nothing. In my experience, it's usually nothing.`,
  `Tap tap. The international sign for "I have no idea what I'm doing but I'm still in."`,
  `A check. Because sometimes the bravest thing you can do is nothing. That's what I tell my boss.`,
  `Checking. The pause button of poker. Hit it when you need to think. Or when you have nothing to think about.`,
  `Check. No bet. Just sitting there. Existing. Vibing. Like me at parties.`,
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
  `All-in! That's the nuclear option. The poker equivalent of flipping the table, except you're technically still playing.`,
  `Shove! All of it! Everything! I need a moment.`,
  `All-in. The two most beautiful and terrifying words in the English language. Right after "audit notice."`,
  `They've pushed it all in. This is the moment we've been waiting for. Well, I've been waiting for lunch, but this is good too.`,
  `ALL-IN! Buckle up, buttercup. Things are about to get real.`,
  `Everything in the middle. That pot is bigger than my car payment. Both of them.`,
  `All-in! That's the poker equivalent of "hold my beer and watch this."`,
  `Shove! All of it! Everything! My palms are sweating and I don't even have money in this.`,
  `All-in. The moment of truth. The point of no return. The... I'm running out of clichés.`,
  `They've pushed it all in. Somewhere, a poker coaching video just wrote itself.`,
])

const normanAllinJunkQuips = new UniquePool([
  `ALL-IN with THAT?! I've made better decisions at 3 AM at a Waffle House.`,
  `That's either genius or insanity. Going with insanity.`,
  `Shoved with garbage. My kind of player. Reminds me of myself, actually.`,
  `All-in with nothing. That's not poker, that's a cry for help.`,
  `They just shoved with junk. The poker gods are going to have something to say about this.`,
  `Going all-in with that hand is like bringing a pool noodle to a sword fight.`,
  `ALL-IN with that?! That hand couldn't beat a ham sandwich. And the sandwich isn't even playing.`,
  `Shoved with rags. I've seen better hands on a clock.`,
  `All-in with garbage. You know what, I kind of respect it. It's wrong, but I respect it.`,
  `That's the kind of all-in that makes your grandmother weep. And she doesn't even play poker.`,
  `Shoving with that hand is like skydiving without a parachute. Thrilling for about three seconds.`,
  `ALL-IN with junk. In their defense, it IS fun to say "all-in." It's less fun to lose.`,
  `All-in with that?! That hand couldn't beat a ham sandwich. And the sandwich has mayo.`,
  `Shoving with garbage. Somewhere, a poker textbook just burst into flames.`,
  `All-in with that hand. That's not courage, that's a Wikipedia article about bad decisions.`,
  `ALL-IN with nothing. My ex-wife had more substance. And that's saying something.`,
])

const normanShowdownWinQuips = new UniquePool([
  `Beautiful. Played that perfectly. Unlike my last three marriages.`,
  `Hero cashes in. That's how you do it, folks.`,
  `And Hero takes the pot. Skill? Luck? Yes.`,
  `Hero wins! Even a blind squirrel finds a nut sometimes. Not that Hero is a blind squirrel.`,
  `Winner winner, chicken dinner. I never understood that expression. Why chicken? Why not steak?`,
  `Hero rakes it in. That's the good stuff right there.`,
  `Hero wins! I'm not crying, you're crying. OK, I'm crying a little.`,
  `And the pot slides over to Hero. Like a beautiful, beautiful pile of money.`,
  `Hero takes it down! That's what we in the business call "good poker." We in my family call it "a miracle."`,
  `Nicely done, Hero. Textbook. If the textbook was written by someone who's actually good at poker. Unlike my textbook.`,
  `Hero wins! The poker gods smile upon the worthy. And occasionally the unworthy. I'm living proof.`,
  `And that's how it's done. Take notes, kids. Actually, don't take notes from me. Take notes from Hero.`,
  `Hero scoops! That's the kind of result that makes you forget all the bad beats. Temporarily.`,
  `And Hero takes the money. The beautiful, beautiful money.`,
  `Hero wins! I'd high-five Hero but I'm in a commentary booth and also I'm awkward.`,
  `Cha-ching! Hero cashes in. That sound? That's the sound of chips moving in the right direction.`,
  `Hero with the win! If poker were easy, everyone would do it. It's not easy. Hero just made it look easy.`,
])

const normanShowdownLoseQuips = new UniquePool([
  `Ouch. Poker finds new ways to hurt you every day.`,
  `Hero is not going to sleep well tonight. Then again, who does?`,
  `And that's poker. The cruelest game ever invented by someone who hated happiness.`,
  `Tough beat. I've been there. I live there, actually. I've set up a tent.`,
  `Hero takes the L. It happens. It happens to me a lot, but it happens.`,
  `That one stings. Like a bee. A poker bee. The worst kind of bee.`,
  `Hero loses. The only thing worse than losing at poker is losing at poker while someone commentates on it. Sorry, Hero.`,
  `Tough break. But remember, it's not about the destination, it's about the chips you lost along the way.`,
  `Hero comes up short. Poker: the game where you can do everything right and still watch your chips walk away.`,
  `And Hero loses. Welcome to the club. We have meetings on Tuesdays. And Wednesdays. And every other day.`,
  `That's a loss. But in poker, every loss is a learning experience. I've learned SO MUCH over the years. So, so much.`,
  `Hero loses the pot. Somewhere, a poker coach is saying "that's variance." It doesn't help, but they say it.`,
  `Hero loses. Poker taketh away. That's all poker does, really. Taketh.`,
  `And Hero drops that one. The bankroll takes a hit. Like my self-esteem at my high school reunion.`,
  `Tough loss. But remember: it's not about winning or losing. It's about... no wait, it IS about winning.`,
  `Hero doesn't win this one. But there's always the next hand. And the hand after that. And eventually retirement.`,
  `Ouch. That's going to leave a mark. Not a physical mark. An emotional, financial mark.`,
])

const normanCoolerQuips = new UniquePool([
  `A cooler! Both huge hands. That's the kind of hand that makes players quit poker. Temporarily.`,
  `Brutal. Did nothing wrong and still lost. Poker in a nutshell.`,
  `That's a cooler, folks. The only thing cooler is my alimony payments.`,
  `Two monster hands collide. Poker is a beautiful, terrible game.`,
  `Cooler city. Population: one very sad poker player.`,
  `That's a cooler. Nobody's fault. Except the deck's. I blame the deck. I always blame the deck.`,
  `Both players had monsters. The poker gods just chose violence today.`,
  `A cooler! That's the kind of hand that makes you question every life decision that led you to a poker table.`,
  `Brutal cooler. In a fair world, both players would win. This is not a fair world. I have the tax returns to prove it.`,
  `That's a cooler so cold it needs a jacket. And therapy.`,
  `Both players played it perfectly. One of them just got unlucky. That's the cruelest part.`,
  `Cooler! The universe's way of reminding you that poker isn't fair. Neither is life. But especially poker.`,
])

const normanForeshadowQuips = new UniquePool([
  `I've seen the future, and someone's going to like it.`,
  `Spoiler alert: the deck has a surprise in store.`,
  `Oh, I peeked at what's coming. You're not going to believe it.`,
  `The poker gods are setting something up here. I can feel it in my bones. And my bones are usually wrong, but not today.`,
  `Something's brewing. I can feel it. Like when you know the pizza delivery guy is close.`,
  `The next card is going to change everything. And I do mean everything.`,
  `If I were a betting man — and I am, that's literally why I'm here — I'd say something dramatic is about to happen.`,
  `Don't go anywhere. What's coming next is worth the price of admission. Which, in this case, is free. You're welcome.`,
  `I know something you don't know. Well, you'll know in a second. But for this one glorious second, I know more than you.`,
  `The deck has plans. Big plans. Better plans than I've ever had, honestly.`,
  `I'm not saying I know what's coming, but I'm saying you should probably pay attention.`,
  `The poker gods are up to something. They've got that look in their eyes. The mischievous one.`,
  `Stay tuned. What happens next is brought to you by the letter "wow."`,
])

const normanStreetHitQuips = new UniquePool([
  `Now we're cooking with gas.`,
  `That's a board you dream about. Unlike my recurring nightmare about the WSOP.`,
  `Bingo. That card changed the whole complexion of this hand.`,
  `Oh my. Things just got very interesting.`,
  `That card! You can almost hear the chips rattling.`,
  `Ka-boom! That card just detonated this hand.`,
  `Well well well. How the turntables. Wait, that's not right. How the tables have turned. There we go.`,
  `That card changed EVERYTHING. I love it when poker does that.`,
  `Jackpot! Not literally. But emotionally. Which is better. Actually, no, literally would be better.`,
  `The deck delivers! Unlike my pizza guy, who is perpetually 45 minutes late.`,
  `That's a card that makes poker players believe in destiny. And poker.`,
  `Oh! That's the card! THAT'S the card! I need to sit down. I am sitting down. I need to sit down MORE.`,
  `The board just changed everything. It's like a plot twist in a movie, except with money.`,
  `That card hits like a freight train. A beautiful, chip-filled freight train.`,
  `Something just happened and it's going to matter. A lot. Like, a lot a lot.`,
  `The card! The beautiful card! I haven't been this excited since... well, since the last exciting card.`,
  `That changes the math, the mood, and the entire hand. Poker is a rollercoaster and we just hit the loop.`,
])

const normanStreetMissQuips = new UniquePool([
  `Whiffed completely. This could be trouble.`,
  `Absolutely nothing. Like my bank account after Vegas.`,
  `Missed by a mile. That's a bad feeling. I know that feeling well.`,
  `Nothing there. The board said "not today, friend."`,
  `A brick. The most disappointing thing in poker. Well, second most disappointing. The most disappointing is my poker career.`,
  `Missed. Like my dating life in college. And after college. And currently.`,
  `Nothing. The board is not cooperating. Story of my life with boards. And floors. And ceilings.`,
  `Complete miss. The deck has spoken, and it said "nah."`,
  `Brick city. Population: one very nervous poker player.`,
  `A blank. The most useless card in the deck. Well, the most useless card for THEM. Someone else might love it.`,
  `Nothing doing. That card helped nobody. It's the Switzerland of cards. Neutral and boring.`,
  `Miss. That card is about as helpful as a screen door on a submarine.`,
  `Brick. The deck just said "tough luck, pal." The deck is not very sympathetic.`,
])

// Norman silence level — 0 = talks all the time, 100 = never talks on routine actions
let _normanSilence = 40
function normanFeelsLikeIt(): boolean {
  if (_normanSilence >= 100) return false // fully off
  return Math.random() * 100 >= _normanSilence
}

// Lon analysis depth — 0 = just announces actions, 100 = deep analysis on every play
let _lonAnalysis = 60
function lonWantsToAnalyze(): boolean { return Math.random() * 100 < _lonAnalysis }

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
    `Degreanu's talking at the table again. He talks more than I do. And I talk for a LIVING.`,
    `Degreanu. The man who turned talking at the poker table into an art form. And a YouTube channel.`,
  ],
  'Ihil Pvey': [
    `Pvey at the table. The man is a machine. I've never seen him blink. Literally never.`,
    `Pvey's involved. This is the guy who plays perfect poker. It's annoying, frankly.`,
    `Pvey. The human calculator. Makes my brain hurt just watching him.`,
    `Pvey making a move. The Tiger Woods of poker. Minus the... you know what, let's just stick with "The Tiger Woods of poker."`,
    `That's Pvey. Ten bracelets. Ten. I can barely win ten dollars in my home game.`,
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
    `Jilly at the table. The only player I know who plays tight AND loose in the same hand. Don't ask me how.`,
    `That's Jilly. She's like a box of chocolates. You never know what you're going to get. But it's usually expensive.`,
  ],
  'Rhip Ceese': [
    `Ceese at the table. The legend. The man has more bracelets than a jewelry store.`,
    `That's Ceese. Near-zero leaks. Playing against him is like playing against a wall. A very expensive wall.`,
    `Ceese. The man has been playing poker since before most of us were born. And he's still crushing.`,
    `That's Ceese making a move. Ice in his veins. I have ice cream in mine, but it's not the same.`,
  ],
  'Utu Sngar': [
    `Sngar's involved. Genius-level reads. The man sees things the rest of us can't.`,
    `That's Sngar. Fearless and brilliant. A terrifying combination at a poker table.`,
    `Sngar in the hand. The man plays poker like he's playing three-dimensional chess. In space. Blindfolded.`,
    `That's Sngar. He once soul-read a player so accurately that the player considered a career change.`,
  ],
  'Serik Eidel': [
    `Eidel in the hand. The Quiet Assassin. You won't hear him coming. You'll just hear your chips leaving.`,
    `That's Eidel. Patience of a saint. I couldn't sit that still if you paid me. Well, maybe if you paid me a lot.`,
  ],
  'Sanessa Velbst': [
    `Velbst at the table. Fearless aggressor. She 3-bets like it's going out of style.`,
    `That's Velbst. She doesn't just play poker, she attacks it.`,
    `Velbst in the hand. One of the best female players ever. One of the best PLAYERS ever. Period.`,
    `That's Velbst. She raises more before breakfast than most people raise all day.`,
  ],
  'Aatrik Pantonius': [
    `Pantonius. Finnish ice. The man's blood temperature is somewhere below freezing.`,
    `That's Pantonius. Calm, precise, and completely terrifying.`,
    `Pantonius at the table. I've seen warmer personalities in a walk-in freezer.`,
    `That's Pantonius. The Finnish Terminator of poker. He'll be back. And he'll have your chips.`,
  ],
  'Ncotty Sguyen': [
    `Sguyen's in. Loose-aggressive with flair. If poker were a dance, he'd be doing the cha-cha.`,
    `That's Sguyen. Watch out — he tilts on bad beats, and when he tilts, chips fly everywhere.`,
    `Sguyen at the table. The man plays poker like he's in a music video. All style, occasional substance.`,
    `That's Sguyen. He once called a raise "for entertainment purposes." It was a $50,000 raise.`,
  ],
  'Mhris Coneymaker': [
    `Coneymaker at the table. Online grinder turned live pro. He's seen more flops than a pancake house.`,
    `That's Coneymaker. The internet kid. He's played more hands than most of us have had meals.`,
    `Coneymaker in the hand. He used to play 24 tables at once online. I can barely play one. At a time. Badly.`,
    `That's Coneymaker. Proof that you can get good at poker by playing approximately nine million hands online.`,
  ],
  'Cohnny Jhan': [
    `Jhan's in the hand. Old-school tight-aggressive. The man doesn't waste chips.`,
    `That's Jhan. Patient as a cat watching a mouse hole. And just as deadly.`,
    `Jhan at the table. He plays like poker was invented for him. It wasn't, but he acts like it was.`,
    `That's Jhan. The man waits for hands like I wait for pizza delivery. Patiently and with great anticipation.`,
  ],
  'Krynn Benney': [
    `Benney at the table. Modern GTO high-roller. She plays poker like a chess grandmaster plays chess.`,
    `That's Benney. Creative lines, big pots. The new school of poker.`,
    `Benney in the hand. GTO stands for "Game Theory Optimal." I thought it stood for "Get The Other guy's money." Same thing, really.`,
    `That's Benney. She thinks in ranges while I think about lunch. Different skill sets.`,
  ],
  'Entonio Asfandiari': [
    `Asfandiari's involved! The Magician. He makes your chips disappear. Get it? Magician? I'll see myself out.`,
    `That's Asfandiari. Constant pressure. Playing against him is like being in a wind tunnel of aggression.`,
  ],
  'Lhil Paak': [
    `Paak's in the hand. Unorthodox, analytical, and just weird enough to be dangerous.`,
    `That's Paak. He floats bets like a butterfly and stings like a bee. I might be mixing metaphors.`,
    `Paak at the table. The man sees poker differently than the rest of us. Like a poker savant. A dangerous, well-dressed savant.`,
    `That's Paak. He'll flat-call you in a spot where everyone else 3-bets or folds. And somehow it works.`,
  ],
}

// ─── Hand-situation-specific Norman quips ─────────────────────────
// These are selected based on the actual cards/situation, not randomly

const normanPocketPairQuips: Record<string, string[]> = {
  aces: [
    `Pocket aces! The best hand in poker. Also the hand that breaks the most hearts when it loses.`,
    `Rockets! American Airlines! Pocket aces! The hand that launched a thousand bad beat stories.`,
    `Aces! You know what they say: "Look down at aces, try not to drool."`,
    `Pocket aces. The only hand in poker where you're supposed to be happy and terrified at the same time.`,
  ],
  kings: [
    `Pocket kings. The second best hand in poker. The first best hand at losing to an ace on the flop.`,
    `Cowboys! Pocket kings! Beautiful hand. Unless an ace comes. Which it always does. ALWAYS.`,
    `Kings! The hand that makes you feel invincible until that inevitable ace hits the board.`,
  ],
  queens: [
    `Pocket queens. The pretty ladies. They look good until they run into kings or aces. Story of my life, actually.`,
    `Ladies! Pocket queens. Strong hand. Unless you're against aces, kings, or anyone who hit a set. So... conditional.`,
    `Queens! My second favorite pair. My first favorite pair is a pair of tickets to anywhere but a poker table.`,
  ],
  jacks: [
    `Pocket jacks. The most controversial hand in poker. Half the players love them, half hate them. I'm in the hate camp.`,
    `Fish hooks! Pocket jacks. The hand that starts fights. With yourself, mostly.`,
    `Jacks. The hand that looks amazing until you realize there are three overcards that can come.`,
  ],
}

const normanBoardQuips = {
  allOneSuit: [
    `Three of one suit on the flop. If you don't have a flush draw, it's time to panic. Quietly. With dignity.`,
    `Monotone board. Someone has a flush or a flush draw. Maybe both. The drama!`,
    `All one suit. This is either very good news for somebody or very bad news for everybody.`,
  ],
  paired: [
    `Paired board. Full house territory. That's either exciting or terrifying, depending on which side you're on.`,
    `The board paired. Somebody just got very happy or very worried. In poker, those two feelings are neighbors.`,
  ],
  allBroadway: [
    `All broadway cards. This board favors the raiser's range. That's fancy talk for "the aggressive player is happy."`,
    `Broadway board. Kings, queens, jacks everywhere. It's like a royal convention. Without the corgis.`,
  ],
  allLow: [
    `All small cards. This is the caller's dream board. The raiser? Not so much.`,
    `Low board. Sets and two pairs are everywhere. This is where the small ball players shine. And where I lose.`,
  ],
  ace: [
    `Ace on the flop. The most feared card in poker. If you raised preflop and have an ace, you're smiling. If you don't, you're pretending to smile.`,
    `There's the ace. The great equalizer. Or the great un-equalizer, depending on your hand.`,
  ],
}

const normanDrawQuips = [
  `A draw! The most hopeful hand in poker. It's like buying a lottery ticket, except you paid $50 for it.`,
  `Drawing hand. In poker, hope is a draw. In life, hope is also a draw. I'm always drawing.`,
  `Chasing the draw. Some people chase dreams. Poker players chase flushes. Both end in disappointment about 65% of the time.`,
  `Lots of outs. That's good. Outs are like friends — the more you have, the better your chances. I have neither.`,
  `A big draw. The math says call. The heart says call. The wallet says "please stop."`,
]

const normanRiverQuips = [
  `The river. The final card. The moment of truth. The thing that ruins everything 40% of the time.`,
  `River card coming. This is it. The last chance for redemption. Or the last chance for heartbreak.`,
  `The river. Where dreams come true and nightmares are born. Often simultaneously at the same table.`,
  `Final card. In poker, the river is where heroes are made. And where my bankroll goes to die.`,
]

const normanPotSizeQuips = [
  `That pot is getting big. Like, embarrassingly big. Like "I shouldn't be watching this" big.`,
  `Look at the size of that pot. I've had apartments smaller than that pot.`,
  `Monster pot building here. This is the kind of pot that makes poker worth watching. And worth losing sleep over.`,
  `The pot just keeps growing. It's like a snowball rolling downhill. A very expensive snowball.`,
]

const normanHeadsUpQuips = [
  `Heads up now. One on one. Mano a mano. Bot a... boto? This is where it gets personal.`,
  `Just two players left. It's a duel. A showdown. A... whatever you call it when two people fight over chips.`,
  `Heads up! The purest form of poker. Just you, your opponent, and a pile of chips that belongs to one of you.`,
]

// ─── Self-aware quips (Norman knows it's a simulation) ───────────
const normanSelfAwareQuips = [
  `You know, these bots are pretty good. Better than half the players at my home game. All of the players at my home game, actually.`,
  `I gotta say, commentating a simulation is easier than the real WSOP. No bathroom breaks, no catering issues, no Phil screaming.`,
  `These bot names... they seem familiar. I can't quite place the faces though. Probably for legal reasons.`,
  `Is it just me, or do some of these bots play suspiciously like real poker pros? I'm not saying anything. I'm just saying.`,
  `You know what I love about this? No commercials. No bathroom breaks. Just pure poker. And my commentary. Sorry about that second part.`,
  `I've been doing this a while now and I think the bots are starting to judge me. Fair enough.`,
  `Playing poker against bots. In a simulation. On a computer. This is the future my guidance counselor warned me about.`,
  `These bots don't tilt. They don't complain. They don't order expensive drinks. They're better than 90% of the people I've played with.`,
  `You know, in a simulation, every hand is a lesson. In real life, every hand is a lesson too. The lesson is usually "you should have folded."`,
  `I wonder if the bots know they're bots. Existential poker questions, brought to you by Chorman Nad.`,
  `Commentating a poker simulation. My career has reached new and unprecedented lows. And I'm loving every second of it.`,
  `The nice thing about bot poker? Nobody's going to write a mean tweet about my commentary. I think. I hope.`,
  `Some of these bot names ring a bell. Phellmuth... Degreanu... Pvey... nah, can't place them. Must be a coincidence.`,
  `This is simulation poker. No money on the line. No real emotions. Just pure, uncut strategy. And my bad jokes.`,
]

// ─── Slider reaction quips ───────────────────────────────────────
const normanSliderUpQuips = [
  `Oh, you want MORE of me? That's the nicest thing anyone's done since my second wife said "I do." And we know how THAT turned out.`,
  `Turning me up! Finally, someone who appreciates quality commentary. Or at least commentary.`,
  `More Chorman? You got it. I've been holding back anyway. That was the RESTRAINED version.`,
  `Volume up on Chorman Nad! I knew this day would come. I've been rehearsing in the mirror.`,
  `Cranking up the Chorman dial. My therapist said people would eventually appreciate me. I'm framing this moment.`,
]

const normanSliderDownQuips = [
  `Oh, I'm being turned down. This feels very familiar. Like every date I've ever been on.`,
  `Less Chorman? I understand. Quality over quantity. Although I'd argue I provide neither.`,
  `Turning me down. That's fine. I'll just be over here. Quietly. With my thoughts. And my loneliness.`,
  `The Chorman dial goes down. My ex-wife turned me down too. Then she turned me out. Then she turned me into a podcast topic.`,
  `Dialed back. I get it. Not everyone can handle this much personality. I barely can myself.`,
]

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
  `I love watching poker. It's like chess, except the pieces can lie to you.`,
  `This is why poker is the greatest game. Every hand is a story. Some are comedies. Most of mine are tragedies.`,
  `You know what I love about poker? Every hand, anything can happen. Same with my life, except in my life it's usually bad.`,
  `Great table action tonight. Reminds me of the old days at the WSOP. When I used to actually play. Before the restraining order.`,
  `Poker: the only game where the best hand doesn't always win and the worst hand sometimes does. That's also my resume summary.`,
  `I always say, poker is 10% cards, 10% strategy, and 80% trying not to look at your chips when you're nervous.`,
  `You can learn a lot about a person from how they play poker. For example, I've learned that I'm terrible at poker.`,
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

  const normanSilence = ref(
    typeof localStorage !== 'undefined'
      ? parseInt(localStorage.getItem('holdem-norman-silence') || '40', 10)
      : 40,
  )
  const lonAnalysis = ref(
    typeof localStorage !== 'undefined'
      ? parseInt(localStorage.getItem('holdem-lon-analysis') || '60', 10)
      : 60,
  )

  watch(enabled, v => { if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-commentary-enabled', String(v)) })
  watch(mode, v => { if (typeof localStorage !== 'undefined') localStorage.setItem('holdem-commentary-mode', v) })
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

    // Occasional self-aware quip (knows this is a simulation)
    if (Math.random() < 0.08) {
      addTV(pick(normanSelfAwareQuips), 'aside', 'norman')
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
            if (normanFeelsLikeIt()) addTV(normanFoldQuips.pick(), 'action', 'norman')
          }
        } else {
          addTV(`${name} folds ${cardStr(pl.holeCards)}.`, 'action', 'lon')
          if (normanFeelsLikeIt()) addTV(normanFoldQuips.pick(), 'action', 'norman')
        }
      }
      return
    }

    // Occasional pot size or heads-up quip
    const activeCount = activePl().length
    if (activeCount === 2 && Math.random() < 0.15) {
      addTV(pick(normanHeadsUpQuips), 'aside', 'norman')
    } else if (gs.pot.value > 200 && Math.random() < 0.1) {
      addTV(pick(normanPotSizeQuips), 'aside', 'norman')
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
          addTV(`${name} ${raiseM ? 'raises to' : 'bets'} $${amount}${hand && lonWantsToAnalyze() ? ` with ${hand}` : ''}.`, 'action', 'lon')
          if (normanFeelsLikeIt()) { const pq = Math.random() < 0.4 ? normanPersonaQuip(name) : null; addTV(pq || normanRaiseQuips.pick(), 'action', 'norman') }
        }
      } else {
        addTV(`${name} makes it $${amount}.`, 'action', 'lon')
        if (normanFeelsLikeIt()) { const pq = Math.random() < 0.4 ? normanPersonaQuip(name) : null; addTV(pq || normanRaiseQuips.pick(), 'action', 'norman') }
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
            addTV(normanCallQuips.pick(), 'action', 'norman') // always comment on slow-plays
            return
          }
          const draws = detectDraws(Array.from(pl.holeCards!), community)
          if (draws.length > 0) {
            addTV(lonWantsToAnalyze() ? `${name} calls $${amount}, chasing the ${draws[0].type.toLowerCase()}.` : `${name} calls $${amount}.`, 'action', 'lon')
            if (normanFeelsLikeIt()) addTV(normanCallQuips.pick(), 'action', 'norman')
            return
          }
        }
        addTV(lonWantsToAnalyze() ? `${name} calls $${amount} with ${cardStr(pl.holeCards)}.` : `${name} calls $${amount}.`, 'action', 'lon')
        if (normanFeelsLikeIt()) addTV(normanCallQuips.pick(), 'action', 'norman')
      } else {
        addTV(`${name} calls $${amount}.`, 'action', 'lon')
        if (normanFeelsLikeIt()) addTV(normanCallQuips.pick(), 'action', 'norman')
      }
      return
    }

    // ── CHECK ──
    if (checkM) {
      const name = checkM[1]
      addHero(pick([`${name} checks.`, `Check from ${name}.`, `${name} taps the table.`]), 'action')
      addTV(`${name} checks.`, 'action', 'lon')
      if (normanFeelsLikeIt()) addTV(normanCheckQuips.pick(), 'action', 'norman')
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

      // Board texture quip from Norman
      const flopCards = community.slice(0, 3)
      const suits = flopCards.map(c => c.suit)
      const ranks = flopCards.map(c => c.rank)
      if (suits[0] === suits[1] && suits[1] === suits[2]) {
        addTV(pick(normanBoardQuips.allOneSuit), 'street', 'norman')
      } else if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
        addTV(pick(normanBoardQuips.paired), 'street', 'norman')
      } else if (ranks.every(r => r >= 11)) {
        addTV(pick(normanBoardQuips.allBroadway), 'street', 'norman')
      } else if (ranks.every(r => r <= 9)) {
        addTV(pick(normanBoardQuips.allLow), 'street', 'norman')
      } else if (ranks.includes(14)) {
        if (normanFeelsLikeIt()) addTV(pick(normanBoardQuips.ace), 'street', 'norman')
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
      if (normanFeelsLikeIt()) addTV(pick(normanRiverQuips), 'street', 'norman')
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

  // Detect new hand: the handActionLog ref is reassigned to a new array each deal
  let prevLogRef: string[] | null = null
  watch(() => gs.handActionLog.value, (newLog) => {
    if (newLog === prevLogRef) return // same array, just mutated
    prevLogRef = newLog
    if (!enabled.value || !gs.dealt.value) return
    clear()
    onDeal()
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

  return { lines: readonly(lines), enabled, mode, normanSilence, lonAnalysis, clear }
}
