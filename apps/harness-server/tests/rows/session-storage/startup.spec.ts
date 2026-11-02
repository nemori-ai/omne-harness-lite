import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import { CURSOR_KEY_FILE, cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { readDirectoryFile } from '../../../src/rows/session-storage/directory.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { runServe, type RunServeOptions, type S0Record } from '../../../src/run.ts'
import {
  accessPolicyRow,
  allowAll,
  providerConfig,
  TENANT_A,
  textOf,
} from '../storage/fixtures/tree.ts'

const bases: string[] = []
afterEach(() => {
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

function location() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'serve-directory-')))
  bases.push(base)
  const stateRoot = join(base, 'state')
  mkdirSync(stateRoot)
  const storageRoot = join(base, 'storage')
  return { base, stateRoot, storageRoot, directoryFile: join(storageRoot, 'tenants.json') }
}

function sessionConfig(directoryFile: string) {
  return {
    combinationVersion: 'session-composite/1',
    directoryFile,
    domainRule: 'organization-account/1',
  }
}

function optionsFor(target: ReturnType<typeof location>) {
  const policy = accessPolicyRow(allowAll, { includePrincipalVerifier: true })
  return {
    distribution: {
      rows: [
        { id: 'storage', plugin: 'storageRow', config: providerConfig(target.storageRoot) },
        { id: 'authorization', plugin: 'policyRow', config: {} },
        {
          id: 'session-storage',
          plugin: 'sessionStorageRow',
          config: sessionConfig(target.directoryFile),
        },
      ],
    },
    stateRoot: target.stateRoot,
    plugins: { stubPlugin, storageRow, policyRow: policy.plugin, sessionStorageRow },
    entryObjects: [storageHost, cursorSigning],
  }
}

async function serve(
  options: Pick<RunServeOptions, 'distribution' | 'stateRoot'> & Partial<RunServeOptions>,
) {
  const records: S0Record[] = []
  const stderr: string[] = []
  const controller = new AbortController()
  const result = await runServe({
    readinessTimeoutMs: 5000,
    shutdownDeadlineMs: 5000,
    ...options,
    stop: controller.signal,
    write: record => {
      records.push(record)
      if (record.kind === 'startup-result') controller.abort('startup observed')
    },
    stderr: line => stderr.push(line),
  })
  return { result, records, stderr }
}

function expectNotLoaded(run: Awaited<ReturnType<typeof serve>>, code: number) {
  expect(run.result).toMatchObject({
    exitCode: code,
    accepting: false,
    barrierCalls: 0,
    appliedRows: [],
    startedRows: [],
  })
  expect(run.records.some(record => record.kind === 'startup-result')).toBe(false)
}

test('first serve prepares the final operator locations before installing entry objects or rows', async () => {
  const source = location()
  const target = location()
  let observed = false
  const run = await serve({
    ...optionsFor(source),
    operator: {
      ops: [
        { kind: 'replace', id: 'storage', config: providerConfig(target.storageRoot) },
        { kind: 'replace', id: 'session-storage', config: sessionConfig(target.directoryFile) },
      ],
    },
    entryObjects: [
      {
        name: 'preparedDirectoryProbe',
        implementation: 'real',
        install() {
          expect(readDirectoryFile(target.directoryFile)).toEqual([])
          expect(existsSync(join(source.stateRoot, CURSOR_KEY_FILE))).toBe(false)
          observed = true
        },
      },
      storageHost,
      cursorSigning,
    ],
  })
  expect(observed).toBe(true)
  expect(run.result).toMatchObject({ exitCode: 0, accepting: true, barrierCalls: 1 })
  expect(readDirectoryFile(target.directoryFile)).toEqual([])
  expect(existsSync(source.storageRoot)).toBe(false)
})

