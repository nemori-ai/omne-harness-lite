import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { SessionId } from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  readPublishedNeed,
  readPublishedView,
  type PublishedViewPorts,
} from '../../../src/rows/session-ad03/published-view.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')
const SESSION = 'ses_view' as SessionId
const SCOPE = 'session-scope:published-view'
const access = { principal: 'coordinator', tenant: TENANT, session: SESSION }
const encoded = tenantCodec.encode(TENANT)
if (!encoded.ok) throw new Error('fixture tenant')

const need = {
  key: 'session.working-directory' as const,
  need: { name: 'working-directory', shape: z.strictObject({ directory: z.string() }) },
}
const basis = z.strictObject({ tenant: z.string(), session: z.string() })
const view = {
  key: 'session.modes' as const,
  need: { name: 'view', shape: z.strictObject({ basis }) },
}

type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readerOf>>['read']>>
const value = (item: unknown, name = need.need.name): Read =>
  ({ kind: 'success', value: [{ kind: 'value', need: name, value: item }] }) as never

function readerOf(
  read: () => unknown,
  ended: { count: number },
  at = SCOPE,
  consumer = 'coordinator',
) {
  return {
    consumer,
    scope: { ref: at },
    read: async (asked: unknown) => {
      expect(asked).toEqual([{ key: need.key, need: need.need.name }])
      return read() as never
    },
    end: async () => {
      ended.count += 1
    },
  }
}

/** The ports of a session with one open scope; `change` replaces what a step answers. */
function world(read: () => unknown, change: Partial<Record<string, unknown>> = {}) {
  const ended = { count: 0 }
  const asked: Record<string, unknown> = {}
  const scopes = change['scopes'] ?? [{ generation: '1', scope: SCOPE, ended: null }]
  const ports = {
    work: {
      readWork: async () =>
        change['work'] ?? { ok: { tenant: TENANT, session: SESSION, contextScopes: scopes } },
    },
    recoverSession: async (input: unknown) => {
      asked['recover'] = input
      return change['recovered'] ?? { kind: 'ready' }
    },
    eligibility: {
      current: async (input: unknown) => {
        asked['eligibility'] = input
        return change['issued'] ?? { kind: 'current', eligibility: { eligibility: 'e-1' } }
      },
    },
    runtime: {
      bind: async (input: unknown) => {
        asked['bind'] = input
        return (
          change['bound'] ?? { kind: 'bound', reader: change['reader'] ?? readerOf(read, ended) }
        )
      },
    },
  } as unknown as PublishedViewPorts
  return { ports, ended, asked }
}

