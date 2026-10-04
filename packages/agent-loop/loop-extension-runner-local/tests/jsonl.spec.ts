import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { Conclusion } from '@omne-harness-lite/loop-extension'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { inspectRunnerConclusion, prepareRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'

describe('actual JSONL provider boundary', () => {
  it('persists and reopens the exact runner wrapper and keys', async () => {
    const session = parseOpaqueIdentifier('runner-pure-session', 'SessionRef')
    const tenant = parseTenantId({ organization: 'runner-org', account: 'runner-account' })
    if (!('ok' in session) || !('ok' in tenant)) throw new Error('identity fixture rejected')
    const prepared = prepareRunnerConclusion({
      session: session.ok,
      tenant: tenant.ok,
      execution: { kind: 'noRun' },
      anchor: 'message-anchor',
      occurrence: { kind: 'final' },
      value: {
        extension: 'runner-a',
        position: 'before_persist_message',
        power: 'observe',
        at: '2026-09-28T10:00:00Z',
        output: { kind: 'observed' },
      } as Conclusion,
      reminders: [],
    })
    if (!('entry' in prepared)) throw new Error('conclusion fixture rejected')
    const taskDir = resolve(process.cwd(), '../../../tmp/model-request-runtime/runner-pure')
    await mkdir(taskDir, { recursive: true })
    const dir = await mkdtemp(join(taskDir, 'jsonl-'))
    const ownership = { current: 'runner-pure-test', observeExit: async () => 'exited' as const }
    try {
      const first = await openJsonlSessionLog({ dir, processOwnership: ownership })
      try {
        const appended = await first.append(
          session.ok,
          [prepared.entry],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        expect('positions' in appended).toBe(true)
      } finally {
        await first.close()
      }
      const reopened = await openJsonlSessionLog({ dir, processOwnership: ownership })
      try {
        const read = await reopened.readSince(session.ok, 0)
        if (!('entries' in read)) throw new Error('full read failed')
        expect(read.entries).toHaveLength(1)
        const entry = read.entries[0]
        if (entry === undefined) throw new Error('missing entry')
        expect(
          inspectRunnerConclusion({ session: session.ok, tenant: tenant.ok, entry }),
        ).toMatchObject({ anchor: 'message-anchor', execution: { kind: 'noRun' } })
        expect(entry.dedupeKey).toBe(prepared.entry.dedupeKey)
        expect(entry.readKeys).toEqual(prepared.entry.readKeys)
      } finally {
        await reopened.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
