import { describe, expect, it } from 'vitest'
import {
  escapeXmlAttribute,
  escapeXmlContent,
  formatXml,
  isXmlFormattable,
  type FormattingOptions,
  type XmlSchema,
} from '@omne-harness-lite/xml-format'

const textSchema: XmlSchema = { tag: 'root', requiredFields: { text: {} } }
const attrSchema: XmlSchema = {
  tag: 'root',
  requiredFields: { text: { presentation: 'attr' } },
}
const contentSchema: XmlSchema = {
  tag: 'root',
  requiredFields: { text: { presentation: 'content' } },
}

describe('XF-1 and XF-4 explicit own declarations', () => {
  for (const name of ['toString', 'constructor', '__proto__']) {
    it(`XF4-OWN-${name} rejects undeclared selection and renders explicit optional fields`, () => {
      expect(() =>
        formatXml({}, { tag: 'root', requiredFields: {} }, { extraFields: [name] }),
      ).toThrow(`extraFields not declared as optionalFields of <root>: ${name}`)
      expect(
        formatXml(
          { [name]: 'value' },
          {
            tag: 'root',
            requiredFields: {},
            optionalFields: { [name]: { presentation: 'attr' } },
          },
          { extraFields: [name] },
        ),
      ).toBe(`<root ${name}="value"/>`)
    })
  }
})

describe('XF-2 XML 1.0 ordinary character rejection', () => {
  const illegal = [
    ...Array.from({ length: 0x20 }, (_, n) => n).filter(n => ![9, 10, 13].includes(n)),
    0xd800,
    0xdbff,
    0xdc00,
    0xdfff,
    0xfffe,
    0xffff,
  ]
  for (const point of illegal) {
    it(`XF2-ILLEGAL-${point.toString(16)} rejects every ordinary rendering path`, () => {
      const text = `before${String.fromCodePoint(point)}after`
      expect(() => escapeXmlContent(text)).toThrow(TypeError)
      expect(() => escapeXmlAttribute(text)).toThrow(TypeError)
      expect(() => formatXml({ text }, textSchema)).toThrow(TypeError)
      expect(() => formatXml({ text }, attrSchema)).toThrow(TypeError)
      expect(() => formatXml({ text }, contentSchema)).toThrow(TypeError)
      expect(() => formatXml({}, textSchema, { manualAttributes: { a: text } })).toThrow(TypeError)
      expect(() =>
        formatXml({ text: 'v' }, { tag: 'root', requiredFields: { text: { attrs: { a: text } } } }),
      ).toThrow(TypeError)
      expect(() =>
        formatXml({ text: [text] }, { tag: 'root', requiredFields: { text: { itemTag: 'item' } } }),
      ).toThrow(TypeError)
      expect(() => formatXml({ text: [{ a: text }] }, textSchema)).toThrow(TypeError)
      expect(() =>
        formatXml(
          { text: [{ a: text }] },
          { tag: 'root', requiredFields: { text: { itemFields: { a: 'content' } } } },
        ),
      ).toThrow(TypeError)
    })
  }

  for (const point of [9, 10, 13, 0x20, 0x7f, 0xd7ff, 0xe000, 0xfffd, 0x10000, 0x1fffe, 0x10ffff]) {
    it(`XF2-LEGAL-${point.toString(16)} preserves legal boundary code points`, () => {
      const text = `a${String.fromCodePoint(point)}b`
      expect(escapeXmlContent(text)).toBe(text)
      expect(escapeXmlAttribute(text)).toBe(text)
      expect(formatXml({ text }, attrSchema)).toBe(`<root text="${text}"/>`)
    })
  }

  it('XF2-CALLBACK validates formatDate output on ordinary paths', () => {
    expect(() =>
      formatXml({ text: new Date(0) }, textSchema, { formatDate: () => '\u0000' }),
    ).toThrow(TypeError)
  })
})

