# Killzone: Extrasolar War design

Nov 27, 2026 · @Matthew Hawkes

Extrasolar War turns the Killzone mod into a war across a handful of worlds. You move fleets on a star map, Battlefront II Galactic Conquest style, and every world you fight over opens its own Atlas hex map where you dig trenches, build bunkers and push a front line. When armies clash, you can fight the battle yourself in your platoon module.

## 1. The idea in brief

A what-if Second Extrasolar War between six splinter factions, three ISA and three Helghast, fought over two home worlds, their moons and the stations in orbit. Either side can win, and home worlds can be invaded.

&#91;embedded content: three layers of play · star map, planet theatre, platoon battle\]

The star map is the strategy: where to send fleets, which world to invade, when to defend home. Theatres are the operations: holding ground, building war infrastructure and keeping armies supplied. Battles are the tactics, and they're optional: anything you don't fight yourself is auto-resolved.

**What makes it deeper than today's mod**

- **Several fronts at once.** You might be advancing on Helghan while holding Vekta's moon and fending off a raid on your own capital, so you have to choose where your fleets and reinforcements go.
- **Home worlds at risk.** As in the Dune expansion, losing orbit over your home world lets the enemy land there, and your capital can fall.
- **Building the war, not a civilisation.** Bases train units and run factories, while engineers build trenches, bunkers, machine gun nests, artillery and landing bays on the map itself.
- **Supply matters.** Armies cut off from depots, landing bays or bases wear down, so fronts are lines rather than scattered units.
- **Rivals on your own side.** Allied splinter factions share the war but compete for glory, resources and who leads the side when it ends.

## 2. The star map

Eight territories joined by space lanes, with the two home worlds at opposite ends and a contested middle. Holding orbit over a territory is what lets you land on it, supply it and bombard it, so fleets decide where wars can happen.

&#91;embedded content: star map · 8 territories, 10 lanes and a long jump\]

The names Halcyon, Bastion, Kerberos, Midway, Morrow and Ardent are invented for this war and can be renamed. Vekta and Helghan are the setting's own worlds.

**Territories**

| Territory | Kind | Theatre map | What holding it gives | Notes |
| --- | --- | --- | --- | --- |
| Vekta | Home world | Large, 60x38 hexes, temperate fields, cities and coast | ISA capital, most ISA industry | Loses war support if invaded |
| Helghan | Home world | Large, 60x38, ash plains, storms, refineries | Helghast capital, petrusite refineries | Arc lightning storms reduce sight and air support |
| Halcyon | Moon | Small, 24x18, low gravity, craters | +2 fleet supply; jump troops move +1 | ISA mining outposts |
| Morrow | Moon | Small, 24x18, penal mines, thin air | +manpower for the Helghast; prisoners can be freed by the ISA | Helghast labour camps |
| Kerberos Belt | Asteroid colony | Tiny, 18x12, linked rocks | The main petrusite source outside Helghan | Neutral at start; whoever arrives first claims it |
| Midway Relay | Deep-space station | Tiny, 14x10 decks | See every lane; fleets move one extra lane per turn from here | Neutral at start; the chokepoint |
| Bastion Station | Orbital dock | Tiny, 16x12 decks | Builds and repairs ISA ships; guards Vekta's orbit | Losing it opens Vekta to invasion |
| Ardent Platform | Arc defence station | Tiny, 16x12 decks | Fires arc bolts at enemy fleets near Helghan | Must be silenced before a safe landing on Helghan |

**Lanes**

Section 8 (K2) asks for "the 11 lanes from section 2", but no lanes are listed yet. A proposal, symmetrical so neither side starts with a better route, with two ways through the middle:

| Lane | Turns | Notes |
| --- | --- | --- |
| Vekta to Bastion Station | 1 |  |
| Vekta to Halcyon | 1 |  |
| Bastion Station to Halcyon | 1 |  |
| Helghan to Ardent Platform | 1 |  |
| Helghan to Morrow | 1 |  |
| Ardent Platform to Morrow | 1 |  |
| Bastion Station to Midway Relay | 1 | The northern route |
| Ardent Platform to Midway Relay | 1 | The northern route |
| Halcyon to Kerberos Belt | 1 | The southern route |
| Morrow to Kerberos Belt | 1 | The southern route |
| Vekta to Helghan | 3 | The long jump: heavy fleets only, seen coming |

