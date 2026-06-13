// Headless smoke test for Tiny Kingdom.
// Stubs out the DOM + canvas, evals the game script from index.html,
// drives the real requestAnimationFrame loop for ~10 minutes of game
// time, and asserts the simulation makes progress without errors.
//
// Run with: node test/smoke.mjs

import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!code) { console.error("FAIL: no <script> block found in index.html"); process.exit(1); }

// ---------------------------------------------------------------
// universal no-op proxy: any property access / call returns itself,
// numeric coercion yields 0 — good enough for a canvas 2d context
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
        id: id || "",
        textContent: "",
        className: "",
        style: {},
        dataset: {},
        disabled: false,
        onclick: null,
        classList: makeClassList(),
        listeners: {},
        addEventListener(t, f) { (this.listeners[t] ??= []).push(f); },
        appendChild() {},
        remove() {},
        querySelector() { return makeEl(); },
        get offsetWidth() { return 0; },
    };
}

const canvasEl = makeEl("game");
canvasEl.getContext = () => anyProxy;

const elements = new Map([["game", canvasEl]]);
globalThis.document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
    },
    createElement() { return makeEl(); },
    addEventListener() {},
};

globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;

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
const fireClick = (x, y) => canvasEl.listeners.click?.forEach(f => f({ clientX: x, clientY: y, target: canvasEl }));
const allFinite = () =>
    [...TK.villagers, ...TK.nodes, ...TK.buildings].every(e => Number.isFinite(e.x) && Number.isFinite(e.y));

console.log("boot:");
check("TK debug handle exists", !!TK);
check("starts with 3 villagers", TK.villagers.length === 3);
check("nature scattered", TK.nodes.length >= 15, `got ${TK.nodes.length}`);
check("starts with 20 wood / 10 stone", TK.resources.wood === 20 && TK.resources.stone === 10);

console.log("long run (~10 min of game time at 4x):");
TK.speed = 4;
const eventsSeen = new Set();
let popCapSeen = TK.popCap;
for (let burst = 0; burst < 30; burst++) {
    frames(50); // 50 frames * 0.4s = 20s game time per burst
    if (TK.event !== "None") eventsSeen.add(TK.event);
    popCapSeen = Math.max(popCapSeen, TK.popCap);
    if (!allFinite()) break;
}
check("game time advanced ~600s", TK.time > 550, `t=${TK.time.toFixed(0)}`);
check("all positions stayed finite", allFinite());
check("population grew", TK.villagers.length > 3, `pop=${TK.villagers.length}`);
check("auto-grow constructed buildings", TK.buildings.filter(b => b.complete).length >= 1,
    `built=${TK.buildings.length}`);
const spent = TK.buildings.reduce((s, b) => s + (b.type === "house" ? 10 : b.type === "quarry" ? 10 : 15), 0);
check("villagers gathered resources", TK.resources.wood + TK.resources.stone + spent > 40,
    `wood=${TK.resources.wood} stone=${TK.resources.stone} spent=${spent}`);
check("at least one event fired", eventsSeen.size >= 1, [...eventsSeen].join(",") || "none");
check("no villager stuck on a finished building",
    TK.villagers.every(v => !(v.state === "Building" && v.target && v.target.complete)));
check("house raised the population cap", popCapSeen > 5 || !TK.buildings.some(b => b.complete && b.type === "house"),
    `cap=${popCapSeen}`);
check("HUD wood counter rendered", document.getElementById("wood").textContent !== "");

console.log("interactions:");
TK.speed = 1;
TK.reset();
frames(5);

// manual gathering by clicking a node (one far away from any villager)
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

// tree placement through the toolbar + canvas click path
document.getElementById("treeBtn").onclick();
check("tree tool selected", TK.placement && TK.placement.type === "tree");
{
    const before = TK.nodes.length;
    outer: for (let y = 220; y < 600; y += 40) {
        for (let x = 80; x < 1200; x += 40) {
            fireClick(x, y);
            if (TK.nodes.length > before) break outer;
        }
    }
    check("clicking ground plants a tree", TK.nodes.length === before + 1);
}
fireKey("Escape");
check("Escape cancels placement", TK.placement === null);

// manual house placement → construction → completion → pop cap
// (auto-grow off so no other construction interferes with the checks)
document.getElementById("autoBtn").onclick();
check("auto-grow toggles off", TK.autoGrow === false);
TK.resources.wood = 60; TK.resources.stone = 60;
document.getElementById("buildHouseBtn").onclick();
{
    const before = TK.buildings.length;
    outer: for (let y = 240; y < 580; y += 50) {
        for (let x = 320; x < 1200; x += 50) {
            fireClick(x, y);
            if (TK.buildings.length > before) break outer;
        }
    }
    check("clicking ground places a house site", TK.buildings.length === before + 1);
    const house = TK.buildings[TK.buildings.length - 1];
    fireKey("Escape");
    TK.speed = 4;
    frames(200); // 80s — plenty for walk + build
    check("villagers completed the house", house.complete);
    check("pop cap rose to 7", TK.popCap === 7, `cap=${TK.popCap}`);
    check("no one is still 'Building' afterwards", TK.villagers.every(v => v.state !== "Building"));
}

// pause stops game time
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
    TK.time === 0 && TK.villagers.length === 3 && TK.buildings.length === 0);

frames(10);
check("loop still alive after all interactions", rafQ.length > 0);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
