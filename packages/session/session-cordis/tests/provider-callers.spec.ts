import { afterEach, describe, expect, it } from 'vitest'
import { creation, operationId, ordinaryInput } from '@omne-harness/session-contract/testing'
import { assemble, type Assembly } from './fixtures/assembly.ts'

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(): Promise<Assembly> {
  const assembly = await assemble()
  open.push(assembly)
  return assembly
}

type Face = Record<string, (input: unknown) => Promise<unknown>>
const faceNames = ['work', 'management', 'reconciliation', 'history', 'directory'] as const

function operationsOf(session: {
  work: unknown
  management: unknown
  reconciliation: unknown
  history: unknown
  directory: unknown
}): readonly (readonly [string, () => Promise<unknown>])[] {
  return faceNames.flatMap(name =>
    Object.keys(session[name] as Face).map(
      operation =>
        [
          name === 'history' || name === 'directory' ? `${name}.${operation}` : operation,
          () => (session[name] as Face)[operation]!({}),
        ] as const,
    ),
  )
}

describe('a caller whose class is not one of the four', () => {
  it.each([
    ['declares no class', 'unset'],
    ['declares a class that does not exist', 'superuser'],
  ])(
    '%s: every operation of every face answers denied, named by the operation',
    async (_name, declared) => {
      const a = await build()
      const caller = await a.caller(declared)
      const operations = operationsOf(caller.session())
      expect(operations.length).toBeGreaterThan(30)
      for (const [action, call] of operations)
        expect(await call(), action).toEqual({ failure: { kind: 'denied', action } })
      expect(a.checks.controls.asked()).toHaveLength(0)
    },
  )

  it('a reader that took the service from the root Context declares nothing, so it is denied too', async () => {
    const a = await build()
    const session = a.ctx.get('session')
    expect(session).toBeDefined()
    expect(await session!.work.readWork(a.access())).toEqual({
      failure: { kind: 'denied', action: 'readWork' },
    })
  })
})

describe('the class selects the face of that caller', () => {
  it('two callers with different classes each get their own: one serves, the other is denied', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    const reader = await a.caller('reader')
    const created = await a.create(intake)
    const refused = await reader.session().management.create({
      ...a.access('session-2'),
      operation: 'create-session-2' as never,
      creation: {} as never,
    })
    expect(refused).toEqual({ failure: { kind: 'denied', action: 'create' } })
    const begin = {
      ...a.access(),
      kinds: [],
      from: created.first,
      direction: 'forward',
      pageBytes: 1024,
    } as never
    expect(await intake.session().history.begin(begin)).toEqual({
      failure: { kind: 'denied', action: 'history.begin' },
    })
    expect(await reader.session().history.begin(begin)).toHaveProperty('ok')
    const list = {
      principal: a.access().principal,
      tenant: a.access().tenant,
      after: null,
      limit: 10,
    }
    expect(await intake.session().directory?.list(list)).toEqual({
      failure: { kind: 'denied', action: 'directory.list' },
    })
    expect(await reader.session().directory?.list(list)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionTransactions' },
    })
  })

  it.each([
    ['intake', 'readWork'],
    ['reader', 'accept'],
    ['coordinator', 'create'],
    ['maintainer', 'accept'],
  ] as const)(
    'a %s caller is denied %s, which another class owns, before any access decision',
    async (cls, operation) => {
      const a = await build()
      const caller = await a.caller(cls)
      const faces = caller.session()
      const face = [faces.work, faces.management, faces.reconciliation].find(
        candidate => operation in candidate,
      ) as unknown as Face
      const answer = await face[operation]!({
        ...a.access(),
        operation: operationId('op'),
        value: ordinaryInput('x'),
        creation: creation(),
      })
      expect(answer).toEqual({ failure: { kind: 'denied', action: operation } })
      expect(a.checks.controls.asked()).toHaveLength(0)
    },
  )
})

describe('the class grants nothing', () => {
  it('a class that admits the operation still meets the access decision of the principal', async () => {
    const a = await build()
    const intake = await a.caller('intake')
    await a.create(intake)
    const before = a.checks.controls.asked().length
    const answer = await intake.session().work.accept({
      ...a.access(),
      principal: 'b:stranger',
      operation: operationId('accept-stranger'),
      value: ordinaryInput('stranger'),
    })
    expect(answer).toEqual({ failure: { kind: 'denied', action: 'accept' } })
    expect(a.checks.controls.asked().length - before).toBe(1)
  })
})
