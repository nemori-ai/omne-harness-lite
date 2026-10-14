import { expectTypeOf, it } from 'vitest'
import {
  DEFAULT_UNIX_FORMAT_OPTIONS,
  formatBulletList,
  formatCommandList,
  formatError,
  formatHold,
  formatKeyValue,
  formatNumberedLines,
  formatSection,
  formatSuccess,
  formatTable,
  formatUsage,
  resolveUnixFormatOptions,
  type CommandEntry,
  type NumberedLinesOptions,
  type ResolvedUnixFormatOptions,
  type UnixFormatOptions,
} from '@omne-harness/unix-format'

it('UF6-TYPES consumes all declared public functions and option types', () => {
  const options: UnixFormatOptions = { maxWidth: 0, indent: 0, markdownCompatible: false }
  const resolved: ResolvedUnixFormatOptions = resolveUnixFormatOptions(options)
  expectTypeOf(DEFAULT_UNIX_FORMAT_OPTIONS).toEqualTypeOf<ResolvedUnixFormatOptions>()
  expectTypeOf(resolved.maxWidth).toEqualTypeOf<number>()
  const command: CommandEntry = ['cmd', 'args', 'description']
  const numbered: NumberedLinesOptions = {
    start: -1,
    separator: '|',
    perLineCharLimit: 0,
    maxWidth: 0,
  }
  for (const rendered of [
    formatError('m', { hint: '' }),
    formatHold('m', { steps: ['a'] }),
    formatSuccess('m'),
    formatSection('t', 'b', options),
    formatUsage('t', 'c', 'args'),
    formatCommandList([command]),
    formatTable(['h'], [['v']], options),
    formatKeyValue(new Map([['k', 'v']])),
    formatBulletList(['v']),
    formatNumberedLines(['v'], numbered),
  ])
    expectTypeOf(rendered).toEqualTypeOf<string>()
})

it('UF6-NEGATIVES rejects wrong data, options and mutable declarations', () => {
  // @ts-expect-error renderers consume text rather than guessed serialization
  formatError({ message: 'm' })
  // @ts-expect-error widths are numeric
  resolveUnixFormatOptions({ maxWidth: '80' })
  // @ts-expect-error explicit undefined is not an absent field
  formatNumberedLines(['a'], { start: undefined })
  // @ts-expect-error command entries have all three text fields
  formatCommandList([['cmd', 'args']])
  // @ts-expect-error default declarations are readonly
  DEFAULT_UNIX_FORMAT_OPTIONS.indent = 1
  // @ts-expect-error key-value values are text
  formatKeyValue({ count: 1 })
})
