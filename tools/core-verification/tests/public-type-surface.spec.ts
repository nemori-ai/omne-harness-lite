import { evidencePath } from '../src/evidence-path.ts'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { dependencySurface } from '../src/dependency-surface.ts'
import {
  missingTypeImports,
  namedTypeExports,
  namedTypeImports,
} from '../src/public-type-surface.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const member = join(repository, 'tools/core-verification')
const consumer = join(member, 'tests/w1-public-types-complete.spec-d.ts')

it('w1.types.inventory.detects-missing-and-aliased-imports', () => {
  const declarations = namedTypeExports(`
    export { type Brand, type Original as Alias, value } from './values.js'
    export type { State } from './states.js'
    export interface Inline { readonly count: number }
    export type NumberAlias = number
  `)
  expect(declarations).toEqual(['Alias', 'Brand', 'Inline', 'NumberAlias', 'State'])
  const imports =
    namedTypeImports(`
    import type { Brand, Alias as LocalAlias } from 'package'
    import { type State, value } from 'package'
  `).get('package') ?? []
  expect(imports).toEqual(['Alias', 'Brand', 'State'])
  expect(missingTypeImports(declarations, imports)).toEqual(['Inline', 'NumberAlias'])
  expect(missingTypeImports(['Brand'], [])).toEqual(['Brand'])
  expect(() => namedTypeExports("export * from './unknown.js'")).toThrow(/explicit named exports/)
  expect(() => namedTypeImports("import type * as Types from 'package'")).toThrow(/direct named/)
})

it('w1.types.inventory.all-five-built-root-declarations', async () => {
  const importerText = await readFile(consumer, 'utf8')
  const imports = namedTypeImports(importerText)
  const configPath = join(member, 'tsconfig.test.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath))
  expect(parsed.errors).toEqual([])
  expect(parsed.options.strict).toBe(true)
  expect(parsed.options.exactOptionalPropertyTypes).toBe(true)
  expect(parsed.options.noUncheckedIndexedAccess).toBe(true)

  const nodes = ['identity-values', 'offer-expiry', 'kernel-basis', 'storage', 'content-blocks']
  // 本次明确盘点的范围。新增/撤回根类型须重新交接，不能因库存来源变化而自动缩小。
  const expectedCounts = [24, 10, 4, 28, 41]
  const inventory = []
  for (const [position, node] of nodes.entries()) {
    const specifier = `@omne-harness-lite/${node}`
    const resolved = ts.resolveModuleName(
      specifier,
      consumer,
      parsed.options,
      ts.sys,
    ).resolvedModule
    expect(resolved, specifier).toBeDefined()
    if (resolved === undefined) throw new Error(`public type module unavailable: ${specifier}`)
    const declaration = await realpath(resolved.resolvedFileName)
    expect(declaration).toBe(join(repository, 'packages/core', node, 'dist/index.d.ts'))
    const bytes = await readFile(declaration)
    const names = namedTypeExports(bytes.toString('utf8'))
    const imported = imports.get(specifier) ?? []
    const expectedCount = expectedCounts[position]
    if (expectedCount === undefined) throw new Error(`missing inventory scope: ${node}`)
    expect(names).toHaveLength(expectedCount)
    expect(missingTypeImports(names, imported), specifier).toEqual([])
    expect(imported, specifier).toEqual(names)
    inventory.push({
      node,
      specifier,
      rootDeclaration: {
        file: declaration,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      exportedNamedTypes: names,
      directlyImportedNamedTypes: imported,
      declarations: await dependencySurface(declaration, true),
      sources: await dependencySurface(join(repository, 'packages/core', node, 'src/index.ts')),
    })
  }
  expect(inventory.reduce((sum, item) => sum + item.exportedNamedTypes.length, 0)).toBe(107)
  const root = evidencePath(
    repository,
    'tmp/w1-public-consumers/types-complete',
    'w1-public-consumers/types-complete',
  )
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(join(root, 'inventory-'))
  await writeFile(
    join(directory, 'report.json'),
    JSON.stringify(
      {
        format: 1,
        sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: member,
          encoding: 'utf8',
        }).trim(),
        trackedStatus: execFileSync('git', ['status', '--short'], {
          cwd: member,
          encoding: 'utf8',
        }).trim(),
        nodeVersion: process.version,
        typescriptVersion: ts.version,
        importer: {
          file: consumer,
          sha256: createHash('sha256').update(importerText).digest('hex'),
        },
        compilerOptions: parsed.options,
        inventory,
        limitations: [
          'Explicit root type exports only; dual-purpose class value exports are covered by prior value consumers.',
          'AST inventory detects name coverage; strict tsc/Vitest type cases establish actual type usability separately.',
          'Does not execute type fixtures as product behavior or infer runtime immutability from readonly.',
        ],
      },
      null,
      2,
    ) + '\n',
  )
})
