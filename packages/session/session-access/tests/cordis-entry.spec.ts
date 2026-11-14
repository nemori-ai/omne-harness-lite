// The Cordis binding on real Cordis 4.0.4: the plugin mounts `session/v1` on the access registry,
// reads Session as `intake` for management and work and as `reader` for the history, takes it at
// each call, and keeps the protocol mounted while Session is not on the tree (RFC-0015 I-5).
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { AccessRegistryProvider } from '@omne-harness/server-entry/cordis'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionAccessPlugin } from '../src/cordis.ts'
import { createSessionDouble } from './fixtures/session-double.ts'
import { createWorld, fixtureLogin, loginIdentity, resolveDefinition } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const SESSION = { name: 'session', major: 1 }
const signal = new AbortController().signal

function harness(withDirectory: boolean) {
  const double = createSessionDouble({
    members: new Map([
      [`${ALICE.tenant.organization.text}/${ALICE.account.text}`, new Set([ALICE.account.text])],
    ]),
  })
  const reads: string[] = []
  const callerOf = (service: object): string => {
    const config: unknown = Reflect.get(service, Service.resolveConfig)?.call(service)
    return (config as { caller?: string } | undefined)?.caller ?? 'none'
  }
  class FakeSession extends SessionService {
    get management() {
      reads.push(`management:${callerOf(this)}`)
      return double.faces.management as never
    }
    get work() {
      reads.push(`work:${callerOf(this)}`)
      return double.faces.work as never
    }
    get history() {
      reads.push(`history:${callerOf(this)}`)
      return double.faces.history as never
    }
    get reconciliation() {
      return {} as never
    }
  }
  // `directory` is a plain optional property of the service, so the caller class is recorded by an
  // accessor put on the prototype.
  Object.defineProperty(FakeSession.prototype, 'directory', {
    get(this: object) {
      reads.push(`directory:${callerOf(this)}`)
      return withDirectory
        ? { list: async () => ({ ok: { items: [], next: null, completeness: 'complete' } }) }
        : undefined
    },
  })
  return { double, reads, FakeSession }
}

async function assemble({ directory = true } = {}) {
  const { double, reads, FakeSession } = harness(directory)
  const world = createWorld()
  const root = new Context()
  await root.plugin(AccessRegistryProvider)
  const session = await root.plugin(FakeSession)
  const prepared: string[] = []
  await root.plugin(
    createSessionAccessPlugin({
      principals: () => ({
        actingFor: async (_login, tenantText) =>
          tenantText === ALICE.tenantText ? { ok: world.issue(ALICE) } : { refused: 'denied' },
      }),
      facts: {
        describe: () => ({
          tenant: ALICE.tenant,
          account: ALICE.account.text,
          login: ALICE.loginText,
        }),
      },
      definitions: () => resolveDefinition,
      // The fake directory answers in the shape of the port, so the adapter hands it through.
      listing: directory => ({
        list: async input => {
          const answered = await directory.list({ ...input, principal: input.principal })
          return 'ok' in answered ? { ok: answered.ok as never } : { refused: 'basis-unavailable' }
        },
      }),
      prepareCreation: input => {
        prepared.push(input.creation.purpose)
        return input
      },
    }),
    {
      maxPageBytes: 65536,
      historyKinds: ['message.user'],
      defaultListLimit: 50,
      maxListLimit: 50,
    },
  )
  const registry = root.accessRegistry as unknown as AccessRegistryProvider
  const call = async (name: string, principal: unknown, body: unknown) => {
    const entered = registry.enter(SESSION, name)
    if (entered === undefined) throw new Error(`${name} is not mounted`)
    if (entered.member.kind !== 'operation') throw new Error(`${name} is not an operation`)
    try {
      return await entered.member.handler(
        { principal: principal as never, messageId: 'm-1', signal },
        body,
      )
    } finally {
      entered.leave()
    }
  }
  return { root, registry, session, double, reads, prepared, world, call }
}

describe('the session access plugin on real Cordis', () => {
  it('mounts session/v1 with the eight operations and observe-session', async () => {
    const { registry } = await assemble()
    for (const name of [
      'create-session',
      'query-create-session',
      'send-input',
      'query-send-input',
      'read-history',
      'list-sessions',
      'cancel-run',
      'stop-call',
    ])
      expect(registry.enter(SESSION, name)?.member.kind).toBe('operation')
    expect(registry.enter(SESSION, 'observe-session')?.member.kind).toBe('observation')
  })

  it('mounts list-sessions as a login read of the small limit', async () => {
    const { registry } = await assemble()
    const member = registry.enter(SESSION, 'list-sessions')?.member
    if (member?.kind !== 'operation') throw new Error('list-sessions is not an operation')
    expect([member.contract.identity, member.contract.effect, member.contract.limit]).toEqual([
      'login',
      'read',
      'small',
    ])
  })

  it('reads the session list as reader, and answers basis-unavailable when Session has none', async () => {
    const withDirectory = await assemble()
    const listed = await withDirectory.call('list-sessions', loginIdentity(ALICE), {
      tenant: ALICE.tenant,
      cursor: null,
    })
    expect(listed).toEqual({
      outcome: 'succeeded',
      body: { sessions: [], next: null, completeness: 'complete' },
    })
    expect(withDirectory.reads).toContain('directory:reader')
    expect(withDirectory.reads).not.toContain('directory:none')

    const without = await assemble({ directory: false })
    expect(
      await without.call('list-sessions', loginIdentity(ALICE), {
        tenant: ALICE.tenant,
        cursor: null,
      }),
    ).toEqual({ outcome: 'basis-unavailable' })
  })

  it('reads management as intake through the assembly preparation and history as reader', async () => {
    const { call, reads, prepared, world } = await assemble()
    const created = await call('create-session', world.issue(ALICE) as Principal, {
      createCallId: 'create-1',
      definition: 'assistant',
      purpose: 'hello',
    })
    expect(created).toMatchObject({ outcome: 'succeeded' })
    expect(prepared).toEqual(['hello'])
    const session = (created as { body: { session: string } }).body.session
    const page = await call('read-history', loginIdentity(ALICE), {
      tenant: ALICE.tenant,
      session,
      cursor: null,
      direction: 'forward',
      pageBytes: '1024',
    })
    expect(page).toMatchObject({ outcome: 'succeeded' })
    expect(reads).toContain('management:intake')
    expect(reads).toContain('history:reader')
    expect(reads).not.toContain('management:none')
    expect(reads).not.toContain('history:none')
  })

  it('answers basis-unavailable while Session is off the tree and keeps the protocol mounted', async () => {
    const { call, session, registry, world } = await assemble()
    await session.dispose()
    const answer = await call('create-session', world.issue(ALICE) as Principal, {
      createCallId: 'create-1',
      definition: 'assistant',
      purpose: 'hello',
    })
    expect(answer).toEqual({ outcome: 'basis-unavailable' })
    expect(registry.enter(SESSION, 'create-session')).toBeDefined()
  })
})