**What you can see on the star map.** The plan implies fog in space (Midway "sees every lane", the long jump is "seen coming") but never says what you normally see. Suggest: you always see every territory and who owns it, but enemy fleets only at territories you hold or are next to; Midway shows fleets on every lane.

**Fleets**

- Ships are units on the star map, grouped into fleets of up to 6 ships.
- **Cruisers** are slow and powerful. They carry 3 army groups and can bombard a theatre hex once a turn.
- **Destroyers and frigates** are escorts that fight other ships.
- **Dropship wings** (ISA Intruders, Helghast dropships) are what actually land troops. No dropships means no landing.
- **Transports** carry army groups but can't fight.
- Most moves cover one lane per system turn. The long jump between home worlds takes 3 turns, can only be made by heavy fleets, and the target sees it coming.

**Orbit and landings**

- You hold orbit over a territory when only your side's warships are there. Contested orbit means a space battle, which is auto-resolved with odds shown first.
- Holding orbit lets you land army groups at your landing bays, or at drop zones not covered by enemy anti-air. It also lets you call orbital strikes and supply drops, and blockade the territory.
- A blockade cuts the territory's trade and credits and stops enemy reinforcements arriving from space.
- **Home worlds are open to attack.** If the enemy holds orbit over your home world, they can land there. Losing your capital base knocks your faction out (your allies fight on) and costs your whole side war support.

## 3. Planet theatres

Every territory has its own Atlas hex map, the theatre, which keeps its state for the whole war. A theatre becomes active when both sides have ground forces in it. You win it, and capture the territory, by holding every key site with no enemy army left on the map.

**What carries over from today's mod.** The front-line system already built in phase 19 (tile control from -100 to +100, pushed by armies and battles, sites changing hands) becomes the heart of each theatre. It now runs separately on every world.

### 3.1 Supply

Supply is the new rule that makes fronts behave like WW2 front lines rather than a scatter of units.

- **Sources:** bases (cities), supply depots, landing bays and forward command posts each supply hexes within a range set in data (bases 4, depots and command posts 3, landing bays 2).
- **Lines:** supply spreads only through hexes your side controls (front control above +25 for you), so a broken front cuts units off.
- **Out of supply:** a unit loses 10 HP a turn, can't heal, and fights at -5 strength. After 3 turns cut off it can surrender. Watch how this stacks with Helghan's toxic ash: an ISA unit cut off there would lose 15 HP a turn and be gone in under seven turns, so the simulator should confirm an invasion of Helghan is winnable at all.
- **Orbital supply drops** from a cruiser in orbit can supply one area for a turn, which helps a landing hold on until a landing bay is built.

### 3.2 War infrastructure

Engineers build on the map, the way builders make farms today. Each piece is a tile improvement with combat effects set in data, and the most important ones appear on the battlefield when a platoon battle is fought there.

| Build | Engineer turns | Effect on the theatre map | In a platoon battle |
| --- | --- | --- | --- |
| Trench line | 2 | +4 defence; zone of control even when empty; links with trenches next to it | Trenches dug across the field |
| Sandbags and razor wire | 1 | Enemies entering lose all remaining moves | Wire belts that slow squads |
| Machine gun nest | 2 | +2 defence; free shot at the first enemy that ends a move next to it | A fixed MG emplacement |
| Bunker | 4 | +8 defence; garrison takes half damage from orbital and artillery strikes | A bunker objective |
| Artillery battery | 3 | Ranged attack from the hex, range 3, needs a crew unit | Off-map artillery calls for its side |
| Anti-air battery | 3 | Blocks enemy drop zones and orbital strikes within 2 hexes | Shoots down dropships |
| Arc tower (Helghast) | 3, needs petrusite | Hits every enemy next to it each turn | Arc tower objective |
| Minefield | 1 | Hidden from the enemy; damages the first unit to enter | Mines on the field |
| Landing bay | 4 | Reinforcements from orbit arrive here; supply source | Reinforcement point |
| Supply depot | 3 | Supply source, range 3 | Ammunition crates |
| Forward command post | 4 | Supply source; lets bases buy units that appear here | Command post objective |
| Field hospital | 2 | Units here heal 20 a turn | Wounded soldiers recover faster |
| Comms relay | 2 | +2 sight for nearby units; reveals hidden minefields | Better spotting |
| Petrusite extractor | 3, on petrusite | +2 petrusite a turn | None |

### 3.3 Orbital support

