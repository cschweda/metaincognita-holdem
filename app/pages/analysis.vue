<script setup lang="ts">
defineOptions({ name: "analysis" })
useHead({ title: 'Bot Analysis Report' })
</script>

<template>
<div class="min-h-screen bg-[#0a0a0f] text-gray-200">
<div class="max-w-5xl mx-auto px-4 py-8">
<div class="flex items-center justify-between mb-10">
<div>
<h1 class="text-3xl font-bold text-white">Bot Analysis Report</h1>
<p class="text-gray-400 mt-2">Generated April 1, 2026 &middot; 2,000 total hands &middot; $1/$2 Medium stakes</p>
<p class="text-gray-500 text-sm mt-1">How each bot's configured persona stats translate into observed behavior.</p>
</div>
<NuxtLink to="/"><UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">Back to Table</UButton></NuxtLink>
</div>

<section class="mb-10"><h2 class="text-xl font-bold text-white mb-4">6-Player Table &mdash; 1000 Hands</h2>
<div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Avg Pot</div>
      <div class="text-lg font-bold font-mono text-white mt-1">$274.4</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Preflop Folds</div>
      <div class="text-lg font-bold font-mono text-white mt-1">525 (52.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Flops Seen</div>
      <div class="text-lg font-bold font-mono text-white mt-1">475 (47.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Turns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">440 (44.0%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Rivers</div>
      <div class="text-lg font-bold font-mono text-white mt-1">410 (41.0%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Showdowns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">344 (34.4%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">3-Bet Pots</div>
      <div class="text-lg font-bold font-mono text-white mt-1">286 (28.6%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">All-Ins</div>
      <div class="text-lg font-bold font-mono text-white mt-1">182 (18.2%)</div>
    </div></div>
<div class="mt-6"><h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Observed vs Configured Stats</h3>
<p class="text-gray-500">No stats available</p>
<p class="text-xs text-gray-600 mt-2">Green = within 5% of config. Amber = &gt;5% deviation.</p></div>
<table class="w-full text-sm mt-4">
    <thead><tr class="border-b border-gray-700 text-gray-400 text-xs">
      <th class="text-left py-2 px-2">Bot</th>
      <th class="text-right px-2">Final Stack</th>
      <th class="text-right px-2">Profit</th>
      <th class="text-right px-2">Rebuys</th>
    </tr></thead>
    <tbody><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Loose Lucy</td>
        <td class="text-right px-2 font-mono text-gray-300">$194</td>
        <td class="text-right px-2 font-mono text-red-400">$-3406</td>
        <td class="text-right px-2 font-mono text-gray-500">17</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Calling Carl</td>
        <td class="text-right px-2 font-mono text-gray-300">$197</td>
        <td class="text-right px-2 font-mono text-red-400">$-3203</td>
        <td class="text-right px-2 font-mono text-gray-500">16</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Dom Twan</td>
        <td class="text-right px-2 font-mono text-gray-300">$1681</td>
        <td class="text-right px-2 font-mono text-red-400">$-2119</td>
        <td class="text-right px-2 font-mono text-gray-500">18</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Wild Wendy</td>
        <td class="text-right px-2 font-mono text-gray-300">$593</td>
        <td class="text-right px-2 font-mono text-red-400">$-5007</td>
        <td class="text-right px-2 font-mono text-gray-500">27</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Utu Sngar</td>
        <td class="text-right px-2 font-mono text-gray-300">$653</td>
        <td class="text-right px-2 font-mono text-red-400">$-2747</td>
        <td class="text-right px-2 font-mono text-gray-500">16</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Ihil Pvey</td>
        <td class="text-right px-2 font-mono text-gray-300">$14651</td>
        <td class="text-right px-2 font-mono text-green-400">+$13051</td>
        <td class="text-right px-2 font-mono text-gray-500">7</td>
      </tr></tbody></table>
</section>

<section class="mb-10"><h2 class="text-xl font-bold text-white mb-4">8-Player Table &mdash; 1000 Hands</h2>
<div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Avg Pot</div>
      <div class="text-lg font-bold font-mono text-white mt-1">$463.1</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Preflop Folds</div>
      <div class="text-lg font-bold font-mono text-white mt-1">437 (43.7%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Flops Seen</div>
      <div class="text-lg font-bold font-mono text-white mt-1">563 (56.3%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Turns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">544 (54.4%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Rivers</div>
      <div class="text-lg font-bold font-mono text-white mt-1">522 (52.2%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Showdowns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">447 (44.7%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">3-Bet Pots</div>
      <div class="text-lg font-bold font-mono text-white mt-1">429 (42.9%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">All-Ins</div>
      <div class="text-lg font-bold font-mono text-white mt-1">272 (27.2%)</div>
    </div></div>
<div class="mt-6"><h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Observed vs Configured Stats</h3>
<p class="text-gray-500">No stats available</p>
</div>
<table class="w-full text-sm mt-4">
    <thead><tr class="border-b border-gray-700 text-gray-400 text-xs">
      <th class="text-left py-2 px-2">Bot</th>
      <th class="text-right px-2">Final Stack</th>
      <th class="text-right px-2">Profit</th>
      <th class="text-right px-2">Rebuys</th>
    </tr></thead>
    <tbody><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Tight Tony</td>
        <td class="text-right px-2 font-mono text-gray-300">$576</td>
        <td class="text-right px-2 font-mono text-red-400">$-3224</td>
        <td class="text-right px-2 font-mono text-gray-500">18</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Loose Lucy</td>
        <td class="text-right px-2 font-mono text-gray-300">$470</td>
        <td class="text-right px-2 font-mono text-red-400">$-6330</td>
        <td class="text-right px-2 font-mono text-gray-500">33</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Aggressive Alex</td>
        <td class="text-right px-2 font-mono text-gray-300">$203</td>
        <td class="text-right px-2 font-mono text-red-400">$-4797</td>
        <td class="text-right px-2 font-mono text-gray-500">24</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Mike the Mouth</td>
        <td class="text-right px-2 font-mono text-gray-300">$3681</td>
        <td class="text-right px-2 font-mono text-red-400">$-1919</td>
        <td class="text-right px-2 font-mono text-gray-500">27</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Utu Sngar</td>
        <td class="text-right px-2 font-mono text-gray-300">$2071</td>
        <td class="text-right px-2 font-mono text-red-400">$-1929</td>
        <td class="text-right px-2 font-mono text-gray-500">19</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Bean-Robert Jellande</td>
        <td class="text-right px-2 font-mono text-gray-300">$1432</td>
        <td class="text-right px-2 font-mono text-red-400">$-2568</td>
        <td class="text-right px-2 font-mono text-gray-500">19</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Mhris Coneymaker</td>
        <td class="text-right px-2 font-mono text-gray-300">$13728</td>
        <td class="text-right px-2 font-mono text-green-400">+$10728</td>
        <td class="text-right px-2 font-mono text-gray-500">14</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Dom Twan</td>
        <td class="text-right px-2 font-mono text-gray-300">$6234</td>
        <td class="text-right px-2 font-mono text-green-400">+$4034</td>
        <td class="text-right px-2 font-mono text-gray-500">10</td>
      </tr></tbody></table>
</section>

<section class="mb-10"><h2 class="text-xl font-bold text-white mb-4">Realism Assessment</h2>
<div class="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-sm">
<div class="grid grid-cols-3 gap-3">
<div class="bg-gray-800/60 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-green-400">~75%</div><div class="text-xs text-gray-500">Overall Realism</div></div>
<div class="bg-gray-800/60 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-blue-400">21</div><div class="text-xs text-gray-500">Realism Fixes</div></div>
<div class="bg-gray-800/60 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-amber-400">3</div><div class="text-xs text-gray-500">Audit Rounds</div></div>
</div>
<p class="text-gray-400 mt-3">River polarization, MDF, pre-computed ranges, hero bet-sizing exploitation, SPR awareness, check-raises, kicker differentiation, board texture analysis.</p>
</div></section>

<section class="mb-10"><h2 class="text-xl font-bold text-white mb-4">PokerStars Hand History Format</h2>
<div class="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-sm text-gray-300 space-y-3">
<p>All hands export in <strong class="text-white">PokerStars format</strong> &mdash; compatible with PokerTracker, HEM, Equilab.</p>
<p class="text-gray-500"><a href="/sample-hands.txt" class="text-blue-400 hover:text-blue-300 underline underline-offset-2" download>Download the full 1000-hand simulation file</a></p>
<details class="mt-3" open><summary class="cursor-pointer text-blue-400 hover:text-blue-300 text-xs font-semibold uppercase tracking-wider">Sample Hand 1</summary><div class="bg-gray-950 rounded-lg p-4 mt-2 overflow-x-auto"><pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap text-gray-400">PokerStars Hand #2: Hold'em No Limit ($1/$2) - 2026-04-01 13:39:17 ET
Table 'Bot Simulation' 8-max Seat #2 is the button
Seat 1: Tight Tony ($200 in chips)
Seat 2: Loose Lucy ($194 in chips)
Seat 3: Aggressive Alex ($197 in chips)
Seat 4: Mike the Mouth ($212 in chips)
Seat 5: Utu Sngar ($194 in chips)
Seat 6: Bean-Robert Jellande ($198 in chips)
Seat 7: Mhris Coneymaker ($204 in chips)
Seat 8: Dom Twan ($198 in chips)
Aggressive Alex: posts small blind $1
Mike the Mouth: posts big blind $2
*** HOLE CARDS ***
Utu Sngar: calls $2
Bean-Robert Jellande: calls $2
Mhris Coneymaker: calls $2
Dom Twan: folds
Tight Tony: folds
Loose Lucy: folds
Aggressive Alex: folds
Mike the Mouth: checks
*** FLOP *** [5s 7d Ac]
Mike the Mouth: checks
Utu Sngar: checks
Bean-Robert Jellande: checks
Mhris Coneymaker: raises to $4
Mike the Mouth: calls $4
Utu Sngar: calls $4
Bean-Robert Jellande: folds
*** TURN *** [5s 7d Ac] [3d]
Mike the Mouth: checks
Utu Sngar: checks
Mhris Coneymaker: checks
*** RIVER *** [5s 7d Ac 3d] [9d]
Mike the Mouth: checks
Utu Sngar: checks
Mhris Coneymaker: checks
*** SHOW DOWN ***
Mike the Mouth: shows [Ah 2c]
Utu Sngar: shows [Jh Qd]
Mhris Coneymaker: shows [4c 4d]
Mike the Mouth collected $21 from pot
*** SUMMARY ***
Total pot $21 | Rake $0
Board [5s 7d Ac 3d 9d]
Seat 1: Tight Tony  folded
Seat 2: Loose Lucy (button) folded
Seat 3: Aggressive Alex (small blind) folded
Seat 4: Mike the Mouth (big blind) showed [Ah 2c] and won ($21)
Seat 5: Utu Sngar  showed [Jh Qd] and lost
Seat 6: Bean-Robert Jellande  folded
Seat 7: Mhris Coneymaker  showed [4c 4d] and lost
Seat 8: Dom Twan  folded</pre></div></details>
<details class="mt-3"><summary class="cursor-pointer text-blue-400 hover:text-blue-300 text-xs font-semibold uppercase tracking-wider">Sample Hand 2</summary><div class="bg-gray-950 rounded-lg p-4 mt-2 overflow-x-auto"><pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap text-gray-400">PokerStars Hand #3: Hold'em No Limit ($1/$2) - 2026-04-01 13:39:17 ET
Table 'Bot Simulation' 8-max Seat #3 is the button
Seat 1: Tight Tony ($400 in chips)
Seat 2: Loose Lucy ($194 in chips)
Seat 3: Aggressive Alex ($191 in chips)
Seat 4: Mike the Mouth ($12 in chips)
Seat 5: Utu Sngar ($192 in chips)
Seat 6: Bean-Robert Jellande ($198 in chips)
Seat 7: Mhris Coneymaker ($204 in chips)
Seat 8: Dom Twan ($198 in chips)
Mike the Mouth: posts small blind $1
Utu Sngar: posts big blind $2
*** HOLE CARDS ***
Bean-Robert Jellande: folds
Mhris Coneymaker: folds
Dom Twan: folds
Tight Tony: raises to $6
Loose Lucy: folds
Aggressive Alex: calls $6
Mike the Mouth: raises to $22
Utu Sngar: folds
Tight Tony: calls $16
Aggressive Alex: folds
*** FLOP *** [9h 2h 5s]
Mike the Mouth: raises to $41
Tight Tony: calls $41
*** TURN *** [9h 2h 5s] [9d]
Mike the Mouth: raises to $112
Tight Tony: bets $137 and is all-in
Mike the Mouth: bets $149 and is all-in
*** RIVER *** [9h 2h 5s 9d] [2d]
*** SHOW DOWN ***
Tight Tony: shows [Ac Ks]
Mike the Mouth: shows [Th Qs]
Tight Tony collected $420 from pot
*** SUMMARY ***
Total pot $420 | Rake $0
Board [9h 2h 5s 9d 2d]
Seat 1: Tight Tony  showed [Ac Ks] and won ($420)
Seat 2: Loose Lucy  folded
Seat 3: Aggressive Alex (button) folded
Seat 4: Mike the Mouth (small blind) showed [Th Qs] and lost
Seat 5: Utu Sngar (big blind) folded
Seat 6: Bean-Robert Jellande  folded
Seat 7: Mhris Coneymaker  folded
Seat 8: Dom Twan  folded</pre></div></details>
</div></section>

<footer class="border-t border-gray-800 pt-6 mt-10 text-center text-xs text-gray-600">
<p>Generated by Hold'em Simulator &middot; April 1, 2026 &middot; 2,000 hands</p>
</footer>
</div></div>
</template>