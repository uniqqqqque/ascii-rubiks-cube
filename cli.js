#!/usr/bin/env node
/* ══ the cube in a terminal ════════════════════════════════
   node cli.js [--moves N] [--fps N] [--no-color]
   (also written --fps=N or --fps165)

   Fills as much of the terminal as the cube needs, 30 frames a
   second unless --fps says otherwise; a high-refresh screen can
   take --fps 144 or --fps 165. If a frame is not ready in time
   (a very wide window, or a terminal that cannot draw that
   fast), frames are dropped rather than queued, so the motion
   keeps real time. The accent face is orange (truecolor, or the
   nearest of the 256 colours where the terminal has no
   truecolor). Ctrl+C or q stops it and gives the screen back.

   When the output is not a terminal (piped to a file, say) it
   prints one still frame and exits. */

"use strict";
const { createCube } = require("./ascii-cube.js");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
/* --fps 165, --fps=165 and --fps165 all mean the same */
const value = (name, fallback) => {
  let raw;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) raw = args[i + 1];
    else if (a.startsWith(name)) raw = a.slice(name.length).replace(/^=/, "");
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

if (flag("--help") || flag("-h")) {
  console.log("usage: node cli.js [--moves N] [--fps N] [--no-color]\n" +
    "  --moves N   quarter turns in each scramble (default 8)\n" +
    "  --fps N     frames per second, e.g. 60, 144, 165 (default 30)\n" +
    "  --no-color  no colour\n" +
    "  q or Ctrl+C to quit");
  process.exit(0);
}

const out = process.stdout;
const tty = out.isTTY;
const color =
  !flag("--no-color") && !process.env.NO_COLOR && tty;
const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM || "");
const ORANGE = truecolor ? "\x1b[38;2;255;176;0m" : "\x1b[38;5;214m";
const RESET = "\x1b[0m";

/* a terminal cell is roughly twice as tall as it is wide */
const ASPECT = 0.5;

/* the widest grid whose height still fits the window */
const fit = () => {
  const cols = out.columns || 80;
  const rows = (out.rows || 24) - 1;
  const perRow = (44 / 72) * (ASPECT / (0.6 / 1.1)); /* rows per column */
  return Math.max(16, Math.min(cols, Math.floor(rows / perRow)));
};

const cube = createCube({ cols: fit(), aspect: ASPECT, moves: value("--moves", 8) });

const render = (f) => {
  const lines = [];
  for (let r = 0; r < f.rows; r++) {
    let line = "", t = 0;
    for (let c = 0; c < f.cols; c++) {
      const i = r * f.cols + c;
      if (color && f.tone[i] !== t) {
        t = f.tone[i];
        line += t ? ORANGE : RESET;
      }
      line += f.chars[i];
    }
    if (color && t) line += RESET;
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
};

if (!tty) {
  out.write(render(cube.still()).join("\n") + "\n");
  process.exit(0);
}

/* the alternate screen, cursor hidden, and both put back however
   it ends */
out.write("\x1b[?1049h\x1b[?25l\x1b[2J");
let timer = null;
const restore = () => {
  clearTimeout(timer);
  out.write(RESET + "\x1b[?25h\x1b[?1049l");
};
const quit = () => { restore(); process.exit(0); };
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
process.on("exit", () => out.write("\x1b[?25h"));
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (b) => {
    const k = b.toString();
    if (k === "q" || k === "Q" || k === "\x03") quit();
  });
}

out.on("resize", () => {
  cube.resize(fit(), ASPECT);
  out.write("\x1b[2J");
});

/* ── the clock ─────────────────────────────────────────────
   Each frame is scheduled for its own moment rather than with a
   fixed setInterval, which at 165 fps (6ms) would pile frames up
   whenever one ran long. Running late, it skips to the next due
   moment instead of catching up; and while the terminal is still
   swallowing the last frame, it waits for it rather than burying
   it under more. */
const { performance } = require("perf_hooks");
const FPS = Math.min(1000, value("--fps", 30));
const PERIOD = 1000 / FPS;
const t0 = performance.now();
let due = t0;

const draw = () => {
  const f = cube.frame(performance.now() - t0);
  /* centre the grid in the window, then draw it from the top */
  const padTop = Math.max(0, Math.floor(((out.rows || 24) - f.rows) / 2));
  const padLeft = " ".repeat(Math.max(0, Math.floor(((out.columns || 80) - f.cols) / 2)));
  const lines = render(f).map((l) => padLeft + l + "\x1b[K");
  return out.write("\x1b[H" + "\x1b[K\n".repeat(padTop) + lines.join("\n") + "\x1b[J");
};

const loop = () => {
  const flushed = draw();
  const now = performance.now();
  due += PERIOD;
  if (due < now) due = now + PERIOD - ((now - t0) % PERIOD);
  const next = () => { timer = setTimeout(loop, Math.max(0, due - performance.now())); };
  if (flushed) next();
  else out.once("drain", next);
};
loop();
