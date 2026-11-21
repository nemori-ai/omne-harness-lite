import { describe, expect, it } from 'vitest'
import type { UsageFailure } from '@omne-harness/usage-contract'
import {
  BODIES,
  createWorld,
  LOGIN,
  PRINCIPAL,
  SESSION,
  TENANT,
  TENANT_TEXT,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const call = { principal: LOGIN, messageId: 'm-1', signal }
const bodies = BODIES
const NAMES = Object.keys(bodies) as (keyof typeof bodies)[]

function run(world: ReturnType<typeof createWorld>, name: (typeof NAMES)[number]) {
  return world.contribution.operations[name](call, bodies[name] as never) as Promise<{
    outcome: string
    body?: unknown
  }>
}

describe('step 1: the login acts for the target tenant', () => {
  it.each(NAMES)(
    '%s answers what the principal port refuses, and basis-unavailable when it throws',
    async name => {
      for (const refusal of ['denied', 'basis-unavailable', 'throw'] as const) {
        const world = createWorld()
        world.state.refusal = refusal
        expect(await run(world, name)).toEqual({
          outcome: refusal === 'throw' ? 'basis-unavailable' : refusal,
        })
        expect(world.asks).toEqual([{ login: LOGIN, tenant: TENANT_TEXT }])
        expect(world.calls).toEqual([])
      }
    },
  )
})

describe('steps 2 and 3: the principal acting for the tenant, and the face taken now', () => {
  it.each(NAMES)(
    '%s answers basis-unavailable when the query service is not in the tree',
    async name => {
      const world = createWorld()
      world.state.face = false
      expect(await run(world, name)).toEqual({ outcome: 'basis-unavailable' })
    },
  )

  it('passes the issued principal, the tenant and the range as instant text', async () => {
    const world = createWorld()
    await run(world, 'query-usage')
    await run(world, 'list-usage-records')
    await run(world, 'read-context-occupancy')
    const ranged = { from: '2026-11-19T00:00:00Z', to: '2026-11-20T00:00:00Z' }
    expect(world.calls).toEqual([
      {
        read: 'query',
        input: {
          principal: PRINCIPAL,
          tenant: TENANT,
          scope: { kind: 'session', session: SESSION },
          range: ranged,
          zone: 'Asia/Shanghai',
          bucket: 'day',
          groupBy: ['model'],
        },
      },
      {
        read: 'records',
        input: {
          principal: PRINCIPAL,
          tenant: TENANT,
          scope: { kind: 'tenant' },
          range: ranged,
          after: null,
          limit: 10,
        },
      },
      { read: 'occupancy', input: { principal: PRINCIPAL, tenant: TENANT, session: SESSION } },
    ])
  })
})

describe('step 4: the answers of the query service', () => {
  const cases: readonly [UsageFailure, unknown][] = [
    [
      { kind: 'invalid', field: 'zone', reason: 'iana-name' },
      { outcome: 'invalid', body: { field: 'zone', reason: 'iana-name' } },
    ],
    [
      { kind: 'unsupported', field: 'scope' },
      { outcome: 'unsupported', body: { field: 'scope' } },
    ],
    [
      { kind: 'not-found', what: 'session' },
      { outcome: 'not-found', body: {} },
    ],
    [{ kind: 'denied', dependency: { kind: 'source', name: 'model' } }, { outcome: 'denied' }],
    [
      { kind: 'unavailable', dependency: { kind: 'session-scope' }, diagnostic: 'down' },
      { outcome: 'basis-unavailable' },
    ],
    [
      { kind: 'too-large', limit: 'pages' },
      { outcome: 'limited', body: { limit: 'pages' } },
    ],
  ]

  it.each(NAMES)('%s maps each failure of the query service to its outcome', async name => {
    for (const [failure, answer] of cases) {
      const world = createWorld()
      world.state.reply = { failure }
      expect(await run(world, name)).toEqual(answer)
    }
  })

  it.each(NAMES)('%s answers basis-unavailable when the query service throws', async name => {
    const world = createWorld()
    world.state.reply = 'throw'
    expect(await run(world, name)).toEqual({ outcome: 'basis-unavailable' })
  })
})
