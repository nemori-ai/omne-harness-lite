// @module-tag slow
// 慢层：起两个子进程（真实 sqlite-provider 的 Worker、真实文件）。重启后可读（acceptance 2）：两个子进程共用一个状态根
// 与存储根，第一个建会话并登记租户，第二个不再登记就读回。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

const child = fileURLToPath(new URL('./fixtures/child.ts', import.meta.url))

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

type ChildOutput = Readonly<{
  started: boolean
  mode: string
  before: Readonly<{ kind: string }>
  outcome: unknown
  after: Readonly<{ kind: string }>
  asked: readonly string[]
  report: Readonly<{ overall: string }>
}>

function run(stateRoot: string, storageRoot: string, mode: 'write' | 'read') {
  const result = spawnSync(
    process.execPath,
    [child, '--state-root', stateRoot, '--storage-root', storageRoot, '--mode', mode],
    { encoding: 'utf8', timeout: 90_000 },
  )
  const line = result.stdout.trim().split('\n').at(-1) ?? ''
  const parsed = line.startsWith('{')
    ? (JSON.parse(line) as ChildOutput)
    : { started: false, raw: line }
  return { status: result.status, stderr: result.stderr, parsed }
}

describe('restart across processes (acceptance 2)', () => {
  test('the first process writes, the second reads back on the same roots without registering again', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'app1-restart-')))
    dirs.push(base)
    const stateRoot = join(base, 'state')
    const storageRoot = join(base, 'storage')
    mkdirSync(stateRoot)

    const first = run(stateRoot, storageRoot, 'write')
    expect(first.status, first.stderr).toBe(0)
    expect(first.parsed).toMatchObject({
      started: true,
      before: { kind: 'unregistered' },
      after: { kind: 'ready' },
      report: { overall: 'settled' },
      outcome: { ok: expect.anything() },
    })

    const second = run(stateRoot, storageRoot, 'read')
    expect(second.status, second.stderr).toBe(0)
    expect(second.parsed).toMatchObject({
      started: true,
      before: { kind: 'ready' },
      after: { kind: 'ready' },
      asked: ['readWork'],
      report: { overall: 'settled' },
      outcome: { ok: expect.anything() },
    })
  })
})
