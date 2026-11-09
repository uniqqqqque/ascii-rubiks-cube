#!/usr/bin/env node
/* ══ the cube in a terminal ════════════════════════════════
   node cli.js [--moves N] [--fps N] [--no-color]

   Fills as much of the terminal as the cube needs, about 30
   frames a second. The accent face is orange (truecolor, or the
   nearest of the 256 colours where the terminal has no
   truecolor). Ctrl+C or q stops it and gives the screen back.

   When the output is not a terminal (piped to a file, say) it
   prints one still frame and exits. */

"use strict";
const { createCube } = require("./ascii-cube.js");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

if (flag("--help") || flag("-h")) {
  console.log("usage: node cli.js [--moves N] [--fps N] [--no-color]");
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
  clearInterval(timer);
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

const t0 = Date.now();
timer = setInterval(() => {
  const f = cube.frame(Date.now() - t0);
  /* centre the grid in the window, then draw it from the top */
  const padTop = Math.max(0, Math.floor(((out.rows || 24) - f.rows) / 2));
  const padLeft = " ".repeat(Math.max(0, Math.floor(((out.columns || 80) - f.cols) / 2)));
  const lines = render(f).map((l) => padLeft + l + "\x1b[K");
  out.write("\x1b[H" + "\x1b[K\n".repeat(padTop) + lines.join("\n") + "\x1b[J");
}, 1000 / value("--fps", 30));
