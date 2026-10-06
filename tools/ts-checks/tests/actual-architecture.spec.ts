// @module-tag slow
// Version isolation and JSON CLI behavior require temporary Git repositories and subprocesses.
import { spawnSync } from 'node:child_process'
import { readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readActualArchitecture,
  readArchitectureSource,
  type ActualArchitectureDocument,
} from '../src/arch/actual.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)
const cli = fileURLToPath(new URL('../src/arch/cli.ts', import.meta.url))
const native = (name: string, body: string) =>
  `import type {Context} from '@deepseek-ai/cordis'; export const ${name} = {name:'${name}',apply(ctx:Context){${body}}}\n`
function workspace(patterns = ['packages/*', 'apps/*', 'examples/*', 'tools/*']): string {
  const root = repository()
  write(
    root,
    'pnpm-workspace.yaml',
    `packages:\n${patterns.map(pattern => `  - '${pattern}'`).join('\n')}\n`,
  )
  return root
}
function member(root: string, path: string, name: string, code?: string): void {
  write(root, `${path}/package.json`, JSON.stringify({ name, exports: { '.': './dist/index.js' } }))
  if (code !== undefined) write(root, `${path}/src/index.ts`, code)
}
const invoke = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root, ...args], {
    encoding: 'utf8',
  })
