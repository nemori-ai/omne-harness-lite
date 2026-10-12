// Finite comparison against the fixed source branch golden fixture.
// The historical Python producer is not executed by this suite.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
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
} from '@omne-harness-lite/unix-format'

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
) as { same: Record<string, string> }

const same: Record<string, () => string> = {
  error_plain: () => formatError('Operation failed.'),
  error_hint: () => formatError('Operation failed.', { hint: "Try 'retry' command." }),
  error_multiline: () => formatError('line 1\nline 2', { hint: 'check docs' }),
  error_empty: () => formatError(''),
  error_empty_hint: () => formatError('boom', { hint: '' }),
  hold_plain: () => formatHold('Read help first.'),
  hold_empty_steps: () => formatHold('msg', { steps: [] }),
  hold_steps: () =>
    formatHold('Before install:', { steps: ['Read skill doc', 'Set i_have_read_skill=true'] }),
  hold_newline_step: () => formatHold('m', { steps: ['line1\nline2'] }),
  ok_plain: () => formatSuccess('Installed v1.0.'),
  ok_hint: () => formatSuccess('Installed v1.0.', { hint: "Run 'list' to verify." }),
  ok_empty: () => formatSuccess('', { hint: '' }),
  section_md: () => formatSection('SYNOPSIS', 'my_tool command [params]'),
  section_plain: () =>
    formatSection('SYNOPSIS', 'my_tool command [params]', { markdownCompatible: false }),
  section_indent4_blank: () =>
    formatSection('DESC', 'line 1\n\nline 2', { markdownCompatible: false, indent: 4 }),
  usage: () => formatUsage('manage_skills', 'install', '{name, version?}'),
  usage_quotes: () => formatUsage('tool', 'x', '{"name": "x"}'),
  cmdlist: () =>
    formatCommandList([
      ['init', '{name}', 'Create a workspace.'],
      ['mount', '{workspace_id}', 'Mount an existing workspace.'],
      ['help', '(no params)', 'Show command reference.'],
    ]),
  cmdlist_empty: () => formatCommandList([]),
  cmdlist_empty_synopsis: () => formatCommandList([['solo', '', 'desc']]),
  cmdlist_emoji: () =>
    formatCommandList([
      ['😀', 'a', 'd'],
      ['ab', 'b', 'e'],
    ]),
  table_basic: () =>
    formatTable(
      ['Name', 'Version'],
      [
        ['alpha', '1.0'],
        ['beta', '2.1.3'],
      ],
    ),
  table_header_only: () => formatTable(['Name'], []),
  table_empty: () => formatTable([], []),
  table_widen: () => formatTable(['X', 'Y'], [['long_value_here', 'short']]),
  table_overflow: () =>
    formatTable(['AAAA', 'BBBB'], [['x'.repeat(13), 'y'.repeat(13)]], { maxWidth: 10 }),
  table_slack: () =>
    formatTable(['AAAAA', 'BBBBB', 'CCCCC'], [['xxxxx', 'yyyyy', 'zzzzz']], { maxWidth: 10 }),
  table_default_cap: () => formatTable(['A', 'B'], [['x'.repeat(100), 'y'.repeat(100)]]),
  table_nocap: () => formatTable(['A'], [['x'.repeat(200)]], { maxWidth: 0 }),
  table_fits: () => formatTable(['A', 'B'], [['short', 'short']], { maxWidth: 40 }),
  table_cjk: () =>
    formatTable(
      ['名称', '版本'],
      [
        ['中文内容', '1.0'],
        ['foo', '贰.零'],
      ],
    ),
  kv: () => formatKeyValue({ name: 'alpha', version: '1.0' }),
  kv_empty: () => formatKeyValue({}),
  kv_empty_key: () => formatKeyValue({ '': 'value' }),
  kv_newline: () => formatKeyValue({ k: 'line1\nline2' }),
  bullets: () => formatBulletList(['one', 'two', 'three']),
  bullets_empty: () => formatBulletList([]),
  bullets_newline: () => formatBulletList(['line1\nline2', 'third']),
  num_empty: () => formatNumberedLines([]),
  num_basic: () => formatNumberedLines(['alpha', 'beta']),
  num_start: () => formatNumberedLines(['eight', 'nine'], { start: 8 }),
  num_wide: () => formatNumberedLines(['a', 'b'], { start: 999_999 }),
  num_wide2: () => formatNumberedLines(['a', 'b'], { start: 9_999_999 }),
  num_sep: () => formatNumberedLines(['alpha'], { separator: ':' }),
  num_trunc: () => formatNumberedLines(['x'.repeat(40), 'short'], { perLineCharLimit: 10 }),
  num_trunc_keep: () =>
    formatNumberedLines(['y'.repeat(50), 'z'.repeat(50)], { perLineCharLimit: 5 }),
  num_at_limit: () => formatNumberedLines(['12345'], { perLineCharLimit: 5 }),
  num_maxwidth: () => formatNumberedLines(['x'.repeat(40)], { maxWidth: 20 }),
  num_maxwidth0: () => formatNumberedLines(['x'.repeat(40)], { maxWidth: 0 }),
  num_default_nocap: () => formatNumberedLines(['x'.repeat(200)]),
  num_emoji: () => formatNumberedLines(['😀😀😀'], { perLineCharLimit: 2 }),
}

describe('fixed source golden fixture', () => {
  it('renders exactly the recorded cases', () => {
    expect(Object.keys(same).sort()).toEqual(Object.keys(golden.same).sort())
  })

  for (const [name, render] of Object.entries(same)) {
    it(`matches ${name}`, () => {
      expect(render()).toBe(golden.same[name])
    })
  }
})
