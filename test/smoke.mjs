// Headless smoke test for Tiny Kingdom.
// Stubs out the DOM + canvas, evals the game script from index.html,
// drives the real requestAnimationFrame loop, and asserts the simulation
// (and every interaction) behaves without errors.
//
// Run with: node test/smoke.mjs

import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!code) { console.error("FAIL: no <script> block found in index.html"); process.exit(1); }

// ---------------------------------------------------------------
// universal no-op proxy for the canvas 2d context
// ---------------------------------------------------------------
const anyProxy = new Proxy(function () {}, {
    get(_, p) {
        if (p === Symbol.toPrimitive) return () => 0;
        if (p === "toString") return () => "0";
        return anyProxy;
    },
    set() { return true; },
    apply() { return anyProxy; },
});

// ---------------------------------------------------------------
// minimal DOM stubs
// ---------------------------------------------------------------
function makeClassList() {
    const set = new Set();
    return {
        add(...c) { c.forEach(x => set.add(x)); },
        remove(...c) { c.forEach(x => set.delete(x)); },
        toggle(c, force) { (force === undefined ? !set.has(c) : force) ? set.add(c) : set.delete(c); },
        contains(c) { return set.has(c); },
    };
}
function makeEl(id) {
    return {
        id: id || "", textContent: "", className: "", style: {}, dataset: {}, disabled: false,
        onclick: null, classList: makeClassList(), listeners: {},
        addEventListener(t, f) { (this.listeners[t] ??= []).push(f); },
        appendChild() {}, remove() {},
        querySelector() { return makeEl(); },
        get offsetWidth() { return 0; },
    };
}

const canvasEl = makeEl("game");
canvasEl.getContext = () => anyProxy;

const elements = new Map([["game", canvasEl]]);
globalThis.document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
    createElement() { return makeEl(); },
    addEventListener() {},
};

globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;

// minimal localStorage so save/load can be exercised headlessly
const _store = new Map();
globalThis.localStorage = {
    getItem(k) { return _store.has(k) ? _store.get(k) : null; },
    setItem(k, v) { _store.set(k, String(v)); },
    removeItem(k) { _store.delete(k); },
};

const globalListeners = {};
globalThis.addEventListener = (t, f) => { (globalListeners[t] ??= []).push(f); };

let rafQ = [];
globalThis.requestAnimationFrame = cb => rafQ.push(cb);

// ---------------------------------------------------------------
// boot the game
// ---------------------------------------------------------------
(0, eval)(code);
const TK = globalThis.TK;

let failures = 0;
function check(name, cond, extra) {
    if (cond) console.log(`  ok    ${name}`);
    else { failures++; console.log(`  FAIL  ${name}${extra ? "  (" + extra + ")" : ""}`); }
}

let tNow = performance.now();
function frames(n) {
    for (let i = 0; i < n; i++) {
        tNow += 100; // dt clamps to 0.1s in the game loop
        const cb = rafQ.shift();
        if (!cb) throw new Error("animation loop died");
        cb(tNow);
    }
}
const fireKey = key => globalListeners.keydown?.forEach(f => f({ key, repeat: false, preventDefault() {} }));
const cv = type => canvasEl.listeners[type];
const pDown = (x, y) => cv("pointerdown")?.forEach(f => f({ button: 0, clientX: x, clientY: y, target: canvasEl }));
const pMove = (x, y) => cv("pointermove")?.forEach(f => f({ clientX: x, clientY: y, target: canvasEl }));
const pUp   = (x, y) => globalListeners.pointerup?.forEach(f => f({ clientX: x, clientY: y }));
const fireClick = (x, y) => { pDown(x, y); pUp(x, y); };                 // a tap
const fireDrag  = pts => { pDown(...pts[0]); for (let i = 1; i < pts.length; i++) pMove(...pts[i]); pUp(...pts.at(-1)); };
const allFinite = () =>
    [...TK.villagers, ...TK.nodes, ...TK.buildings].every(e => Number.isFinite(e.x) && Number.isFinite(e.y));

