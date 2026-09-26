# @omne-harness-lite/unix-format

[中文](README_ZH.md)

Small, independent functions for readable tool output: help sections, aligned
tables, lists, result labels, and line-numbered text. Every renderer returns a
string and has no runtime dependencies, global configuration, or Cordis service.

This is currently a private, unpublished ESM workspace package. Use its public
package import from a workspace consumer after building the checkout; an npm
release is not available. See the [development guide](../../../docs/development.md)
for the Node and pnpm toolchain.

## Public API

| Purpose           | Exports                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Help              | `formatSection`, `formatUsage`, `formatCommandList`, `CommandEntry`                                         |
| Structured text   | `formatTable`, `formatKeyValue`, `formatBulletList`                                                         |
| Result labels     | `formatError`, `formatSuccess`, `formatHold`                                                                |
| Addressable text  | `formatNumberedLines`, `NumberedLinesOptions`                                                               |
| Rendering options | `UnixFormatOptions`, `ResolvedUnixFormatOptions`, `DEFAULT_UNIX_FORMAT_OPTIONS`, `resolveUnixFormatOptions` |

## Render a help section

```ts
import assert from 'node:assert/strict'
import { formatCommandList, formatSection, formatUsage } from '@omne-harness-lite/unix-format'

const commands = formatCommandList([
  ['list', '{}', 'List saved notes'],
  ['read', '{id}', 'Read one note'],
])
const help = formatSection('NOTES', `${formatUsage('notes', 'read', '{id}')}\n${commands}`, {
  markdownCompatible: false,
  indent: 2,
})
assert.ok(help.startsWith('NOTES:\n  USAGE: notes(command="read", params={id})'))
console.log(help)
```

`formatUsage` inserts the parameter synopsis verbatim. Section headings default
to `## TITLE`; `markdownCompatible: false` changes them to `TITLE:`. Blank lines
in the body keep their original whitespace.

## Format structured output

```ts
import assert from 'node:assert/strict'
import { formatKeyValue, formatTable } from '@omne-harness-lite/unix-format'

const table = formatTable(['ID', 'Description'], [['a', 'A much longer description']], {
  maxWidth: 18,
})
assert.ok(table.includes('A much long...'))
console.log(table)

const metadata = formatKeyValue(
  new Map([
    ['10', 'ten'],
    ['2', 'two'],
  ]),
)
assert.equal(metadata, '10: ten\n2 : two')
console.log(metadata)
```

Pass a `Map` when insertion order matters. A record follows JavaScript property
enumeration order, including the ordering of integer-like keys. Tables reject a
row whose cell count differs from the headers; empty headers produce an empty
string.

## Keep line addresses and describe an outcome

```ts
import assert from 'node:assert/strict'
import { formatError, formatHold, formatNumberedLines } from '@omne-harness-lite/unix-format'

const excerpt = formatNumberedLines(['alpha', '😀beta'], {
  start: 41,
  perLineCharLimit: 3,
})
assert.equal(excerpt, '    41 | alp [truncated]\n    42 | 😀be [truncated]')
console.log(excerpt)
console.log(formatError('Note was not found', { hint: 'Run list first' }))
console.log(formatHold('Choose a note', { steps: ['List notes', 'Read its ID'] }))
```

`start` is an integer and can be negative. The number gutter has at least six
characters. `perLineCharLimit` cuts the content and adds ` [truncated]` without
creating another line; `maxWidth` then caps the whole rendered line and can cut
that marker. Missing hints and empty hints differ: an empty hint still emits
`HINT: `.

## Options and boundaries

Defaults are `maxWidth: 120`, `indent: 2`, and `markdownCompatible: true`.
`maxWidth: 0` disables the width cap. Widths, indentation, and content limits must
be non-negative integers or the functions throw `RangeError`.

Width, padding, and truncation count Unicode code points, rather than terminal
display cells or grapheme clusters. Wide characters, emoji, and combining marks
can therefore appear misaligned in a terminal. A table width cap is best effort:
only the last column shrinks, to at least three code points, so wide earlier
columns can still exceed it.

Caller text is preserved, including control characters and embedded newlines;
list and key-value continuations are not automatically indented. These functions
do not sanitize terminal output or determine permissions, success, or retry
policy. `ERROR`, `HOLD`, and `OK` are labels chosen by the caller. The adapted
formatters do not promise general byte-for-byte equivalence with Python.

For package development, run this member's `build`, `typecheck`, and `test`
scripts. Source attribution and adaptations are recorded in
[provenance.json](provenance.json).
