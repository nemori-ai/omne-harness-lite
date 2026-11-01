// 以 `serve` 模式装真实的 `storage`、`session-storage` 行与两个真实入口对象（acceptance 5 的有序关闭；密钥不进输出）。
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import { CURSOR_KEY_FILE, cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import { accessPolicyRow, allowAll, providerConfig } from './fixtures/tree.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

type Run = Readonly<{
  records: readonly S0Record[]
  stderr: readonly string[]
  exitCode: number
  stateRoot: string
  of(kind: string): S0Record[]
}>

async function serveRows(): Promise<Run> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'app1-serve-')))
  dirs.push(base)
  const stateRoot = join(base, 'state')
  const storageRoot = join(base, 'storage')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(stateRoot)
  const policy = accessPolicyRow(allowAll)
  const records: S0Record[] = []
  const stderr: string[] = []
  const controller = new AbortController()
  const result = await runServe({
    distribution: {
      rows: [
        { id: 'storage', plugin: 'storageRow', config: providerConfig(storageRoot) },
        { id: 'authorization', plugin: 'policyRow', config: {} },
        {
          id: 'session-storage',
          plugin: 'sessionStorageRow',
          config: {
            combinationVersion: 'session-composite/1',
            directoryFile: join(storageRoot, 'tenant-domains.json'),
            domainRule: 'organization-account/1',
          },
        },
      ],
    },
    stateRoot,
    readinessTimeoutMs: 10_000,
    shutdownDeadlineMs: 5000,
    stop: controller.signal,
    plugins: { stubPlugin, storageRow, policyRow: policy.plugin, sessionStorageRow },
    entryObjects: [storageHost, cursorSigning],
    write: record => {
      records.push(record)
      if (record.kind === 'startup-result') controller.abort('test: startup seen')
    },
    stderr: line => stderr.push(line),
  })
  return {
    records,
    stderr,
    exitCode: result.exitCode,
    stateRoot,
    of: kind => records.filter(record => record.kind === kind),
  }
}

const seq = (run: Run, action: string, row?: string) =>
  run
    .of('shutdown-step')
    .filter(r => r['action'] === action && (row === undefined || r['row'] === row))
    .map(r => r['seq'] as number)

describe('serve with the real storage rows', () => {
  test('both rows are ACTIVE and real, the tree accepts, and the ordered shutdown settles: session-storage stops before storage', async () => {
    const run = await serveRows()
    expect(run.stderr).toEqual(['serve: stop requested: test: startup seen'])
    expect(run.exitCode).toBe(0)
    expect(run.of('startup-result')[0]).toMatchObject({
      accepting: true,
      outcome: 'ready',
      implementations: { real: 2, 'contract-double': 1, 's0-double': 0 },
    })
    expect(run.of('row-state').map(r => [r['id'], r['state']])).toEqual([
      ['storage', 'ACTIVE'],
      ['authorization', 'ACTIVE'],
      ['session-storage', 'ACTIVE'],
    ])
    expect(run.of('tree').map(r => [r['id'], r['implementation']])).toEqual([
      ['storage', 'real'],
      ['authorization', 'contract-double'],
      ['session-storage', 'real'],
    ])
    expect(run.of('entry-object').map(r => r['name'])).toEqual([
      's0.assemblyLifecycle',
      'storageHost',
      'sessionCursorSigning',
    ])
    const composition = seq(run, 'stop-call', 'session-storage')
    const storage = seq(run, 'stop-call', 'storage')
    expect(composition).toHaveLength(1)
    expect(storage).toHaveLength(1)
    expect(composition[0]!).toBeLessThan(storage[0]!)
    expect(seq(run, 'report-fixed')[0]!).toBeLessThan(
      seq(run, 'report-settled-call', 'storage')[0]!,
    )
    expect(run.of('shutdown-result')[0]).toMatchObject({
      overall: 'settled',
      outcomes: [
        { row: 'session-storage', phase: 'composition', result: { kind: 'settled' } },
        { row: 'storage', phase: 'storage', result: { kind: 'settled' } },
      ],
    })
  })

  test('the cursor signing key appears in no record, no stderr line and no tree configuration', async () => {
    const run = await serveRows()
    const key = readFileSync(join(run.stateRoot, CURSOR_KEY_FILE))
    const needles = [key.toString('hex'), key.toString('base64'), key.toString('base64url')]
    const haystack = [
      JSON.stringify(run.records),
      run.stderr.join('\n'),
      JSON.stringify(rowDeclarationOf(sessionStorageRow)),
    ].join('\n')
    // 正控：搜索本身能找到放进去的密钥文本。
    for (const needle of needles) expect(`${haystack}\n${needle}`).toContain(needle)
    for (const needle of needles) expect(haystack).not.toContain(needle)
    expect(haystack).not.toContain(key.toString('latin1'))
  })
})
