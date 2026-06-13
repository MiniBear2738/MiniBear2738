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
  cap, lumber camps and quarries speed up gathering, farms 🌾 grow food, and
  campfires 🔥 give villagers somewhere to rest. Villagers walk over and build.
- **Food** is eaten a little each day. If the larder empties, villagers don't
  starve — they just turn hungry and slow. Build farms and villagers will tend
  them for extra food.
- **Night & rest**: when it gets dark villagers down tools and gather at a
  campfire or house to sleep, then rush back out at dawn.
- **Professions**: chop, mine or farm enough and a villager becomes a 🪓
  Lumberjack, ⛏️ Miner or 🌾 Farmer — dressing the part and working 40% faster.
- **Plant trees & rocks**, paint **paths** 🛤️ (1 🪨, +20% speed), and scatter
  **decor** — 🚧 fences, 🌷 flowers, 🏮 lanterns that glow at night.
  **Click-drag** any of these like a brush.
- **🎈 A traveling merchant** visits every 7 days — click the balloon to swap
  surplus wood, stone and food before it drifts away (handy in a slow winter).
- **🏛️ The Grand Monument** (200 🪵 200 🪨) takes days of crewed work, but
  finishing it **wins the game** with a permanent fireworks celebration — then
  play on as long as you like.
- **Seasons** drift past — 🌸 spring, ☀️ summer, 🍂 autumn, ❄️ winter —
  recolouring the world. Crops race in summer; nature regrows slowly under
  winter snow.
- **Auto-grow** (on by default) lets villagers plan and fund new buildings
  themselves — toggle it off for full control.
- **Events** roll in periodically: 🌧️ rain slows gathering but regrows
  depleted nature fast, 🌾 harvest speeds gathering up, 🎊 celebrations make
  villagers move quicker.
- Birds cross the sky, butterflies flit in warm seasons and rabbits hop
  through the grass (scattering when a villager wanders near) — watch the
  windows and lanterns glow and the fireflies come out after dark.

Keys: `H`/`L`/`Q` houses & gathering · `F`/`C`/`G` farm / campfire / monument ·
`T`/`R`/`P` tree / rock / path · `Esc`/right-click cancel · `Space` pause ·
`1`/`2`/`3` speed · `A` auto-grow · `M` mute · `?` help.

## Test

A headless smoke test stubs the DOM/canvas and drives the real game loop,
running 64 checks across the whole simulation — gathering, building, food &
farms, professions, paths, seasons, day/night rest, the merchant, decor, and
winning via the monument:

```sh
node test/smoke.mjs
```
