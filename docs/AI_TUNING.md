# AI tuning log

How the computer players are measured and changed (docs/PLAN.md section 9.7). Every batch is
recorded here, kept or reverted. Raw results for each batch (every game, seed by seed) are in
`docs/sim/`.

## The method

- `npm run sim` plays whole AI-only games headless, in parallel threads. The same seeds and
  options always give the same games.
- A change to the AI is a **challenger**: a patch of AI weights in `rules-dev/ai/<tag>.json`
  (data only). The **champion** is the AI as committed (the tag in `src/ai/version.js`).
- Head to head: the challenger takes half the seats (alternating) and the champion the other
  half, then every seed is played again with the seats swapped: 20 games. The challenger is
  kept only if it wins **more than 55% of the decided games** and breaks no healthy range
  (checked with a 40-game batch of the challenger on every seat). If the result is close,
  20 more games are played on fresh seeds and the 40 are judged together.
- Kept patches are copied into `rules/base-ancient/ai/weights.json` and the tag goes up.
  Reverted patches stay in `rules-dev/ai/` as a record.
- All batches: Small map, Quick speed, 4 players, base-ancient, raiders on.

## Healthy ranges (section 9.7)

| Line | Healthy range |
| --- | --- |
| Win rate by faction | No faction above twice the average; none at 0% across 40 games |
| Win rate by victory type | Each enabled type wins at least 5% of games |
| Average turn of victory | 150 to 260 (Small, Quick) |
| Stalled games | Under 20% |
| Errors | 0 refused AI commands, 0 NaN, 0 crashes |
| Round time | Under 2 s on a Large 8-faction map (`npm run perf`) |

## Phase 10 state (champion ai-v2, 40 games, seeds 1000 to 1039)

The latest batch is phase 11's, below.

Wins by faction (wins / games played):

| Faction | Wins | Games | Win rate |
| --- | --- | --- | --- |
| Persia | 9 | 26 | 35% |
| Egypt | 8 | 24 | 33% |
| Greece | 7 | 18 | 39% |
| Han | 6 | 19 | 32% |
| Carthage | 3 | 17 | 18% |
| Gaul | 3 | 19 | 16% |
| Britons | 2 | 15 | 13% |
| Rome | 2 | 22 | 9% |

Wins by victory type:

| Victory | Games | Share |
| --- | --- | --- |
| Score (turn 220) | 36 | 90% |
| Science | 4 | 10% |
| Conquest | 0 | 0% |

- Average victory turn 219; no stalled games; 0 refused commands, 0 NaN, 0 crashes.
- **One healthy range is still broken: conquest wins 0%, against a target of at least 5%.**
  See "Open problems" below.
- Round time: a Large 8-faction game at turn 200 takes 150 to 450 ms a round in Node
  (`npm run perf`) and its slowest of ten rounds took 290 ms in Chromium (dev page, jump
  turns): well under the 2 s target.

## Batches

### 2026-11-26: baseline, ai-v1 (40 games, seeds 1000 to 1039)

- Score 35 (88%), science 5 (13%), conquest 0.
- Persia won 13 of 26 (50%), over twice the average of 24%. Rome won 1 of 22.
- 0 errors; slowest round 437 ms. Broken ranges: Persia over 2x, conquest under 5%.
- What the games showed: each AI fought only one war at a time, and with no peace until
  diplomacy (phase 12) a war never ends, so an AI that declared on turn 31 never chose a
  second target. Nobody could take every capital.

### 2026-11-26: ai-v2 against ai-v1: KEPT

- Patch: up to two wars at once (`military.maxWars` 2, was 1), and on the conquest path
  original capitals count as 6 hexes nearer when choosing where to march
  (`military.capitalTargetPull` 6).
- Head to head, 20 games, seeds 2000 to 2009, seats swapped: challenger won 13 of 20 (65%).
- All seats ai-v2, 40 games: score 36, science 4, conquest 0; Persia 9 of 26 (35%, under
  twice the average). No range newly broken, and the Persia range is fixed.

### 2026-11-26: ai-v3 against ai-v2: REVERTED

