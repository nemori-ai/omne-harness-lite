import type { TenantId } from '@omne-harness/legal-identity'
import { createSystemCommandSource } from '@omne-harness/slash-command'
import { describe, expect, it } from 'vitest'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const signal = new AbortController().signal

describe('the system commands', () => {
  const source = createSystemCommandSource<string>()

  it('are three in the reserved space, each saying what it does while a run goes on and when it takes effect', async () => {
    const listed = await source.list(asker, signal)
    expect(source.space).toBe('omne-official')
    expect(
      'ok' in listed &&
        listed.ok.map(entry => [entry.name, entry.kind, entry.whileRunning, entry.takesEffect]),
    ).toEqual([
      ['model', 'system', 'now', 'next-request'],
      ['permission', 'system', 'now', 'now'],
      ['archive', 'system', 'now', 'now'],
    ])
  })

  it('each asks for the operation of the session protocol it names, and nothing else is one', async () => {
    expect(await source.take(asker, 'model', signal)).toEqual({
      ok: { kind: 'operation', operation: 'select-model', args: '' },
    })
    expect(await source.take(asker, 'permission', signal)).toMatchObject({
      ok: { operation: 'change-permission-mode' },
    })
    expect(await source.take(asker, 'archive', signal)).toMatchObject({
      ok: { operation: 'archive-session' },
    })
    for (const name of ['nope', 'toString', '__proto__'])
      expect(await source.take(asker, name, signal)).toEqual({ failure: 'not-listed' })
  })
})
