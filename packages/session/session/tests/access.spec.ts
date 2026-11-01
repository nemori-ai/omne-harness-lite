// The one access decision of each face operation (SPEC CP-01 第 1 步, VM-13), its failure branches,
// the caller-class consistency check, and the refusal of another tenant (contract J40).
import { afterEach, describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { SessionFailure } from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  ordinaryInput,
  shapeOf,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { memoryBackend, type BackendFactory } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(backend: BackendFactory = memoryBackend): Promise<Harness> {
  const h = await harness({ backend })
  open.push(h)
  return h
}

function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

/** Runs `operation` and returns how many decisions the access check gave for it. */
async function decisions(h: Harness, operation: () => Promise<unknown>): Promise<number> {
  const before = h.checks.count()
  await operation()
  return h.checks.count() - before
}

describe('each face operation asks the access check exactly once', () => {
  it('mutations, reads, the recall of a held operation and a history page each take one decision', async () => {
    const h = await service()
    expect(await decisions(h, () => h.create())).toBe(1)
    expect(await decisions(h, () => h.accept('one'))).toBe(1)
    // The same operation again is a recall: still one decision, before the original answer.
    const recalled = await decisions(h, async () => {
      const again = succeeded(
        await h.faces('intake').work.accept({
          ...h.access(),
          operation: operationId('accept-one'),
          value: ordinaryInput('one'),
        }),
        'recall',
      )
      expect(again.recovered).toBe(true)
    })
    expect(recalled).toBe(1)
    const coordinator = h.faces('coordinator').work
    expect(await decisions(h, () => coordinator.readWork(h.access()))).toBe(1)
    expect(await decisions(h, () => coordinator.loadRecovery(h.access()))).toBe(1)
    expect(
      await decisions(h, () =>
        coordinator.queryOperation({ ...h.access(), operation: operationId('accept-one') }),
      ),
    ).toBe(1)
    expect(
      await decisions(h, () =>
        h.faces('reader').history.begin({
          ...h.access(),
          kinds: [],
          from: null,
          direction: 'forward',
          pageBytes: 64,
        }),
      ),
    ).toBe(1)
    // Each request names the operation it decides, never a shared allowance.
    const operations = h.checks.asked().map(request => request.operation)
    expect(operations).toEqual([
      'create',
      'accept',
      'accept',
      'readWork',
      'loadRecovery',
      'queryOperation',
      'history.begin',
    ])
  })

  it('a changed retry reads the authoritative snapshot again through the same view and asks no second decision', async () => {
    const h = await harness({ backend: memoryBackend })
    open.push(h)
    await h.create()
    await h.accept('input-1')
    const started = succeeded(
      await h.faces('coordinator').work.startRun({
        ...h.access(),
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      }),
      'startRun',
    )
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    // The first commit of the face operation meets a tail that another writer has just moved.
    let moved = false
    h.view.onCommit(async (input, next) => {
      if (!moved) {
        moved = true
        succeeded(
          await h.backend.transactions.commit({
            access: h.access(),
            command: {
              kind: 'accept',
              input: {
                tenant: h.access().tenant,
                session: h.access().session,
                operation: operationId('accept-concurrent'),
                value: ordinaryInput('concurrent'),
              },
            },
            guards: [],
          }),
          'concurrent accept',
        )
      }
      return next()
    })
    h.view.reset()
    // The concurrent writer goes through the public port, which takes its own decision.
    await decisions(h, async () => {
      const finished = await h.faces('coordinator').work.finishRun({
        ...h.access(),
        operation: operationId('finish'),
        run: started.advance.run,
        expected: snapshot.revision,
        bounded: {
          kind: 'admission-rejected',
          input: started.first,
          rejection: started.receipt.source,
        },
      })
      expect(finished, JSON.stringify(finished)).toHaveProperty('ok')
    })
    const decided = h.checks.asked().map(request => request.operation)
    expect(decided.filter(operation => operation === 'finishRun')).toHaveLength(1)
    expect(decided.filter(operation => operation === 'accept')).toHaveLength(2)
    const methods = h.view.calls().map(call => call.method)
    expect(methods.filter(method => method === 'commit')).toHaveLength(2)
    expect(methods.filter(method => method === 'readWork')).toHaveLength(2)
  })

  it('pending is decided once, by the public port, and binds no view', async () => {
    const h = await service()
    await h.create()
    h.view.reset()
    const count = await decisions(h, () =>
      h.faces('maintainer').reconciliation.pending({
        principal: 'a:tester',
        tenant: h.access().tenant,
        after: null,
        limit: 10,
      }),
    )
    expect(count).toBe(1)
    expect(h.view.calls()).toEqual([])
  })
})

describe('the failure branches of the decision (CP-01 第 1 步)', () => {
  const unavailableCheck = { kind: 'unavailable', diagnostic: 'policy store down' } as const
  const throwingCheck = { kind: 'throw', error: new Error('policy crashed') } as const

  for (const [name, answer] of [
    ['unavailable', unavailableCheck],
    ['a throw', throwingCheck],
  ] as const)
    it(`a check that answers ${name} answers unavailable of sessionAccessCheck, and nothing is read, prepared or committed`, async () => {
      const h = await service()
      await h.create()
      h.view.reset()
      const asked = h.identity.controls.asked().length
      h.checks.script(answer, answer)
      const accepted = failureOf(
        await h.faces('intake').work.accept({
          ...h.access(),
          operation: operationId('accept-x'),
          value: ordinaryInput('x'),
        }),
      )
      expect(accepted).toMatchObject({ kind: 'unavailable', owner: 'sessionAccessCheck' })
      const read = failureOf(await h.faces('coordinator').work.readWork(h.access()))
      expect(read).toMatchObject({ kind: 'unavailable', owner: 'sessionAccessCheck' })
      expect(h.view.calls()).toEqual([])
      expect(h.identity.controls.asked().length).toBe(asked)
      const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
      expect(snapshot.pending).toEqual([])
    })

  it('a denied check answers denied with the operation name, and nothing is read or committed', async () => {
    const h = await service()
    await h.create()
    h.view.reset()
    h.checks.script({ kind: 'denied' })
    expect(
      failureOf(
        await h.faces('intake').work.accept({
          ...h.access(),
          operation: operationId('accept-x'),
          value: ordinaryInput('x'),
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'accept' })
    expect(h.view.calls()).toEqual([])
  })

  it('a session that does not exist under the tenant answers denied after the one lookup, before any snapshot or material', async () => {
    const h = await service()
    h.view.reset()
    const asked = h.identity.controls.asked().length
    const answer = failureOf(
      await h.faces('intake').work.accept({
        ...h.access('never-created'),
        operation: operationId('accept-x'),
        value: ordinaryInput('x'),
      }),
    )
    expect(answer).toEqual({ kind: 'denied', action: 'accept' })
    expect(h.view.calls().map(call => call.method)).toEqual(['queryOperation'])
    expect(h.identity.controls.asked().length).toBe(asked)
  })

  it('create is the one command that starts a session that does not exist yet', async () => {
    const h = await service()
    h.view.reset()
    await h.create('fresh')
    expect(h.view.calls().map(call => call.method)).toEqual([
      'queryOperation',
      'commit',
      'history.begin',
    ])
  })

  it('a caller class outside the operation is denied before any decision (VC-O05)', async () => {
    const h = await service()
    await h.create()
    expect(
      await decisions(h, async () => {
        expect(failureOf(await h.faces('intake').work.readWork(h.access()))).toEqual({
          kind: 'denied',
          action: 'readWork',
        })
        expect(
          failureOf(
            await h.faces('reader').work.accept({
              ...h.access(),
              operation: operationId('accept-y'),
              value: ordinaryInput('y'),
            }),
          ),
        ).toEqual({ kind: 'denied', action: 'accept' })
      }),
    ).toBe(0)
  })

  it('an access without a tenant is invalid before any decision', async () => {
    const h = await service()
    const { tenant: _tenant, ...rest } = h.access()
    const answer = await h.faces('coordinator').work.readWork(rest as never)
    expect(failureOf(answer)).toMatchObject({ kind: 'invalid', field: 'tenant' })
    expect(h.checks.count()).toBe(0)
  })
})

describe('another tenant (R3.4)', () => {
  it('a principal of tenant B reading or writing session-1 of tenant A is denied, the same as a session that never was', async () => {
    const h = await service()
    await h.create()
    await h.accept('one')
    const stranger = h.other()
    // Tenant B names its own tenant: the check allows it there, and the session does not exist there.
    const read = await h
      .faces('coordinator')
      .work.readWork({ ...stranger, principal: 'b:stranger' })
    const never = await h.faces('coordinator').work.readWork(h.access('never-created'))
    expect(failureOf(read)).toEqual({ kind: 'denied', action: 'readWork' })
    expect(shapeOf(read)).toBe(shapeOf(never))
    const write = await h.faces('intake').work.accept({
      ...stranger,
      operation: operationId('accept-b'),
      value: ordinaryInput('b'),
    })
    expect(failureOf(write)).toEqual({ kind: 'denied', action: 'accept' })
    // Tenant B naming tenant A: the decision refuses it.
    const named = await h
      .faces('coordinator')
      .work.readWork({ ...h.access(), principal: 'b:stranger' })
    expect(failureOf(named)).toEqual({ kind: 'denied', action: 'readWork' })
    const history = await h.faces('reader').history.begin({
      ...stranger,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1024,
    })
    expect(failureOf(history)).toMatchObject({ kind: 'denied' })
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'tenant A')
    expect(snapshot.pending).toHaveLength(1)
  })

  it('a snapshot of another tenant that a faulty store hands back is never used', async () => {
    // The store under the view ignores the tenant of the call and answers tenant A's session.
    const leaky: BackendFactory = {
      name: 'leaky',
      open: async accessCheck => {
        const inner = await memoryBackend.open(accessCheck)
        return {
          ...inner,
          delegated: {
            bind: checked => {
              const view = inner.delegated.bind(checked)
              return {
                ...view,
                readWork: input =>
                  inner.transactions.readWork({ ...input, principal: 'a:tester', tenant: tenantA }),
                queryOperation: () => Promise.resolve(succeed({ kind: 'unknown' as const })),
              }
            },
          },
        }
      },
    }
    const h = await service(leaky)
    const tenantA = h.access().tenant
    await h.create()
    const stranger = { ...h.other(), principal: 'b:stranger' }
    expect(failureOf(await h.faces('coordinator').work.readWork(stranger))).toEqual({
      kind: 'denied',
      action: 'readWork',
    })
    const accepted = await h.faces('intake').work.accept({
      ...stranger,
      operation: operationId('accept-b'),
      value: ordinaryInput('b'),
    })
    expect(failureOf(accepted)).toEqual({ kind: 'denied', action: 'accept' })
  })
})