function output(json: string): ActualArchitectureDocument {
  // CLI shape is also checked against concrete public fields below, rather than only successful JSON.parse.
  return JSON.parse(json) as ActualArchitectureDocument
}
describe('independent actual architecture protocol', { timeout: 60_000 }, () => {
  it('assigns each source/data file once to its longest member prefix', () => {
    const root = workspace(['packages/outer', 'packages/outer/src/nested', 'packages/outer-extra'])
    member(root, 'packages/outer', '@test/outer', 'export const parent=1')
    member(root, 'packages/outer/src/nested', '@test/nested', 'export const child=1')
    member(root, 'packages/outer-extra', '@test/extra', 'export const extra=1')
    write(root, 'packages/outer/src/nested/src/data.json', '{}')
    const head = commit(root, 'nested members')
    for (const revision of [undefined, head]) {
      const members = readArchitectureSource(root, revision).members
      expect(members.find(m => m.name === '@test/outer')?.sources).toEqual([
        'packages/outer/src/index.ts',
      ])
      expect(members.find(m => m.name === '@test/nested')).toMatchObject({
        sources: ['packages/outer/src/nested/src/index.ts'],
        dataFiles: ['packages/outer/src/nested/src/data.json'],
      })
      expect(members.find(m => m.name === '@test/extra')?.sources).toEqual([
        'packages/outer-extra/src/index.ts',
      ])
    }
  })
  it('retains every helper invocation when argument strings contain memo delimiters', () => {
    const root = workspace()
    member(
      root,
      'packages/live',
      '@test/live',
      `import type {Context} from '@deepseek-ai/cordis';
function register(ctx:Context,left:string,right:string){ctx.provide(left,{});ctx.provide(right,{})}
export const live={name:'live',apply(ctx:Context){register(ctx,'a,false:b','c');register(ctx,'a','b,false:c')}}`,
    )
    commit(root, 'helper argument identities')
    const actual = readActualArchitecture({ root }).current
    expect(
      actual.facts
        .filter(f => f.kind === 'provides')
        .map(f => f.key)
        .sort(),
    ).toEqual(['a', 'a,false:b', 'b,false:c', 'c'])
    expect(actual.candidateProviders.map(f => f.key).sort()).toEqual([
      'a',
      'a,false:b',
      'b,false:c',
      'c',
    ])
    expect(actual.unknown).toEqual([])
  })
  it('records empty ESM clauses and TypeScript import types as source dependencies', () => {
    const root = workspace()
    member(
      root,
      'packages/live',
      '@test/live',
      `import {} from './shape.js'; export {} from './shape.js';
type T = import('./shape.js').Shape; type M = typeof import('./shape.js');`,
    )
    write(root, 'packages/live/src/shape.ts', 'export interface Shape{}; export const value=1')
    commit(root, 'empty clauses and import types')
    const actual = readActualArchitecture({ root }).current
    expect(
      actual.imports
        .filter(f => f.specifier === './shape.js')
        .map(f => [f.symbol, f.type, f.form])
        .sort(),
    ).toEqual(
      [
        ['*', true, 'import'],
        ['(module)', false, 'export'],
        ['(module)', false, 'import'],
        ['Shape', true, 'import'],
      ].sort(),
    )
    expect(
      actual.imports
        .filter(f => f.specifier === './shape.js')
        .every(f => f.target.kind === 'workspace' && f.target.member === 'packages/live'),
    ).toBe(true)
    expect(actual.unknown).toEqual([])
  })
  it('keeps declared members and src directories named tmp, dist and coverage', () => {
    const root = workspace()
    for (const name of ['tmp', 'dist', 'coverage']) {
      member(root, `packages/${name}`, `@test/${name}`, native(name, `ctx.provide('${name}',{})`))
      write(
        root,
        `packages/${name}/src/tmp/helper.ts`,
        native(`nested_${name}`, `ctx.provide('nested-${name}',{})`),
      )
      write(
        root,
        `packages/${name}/dist/artifact.ts`,
        native(`artifact_${name}`, "ctx.provide('build-artifact',{})"),
      )
    }
    const head = commit(root, 'legal member names')
    for (const revision of [undefined, head]) {
      const actual = readActualArchitecture({
        root,
        ...(revision === undefined ? {} : { revision }),
      }).current
      expect(actual.members.map(m => m.path)).toEqual([
        'packages/coverage',
        'packages/dist',
        'packages/tmp',
      ])
      expect(
        actual.facts
          .filter(f => f.kind === 'provides')
          .map(f => f.key)
          .sort(),
      ).toEqual(['coverage', 'dist', 'nested-coverage', 'nested-dist', 'nested-tmp', 'tmp'])
      expect(actual.scope.analyzedFiles).toHaveLength(6)
      const source = readArchitectureSource(root, revision)
      for (const name of ['tmp', 'dist', 'coverage']) {
        expect(source.snapshot.texts.has(`packages/${name}/dist/artifact.ts`)).toBe(false)
        expect(source.snapshot.texts.has(`packages/${name}/src/tmp/helper.ts`)).toBe(true)
      }
    }
  })
  it('excludes the root Python environment while retaining member directories named .venv', () => {
    const root = workspace()
    member(root, 'packages/.venv', '@test/venv', native('live', "ctx.provide('live',{})"))
    write(root, '.gitignore', '/.venv/\n')
    const head = commit(root, 'root environment boundary')
    write(root, '.venv/lib/site-packages/metadata.json', '{}')
    write(root, '.venv/lib/site-packages/ghost.ts', native('ghost', "ctx.provide('ghost',{})"))
    expect(git(root, 'status', '--porcelain')).toBe('')
    for (const revision of [undefined, head]) {
      const actual = readActualArchitecture({
        root,
        ...(revision === undefined ? {} : { revision }),
      }).current
      expect(actual.source).toMatchObject({
        dirty: false,
        inputDirty: false,
        unversionedInputs: [],
      })
      expect(actual.members.map(m => m.path)).toEqual(['packages/.venv'])
      expect(actual.facts.filter(f => f.kind === 'provides').map(f => f.key)).toEqual(['live'])
      expect([...readArchitectureSource(root, revision).snapshot.texts.keys()]).not.toContain(
        '.venv/lib/site-packages/metadata.json',
      )
    }
  })
  it('marks ignored source and configuration inputs without misreporting Git status', () => {
    const root = workspace()
    member(root, 'packages/live', '@test/live', native('tracked', "ctx.provide('tracked',{})"))
    write(root, '.gitignore', 'packages/live/src/ignored.ts\npackages/live/tsconfig.json\n')
    const head = commit(root, 'ignore declarations')
    write(root, 'packages/live/src/ignored.ts', native('ignored', "ctx.provide('ignored',{})"))
    write(root, 'packages/live/tsconfig.json', '{"compilerOptions":{}}')
    expect(git(root, 'status', '--porcelain')).toBe('')
    const current = readActualArchitecture({ root }).current
    expect(current.source).toMatchObject({
      commit: head,
      dirty: false,
      inputDirty: true,
      unversionedInputs: ['packages/live/src/ignored.ts', 'packages/live/tsconfig.json'],
    })
    expect(
      current.facts
        .filter(f => f.kind === 'provides')
        .map(f => f.key)
        .sort(),
    ).toEqual(['ignored', 'tracked'])
    const version = readActualArchitecture({ root, revision: head }).current
    expect(version.source).toMatchObject({ dirty: false, inputDirty: false, unversionedInputs: [] })
    expect(version.facts.filter(f => f.kind === 'provides').map(f => f.key)).toEqual(['tracked'])
  })
  it('does not match an unresolved manifest reference to an absent class field', () => {
    const root = workspace()
    member(root, 'packages/live', '@test/live', native('live', "ctx.provide('known',{})"))
    member(
      root,
      'apps/host',
      '@test/host',
      `import {live} from '@test/live';
export const manifest=[{id:'known',plugin:live},{id:'dynamic',plugin:resolveRuntimePlugin()},{id:dynamicEntryId(),plugin:live}]`,
    )
    commit(root, 'dynamic composition')
    const actual = readActualArchitecture({ root }).current
    expect(actual.facts.filter(f => f.kind === 'composition').map(f => f.key)).toEqual(['known'])
    expect(
      actual.unknown.some(f =>
        f.occurrences.some(
          o =>
            o.kind === 'composition' &&
            o.expression === 'resolveRuntimePlugin()' &&
            o.path === 'apps/host/src/index.ts',
        ),
      ),
    ).toBe(true)
    expect(
      actual.unknown.some(f =>
        f.occurrences.some(
          o =>
            o.kind === 'composition' &&
            o.expression === 'dynamicEntryId()' &&
            o.reason === 'Manifest entry identity is not statically resolved',
        ),
      ),
    ).toBe(true)
  })
  it('uses workspace manifests without realization, retains data members, and separates development scope', () => {
    const root = workspace(['packages/*', 'packages/live', 'apps/*', 'examples/*', 'tools/*'])
    member(
      root,
      'packages/live',
      '@different/actual-name',
      native('live', "ctx.provide('page',{})"),
    )
    member(root, 'packages/data', '@different/data')
    write(root, 'packages/data/src/schema.json', '{"type":"object"}')
    member(root, 'apps/shell', '@different/shell')
    member(
      root,
      'examples/demo',
      '@different/demo',
      native('demo', "ctx.provide('development-only',{})"),
    )
    member(root, 'tools/task', '@different/task', native('task', "ctx.provide('tool-only',{})"))
    member(
      root,
      'outside/unlisted',
      '@different/unlisted',
      native('unlisted', "ctx.provide('excluded',{})"),
    )
    const head = commit(root, 'workspace'),
      result = readActualArchitecture({ root }).current
    expect(result.source).toEqual({
      root,
      kind: 'worktree',
      commit: head,
      dirty: false,
      inputDirty: false,
      unversionedInputs: [],
    })
    expect(result.members.map(item => item.path)).toEqual([
      'apps/shell',
      'examples/demo',
      'packages/data',
      'packages/live',
      'tools/task',
    ])
    expect(result.members.find(item => item.path === 'packages/live')?.name).toBe(
      '@different/actual-name',
    )
    expect(result.members.find(item => item.path === 'packages/data')).toMatchObject({
      sources: [],
      dataFiles: ['packages/data/src/schema.json'],
    })
    expect(result.scope.developmentMembers).toEqual(['examples/demo', 'tools/task'])
    expect(result.facts.filter(item => item.kind === 'provides').map(item => item.key)).toEqual([
      'page',
    ])
    expect(result.complexity.functions.some(item => item.name === 'live.apply')).toBe(true)
    expect(result.coverage.state).toBe('no-data')
    expect(JSON.stringify(result)).not.toContain('realization')
  })
  it('retains type/runtime, external and local imports and all provider occurrences without choosing one', () => {
    const root = workspace()
    member(
      root,
      'packages/provider',
      '@vendor/different',
      'export interface Shape {}\nexport const value=1\n',
    )
    member(
      root,
      'packages/consumer',
      '@vendor/consumer',
      `import type {Shape} from '@vendor/different';\nimport {value} from '@vendor/different';\nimport type {Context} from '@deepseek-ai/cordis';\nimport {local} from './helper.js';\nexport const one={name:'one',inject:['need'],apply(ctx:Context){ctx.get('need');ctx.get('maybe');ctx.provide('shared',{});ctx.provide('shared',{});ctx.on('changed',()=>{});ctx.emit('changed');ctx.provide(dynamic(),{});import(dynamicModule())}};\nexport const two={name:'two',apply(ctx:Context){ctx.provide('shared',{})}}\n`,
    )
    write(root, 'packages/consumer/src/helper.ts', 'export const local=1\n')
    commit(root, 'relationships')
    const result = readActualArchitecture({ root }).current
    expect(
      result.imports
        .filter(
          item => item.target.kind === 'workspace' && item.target.member === 'packages/provider',
        )
        .map(item => [item.symbol, item.type])
        .sort(),
    ).toEqual([
      ['Shape', true],
      ['value', false],
    ])
    expect(result.imports.find(item => item.specifier === './helper.js')?.target).toEqual({
      kind: 'workspace',
      member: 'packages/consumer',
    })
    expect(result.imports.find(item => item.specifier === '@deepseek-ai/cordis')?.target.kind).toBe(
      'external',
    )
    const shared = result.facts.filter(item => item.kind === 'provides' && item.key === 'shared')
    expect(shared.map(item => item.plugin)).toEqual(['one', 'two'])
    expect(shared.find(item => item.plugin === 'one')?.occurrences).toHaveLength(2)
    expect(result.candidateProviders.find(item => item.key === 'shared')).toMatchObject({
      facts: shared.map(item => item.id),
      runtimeSelection: 'not-observed',
    })
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'injects', key: 'need' }),
        expect.objectContaining({ kind: 'optional', key: 'maybe' }),
        expect.objectContaining({ kind: 'emits', key: 'changed' }),
        expect.objectContaining({ kind: 'listens', key: 'changed' }),
      ]),
    )
    expect(result.unknown.flatMap(item => item.occurrences)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'provides',
          expression: 'dynamic()',
          path: 'packages/consumer/src/index.ts',
          serviceIdentifier: true,
        }),
        expect.objectContaining({ kind: 'import', expression: 'dynamicModule()' }),
      ]),
    )
    expect(result.serviceIdentifiers.unresolved).toBe(1)
  })
  it('does not merge semantic identities when plugin or service strings contain delimiters', () => {
    const root = workspace()
    member(
      root,
      'packages/live',
      '@vendor/live',
      `import type {Context} from '@deepseek-ai/cordis'; function register(ctx:Context,key:string){ctx.provide(key,{})} export const a={name:'p|top|provides|x',apply(ctx:Context){register(ctx,'y')}};export const b={name:'p',apply(ctx:Context){register(ctx,'x|top|provides|y')}}`,
    )
    commit(root, 'delimiters')
    const current = readActualArchitecture({ root }).current
    const providers = current.facts.filter(fact => fact.kind === 'provides')
    expect(providers.map(fact => fact.key).sort()).toEqual(['x|top|provides|y', 'y'])
    expect(new Set(providers.map(fact => fact.id)).size).toBe(2)
    expect(current.candidateProviders.map(item => item.key).sort()).toEqual([
      'x|top|provides|y',
      'y',
    ])
    expect(
      providers.every(
        fact => fact.occurrences.length === 1 && fact.occurrences[0]?.key === fact.key,
      ),
    ).toBe(true)
  })
  it('reads each exact revision manifest/config/source and never fills deleted baseline paths from HEAD', () => {
    const root = workspace(),
      path = 'packages/odd-depth/nested/unit'
    write(root, 'pnpm-workspace.yaml', `packages:\n  - '${path}'\n  - 'packages/removed'\n`)
    member(
      root,
      path,
      '@vendor/old-name',
      native('versioned', 'ctx.provide(KEY,{})').replace(
        'import type',
        "import {KEY} from '@private'; import type",
      ),
    )
    write(root, `${path}/src/old.ts`, "export const KEY='before'\n")
    write(
      root,
      `${path}/config/base.json`,
      '{"compilerOptions":{"baseUrl":"..","paths":{"@private":["./src/old.ts"]}}}',
    )
    write(root, `${path}/tsconfig.json`, '{"extends":"./config/base.json"}')
    member(root, 'packages/removed', '@vendor/removed')
    const base = commit(root, 'before')
    git(root, 'tag', 'fixed-base', base)
    renameSync(join(root, path, 'src/old.ts'), join(root, path, 'src/new.ts'))
    write(root, `${path}/src/new.ts`, "export const KEY='after'\n")
    write(
      root,
      `${path}/config/base.json`,
      '{"compilerOptions":{"baseUrl":"..","paths":{"@private":["./src/new.ts"]}}}',
    )
    write(
      root,
      `${path}/package.json`,
      '{"name":"@vendor/new-name","exports":{".":"./dist/index.js"}}',
    )
    rmSync(join(root, 'packages/removed'), { recursive: true })
    const head = commit(root, 'after')
    write(root, `${path}/src/new.ts`, "export const KEY='dirty-head'\n")
    const result = readActualArchitecture({ root, revision: head, base: 'fixed-base' })
    expect(result.current.source).toMatchObject({ kind: 'revision', commit: head, dirty: false })
    expect(result.baseline?.source.commit).toBe(base)
    expect(result.current.members[0]?.name).toBe('@vendor/new-name')
    expect(result.baseline?.members.find(item => item.path === path)?.name).toBe('@vendor/old-name')
    expect(result.baseline?.facts.find(item => item.kind === 'provides')?.key).toBe('before')
    expect(result.current.facts.find(item => item.kind === 'provides')?.key).toBe('after')
    expect(
      result.difference?.facts.added.filter(item => item.kind === 'provides').map(item => item.key),
    ).toEqual(['after'])
    expect(
      result.difference?.facts.removed
        .filter(item => item.kind === 'provides')
        .map(item => item.key),
    ).toEqual(['before'])
    expect(result.difference?.members.removed.map(item => item.path)).toEqual(['packages/removed'])
    expect(result.current.scope.configuration.appliedToResolution).toContain(
      `${path}/tsconfig.json`,
    )
    expect(result.current.scope.configuration.appliedToResolution).toContain(
      `${path}/config/base.json`,
    )
    expect(result.current.scope.configuration.read).toContain(`${path}/config/base.json`)
    expect(
      readActualArchitecture({ root }).current.facts.find(item => item.kind === 'provides')?.key,
    ).toBe('dirty-head')
    expect(
      readActualArchitecture({ root, revision: base }).current.facts.find(
        item => item.kind === 'provides',
      )?.key,
    ).toBe('before')
  })
  it('keeps source movement and line changes out of relationship differences while preserving their sites', () => {
    const root = workspace()
    const code = native('stable', "ctx.provide('page',{});ctx.provide(dynamic(),{})")
    member(root, 'packages/live', '@vendor/live', code)
    const base = commit(root, 'before')
    renameSync(join(root, 'packages/live/src/index.ts'), join(root, 'packages/live/src/moved.ts'))
    write(root, 'packages/live/src/moved.ts', `\n\n${code}`)
    const head = commit(root, 'move')
    const result = readActualArchitecture({ root, revision: head, base })
    expect(result.difference?.facts).toEqual({ added: [], removed: [] })
    expect(result.difference?.imports).toEqual({ added: [], removed: [] })
    expect(result.difference?.unknown).toEqual({ added: [], removed: [] })
    expect(result.current.facts.find(item => item.kind === 'provides')).toMatchObject({
      path: 'packages/live/src/moved.ts',
      line: 3,
    })
    expect(result.baseline?.facts.find(item => item.kind === 'provides')).toMatchObject({
      path: 'packages/live/src/index.ts',
      line: 1,
    })
  })
  it('emits only JSON to stdout, writes the same document, and fails honestly on invalid inputs', () => {
    const root = workspace(),
      out = join(temporaryDirectory('architecture-out-'), 'document.json')
    member(root, 'packages/live', '@vendor/live', native('live', "ctx.provide('page',{})"))
    const base = commit(root, 'data')
    const result = invoke(root, '--revision', base, '--base', base, '--out', out)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(out, 'utf8')).toBe(result.stdout)
    expect(output(result.stdout)).toMatchObject({
      schemaVersion: 1,
      kind: 'actual-architecture',
      current: { source: { commit: base } },
      difference: { facts: { added: [], removed: [] } },
    })
    for (const args of [['--revision', 'not-a-revision'], ['--unknown', 'x'], ['--base']]) {
      const failure = invoke(root, ...args)
      expect(failure.status).not.toBe(0)
      expect(failure.stdout).toBe('')
      expect(failure.stderr.length).toBeGreaterThan(0)
    }
    const missing = repository(),
      failure = invoke(missing)
    expect(failure.status).not.toBe(0)
    expect(failure.stdout).toBe('')
    expect(failure.stderr).toContain('requires pnpm-workspace.yaml')
    expect(() => readActualArchitecture({ root: join(root, 'packages/live') })).toThrow('top-level')
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/**'\n")
    expect(() => readActualArchitecture({ root })).toThrow('不支持')
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n")
    write(root, 'packages/live/package.json', '{"exports":{}}')
    expect(() => readActualArchitecture({ root })).toThrow('nonempty name')
  })
})
