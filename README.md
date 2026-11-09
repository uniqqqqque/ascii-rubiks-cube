# ASCII Rubik's cube

A 3×3×3 Rubik's cube drawn in plain characters. It turns slowly, scrambles itself
with 8 random quarter turns, then solves itself by playing the same moves back,
and starts over.

One file (`ascii-cube.js`), no dependencies. It runs in a terminal (Node.js) and
on any web page.

```text
                       $$$$$$$$$
                  $$$ $$$$$$$$$$ $$$$$$
             $$$$$$$$$$$$$$ $$$$$$$$$$$$$$$$$
        $$$$$$$ $$$$$$$ $$$$$$$$$  $$$$$$$$$$$$$$$$$
   $$$$$$$$$$$$$$$ $ $$$$$$$$$$$$$$$$$$$ $$$$$$$$$$
       $$$$$$$ $$$$$$$$$$$ $$$$ $$$$$$$$$$$$$$       .
  ;;;;      $$$$$$$$$$$$$$$ $$$  $$$$$$$$$$$    ......
  ;;;;;;;;       $$$$$$ $$$$$$$$$$$$$ $$$    .........
   ;;;;;;; ;;;;       $$$$$$$$$$$$$$$$    ..... ......
   ;;;;;;; ;;;;;;;;;       $$$$$$$     . ...... .....
   ;;;;;;; ;;;;;;;;;;;;;;          ..... ...... .....
   ;;;;;;; ;;;;;;;;;;;;;;;;;;;  ............... ..  .
   ;;  ;;;;;;;;;;;;;;;;;;;;;;;  ...............  ....
   ;;;;;;   ;;;;;;;; ;;;;;;;;;  ............. .......
    ;;;;;;; ;;  ;;;; ;;;;;;;;;  .......... ..........
    ;;;;;;; ;;;;;;   ;;;;;;;;;  ....... ............
    ;;;;;;; ;;;;;;;; ;; ;;;;;;  ....  . ...... ....
    ; ;;;;; ;;;;;;;; ;;;;;  ;;  . ..... ...... . ...
    ;;;; ;; ;;;;;;;; ;;;;;;;;;  ....... ...... .....
     ;;;;;;  ;;;;;;; ;;;;;;;;;  ....... .... .......
     ;;;;;;;;;;;;;;; ;;;;;;;;;  ....... . .........
     ;;;;;;;;;;;;;;  ;;;;;;;;;  ......  ..........
      ;;;;;; ;;;;;;; ;; ;;;;;;  .... .. ........
         ;;; ;;;;;;; ;;;;; ;;;  .. ..........
             ;;;;;;; ;;;;;;;;;  ............
                ;;;;;;;;;;;;;;  .........
                   ;;;;;;;;;;;  .......
                      ;;;;;;;;  .....
                         ;;;;;  ...
                             ;
```

Each face has its own character and keeps it wherever the turns take it, so you can
follow the pieces. One face is coloured (orange by default).

## Run it in a terminal

You need [Node.js](https://nodejs.org) 14 or newer.

Without installing anything:

```sh
npx github:uniqqqqque/ascii-rubiks-cube
```

Or from a copy of the repository:

```sh
git clone https://github.com/uniqqqqque/ascii-rubiks-cube.git
cd ascii-rubiks-cube
node cli.js
```

Press `q` or `Ctrl+C` to quit. The cube fills as much of the window as it can.
If you resize the window, it adjusts.

Options:

| Option | What it does | Default |
| --- | --- | --- |
| `--moves N` | quarter turns in each scramble | 8 |
| `--fps N` | frames per second | 30 |
| `--no-color` | no colour (also when `NO_COLOR` is set) | colour on |

When the output is not a terminal (`node cli.js > cube.txt`), it prints one
still frame and exits.

## Add it to a website

**1. Load the script.** Either copy `ascii-cube.js` next to your page:

```html
<script src="ascii-cube.js" defer></script>
```

or load it from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/gh/uniqqqqque/ascii-rubiks-cube@1.0.0/ascii-cube.js" defer></script>
```

**2. Put an element where the cube should be:**

```html
<pre data-ascii-cube role="img" aria-label="A Rubik's cube drawn in ASCII characters, turning and solving itself"></pre>
```

Every element with `data-ascii-cube` starts on its own once the page has loaded.

**3. Style it.** The cube expects a monospace font at `line-height: 1.1`. Pick the
font size so its 72 columns fit (one column is about `0.6em` wide):

```css
[data-ascii-cube] {
  margin: 0;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: min(12px, calc(95vw / 72 / 0.6));
  line-height: 1.1;
  color: #e9e9e6; /* the five plain faces */
}

.ascii-cube-accent {
  color: #ffb000; /* the coloured face */
}
```

`example.html` is a complete page. Open it in a browser to see the result.

### Options

Set these as `data-` attributes on the element, or pass them to `AsciiCube.mount`:

| Attribute | Option | What it does | Default |
| --- | --- | --- | --- |
| `data-cols` | `cols` | width in characters (the height follows) | 72 |
| `data-moves` | `moves` | quarter turns in each scramble | 8 |
| `data-accent-face` | `accentFace` | coloured face: 0..5 = +x −x +y −y +z −z | 0 |
| `data-glyphs` | `glyphs` | six characters, one per face, in the same order | `.#$=*;` |
| `data-aspect` | `aspect` | character width ÷ line height; change it if you change `line-height` | 0.6 / 1.1 |

### From JavaScript

```js
const stop = AsciiCube.mount(document.querySelector("#cube"), { moves: 10 });
// later: stop();
```

In Node.js, `require("./ascii-cube.js").createCube(options)` returns an object whose
`frame(ms)` gives the grid for that moment (`chars`, `tone`, `cols`, `rows`).
`cli.js` shows how to draw it.

## How it works

- **Model.** 26 small cubes, each with a grid position and an orientation. Its
  stickers are fixed to it, so a turn only changes those two things.
- **Moves.** A scramble is 8 random quarter turns, never on the same axis twice
  in a row. Solving plays the list back in reverse with every turn flipped, so no
  solver is needed. A turn takes 420 ms and is eased in and out.
- **Drawing.** The same idea as the classic spinning ASCII donut
  ([donut.c](https://www.a1k0n.net/2011/07/20/donut-math.html) by Andy Sloane).
  Every face is sampled as a cloud of points. Each point is projected with
  perspective onto the character grid, and a z-buffer keeps the nearest point in
  each cell. The gaps between stickers are blank cells that still hide what is
  behind them.

It all runs on the visitor's device. On a page the animation pauses while the cube
is off screen or the tab is hidden. If the visitor has asked for reduced motion,
it draws one still frame instead.

## Licence

MIT, see [LICENSE](LICENSE).