- **Orbital strike:** a cruiser in orbit hits one theatre hex a turn (strength 60 against everything there), and is blocked by anti-air within 2 hexes.
- **Drop zone:** with orbit, an army group can land on any open hex with no enemy anti-air within 2 hexes. It arrives with 1 move left and out of supply unless dropships or a landing bay support it.
- **Recon sweep:** reveals a 5-hex circle for a turn.

### 3.4 Worlds feel different

| World | Theatre rules (data, per world) |
| --- | --- |
| Vekta | Clear weather, rivers, dense cities; ISA defenders +2 in their own cities |
| Helghan | Arc lightning storms in 1 turn of 4 (sight -1, no orbital strikes or drops); toxic ash plains damage units without Helghast gear by 5 HP a turn |
| Halcyon and Morrow | Low gravity: jump units move +1, craters give cover; no rivers or roads at start |
| Kerberos Belt | Rocks linked by bridges; losing a bridge splits the front |
| Stations (Midway, Bastion, Ardent) | Corridors and decks as narrow hex lanes; no vehicles; holding the reactor hex wins the station; breaching charges open new corridors |

## 4. The six splinter factions

Each side splits into three factions that share the war but not their ambitions: one fights on the ground, one holds the purse or the factories, one rules space. In a solo game you play one of them and the AI plays the other five, allies included.

| Faction | Side | Leader | Trait (in gameplay terms) | Signature units | Ambition (what earns it glory) |
| --- | --- | --- | --- | --- | --- |
| Helghast Army High Command | Helghast | Autarch Scolar Visari | Infantry cost 20% less; war support loss on Helghan halved; propaganda office in every base | Assault trooper, Heavy gunner | Hold Pyrrhus and the most theatres |
| Stahl Arms | Helghast | Jorhan Stahl | Arc weapons and vehicles cheaper with petrusite; sells weapons to allies for credits | Arc trooper, Stahl battle suit | Control petrusite: Kerberos and every extractor |
| Helghast Navy | Helghast | Admiral Orlock | Fleets move +1 lane from Ardent; dropships 30% cheaper; one extra orbital strike a turn | Jetpack trooper, Helghast cruiser | Land on Vekta and take an ISA capital |
| ISA Strategic Command | ISA | Commander Jan Templar | Infantry next to a tank gets +3; Intruder dropships carry 2 army groups | Rifle squad, Tank platoon | Win the most theatre battles |
| Vektan Home Guard | ISA | Marshal Ilse Varga (invented) | Fortifications built 50% faster on Vekta and Halcyon; partisans appear when Vekta land is lost | Militia, Guard engineers | Keep Vekta free; liberate any lost Vektan base |
| ISA Fleet and Shadow Marshals | ISA | Admiral Danel Kerr (invented) | Free recon sweep each turn; Shadow Marshal raids (sabotage missions behind the front) | Shadow Marshal team, ISA cruiser | Silence Ardent Platform and win orbit over Helghan |

Leaders marked invented are placeholders for you to rename. Visari, Stahl, Orlock and Templar are setting names used in an original story, as in the Witcher conversion.

**Rivalry inside a side**

- **War council.** Every 10 turns the three allies vote on the side's main objective, choosing from the world or station each faction proposes. Whoever's objective wins gets +20% glory for actions there, and the AI allies commit their fleets to it.
- **Shared reinforcements, split production.** Each faction runs its own bases and economy, but landing bays and supply depots supply the whole side.
- **Arms deals.** Stahl Arms sells arc weapons and vehicles to its allies for credits or petrusite. If refused petrusite, Stahl raises prices (an event).
- **Agendas** use Atlas's diplomacy opinion system between allies. The Home Guard dislikes allies who pull fleets away from Vekta, and the Helghast Navy resents an Army that hoards dropships.
- **Separate peace (optional rule).** A faction whose war support falls below 15 may sign an armistice and leave the war. Its bases stay neutral until the war ends. This is off by default.

## 5. Economy, units, buildings and research

Atlas's six yields are renamed and given war jobs, so the engine's economy, research and civics code keeps working while everything you build is military. Cities become bases, granaries and monuments become barracks and armouries, wonders become strategic projects, and the civics tree becomes doctrines.

### 5.1 Yields and resources

| Atlas yield | Killzone name | What it does |
| --- | --- | --- |
| Food | Rations | Grows a base's workforce (population) |
| Production | Industry | Builds units, base buildings and ships |
| Gold | Credits | Buys units, pays upkeep, arms deals with allies |
| Science | Research | Tech tree |
| Culture | Command | Doctrine tree (replaces civics) and theatre control radius |
| Faith | Propaganda | Buys war support, partisans and volunteer units (replaces religion) |

