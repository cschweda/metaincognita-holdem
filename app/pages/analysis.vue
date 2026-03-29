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
      <div class="text-lg font-bold font-mono text-white mt-1">$172.3</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Preflop Folds</div>
      <div class="text-lg font-bold font-mono text-white mt-1">635 (63.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Flops Seen</div>
      <div class="text-lg font-bold font-mono text-white mt-1">365 (36.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Turns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">341 (34.1%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Rivers</div>
      <div class="text-lg font-bold font-mono text-white mt-1">325 (32.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Showdowns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">266 (26.6%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">3-Bet Pots</div>
      <div class="text-lg font-bold font-mono text-white mt-1">229 (22.9%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">All-Ins</div>
      <div class="text-lg font-bold font-mono text-white mt-1">156 (15.6%)</div>
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
        <td class="py-1.5 px-2 text-white">Boyle Drunson</td>
        <td class="text-right px-2 font-mono text-gray-300">$8189</td>
        <td class="text-right px-2 font-mono text-green-400">+$7589</td>
        <td class="text-right px-2 font-mono text-gray-500">2</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Serik Eidel</td>
        <td class="text-right px-2 font-mono text-gray-300">$437</td>
        <td class="text-right px-2 font-mono text-red-400">$-2163</td>
        <td class="text-right px-2 font-mono text-gray-500">12</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Ncotty Sguyen</td>
        <td class="text-right px-2 font-mono text-gray-300">$327</td>
        <td class="text-right px-2 font-mono text-red-400">$-3673</td>
        <td class="text-right px-2 font-mono text-gray-500">19</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Krynn Benney</td>
        <td class="text-right px-2 font-mono text-gray-300">$3835</td>
        <td class="text-right px-2 font-mono text-green-400">+$1435</td>
        <td class="text-right px-2 font-mono text-gray-500">11</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Cohnny Jhan</td>
        <td class="text-right px-2 font-mono text-gray-300">$334</td>
        <td class="text-right px-2 font-mono text-red-400">$-866</td>
        <td class="text-right px-2 font-mono text-gray-500">5</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Sanessa Velbst</td>
        <td class="text-right px-2 font-mono text-gray-300">$198</td>
        <td class="text-right px-2 font-mono text-red-400">$-3402</td>
        <td class="text-right px-2 font-mono text-gray-500">17</td>
      </tr></tbody></table>
</section>

<section class="mb-10"><h2 class="text-xl font-bold text-white mb-4">8-Player Table &mdash; 1000 Hands</h2>
<div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Avg Pot</div>
      <div class="text-lg font-bold font-mono text-white mt-1">$302.2</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Preflop Folds</div>
      <div class="text-lg font-bold font-mono text-white mt-1">501 (50.1%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Flops Seen</div>
      <div class="text-lg font-bold font-mono text-white mt-1">499 (49.9%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Turns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">471 (47.1%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Rivers</div>
      <div class="text-lg font-bold font-mono text-white mt-1">454 (45.4%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Showdowns</div>
      <div class="text-lg font-bold font-mono text-white mt-1">385 (38.5%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">3-Bet Pots</div>
      <div class="text-lg font-bold font-mono text-white mt-1">324 (32.4%)</div>
    </div><div class="bg-gray-800/60 rounded-lg p-3">
      <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider">All-Ins</div>
      <div class="text-lg font-bold font-mono text-white mt-1">212 (21.2%)</div>
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
        <td class="py-1.5 px-2 text-white">Aatrik Pantonius</td>
        <td class="text-right px-2 font-mono text-gray-300">$229</td>
        <td class="text-right px-2 font-mono text-red-400">$-3771</td>
        <td class="text-right px-2 font-mono text-gray-500">19</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Naniel Degreanu</td>
        <td class="text-right px-2 font-mono text-gray-300">$9592</td>
        <td class="text-right px-2 font-mono text-green-400">+$8792</td>
        <td class="text-right px-2 font-mono text-gray-500">3</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Boyle Drunson</td>
        <td class="text-right px-2 font-mono text-gray-300">$563</td>
        <td class="text-right px-2 font-mono text-red-400">$-2837</td>
        <td class="text-right px-2 font-mono text-gray-500">16</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Cohnny Jhan</td>
        <td class="text-right px-2 font-mono text-gray-300">$475</td>
        <td class="text-right px-2 font-mono text-red-400">$-3725</td>
        <td class="text-right px-2 font-mono text-gray-500">20</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Kabe Gaplan</td>
        <td class="text-right px-2 font-mono text-gray-300">$247</td>
        <td class="text-right px-2 font-mono text-red-400">$-4153</td>
        <td class="text-right px-2 font-mono text-gray-500">21</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Lhil Paak</td>
        <td class="text-right px-2 font-mono text-gray-300">$9718</td>
        <td class="text-right px-2 font-mono text-green-400">+$7518</td>
        <td class="text-right px-2 font-mono text-gray-500">10</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Sanessa Velbst</td>
        <td class="text-right px-2 font-mono text-gray-300">$982</td>
        <td class="text-right px-2 font-mono text-red-400">$-3018</td>
        <td class="text-right px-2 font-mono text-gray-500">19</td>
      </tr><tr class="border-b border-gray-800/50">
        <td class="py-1.5 px-2 text-white">Ncotty Sguyen</td>
        <td class="text-right px-2 font-mono text-gray-300">$202</td>
        <td class="text-right px-2 font-mono text-red-400">$-3398</td>
        <td class="text-right px-2 font-mono text-gray-500">17</td>
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
<details class="mt-3" open><summary class="cursor-pointer text-blue-400 hover:text-blue-300 text-xs font-semibold uppercase tracking-wider">Sample Hand 1</summary><div class="bg-gray-950 rounded-lg p-4 mt-2 overflow-x-auto"><pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap text-gray-400">PokerStars Hand #1: Hold'em No Limit ($1/$2) - 2026-04-01 13:42:26 ET
Table 'Bot Simulation' 8-max Seat #1 is the button
Seat 1: Aatrik Pantonius ($200 in chips)
Seat 2: Naniel Degreanu ($199 in chips)
Seat 3: Boyle Drunson ($185 in chips)
Seat 4: Cohnny Jhan ($200 in chips)
Seat 5: Kabe Gaplan ($200 in chips)
Seat 6: Lhil Paak ($200 in chips)
Seat 7: Sanessa Velbst ($231 in chips)
Seat 8: Ncotty Sguyen ($185 in chips)
Naniel Degreanu: posts small blind $1
Boyle Drunson: posts big blind $2
*** HOLE CARDS ***
Cohnny Jhan: folds
Kabe Gaplan: folds
Lhil Paak: folds
Sanessa Velbst: raises to $4
Ncotty Sguyen: calls $4
Aatrik Pantonius: folds
Naniel Degreanu: folds
Boyle Drunson: calls $2
*** FLOP *** [5c 8h Jc]
Boyle Drunson: checks
Sanessa Velbst: raises to $11
Ncotty Sguyen: calls $11
Boyle Drunson: calls $11
*** TURN *** [5c 8h Jc] [5d]
Boyle Drunson: checks
Sanessa Velbst: checks
Ncotty Sguyen: checks
*** RIVER *** [5c 8h Jc 5d] [9c]
Boyle Drunson: checks
Sanessa Velbst: raises to $37
Ncotty Sguyen: folds
Boyle Drunson: folds
*** SHOW DOWN ***
Sanessa Velbst: shows [7d 5h]
Sanessa Velbst collected $83 from pot
*** SUMMARY ***
Total pot $83 | Rake $0
Board [5c 8h Jc 5d 9c]
Seat 1: Aatrik Pantonius (button) folded
Seat 2: Naniel Degreanu (small blind) folded
Seat 3: Boyle Drunson (big blind) folded
Seat 4: Cohnny Jhan  folded
Seat 5: Kabe Gaplan  folded
Seat 6: Lhil Paak  folded
Seat 7: Sanessa Velbst  showed [7d 5h] and won ($83)
Seat 8: Ncotty Sguyen  folded</pre></div></details>
<details class="mt-3"><summary class="cursor-pointer text-blue-400 hover:text-blue-300 text-xs font-semibold uppercase tracking-wider">Sample Hand 2</summary><div class="bg-gray-950 rounded-lg p-4 mt-2 overflow-x-auto"><pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap text-gray-400">PokerStars Hand #3: Hold'em No Limit ($1/$2) - 2026-04-01 13:42:26 ET
Table 'Bot Simulation' 8-max Seat #3 is the button
Seat 1: Aatrik Pantonius ($183 in chips)
Seat 2: Naniel Degreanu ($199 in chips)
Seat 3: Boyle Drunson ($201 in chips)
Seat 4: Cohnny Jhan ($200 in chips)
Seat 5: Kabe Gaplan ($198 in chips)
Seat 6: Lhil Paak ($200 in chips)
Seat 7: Sanessa Velbst ($231 in chips)
Seat 8: Ncotty Sguyen ($185 in chips)
Cohnny Jhan: posts small blind $1
Kabe Gaplan: posts big blind $2
*** HOLE CARDS ***
Lhil Paak: folds
Sanessa Velbst: folds
Ncotty Sguyen: folds
Aatrik Pantonius: raises to $6
Naniel Degreanu: folds
Boyle Drunson: calls $6
Cohnny Jhan: folds
Kabe Gaplan: folds
*** FLOP *** [Qd 9d Qc]
Aatrik Pantonius: checks
Boyle Drunson: checks
*** TURN *** [Qd 9d Qc] [7s]
Aatrik Pantonius: checks
Boyle Drunson: checks
*** RIVER *** [Qd 9d Qc 7s] [Ks]
Aatrik Pantonius: checks
Boyle Drunson: raises to $11
Aatrik Pantonius: calls $11
*** SHOW DOWN ***
Aatrik Pantonius: shows [Jc As]
Boyle Drunson: shows [9h 7h]
Boyle Drunson collected $37 from pot
*** SUMMARY ***
Total pot $37 | Rake $0
Board [Qd 9d Qc 7s Ks]
Seat 1: Aatrik Pantonius  showed [Jc As] and lost
Seat 2: Naniel Degreanu  folded
Seat 3: Boyle Drunson (button) showed [9h 7h] and won ($37)
Seat 4: Cohnny Jhan (small blind) folded
Seat 5: Kabe Gaplan (big blind) folded
Seat 6: Lhil Paak  folded
Seat 7: Sanessa Velbst  folded
Seat 8: Ncotty Sguyen  folded</pre></div></details>
</div></section>

<footer class="border-t border-gray-800 pt-6 mt-10 text-center text-xs text-gray-600">
<p>Generated by Hold'em Simulator &middot; April 1, 2026 &middot; 2,000 hands</p>
</footer>
</div></div>
</template>