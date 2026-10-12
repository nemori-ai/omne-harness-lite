import { describe, expect, it } from 'vitest'
import { formatCommandList, formatSection, formatUsage } from '@omne-harness-lite/unix-format'

describe('formatSection', () => {
  it('uses a Markdown heading by default', () => {
    expect(formatSection('SYNOPSIS', 'my_tool command [params]')).toBe(
      '## SYNOPSIS\n  my_tool command [params]',
    )
  })

  it('uses a colon heading when not Markdown-compatible', () => {
    expect(
      formatSection('SYNOPSIS', 'my_tool command [params]', { markdownCompatible: false }),
    ).toBe('SYNOPSIS:\n  my_tool command [params]')
  })

  it('indents every non-blank body line by the configured indent', () => {
    expect(
      formatSection('DESC', 'line 1\n\nline 2', { markdownCompatible: false, indent: 4 }),
    ).toBe('DESC:\n    line 1\n\n    line 2')
  })

  it('rejects a negative indent', () => {
    expect(() => formatSection('T', 'b', { indent: -1 })).toThrow(RangeError)
  })
})

describe('formatUsage', () => {
  it('renders the tool, command and synopsis on one line', () => {
    expect(formatUsage('manage_skills', 'install', '{name, version?}')).toBe(
      'USAGE: manage_skills(command="install", params={name, version?})',
    )
  })

  it('inserts the synopsis verbatim, quotes included', () => {
    expect(formatUsage('tool', 'x', '{"name": "x"}')).toBe(
      'USAGE: tool(command="x", params={"name": "x"})',
    )
  })
})

describe('formatCommandList', () => {
  it('aligns the synopsis and description columns', () => {
    const entries = [
      ['init', '{name}', 'Create a workspace.'],
      ['mount', '{workspace_id}', 'Mount an existing workspace.'],
      ['help', '(no params)', 'Show command reference.'],
    ] as const
    expect(formatCommandList(entries)).toBe(
      [
        '  init   {name}          — Create a workspace.',
        '  mount  {workspace_id}  — Mount an existing workspace.',
        '  help   (no params)     — Show command reference.',
      ].join('\n'),
    )
  })

  it('renders nothing for no entries', () => {
    expect(formatCommandList([])).toBe('')
  })

  it('tolerates an empty synopsis', () => {
    expect(formatCommandList([['solo', '', 'desc']])).toBe('  solo    — desc')
  })

  it('aligns by code point, not UTF-16 unit', () => {
    expect(
      formatCommandList([
        ['😀', 'a', 'd'],
        ['ab', 'b', 'e'],
      ]),
    ).toBe('  😀   a  — d\n  ab  b  — e')
  })
})