Strategic resources: **petrusite** (Helghan, Kerberos; arc weapons, Helghast heavy units, arc towers) and **fuel** (Vekta, Halcyon; tanks, ships, dropships). Both are traded between allies like Atlas luxury resources.

### 5.2 Units

| Role | ISA | Helghast | Notes |
| --- | --- | --- | --- |
| Line infantry | Rifle squad | Assault trooper | Backbone; can dig in (fortify) |
| Heavy weapons | Support gunners | Heavy gunner | Strong defence; slow |
| Anti-armour | Rocket team | Arc trooper (Stahl) | +10 against vehicles |
| Recon | Recon team | Scout sniper team | Sight +2; ignores zone of control |
| Engineers | Combat engineers | Pioneer squad | Build war infrastructure; 3 charges |
| Jump infantry | Not available | Jetpack trooper (Navy) | Moves over rivers and trenches |
| Special forces | Shadow Marshal team (Fleet) | Intelligence cell | Sabotage missions using Atlas espionage |
| Militia | Home Guard militia (Home Guard only) | Conscripts (Army) | Cheap, weak, raised with propaganda |
| Light vehicle | APC | Armoured walker | Carries 1 infantry unit |
| Main battle tank | Tank platoon | Stahl battle suit | Needs fuel or petrusite |
| Artillery | Field artillery | Arc artillery | Range 3; needs supply |
| Frigate, destroyer, cruiser | ISA ships | Helghast ships | Star map only |
| Dropship wing | Intruders | Helghast dropships | Lands army groups; star map only |

One star map **army group** is a stack of up to 4 theatre units that travels together between worlds and unpacks on landing. Atlas allows one combat unit per hex, so a group spreads onto the landing hex and its free neighbours; if there are too few free hexes, the rest stay aboard.

### 5.3 Base buildings (replace the Civ list)

Barracks, vehicle depot, armoury (+2 strength to infantry trained here), factory, petrusite refinery, fuel depot, power plant, comms centre (research), propaganda office, field academy (new units start with experience), med centre, logistics hub (supply range +1), shipyard (home worlds, Bastion and Ardent only), dropship pad, orbital defence gun (fires at enemy ships in orbit), bunker complex (base defence +10).

### 5.4 Strategic projects (replace wonders)

| Project | Side | Effect |
| --- | --- | --- |
| Arc cannon array | Helghast | Damages every enemy ship in Helghan orbit each turn |
| Orbital defence grid | ISA | Same for Vekta orbit |
| New Sun-class cruiser | ISA | A unique flagship: +1 orbital strike and +2 to fleet battles |
| Stahl dreadnought | Helghast | A unique flagship with arc guns |
| Petrusite warhead | Helghast (late) | Devastates one theatre region; costs its user 20 war support and the opinion of every faction |
| Total mobilisation | Both | Doubles militia output for 10 turns |

### 5.5 Research and doctrines

- **Tech tree, about 30 techs in three eras** (Opening campaign, Escalation, Total war). Most are shared, and side-specific techs are tagged, such as arc weaponry and jetpacks for the Helghast, or Intruder upgrades and exoskeleton armour for the ISA. G9 only renamed the base game's 40 techs and 25 civics in place (same shape, so the AI keeps working); K4 replaces them with this smaller tree, so every unit and building K4 adds must point at the new techs, and the G9 names can be reused where they fit.
- **Doctrines (civics, from command):** Defence in depth, Blitz assault, Orbital supremacy, Total war economy, Partisan warfare and others. They work as policy cards in slots, as in Atlas today.
- **War footing (governments):** Martial law, Corporate charter (Stahl only), Fleet command (Navy and Fleet), Home defence (Home Guard).

## 6. Turn flow, battles and victory

One system turn moves everything forward at once: income, fleets, every active theatre and the war's morale. A campaign aims for about 120 system turns at Standard speed, with one to three theatres active at a time.

### 6.1 A system turn

1. **Income and research.** Every base on every world collects yields, finishes production and grows. Research and command progress.
2. **Star map orders.** Move fleets and transports, fight space battles, land army groups, call orbital strikes and supply drops, launch Shadow Marshal raids.
3. **Theatre orders.** In each active theatre where you have forces, move units, attack and build war infrastructure. Theatres you have delegated (section 7) are played by your theatre commander.
4. **Battles.** Each attack offers Fight it yourself (platoon battle) or Auto-resolve, as Atlas does now. Results flow back into the theatre.
5. **End of turn.** Fronts move, supply attrition is applied, territories change hands, war support updates, and victory is checked.

