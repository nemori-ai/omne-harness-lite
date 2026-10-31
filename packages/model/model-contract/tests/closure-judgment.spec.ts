import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  declaredClosure,
  findForbidden,
  readPolicy,
  workspaceMembers,
  workspaceResidue,
} from './install/closure.ts'

// Pure judgments on declared dependencies; nothing here packs, installs or spawns a process.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const policyPath = join(packageDirectory, 'tests/fixtures/install-policy.json')
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'closure-judgment-')))
afterAll(() => rmSync(temporary, { recursive: true, force: true }))

function writeManifest(directory: string, manifest: object): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest))
}

describe('closure judgment on a synthetic workspace', () => {
  const root = join(temporary, 'workspace')
  mkdirSync(root, { recursive: true })
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - packages/*/*\n  - 'tools/single'\n",
  )
  writeManifest(join(root, 'packages/g/top'), {
    name: '@scope/top',
    dependencies: { '@scope/middle': 'workspace:*', zod: 'catalog:' },
    devDependencies: { vitest: 'catalog:' },
  })
  writeManifest(join(root, 'packages/g/middle'), {
    name: '@scope/middle',
    dependencies: { '@scope/leaf': 'workspace:*' },
    optionalDependencies: { openai: '1.0.0' },
  })
  writeManifest(join(root, 'tools/single'), {
    name: '@scope/leaf',
    peerDependencies: { cordis: '4' },
  })
  const members = workspaceMembers(root)

  it('finds members through the workspace globs', () => {
    expect([...members.keys()].sort()).toEqual(['@scope/leaf', '@scope/middle', '@scope/top'])
  })

  it('walks workspace members transitively and keeps the chain to each outside package', () => {
    const closure = declaredClosure(members.get('@scope/top') as string, members)
    expect(closure.workspace.map(item => item.name)).toEqual([
      '@scope/top',
      '@scope/middle',
      '@scope/leaf',
    ])
    expect(closure.external).toEqual([
      { name: 'zod', via: ['@scope/top', 'zod'] },
      { name: 'openai', via: ['@scope/top', '@scope/middle', 'openai'] },
      { name: 'cordis', via: ['@scope/top', '@scope/middle', '@scope/leaf', 'cordis'] },
    ])
  })

  it('finds a forbidden package behind two workspace members, ignoring devDependencies', () => {
    const closure = declaredClosure(members.get('@scope/top') as string, members)
    const violations = findForbidden(closure.external, readPolicy(policyPath))
    expect(violations.map(item => [item.name, item.category])).toEqual([
      ['openai', 'vendor-sdk'],
      ['cordis', 'cordis'],
    ])
  })
})

describe('forbidden-name matching', () => {
  const policy = readPolicy(policyPath)
  const hits = (name: string) => findForbidden([{ name, via: [name] }], policy).length

  it('matches names exactly and by glob, and not by prefix', () => {
    expect(hits('@mariozechner/pi-ai')).toBe(1)
    expect(hits('@omne-harness/model')).toBe(1)
    expect(hits('@omne-harness/model-contract')).toBe(0)
    expect(hits('openai-compatible-note')).toBe(0)
  })
})

describe('workspace protocol residue in a packed manifest', () => {
  it('flags workspace, catalog, link and file specifiers in production fields only', () => {
    const manifest = {
      name: 'x',
      dependencies: { a: 'workspace:*', b: '1.0.0' },
      peerDependencies: { c: 'catalog:' },
      optionalDependencies: { d: 'file:../d' },
      devDependencies: { e: 'workspace:*' },
    }
    expect(workspaceResidue(manifest)).toEqual([
      'dependencies.a = workspace:*',
      'optionalDependencies.d = file:../d',
      'peerDependencies.c = catalog:',
    ])
  })
})
