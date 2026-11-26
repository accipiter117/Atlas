# Vendored: the Killzone battle sim

These files are the battle simulation from Matthew's Killzone: Front Line
project (github.com/accipiter117/Killzone, `src/sim/` and `src/config.js`,
commit 21dcd10), copied unchanged so they can be refreshed from that project.
Atlas talks to them only through `../adapter.js` (section 5.5 of
docs/PLAN.md). They follow the same rules as Atlas's own sim: no screen, no
clock, one seeded random stream.