The active theatres are listed on the star map with a short status ("Helghan: front 38% ISA, 2 battles"), and the needs-attention list groups items by world.

### 6.2 Battles

- **Field battles** use the existing Killzone platoon module. The battlefield is built from the theatre hex, its neighbours and everything built on them, so trenches, wire, MG nests and bunkers show up where you dug them.
- **Landing battles** happen when an army lands on a defended hex. The attacker arrives in waves from dropships, and anti-air shoots some down before they land.
- **Station battles** use corridor maps with narrow lanes, breaching points and a reactor objective.
- **Space battles** are auto-resolved with odds shown first. A space battle module is a possible later project.

### 6.3 War support

Each side has a war support meter from 0 to 100, starting at 60.

| Event | Change |
| --- | --- |
| Territory captured or lost | +5 or -5 |
| Enemy lands on your home world | -10 |
| A faction's capital base falls | -15 for its side |
| Theatre battle won or lost | +1 or -1 |
| Blockade of your home world | -1 a turn |
| Propaganda spent | +1 per 25 propaganda, at most +3 a turn |

Above 70, bases get +10% industry. Below 30, units cost 20% more and growth slows. At 0 the side sues for peace and loses.

### 6.4 Victory

- **Side victory** comes in three ways: capture every faction capital on the enemy home world (so all three factions of a side must start with their capital on their home world, which section 4 should say); drive the enemy side's war support to 0; or hold 6 of the 8 territories for 10 turns in a row.
- **Glory** ranks the factions on the winning side. Glory comes from battles won, sites and territories taken, and the faction's ambition (section 4). The top faction gets a decisive victory and the others a shared one. In a solo game you always know your rank.

### 6.5 Scenarios and setup

Scenarios are presets of starting ownership:

- **Balanced war** has the map as drawn.
- **The invasion of Vekta** starts with the Helghast holding Halcyon and with landings already on Vekta.
- **The road to Helghan** starts with the ISA holding Midway and Morrow.

Setup also offers 4, 5 or 6 factions (drop one per side for a shorter game), the battle mode, default theatre delegation, campaign length (80, 120 or 200 turns) and the optional separate-peace rule.

## 7. AI, delegation and screens

The AI plays at two levels, star map and theatre, using the same commands you do. You can hand any theatre to an AI theatre commander, which keeps a three-front war manageable alone: you fight the front you care about and the others are run for you.

### 7.1 AI

- **Star map AI** (per faction) scores each territory for its bonus, its faction's ambition, the threat to its home world and the fleet strength on each lane. It then decides fleet moves, invasions, defence of home and its war council vote. Allies coordinate on the council's objective.
- **Theatre AI** is today's Atlas AI with four additions:
  1. It attacks where the front's control margin is thinnest.
  2. Its engineers fortify the front line (trenches and wire first, MG nests at chokepoints, anti-air near landing bays).
  3. It never advances beyond supply.
  4. It pulls back to fortifications when outnumbered.
- **Every decision is logged in the AI journal**, grouped by world.
- **Simulator targets** (all in `docs/AI_TUNING.md`):

  These targets need far more games than CLAUDE.md allows without asking (20 a comparison, 40 when close): an outcome that happens in 10% of games needs about 100 games to measure reliably. K5 should either ask before each larger run, or CLAUDE.md should gain a separate rule for these health checks.
  - each side wins 45 to 55% of games
  - each victory type happens in at least 10% of games
  - average length is 90 to 140 system turns
  - a home world is invaded in 30 to 60% of games
  - every faction tops glory in at least 8% of games

### 7.2 Theatre delegation

- Each theatre has a **Delegate** switch with three stances: Hold the line, Advance, All-out assault.
- A delegated theatre is played by the theatre AI as your faction, after your star map orders, and its turn report shows what it did and why.
- You can take control back at any time, and battles in delegated theatres are always auto-resolved.
- This mirrors your game nights, where key battles are played and the rest are auto-resolved.

### 7.3 Screens