- Patch: bolder wars (declare at 1.15 times the enemy's visible strength, was 1.4; from turn 25,
  was 30; 3 attackers per city at war, was 2; attack cities at 55% odds, was 70%).
- Head to head, 20 games, seeds 2010 to 2019: challenger won 9 of 20 (45%).
- Being bolder costs growth; the bold side loses on score.

### 2026-11-26: ai-v4 against ai-v2: REVERTED

- Patch: melee units wear cities down (attack a city when the blow deals 15 or more and leaves
  them with enough health; `thresholds.cityMeleeMinDealt`), and siege engines are worth 1.6
  times as much at war (`military.siegeAtWar`).
- Head to head, 20 games, seeds 2020 to 2029: challenger won 7 of 20 (35%).
- It did produce the first conquest win (Rome, turn 172), but the fighting sides fell behind
  while the peaceful ones won by science.

### 2026-11-26: ai-v5 against ai-v2: REVERTED

- Patch: like ai-v4 but only for AIs on the conquest path (`thresholds.cityMeleePaths`).
- Head to head, 20 games, seeds 2030 to 2039: 11 of 20 (55%), on the line, so 20 more on
  seeds 2040 to 2049: 9 of 20. Together 20 of 40 (50%).

The switches added for ai-v4 and ai-v5 stay in the code, off unless the data sets them, so a
later patch can use them.

### 2026-11-26: phase 11, civics and governments (ai-v6, 40 games, seeds 1000 to 1039)

Not a head-to-head: the rules themselves changed (a civics tree, governments and policy
cards), so this compares the same 40 seeds before (ai-v2, phase 10) and after (ai-v6, the new
civics and policy planner, weights in `ai/weights.json` "policy").

| Line | Before (ai-v2) | After (ai-v6) |
| --- | --- | --- |
| Score wins | 36 (90%) | 23 (57%) |
| Science wins | 4 (10%) | 17 (43%) |
| Conquest wins | 0 | 0 |
| Average victory turn | 219 | 212 |
| Persia | 9 of 26 (35%) | 11 of 26 (42%) |
| Rome | 2 of 22 | 4 of 22 |
| Errors | 0 | 0 |
| Slowest round (Small) | 310 ms | 516 ms |

- Every AI adopts Chiefdom early (turns 8 to 24), then Republic or Autocracy around turns
  42 to 66, and fills its card slots. In the first trial everyone chose Republic, so the
  governments were rebalanced in data (Autocracy gains a wildcard slot and cheaper land units;
  Monarchy trades a military slot for an economic one); both are now chosen.
- Civics and cards speed up building empires, so science victories rose from 10% to 43%.
- Conquest is still 0% (see below). Persia is within twice the average (42% against 24%).
- Large 8-faction rounds at turn 200: 386 to 630 ms in Node (target under 2 s).

### 2026-11-26: phase 12, diplomacy (ai-v7, 40 games, seeds 1000 to 1039)

Again a rules change, compared on the same 40 seeds: phase 11 (ai-v6) against phase 12 (ai-v7,
with the diplomacy planner: answering offers with evaluateDeal, offering peace when losing,
treaties with those it likes, denouncing before a planned war; weights in `ai/weights.json`
"diplomacy", plus `military.warnBeforeWar` 3).

| Line | Before (ai-v6) | After (ai-v7) |
| --- | --- | --- |
| Score wins | 23 (57%) | 26 (65%) |
| Science wins | 17 (43%) | 14 (35%) |
| Conquest wins | 0 | 0 |
| Average victory turn | 212 | 215 |
| Most wins (faction) | Persia 11 of 26 | Britons 6 of 15 (Persia 5 of 26) |
| Errors | 0 | 0 |
| Slowest round (Small) | 516 ms | 831 ms |

- In sample games AIs meet, sign open borders, defensive pacts and alliances, denounce,
  declare formal wars after denouncing, and sometimes make peace again.
- Faction wins are the most even yet; Persia's earlier lead is gone.
- Conquest is still 0%: wars can now end in peace, and defensive pacts pull friends in, both of
  which protect the weaker side.
- Large 8-faction rounds at turn 200: 506 to 578 ms in Node (target under 2 s).

### 2026-11-26: phase 13, religion (ai-v8, 40 games, seeds 1000 to 1039)