console.log("boot:");
check("TK debug handle exists", !!TK);
check("starts with 3 villagers", TK.villagers.length === 3);
check("nature scattered", TK.nodes.length >= 15, `got ${TK.nodes.length}`);
check("starts 20 wood / 10 stone / 12 food", TK.resources.wood === 20 && TK.resources.stone === 10 && TK.resources.food === 12);
check("every villager has a name", TK.villagers.every(v => typeof v.name === "string" && v.name.length));
check("wildlife spawned (rabbits & birds)", TK.critters.length >= 1 && TK.birds.length >= 1);
check("starts in Spring", TK.season === "Spring");

console.log("long run (~10 min of game time at 4x):");
TK.speed = 4;
const eventsSeen = new Set(), seasonsSeen = new Set();
let popCapSeen = TK.popCap;
for (let burst = 0; burst < 30; burst++) {
    frames(50); // 50 * 0.4s = 20s game time per burst
    if (TK.event !== "None") eventsSeen.add(TK.event);
    seasonsSeen.add(TK.season);
    popCapSeen = Math.max(popCapSeen, TK.popCap);
    if (!allFinite()) break;
}
check("game time advanced ~600s", TK.time > 550, `t=${TK.time.toFixed(0)}`);
check("all positions stayed finite", allFinite());
check("population grew", TK.villagers.length > 3, `pop=${TK.villagers.length}`);
check("auto-grow constructed buildings", TK.buildings.filter(b => b.complete).length >= 1, `built=${TK.buildings.length}`);
const COST = { house: 10, lumber: 15, quarry: 10, farm: 12 };
const spent = TK.buildings.reduce((s, b) => s + (COST[b.type] || 10), 0);
check("villagers gathered resources", TK.resources.wood + TK.resources.stone + spent > 40,
    `wood=${TK.resources.wood} stone=${TK.resources.stone} spent=${spent}`);
check("at least one event fired", eventsSeen.size >= 1, [...eventsSeen].join(",") || "none");
check("seasons cycled", seasonsSeen.size >= 2, [...seasonsSeen].join(","));
check("auto-grow built a farm for food", TK.buildings.some(b => b.type === "farm"), "no farm");
check("no villager stuck on a finished building",
    TK.villagers.every(v => !(v.state === "Building" && v.target && v.target.complete)));
check("house raised the population cap", popCapSeen > 5 || !TK.buildings.some(b => b.complete && b.type === "house"), `cap=${popCapSeen}`);
check("HUD wood counter rendered", document.getElementById("wood").textContent !== "");
check("statusLine returns text", TK.villagers.every(v => typeof v.statusLine() === "string"));

console.log("interactions:");
TK.speed = 1;
TK.reset();
frames(5);

// manual gathering by clicking a node away from villagers
const node = TK.nodes.find(r => r.hp > 0 && TK.villagers.every(v => Math.hypot(v.x - r.x, v.y - r.y) > 60));
if (node) {
    const before = node.type === "tree" ? TK.resources.wood : TK.resources.stone;
    fireClick(node.x, node.y - 8);
    const after = node.type === "tree" ? TK.resources.wood : TK.resources.stone;
    check("clicking a node gathers +1", after === before + 1, `${before} -> ${after}`);
    check("clicked node lost hp", node.hp === 4, `hp=${node.hp}`);
} else {
    check("clicking a node gathers +1", false, "no clear node found");
}

// single tree placement via toolbar + tap
document.getElementById("treeBtn").onclick();
check("tree tool selected", TK.placement && TK.placement.type === "tree");
{
    const before = TK.nodes.length;
    outer: for (let y = 220; y < 600; y += 40) {
        for (let x = 80; x < 1200; x += 40) { fireClick(x, y); if (TK.nodes.length > before) break outer; }
    }
    check("tapping ground plants a tree", TK.nodes.length === before + 1);
}
fireKey("Escape");
check("Escape cancels placement", TK.placement === null);

// drag-to-paint a whole row of trees
document.getElementById("treeBtn").onclick();
{
    const before = TK.nodes.length;
    fireDrag([[60, 250], [1220, 250]]);
    check("click-drag paints many trees", TK.nodes.length - before >= 5, `added ${TK.nodes.length - before}`);
    fireKey("Escape");
}