| Screen | What it shows |
| --- | --- |
| Star map | Starfield backdrop, code-drawn pixel planets with orbit rings, lanes, fleet tokens, theatre status cards, both sides' war support at the top |
| Theatre view | Today's Atlas HUD, plus a world switcher (tabs for each active world) and a Star map button; the minimap shows the current world |
| Fleet panel | Ships, cargo, moves, orbit status; Land, Bombard, Supply drop, Blockade buttons |
| Landing planner | The target world's map with anti-air coverage shaded and drop zones you can use highlighted |
| War council | The three proposals, each ally's vote and why, and the glory bonus on offer |
| War support and glory | Both sides' war support over time and the glory table |

## 8. Engine work and build phases

The one big engine change is letting a game hold several maps at once, linked by a star map. It's built as a general, optional Atlas system like the front line, so base-ancient and the Witcher keep playing exactly as now, and later conversions (Dishonored's isles, Skellige in the Witcher) can use it too.

### 8.1 Engine changes

- **New content types:** `worlds` (id, kind, map preset or generator recipe, theatre rules, bonus effects, starting owner per scenario), `lanes` (from, to, turns, `heavyOnly`), `scenarios`.
- **State:** every unit and city gains a `world` field; each world keeps its own map, fog, borders and front control under `state.worlds[id]`. Ships sit at star map nodes with `world: null` and a `node` field. A one-world game is simply a game with one world called `main`, and a save migration adds it to old saves.
- **New `space` unit domain** (the plan reserved `air`; `space` joins it), with army group cargo, landing, orbit and blockade commands.
- **Systems made world-aware:** movement, visibility, borders, front line, combat, supply (new) and the AI view. Rendering draws one world at a time, with a world switcher.
- **Safety net:** the existing base-ancient and Witcher fixture saves must replay to identical results after the change, apart from the added `world` field.

**Before K1.** Export this doc as Markdown and commit it as `docs/KILLZONE.md`. Each prompt below goes into a new Claude Code (cloud) session on the Atlas repo, after G9 is finished.

**Suggested change to K1.** Split it in two, because it touches nearly every part of the engine. K1a moves the rules and saved game onto worlds with no visible change (every existing game is one world, main). K1b adds the second world, the switcher and drawing one world at a time. Also, store no world field at all in a one-world game (a missing field means main): the base game and Witcher saves then replay with exactly the same fingerprint rather than "apart from the added field", and old saves need no migration.

### K1: Several worlds in one game

**Progress.** K1a is done (engine only, nothing visible): see CHANGELOG.md and the K1a entries in docs/DECISIONS.md. The world field and save migration in the prompt below were replaced by parking inactive worlds, and the tuning switch by listing worlds. K1b is done too: the world switcher, drawing one world at a time, the computer playing every world, and the two-world Killzone test game (Developer mode, New game, Killzone, "Test: Killzone on two worlds"). K1 is complete; K2 (the star map) is next.

**Check on your laptop.** A test Killzone game opens with two worlds (Vekta and Helghan, placeholder maps); a world switcher moves between them; base-ancient and Witcher games look and play exactly as before.

```text
Killzone Extrasolar War, phase K1. Read docs/KILLZONE.md fully (section 8.1 above all), docs/PLAN.md sections 4 and 7, and CLAUDE.md.

Make Atlas support several worlds in one game as a general, optional engine system switched on by tuning.worlds.enabled. Add the worlds content type with schema; give every unit and city a world field; keep each world's map, fog, borders and front control under state.worlds[id]; make movement, visibility, borders, the front line, combat, yields and the AI view world-aware; and add a save migration that turns old saves into one world called main. Rendering shows one world at a time with a world switcher in the HUD and minimap per world.

Prove nothing changed for one-world games: replay the base-ancient and witcher fixture saves and compare fingerprints (ignoring the new world field), and keep every existing test passing. Add a test ruleset with two small worlds and tests that units, fog and borders never leak between worlds. Record design choices in docs/DECISIONS.md, then follow the Definition of done in CLAUDE.md.
```

### K2: The star map, fleets and landings

**Progress.** K2 is done: Killzone: Extrasolar War is a conversion of its own on top of Killzone, with the star map rules, the star map screen and placeholder maps (see CHANGELOG.md and the K2 entries in docs/DECISIONS.md). Left for later phases: fleet AI (K5), supply, landing bays and anti-air batteries (K3), capturing worlds and victory (K3, K4). K3 is next.

**Check on your laptop.** The Killzone game opens on a star map with the 8 territories; you can build ships, move a fleet along lanes, win a space battle, take orbit, land an army group on a world, call an orbital strike and blockade a world; the long jump takes 3 turns.

