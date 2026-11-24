import type { Scope } from '@omne-harness/dynamis'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccessDiagnostic } from '../src/index.ts'
import { createStandaloneRegistry } from '../src/registry/desk.ts'
import type { RegistryForEntry } from '../src/registry/registry.ts'
import { OTHER_PROOF, TENANT, accessSide, call, type AccessSide } from './support/access-kit.ts'
import { startEntry, type Entry, type HttpReply } from './support/entry.ts'

const NOT_MOUNTED = '{"kind":"not-executed","reason":"not-mounted"}'
const noteBody = '{"noteId":"n-1"}'

type World = AccessSide & Entry & { asked: Scope[]; diagnostics: AccessDiagnostic[] }
let world: World | undefined

afterEach(async () => {
  await world?.stop()
  world = undefined
})

/** The notes protocol is held by the tenant alone: asked in the deployment's scope there is nothing; in that tenant's scope there it is. */
async function start(options: { scoped?: boolean; deployed?: boolean } = {}): Promise<World> {
  const diagnostics: AccessDiagnostic[] = []
  const side = accessSide({}, event => diagnostics.push(event))
  const deployment = createStandaloneRegistry()
  if (options.deployed === true) deployment.mount(side.notes.contribution)
  const asked: Scope[] = []
  const registry: RegistryForEntry = {
    ...deployment,
    enter(key, name, scope = []) {
      asked.push(scope)
      const own = scope.length === 2 && scope[0] === 'tenant' && scope[1] === TENANT
      return own ? side.access.registry.enter(key, name) : deployment.enter(key, name)
    },
  }
  const entry = await startEntry({
    access: {
      ...side.access,
      registry,
      ...(options.scoped === false ? {} : { tenantScope: (tenant: string) => ['tenant', tenant] }),
    },
  })
  world = { ...side, ...entry, asked, diagnostics }
  return world
}

const sameAsNothing = (reply: HttpReply): void => {
  expect([reply.status, reply.text]).toEqual([404, NOT_MOUNTED])
  expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(reply.headers['cache-control']).toBe('no-store')
  expect(reply.headers.connection).toBe('close')
}

describe("a protocol a tenant's plugin mounts, as the entry finds it", () => {
  it('the tenant that holds it reaches it: not mounted for the deployment, asked again in the scope of the tenant the call acts for', async () => {
    const w = await start()
    const reply = await call(w.port, 'open-note', { body: noteBody })
    expect(reply.status).toBe(200)
    expect(w.asked).toEqual([[], ['tenant', TENANT]])
  })

  it('without a login it answers what a protocol that is not there answers, and recognises no one', async () => {
    const w = await start()
    sameAsNothing(
      await call(w.port, 'open-note', {
        body: noteBody,
        headers: { authorization: undefined, 'omne-acting-tenant': undefined },
      }),
    )
    sameAsNothing(
      await call(w.port, 'open-note', { body: noteBody, headers: { authorization: undefined } }),
    )
    expect(w.accessIdentity.calls).toEqual([])
    expect(w.asked).toEqual([[], []])
  })

  it('another tenant answers the same: asked in its own scope, where the protocol is not', async () => {
    const w = await start()
    const reply = await call(w.port, 'open-note', {
      body: noteBody,
      headers: { authorization: `Bearer ${OTHER_PROOF}`, 'omne-acting-tenant': 'tenant-other' },
    })
    sameAsNothing(reply)
    expect(w.asked).toEqual([[], ['tenant', 'tenant-other']])
  })

  it.each([
    [
      'the login may not act for the tenant it names',
      { kind: 'answer', value: { outcome: 'denied' } },
      'actFor',
    ],
    [
      'acting cannot be told now',
      { kind: 'answer', value: { outcome: 'basis-unavailable' } },
      'actFor',
    ],
    ['the proof names no login', { kind: 'answer', value: { outcome: 'denied' } }, 'identifyLogin'],
    ['recognising throws', { kind: 'throw' }, 'identifyLogin'],
  ] as const)(
    'a caller naming the tenant answers the same when %s, and the tenant scope is never asked',
    async (_name, behaviour, step) => {
      const w = await start()
      if (step === 'actFor') w.accessIdentity.actFor = behaviour as never
      else w.accessIdentity.identifyLogin = behaviour as never
      sameAsNothing(await call(w.port, 'open-note', { body: noteBody }))
      expect(w.asked).toEqual([[]])
    },
  )

  it('a protocol the deployment has is reached as before: one ask, and identity asked just as without the tenant scope', async () => {
    const methods = async (scoped: boolean) => {
      const w = await start({ deployed: true, scoped })
      const reply = await call(w.port, 'open-note', { body: noteBody })
      expect(reply.status).toBe(200)
      expect(w.asked).toEqual([[]])
      await w.accessIdentity.returned('reportAccess')
      const asked = w.accessIdentity.calls.map(each => each.method)
      await w.stop()
      world = undefined
      return asked
    }
    expect(await methods(true)).toEqual(await methods(false))
  })

  it('without the tenant scope the entry asks the deployment alone, as before', async () => {
    const w = await start({ scoped: false })
    sameAsNothing(await call(w.port, 'open-note', { body: noteBody }))
    expect(w.asked).toEqual([[]])
    expect(w.accessIdentity.calls).toEqual([])
  })
})