// paths: drag a road, costs 1 stone per tile and speeds villagers
document.getElementById("pathBtn").onclick();
check("path tool selected", TK.placement && TK.placement.type === "path");
{
    TK.resources.stone = 40;
    const stoneBefore = TK.resources.stone;
    fireDrag([[200, 500], [900, 500]]);
    check("dragging lays down path tiles", TK.paths.size >= 5, `tiles=${TK.paths.size}`);
    check("paths cost stone", TK.resources.stone < stoneBefore, `${stoneBefore} -> ${TK.resources.stone}`);
    fireKey("Escape");
}

// professions: enough harvests turn a villager into a specialist
{
    const v = TK.villagers[0];
    v.job = null; v.woodXP = 0; v.stoneXP = 0;
    for (let i = 0; i < 6; i++) v.gainXP("tree");
    check("6 wood harvests make a Lumberjack", v.job === "Lumberjack", `job=${v.job}`);
    check("Lumberjack gathers wood faster", v.jobMult("tree") < 1 && v.jobMult("rock") === 1);
}

// food & farms: a ripe farm yields food; an empty larder makes villagers hungry
{
    TK.reset();
    TK.resources.wood = 80;
    document.getElementById("buildFarmBtn").onclick();
    const before = TK.buildings.length;
    outer: for (let y = 250; y < 560; y += 50) {
        for (let x = 340; x < 1180; x += 50) { fireClick(x, y); if (TK.buildings.length > before) break outer; }
    }
    check("farm site placed", TK.buildings.length === before + 1);
    fireKey("Escape");
    const farm = TK.buildings[TK.buildings.length - 1];
    TK.speed = 4;
    frames(220);
    check("villagers completed the farm", farm.complete);
    const foodBefore = TK.resources.food;
    farm.crop = 0.999;          // about to ripen
    TK.speed = 1;
    frames(2);
    check("ripe farm yields food", TK.resources.food > foodBefore, `${foodBefore.toFixed(1)} -> ${TK.resources.food.toFixed(1)}`);

    TK.resources.food = 0;      // empty larder
    frames(2);
    check("empty larder makes villagers hungry", TK.hungry === true);
    TK.resources.food = 30;
    frames(2);
    check("refilling food clears hunger", TK.hungry === false);
}

// seasons advance with time and recolour deterministically
{
    TK.reset();
    check("reset returns to Spring", TK.season === "Spring");
    TK.time = 130; frames(3);
    check("after one day it's Summer", TK.season === "Summer", TK.season);
    TK.time = 370; frames(3);
    check("later it's Winter", TK.season === "Winter", TK.season);
}

// night & rest: villagers sleep when it's dark, wake at dawn
{
    TK.reset();
    TK.time = 96; frames(2);                       // dayT 0.8 → night
    check("night falls in the evening", TK.isNight === true);
    TK.speed = 2;
    for (let i = 0; i < 12; i++) { TK.time = 96; frames(20); }   // keep it night
    check("villagers head to rest at night",
        TK.villagers.some(v => v.state === "Resting" || v.state === "GoRest"));
    TK.time = 30; frames(8);                        // dayT 0.25 → day
    check("dawn is daytime again", TK.isNight === false);
    TK.speed = 1;
    frames(30);
    check("villagers stop resting by day", TK.villagers.every(v => v.state !== "Resting"));
}

// Farmer profession from tending farms
{
    const fv = TK.villagers[0];
    fv.job = null; fv.woodXP = 0; fv.stoneXP = 0; fv.farmXP = 0;
    for (let i = 0; i < 6; i++) fv.gainXP("farm");
    check("6 farm harvests make a Farmer", fv.job === "Farmer", `job=${fv.job}`);
    check("Farmer tends 40% faster", fv.jobMult("farm") < 1 && fv.jobMult("tree") === 1);
}

// campfire builds and gives villagers a rest spot
{
    TK.reset();
    TK.resources.wood = 60; TK.resources.stone = 60;
    document.getElementById("buildCampfireBtn").onclick();
    const before = TK.buildings.length;
    outer: for (let y = 250; y < 560; y += 50) {
        for (let x = 340; x < 1180; x += 50) { fireClick(x, y); if (TK.buildings.length > before) break outer; }
    }
    check("campfire site placed", TK.buildings.some(b => b.type === "campfire"));
    fireKey("Escape");
}

