import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackage } from '../src/package-template/create.ts'
import { inspectPackage, scanExitCode, type ScanEvidence } from '../src/package-template/scan.ts'
import { parseMarker, VARIANTS, type PackageScan } from '../src/package-template/model.ts'
import { readTemplate, TEMPLATE_DIRECTORY } from '../src/package-template/template.ts'
import type { ActualExtraction } from '../src/arch/actual-model.ts'
import type { Conformance } from '../src/arch/conformance-model.ts'

const fault = vi.hoisted(() => ({ write: false }))
vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      if (fault.write && String(args[0]).endsWith('README_ZH.md'))
        throw new Error('injected write failure')
      return real.writeFileSync(...args)
    },
  }
})
const roots: string[] = []
afterEach(() => {
  fault.write = false
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})
function repository(): string {
  const root = fs.mkdtempSync(join(tmpdir(), 'omne-package-template-'))
  roots.push(root)
  fs.mkdirSync(join(root, 'packages'))
  fs.writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24 <25' } }))
  return root
}
const emptyActual: ActualExtraction = {
  facts: [],
  unknown: [],
  imports: [],
  edges: [],
  members: [],
  serviceIdentifiers: { attempted: 0, unresolved: 0, rate: 0 },
  factOccurrences: [],
  packageImports: [],
  importUnknown: [],
  configurationFiles: [],
}
const emptyConformance: Conformance = {
  schemaVersion: 1,
  kind: 'architecture-conformance',
  current: {
    path: 'constraints.json',
    source: {
      root: '',
      kind: 'worktree',
      commit: '',
      dirty: false,
      inputDirty: false,
      unversionedInputs: [],
    },
    value: null,
  },
  comparedWith: 'current',
  rows: [],
  changes: [],
  changeState: 'no-baseline',
  coverage: [],
  limitations: [],
}
const evidence: ScanEvidence = { actual: emptyActual, conformance: emptyConformance }
function adopted(root: string): string {
  const member = 'packages/util/sample'
  createPackage({ root, group: 'util', name: 'sample', variant: 'module', write: true })
  for (const file of ['src/index.ts', 'README.md', 'README_ZH.md'])
    fs.writeFileSync(
      join(root, member, file),
      file.endsWith('.ts') ? 'export const value = 1\n' : '# Actual accepted module\n',
    )
  return member
}
function changeManifest(
  root: string,
  member: string,
  change: (value: Record<string, unknown>) => void,
): void {
  const path = join(root, member, 'package.json')
  const value = JSON.parse(fs.readFileSync(path, 'utf8')) as Record<string, unknown>
  change(value)
  fs.writeFileSync(path, JSON.stringify(value))
}
describe('package creation', () => {
  it('previews all selected files without creating even the group directory', () => {
    const root = repository()
    const result = createPackage({ root, group: 'util', name: 'sample', variant: 'module' })
    expect(result).toMatchObject({ written: false, draft: true, path: 'packages/util/sample' })
    expect(result.files).toContain('package.json')
    expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
  })
  it.each(VARIANTS)(
    'creates %s with exact metadata and appropriate exports, without fake tests',
    variant => {
      const root = repository(),
        group = variant === 'service-contract' ? 'core' : 'util'
      createPackage({ root, group, name: 'sample', variant, write: true })
      const member = `packages/${group}/sample`
      const value = JSON.parse(fs.readFileSync(join(root, member, 'package.json'), 'utf8'))
      expect(value.omneHarness.packageTemplate).toEqual({
        id: 'typescript-package',
        version: '1.0.0',
        variant,
      })
      expect(value.engines).toEqual({ node: '>=24 <25' })
      expect('./cordis' in value.exports).toBe(variant !== 'module')
      expect(fs.existsSync(join(root, member, 'tests'))).toBe(false)
      expect(
        inspectPackage(root, member, readTemplate(), evidence).findings.some(
          finding => finding.code === 'draft',
        ),
      ).toBe(true)
    },
  )
  it('rejects a preexisting package without changing any bytes', () => {
    const root = repository()
    const member = adopted(root)
    const before = fs.readFileSync(join(root, member, 'package.json'))
    expect(() =>
      createPackage({ root, group: 'util', name: 'sample', variant: 'module', write: true }),
    ).toThrow('already exists')
    expect(fs.readFileSync(join(root, member, 'package.json'))).toEqual(before)
  })
  it.each(['../outside', '/outside', 'bad/name', 'BadName', 'name\u0000'])(
    'rejects unsafe leaf %j',
    name => {
      const root = repository()
      expect(() =>
        createPackage({ root, group: 'util', name, variant: 'module', write: true }),
      ).toThrow()
      expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
    },
  )
  it('rejects a non-core public service contract and a symlinked group', () => {
    const root = repository()
    expect(() =>
      createPackage({ root, group: 'util', name: 'sample', variant: 'service-contract' }),
    ).toThrow('core')
    const outside = fs.mkdtempSync(join(tmpdir(), 'omne-outside-'))
    roots.push(outside)
    fs.symlinkSync(outside, join(root, 'packages/util'))
    expect(() =>
      createPackage({ root, group: 'util', name: 'sample', variant: 'module', write: true }),
    ).toThrow('real package directory')
    expect(fs.readdirSync(outside)).toEqual([])
  })
  it('rejects the same public package name in another group', () => {
    const root = repository()
    adopted(root)
    expect(() =>
      createPackage({ root, group: 'core', name: 'sample', variant: 'module', write: true }),
    ).toThrow('Workspace package name already exists')
    expect(fs.existsSync(join(root, 'packages/core/sample'))).toBe(false)
  })
  it('rejects a dangling target symlink', () => {
    const root = repository()
    fs.mkdirSync(join(root, 'packages/util'))
    fs.symlinkSync(join(root, 'missing'), join(root, 'packages/util/sample'))
    expect(() =>
      createPackage({ root, group: 'util', name: 'sample', variant: 'module', write: true }),
    ).toThrow('already exists')
  })
  it('removes its incomplete new package after an actual write failure', () => {
    const root = repository()
    fault.write = true
    expect(() =>
      createPackage({ root, group: 'util', name: 'sample', variant: 'module', write: true }),
    ).toThrow('injected write failure')
    expect(fs.existsSync(join(root, 'packages/util/sample'))).toBe(false)
  })
  it('validates all template inputs before creating any output', () => {
    const root = repository(),
      directory = join(root, 'bad-template')
    fs.cpSync(TEMPLATE_DIRECTORY, directory, { recursive: true })
    const path = join(directory, 'manifest.json'),
      value = JSON.parse(fs.readFileSync(path, 'utf8'))
    value.common[0].target = '../escape'
    fs.writeFileSync(path, JSON.stringify(value))
    expect(() =>
      createPackage({
        root,
        group: 'util',
        name: 'sample',
        variant: 'module',
        write: true,
        templateDirectory: directory,
      }),
    ).toThrow('Invalid')
    expect(fs.readdirSync(join(root, 'packages'))).toEqual([])
  })
})
describe('template adoption and observation', () => {
  it('checks an adopted module and detects drift despite unchanged metadata', () => {
    const root = repository(),
      member = adopted(root)
    expect(inspectPackage(root, member, readTemplate(), evidence)).toMatchObject({
      adoption: 'current',
      structure: 'pass',
    })
    fs.rmSync(join(root, member, 'README_ZH.md'))
    const result = inspectPackage(root, member, readTemplate(), evidence)
    expect(result.structure).toBe('fail')
    expect(scanExitCode([result], true)).toBe(1)
  })
  it('reports unmarked structure separately and never writes metadata during inspection', () => {
    const root = repository(),
      member = adopted(root)
    changeManifest(root, member, value => {
      delete value['omneHarness']
    })
    const before = fs.readFileSync(join(root, member, 'package.json'))
    const result = inspectPackage(root, member, readTemplate(), evidence)
    expect(result).toMatchObject({ adoption: 'unmarked', structure: 'pass' })
    expect(scanExitCode([result], false)).toBe(0)
    expect(scanExitCode([result], true)).toBe(1)
    expect(fs.readFileSync(join(root, member, 'package.json'))).toEqual(before)
  })
  it.each([
    null,
    { id: 'typescript-package', version: 'latest', variant: 'module' },
    { id: 'typescript-package', version: '1.0.0', variant: 'bogus' },
    { id: 'typescript-package', version: '1.0.0', variant: 'module', pass: true },
  ])('rejects malformed marker %j', marker => {
    expect(parseMarker(marker)).toBeUndefined()
    const root = repository(),
      member = adopted(root)
    changeManifest(root, member, value => {
      value['omneHarness'] = { packageTemplate: marker }
    })
    expect(inspectPackage(root, member, readTemplate(), evidence)).toMatchObject({
      adoption: 'invalid',
      structure: 'uncovered',
    })
  })
  it.each(['0.9.0', '9.0.0'])(
    'does not certify unsupported version %s with current rules',
    version => {
      const root = repository(),
        member = adopted(root)
      changeManifest(root, member, value => {
        value['omneHarness'] = {
          packageTemplate: { id: 'typescript-package', version, variant: 'module' },
        }
      })
      const result = inspectPackage(root, member, readTemplate(), evidence)
      expect(result.adoption).toBe(version === '0.9.0' ? 'older' : 'unknown')
      expect(result.structure).toBe('uncovered')
      expect(scanExitCode([result], true)).toBe(2)
    },
  )
  it('uses explicit historical fixture rules rather than silently substituting current requirements', () => {
    const root = repository(),
      member = adopted(root)
    changeManifest(root, member, value => {
      value['omneHarness'] = {
        packageTemplate: { id: 'typescript-package', version: '0.9.0', variant: 'module' },
      }
    })
    fs.rmSync(join(root, member, 'README_ZH.md'))
    // Controlled test fixture, not a published historical release or migration claim.
    const fixture = {
      ...readTemplate(),
      previousVersions: {
        '0.9.0': { ruleSet: 1 as const, requiredFiles: ['README.md', 'src/index.ts'] },
      },
    }
    const result = inspectPackage(root, member, fixture, evidence)
    expect(result).toMatchObject({ adoption: 'older', structure: 'pass' })
    expect(scanExitCode([result], true)).toBe(1)
  })
  it('accepts an explicit JSON Schema export but rejects missing and escaping resources', () => {
    const root = repository(),
      member = adopted(root)
    fs.mkdirSync(join(root, member, 'schema'))
    fs.writeFileSync(join(root, member, 'schema/value.json'), '{}')
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['./schema'] = './schema/value.json'
      ;(value['files'] as string[]).push('schema')
    })
    expect(inspectPackage(root, member, readTemplate(), evidence).structure).toBe('pass')
    fs.rmSync(join(root, member, 'schema/value.json'))
    expect(
      inspectPackage(root, member, readTemplate(), evidence).findings.some(
        finding => finding.code === 'resource-export',
      ),
    ).toBe(true)
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['./schema'] = '../../../package.json'
    })
    expect(inspectPackage(root, member, readTemplate(), evidence).structure).toBe('fail')
  })
  it('preserves real static deviations and unknown coverage as different results', () => {
    const root = repository(),
      member = adopted(root)
    const unknown = {
      ...evidence,
      actual: {
        ...emptyActual,
        importUnknown: [
          {
            id: 'x',
            kind: 'import' as const,
            member,
            path: `${member}/src/index.ts`,
            line: 1,
            expression: 'dynamic',
            reason: 'unresolved expression',
          },
        ],
      },
    }
    const result = inspectPackage(root, member, readTemplate(), unknown)
    expect(result.structure).toBe('pass')
    expect(result.bindingUnknowns).toHaveLength(1)
    const deviation = {
      ...evidence,
      conformance: {
        ...emptyConformance,
        rows: [
          {
            id: 'x',
            rule: 'IC-4' as const,
            state: 'deviation' as const,
            age: 'unjudged' as const,
            member,
            key: 'x',
            reason: 'Cordis reached from pure root',
            expected: 'pure',
            sites: [{ path: `${member}/src/index.ts`, line: 1 }],
          },
        ],
      },
    }
    expect(
      inspectPackage(root, member, readTemplate(), deviation).findings.some(
        finding => finding.code === 'IC-4',
      ),
    ).toBe(true)
  })
  it('rejects a missing ./ prefix or an unpublished public resource', () => {
    const root = repository(),
      member = adopted(root)
    fs.writeFileSync(join(root, member, 'value.json'), '{}')
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['./value'] = 'value.json'
    })
    expect(
      inspectPackage(root, member, readTemplate(), evidence).findings.map(finding => finding.code),
    ).toEqual(expect.arrayContaining(['publication', 'resource-export']))
  })
  it('rejects a root redirected to a binding even with a matching declaration source', () => {
    const root = repository(),
      member = adopted(root)
    fs.writeFileSync(join(root, member, 'src/cordis.ts'), 'export {}')
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['.'] = {
        types: './dist/cordis.d.ts',
        import: './dist/cordis.js',
      }
    })
    expect(
      inspectPackage(root, member, readTemplate(), evidence).findings.some(
        finding => finding.code === 'exports',
      ),
    ).toBe(true)
  })
  it('accepts existing require/default conditions only when they preserve the import target', () => {
    const root = repository(),
      member = adopted(root)
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['.'] = {
        default: './dist/index.js',
        require: './dist/index.js',
        types: './dist/index.d.ts',
        import: './dist/index.js',
      }
    })
    expect(inspectPackage(root, member, readTemplate(), evidence).structure).toBe('pass')
  })
  it('rejects an earlier default condition that actually redirects Node root imports', () => {
    const root = repository(),
      member = adopted(root)
    fs.mkdirSync(join(root, member, 'dist'))
    fs.mkdirSync(join(root, 'node_modules/@omne-harness-lite'), { recursive: true })
    fs.writeFileSync(join(root, member, 'dist/index.js'), 'export const surface = "pure"')
    fs.writeFileSync(join(root, member, 'dist/cordis.js'), 'export const surface = "binding"')
    fs.symlinkSync(join(root, member), join(root, 'node_modules/@omne-harness-lite/sample'))
    changeManifest(root, member, value => {
      ;(value['exports'] as Record<string, unknown>)['.'] = {
        default: './dist/cordis.js',
        types: './dist/index.d.ts',
        import: './dist/index.js',
      }
    })
    const actual = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'console.log((await import("@omne-harness-lite/sample")).surface)',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    expect(actual.status).toBe(0)
    expect(actual.stdout.trim()).toBe('binding')
    expect(
      inspectPackage(root, member, readTemplate(), evidence).findings.some(
        finding => finding.code === 'export-conditions',
      ),
    ).toBe(true)
  })
  it.each([{ noEmit: true }, { emitDeclarationOnly: true }, { declaration: false }])(
    'rejects build settings that suppress a promised artifact: %j',
    overrides => {
      const root = repository(),
        member = adopted(root),
        path = join(root, member, 'tsconfig.build.json')
      const config = JSON.parse(fs.readFileSync(path, 'utf8'))
      Object.assign(config.compilerOptions, overrides)
      fs.writeFileSync(path, JSON.stringify(config))
      expect(
        inspectPackage(root, member, readTemplate(), evidence).findings.some(
          finding => finding.code === 'configuration',
        ),
      ).toBe(true)
    },
  )
  it('rejects emission drift and missing published Chinese documentation', () => {
    const root = repository(),
      member = adopted(root)
    fs.writeFileSync(
      join(root, member, 'tsconfig.test.json'),
      JSON.stringify({
        extends: '../../../tsconfig.base.json',
        compilerOptions: { noEmit: false },
      }),
    )
    changeManifest(root, member, value => {
      value['files'] = ['dist', 'README.md']
    })
    const result = inspectPackage(root, member, readTemplate(), evidence)
    expect(result.findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining(['configuration', 'publication']),
    )
    expect(scanExitCode([result], true)).toBe(1)
  })
  it('never turns metadata status alone into a successful check', () => {
    const result = {
      path: 'x',
      name: 'x',
      adoption: 'current',
      variant: 'module',
      structure: 'fail',
      findings: [],
      architectureUnknowns: 0,
      bindingUnknowns: [],
    } satisfies PackageScan
    expect(scanExitCode([result], false)).toBe(0)
    expect(scanExitCode([result], true)).toBe(1)
  })
})
