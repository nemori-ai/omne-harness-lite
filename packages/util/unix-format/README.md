# @omne-harness/unix-format

[中文](README_ZH.md)

Pure functions that format text by Unicode code point. This member is a port of the sealed `packages.0.0.1.legacy/util/unix-format` package. The function names and the tested output bytes are unchanged. The package name is `@omne-harness/unix-format`.

## Responsibility and status

The member owns section headings, usage lines, aligned command lists, key-value blocks, tables, numbered lines, and success, hold, and error envelopes. It does not own an application's command list or its help policy. Behavior that the types do not state is in [SPEC.md](SPEC.md).

## Usage

```ts
import { formatSection } from '@omne-harness/unix-format'

formatSection('SYNOPSIS', 'my_tool command [params]')
```

The call above returns `## SYNOPSIS\n  my_tool command [params]`.

## Contracts

`formatSection` puts a Markdown heading over an indented body. `markdownCompatible: false` uses a `TITLE:` heading instead. `formatUsage(toolName, command, paramsSynopsis)` returns one `USAGE:` line and inserts the synopsis verbatim. `formatCommandList` aligns name and synopsis columns and returns an empty string for an empty list. `formatKeyValue`, `formatTable`, and `formatBulletList` render structured blocks. `formatNumberedLines` renders addressed lines. `formatSuccess`, `formatHold`, and `formatError` render outcome envelopes.

Column width uses Unicode code points, not UTF-16 code units.

## Design

`src/sections.ts` renders help-shaped blocks. `src/structured.ts` renders lists and tables. `src/numbered.ts` renders addressed lines. `src/envelope.ts` renders outcomes. `src/text.ts` measures and pads by code point. `src/options.ts` resolves indent and the heading style. `src/index.ts` re-exports the public surface.

## Configuration and operation

`UnixFormatOptions` selects indent and Markdown-compatible headings. `DEFAULT_UNIX_FORMAT_OPTIONS` is the default. The functions do not read the environment or the filesystem.

Node `>=24.18.0 <25`. There is no runtime dependency.

## Verification

`pnpm test` builds, then runs the characterization suite copied from the sealed package. `pnpm run typecheck` builds, then typechecks the tests. One case imports the built `dist/index.js` from plain Node.

## Maintenance

A change to an output string updates SPEC.md and the matching test in the same change. `omne --help` is not a caller of this package. Do not change these functions in order to match that help text.
