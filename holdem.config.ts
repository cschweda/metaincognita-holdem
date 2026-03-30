/**
 * No Limit Hold'em Simulator — Single Source of Truth Configuration
 *
 * All tunable game parameters live here. Import this config
 * wherever values are needed rather than hardcoding numbers.
 *
 * Usage:
 *   import config from '@config'
 *   const { stakes, table, monte, personas } = config
 */

export default {
  // ─── Table & Seating ─────────────────────────────────────────
  table: {
    minPlayers: 2,
    maxPlayers: 8,
    heroSeat: 0,                         // hero always at bottom-center
    defaultPlayerCount: 6,
  },

  // ─── Stake Levels ────────────────────────────────────────────
  stakes: [
    { level: 1, name: 'Micro',     sb: 0.25, bb: 0.50,  defaultStack: 50    },
    { level: 2, name: 'Low',       sb: 0.50, bb: 1.00,  defaultStack: 100   },
    { level: 3, name: 'Medium',    sb: 1.00, bb: 2.00,  defaultStack: 200   },
    { level: 4, name: 'High',      sb: 2.50, bb: 5.00,  defaultStack: 500   },
    { level: 5, name: 'Big',       sb: 5.00, bb: 10.00, defaultStack: 1000  },
    { level: 6, name: 'Nosebleed', sb: 25.0, bb: 50.00, defaultStack: 5000  },
  ],
  defaultStakeLevel: 3,                  // Medium
  stackRange: { minBB: 50, maxBB: 200, defaultBB: 100 },

  // ─── Chip Denominations (by stake tier) ──────────────────────
  chipDenominations: {
    low:       [{ color: 'white', value: 0.25 }, { color: 'red', value: 1 },   { color: 'green', value: 5 },   { color: 'black', value: 25 }],
    medium:    [{ color: 'white', value: 1 },    { color: 'red', value: 5 },   { color: 'green', value: 25 },  { color: 'black', value: 100 }],
    high:      [{ color: 'red', value: 5 },      { color: 'green', value: 25 },{ color: 'black', value: 100 }, { color: 'purple', value: 500 }],
    nosebleed: [{ color: 'green', value: 25 },   { color: 'black', value: 100 },{ color: 'purple', value: 500 },{ color: 'orange', value: 1000 }],
  },

  // Map stake levels → chip tier
  stakeToChipTier: {
    1: 'low', 2: 'low', 3: 'medium', 4: 'high', 5: 'high', 6: 'nosebleed',
  },

  // ─── Hand Evaluator ──────────────────────────────────────────
  handRanks: {
    HIGH_CARD:       0,
    ONE_PAIR:        1,
    TWO_PAIR:        2,
    THREE_OF_A_KIND: 3,
    STRAIGHT:        4,
    FLUSH:           5,
    FULL_HOUSE:      6,
    FOUR_OF_A_KIND:  7,
    STRAIGHT_FLUSH:  8,
  },

  // ─── Monte Carlo Simulation ──────────────────────────────────
  monte: {
    initialRuns: 200,                    // first pass
    adaptiveThreshold: [40, 60],         // equity % range that triggers extra runs
    additionalRuns: 300,                 // extra runs when in adaptive zone
    maxRuns: 500,                        // hard cap
  },

  // ─── Betting Mechanics ───────────────────────────────────────
  betting: {
    raisePresets: [0.25, 0.5, 0.75, 1.0], // × pot
    heroShotClock: 15000,                // ms
    defaultHeroName: 'Hero',
  },

  // ─── Bot AI — Baseline Ranges (% of hands by position) ──────
  botRanges: {
    UTG:  0.15,
    MP:   0.22,
    CO:   0.30,
    BTN:  0.42,
    SB:   0.25,                          // complete/3-bet range
    BB:   0.40,                          // defend range vs steal
  },

  // 3-bet / 4-bet / 5-bet frequencies
  botEscalation: {
    threeBetValue:  0.05,                // top 5% for value
    threeBetBluff:  0.03,                // additional 3% bluffs
    fourBetValue:   0.025,               // top 2.5%
    fourBetBluff:   0.01,
    fiveBetRange:   0.01,                // almost always AA/KK
  },

  // Postflop equity thresholds
  botEquityThresholds: {
    valuebet:       0.70,                // equity > 70% → bet/raise for value
    thinValue:      0.50,                // 50–70% → bet IP, check/call OOP
    drawing:        0.30,                // 30–50% → call if odds justify
    giveUp:         0.30,                // < 30% → fold to bets
    checkRaiseFreq: 0.15,               // 15% check-raise frequency for balance
    semiBluffFreq:  0.20,               // 20% semi-bluff raise with nut draws
    bluffFreq:      0.12,               // 12% bluff when checked to
  },

  // Bet sizing (× pot or × BB)
  botSizing: {
    openRaiseEP:     2.5,               // × BB from EP/MP
    openRaiseLate:   2.2,               // × BB from CO/BTN
    threeBetIP:      3.0,               // × the open raise (in position)
    threeBetOOP:     3.5,               // × the open raise (out of position)
    valueBet:        [0.55, 0.75],      // × pot range
    bluffBet:        [0.33, 0.50],      // × pot range
    protectionBet:   [0.75, 1.00],      // × pot range (wet boards)
    overbetFreq:     0.05,              // 5% of monsters
    overbetSize:     [1.2, 1.5],        // × pot range
    shoveThreshold:  1.5,               // shove when stack < 1.5× pot
  },

  // ─── Bot Personas ────────────────────────────────────────────
  personas: [
    { name: 'Tight Tony',      vpip: 0.14, pfr: 0.11, aggression: 0.85, bluffFreq: 0.08, creativeFreq: 0.03, tiltMultiplier: 1.0, leak: 'Folds too much to 3-bets; won\'t bluff rivers' },
    { name: 'Loose Lucy',      vpip: 0.38, pfr: 0.22, aggression: 1.10, bluffFreq: 0.14, creativeFreq: 0.05, tiltMultiplier: 1.0, leak: 'Plays too many hands, especially suited junk' },
    { name: 'Aggressive Alex',  vpip: 0.26, pfr: 0.22, aggression: 1.40, bluffFreq: 0.20, creativeFreq: 0.06, tiltMultiplier: 1.2, leak: 'Over-bets draws, 3-bets too wide' },
    { name: 'Calling Carl',    vpip: 0.30, pfr: 0.12, aggression: 0.60, bluffFreq: 0.08, creativeFreq: 0.04, tiltMultiplier: 0.8, leak: 'Calls too much postflop, rarely raises' },
    { name: 'Tricky Tina',     vpip: 0.24, pfr: 0.18, aggression: 1.15, bluffFreq: 0.16, creativeFreq: 0.08, tiltMultiplier: 1.0, leak: 'Slow-plays big hands, check-raises too often' },
    { name: 'Solid Sam',       vpip: 0.22, pfr: 0.17, aggression: 1.00, bluffFreq: 0.12, creativeFreq: 0.05, tiltMultiplier: 0.6, leak: 'Very few leaks — tightest to GTO baseline' },
    { name: 'Wild Wendy',      vpip: 0.34, pfr: 0.28, aggression: 1.50, bluffFreq: 0.25, creativeFreq: 0.07, tiltMultiplier: 1.3, leak: 'Massive over-aggression, huge bluff frequency' },
    { name: 'Phil Hellmuth',   vpip: 0.20, pfr: 0.16, aggression: 1.05, bluffFreq: 0.10, creativeFreq: 0.04, tiltMultiplier: 2.5, leak: 'Plays near-GTO but goes on massive tilt after losses — becomes a maniac when frustrated' },
    { name: 'Daniel Negreanu', vpip: 0.32, pfr: 0.20, aggression: 1.10, bluffFreq: 0.15, creativeFreq: 0.10, tiltMultiplier: 0.5, leak: 'Plays suited connectors and small pairs from any position — great reads but overplays speculative hands OOP' },
    { name: 'Phil Ivey',       vpip: 0.23, pfr: 0.19, aggression: 1.15, bluffFreq: 0.13, creativeFreq: 0.06, tiltMultiplier: 0.3, leak: 'Near-perfect play with rare, unpredictable mistakes — the hardest bot to read or exploit' },
    { name: 'Doyle Brunson',   vpip: 0.28, pfr: 0.20, aggression: 1.20, bluffFreq: 0.16, creativeFreq: 0.09, tiltMultiplier: 0.4, leak: 'Old-school power poker — loves big pairs and big pots. Will trap with monsters but overvalues top pair.' },
    { name: 'Jennifer Tilly',  vpip: 0.30, pfr: 0.16, aggression: 0.90, bluffFreq: 0.12, creativeFreq: 0.07, tiltMultiplier: 0.7, leak: 'Unpredictable mix of tight and loose — plays position well but occasionally overcommits with draws' },
    { name: 'Phil Laak',       vpip: 0.27, pfr: 0.21, aggression: 1.25, bluffFreq: 0.18, creativeFreq: 0.11, tiltMultiplier: 0.6, leak: 'Unorthodox and analytical — loves unconventional lines, float bets, and delayed aggression. Hard to put on a hand.' },
    { name: 'Antonio Esfandiari', vpip: 0.29, pfr: 0.23, aggression: 1.30, bluffFreq: 0.19, creativeFreq: 0.08, tiltMultiplier: 0.9, leak: 'Charismatic aggressor — applies constant pressure with well-timed bluffs but can overplay position' },
    { name: 'Gabe Kaplan',     vpip: 0.26, pfr: 0.18, aggression: 1.00, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.8, leak: 'Steady, intelligent player — solid fundamentals but predictable bet sizing. Rarely makes big mistakes.' },
    { name: 'Jean-Robert Bellande', vpip: 0.36, pfr: 0.24, aggression: 1.35, bluffFreq: 0.22, creativeFreq: 0.09, tiltMultiplier: 1.4, leak: 'Fearless gambler — plays wide, bets big, and loves action. Will bluff massive pots but tilts when caught.' },
    { name: 'Mike Matusow',    vpip: 0.28, pfr: 0.22, aggression: 1.25, bluffFreq: 0.17, creativeFreq: 0.06, tiltMultiplier: 2.2, leak: '"The Mouth" — solid player who self-destructs on tilt. Explosive outbursts lead to reckless all-ins and wild bluffs.' },
    { name: 'Chris Moneymaker', vpip: 0.30, pfr: 0.18, aggression: 1.05, bluffFreq: 0.14, creativeFreq: 0.05, tiltMultiplier: 1.1, leak: 'The amateur who changed poker — solid fundamentals from online grinding but occasionally overplays marginal hands in big pots' },
    { name: 'Chip Reese',     vpip: 0.24, pfr: 0.19, aggression: 1.10, bluffFreq: 0.12, creativeFreq: 0.07, tiltMultiplier: 0.3, leak: 'Legendary all-around player — reads opponents perfectly, plays position flawlessly. Almost no leaks. Ice cold under pressure.' },
    { name: 'Stu Ungar',      vpip: 0.26, pfr: 0.22, aggression: 1.35, bluffFreq: 0.18, creativeFreq: 0.12, tiltMultiplier: 1.0, leak: 'Genius-level reads with fearless aggression — will make hero calls and brilliant bluffs. Erratic brilliance that\'s impossible to predict.' },
    { name: 'Vanessa Selbst',  vpip: 0.25, pfr: 0.21, aggression: 1.40, bluffFreq: 0.19, creativeFreq: 0.07, tiltMultiplier: 0.8, leak: 'Fearless female aggressor — 3-bets relentlessly, applies maximum pressure. Can overcommit to bluffs but rarely backs down.' },
    { name: 'Erik Seidel',    vpip: 0.21, pfr: 0.17, aggression: 1.05, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.3, leak: 'Quiet assassin — tight, patient, positionally aware. Exploits mistakes without giving anything away. Almost untiltable.' },
    { name: 'Tom Dwan',       vpip: 0.31, pfr: 0.26, aggression: 1.50, bluffFreq: 0.24, creativeFreq: 0.10, tiltMultiplier: 0.5, leak: '"durrrr" — hyper-aggressive LAG who puts you to the test on every street. Massive bluffs with huge sizing. Fearless.' },
    { name: 'Patrik Antonius', vpip: 0.24, pfr: 0.20, aggression: 1.20, bluffFreq: 0.14, creativeFreq: 0.06, tiltMultiplier: 0.4, leak: 'Finnish ice — calm, precise, and positionally disciplined. Punishes mistakes with perfectly sized value bets.' },
    { name: 'Scotty Nguyen',  vpip: 0.30, pfr: 0.20, aggression: 1.15, bluffFreq: 0.16, creativeFreq: 0.08, tiltMultiplier: 1.2, leak: '"The Prince of Poker" — loose-aggressive with flair. Loves to gamble, talks big, and backs it up. Can tilt after bad beats.' },
    { name: 'Johnny Chan',    vpip: 0.22, pfr: 0.18, aggression: 1.10, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.5, leak: '"The Orient Express" — old-school tight-aggressive. Traps with big hands, patient, waits for the right spot. Consistent.' },
    { name: 'Brynn Kenney',   vpip: 0.25, pfr: 0.21, aggression: 1.30, bluffFreq: 0.17, creativeFreq: 0.08, tiltMultiplier: 0.6, leak: 'Modern high-roller — game-theory oriented with creative lines. Mixes frequencies well but can be exploited by extreme nits.' },
  ],

  // ─── Bot Presets (quick-select archetypes for bot configurator) ─
  botPresets: [
    { name: 'Nit',              vpip: 0.12, pfr: 0.09, aggression: 0.70, bluffFreq: 0.06, creativeFreq: 0.02 },
    { name: 'Tight',            vpip: 0.18, pfr: 0.14, aggression: 0.90, bluffFreq: 0.10, creativeFreq: 0.03 },
    { name: 'TAG',              vpip: 0.22, pfr: 0.18, aggression: 1.20, bluffFreq: 0.14, creativeFreq: 0.05 },
    { name: 'LAG',              vpip: 0.30, pfr: 0.24, aggression: 1.40, bluffFreq: 0.20, creativeFreq: 0.06 },
    { name: 'Loose-Passive',    vpip: 0.35, pfr: 0.14, aggression: 0.50, bluffFreq: 0.08, creativeFreq: 0.03 },
    { name: 'Maniac',           vpip: 0.40, pfr: 0.32, aggression: 1.60, bluffFreq: 0.28, creativeFreq: 0.08 },
  ],

  // ─── Custom Bot Slider Ranges ────────────────────────────────
  botCustomRanges: {
    vpip:         { min: 0.10, max: 0.50, step: 0.01 },
    pfr:          { min: 0.05, max: 0.40, step: 0.01 },
    aggression:   { min: 0.30, max: 2.00, step: 0.05 },
    bluffFreq:    { min: 0.03, max: 0.30, step: 0.01 },
    creativeFreq: { min: 0.01, max: 0.15, step: 0.01 },
  },

  // ─── Tilt & Deviation ───────────────────────────────────────
  tilt: {
    // Trigger conditions (either can fire)
    bigLossThreshold: 0.30,              // single loss > 30% of stack triggers tilt
    consecutiveLosses: 3,                // N losses in a row triggers tilt (configurable)

    // Tilt effects (additive modifiers to base profile)
    aggressionBoost: 0.3,               // added to aggression while tilted
    vpipWiden: 0.08,                     // VPIP widens by 8% while tilted
    bluffBoost: 0.06,                    // bluffFreq increases by 6% while tilted
    pfrBoost: 0.04,                      // PFR increases by 4% while tilted

    // Tilt severity scales with trigger intensity
    // 3 consecutive losses = mild tilt (50% of boosts)
    // 5+ consecutive losses or big loss = full tilt (100% of boosts)
    mildTiltThreshold: 3,                // consecutive losses for mild tilt
    fullTiltThreshold: 5,                // consecutive losses for full tilt

    // Duration
    decayHands: [3, 6],                  // tilt lasts 3–6 hands, then decays
  },

  deviation: {
    creativePlays: 0.05,                 // 5% frequency of unorthodox plays
    betSizingJitter: 0.15,               // ±15% on bet sizes
  },

  // ─── Session Memory (bot hero-adaptation) ────────────────────
  sessionMemory: {
    windowSize: 10,                      // bots track last N hands
    threeBetAdjustThreshold: 3,          // hero folds to 3-bet N times → bot widens
    shortStackThreshold: 20,             // BB — switch to push/fold
    deepStackThreshold: 150,             // BB — loosen up with speculative hands
  },

  // ─── Animation & UX ──────────────────────────────────────────
  animation: {
    dealStagger: 100,                    // ms between each card dealt
    botThinkingDelay: [800, 2500],       // ms range for bot "thinking"
    showdownPause: 2000,                 // ms pause at showdown before next hand
  },

  // ─── Stats Panel ─────────────────────────────────────────────
  stats: {
    minHandsForDisplay: 10,              // show "—" until this many hands
    personaRevealThreshold: 30,          // show bot "read" after N hands
    handLogSize: 50,                     // last N hands kept in log
    profitHistorySize: 20,               // sparkline shows last N hands
  },

  // ─── Session & Bankroll ───────────────────────────────────────
  session: {
    heroTimeoutMs: 5 * 60 * 1000,        // 5 minutes of inactivity = session pause
    autoSaveIntervalMs: 60 * 1000,        // save to Supabase every 60s
    rebuyEnabled: true,                    // allow re-buy after bust-out
    // Re-buy starts a new session (separate P&L from the bust-out session)
  },

  // ─── Persistence ─────────────────────────────────────────────
  storage: {
    localStorageKey: 'holdem-simulator-session',
  },
}