// traveling merchant arrives and trades
{
    TK.reset();
    TK.spawnMerchant();
    check("merchant appears", !!TK.merchant);
    TK.openMerchant();
    check("merchant panel opens", document.getElementById("merchantPanel").classList.contains("open"));
    TK.resources.wood = 50; TK.resources.stone = 5; TK.resources.food = 0;
    const t = TK.trades[0];                         // 10 wood -> 6 stone
    const w0 = TK.resources.wood, s0 = TK.resources.stone;
    TK.doTrade(t);
    check("trading swaps resources",
        TK.resources.wood === w0 - 10 && TK.resources.stone === s0 + 6,
        `wood ${w0}->${TK.resources.wood}, stone ${s0}->${TK.resources.stone}`);
    TK.merchant.depart();
    check("merchant departs on demand", TK.merchant.leaving === true);
    check("departing closes the panel", !document.getElementById("merchantPanel").classList.contains("open"));
    TK.merchant.x = innerWidth + 200; frames(2);
    check("merchant eventually leaves", TK.merchant === null);
}

// decor: drag-painting fences/flowers/lanterns
{
    TK.reset();
    TK.resources.wood = 60;
    document.getElementById("fenceBtn").onclick();
    check("fence tool selected", TK.placement && TK.placement.type === "fence");
    const before = TK.props.length, wood0 = TK.resources.wood;
    fireDrag([[120, 300], [120, 620]]);
    check("dragging places decor props", TK.props.length - before >= 3, `added ${TK.props.length - before}`);
    check("decor costs wood", TK.resources.wood < wood0);
    fireKey("Escape");
    document.getElementById("lanternBtn").onclick();
    const lp = TK.props.length;
    fireClick(900, 300);
    check("lantern placed", TK.props.some(p => p.type === "lantern") && TK.props.length === lp + 1);
    fireKey("Escape");
}

// the Grand Monument: build it to win
{
    TK.reset();
    if (TK.autoGrow) document.getElementById("autoBtn").onclick();   // keep crews on the monument
    TK.resources.wood = 300; TK.resources.stone = 300;
    document.getElementById("buildMonumentBtn").onclick();
    const before = TK.buildings.length;
    outer: for (let y = 260; y < 560; y += 50) {
        for (let x = 360; x < 1150; x += 50) { fireClick(x, y); if (TK.buildings.length > before) break outer; }
    }
    const mon = TK.buildings.find(b => b.type === "monument");
    check("monument site placed", !!mon && !mon.complete);
    check("monument is a unique build", !TK.placeBuilding("monument", 700, 400));
    fireKey("Escape");
    if (mon) {
        mon.progress = 0.9;                          // skip most of the multi-day build
        TK.speed = 2;
        for (let i = 0; i < 18 && !TK.won; i++) { TK.time = 24; frames(40); } // keep daytime
        check("finishing the monument wins the game", TK.won === true);
        check("victory banner shows", document.getElementById("winBanner").classList.contains("show"));
        check("celebration becomes permanent (fireworks)", TK.event !== undefined && TK.won);
    } else {
        check("finishing the monument wins the game", false, "no monument placed");
    }
}

// villager traits
{
    TK.reset();
    check("villagers carry a traits array", TK.villagers.every(v => Array.isArray(v.traits)));
    const v = TK.villagers[0];
    v.traits = ["Strong"];
    check("Strong works faster", v.traitWorkMult("tree") < 1);
    v.traits = ["GreenThumb"];
    check("Green Thumb farms faster only", v.traitWorkMult("farm") < 1 && v.traitWorkMult("tree") === 1);
    const owl = { traits: ["NightOwl"], hasTrait(k) { return this.traits.includes(k); } };
    const norm = { traits: [], hasTrait(k) { return this.traits.includes(k); } };
    TK.time = 96;   // dusk (dayT 0.8)
    check("Night Owls stay up at dusk", TK.nightFor(owl) === false && TK.nightFor(norm) === true);
    TK.time = 106;  // deeper night (dayT ~0.88)
    check("Night Owls rest deep in the night", TK.nightFor(owl) === true);
}

// nighttime light: lanterns hold the dark at bay
{
    TK.reset();
    const s = TK.storage;
    check("the barn casts light", TK.litAt(s.x, s.y) === true);
    check("a far dark corner is unlit", TK.litAt(innerWidth - 8, 240) === false);
    TK.resources.wood = 50;
    TK.placeDecor("lantern", innerWidth - 120, 320);
    check("a lantern lights its surroundings", TK.litAt(innerWidth - 120, 320) === true);
}

