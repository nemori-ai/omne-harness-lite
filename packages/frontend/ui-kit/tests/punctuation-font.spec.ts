// @module-tag source-text
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'

const MEMBER = join(import.meta.dirname, '..')
const FONTS = readFileSync(join(MEMBER, 'src/styles/fonts.css'), 'utf8')
const PROVENANCE = JSON.parse(readFileSync(join(MEMBER, 'provenance.json'), 'utf8')) as {
  readonly modified: readonly {
    readonly path: string
    readonly glyphs: readonly { readonly code_point: string }[]
  }[]
}
const FAMILY = "'Omne Punctuation'"

function blocks(selector: RegExp): string[] {
  return [...FONTS.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'g'))].map(
    match => match[1] ?? '',
  )
}

function stack(block: string): string[] {
  const value = /--omne-font-han:([^;]*);/.exec(block)?.[1] ?? ''
  return value
    .split(',')
    .map(name => name.trim())
    .filter(name => name !== '')
}

function codePoints(range: string): number[] {
  return range.split(',').flatMap(part => {
    const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-')
    const first = Number.parseInt(from ?? '', 16)
    const last = Number.parseInt(to ?? '', 16)
    return Array.from({ length: last - first + 1 }, (_, index) => first + index)
  })
}

function hex(points: readonly number[]): string[] {
  return [...points].sort((a, b) => a - b).map(point => `U+${point.toString(16).toUpperCase()}`)
}

it('puts the bundled punctuation family first in the Han stack', () => {
  const [root] = blocks(/:root/)
  expect(stack(root ?? '')[0]).toBe(FAMILY)
  expect(stack(root ?? '').slice(1)[0]).toBe("'LXGW WenKai'")
})

it('leaves the punctuation family out of the typeface overrides', () => {
  const overrides = blocks(/\[data-typeface='[a-z]+'\]/)
  expect(overrides.length).toBeGreaterThan(0)
  for (const override of overrides) expect(stack(override)).not.toContain(FAMILY)
})

it('gives each punctuation face exactly the code points its provenance table lists', () => {
  const faces = blocks(/@font-face/).filter(face => face.includes(FAMILY))
  expect(faces).toHaveLength(2)
  expect(PROVENANCE.modified).toHaveLength(2)
  for (const entry of PROVENANCE.modified) {
    const face = faces.find(text => text.includes(`/${basename(entry.path)}'`))
    const range = /unicode-range:([^;]*);/.exec(face ?? '')?.[1] ?? ''
    expect(hex(codePoints(range))).toEqual(
      hex(entry.glyphs.map(glyph => Number.parseInt(glyph.code_point.slice(2), 16))),
    )
  }
})