describe('one need of the coordinator, read in the open scope of the session', () => {
  it('reads the value as its shape, as the coordinator, after the scope is recovered, and ends the reader', async () => {
    const w = world(() => value({ directory: '/srv/blog' }))
    expect(await readPublishedNeed(w.ports, access, need)).toEqual({
      ok: { directory: '/srv/blog' },
    })
    const scope = { ref: SCOPE }
    expect(w.asked).toEqual({
      recover: { tenant: TENANT, session: SESSION, scope },
      eligibility: { ...access, scope, consumer: 'coordinator' },
      bind: { eligibility: 'e-1' },
    })
    expect(w.ended.count).toBe(1)
  })

  it('answers null, not a failure, when the block has no value now', async () => {
    const w = world(() => ({
      kind: 'missing',
      items: [{ key: need.key, cause: 'source-unavailable' }],
    }))
    expect(await readPublishedNeed(w.ports, access, need)).toEqual({ ok: null })
    expect(w.ended.count).toBe(1)
  })

  it.each<[string, unknown, string]>([
    ['a refused read', { kind: 'refused', reason: 'unauthorized' }, 'read: refused'],
    ['more than one item', { kind: 'success', value: [{}, {}] }, 'read: not the one asked need'],
    ['another need', value({ directory: '/x' }, 'other'), 'read: not the one asked need'],
    [
      'an item that is not a value',
      { kind: 'success', value: [{ kind: 'none', need: need.need.name }] },
      'read: none',
    ],
    ['a value of another shape', value({ path: '/x' }), 'read: the view does not parse'],
  ])('fails on %s', async (_name, answer, failure) => {
    const w = world(() => answer)
    expect(await readPublishedNeed(w.ports, access, need)).toEqual({ failure })
    expect(w.ended.count).toBe(1)
  })

  it.each<[string, Partial<Record<string, unknown>>, string]>([
    [
      'session work that cannot be read',
      { work: { failure: { kind: 'unavailable' } } },
      'session work: unavailable',
    ],
    [
      'the work of another session',
      { work: { ok: { tenant: TENANT, session: 'ses_other', contextScopes: [] } } },
      'session work: another session',
    ],
    [
      'the work of another tenant',
      { work: { ok: { tenant: fixtureTenant('b'), session: SESSION, contextScopes: [] } } },
      'session work: another session',
    ],
    ['a session with no scope', { scopes: [] }, 'session work: no context scope'],
    [
      'a scope that has ended',
      { scopes: [{ generation: '1', scope: SCOPE, ended: { commit: 'c' } }] },
      'session work: the context scope has ended',
    ],
    [
      'a scope that is no scope ref',
      { scopes: [{ generation: '1', scope: '', ended: null }] },
      'session work: the context scope is not a scope ref',
    ],
    [
      'a scope that cannot be recovered',
      { recovered: { kind: 'unavailable' } },
      'session recovery: unavailable',
    ],
    ['no eligibility', { issued: { kind: 'absent' } }, 'eligibility: absent'],
    [
      'a reader that cannot be bound',
      { bound: { kind: 'refused', reason: 'closed' } },
      'bind: refused',
    ],
  ])('fails, and reads nothing, on %s', async (_name, change, failure) => {
    let read = 0
    const w = world(() => {
      read += 1
      return value({ directory: '/x' })
    }, change)
    expect(await readPublishedNeed(w.ports, access, need)).toEqual({ failure })
    expect(read).toBe(0)
  })

  it('reads nothing through a reader of another consumer or scope, and still ends it', async () => {
    for (const [at, consumer] of [
      ['session-scope:other', 'coordinator'],
      [SCOPE, 'model'],
    ] as const) {
      const ended = { count: 0 }
      const reader = readerOf(() => value({ directory: '/x' }), ended, at, consumer)
      const w = world(() => undefined, { reader })
      expect(await readPublishedNeed(w.ports, access, need)).toEqual({
        failure: 'bind: another consumer or scope',
      })
      expect(ended.count).toBe(1)
    }
  })

  it('answers what was thrown as a failure', async () => {
    const thrown = world(() => {
      throw new Error('reader down')
    })
    expect(await readPublishedNeed(thrown.ports, access, need)).toEqual({
      failure: 'threw: reader down',
    })
    const text = world(() => {
      throw 'not an error'
    })
    expect(await readPublishedNeed(text.ports, access, need)).toEqual({
      failure: 'threw: not an error',
    })
  })
})

describe('a view that names the session it was computed for', () => {
  const named = (tenant: string, session: string) => () =>
    ({
      kind: 'success',
      value: [{ kind: 'value', need: 'view', value: { basis: { tenant, session } } }],
    }) as never
  const reading = (read: () => unknown) => {
    const ended = { count: 0 }
    const reader = {
      ...readerOf(read, ended),
      read: async (asked: unknown) => {
        expect(asked).toEqual([{ key: view.key, need: view.need.name }])
        return read() as never
      },
    }
    return world(read, { reader }).ports
  }

  it('is given when it names this tenant and this session', async () => {
    const own = { basis: { tenant: encoded.value, session: SESSION } }
    expect(await readPublishedView(reading(named(encoded.value, SESSION)), access, view)).toEqual({
      ok: own,
    })
  })

  it.each([
    ['another session', named(encoded.value, 'ses_other'), 'read: the basis names another session'],
    ['another tenant', named('other', SESSION), 'read: the basis names another session'],
    ['no value now', () => ({ kind: 'missing', items: [] }), 'read: missing'],
    ['a read that failed', () => ({ kind: 'refused', reason: 'x' }), 'read: refused'],
  ] as const)('is refused when it has %s', async (_name, read, failure) => {
    expect(await readPublishedView(reading(read), access, view)).toEqual({ failure })
  })

  it('is refused for a tenant its codec did not mint, before anything is read', async () => {
    const forged = { ...access, tenant: { ...TENANT } }
    const ports = world(named(encoded.value, SESSION), {
      work: {
        ok: {
          tenant: forged.tenant,
          session: SESSION,
          contextScopes: [{ generation: '1', scope: SCOPE, ended: null }],
        },
      },
      reader: {
        ...readerOf(named(encoded.value, SESSION), { count: 0 }),
        read: named(encoded.value, SESSION),
      },
    }).ports
    expect(await readPublishedView(ports, forged, view)).toEqual({
      failure: 'session work: another session',
    })
  })
})