```text
Killzone Extrasolar War, phase K2. Read docs/KILLZONE.md sections 2, 3.3 and 8.

Add the lanes and scenarios content types, the space unit domain, star map nodes and fleets (up to 6 ships), lane movement (one lane a turn, lanes with turns > 1 for the long jump, heavyOnly lanes), orbit control, auto-resolved space battles with odds shown first, army groups (up to 4 theatre units) carried by transports and cruisers, landings at landing bays or drop zones not covered by enemy anti-air, orbital strikes, supply drops and blockades. Wire them as commands through applyCommand.

Build the star map screen: starfield, code-drawn pixel planets with orbit rings, stations, lanes, fleet tokens, theatre status cards and a Star map button in the theatre HUD. Fill rules/killzone with the 8 territories and 11 lanes from section 2 using placeholder maps, and the Balanced war scenario. Tests for every command and refusal, and a deterministic 60-turn AI-free scripted invasion. Then follow the Definition of done in CLAUDE.md.
```

### K3: Theatre rules, supply and war infrastructure

**Progress.** K3 is done: supply, thirteen kinds of war infrastructure, storms, toxic ground, low gravity, stations and capturing a world (see CHANGELOG.md and the K3 entries in docs/DECISIONS.md, which also list what was left for later). K4 is next.

**Check on your laptop.** Units cut off from supply lose health; engineers build every item in section 3.2 and each changes combat as described; Helghan has storms, the moons have low gravity, stations have corridors; holding every key site captures a world.

```text
Killzone Extrasolar War, phase K3. Read docs/KILLZONE.md section 3.

Add an optional supply system (sources, ranges and attrition all in data): supply spreads only through hexes your side controls, units out of supply lose HP, cannot heal and fight weaker, and can surrender after a set number of turns. Make every war infrastructure item in section 3.2 a data-defined improvement with its effects (defence, zone of control, free shots, strikes blocked, reinforcement points, supply sources, hidden minefields), adding generic effect types to the effects registry where needed rather than Killzone-only code. Add per-world theatre rules (storm turns, toxic ground, low gravity movement, station corridors with a reactor objective) and the capture rule for a world. Tests for each effect and rule, then follow the Definition of done in CLAUDE.md.
```

### K4: Factions, content, war support and victory

**Progress.** K4a (the content half) is done: six factions, units, buildings, projects, research, doctrines, war footings, resources and the yields renamed (see CHANGELOG.md and DECISIONS.md). K4b (war support, glory, victory, the council, arms deals and the scenarios) is next.

**Suggested change to K4.** This is the largest phase by a distance (six factions, every unit, building and project, research, doctrines, eight maps, war support, glory, victory, the council, arms deals and scenarios), too much to finish and check in one session. Split it: K4a for the content (factions, units, buildings, projects, research, maps) and K4b for war support, glory, victory, the council, arms deals and scenarios.

**Check on your laptop.** All six factions are playable with their traits, units and ambitions; bases build barracks and armouries rather than granaries; the tech tree, doctrines and war footing are all Killzone; war support and glory show and change; each victory type and scenario works.

```text
Killzone Extrasolar War, phase K4. Read docs/KILLZONE.md sections 4, 5 and 6.

Fill rules/killzone with: the six splinter factions and leaders (traits, agendas, ambitions), side membership, the yields renamed through text (Rations, Industry, Credits, Research, Command, Propaganda), petrusite and fuel, every unit in section 5.2, the base buildings in 5.3, the strategic projects in 5.4, about 30 techs in three eras, doctrines and war footing, and hand-authored or generator-recipe maps for all 8 territories. Turn religion off for this conversion and route propaganda into war support. Add war support per side, glory per faction, the three side victory types and glory ranking, the war council every 10 turns, Stahl's arms deals, and the three scenarios plus the setup options in 6.5. All text original, British English, no em dashes. Tests for each victory, war support change and council vote, then follow the Definition of done in CLAUDE.md.
```

### K5: AI and theatre delegation

**Check on your laptop.** AI factions invade, defend their home, fortify fronts and vote in the council; you can delegate a theatre with a stance and read its report; the simulator shows balanced results.

```text
Killzone Extrasolar War, phase K5. Read docs/KILLZONE.md section 7 and docs/PLAN.md section 9.

Build the star map AI (territory scores from bonus, ambition, home threat and lane strength; fleet moves, invasions, home defence and council votes; allies follow the council objective) and extend the theatre AI (attack where the front margin is thinnest, engineers fortify the front, never advance beyond supply, fall back to fortifications when outnumbered). Add theatre delegation with three stances and a turn report. Extend tools/sim.mjs with the targets in section 7.1 and tune only data, keeping changes that beat the previous AI. Record results in docs/AI_TUNING.md, then follow the Definition of done in CLAUDE.md.
```

