---
name: skin-authoring
description: Write a skin for the omne desktop client: a plugin with "kind":"skin" that changes how the interface looks. Use when asked to make, change or fix a skin or theme, to give the app a character, colours, icons, a backdrop or images.
---

# Writing a skin

A skin is a plugin whose manifest writes `"kind":"skin"` and whose members are all under `client`. A tenant may hold several. The interface wears one at a time; a person switches on the assets page. A skin counts everywhere the application draws: the window, the canvas on the back, and the figure with its notes when it is outside the window. The window changes in one frame. What is drawn outside the window follows within a few seconds, also as a whole.

`OmneExtensions help publish skin` prints the short checklist of this file.

## The manifest

```json
{
  "schema": 1,
  "name": "sea",
  "summary": "One sentence on how it looks.",
  "kind": "skin",
  "client": {
    "members": [
      {
        "point": "shell.tokens",
        "key": "shell.app",
        "data": { "--omne-accent": "light-dark(#0a7a4a, #5fd3a4)" }
      }
    ]
  }
}
```

- `name`: lower-case letters, digits and hyphens, starting with a letter.
- A member names a `point` and a `key`, and gives one of: `data` (a JSON value), or `module` with `export` (a `.js` file in the package and the name it exports).
- No `server` side.

## The layers

Use the layers the look needs. Each is a point.

| Point               | Key                                                 | Gives                                                     |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `shell.tokens`      | `shell.app` (or a part that opens tokens)           | colours, radii, fonts: a record of token names and values |
| `shell.part-style`  | a part that opens style                             | CSS of the part at rest and in each state                 |
| `shell.part-render` | a part that opens render                            | a drawing of the part, usually around `builtIn()`         |
| `shell.icon`        | an icon name                                        | a drawing of that icon, given `{ name, size, className }` |
| `shell.piece`       | `loading`, `empty-state`, `inline-notice`, `figure`, `note` | a drawing of a shared piece, given what that piece shows  |
| `shell.say-phrase`  | a name of your own for the phrase                   | data `{ label, words, order? }`: a ready phrase beside the say note |

Find names with `OmneExtensionPoints show <point>`: it lists the keys and says what a value or a drawing is given. A part takes only the layers it opens.

A drawing module:

```js
// The export is called once with { React, ui, shell, files } and gives back the drawing.
export const header =
  ({ React }) =>
  ({ part, builtIn }) =>
    React.createElement('div', { ...part, style: { position: 'relative' } }, builtIn())
```

- Spread `part` on the outermost element, or the part cannot be found.
- A drawing on `shell.icon` or `shell.piece` gets `{ subject, generic }`; call `generic()` for the built-in.
- Write no package names. Use only what is handed in.
- Do not call hooks in the drawing itself. Put stateful pieces in a component of their own.

The application draws in more than one page. Each page loads the module and calls the export for itself, so an export must hold to three rules:

- It can be called more than once. Each call gives back a drawing that works.
- It makes the drawing only from what is handed in and from its own module. It does not depend on another export having been called.
- The drawing works when the rest of the interface is not there. Outside the window there is no sidebar and no page.

You do not need to know which page draws. The same part names and the same keys hold everywhere.

## The figure

The key `figure` on `shell.piece` draws the body of the agent's figure. The subject is `{ size, phase, hover, doing, waiting }`.

| `phase`  | The figure                                                        |
| -------- | ----------------------------------------------------------------- |
| `seated` | is at rest: in its seat, or settled at a point outside the window |
| `flying` | moves by itself to a point                                        |
| `held`   | follows the hand, or stays where the hand let it go               |

- `doing` is `idle`, `thinking`, `looking`, `writing` or `background`. `waiting` is the count of what waits for the person.
- The shell places the figure, moves it and takes the press. Draw only the body, inside a square of `size` pixels.
- The same drawing is used in the window and on the desktop. There is no phase for "outside the window".

What the figure writes has parts of its own. They open tokens and style:

| Part                 | What it is                                    |
| -------------------- | --------------------------------------------- |
| `shell.figure`       | the figure                                    |
| `shell.figure.label` | the label beside the figure in the hand       |
| `shell.figure.note`  | the note a person writes one sentence in      |
| `shell.figure.told`  | the note that tells a strong reminder         |
| `shell.figure.frame` | the frame around a window the figure looks at |

The canvas on the back has parts too: `canvas.view`, `canvas.paper`, `canvas.status`, `canvas.item`, `canvas.pile`, `canvas.finder`, `canvas.mark`, `canvas.home`, `canvas.turn`. `OmneExtensionPoints show shell.part-style` lists every part with what it is.

The ink of the figure and of the notes reads the tokens. Two tokens set the edge of a note: `--omne-ink-bubble-edge-full` and `--omne-ink-bubble-edge-light`. The corner of a note reads `--omne-radius-window`.

## Light and dark

Write each colour as `light-dark(light, dark)`. Look at the skin in both themes before you call it done.

## Images

- Carry `.png`, `.jpg`, `.webp`, `.avif` or `.svg` files. Each must begin as its kind does, or the package is refused.
- In data, point at one with `file(path)`, for example `"background-image": "file(art/scene.webp)"`.
- In code, get its address with `files.url(path)`.
- An image is fetched the first time it is drawn, and cached by version. A skin that is held but not worn fetches nothing.
- Ship only art you may ship. Draw your own: characters from the community belong to their authors and carry their licences.
- Keep images small: render vector art to WebP at twice its displayed size.

## Before you finish

1. Publish. A refused publish says why: fix that and publish again.
2. Enable the skin.
3. A person wears it on the assets page and sees it in light and dark.
4. A drawing that throws falls back to the built-in at that place; the rest of the page is not affected. Check that no place fell back.
5. Take the figure out of the window and click it. The figure and its note must look like the skin there too.
