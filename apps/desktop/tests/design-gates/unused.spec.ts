// @module-tag source-text
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { isKit, KIT, KIT_NAME } from './scope.ts'
import {
  field,
  keyName,
  moduleOf,
  nodes,
  parseModule,
  resolveImport,
  SCRIPTS,
  type SyntaxNode,
} from './script-text.ts'

/**
 * FE-I30: a shared part nobody uses is a second visual language waiting to be imported. Every value the shared
 * kit's root entry exports (types do not count) is imported by name from `@omne-harness/ui-kit` by at least one
 * interface module or the desktop page. `export *` is followed into the module it names. What is unused today is
 * the baseline and only shrinks. A name may stay unused on purpose only with its reason and the run that brings its
 * first user; once someone uses it, or the kit stops exporting it, its entry must go.
 */
const ENTRY = join(KIT, 'src/index.ts')

interface Allowance {
  readonly reason: string
  /** The run (`R3`, …) whose work brings the first user. */
  readonly firstUser: string
}

/** R8 K builds the page skeleton first; the search, schedule and calendar pages of R8 W1 to W3 are its first users. */
const PAGE_SKELETON: Allowance = {
  reason: 'the page skeleton lands before the three pages that use it',
  firstUser: 'R8',
}

const UNUSED_ON_PURPOSE: ReadonlyMap<string, Allowance> = new Map<string, Allowance>([
  ['ListReadingDirectory', PAGE_SKELETON],
  ['ListReadingMain', PAGE_SKELETON],
  ['ListReadingPage', PAGE_SKELETON],
  ['ListReadingWorkspace', PAGE_SKELETON],
  ['ReadingDocument', PAGE_SKELETON],
  ['ReadingState', PAGE_SKELETON],
  ['ReadingToolbar', PAGE_SKELETON],
])

type Reader = (path: string) => SyntaxNode | undefined

function declaredNames(declaration: SyntaxNode): string[] {
  if (declaration.type === 'VariableDeclaration')
    return nodes(declaration, 'declarations').map(declarator =>
      String(field(declarator, 'id')?.['name'] ?? ''),
    )
  if (
    declaration.type === 'TSTypeAliasDeclaration' ||
    declaration.type === 'TSInterfaceDeclaration'
  )
    return []
  if (declaration['declare'] === true) return []
  return [String(field(declaration, 'id')?.['name'] ?? '')]
}

/** The value names a module exports, following `export *` through `read`. */
export function exportedValues(path: string, read: Reader, seen = new Set<string>()): string[] {
  const tree = read(path)
  if (tree === undefined || seen.has(path)) return []
  seen.add(path)
  return nodes(tree, 'body').flatMap(statement => {
    if (statement['exportKind'] === 'type') return []
    const source = field(statement, 'source')
    if (statement.type === 'ExportAllDeclaration') {
      const exported = field(statement, 'exported')
      if (exported !== undefined) return [keyName(exported) ?? '']
      const target = resolveImport(path, String(source?.['value'] ?? ''), new Map())
      return target === undefined ? [] : exportedValues(target, read, seen)
    }
    if (statement.type !== 'ExportNamedDeclaration') return []
    const declaration = field(statement, 'declaration')
    if (declaration !== undefined) return declaredNames(declaration)
    return nodes(statement, 'specifiers')
      .filter(specifier => specifier['exportKind'] !== 'type')
      .map(specifier => keyName(field(specifier, 'exported')) ?? '')
  })
}

/** The value names a module imports by name from the shared kit. */
export function kitImports(tree: SyntaxNode): string[] {
  return nodes(tree, 'body')
    .filter(
      statement =>
        statement.type === 'ImportDeclaration' &&
        statement['importKind'] !== 'type' &&
        field(statement, 'source')?.['value'] === KIT_NAME,
    )
    .flatMap(statement => nodes(statement, 'specifiers'))
    .filter(specifier => specifier.type === 'ImportSpecifier' && specifier['importKind'] !== 'type')
    .map(specifier => keyName(field(specifier, 'imported')) ?? '')
}

const readScanned: Reader = path => {
  const file = SCRIPTS.find(candidate => candidate.path === path)
  return file === undefined ? undefined : moduleOf(file)
}

const EXPORTED = new Set(exportedValues(ENTRY, readScanned))
const USED = new Set(
  SCRIPTS.filter(file => !isKit(file.path)).flatMap(file => kitImports(moduleOf(file))),
)

describe('unused shared parts gate', () => {
  it('reads the exports of the shared kit root entry', () => {
    expect(EXPORTED.has('Button')).toBe(true)
    expect(EXPORTED.has('CloseIcon')).toBe(true)
    expect(EXPORTED.has('Icon')).toBe(false)
  })

  it('adds no export of the shared kit that no module or page imports', () => {
    const unused = [...EXPORTED].filter(name => !USED.has(name) && !UNUSED_ON_PURPOSE.has(name))
    const report = ratchet('unused', tally(unused.map(name => `${ENTRY} | ${name}`)))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(
      report.added,
      'shared parts nobody uses: use them, delete them, or allow one with its reason',
    ).toEqual([])
    expect(
      report.stale,
      'used or deleted now; shrink unused.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('allows only names that the kit exports and nobody uses yet', () => {
    for (const name of UNUSED_ON_PURPOSE.keys()) {
      expect(
        EXPORTED.has(name),
        `${name} is not exported any more: drop it from UNUSED_ON_PURPOSE`,
      ).toBe(true)
      expect(USED.has(name), `${name} is used now: drop it from UNUSED_ON_PURPOSE`).toBe(false)
    }
  })

  it('follows export star, skips types and reads named value imports only', () => {
    const files = new Map([
      [
        'kit/index.ts',
        `export { Button, type ButtonProps } from './button.tsx'
         export type { Tone } from './tone.ts'
         export * from './icons/index.ts'
         export * as charts from './charts.ts'
         export const cn = () => ''
         export function useArrival() {}
         export type Size = 'm'
         export interface Root {}`,
      ],
      [
        'kit/icons/index.ts',
        `export { type Icon } from './glyph.ts'
         export { MOTIONS } from './glyphs.ts'
         export const CloseIcon = defineIcon('close')`,
      ],
    ])
    const read: Reader = path => {
      const text = files.get(path)
      return text === undefined ? undefined : parseModule(path, text)
    }
    expect(exportedValues('kit/index.ts', read)).toEqual([
      'Button',
      'MOTIONS',
      'CloseIcon',
      'charts',
      'cn',
      'useArrival',
    ])
    const consumer = parseModule(
      'module.tsx',
      `import { Button, type Tone, CloseIcon as Close } from '${KIT_NAME}'
       import type { Root } from '${KIT_NAME}'
       import { cn } from './local.ts'
       export { useArrival } from '${KIT_NAME}'`,
    )
    expect(kitImports(consumer)).toEqual(['Button', 'CloseIcon'])
  })
})
