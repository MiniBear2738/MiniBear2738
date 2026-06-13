# 👑 Tiny Kingdom

A cozy little canvas settlement sim in a single HTML file. Villagers chop
trees, mine rocks, haul everything to the storage barn and construct new
buildings — you nudge things along.

## Play

Open `index.html` in a browser. That's it — no build step, no dependencies.

```sh
# or serve it locally if you prefer
python3 -m http.server
```

## How it works

- **Click trees & rocks** to gather by hand (villagers do it automatically
  too). **Click a villager** to say hi, or **hover** one to see their name
  and what they're up to.
- **Place buildings** from the bottom toolbar: houses raise the population
  cap, lumber camps and quarries speed up gathering, and farms 🌾 grow food.
  Villagers walk over and construct the site.
- **Food** is eaten a little each day. If the larder empties, villagers don't
  starve — they just turn hungry and slow, so keep a farm or two running.
- **Plant trees & rocks** anywhere, and **click-drag** to paint whole
  forests. Drag a **path** 🛤️ (1 🪨 per tile) for a 20% villager speed boost.
- **Professions**: chop or mine enough and a villager becomes a 🪓 Lumberjack
  or ⛏️ Miner — they dress the part and work their trade 40% faster.
- **Seasons** drift past — 🌸 spring, ☀️ summer, 🍂 autumn, ❄️ winter —
  recolouring the world. Crops race in summer; nature regrows slowly under
  winter snow.
- **Auto-grow** (on by default) lets villagers plan and fund new buildings
  themselves — toggle it off for full control.
- **Events** roll in periodically: 🌧️ rain slows gathering but regrows
  depleted nature fast, 🌾 harvest speeds gathering up, 🎊 celebrations make
  villagers move quicker.
- Day and night drift by, birds cross the sky and rabbits hop through the
  grass (scattering when a villager wanders near) — watch the house windows
  glow and the fireflies come out after dark.

Keys: `H`/`L`/`Q`/`F` buildings · `T`/`R`/`P` nature & paths ·
`Esc`/right-click cancel · `Space` pause · `1`/`2`/`3` speed · `A` auto-grow ·
`M` mute · `?` help.

## Test

A headless smoke test stubs the DOM/canvas and drives the real game loop
for ~10 minutes of game time, checking that villagers gather, build, and
never get stuck:

```sh
node test/smoke.mjs
```
