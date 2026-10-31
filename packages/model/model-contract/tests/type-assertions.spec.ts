import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assertionViolations,
  findTypeAssertions,
  MAX_MINT_SITES,
  MINT_MARKER,
} from './type-assertions.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('brand values are not built with type assertions', () => {
  it('finds none in product source, the testing entry or the fixtures, except the one marked mint', () => {
    const source = join(packageDirectory, 'src')
    const sites = findTypeAssertions([source, join(packageDirectory, 'tests/fixtures')])
    expect(assertionViolations(sites, source)).toEqual([])
  })
})

describe('the scanner itself', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'type-assertions-')))
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

  function violationsOf(files: Record<string, string>): string[] {
    rmSync(source, { recursive: true, force: true })
    for (const [path, text] of Object.entries(files)) write(`src/${path}`, text)
    return assertionViolations(findTypeAssertions([source]), source)
  }
  const marked = (name: string) =>
    `// ${MINT_MARKER} ${name}\nexport const ${name} = 'x' as string\n`

  it('allows exactly one marked mint in product source', () => {
    expect(MAX_MINT_SITES).toBe(1)
    expect(violationsOf({ 'mint.ts': marked('minted') })).toEqual([])
  })

  it('fails on a second marked mint in product source, naming only the second', () => {
    const violations = violationsOf({
      'a.ts': marked('first'),
      'b.ts': marked('second'),
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/^mint marker beyond the 1 allowed .*b\.ts:2 /u)
  })

  it('rejects a marked mint in src/testing, which also uses up the one place', () => {
    const violations = violationsOf({
      'mint.ts': marked('minted'),
      'testing/helper.ts': marked('helper'),
    })
    expect(violations.filter(line => line.startsWith('mint marker outside'))).toHaveLength(1)
    expect(violations.filter(line => line.startsWith('mint marker beyond'))).toHaveLength(1)
    expect(violations.filter(line => line.startsWith('unmarked'))).toEqual([])
  })

  it('flags an unmarked assertion even when the mint is in use', () => {
    const violations = violationsOf({
      'mint.ts': marked('minted'),
      'plain.ts': "export const loose = 'y' as string\n",
    })
    expect(violations).toEqual([expect.stringMatching(/^unmarked assertion .*plain\.ts:1 /u)])
  })
})
