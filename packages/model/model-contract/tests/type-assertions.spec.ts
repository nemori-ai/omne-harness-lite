import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { assertionViolations, findTypeAssertions, MINT_MARKER } from './type-assertions.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('brand values are not built with type assertions (AC-G1-6)', () => {
  it('finds none in product source, the testing entry or the fixtures, except the decoder mint', () => {
    const source = join(packageDirectory, 'src')
    const sites = findTypeAssertions([source, join(packageDirectory, 'tests/fixtures')])
    expect(assertionViolations(sites, source)).toEqual([])
  })
})

describe('the scanner itself', () => {
  const root = mkdtempSync(join(tmpdir(), 'type-assertions-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'src')

  function write(path: string, text: string): void {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('flags as, angle-bracket and double assertions but not as const, satisfies or import aliases', () => {
    write(
      'plain/plain.ts',
      [
        "import { a as b } from './x.ts'",
        'export const one = 1 as number',
        'export const two = <string>(<unknown>b)',
        'export const three = {} as unknown as Record<string, string>',
        "export const four = ['x'] as const",
        'export const five = { x: 1 } satisfies { x: number }',
      ].join('\n'),
    )
    const sites = findTypeAssertions([join(root, 'plain')])
    expect(sites.map(site => site.line)).toEqual([2, 3, 3, 4, 4])
  })

  it('accepts one marked mint in product source and rejects a second or one in src/testing', () => {
    write('src/decode.ts', `// ${MINT_MARKER} the single mint\nexport const mint = 'x' as string\n`)
    write('src/other.ts', `export const second = 'y' as string // ${MINT_MARKER} again\n`)
    write(
      'src/testing/helper.ts',
      `// ${MINT_MARKER} not allowed here\nexport const t = 'z' as string\n`,
    )
    const violations = assertionViolations(findTypeAssertions([source]), source)
    expect(violations.filter(line => line.startsWith('mint marker outside'))).toHaveLength(1)
    expect(violations.filter(line => line.startsWith('second mint'))).toHaveLength(2)
    expect(violations.filter(line => line.startsWith('unmarked'))).toEqual([])
  })
})