A rules change again, compared on the same 40 seeds: phase 12 (ai-v7) against phase 13 (ai-v8,
with the religion planner, missionary tactics and a religious victory path; weights in
`ai/weights.json` "religion"). Two data changes came from trial games, where no AI founded a
religion: faith costs now scale with game speed like every other cost, and two leaders lean
religious (Hatshepsut 1.4, Boudica 1.3; everyone else 0.8).

| Line | Before (ai-v7) | After (ai-v8) |
| --- | --- | --- |
| Score wins | 26 (65%) | 13 (33%) |
| Science wins | 14 (35%) | 12 (30%) |
| Religious wins | (not enabled) | 15 (38%) |
| Conquest wins | 0 | 0 |
| Average victory turn | 215 | 195 |
| Errors | 0 | 0 |
| Slowest round (Small) | 831 ms | 778 ms |

- Religious victories meet the healthy range (at least 5%) and are now the most common way to
  win on Small maps, with four factions; they may be a little strong, which is a question for
  the phase 16 balance pass (pressure and conversion numbers are all in `tuning.religion`).
- Faction wins stay even (Egypt 7 of 24, Rome 6 of 22, Persia 6 of 26, Britons 3 of 15).
- Large 8-faction rounds at turn 200: 427 to 651 ms in Node.

### 2026-11-26: phase 14, trade (ai-v9, 40 games, seeds 1000 to 1039)

A rules change, compared on the same 40 seeds: phase 13 (ai-v8) against phase 14 (ai-v9, with
the trade planner: traders while routes are short of half the cities, and each trader sent on
the best route by category weights; weights in `ai/weights.json` "trade").

| Line | Before (ai-v8) | After (ai-v9) |
| --- | --- | --- |
| Science wins | 12 (30%) | 17 (43%) |
| Religious wins | 15 (38%) | 12 (30%) |
| Score wins | 13 (33%) | 11 (28%) |
| Conquest wins | 0 | 0 |
| Average victory turn | 195 | 192 |
| Most wins (faction) | Egypt 7 of 24 | Carthage 8 of 17 (47%, within twice the average) |
| Errors | 0 | 0 |

- In sample games each AI runs about 4 to 15 routes at a time, domestic and foreign, renewing
  them every 30 turns.
- A leftover check from phase 6 had stopped every unit that needs a civic from being built; it
  was found and removed while testing traders.
- Large 8-faction rounds at turn 200: about 0.6 to 1.2 s in Node (empires are bigger now: 54
  cities by turn 200 against 47). Opinions are now worked out only when read, and a faction's
  effects once per sight update, which keeps this under the 2 s target.

### 2026-11-26: phase 15, espionage (ai-v10, 40 games, seeds 1000 to 1039)

A rules change, compared on the same 40 seeds: phase 14 (ai-v9) against phase 15 (ai-v10, with
the espionage planner: up to 3 spies within the cap, the first defending the capital, the rest
posted to the rival city it likes least or is at war with, running the mission worth most when its
odds are 40% or better; weights in `ai/weights.json` "espionage").

| Line | Before (ai-v9) | After (ai-v10) |
| --- | --- | --- |
| Science wins | 17 (43%) | 14 (35%) |
| Score wins | 11 (28%) | 14 (35%) |
| Religious wins | 12 (30%) | 12 (30%) |
| Conquest wins | 0 | 0 |
| Average victory turn | 192 | 194 |
| Most wins (faction) | Carthage 8 of 17 | Carthage 8 of 17, Persia 8 of 26 |
| Errors | 0 | 0 |

- In sample games each AI runs 20 to 35 missions; every outcome turns up (success, identified,
  escaped, captured), and spies reach level 3.
- Large 8-faction rounds at turn 200: about 0.66 to 1.0 s in Node.

### 2026-11-26: phase 16, culture and events (ai-v10, 20 games, seeds 1000 to 1019)

- With the culture path and events in, before any tuning: science 8, score 7, religious 3,
  culture 2, conquest 0. Rome 0 of 10. 0 errors.

### 2026-11-26: rules test, cities heal 10 a turn (was 20): REVERTED