### K6: Battles with fortifications, landings and stations

**Check on your laptop.** A platoon battle fought on a fortified hex shows the trenches, wire, MG nests and bunkers you built there; a landing battle brings the attacker in waves under anti-air fire; a station battle plays in corridors.

```text
Killzone Extrasolar War, phase K6. Read docs/KILLZONE.md section 6.2 and docs/PLAN.md section 5, and the accipiter117/Killzone repo's map and battle code.

Extend the Killzone battle adapter so the battlefield is built from the theatre hex, its neighbours and their infrastructure (trenches, wire, MG nests, bunkers, mines, arc towers, artillery support), and add landing battles (waves from dropships, anti-air losses) and station battles (corridor maps, breaching points, reactor objective). Prefer passing these through adapter options; if the vendored sim must change, make the change in the Killzone repo first and re-vendor, recording it in docs/DECISIONS.md. simulate() must stay deterministic and within 10 points of auto-resolve odds. Then follow the Definition of done in CLAUDE.md.
```

### K7: Art and screens

**Check on your laptop.** The star map, every world and station, every unit, ship and piece of infrastructure have proper pixel art in the Killzone look; the fleet panel, landing planner, war council and war support screens are in place; npm run shots includes the star map and each world.

```text
Killzone Extrasolar War, phase K7. Read docs/KILLZONE.md section 7.3 and docs/OVERHAUL.md sections 2 and 4.

Draw, through the art registry: pixel planets, moons, stations and ships for the star map; a terrain set per world (Vekta greens, Helghan ash and rust with storm effects, grey lunar craters, station decks); every war infrastructure item; and every unit and ship as layout code sprites adapted from the Killzone repo's pixel troopers and vehicles. Build the fleet panel, landing planner, war council and war support and glory screens in the overhaul's style. Add the star map and every world to npm run shots, look at the results, fix what reads badly, and commit them to docs/shots/K7/. Then follow the Definition of done in CLAUDE.md.
```

## 9. Risks and open questions

The biggest risk is K1: making every system world-aware touches most of the engine. That's why it comes first, on its own, with fixture replays proving the other rulesets are unchanged.

| Risk | How the plan reduces it |
| --- | --- |
| The multi-world refactor breaks base-ancient or the Witcher | K1 does nothing else; fixture saves must replay identically; the system is off unless a ruleset switches it on |
| Too many active theatres make turns slow and tiring | Theatre delegation; the AI and war council focus on one or two objectives; campaign length and faction count are setup options |
| AI can't handle invasions across worlds | Star map AI scores are data and tuned against simulator targets; AI turns stay in the Web Worker with a fixed amount of planning per world (counted in options considered, never in seconds, or the same game could play out differently on a slower laptop) |
| Supply and fortifications make fronts stall into stalemate | Orbital strikes, landings behind the line, jump troops and artillery all break fortified lines; the simulator tracks average front movement |
| Turn time grows with several maps | Only active theatres run the full AI; quiet worlds only collect income |
| Changes to your Killzone battle code drift between repos | Changes are made in the Killzone repo first and re-vendored (K6) |
| IP | Original story, text and art; setting names only, as in the existing conversion |

**Open questions**

- [ ] **Names.** Halcyon, Bastion Station, Kerberos Belt, Midway Relay, Morrow, Ardent Platform, Marshal Ilse Varga and Admiral Danel Kerr are placeholders. Keep them or rename them before K2 and K4.
- [ ] **Six factions or more?** Your Killzone notes mention wanting more factions for extra players. A neutral third party, such as an independent colony or a mercenary company, could slot into the Kerberos Belt later.
- [ ] **Space battles.** These are auto-resolved in this plan. A real-time space battle module would be a separate project after K7.
- [ ] **Game nights.** This is designed for solo play against the AI. Pass-and-play or online for 2 to 4 friends splitting a side would reuse the skipped multiplayer phases, and the six splinter factions map naturally onto that.
- [ ] **Petrusite warhead.** It's dramatic but risks feeling unfair. Keep it as a late Helghast project, make it a setup option, or drop it.
- [ ] **Relationship with the standalone Killzone repo.** This conversion would make Atlas the home of your Killzone strategy game, with the Killzone repo staying as the battle module. Confirm that's the direction you want.
