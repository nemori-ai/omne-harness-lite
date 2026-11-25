import type { TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { createSessionCommandSource } from '../src/commands.ts'

const tenant = { name: 'TenantId' } as unknown as TenantId
const asker = { principal: 'p', tenant, session: 's-1' }
const signal = new AbortController().signal
const SESSION = { name: 'session', major: 1 }

function source(revision: Outcome<string, 'unavailable'> = succeed('7')) {
  const asked: unknown[] = []
  const commands = createSessionCommandSource<string>({
    async permissionRevision(who) {
      asked.push(who)
      return revision
    },
  })
  const take = (name: string, args = '') =>
    commands.take(asker, { name, args, request: 'accept-op-1' }, signal)
  return { commands, take, asked }
}

describe('the commands the session brings', () => {
  it('are three in the reserved space, each saying its arguments, what it does while a run goes on and when it takes effect', async () => {
    const { commands } = source()
    expect(commands.space).toBe('omne-official')
    expect(commands.name).toBe('session-commands')
    const listed = await commands.list(asker, signal)
    expect(
      'ok' in listed &&
        listed.ok.map(entry => [
          entry.name,
          entry.kind,
          entry.params,
          entry.whileRunning,
          entry.takesEffect,
        ]),
    ).toEqual([
      ['model', 'system', [{ name: '模型名' }], 'now', 'next-request'],
      ['permission', 'system', [{ name: '模式' }], 'now', 'now'],
      ['archive', 'system', undefined, 'now', 'now'],
    ])
  })

  it('reads the arguments into the fields of the session operation, targeting the asker and with a control identity from the request', async () => {
    const { take, asked } = source()
    const target = { tenant, session: 's-1' }
    expect(await take('model', ' openai/gpt ')).toEqual({
      ok: {
        kind: 'operation',
        protocol: SESSION,
        operation: 'select-model',
        fields: { ...target, controlId: 'command:accept-op-1', model: 'openai/gpt' },
      },
    })
    expect(await take('permission', 'never')).toEqual({
      ok: {
        kind: 'operation',
        protocol: SESSION,
        operation: 'change-permission-mode',
        fields: { ...target, mode: 'never', expectedRevision: '7' },
      },
    })
    expect(asked).toEqual([asker])
    expect(await take('archive')).toEqual({
      ok: {
        kind: 'operation',
        protocol: SESSION,
        operation: 'archive-session',
        fields: { ...target, controlId: 'command:accept-op-1' },
      },
    })
  })

  it('says what is wrong with the arguments without reading anything, and names nothing else', async () => {
    const { take, asked } = source()
    expect(await take('model')).toEqual({ ok: { kind: 'invalid', reason: 'name one model' } })
    expect(await take('model', 'a b')).toEqual({
      ok: { kind: 'invalid', reason: 'name one model' },
    })
    expect(await take('permission', 'loud')).toEqual({
      ok: { kind: 'invalid', reason: 'name one mode: never, auto_permission, bypass-permissions' },
    })
    expect(await take('archive', 'now')).toEqual({
      ok: { kind: 'invalid', reason: 'it takes no arguments' },
    })
    expect(asked).toEqual([])
    for (const name of ['reload', 'toString', '__proto__'])
      expect(await take(name)).toEqual({ failure: 'not-listed' })
  })

  it('cannot take /permission while the revision it changes at cannot be read', async () => {
    const { take } = source(fail('unavailable'))
    expect(await take('permission', 'never')).toEqual({ failure: 'unavailable' })
  })
})
