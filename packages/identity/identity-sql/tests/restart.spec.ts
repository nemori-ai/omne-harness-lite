// @module-tag slow
// R4-2: an account and a login survive a process restart. Slow: it starts two Node child processes
// over one storage root. The first registers and issues, then exits. The second recognizes the
// login, reads the standing and sees the login end at its deadline.
import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
import { temporaryRoot } from './fixtures/storage.ts'

const run = promisify(execFile)
const CHILD = fileURLToPath(new URL('./fixtures/restart-child.ts', import.meta.url))

const roots: string[] = []
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function phase(storageRoot: string, name: 'first' | 'second', stateFile: string) {
  const { stdout, stderr } = await run(process.execPath, [CHILD, storageRoot, name, stateFile], {
    timeout: 60_000,
  })
  if (stderr.trim() !== '') throw new Error(`${name}: ${stderr}`)
  return JSON.parse(stdout) as Record<string, unknown>
}

it(
  'recognizes a login and reads the membership that another process persisted',
  { tags: ['slow'], timeout: 120_000 },
  async () => {
    const root = await temporaryRoot()
    roots.push(root)
    const storageRoot = join(root, 'storage')
    const stateFile = join(root, 'state.json')
    const first = await phase(storageRoot, 'first', stateFile)
    expect(first).toEqual({ phase: 'first', registered: true })
    const second = await phase(storageRoot, 'second', stateFile)
    const expected = second['expected'] as Record<string, string>
    expect(second['issue']).toBe('succeeded')
    expect(second['recognized']).toBe('recognized')
    expect(second['recognizedAccount']).toEqual({ ok: true, value: expected['account'] })
    expect(second['recognizedTenant']).toEqual({ ok: true, value: expected['tenant'] })
    expect(second['recognizedLogin']).toEqual({ ok: true, value: expected['login'] })
    expect(second['standing']).toBe('member')
    expect(second['standingRevision']).toBe('1')
    expect(second['afterDeadline']).toBe('invalid')
  },
)