describe('XF-3 uniqueness on each emitted element', () => {
  it('XF3-DECLARATIONS rejects two declared fields with the same xmlName', () => {
    expect(() =>
      formatXml(
        { a: '1', b: '2' },
        {
          tag: 'root',
          requiredFields: {
            a: { presentation: 'attr', xmlName: 'x' },
            b: { presentation: 'attr', xmlName: 'x' },
          },
        },
      ),
    ).toThrow(TypeError)
  })

  it('XF3-PATHS rejects attribute last-segment collisions', () => {
    expect(() =>
      formatXml(
        { a: { key: '1' }, b: { key: '2' } },
        {
          tag: 'root',
          requiredFields: {
            'a.key': { presentation: 'attr' },
            'b.key': { presentation: 'attr' },
          },
        },
      ),
    ).toThrow(TypeError)
  })

  it('XF3-MANUAL rejects a collision with a manual attribute', () => {
    expect(() =>
      formatXml({ text: 'one' }, attrSchema, { manualAttributes: { text: 'two' } }),
    ).toThrow(TypeError)
  })

  it('XF3-OPTIONAL-OVERRIDE checks optional declarations and runtime presentations', () => {
    const schema: XmlSchema = {
      tag: 'root',
      requiredFields: { a: { presentation: 'attr', xmlName: 'x' } },
      optionalFields: { b: { xmlName: 'x' } },
    }
    expect(() =>
      formatXml({ a: '1', b: '2' }, schema, {
        extraFields: ['b'],
        fieldOverrides: { b: { presentation: 'attr' } },
      }),
    ).toThrow(TypeError)
  })

  it('XF3-MAP rejects two list keys after conversion to the same string name', () => {
    const item = new Map<unknown, string>([
      [true, 'one'],
      ['true', 'two'],
    ])
    expect(() => formatXml({ text: [item] }, textSchema)).toThrow(TypeError)
  })

  it('XF3-LOCAL does not confuse separate elements or skipped attributes', () => {
    expect(
      formatXml(
        { a: '1', b: null, child: 'body' },
        {
          tag: 'root',
          requiredFields: {
            a: { presentation: 'attr', xmlName: 'x' },
            b: { presentation: 'attr', xmlName: 'x', includeWhen: 'not_nullish' },
            child: { attrs: { x: '2' } },
          },
        },
      ),
    ).toBe('<root x="1">\n  <child x="2">\n    body\n  </child>\n</root>')
    expect(
      formatXml(
        { text: [{ x: '1' }, { x: '2' }] },
        { tag: 'root', requiredFields: { text: { attrs: { x: 'outer' } } } },
      ),
    ).toBe('<root>\n  <text x="outer">\n    <item x="1"/>\n    <item x="2"/>\n  </text>\n</root>')
  })
})

describe('XF-6 caller-owned active objects and raw markup', () => {
  it('XF6-RAW contrasts ordinary escaping with unchanged trusted toXml output', () => {
    const raw = '</root><bad/>\u0000'
    expect(formatXml({ text: raw.slice(0, -1) }, textSchema)).toBe(
      '<root>\n  <text>\n    &lt;/root&gt;&lt;bad/&gt;\n  </text>\n</root>',
    )
    expect(formatXml({ text: { toXml: () => raw } }, textSchema)).toBe(`<root>\n  ${raw}\n</root>`)
    expect(isXmlFormattable({ toXml: () => raw })).toBe(true)
    expect(isXmlFormattable([])).toBe(false)
  })

  it('XF6-NESTED forwards only indentSize and formatDate to trusted children', () => {
    const received: (FormattingOptions | undefined)[] = []
    const formatDate = () => 'date'
    const child = {
      toXml(options?: FormattingOptions) {
        received.push(options)
        return '<child/>'
      },
    }
    expect(
      formatXml(
        { text: child },
        { ...textSchema, optionalFields: { extra: { includeWhen: 'not_nullish' } } },
        {
          indentSize: 4,
          formatDate,
          extraFields: ['extra'],
          manualAttributes: { a: '1' },
          fieldOverrides: { text: { presentation: 'element' } },
        },
      ),
    ).toBe('<root a="1">\n    <child/>\n</root>')
    expect(received).toEqual([{ indentSize: 4, formatDate }])
  })

  it('XF6-ERRORS propagates the identical getter, toXml and formatDate errors', () => {
    const failure = new Error('caller failure')
    const getter = {
      get text() {
        throw failure
      },
    }
    const active = {
      text: {
        toXml() {
          throw failure
        },
      },
    }
    const toXmlGetter = {
      text: {
        get toXml() {
          throw failure
        },
      },
    }
    for (const call of [
      () => formatXml(getter, textSchema),
      () => formatXml(active, textSchema),
      () => formatXml(toXmlGetter, textSchema),
      () =>
        formatXml({ text: new Date(0) }, textSchema, {
          formatDate: () => {
            throw failure
          },
        }),
    ]) {
      expect(call).toThrow(failure)
      try {
        call()
      } catch (error) {
        expect(error).toBe(failure)
      }
    }
  })
})
