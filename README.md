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

- **Click trees & rocks** to gather by hand (villagers do it automatically too).
- **Place buildings** from the bottom toolbar: houses raise the population
  cap, lumber camps and quarries speed up gathering. Villagers walk over and
  construct the site.
- **Plant trees / rocks** anywhere to keep nature stocked.
- **Auto-grow** (on by default) lets villagers spend resources on new
  buildings themselves — toggle it off for full control.
- **Events** roll in periodically: 🌧️ rain slows gathering but regrows
  depleted nature fast, 🌾 harvest speeds gathering up, 🎊 celebrations make
  villagers move quicker.
- Day and night drift by purely for atmosphere — watch the house windows
  glow and the fireflies come out.

Keys: `H`/`L`/`Q` buildings · `T`/`R` nature · `Esc`/right-click cancel ·
`Space` pause · `1`/`2`/`3` speed · `A` auto-grow · `M` mute · `?` help.

## Test

A headless smoke test stubs the DOM/canvas and drives the real game loop
for ~10 minutes of game time, checking that villagers gather, build, and
never get stuck:

```sh
node test/smoke.mjs
```