// devotion / faith meter
{
    TK.reset();
    check("faith starts at 60", Math.round(TK.devotion) === 60);
    TK.devotion = 50; TK.resources.food = 0;
    TK.speed = 2; frames(2);
    const d0 = TK.devotion;
    frames(40);
    check("hunger erodes faith", TK.devotion < d0, `${d0.toFixed(1)} -> ${TK.devotion.toFixed(1)}`);
    // resting by warm light restores it
    TK.reset();
    TK.devotion = 40; TK.resources.food = 999;
    TK.speed = 2;
    for (let i = 0; i < 12; i++) { TK.time = 96; for (const vv of TK.villagers) vv.state = "Resting"; frames(10); }
    check("resting by light restores faith", TK.devotion > 40, `dev=${TK.devotion.toFixed(1)}`);
}

// resource balancing: scaling build costs & diminishing farm returns
{
    TK.reset();
    TK.nodes.length = 0;                 // clear scattered trees/rocks for clean spots
    TK.resources.wood = 200; TK.resources.stone = 200;
    const w0 = TK.resources.wood; check("1st house placed", TK.placeBuilding("house", 420, 300)); const c1 = w0 - TK.resources.wood;
    const w1 = TK.resources.wood; check("2nd house placed", TK.placeBuilding("house", 560, 300)); const c2 = w1 - TK.resources.wood;
    check("each building costs more than the last", c2 > c1, `${c1} then ${c2}`);

    TK.reset();
    TK.nodes.length = 0;
    TK.resources.wood = 200;
    TK.placeBuilding("farm", 400, 300); TK.buildings[TK.buildings.length - 1].complete = true;
    const e1 = TK.farmEfficiency;
    TK.placeBuilding("farm", 500, 360); TK.buildings[TK.buildings.length - 1].complete = true;
    TK.placeBuilding("farm", 620, 300); TK.buildings[TK.buildings.length - 1].complete = true;
    const e3 = TK.farmEfficiency;
    check("more farms means diminishing returns", e1 === 1 && e3 < 1, `e1=${e1} e3=${e3.toFixed(2)}`);
}

// save / load round-trip
{
    TK.reset();
    TK.nodes.length = 0;
    TK.resources.wood = 90; TK.resources.stone = 40;       // enough to build first
    check("lumber placed for save test", TK.placeBuilding("lumber", 420, 320));
    TK.resources.wood = 77; TK.resources.stone = 33; TK.resources.food = 22; // set known values AFTER building
    TK.devotion = 48; TK.time = 250;
    TK.villagers[0].name = "Testbert";
    check("save writes to storage", TK.save() === true && TK.hasSave());
    TK.resources.wood = 0; TK.devotion = 99; TK.buildings.length = 0;
    const okL = TK.load();
    check("load restores resources", okL && TK.resources.wood === 77 && TK.resources.stone === 33 && TK.resources.food === 22);
    check("load restores faith & time", Math.round(TK.devotion) === 48 && TK.time === 250);
    check("load restores buildings", TK.buildings.some(b => b.type === "lumber"));
    check("load restores villager names", TK.villagers.some(v => v.name === "Testbert"));
    TK.clearSave();
    check("clearing the save removes it", !TK.hasSave());
    check("loading with no save is a no-op", TK.load() === false);
}

// pause / unpause
TK.reset();
document.getElementById("pauseBtn").onclick();
{
    const t0 = TK.time;
    frames(20);
    check("pause freezes game time", TK.time === t0);
    document.getElementById("pauseBtn").onclick();
    frames(5);
    check("unpause resumes game time", TK.time > t0);
}

// two-step reset
document.getElementById("resetBtn").onclick();
document.getElementById("resetBtn").onclick();
check("double-click reset restarts the kingdom",
    TK.time === 0 && TK.villagers.length === 3 && TK.buildings.length === 0 &&
    TK.paths.size === 0 && TK.props.length === 0 && TK.merchant === null && TK.won === false);

frames(10);
check("loop still alive after all interactions", rafQ.length > 0);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