test('restart reads an existing populated directory without replacing its bytes', async () => {
  const target = location()
  mkdirSync(target.storageRoot)
  const content = `${JSON.stringify(
    {
      format: 'tenant-domain-directory/1',
      domainRule: 'organization-account/1',
      tenants: [textOf(TENANT_A)],
    },
    null,
    2,
  )}\n`
  writeFileSync(target.directoryFile, content)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const run = await serve(optionsFor(target))
    expect(run.result.exitCode).toBe(0)
    expect(
      run.records.find(record => record.kind === 'row-state' && record['id'] === 'session-storage'),
    ).toMatchObject({ state: 'ACTIVE' })
    expect(readDirectoryFile(target.directoryFile)).toEqual([textOf(TENANT_A)])
    expect(readFileSync(target.directoryFile, 'utf8')).toBe(content)
  }
})

test.each([
  { state: 'missing', content: undefined },
  { state: 'corrupt', content: '{private-tenant-and-key-content' },
  { state: 'half-initialized', content: '' },
])(
  '$state directory fails before entry installation and never repairs the file',
  async ({ state, content }) => {
    const target = location()
    const keyFile = join(target.stateRoot, CURSOR_KEY_FILE)
    let existingKey: Buffer | undefined
    if (state === 'missing') {
      expect((await serve(optionsFor(target))).result.exitCode).toBe(0)
      existingKey = readFileSync(keyFile)
      rmSync(target.directoryFile)
    } else {
      mkdirSync(target.storageRoot)
      if (content !== undefined) writeFileSync(target.directoryFile, content)
    }
    const run = await serve(optionsFor(target))
    expectNotLoaded(run, 3)
    expect(run.stderr).toEqual(['serve: tenant directory preparation failed'])
    if (existingKey === undefined) expect(existsSync(keyFile)).toBe(false)
    else expect(readFileSync(keyFile)).toEqual(existingKey)
    expect(JSON.stringify(run.records)).not.toContain('private-tenant-and-key-content')
    if (content === undefined) expect(existsSync(target.directoryFile)).toBe(false)
    else expect(readFileSync(target.directoryFile, 'utf8')).toBe(content)
  },
)

test.each(['disabled', 'contract-double'])(
  'a %s session-storage row does not prepare files',
  async mode => {
    const target = location()
    const double = defineRow({
      row: 'session-storage',
      implementation: 'contract-double',
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: { apply() {} },
    })
    const run = await serve({
      stateRoot: target.stateRoot,
      distribution: {
        rows: [
          {
            id: 'session-storage',
            plugin: 'sessionStorageRow',
            config: sessionConfig(target.directoryFile),
          },
        ],
      },
      ...(mode === 'disabled'
        ? { operator: { ops: [{ kind: 'disable', id: 'session-storage' }] } }
        : {}),
      plugins: { sessionStorageRow: mode === 'disabled' ? sessionStorageRow : double },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(existsSync(target.storageRoot)).toBe(false)
  },
)

test.each(['configuration', 'trust'])('%s preflight rejects before creating state', async mode => {
  const target = location()
  const options = optionsFor(target)
  const visibility = new Map(serveProfile().visibility)
  const declaration = rowDeclarationOf(sessionStorageRow)
  if (declaration === undefined) throw new Error('missing session storage declaration')
  visibility.set(declaration.row, [])
  const run = await serve({
    ...options,
    ...(mode === 'configuration'
      ? { operator: { ops: [{ kind: 'replace', id: 'absent', config: {} }] } }
      : { visibility }),
  })
  expectNotLoaded(run, 2)
  expect(existsSync(target.storageRoot)).toBe(false)
  expect(existsSync(join(target.stateRoot, CURSOR_KEY_FILE))).toBe(false)
  expect(run.stderr).toHaveLength(1)
  expect(run.stderr[0]).toContain(
    mode === 'configuration' ? 'unknown-target' : 'injects trusted name',
  )
})

test('invalid final directory configuration fails without creating the storage root', async () => {
  const target = location()
  const run = await serve({
    ...optionsFor(target),
    operator: {
      ops: [
        {
          kind: 'replace',
          id: 'session-storage',
          config: { ...sessionConfig(target.directoryFile), domainRule: 'unsupported' },
        },
      ],
    },
  })
  expectNotLoaded(run, 3)
  expect(existsSync(target.storageRoot)).toBe(false)
  expect(existsSync(join(target.stateRoot, CURSOR_KEY_FILE))).toBe(false)
})