- Same 20 seeds: conquest still 0, Gaul and Rome 0. No gain, so back to 20.

### 2026-11-26: ai-v11 against ai-v10: REVERTED

- Patch: every AI at war gathers its army 3 hexes from the target until 4 units stand there
  (`military.musterUnits`, `musterDistance`).
- Head to head, 20 games, seeds 2050 to 2059, seats swapped: challenger won 9 of 20 (45%).

### 2026-11-26: ai-v12 against ai-v10: KEPT

- Patch: only AIs on the conquest path muster (`military.musterPaths`) and wear cities down
  with melee (ai-v5's `cityMeleeMinDealt` 15 with `cityMeleePaths`).
- Head to head, 20 games, seeds 2060 to 2069, seats swapped: challenger won 12 of 20 (60%).

### 2026-11-26: phase 16 final (ai-v12, 40 games, seeds 1000 to 1039)

Rules changes in this batch: Trajan's +1 production in every city; Pericles' culture bias 1.3.

| Line | Result | Range |
| --- | --- | --- |
| Science wins | 14 (35%) | met |
| Religious wins | 12 (30%) | met |
| Score wins | 9 (23%) | met |
| Culture wins | 5 (13%) | met |
| Conquest wins | 0 | **not met** (5% needed) |
| Average victory turn | 185 | met (150 to 260) |
| Stalled games | 0 | met |
| Most wins (faction) | Egypt 8 of 24 (average 5) | met (under 2x) |
| Fewest wins (faction) | Britons and Han 3 | met (none at 0) |
| Errors | 0 | |

- Rome went from 0 to 7 wins. Slowest round 379 ms.
- In sample games conquest AIs now capture 5 to 17 cities and knock a faction out, and one
  ended holding two original capitals, but none takes all four before turn 220.

### 2026-11-27: Killzone Extrasolar War K5, star map and theatre AI (side war, kw_vekta)

New: `node tools/sim.mjs --war [preset] [--scenario id] --speed standard --games N` plays the
six-faction war and checks the targets in docs/KILLZONE.md 7.1. Those targets need about 100
games to measure well, more than CLAUDE.md allows without asking, so every batch here is 4 to 8
games: a direction, not a verdict. The K5 AI is new behaviour (the K4 AI had no star map play
at all), so there was no previous version to race; every step was kept only when the trace or
batch showed it better, and reverted otherwise.

| Step | Battles on the ground | Landings a game | Worlds captured | Result |
| --- | --- | --- | --- | --- |
| Start of K5 (4 games, quick) | 0 | 1 | none | every game to the time limit; fleets stand off for ever |
| Fleets land on the way, dare more each turn held back (8) | few | 13 | none | the Helghast side wins all 8 (support pinned at 100 by propaganda) |
| Propaganda 1 a round (cost 40); campaign lengths 80, 120, 200 by speed (8, standard) | 0 | 6 | none | average length 120 (target met); landed troops surrender out of supply |
| Fleets keep cruisers over a beachhead and drop supplies; engineers build landing bays; key sites (8) | some | 5 to 7 | Midway, Kerberos early | still slow: single squads thrown at Ardent |
| Engine fix: a supply drop lasted less than a round when seats were shuffled | | | | troops on a beachhead no longer surrender while supplied |
| Ferry to the world with most of our troops (8) | | 7 | | no change: REVERTED |
| Dead heats settled by seat order, reported apart (8) | | 7 | | 4 dead heats; side 1 won the other 4 |

Latest batch, 8 games, seeds 1000 to 1007, standard speed:

| Target (docs/KILLZONE.md 7.1) | Result | Met? |
| --- | --- | --- |
| Each side wins 45 to 55% | side 0 won 0, side 1 won 4, 4 dead heats | **no** |
| Each victory type 10% or more | all 8 by time | **no** |
| Average length 90 to 140 | 120 | yes |
| A home world invaded in 30 to 60% | 3 of 8 (38%) | yes |
| Every faction tops glory 8% or more | Stahl 5, Army 3 | **no** |
| Refused orders, NaN, crashes | 0, 0, 0 | |

- Why the Helghast side wins the decided games: the Navy reaches Vekta (a home landing costs
  the ISA 10 support) while the ISA Fleet's landings on Ardent are one squad at a time and are
  mopped up. The ISA never reaches Helghan.
- Why the rest are dead heats: once the neutral worlds fall in the first ten turns, neither side
  takes another world, so war support only moves with propaganda, equally for both.

### 2026-11-28: Killzone Extrasolar War, 100-game balance runs (approved by Matthew)

Every batch: `node tools/sim.mjs --war --games 100 --speed standard`, seeds 1000 to 1099, six
computer factions on kw_vekta, 120-turn campaign. Between batches, 12 to 16 game traces
(aggregated support, glory, landings, surrenders and battles) found the cause of each problem.

| # | Change | Sides (ISA / Helghast / dead heats) | ISA share of decided | Home invaded | Decisive wins | Kept? |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline (end of K5) | 14 / 49 / 37 | 22% | 22 | 0 | |
| 1 | Transports wait for an assault group of 3 | 99 / 0 / 1 | 100% | 0 | 0 | kept with 2 to 4 (the war froze; it needed troops to carry) |
| 2 | Landing bays need no research; 30-turn beachhead guard; held key sites supply 3 hexes; troops cut off head for supply; no landings on held worlds; armies of 4 a base; fleets with nobody to embark go where the armies are; shared sight between allies; lost fleets rebuilt | 31 / 60 / 9 | 34% | 3 | 3 | yes |
| 3 | Embark only while holding the orbit (fixed 821 refused orders) | 37 / 60 / 3 | 38% | 3 | 3 | yes (committed as round 1) |
| 4 | Engineers stay home instead of joining landings | 37 / 60 / 3 | 38% | 3 | 3 | yes (no change to balance; home fronts keep their engineers) |
| 5 | Supply gentler in this war: 5 health a turn, surrender after 5 turns, drops cover 3 hexes | 55 / 39 / 6 | 59% | 4 | 0 | yes |
| 6 | Assault group of 6 | 98 / 2 / 0 | 98% | 0 | 0 | REVERTED |
| 7 | Glory: held ambitions every 10 rounds, battles 5, landing glory for the fleets' own targets (Ardent; Halcyon, Bastion) | 90 / 10 / 0 | 90% | 3 | 0 | yes, for glory: 4 factions top it at least 8% (was 2) |
| 8 | Propaganda costs 30 (was 40) | 94 / 6 / 0 | 94% | 5 | 0 | REVERTED |
| 9 | Time victory needs a lead of 5 support; closer is settled by worlds held, then a coin toss | 66 / 12 / 22 | 85% | 3 | 0 | yes: honest about stalemates |
| 10 | Without the new landing ambitions | 42 / 11 / 47 | 79% | 3 | 0 | REVERTED |

Final (row 9, re-run after rebuilding the content: identical):

| Target (docs/KILLZONE.md 7.1) | Baseline | Final | Met? |
| --- | --- | --- | --- |
| Each side wins 45 to 55% | 22% / 78% | 85% / 15% (22 stalemates) | **no** |
| Each victory type 10% or more | all by time | all by time | **no** |
| Average length 90 to 140 | 120 | 120 | yes |
| A home world invaded in 30 to 60% | 22% | 3% | **no** |
| Every faction tops glory 8% or more | 2 of 6 | 4 of 6 (Fleet 50, Stahl 21, Navy 14, Home Guard 12; Army 3, Strategic Command 0) | **no** (closer) |
| Refused orders, NaN, crashes | 0 | 0 | |

What the traces show, in gameplay terms:
- **The war on the ground now happens** (about 4 battles a game, was 1 in 16 games; about 9
  landings a game; surrenders down by more than half), but no one ever takes a defended base.
  Armies of 3 to 4 landed troops cannot beat a base (200 health, strength 27, often walled by
  trenches), so no world held by the enemy changes hands, capitals never fall, and the war
  support and territory victories never trigger.
- **So every game is decided on time**, by a few points of war support. The ISA side's lead
  comes from propaganda (about 1.7 points a game more: its AIs pick the State Broadcasts card,
  +1 propaganda a base, more often) and from taking Midway slightly more often than the
  Helghast take Kerberos. Small AI changes swing which side edges it (rows 5, 7 and 8 show
  59%, 90% and 94% from changes that do not touch the fighting), which is why tuning numbers
  alone cannot meet the side target.
- **Home invasions fell** (22% to 3%) because the old ones were lone squads dropped on Vekta
  that surrendered; now fleets only sail with a group, and the Navy rarely gathers one for Vekta.

### 2026-11-28: Killzone Extrasolar War, teaching the computer to take bases (100 games a batch)

Same set-up as the batches above. What a base is, in rules terms: 200 health, it heals 20 a turn
unless attacked the turn before, and it fights at the strength of the best infantry its owner
could build plus 3 (more with walls or a bunker complex). So it can fall to steady pressure, but
not to cheap units, and not to troops that cannot reach it.

| # | Change | Sides (ISA / Helghast / dead heats) | ISA share of decided | Landings a game | Kept? |
| --- | --- | --- | --- | --- | --- |
| 0 | Start (end of the previous round) | 66 / 12 / 22 | 85% | 7 | |
| 1 | Sieges: with 3 of our side's troops on a world, gather 2 hexes from the enemy base nearest our army, then assault on siege terms (theatre.siegeUnits, siegeRange, siege); cruisers may bombard a base (space.strikeCity 40) and strike the base under siege; the beachhead guard is 3 turns, not 30, so fleets ferry waves; a fleet with a group aboard tops up with one more, and with no one left at its base sails to the side's biggest army; allies' troops count towards a siege; a base attack only on a fair trade (siege.cityMinDamageRatio 0.4) | 33 / 64 / 3 | 34% | 25 | yes |
| 2 | Fleets land only groups allowed on that world (no vehicles on stations) | 39 / 59 / 2 | 40% | 25 | yes |
| 3 | A ready siege fights the ring of defenders on siege terms too (attackMinWinChance 0.4, attackMinDamageRatio 0.8) | | | | yes (no measurable change; the ordinary rules already took those fights) |
| 4 | Cruisers clear the ring of defenders before bombarding the base | 40 / 57 / 3 | 41% | 26 | yes |
| 5 | A hex where a landing failed (a hidden enemy) is not tried again | 40 / 58 / 2 | 41% | 26 | yes (refused orders 21 to 0) |

| 6 | Base bombardment 80 (was 40) and the council's objective weighted 10 (was 4) | 46 / 21 / 33 | 69% | 17 | REVERTED |
| 7 | Base bombardment 80 alone | 40 / 58 / 2 | 41% | 26 | REVERTED (identical to row 5: base strikes are too rare to matter) |

Final (row 5): side balance 41% / 59% (closest yet; target 45 to 55%), 2 stalemates, about
43 ground battles a game (was 4), 26 landings a game, 0 refused orders; length 120. Still
every game is decided on time: in 16 traced games there were 18 attacks on bases and 3
bombardments of a base, and no base fell.

Why bases still hold, in gameplay terms: sieges are rare (about one a game) because a side
seldom has 3 troops together on an enemy world, and when it does the base is ringed by
fortified defenders in trenches; the defender's bases keep producing (Home Guard militia are
30% cheaper), so the ring refills faster than a few landed squads can cut it down. The attacker
has no edge in numbers: both sides build the same 4 troops a base. Making bases fall now needs
a design choice (see the options in the open problems), not more AI tuning.

## Open problems

- **Conquest wins 0%.** Every other range is met. Since ai-v12 conquest AIs take cities and
  knock rivals out, but holding all four original capitals by turn 220 at Quick speed has not
  happened yet. Ideas for later phases: a later turn limit at Quick, or conquest-minded AIs
  making peace with distant rivals to focus on one neighbour at a time.
- **Killzone Extrasolar War: bases do not fall yet.** The computer now lands waves, besieges,
  bombards and fights constantly (side balance 41% / 59%), but defenders refill faster than an
  invasion can wear them down, so every war ends on time. Options for Matthew (each would be
  measured the same way): stronger orbital bombardment of bases; bases that heal less in this
  war; units on a world with no friendly base cost more to replace (an invader's edge); or the
  war council sending both allies' fleets to one objective so an invasion arrives in force.
