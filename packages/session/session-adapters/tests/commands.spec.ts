import type { TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { createSessionCommandSource } from '../src/commands.ts'

const tenant = { name: 'TenantId' } as unknown as TenantId
const asker = { principal: 'p', tenant, session: 's-1' }
const signal = new AbortController().signal
const SESSION = { name: 'session', major: 1 }

type Ports = Parameters<typeof createSessionCommandSource<string>>[0]

function source(
  revision: Outcome<string, 'unavailable'> = succeed('7'),
  more: Partial<Ports> = {},
) {
  const asked: unknown[] = []
  const commands = createSessionCommandSource<string>({
    async permissionRevision(who) {
      asked.push(who)
      return revision
    },
    models: async () => succeed([]),
    selectedModel: async () => fail('unavailable'),
    ...more,
  })
  const take = (name: string, args = '') =>
    commands.take(asker, { name, args, request: 'accept-op-1' }, signal)
  return { commands, take, asked }
}

describe('the commands the session brings', () => {
  it('are four in the reserved space, each saying its arguments, what it does while a run goes on and when it takes effect', async () => {
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
      ['model', 'system', [{ name: '模型名', candidates: true }], 'now', 'next-request'],
      ['permission', 'system', [{ name: '模式', candidates: true }], 'now', 'now'],
      ['archive', 'system', undefined, 'now', 'now'],
      ['reload', 'system', undefined, 'now', 'next-request'],
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
    expect(await take('reload')).toEqual({
      ok: {
        kind: 'operation',
        protocol: SESSION,
        operation: 'reload-session',
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
    expect(await take('reload', 'now')).toEqual({
      ok: { kind: 'invalid', reason: 'it takes no arguments' },
    })
    for (const name of ['compact', 'toString', '__proto__'])
      expect(await take(name)).toEqual({ failure: 'not-listed' })
  })

  it('cannot take /permission while the revision it changes at cannot be read', async () => {
    const { take } = source(fail('unavailable'))
    expect(await take('permission', 'never')).toEqual({ failure: 'unavailable' })
  })

  describe('the candidates of an argument', () => {
    const offered = (name: string, param: number, more: Partial<Ports> = {}) =>
      source(succeed('7'), more).commands.candidates!(asker, name, param, signal)

    it('of /model are the models the owner lists for the asker, the one in use marked', async () => {
      const models = async () =>
        succeed([
          { name: 'a/one' },
          { name: 'b/two', note: '还没有凭据' },
          { name: 'c/three', unavailable: '被锁定' },
        ])
      expect(
        await offered('model', 0, { models, selectedModel: async () => succeed('b/two') }),
      ).toEqual({
        ok: [
          { value: 'a/one' },
          { value: 'b/two', title: '还没有凭据', current: true },
          { value: 'c/three', unavailable: '被锁定' },
        ],
      })
      expect(await offered('model', 0, { models })).toEqual({
        ok: [
          { value: 'a/one' },
          { value: 'b/two', title: '还没有凭据' },
          { value: 'c/three', unavailable: '被锁定' },
        ],
      })
    })

    it('of /model are not to be had while the models cannot be listed: not an empty list', async () => {
      expect(await offered('model', 0, { models: async () => fail('unavailable') })).toEqual({
        failure: 'unavailable',
      })
    })

    it('of /permission are the three modes, each with a line', async () => {
      const read = await offered('permission', 0)
      expect('ok' in read && read.ok.map(each => each.value)).toEqual([
        'never',
        'auto_permission',
        'bypass-permissions',
      ])
      expect('ok' in read && read.ok.every(each => (each.title ?? '') !== '')).toBe(true)
    })

    it('are none for an argument that has none, or a name the source does not list', async () => {
      for (const [name, param] of [
        ['archive', 0],
        ['model', 1],
        ['permission', 1],
        ['reload', 0],
        ['__proto__', 0],
      ] as const)
        expect(await offered(name, param)).toEqual({ failure: 'not-listed' })
    })
  })
})
