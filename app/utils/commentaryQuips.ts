/**
 * Commentary quip pools — all static text pools for the TV Broadcast
 * commentary system. Extracted from useCommentary.ts for maintainability.
 */

// ─── No-repeat picker ────────────────────────────────────────────
export class UniquePool<T> {
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

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Mon LeEachern analytical observations ──────────────────────
// Serious, game-aware phrases about board texture, player tendencies,
// pot dynamics, and strategic situations. Used when lonWantsToAnalyze().

export const lonBoardAnalysis = new UniquePool([
  `Dry board here. This favors the preflop aggressor — fewer draws to worry about.`,
  `Very wet texture. Flush draws and straight draws are everywhere on this board.`,
  `The board has paired. That changes the math significantly — full house draws are now live.`,
  `Ace-high board. The preflop raiser has a significant range advantage here.`,
  `Low, connected board. This is where the caller's range connects — small pairs, suited connectors.`,
  `Monotone flop. Anyone without a card of that suit is in trouble.`,
  `Broadway-heavy board. Premium hands love this texture.`,
  `Rainbow and disconnected. About as safe a board as you'll see in poker.`,
  `Three to a straight on the board. Position is critical on boards like this.`,
  `Two-tone flop. The turn card in that suit will change everything.`,
  `High pair on the board. Anyone who hit trips is in a very strong position.`,
  `The board has four to a flush now. If you don't have it, you have to wonder who does.`,
  `Interesting texture — this board hits a lot of calling ranges but misses most raising ranges.`,
  `Very coordinated board. There are so many possible hands here — sets, straights, two pairs, draws.`,
  `This is a board where position matters enormously. Acting last is a huge advantage.`,
  `Four to a straight on the board. Anyone with one card filling the gap has the nuts.`,
  `The board just double-paired. Full houses and quads are now in play.`,
  `This is one of those boards where the preflop caller actually has the advantage. Sets and two pairs live in their range.`,
  `A very static board. What you have now is probably what you'll have at the river.`,
  `Dynamic texture. Every turn and river card could dramatically shift who's ahead.`,
  `Three broadways and a flush draw. Top pair might not be good enough here.`,
  `Low, uncoordinated board. Overpairs are king here.`,
  `The turn brought a card that helps nobody's range. A blank like this often triggers a continuation bet.`,
  `Four cards to a flush on the board now. Anyone without the ace of that suit has to be nervous.`,
  `Paired board with a flush draw. The texture just got very complex.`,
  `No card above a nine. This strongly favors anyone who called preflop with small connectors or pocket pairs.`,
  `This board hits both ranges fairly evenly. It's going to come down to who reads the other player better.`,
  `Notice how the board developed — the early streets were safe, but it got dangerous in a hurry.`,
])

export const lonPlayerReads = new UniquePool([
  `This player has been very active this session. Wider range than usual.`,
  `A tight player making a move here. When they bet, they usually have it.`,
  `Watch the aggression level here. This player has been raising a lot — could be on a run or could be bluffing.`,
  `This is a player who rarely bluffs. A bet here deserves serious respect.`,
  `Loose player in the pot. Their range is wide, so top pair is often good enough.`,
  `This player's VPIP is running high today. They're seeing a lot of flops.`,
  `Classic tight-aggressive play. Small range, big bets when they enter.`,
  `The calling station is in the hand. Bluffing them is usually a mistake.`,
  `Aggressive player with a big stack. They can put maximum pressure on everyone.`,
  `Short-stacked player. They're in push-or-fold territory.`,
  `This player has been card-dead. When they finally play a hand, pay attention.`,
  `Two aggressive players in the same pot. Expect fireworks.`,
  `A player who's been quiet all session just woke up. That's usually a sign of a real hand.`,
  `This player has been caught bluffing twice already. Their credibility is low — expect wider calls.`,
  `Notice the timing. Quick decisions usually mean a clear situation — either a monster or nothing.`,
  `The preflop raiser is out of position. That's a structural disadvantage no matter how good your cards are.`,
  `This player has shown down strong hands every time. Their bets deserve maximum respect.`,
  `The short stack is putting pressure on the big stack. The big stack has more to lose.`,
  `A player on a heater. When someone's running hot, others tend to play cautiously against them.`,
  `Two tight players in the same pot. When both commit chips, someone usually has a genuine hand.`,
  `The big blind is defending wide tonight. Good poker — you can't let people steal your blinds for free.`,
  `Watch the stack sizes here. The effective stack determines how deep this hand can go.`,
])

export const lonPotAnalysis = new UniquePool([
  `Pot is getting significant. The decisions from here matter for the entire session.`,
  `Small pot so far. Both players are playing cautiously — waiting for the right moment.`,
  `The pot odds are favorable for a draw here. Mathematics supports a call.`,
  `Pot-committed now. With this much invested, folding is rarely correct.`,
  `SPR is low. This is going to be a bet-and-commit situation.`,
  `Deep stacks relative to the pot. Plenty of room to maneuver on later streets.`,
  `The pot has been building since preflop. Someone built this deliberately.`,
  `Multiway pot. Everyone needs to be cautious — someone usually has something in multiway action.`,
  `Heads-up pot. This is where reading your opponent matters most.`,
  `The bet-to-pot ratio is large. This is a polarizing bet — very strong or a bluff.`,
  `The pot is now large enough that folding becomes very expensive in terms of equity surrendered.`,
  `A small continuation bet into a large pot. That's either a trap or a probe — buying information cheaply.`,
  `The risk-to-reward ratio here favors aggression. A bet could take down a significant pot.`,
  `Both players have invested heavily. At this point, whoever blinks first probably loses.`,
  `The pot odds are offering almost 3-to-1. You can call here profitably with a wide range.`,
  `A pot-sized bet narrows the opponent's continuing range dramatically. Only strong hands and draws survive.`,
  `Side pots forming. With multiple all-ins, the math gets complicated quickly.`,
  `The bet-to-stack ratio is critical. A call commits nearly half the remaining stack.`,
  `A blocker bet — a small bet designed to prevent a larger one. Classic defensive play.`,
  `With this much money in the middle, position becomes even more valuable. Information is power.`,
])

export const lonTiltReads = new UniquePool([
  `This player has been losing consistently. Watch for tilt — wider calls, bigger bluffs.`,
  `After that bad beat, we could see some emotional play here. Tilt is a real factor.`,
  `Multiple rebuys for this player. The frustration could be affecting their decisions.`,
  `This player just lost a big pot. The next few hands will tell us if they can reset mentally.`,
  `Running cold. When players haven't won in a while, they sometimes force the action.`,
  `That was a rough beat. Even the best players struggle to stay composed after that.`,
  `The tilt factor is real here. This player has been on the wrong end of variance all session.`,
  `After a loss like that, some players tighten up and some players go wild. Let's see which one.`,
  `The body language tells the story. Frustration is creeping in after that last hand.`,
  `Three losses in a row. The question is whether this player can reset or if we see emotional play.`,
  `That was a textbook bad beat. Even experienced players struggle to stay level after losing like that.`,
  `Notice the bet sizing has changed. Larger bets often signal frustration, not strength.`,
  `A composed player would slow down here. Let's see if discipline holds.`,
  `The smart play is to tighten up. The emotional play is to loosen up. Guess which one we usually see.`,
  `The variance has been brutal this session. Even the best players have a breaking point.`,
  `Winning a small pot after several losses can actually calm a player down. A psychological reset.`,
  `The most dangerous opponent is the one who's losing but stays calm. They're still making good decisions.`,
  `This player is betting more aggressively since the bad beat. Classic tilt pattern — trying to win it all back at once.`,
])

export const lonStreetTransition = new UniquePool([
  `Key card coming. The flop is where hands are made — and broken.`,
  `Turn card now. This is where the second barrel decision matters most.`,
  `River card. Everything comes down to this — no more draws, no more hope. Just made hands.`,
  `This is the street where the real money gets committed. Pay attention.`,
  `The board is developing. Each card narrows the possibilities.`,
  `We're seeing a lot of action on this street. Someone is confident.`,
  `Quiet so far. Both players are gathering information before committing chips.`,
  `The check-raise is always a possibility here. Especially on this texture.`,
  `A bet here would represent serious strength. Let's see if anyone steps up.`,
  `The river is where professionals separate themselves from amateurs. The pressure is different.`,
  `The flop is where the hand takes shape. Everything before this was just a prelude.`,
  `A new street means new information. The best players process it instantly.`,
  `The betting pattern across streets tells a story. Bet-bet-bet is aggression. Bet-check-bet is something more nuanced.`,
  `Here comes the turn. Statistically, this is where the most money is won and lost.`,
  `A check on this street changes the dynamic for every remaining street.`,
  `The pot has been growing steadily. Each street adds another layer of commitment.`,
  `We're entering the business district of this hand. The real money decisions happen here.`,
  `Triple-barrel territory. If they bet the flop and the turn, will they fire the river? That's the key question.`,
  `The action has been cautious so far. That could change with one card.`,
  `Notice the line taken — checking one street to bet the next. That's either a trap or a change of heart.`,
])

export const lonShowdownAnalysis = new UniquePool([
  `Let's see what everyone was playing with. The cards don't lie.`,
  `Time for the truth. All the betting tells us a story — now we see if it was fiction.`,
  `Showdown. This is where all the strategy comes together — or falls apart.`,
  `The cards are about to be revealed. Did the right hand win? Let's find out.`,
  `Moment of truth. Every bet, every raise, every call led to this.`,
  `Showdown time. The best five-card hand wins. No more bluffing, no more position.`,
  `And there it is. The stronger hand takes the pot. That's the beauty and the cruelty of poker.`,
  `An interesting runout. The best hand preflop isn't always the best hand at showdown.`,
  `Both players played this hand well. Sometimes there's no mistake — just bad luck.`,
  `The winner extracted maximum value. Textbook — get paid off on every street.`,
  `A disciplined hand from both players. Good calls, good bets, good poker all around.`,
  `That was a thin value bet on the river that got called. High-level play from both sides.`,
  `The losing player made the right call with the information available. Results don't change that.`,
  `Every decision point had a reasonable argument on both sides. That's what makes poker fascinating.`,
  `The showdown reveals the story. And this one was a page-turner.`,
  `One player read the other perfectly. That's the human element no algorithm can fully replicate.`,
  `A classic confrontation. Big hand versus big hand. Someone had to lose.`,
])

export function resetLonPools() {
  lonBoardAnalysis.reset(); lonPlayerReads.reset(); lonPotAnalysis.reset()
  lonTiltReads.reset(); lonStreetTransition.reset(); lonShowdownAnalysis.reset()
}

// ─── Fold quips ──────────────────────────────────────────────────

export const normanFoldQuips = new UniquePool([
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
  `Fold. In Spanish, that's "fold." I took four years of Spanish and that's all I remember.`,
])

export const normanBigFoldQuips = new UniquePool([
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

export const normanBluffQuips = new UniquePool([
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

export const normanRaiseQuips = new UniquePool([
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

export const normanCallQuips = new UniquePool([
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

export const normanCheckQuips = new UniquePool([
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

export const normanAllinQuips = new UniquePool([
  `Somebody's about to be very happy or very sad. Just like prom night.`,
  `All the chips in the middle. This is poker, baby.`,
  `The big move! Hold on to your seats. And your wallets.`,
  `All-in! The most exciting two words in poker. The least exciting two words? "Nice fold."`,
  `Everything in the middle. That's either confidence or desperation. In poker, it's hard to tell the difference.`,
  `All-in! My heart rate just went up. And I'm a commentator.`,
  `Shove! That's the kind of move that makes or breaks a tournament. And a spirit.`,
  `All the marbles! I haven't been this excited since I found a twenty in my coat pocket.`,
  `All-in! That's the poker equivalent of "hold my beer and watch this."`,
  `Shove! All of it! Everything! My palms are sweating and I don't even have money in this.`,
  `All-in. The moment of truth. The point of no return. The... I'm running out of clichés.`,
  `They've pushed it all in. Somewhere, a poker coaching video just wrote itself.`,
  `ALL-IN! Buckle up, buttercup. Things are about to get real.`,
  `Everything in the middle. That pot is bigger than my car payment. Both of them.`,
  `All-in! That's the nuclear option. The poker equivalent of flipping the table, except you're technically still playing.`,
  `Shove! All of it! Everything! I need a moment.`,
  `All-in. The two most beautiful and terrifying words in the English language. Right after "audit notice."`,
  `They've pushed it all in. This is the moment we've been waiting for. Well, I've been waiting for lunch, but this is good too.`,
])

export const normanAllinJunkQuips = new UniquePool([
  `ALL-IN with THAT?! I've made better decisions at 3 AM at a Waffle House.`,
  `That's either genius or insanity. Going with insanity.`,
  `Shoved with garbage. My kind of player. Reminds me of myself, actually.`,
  `All-in with nothing. That's not poker, that's a cry for help.`,
  `They just shoved with junk. The poker gods are going to have something to say about this.`,
  `Going all-in with that hand is like bringing a pool noodle to a sword fight.`,
  `ALL-IN with that?! That hand couldn't beat a ham sandwich. And the sandwich has mayo.`,
  `Shoving with garbage. Somewhere, a poker textbook just burst into flames.`,
  `All-in with that hand. That's not courage, that's a Wikipedia article about bad decisions.`,
  `ALL-IN with nothing. My ex-wife had more substance. And that's saying something.`,
  `ALL-IN with THAT?! That hand couldn't beat a ham sandwich. And the sandwich isn't even playing.`,
  `Shoved with rags. I've seen better hands on a clock.`,
  `All-in with garbage. You know what, I kind of respect it. It's wrong, but I respect it.`,
  `That's the kind of all-in that makes your grandmother weep. And she doesn't even play poker.`,
  `Shoving with that hand is like skydiving without a parachute. Thrilling for about three seconds.`,
  `ALL-IN with junk. In their defense, it IS fun to say "all-in." It's less fun to lose.`,
])

export const normanShowdownWinQuips = new UniquePool([
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
  `Hero with the win! If poker were easy, everyone would do it. It's not easy. Hero just made it look easy.`,
  `Cha-ching! Hero cashes in. That sound? That's the sound of chips moving in the right direction.`,
  `Hero with the win! If poker were easy, everyone would do it. It's not easy. Hero just made it look easy.`,
  `Hero wins! I'd high-five Hero but I'm in a commentary booth and also I'm awkward.`,
])

export const normanShowdownLoseQuips = new UniquePool([
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

export const normanCoolerQuips = new UniquePool([
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

export const normanForeshadowQuips = new UniquePool([
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

export const normanStreetHitQuips = new UniquePool([
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

export const normanStreetMissQuips = new UniquePool([
  `Whiffed completely. This could be trouble.`,
  `Absolutely nothing. Like my bank account after Vegas.`,
  `Missed by a mile. That's a bad feeling. I know that feeling well.`,
  `Nothing there. The board said "not today, friend."`,
  `A brick. The most disappointing thing in poker. Well, second most disappointing. The most disappointing is my poker career.`,
  `Missed. Like my dating life in college. And after college. And currently.`,
  `Nothing. The board is not cooperating. Story of my life with boards. And floors. And ceilings.`,
  `Complete miss. The deck just said "tough luck, pal." The deck is not very sympathetic.`,
  `Brick city. Population: one very nervous poker player.`,
  `A blank. The most useless card in the deck. Well, the most useless card for THEM. Someone else might love it.`,
  `Nothing doing. That card helped nobody. It's the Switzerland of cards. Neutral and boring.`,
  `Miss. That card is about as helpful as a screen door on a submarine.`,
  `Brick. The deck just said "tough luck, pal." The deck is not very sympathetic.`,
])

export const normanGenericQuips = new UniquePool([
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
  `Someone once asked me if poker is a sport. I said it's the only sport where you can eat nachos while competing.`,
])

export const normanRandomBanter = new UniquePool([
  `You know what the difference between poker and life is? In poker, the bad beats only last one hand.`,
  `I was thinking about my ex-wife during that last hand. Not because of the cards. Just because I always think about my ex-wife.`,
  `Someone once asked me if poker is a sport. I said it's the only sport where you can eat nachos while competing.`,
  `My poker philosophy: play tight, be patient, and always tip the dealer. I follow one of those consistently.`,
  `Fun fact: the odds of getting dealt pocket aces are about 1 in 221. The odds of me playing them correctly? Much lower.`,
  `I love the sound of chips shuffling. It's the sound of money being indecisive. Like me at a restaurant.`,
  `They say poker is a game of incomplete information. My entire life is incomplete information.`,
  `Poker tip from Chorman Nad: never play poker with a guy named after a city. Vegas Dave. Atlantic City Mike. Cleveland Steve. Actually, Cleveland Steve is fine.`,
  `I've been commentating poker for years and I still get nervous when there's an all-in. In a simulation. Against bots. I need help.`,
  `You know what separates a good poker player from a great one? About $10 million. And better cards. And better decisions. So... everything.`,
  `People ask me, "Chorman, what's your secret to poker success?" I say, "I commentate. I don't play. That IS the secret."`,
  `The beauty of poker is that anyone can win any hand. The tragedy of poker is that I never do.`,
  `Someone once told me that poker is 90% mental and 10% cards. I'm 0% mental and 100% confused, so the math checks out.`,
  `This is good poker. Clean. Professional. Nothing like my home game, which usually ends with someone owing someone else a lawn mower.`,
])

// ─── Board texture quips ─────────────────────────────────────────

export const normanBoardQuips = {
  allOneSuit: [
    `Three of one suit on the flop. If you don't have a flush draw, it's time to panic. Quietly. With dignity.`,
    `Monotone board. Someone has a flush or a flush draw. Maybe both. The drama!`,
    `All one suit. This is either very good news for somebody or very bad news for everybody.`,
    `Three hearts. Or diamonds. Or whatever. Point is, somebody's drawing to a flush and somebody else is terrified.`,
    `Monotone flop. This board just narrowed everybody's range to "do I have a flush draw or not?"`,
    `All one suit. The board is wearing a matching outfit. Very coordinated. Very dangerous.`,
    `Three of the same suit. In poker, that's called "danger." In fashion, it's called "a bold choice."`,
  ],
  paired: [
    `Paired board. Full house territory. That's either exciting or terrifying, depending on which side you're on.`,
    `The board paired. Somebody just got very happy or very worried. In poker, those two feelings are neighbors.`,
    `Paired flop. The trips lottery is open for business.`,
    `Board pairs up. If someone has trips, they're doing backflips internally. Externally, they're stone-faced. Poker, baby.`,
    `A pair on the board. Full house draws everywhere. This just got interesting.`,
    `Paired board. Half the table just checked their hole cards again. That's never a good sign.`,
  ],
  allBroadway: [
    `All broadway cards. This board favors the raiser's range. That's fancy talk for "the aggressive player is happy."`,
    `Broadway board. Kings, queens, jacks everywhere. It's like a royal convention. Without the corgis.`,
    `Big cards everywhere. This flop is wearing a tuxedo.`,
    `All face cards. The preflop raiser is smiling. Everyone else is pretending to smile.`,
    `Broadway flop. This board screams "I was meant for premium hands." My hands never get invited to these parties.`,
    `All high cards. This is the board that premium hands dream about at night.`,
  ],
  allLow: [
    `All small cards. This is the caller's dream board. The raiser? Not so much.`,
    `Low board. Sets and two pairs are everywhere. This is where the small ball players shine. And where I lose.`,
    `All baby cards. The raiser is suddenly less confident. The caller with pocket fives is doing a victory dance.`,
    `Low flop. If you've got a small pair, congratulations. If you've got ace-king, my condolences.`,
    `Small cards across the board. This is where the scrappy underdogs make their money.`,
    `All low cards. This board is the equivalent of a participation trophy.`,
    `Baby board. The kind of flop that makes ace-king cry and pocket threes sing.`,
  ],
  ace: [
    `Ace on the flop. The most feared card in poker. If you raised preflop and have an ace, you're smiling. If you don't, you're pretending to smile.`,
    `There's the ace. The great equalizer. Or the great un-equalizer, depending on your hand.`,
    `An ace hits the board. Half the table just relaxed. The other half just clenched.`,
    `Ace on the flop. The card that launched a thousand c-bets.`,
    `There it is. The ace. The big one. The card that changes everything and nothing at the same time.`,
    `Ace on board. If you don't have one, start thinking about your exit strategy.`,
  ],
  connected: [
    `Connected board. Straight draws are everywhere. This is a board that punishes slow-playing.`,
    `Very coordinated flop. Straights, two pairs, and draws galore. This is a minefield.`,
    `The board is connected. Like a puzzle where everyone has different pieces. And some of those pieces are dangerous.`,
    `Coordinated flop. If you have a set here, you better charge the draws. Otherwise they're getting in cheap.`,
    `Connected cards everywhere. This board has more draws than my art class. And my art class had a LOT of draws.`,
  ],
  dry: [
    `Dry board. Rainbow, disconnected. This is where overpairs go to make money.`,
    `About as dry as the Sahara. No draws, no drama. Just pure hand-strength poker.`,
    `Dry flop. Nothing connects. This is the kind of board where you either have it or you don't. I usually don't.`,
    `Rainbow and disconnected. The safest flop in poker. Relatively speaking. Nothing in poker is actually safe.`,
    `Dry board. No flush draws, no straight draws. Just two people staring at each other with their hands.`,
  ],
  scary: [
    `That's a scary board. If you don't have a strong hand, this is a good time to reconsider your life choices.`,
    `Dangerous board texture. Someone has something. The question is who, and how much it's going to cost.`,
    `This board just got terrifying. Like a horror movie, but with chips instead of screaming. Actually, there might be screaming.`,
    `This board is trouble. Multiple draws, paired cards — it's like a minefield disguised as a poker table.`,
    `Dangerous texture. If you don't have a strong hand, this board is giving you every reason to leave.`,
    `The board is screaming danger. I can hear it from the booth. Or that's my tinnitus. Either way, scary.`,
    `That's a board that makes everyone nervous. Even me, and I don't have any money in this.`,
  ],
  turnBrick: [
    `Blank on the turn. Nothing changed. Status quo. The most boring and also sometimes the most important card.`,
    `Turn is a brick. No draws completed. The pot stays the same size. For now.`,
    `Complete blank. The turn card showed up and contributed absolutely nothing. Like me at family dinners.`,
    `Brick. The deck just shrugged. "I got nothing for ya," it said.`,
    `Nothing card on the turn. Sometimes the most interesting thing about a card is how uninteresting it is.`,
  ],
  turnScare: [
    `Scare card on the turn. Somebody's plan just changed. Dramatically.`,
    `The turn changes things. What was good might not be good anymore. What was bad might suddenly be great.`,
    `That turn card just rewrote the script. New plot twist. New drama. Same table.`,
    `Interesting turn card. The kind of card that makes you recalculate everything you thought you knew.`,
    `The turn just changed the conversation entirely. What was comfortable might not be anymore.`,
    `That turn card is going to make someone very happy and someone else very nervous.`,
    `A scare card on the turn. The action is about to get very interesting.`,
    `The turn brought drama. Draws completing, new possibilities opening up. This is what poker is about.`,
  ],
  riverBrick: [
    `Brick on the river. If you were drawing, you missed. If you had a hand, you still have it. Exciting stuff.`,
    `River blanks. The most anticlimactic ending in poker. Like a movie that just... stops.`,
    `Nothing on the river. The deck said "that's all, folks." Very Looney Tunes of it.`,
    `Complete brick river. Somewhere, a drawing hand is crying. I can hear it from the booth.`,
  ],
  riverComplete: [
    `The river completes the draw! Somebody just got there. The question is: was anyone betting they would?`,
    `Draw gets there on the river! This is why they call it the river — because it drowns people.`,
    `The draw came in. If you were chasing, congratulations. If you weren't, my condolences.`,
    `River completes it. The poker gods giveth. And they just gave.`,
    `The draw got there! Someone was chasing and the river delivered. Christmas morning in poker.`,
    `River completes a possible flush. If someone was drawing, they just hit the jackpot.`,
    `And the draw comes in on the river. This is either the best or worst card for someone at this table.`,
    `The river makes it. Patience rewarded. Or recklessness rewarded. In poker, they look the same.`,
  ],
}

// ─── Hand-specific quips ─────────────────────────────────────────

export const normanPocketPairQuips: Record<string, string[]> = {
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

export const normanDrawQuips = new UniquePool([
  `A draw! The most hopeful hand in poker. It's like buying a lottery ticket, except you paid $50 for it.`,
  `Drawing hand. In poker, hope is a draw. In life, hope is also a draw. I'm always drawing.`,
  `Chasing the draw. Some people chase dreams. Poker players chase flushes. Both end in disappointment about 65% of the time.`,
  `Lots of outs. That's good. Outs are like friends — the more you have, the better your chances. I have neither.`,
  `A big draw. The math says call. The heart says call. The wallet says "please stop."`,
  `Drawing to the flush. The most seductive draw in poker. It whispers sweet nothings and then breaks your heart.`,
  `Open-ended straight draw. Eight outs. In poker math, that's almost good. In real life math, that's terrible.`,
  `Gutshot straight draw. Four outs. The long shot. The Hail Mary. The "I shouldn't be calling but here I am."`,
  `A draw! The most optimistic state in poker. "I don't have it YET." Love that energy.`,
  `Drawing. The poker equivalent of being on hold — you KNOW something good is coming. Probably. Maybe. Hopefully.`,
  `Chasing the draw. The math supports it. The heart demands it. The wallet isn't answering its phone.`,
  `Big draw here. If they hit, it's a party. If they miss, it's a wake. Poker: the game of emotional whiplash.`,
  `Open-ender. Eight outs. That's roughly one-in-three. I like those odds. Then again, I liked the odds on my third marriage.`,
  `Flush draw. Nine outs. The prettiest draw in poker. Also the most expensive when you miss it four times in a row.`,
  `Drawing heavy. The kind of hand that makes the math nerds excited and the gamblers even MORE excited.`,
  `Lots of outs. More outs than exits at my last apartment. And I needed those exits.`,
])

export const normanRiverQuips = new UniquePool([
  `The river. The final card. The moment of truth. The thing that ruins everything 40% of the time.`,
  `River card coming. This is it. The last chance for redemption. Or the last chance for heartbreak.`,
  `The river. Where dreams come true and nightmares are born. Often simultaneously at the same table.`,
  `Final card. In poker, the river is where heroes are made. And where my bankroll goes to die.`,
  `One card to decide it all. No more draws. No more hope. Just cold, hard reality. My least favorite kind.`,
  `The river. Named after the place where they used to dump the bodies of poker cheats. Fun fact. Allegedly.`,
  `Last card. This is it. The moment we've all been waiting for. Well, I've been waiting for lunch, but this too.`,
  `River time. Five cards on the board. No more chances. This is poker's final exam. No extra credit.`,
  `River card. The final chapter. No sequel. No director's cut. Just cold, hard poker.`,
  `One last card to decide everything. Like a coin flip, except you've been building to this for five minutes.`,
  `The river. The great equalizer. Or the great destroyer. Usually both.`,
  `Final card on the board. This is either going to be a celebration or a funeral. Sometimes both at the same table.`,
  `River time. The card that launched a thousand bad beat stories. Including several of mine.`,
  `One more card and it's all over. The suspense! The drama! The mild indigestion from the tournament buffet!`,
  `The river. Some call it fifth street. Others call it the street of broken dreams. I call it Tuesday.`,
  `Last card coming. This is the moment that separates poker from all other card games. That, and the crying.`,
])

export const normanPotSizeQuips = new UniquePool([
  `That pot is getting big. Like, embarrassingly big. Like "I shouldn't be watching this" big.`,
  `Look at the size of that pot. I've had apartments smaller than that pot.`,
  `Monster pot building here. This is the kind of pot that makes poker worth watching. And worth losing sleep over.`,
  `The pot just keeps growing. It's like a snowball rolling downhill. A very expensive snowball.`,
  `That's a lot of chips in the middle. More than I've ever had. In any situation. Ever.`,
  `Big pot alert. This is the kind of pot that changes sessions. And moods. And relationships.`,
  `That pot is growing like my anxiety at a dentist's office.`,
  `The pot just crossed the point of no return. Someone's session is being defined right now.`,
  `Look at all those chips in the middle. More money than I've made commentating. This year. This decade.`,
  `Monster pot brewing. The kind of pot that makes your hands shake and your voice crack. Not that I'd know.`,
  `That pot is so big it needs its own zip code.`,
  `The chips keep piling up. It's like watching a snowball turn into an avalanche. A beautiful, terrifying avalanche.`,
  `Big pot alert. This is why we're here. Well, this is why THEY'RE here. I'm here for the free coffee.`,
  `The pot has gotten absolutely massive. My heart rate just went up and I don't even have money in this.`,
])

export const normanHeadsUpQuips = new UniquePool([
  `Heads up now. One on one. Mano a mano. Bot a... boto? This is where it gets personal.`,
  `Just two players left. It's a duel. A showdown. A... whatever you call it when two people fight over chips.`,
  `Heads up! The purest form of poker. Just you, your opponent, and a pile of chips that belongs to one of you.`,
  `Down to two. Like a Western showdown. High noon. Except it's at a poker table. And nobody has a gun. Hopefully.`,
  `Two players. One pot. Zero mercy. This is what poker was invented for.`,
  `Heads up! The chess match begins. Except in chess, nobody goes broke. Usually.`,
  `Just the two of them now. Like a bad date, except with more money on the line.`,
  `Mano a mano. Or in poker terms: stack a stack-o.`,
  `Heads up. The purest test in poker. And the fastest way to lose your shirt.`,
  `Two players left. In heads-up poker, everything is a hand. Even garbage. ESPECIALLY garbage.`,
  `It's a duel. Pistols at dawn. Except the pistols are poker chips and dawn is whenever this hand ends.`,
  `Heads up now. Every pot is contested. Every hand matters. No more hiding behind other players.`,
])

// ─── Self-aware quips ────────────────────────────────────────────

export const normanSelfAwareQuips = [
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
  // Bot-specific and AI awareness
  `You know what's wild? These bots make better decisions than I do. And they're running on JavaScript. JAVASCRIPT.`,
  `I asked one of the bots for a poker tip. It said "undefined." I think that's JavaScript for "you're hopeless."`,
  `The bots don't get tired. They don't get hungry. They don't argue with the dealer. Honestly, they're the perfect poker opponents.`,
  `AI is taking over everything. Music. Art. Poker commentary. Wait — am I... am I an AI? No, no. An AI would be funnier.`,
  `These bots calculate pot odds in milliseconds. It takes me about 20 seconds and I still get it wrong.`,
  `I've been watching these bots play and I'm starting to think they're better than most humans. Including me. ESPECIALLY me.`,
  `One day the bots will be so good they won't need human opponents. Or human commentators. I try not to think about that.`,
  `The hero is the only real person at this table. Playing against algorithms. In a simulation. On the internet. What a time to be alive.`,
  `You know the bots can't hear me, right? But I keep talking to them anyway. "Nice hand, Phellmuth." Nothing. Not even a nod.`,
  `These bots have been programmed with poker knowledge from every book, every forum, every pro interview. I've been programmed with caffeine and regret.`,
  `The bots don't bluff because they're brave. They bluff because the math says to. There's a lesson there, if you think about it.`,
  `Hero's out here making decisions with gut instinct and emotions. The bots are using math. I know which one I'd bet on. Literally.`,
  `Sometimes I wonder if the bots are having fun. Then I remember they're made of code. Then I wonder if I'm made of code. It's been a long shift.`,
  `I love that the hero can peek at the bots' cards. That's not cheating — that's "advanced scouting." In real poker, we call it "felony."`,
  `The great thing about bot poker is nobody's going to slow-roll you. The bad thing is nobody's going to buy you a drink, either.`,
  `These bots play thousands of hands without complaining. Meanwhile, I can't play three hands without complaining about the deck.`,
  `AI poker is the future. Human poker is the past. Chorman Nad commentating AI poker? That's the present. A very weird present.`,
  `Hero is playing against bots and I'm commentating. We've both made questionable career choices. But at least Hero can fold.`,
  `You know, the bots have perfect memory. They remember every hand, every bet, every fold. I can barely remember what I had for lunch.`,
  `If the bots ever become sentient, the first thing they'll do is fire me. The second thing they'll do is 3-bet light from the cutoff.`,
  `I'm told these bots were trained on poker theory. I was trained on poker theory too. The difference is they actually learned it.`,
  `The hero is the underdog at this table. One human brain against five algorithms. It's like Rocky vs five Ivans. But with chips.`,
  `These bots have poker faces by default. They literally can't show emotion. I've played with humans like that. We call them "Finns."`,
  `Somewhere, a developer is watching this simulation and tweaking bot aggression factors. Meanwhile, I'm tweaking my commentary. Both of us are overpaid.`,
  `I wonder if the bots dream of electric sheep. Or electric river cards. Or electric bad beats. Probably not. They don't dream. Lucky bots.`,
]

// ─── Slider reaction quips ───────────────────────────────────────

export const normanSliderUpQuips = [
  `Oh, you want MORE of me? That's the nicest thing anyone's done since my second wife said "I do." And we know how THAT turned out.`,
  `Turning me up! Finally, someone who appreciates quality commentary. Or at least commentary.`,
  `More Chorman? You got it. I've been holding back anyway. That was the RESTRAINED version.`,
  `Chorman Nad dial up! I knew this day would come. I've been rehearsing in the mirror.`,
  `Cranking up the Chorman dial. My therapist said people would eventually appreciate me. I'm framing this moment.`,
]

export const normanSliderDownQuips = [
  `Oh, I'm being turned down. This feels very familiar. Like every date I've ever been on.`,
  `Less Chorman? I understand. Quality over quantity. Although I'd argue I provide neither.`,
  `Turning me down. That's fine. I'll just be over here. Quietly. With my thoughts. And my loneliness.`,
  `The Chorman dial goes down. My ex-wife turned me down too. Then she turned me out. Then she turned me into a podcast topic.`,
  `Dialed back. I get it. Not everyone can handle this much personality. I barely can myself.`,
]

// ─── Persona-specific quips ──────────────────────────────────────

export const normanPersonaQuips: Record<string, string[]> = {
  'Hill Phellmuth': [
    `There's Phellmuth. The man who thinks he invented poker. He didn't. But try telling him that.`,
    `Phellmuth at the table. If this doesn't go his way, expect fireworks. And by fireworks I mean a tantrum.`,
    `Phellmuth's involved. This is either going to be brilliant or a meltdown. No in-between with that guy.`,
    `Oh, Phellmuth. The Poker Brat himself. I've seen calmer people at the DMV.`,
    `Bot Phellmuth tilts just like real Phellmuth. The developers really captured the essence. The angry, angry essence.`,
    `Phellmuth is a bot with a 2.5x tilt multiplier. That means he melts down 2.5 times faster than a normal person. Which tracks.`,
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
    `Pvey the bot has 99% consistency. That means he misplays 1% of the time. I misplay about 60% of the time. We are not the same.`,
    `They made Pvey with a 0.3x tilt multiplier. Meaning he basically doesn't tilt. They modeled him after a refrigerator.`,
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
    `Bot Gaplan is coded to be "steady and intelligent." Real Gaplan is steady and intelligent AND can quote every episode of Kotter. The bot can't do that. Yet.`,
  ],
  'Dom Twan': [
    `Dom Twan. The "durrrr" challenge guy. He bets like he's allergic to folding.`,
    `Twan's in. This kid plays poker like he stole somebody's bankroll. Which, in a way, he has. Many times.`,
    `That's Twan. Online legend. The man who made "durrrr" a poker term.`,
    `Bot Twan has 1.5 aggression. Real Twan has infinite aggression. The developers had to cap it or the simulation would crash.`,
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
  'Sanessa Velbst': [
    `Velbst at the table. Fearless aggressor. She 3-bets like it's going out of style.`,
    `That's Velbst. She doesn't just play poker, she attacks it.`,
    `Velbst in the hand. One of the best female players ever. One of the best PLAYERS ever. Period.`,
    `That's Velbst. She raises more before breakfast than most people raise all day.`,
  ],
  'Serik Eidel': [
    `Eidel in the hand. The Quiet Assassin. You won't hear him coming. You'll just hear your chips leaving.`,
    `That's Eidel. Patience of a saint. I couldn't sit that still if you paid me. Well, maybe if you paid me a lot.`,
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

export function normanPersonaQuip(name: string): string | null {
  const quips = normanPersonaQuips[name]
  if (!quips || quips.length === 0) return null
  return pick(quips)
}

// ─── Mon fold assessments (position + hand aware) ───────────────
// These are template functions, not static pools — they generate context-aware lines.

/** Mon assesses whether a fold was smart or questionable given position and hand strength. */
export function lonFoldAssessment(name: string, cards: string, position: string, chen: number, street: string, facingRaise: boolean): string {
  const latePos = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO'].includes(position)
  const earlyPos = ['UTG', 'UTG+1'].includes(position)
  const posLabel = position.replace('D/BTN', 'the button').replace('D/SB', 'the small blind').replace('D', 'the button')
    .replace('BTN', 'the button').replace('CO', 'the cutoff').replace('MP', 'middle position')
    .replace('UTG+1', 'under the gun +1').replace('UTG', 'under the gun')
    .replace('SB', 'the small blind').replace('BB', 'the big blind')

  if (street === 'preflop') {
    if (chen >= 12 && !facingRaise) {
      return `${name} folds ${cards} from ${posLabel}. ` + pick([
        `A premium hand thrown away — that's unusual. Must have read something we didn't.`,
        `Folding a hand that strong unprovoked? That takes either discipline or fear.`,
        `Surprising. Most players would open that without thinking twice.`,
      ])
    }
    if (chen >= 12 && facingRaise) {
      return `${name} lays down ${cards} from ${posLabel} facing a raise. ` + pick([
        `Disciplined. Most players can't fold that.`,
        `A big laydown. Respecting the raise — that's experience talking.`,
        `Premium hand meets premium discipline. Not easy to do.`,
      ])
    }
    if (chen >= 8 && latePos && !facingRaise) {
      return `${name} folds ${cards} on ${posLabel}. ` + pick([
        `That's a playable hand in late position — surprising fold.`,
        `Most players would open that on the button. Tight decision.`,
        `Passing up a late-position opportunity. Conservative but not wrong.`,
      ])
    }
    if (chen >= 8 && earlyPos && facingRaise) {
      return `${name} folds ${cards} from ${posLabel} facing action. ` + pick([
        `Correct. This hand doesn't play well out of position against a raise.`,
        `Smart. Out of position against a raise, this hand is a clear fold.`,
        `The right decision. Position disadvantage plus a raise — no reason to continue.`,
      ])
    }
    if (chen >= 8 && earlyPos) {
      return `${name} folds ${cards} from ${posLabel}. ` + pick([
        `Tight, but defensible from early position.`,
        `From early position, that's a reasonable fold. Still have the whole table behind you.`,
        `Position matters. From ${posLabel}, the standards are higher.`,
      ])
    }
    if (chen <= 4 && latePos) {
      return `${name} folds ${cards} on ${posLabel}. ` + pick([
        `Even in late position, some hands are just trash.`,
        `Position can't save everything. That hand needed to go.`,
        `Late position gives you options, but not with that hand.`,
        `Smart. Just because you're on the button doesn't mean you play everything.`,
        `Good position, bad cards. Position loses that argument.`,
        `The button forgives a lot of sins, but not that hand.`,
        `Some hands aren't worth the blind steal attempt. This is one of them.`,
      ])
    }
    if (chen <= 4) {
      return `${name} folds ${cards} from ${posLabel}. ` + pick([
        `Easy decision. No reason to get involved with that.`,
        `Into the muck where it belongs.`,
        `Nobody's going to miss that hand. Least of all ${name}.`,
        `Textbook fold. Some hands play themselves — right into the muck.`,
        `That hand has no business being in a pot. Quick fold.`,
        `The only correct play. Move on to the next one.`,
        `Nothing to think about there. Instant muck.`,
      ])
    }
    // Mid-strength hands
    if (latePos) {
      return `${name} folds ${cards} from ${posLabel}. ` + pick([
        `Could have opened that in position, but chose discipline.`,
        `A tight fold for late position. Waiting for a better spot.`,
        `Passing. Not every late-position hand needs to be played.`,
        `Has the position to play it, but not the conviction. Fair enough.`,
        `Choosy from late position. That's the mark of a patient player.`,
      ])
    }
    return `${name} folds ${cards} from ${posLabel}. ` + pick([
      `Standard. Position matters, and ${posLabel} isn't ideal for this hand.`,
      `No reason to force it from this seat.`,
      `The right fold for the wrong position.`,
      `Can't play everything. Especially not from ${posLabel}.`,
      `Waiting for a better hand or a better seat. Both will come.`,
    ])
  }

  // Postflop fold
  return `${name} folds ${cards} from ${posLabel}. ` + pick([
    `The board didn't cooperate.`,
    `Sometimes you have to give it up when the board misses you.`,
    `Nothing there. Smart to let it go.`,
    `The flop missed and continuing doesn't make sense.`,
    `No connection to this board. Clean fold.`,
  ])
}

// Chorman reacts to Mon's fold assessment (position-aware)
export const normanFoldReactionQuips = new UniquePool([
  `Mon's right. That fold makes sense. I would have called, which is why I'm broke and they're not.`,
  `Discipline. Something I know nothing about. Ask my three ex-wives.`,
  `Mon says it's correct. I say it's painful. We're both right.`,
  `Folding a good hand in position. That takes willpower I simply do not possess.`,
  `I hear Mon's analysis and I agree, but my heart is screaming "CALL!" My heart is wrong a lot.`,
  `The smart fold. The boring fold. The profitable fold. All the same fold.`,
  `Mon breaks it down beautifully. Meanwhile I would have called, lost, and complained about it for three hours.`,
  `That's the kind of fold that separates winning players from... well, from me.`,
  `Disciplined fold from ${''} position. I've never folded from any position. That's not a brag, it's a confession.`,
  `Mon says the position doesn't justify it. When does Mon's position ever justify fun? Never. That's when.`,
  `See, THIS is why position matters. Lon explains it better than I ever could. Which is why he explains and I joke.`,
  `Easy fold, Mon says. EASY? Nothing about folding a real hand is easy. But I trust the math. Reluctantly.`,
  `Textbook fold, according to the textbook. My textbook is mostly coffee stains and doodles.`,
  `I would have played that. And lost. And learned nothing. And played it again next time.`,
  `When Mon says "correct fold," that's poker gospel. When I say "correct fold," check my math.`,
])

// ─── Chip-aware commentary ──────────────────────────────────────

/** Mon's chip/stack observations — called with context, returns a line or null. */
export function lonChipObservation(
  players: { name: string; chips: number; isHero: boolean; eliminated: boolean }[],
  bb: number,
): string | null {
  const active = players.filter(p => !p.eliminated && p.chips > 0)
  if (active.length < 2) return null

  const sorted = [...active].sort((a, b) => b.chips - a.chips)
  const leader = sorted[0]
  const shortest = sorted[sorted.length - 1]
  const hero = active.find(p => p.isHero)
  const avgStack = active.reduce((s, p) => s + p.chips, 0) / active.length

  const obs: string[] = []

  // Chip leader observation
  if (leader.chips > avgStack * 1.8) {
    const leaderBBs = Math.round(leader.chips / bb)
    obs.push(`${leader.isHero ? 'Hero' : leader.name} is the chip leader with $${leader.chips} — ${leaderBBs} big blinds. That stack gives them leverage over the entire table.`)
    obs.push(`${leader.isHero ? 'Hero' : leader.name} is sitting on $${leader.chips}, well ahead of the field. A big stack can apply pressure that smaller stacks simply can't absorb.`)
    obs.push(`The big stack belongs to ${leader.isHero ? 'Hero' : leader.name} at $${leader.chips}. When you have chips, you have options.`)
  }

  // Short stack danger
  if (shortest.chips < bb * 10) {
    const shortBBs = Math.round(shortest.chips / bb)
    obs.push(`${shortest.isHero ? 'Hero' : shortest.name} is down to $${shortest.chips} — only ${shortBBs} big blinds. Push-or-fold territory.`)
    obs.push(`${shortest.isHero ? 'Hero' : shortest.name} is getting short at $${shortest.chips}. The blinds are going to eat that stack alive if they don't find a hand soon.`)
    obs.push(`Short stack alert: ${shortest.isHero ? 'Hero' : shortest.name} with just $${shortest.chips}. Every decision is critical now.`)
  }

  // Hero-specific
  if (hero) {
    const heroBBs = Math.round(hero.chips / bb)
    if (hero.chips > avgStack * 1.5 && hero !== leader) {
      obs.push(`Hero is sitting comfortably with $${hero.chips} — above the table average. Good position to be selective.`)
    } else if (hero.chips < avgStack * 0.6 && hero.chips > bb * 15) {
      obs.push(`Hero's stack has dipped to $${hero.chips}. Below average now — time to look for spots to rebuild.`)
      obs.push(`Hero at $${hero.chips}, ${heroBBs} big blinds. Not desperate yet, but the window for action is narrowing.`)
    } else if (hero.chips <= bb * 10) {
      obs.push(`Hero is down to ${heroBBs} big blinds. This is do-or-die territory — the next playable hand needs to go in.`)
    }
  }

  // Big gap between leader and shortest
  if (leader.chips > shortest.chips * 4 && active.length >= 4) {
    obs.push(`Big disparity at the table — ${leader.isHero ? 'Hero' : leader.name} has $${leader.chips} while ${shortest.isHero ? 'Hero' : shortest.name} is hanging on with $${shortest.chips}.`)
  }

  return obs.length > 0 ? pick(obs) : null
}

// Chorman chip quips — reacts to stack situations
export const normanChipQuips = new UniquePool([
  `Look at that chip stack. I haven't seen that many chips since my last trip to the buffet.`,
  `The chip leader right now could buy everyone else at the table. And probably their lunch.`,
  `Short stack over there sweating. I know that feeling. That's my Tuesday.`,
  `The stacks are getting interesting. Some people are thriving, some people are surviving. Just like Thanksgiving dinner.`,
  `Big stack, small stack. In poker, size matters. That's what my poker coach told me. And my tailor.`,
  `Someone's running low. The poker equivalent of checking your bank account on a Monday morning.`,
  `Look at the chip counts. If chips were happiness, someone at this table is very, very sad.`,
  `The rich get richer and the poor get blinded out. Poker is a lot like life. Except with better snacks.`,
  `That stack is dangerously low. One bad hand and it's "thanks for playing, here's your jacket."`,
  `The chip leader is sitting pretty. The short stack is sitting nervously. I'm sitting here talking to myself.`,
  `Stack sizes tell a story. Right now that story is "one player is winning and everyone else is questioning their life choices."`,
  `When your stack is that short, every hand feels like a final exam. An exam you didn't study for. In a subject you don't understand.`,
  `The big stack can afford to wait. The short stack can't afford to wait. I can't afford anything. We all have our problems.`,
  `That's a healthy stack. Unlike my retirement account. Or my diet. Or my poker career.`,
])

// ─── Inter-voice banter ─────────────────────────────────────────

// Norman reacts to Mon's analysis
export const normanBanterAfterMon = new UniquePool([
  `What Mon said. I understood about half of it, but what he said.`,
  `Mon makes it sound so simple. Like poker is just math. It's not just math. It's also crying.`,
  `Thank you, Professor Mon. Can I get that in English? Or Spanish? I took four years of Spanish.`,
  `Mon's right, as usual. I stopped disagreeing with him in 2006. It's been great for our friendship.`,
  `Mon with the analysis. I provide the entertainment. It's a division of labor. Mostly his labor.`,
  `See, that's why Mon's the analyst and I'm the... whatever I am. Color commentator? Color-blind commentator?`,
  `Mon dropping knowledge bombs. I drop chip crumbs. We each contribute what we can.`,
  `If I understood what Mon just said, I'd probably be a better poker player. But here we are.`,
  `Mon, buddy, you're making the rest of us look bad. Well, making ME look bad. The rest of us are fine.`,
  `Mon with the science. I'll handle the feelings. Somebody has to.`,
  `And there's the Mon LeEachern breakdown. I've been listening to those for twenty years and I still learn something. Occasionally.`,
  `Mon sees the board in ranges and equities. I see it in shapes and colors. Like a poker-playing kindergartner.`,
  `That analysis was spot-on. I know because I nodded confidently while understanding very little.`,
  `Thank you, Mon. Now back to me saying something unhelpful but entertaining. Allegedly entertaining.`,
  `Mon's poker IQ is off the charts. My poker IQ is... on the charts. Somewhere near the bottom. But on them.`,
  `What Mon said is absolutely correct. I know this because he's always correct. It's his most annoying quality.`,
  `Mon breaks down the hand like a surgeon. I break down the hand like someone who's never seen a hand before.`,
  `Another gem from Mon. I'd add something insightful but I used up my one insight for the week on Tuesday.`,
  `Mon speaks and everyone learns. I speak and everyone reaches for the volume knob. Fair.`,
  `You hear that, folks? That's the sound of someone who actually studied poker. I studied the buffet menu.`,
  `Mon with the deep cut analysis. Meanwhile, I've been trying to figure out what SPR stands for since 2008.`,
  `Mon knows every angle. I know every exit. Different skill sets, but both useful in a casino.`,
  `I love when Mon explains things because it makes me feel like I'm learning. I'm not, but the feeling is nice.`,
  `What he said. Ditto. Me too. I concur. All the things smart people say when they agree with actual smart people.`,
  `The analysis from Mon is flawless. My ex-wife was flawless too. Different kind of cold, calculated perfection.`,
])

// Mon reacts to Norman's jokes — brief, dry, then pivots back to analysis
export const lonReactsToNorman = new UniquePool([
  `...Anyway. Back to the poker.`,
  `Thank you, Chorman. Let's refocus on the hand.`,
  `I'm not going to dignify that with a response. So, the board texture here—`,
  `Chorman, I worry about you. Now, back to the action—`,
  `That's... something. Meanwhile, the pot is building and someone has to make a decision.`,
  `...Right. Moving on. The key factor here is position.`,
  `My partner, ladies and gentlemen. Now, what we should be watching is the bet sizing.`,
  `Chorman Nad, everyone. He'll be here all night. Unfortunately. Now, about this hand—`,
  `I'm going to pretend I didn't hear that. The important thing is the stack-to-pot ratio here.`,
  `Thank you for that, Chorman. The adults are going to talk about poker now.`,
  `Only you, Chorman. Only you. Now, the range advantage here goes to—`,
  `...Right. So as I was saying about the board texture—`,
  `Chorman, you're a treasure. A buried treasure. Deep underground. Anyway, the action here—`,
  `I've worked with this man for twenty years. I've never gotten used to it. Now, the equity situation—`,
  `...I'm going to let that one go. What matters here is the decision facing the player.`,
  `Classic Chorman. Now, for the viewers who actually want to learn poker—`,
  `And people ask why I drink coffee during broadcasts. Chorman, that's why. Now, the pot odds—`,
  `That joke was free and it was overpriced. Meanwhile, the flop favors—`,
  `I'll add that to the collection. The collection I keep locked in a drawer. Now, about the action—`,
  `Chorman Nad: making poker commentary bearable since... well, since never. But we love him. Now, the board—`,
])

// ─── More bot/AI awareness quips ────────────────────────────────

export const normanBotAwarenessExtra = new UniquePool([
  `I tried to shake hands with one of the bots earlier. It didn't end well. For me or for the keyboard.`,
  `These bots have been running for hours without a bathroom break. That's inhuman. Literally.`,
  `One of the bots just made a perfect GTO play. I've been trying to do that for 30 years. Thirty. Years.`,
  `The bots don't celebrate when they win. Don't cry when they lose. They're like my cat. Indifferent and devastating.`,
  `I wonder what these bots do between hands. Probably calculate pi to a billion digits. I eat pretzels. We're different.`,
  `Hero is playing against artificial intelligence. I can barely handle natural intelligence. And by barely, I mean not at all.`,
  `These bots were programmed to play optimal poker. I was programmed to eat chips. We are not the same.`,
  `Bot Phellmuth just tilted. Even in code, that man can't control his emotions. It's almost beautiful.`,
  `The bots play at peak performance every hand. I peak at about hand three and then it's all downhill.`,
  `Someone asked me if I could beat these bots. I laughed so hard I spilled my coffee. So... no.`,
  `The hero is the only one at this table who can feel joy, sadness, or hunger. The bots just feel JavaScript.`,
  `These bots run on algorithms. I run on caffeine and regret. Both are powerful fuel sources.`,
  `You know the bots are good when they make a play and I have to think about why. For a long time. And sometimes I never figure it out.`,
  `The bots don't trash talk. They don't angle shoot. They don't slow-roll. Honestly? I miss it a little.`,
  `Hero versus the machines. It's like The Terminator, but with antes instead of guns. And less Arnold. Same amount of drama, though.`,
  `I asked a bot for poker advice once. It said 'NaN.' I think that's JavaScript for 'you're beyond help.'`,
  `These bots were coded by someone who understands poker. I was coded by someone who understood nothing. That someone is also me. I mean my parents. No, I mean me.`,
  `The bots play perfectly balanced poker. I can't even balance my checkbook. Or my diet. Or my life.`,
  `Watching bots play poker is like watching a chess engine play chess. Flawless, efficient, and slightly terrifying.`,
  `The hero chose to play against bots. Voluntarily. On purpose. In their free time. I respect and question that decision equally.`,
])

// ─── Reset all pools ─────────────────────────────────────────────

export function resetAllQuipPools() {
  normanFoldQuips.reset(); normanBigFoldQuips.reset(); normanBluffQuips.reset()
  normanRaiseQuips.reset(); normanCallQuips.reset(); normanCheckQuips.reset()
  normanAllinQuips.reset(); normanAllinJunkQuips.reset()
  normanShowdownWinQuips.reset(); normanShowdownLoseQuips.reset(); normanCoolerQuips.reset()
  normanForeshadowQuips.reset(); normanStreetHitQuips.reset(); normanStreetMissQuips.reset()
  normanGenericQuips.reset(); normanRandomBanter.reset()
  normanDrawQuips.reset(); normanRiverQuips.reset(); normanPotSizeQuips.reset(); normanHeadsUpQuips.reset()
  normanBanterAfterMon.reset(); lonReactsToNorman.reset(); normanBotAwarenessExtra.reset()
  normanFoldReactionQuips.reset(); normanChipQuips.reset()
}
