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

  it('each reads its arguments into the fields of the session operation it names, and nothing else is one', async () => {
    const take = (name: string, args = '') =>
      source.take(asker, { name, args, request: 'req-1' }, signal)
    expect(await take('model', 'openai/gpt')).toEqual({
      ok: {
        kind: 'operation',
        protocol: 'session',
        operation: 'select-model',
        fields: { model: 'openai/gpt' },
      },
    })
    expect(await take('permission', ' never ')).toEqual({
      ok: {
        kind: 'operation',
        protocol: 'session',
        operation: 'change-permission-mode',
        fields: { mode: 'never' },
      },
    })
    expect(await take('archive')).toEqual({
      ok: { kind: 'operation', protocol: 'session', operation: 'archive-session', fields: {} },
    })
    for (const name of ['nope', 'toString', '__proto__'])
      expect(await take(name)).toEqual({ failure: 'not-listed' })
  })

  it('says what is wrong with the arguments, in the words the operation said before', async () => {
    const take = (name: string, args: string) =>
      source.take(asker, { name, args, request: 'req-1' }, signal)
    expect(await take('model', '')).toEqual({ ok: { kind: 'invalid', reason: 'name one model' } })
    expect(await take('model', 'a b')).toEqual({
      ok: { kind: 'invalid', reason: 'name one model' },
    })
    expect(await take('permission', 'everything')).toEqual({
      ok: {
        kind: 'invalid',
        reason: 'name one mode: never, auto_permission, bypass-permissions',
      },
    })
    expect(await take('archive', 'now')).toEqual({
      ok: { kind: 'invalid', reason: 'it takes no arguments' },
    })
  })
})
