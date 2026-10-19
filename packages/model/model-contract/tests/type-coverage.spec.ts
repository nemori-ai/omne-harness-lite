import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { describe, expect, it } from 'vitest'
import { loadInventory, namesOf } from './exports-inventory.ts'

// A declared type with no type probe would drift without a failing check. The probes live in
// `tests/*.spec-d.ts`; this test only requires that each declared type is used in one of them.
const testsDirectory = fileURLToPath(new URL('.', import.meta.url))
const inventory = loadInventory(new URL('./fixtures/exports.json', import.meta.url).pathname)

/**
 * Identifiers that a probe uses outside its imports. An import list names a type without probing
 * it, and the compiler does not flag an unused import here, so mentions in imports, comments and
 * string literals must not count.
 */
function usedIdentifiers(text: string): Set<string> {
  const used = new Set<string>()
  const file = ts.createSourceFile('probe.ts', text, ts.ScriptTarget.ESNext, true)
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node)) used.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return used
}

const probes = readdirSync(testsDirectory)
  .filter(file => file.endsWith('.spec-d.ts'))
  .map(file => usedIdentifiers(readFileSync(`${testsDirectory}${file}`, 'utf8')))

describe('type probes against the export inventory', () => {
  it('has a probe file at all, so that an empty directory cannot pass', () => {
    expect(probes.length).toBeGreaterThan(0)
  })

  it('uses every landed type of the root entry in at least one spec-d probe', () => {
    const landed = namesOf(inventory.entries['.']!).filter(
      item => item.kind === 'type' && !item.pending,
    )
    const unprobed = landed
      .map(item => item.name)
      .filter(name => !probes.some(used => used.has(name)))
    expect(unprobed).toEqual([])
  })
})

describe('usedIdentifiers', () => {
  it('counts a use in a type position and in a qualified name', () => {
    const used = usedIdentifiers(
      "import type * as S from 'x'\nexport type A = Readonly<{ f: Plain }>\ntype B = S.Qualified\n",
    )
    expect(used.has('Plain')).toBe(true)
    expect(used.has('Qualified')).toBe(true)
  })

  it('does not count a name that only appears in an import list, a comment or a string', () => {
    const used = usedIdentifiers(
      [
        'import type {',
        '  Imported,',
        '  Other as Renamed,',
        "} from 'x'",
        '// Commented',
        "export const label = 'Quoted'",
      ].join('\n'),
    )
    for (const name of ['Imported', 'Other', 'Renamed', 'Commented', 'Quoted'])
      expect(used.has(name), name).toBe(false)
  })
})
