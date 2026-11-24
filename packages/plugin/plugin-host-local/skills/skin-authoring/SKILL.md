---
name: skin-authoring
description: Write a skin for the omne desktop client: a plugin with "kind":"skin" that changes how the interface looks. Use when asked to make, change or fix a skin or theme, to give the app a character, colours, icons, a backdrop or images.
---

# Writing a skin

A skin is a plugin whose manifest writes `"kind":"skin"` and whose members are all under `client`. A tenant may hold several. The interface wears one at a time; a person switches on the assets page, and every place changes in the same frame.

`OmneExtensions help publish skin` prints the short checklist of this file.

## The manifest

```json
{"schema":1,"name":"sea","summary":"One sentence on how it looks.","kind":"skin","client":{"members":[{"point":"shell.tokens","key":"shell.app","data":{"--omne-accent":"light-dark(#0a7a4a, #5fd3a4)"}}]}}
```

- `name`: lower-case letters, digits and hyphens, starting with a letter.
- A member names a `point` and a `key`, and gives one of: `data` (a JSON value), or `module` with `export` (a `.js` file in the package and the name it exports).
- No `server` side.

## The layers

Use the layers the look needs. Each is a point.

| Point | Key | Gives |
| --- | --- | --- |
| `shell.tokens` | `shell.app` (or a part that opens tokens) | colours, radii, fonts: a record of token names and values |
| `shell.part-style` | a part that opens style | CSS of the part at rest and in each state |
| `shell.part-render` | a part that opens render | a drawing of the part, usually around `builtIn()` |
| `shell.icon` | an icon name | a drawing of that icon, given `{ name, size, className }` |
| `shell.piece` | `loading`, `empty-state`, `inline-notice`, `figure` | a drawing of a shared piece, given what that piece shows |

Find names with `OmneExtensionPoints show <point>`: it lists the keys and says what a value or a drawing is given. A part takes only the layers it opens.

A drawing module:

```js
// The export is called once with { React, ui, shell, files } and gives back the drawing.
export const header = ({ React }) => ({ part, builtIn }) =>
  React.createElement('div', { ...part, style: { position: 'relative' } }, builtIn())
```

- Spread `part` on the outermost element, or the part cannot be found.
- A drawing on `shell.icon` or `shell.piece` gets `{ subject, generic }`; call `generic()` for the built-in.
- Write no package names. Use only what is handed in.
- Do not call hooks in the drawing itself. Put stateful pieces in a component of their own.

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
