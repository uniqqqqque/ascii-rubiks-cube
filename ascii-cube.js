/* ══ ASCII Rubik's cube ════════════════════════════════════
   A 3×3×3 cube drawn in characters, turning slowly, that
   scrambles itself a layer at a time and then solves itself by
   playing the same moves back.

   Drawn the way the old spinning ASCII donut (donut.c) is: every
   surface is sampled as a cloud of points, each point is projected
   onto the character grid, and a z-buffer keeps the nearest one
   per cell.

   There is no lighting. Each face of the cube has its own
   character, and a sticker carries that character wherever the
   turns take it: the dotted face is dots on whichever side it
   ends up, so the eye can follow the pieces rather than watch the
   shading change.

   Each of the 26 visible cubies is a block of "black plastic"
   with an inset sticker on each outer face. That is what gives
   the grid lines between stickers, and what keeps the back of the
   cube from showing through the gap while a layer is half-turned.
   The plastic is drawn as blank cells, but they still go in the
   z-buffer, so it hides whatever is behind it.

   One face is coloured (the accent). The other five stay in the
   text colour: in characters, six colours would be noise, and one
   is enough to watch it scatter and come back.

   One file, no dependencies. It works three ways:
     - in a page, as a plain <script>: every <pre data-ascii-cube>
       is filled and animated (see README.md);
     - in a page, by hand: AsciiCube.mount(element, options);
     - in Node: require("./ascii-cube.js").createCube(options)
       gives the frames, which cli.js prints to a terminal.

   MIT licence, see LICENSE. */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AsciiCube = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIST = 11; /* camera distance, in cubie widths */
  /* one character per face, faces 0..5 = +x -x +y -y +z -z: dots
     on the right at the start, "$" on top, ";" on the left */
  const GLYPHS = ".#$=*;";

  /* quarter turn 420ms, eased in and out so it starts and lands
     softly; a beat between moves, a longer one when it is
     scrambled and when it is solved */
  const TURN_MS = 420;
  const GAP_MS = 140;
  const SCRAMBLED_MS = 900;
  const SOLVED_MS = 2200;

  /* 3×3 matrices as flat arrays of nine, row by row */
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const mul = (a, b) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const apply = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
  const rot = (axis, t) => {
    const c = Math.cos(t), s = Math.sin(t);
    if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  };

  /* the point (u, v) on the face of axis a, side s, at depth d */
  const facePoint = (a, s, d, u, v) => {
    const p = [0, 0, 0];
    p[a] = s * d;
    p[(a + 1) % 3] = u;
    p[(a + 2) % 3] = v;
    return p;
  };

  /* ══ the cube itself: state, moves and one frame at a time ══
     options:
       cols        width of the grid in characters (default 72)
       aspect      character width / line height (default 0.6/1.1,
                   a monospace font at line-height 1.1; about 0.5
                   in most terminals)
       moves       quarter turns in a scramble (default 8)
       accentFace  which face is coloured, 0..5 = +x -x +y -y +z -z
                   (default 0, the side on the right at the start)
       glyphs      six characters, one per face in that order
                   (default ".#$=*;")
     returns { cols, rows, frame(nowMs), resize(cols, aspect) };
     frame() moves the animation on to `nowMs` and returns
     { chars, tone, cols, rows }: chars is one string per cell,
     tone is 1 for an accent cell and 0 otherwise. */
  function createCube(options) {
    const opt = options || {};
    const MOVES = opt.moves ?? 8;
    const ACCENT = opt.accentFace ?? 0;
    const GLYPH = String(opt.glyphs ?? GLYPHS).padEnd(6, "#");

    /* ── the grid ────────────────────────────────────────────
       A unit up the screen covers fewer rows than a unit across
       covers columns; `aspect` squares that up. Turning about the
       vertical, the cube is never wider than its horizontal
       diagonal (about 4.3 units), so at 14.8 columns per unit in a
       grid 72 wide it spins without touching the sides; everything
       scales from that. The point spacing on a face stays under
       half a cell, so a face never shows holes. */
    let COLS, ROWS, ASPECT, SCALE, STEP, BODY, STICKER, RING, zbuf, chars, tone;

    /* point offsets across one face, in the face's own (u, v).
       Counted, not stepped: adding STEP up from -half drifts and
       stops one step short of +half, which leaves a sliver between
       two cubies that shows as the odd empty cell. */
    const grid = (half) => {
      const n = Math.ceil((2 * half) / STEP);
      const pts = [];
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n; j++) pts.push([-half + (2 * half * i) / n, -half + (2 * half * j) / n]);
      return pts;
    };

    function resize(cols, aspect) {
      COLS = Math.max(16, Math.round(cols));
      ASPECT = aspect ?? ASPECT ?? 0.6 / 1.1;
      ROWS = Math.max(8, Math.round(COLS * (44 / 72) * (ASPECT / (0.6 / 1.1))));
      const perUnit = (COLS / 72) * 14.8;
      SCALE = perUnit * DIST;
      STEP = Math.min(0.03, 0.45 / perUnit);
      BODY = grid(0.5);
      STICKER = grid(0.44);
      /* under a sticker the plastic is never seen, and drawing it
         anyway makes the two fight: on a face seen edge-on, a
         plastic point nearer the camera along the face wins a cell
         from the sticker point beside it, and the sticker comes out
         full of holes. So an outer face draws only the ring of
         plastic around its sticker. */
      RING = BODY.filter(([u, v]) => Math.max(Math.abs(u), Math.abs(v)) > 0.44 + 1e-9);
      zbuf = new Float32Array(COLS * ROWS);
      chars = new Array(COLS * ROWS);
      tone = new Uint8Array(COLS * ROWS);
    }
    resize(opt.cols ?? 72, opt.aspect);

    /* ── the cubies ──────────────────────────────────────────
       Each has a position on the integer grid -1..1 and an
       orientation; its stickers are fixed in its own frame, so a
       turn only ever changes those two things. The hidden centre
       cubie is left out. */
    const cubies = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const pos = [x, y, z];
          const stickers = [];
          for (let a = 0; a < 3; a++)
            for (const s of [1, -1])
              if (pos[a] === s) stickers.push({ a, s, face: a * 2 + (s < 0 ? 1 : 0) });
          cubies.push({ pos, R: I.slice(), stickers });
        }

    /* ── the moves ───────────────────────────────────────────
       A scramble of MOVES random quarter turns (never the same
       axis twice running, so no two moves cancel or merge), then
       the same list backwards with every turn reversed: it always
       comes home, with no solver needed. */
    const scramble = () => {
      const out = [];
      let last = -1;
      for (let i = 0; i < MOVES; i++) {
        let axis;
        do axis = Math.floor(Math.random() * 3); while (axis === last);
        last = axis;
        out.push({ axis, layer: [-1, 0, 1][Math.floor(Math.random() * 3)], dir: Math.random() < 0.5 ? 1 : -1 });
      }
      const back = out.slice().reverse().map((m) => ({ ...m, dir: -m.dir }));
      return [...out, { pause: SCRAMBLED_MS }, ...back, { pause: SOLVED_MS }];
    };

    const inLayer = (c, m) => m && Math.round(c.pos[m.axis]) === m.layer;
    const finish = (m) => {
      const q = rot(m.axis, (m.dir * Math.PI) / 2).map(Math.round);
      for (const c of cubies) {
        if (!inLayer(c, m)) continue;
        c.pos = apply(q, c.pos).map(Math.round);
        c.R = mul(q, c.R).map(Math.round);
      }
    };

    /* ── drawing one frame ─────────────────────────────────── */
    const draw = (view, move, angle) => {
      zbuf.fill(Infinity);
      chars.fill(" ");
      tone.fill(0);
      const T = move ? rot(move.axis, angle) : I;

      for (const c of cubies) {
        const moving = inLayer(c, move);
        const A = mul(view, moving ? mul(T, c.R) : c.R);
        const b = apply(view, moving ? apply(T, c.pos) : c.pos);

        for (let a = 0; a < 3; a++)
          for (const s of [1, -1]) {
            /* where this face points on the integer grid, and so
               whether anything sits against it */
            const n = [0, 0, 0];
            n[a] = s;
            const nGrid = apply(c.R, n).map(Math.round);
            const next = [c.pos[0] + nGrid[0], c.pos[1] + nGrid[1], c.pos[2] + nGrid[2]];
            const outer = next.some((v) => Math.abs(v) > 1);
            /* an inner face only shows while the layer it sits
               against is turning away from it */
            if (!outer) {
              if (!move) continue;
              const nextMoving = Math.round(next[move.axis]) === move.layer;
              if (moving === nextMoving) continue;
            }
            const nW = apply(A, n);
            /* turned away from the camera: hidden, skip it */
            const ctr = apply(A, facePoint(a, s, 0.5, 0, 0));
            if (nW[0] * (ctr[0] + b[0]) + nW[1] * (ctr[1] + b[1]) + nW[2] * (ctr[2] + b[2] + DIST) >= 0) continue;

            const sticker = outer ? c.stickers.find((k) => k.a === a && k.s === s) : null;
            const tint = sticker && sticker.face === ACCENT ? 1 : 0;
            const ch = sticker ? GLYPH[sticker.face] : " ";

            const plot = (pts, depth, glyph, t) => {
              for (const [u, v] of pts) {
                const p = apply(A, facePoint(a, s, depth, u, v));
                const z = p[2] + b[2] + DIST;
                const k = SCALE / z;
                const col = Math.round(COLS / 2 + (p[0] + b[0]) * k);
                const row = Math.round(ROWS / 2 - (p[1] + b[1]) * k * ASPECT);
                if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
                const i = row * COLS + col;
                if (z < zbuf[i]) { zbuf[i] = z; chars[i] = glyph; tone[i] = t; }
              }
            };
            plot(sticker ? RING : BODY, 0.5, " ", 0);
            if (sticker) plot(STICKER, 0.51, ch, tint);
          }
      }
      return { chars, tone, cols: COLS, rows: ROWS };
    };

    /* the camera looks a little down on it, so the top face shows,
       and it turns slowly about the vertical */
    const viewAt = (t) => mul(rot(0, -0.5 + Math.sin(t * 0.00031) * 0.12), rot(1, 0.7 + t * 0.00028));

    /* ── the clock ───────────────────────────────────────────
       frame(now) runs the move queue up to `now` and draws. The
       first call starts the clock; the first move comes 1.2s in. */
    let queue = [];
    let move = null, moveStart = 0, waitUntil = null;
    const frame = (now) => {
      if (waitUntil === null) waitUntil = now + 1200;
      let angle = 0;
      if (move) {
        const u = Math.min(1, (now - moveStart) / TURN_MS);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        angle = (move.dir * Math.PI * e) / 2;
        if (u >= 1) { finish(move); move = null; angle = 0; waitUntil = now + GAP_MS; }
      } else if (now >= waitUntil) {
        if (!queue.length) queue = scramble();
        const next = queue.shift();
        if (next.pause) waitUntil = now + next.pause;
        else { move = next; moveStart = now; }
      }
      return draw(viewAt(now), move, angle);
    };

    return {
      get cols() { return COLS; },
      get rows() { return ROWS; },
      frame,
      /* a still frame at the starting angle, nothing turning */
      still: () => draw(viewAt(0), null, 0),
      resize,
    };
  }

  /* ══ in a page ═══════════════════════════════════════════════
     Fills `el` (best a <pre>) with the cube and keeps it turning.
     Accent cells are wrapped in <span class="ascii-cube-accent">,
     runs of them in one span, not one per cell. The loop stops
     while the element is off screen or the tab is hidden, and with
     "reduce motion" asked for it draws one still frame. Returns a
     function that stops it. */
  function toHTML(f) {
    let html = "";
    for (let r = 0; r < f.rows; r++) {
      let run = "", t = 0;
      for (let c = 0; c < f.cols; c++) {
        const i = r * f.cols + c;
        if (f.tone[i] !== t) {
          html += t ? `<span class="ascii-cube-accent">${run}</span>` : run;
          run = "";
          t = f.tone[i];
        }
        run += f.chars[i];
      }
      html += (t ? `<span class="ascii-cube-accent">${run}</span>` : run) + (r < f.rows - 1 ? "\n" : "");
    }
    return html;
  }

  function mount(el, options) {
    const cube = createCube(options);
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      el.innerHTML = toHTML(cube.still());
      return () => {};
    }
    let raf = 0, seen = true, stopped = false;
    const tick = (now) => {
      if (stopped || !seen || document.hidden) { raf = 0; return; }
      el.innerHTML = toHTML(cube.frame(now));
      raf = requestAnimationFrame(tick);
    };
    const resume = () => { if (!raf && !stopped && seen && !document.hidden) raf = requestAnimationFrame(tick); };
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([e]) => { seen = e.isIntersecting; resume(); })
      : null;
    if (io) io.observe(el);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }

  /* every <pre data-ascii-cube> on the page starts by itself;
     data-cols, data-moves, data-aspect, data-accent-face and
     data-glyphs pass the options above */
  if (typeof document !== "undefined") {
    const start = () => {
      for (const el of document.querySelectorAll("[data-ascii-cube]")) {
        if (el.dataset.asciiCubeMounted) continue;
        el.dataset.asciiCubeMounted = "1";
        const num = (k) => (el.dataset[k] !== undefined ? Number(el.dataset[k]) : undefined);
        mount(el, { cols: num("cols"), moves: num("moves"), aspect: num("aspect"), accentFace: num("accentFace"), glyphs: el.dataset.glyphs });
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  return { createCube, mount, toHTML };
});
