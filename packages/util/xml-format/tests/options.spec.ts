import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INDENT_SIZE,
  MAX_INDENT_SIZE,
  applyFieldOverride,
  escapeXmlAttribute,
  escapeXmlContent,
  isXmlName,
  resolveFormattingOptions,
} from '@omne-harness/xml-format'
import type { FieldSpec } from '@omne-harness/xml-format'

describe('resolveFormattingOptions', () => {
  it('applies defaults', () => {
    const resolved = resolveFormattingOptions()
    expect(resolved.indentSize).toBe(DEFAULT_INDENT_SIZE)
    expect(resolved.omitRootTag).toBe(false)
    expect(resolved.extraFields).toEqual(new Set())
    expect(resolved.fieldOverrides).toEqual({})
    expect(resolved.manualAttributes).toEqual({})
    expect(resolved.formatDate(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
  })

  it('accepts the indent boundaries', () => {
    expect(resolveFormattingOptions({ indentSize: 0 }).indentSize).toBe(0)
    expect(resolveFormattingOptions({ indentSize: MAX_INDENT_SIZE }).indentSize).toBe(
      MAX_INDENT_SIZE,
    )
  })

  it('rejects indents outside the boundaries', () => {
    expect(() => resolveFormattingOptions({ indentSize: -1 })).toThrow(RangeError)
    expect(() => resolveFormattingOptions({ indentSize: MAX_INDENT_SIZE + 1 })).toThrow(RangeError)
  })

  it('collects extraFields from any iterable', () => {
    expect(resolveFormattingOptions({ extraFields: new Set(['a']) }).extraFields).toEqual(
      new Set(['a']),
    )
    expect(resolveFormattingOptions({ extraFields: ['a', 'a', 'b'] }).extraFields).toEqual(
      new Set(['a', 'b']),
    )
  })
})

describe('applyFieldOverride', () => {
  const spec: FieldSpec = { presentation: 'element', xmlName: 'orig' }

  it('returns the spec itself without an override or presentation', () => {
    expect(applyFieldOverride(spec, undefined)).toBe(spec)
    expect(applyFieldOverride(spec, {})).toBe(spec)
  })

  it('replaces the presentation and keeps the rest', () => {
    expect(applyFieldOverride(spec, { presentation: 'attr' })).toEqual({
      presentation: 'attr',
      xmlName: 'orig',
    })
  })
})

describe('escaping', () => {
  it('escapes markup characters in content', () => {
    expect(escapeXmlContent('a & b < c > "d" \'e\'')).toBe('a &amp; b &lt; c &gt; "d" \'e\'')
  })

  it('escapes quotes as well in attributes', () => {
    expect(escapeXmlAttribute('a & b < c > "d" \'e\'')).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;',
    )
  })

  it('does not double-escape', () => {
    expect(escapeXmlContent('&amp;')).toBe('&amp;amp;')
  })
})

describe('isXmlName', () => {
  it('accepts letters, digits, underscore, dot and hyphen after a letter or underscore', () => {
    for (const name of ['a', '_x', 'system_reminder', 'as-of', 'v1.2', 'A9'])
      expect(isXmlName(name)).toBe(true)
  })

  it('rejects anything else', () => {
    for (const name of ['', '1a', 'a b', 'a>b', 'a"b', '-a', '.a', 'ünicode', 'a\n'])
      expect(isXmlName(name)).toBe(false)
  })
})
