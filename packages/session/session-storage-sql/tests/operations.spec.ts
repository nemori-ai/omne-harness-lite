// The write path and the operation lookups (SPEC SL07, SL09, W1, R7, XC-INTERRUPT, XC-MODELSEL)
// on the real participant, reached through the public port only.
import { describe, expect, it } from 'vitest'
import type { RunId, SessionCommand } from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const base = { tenant: TENANT_A, session: sessionId('session-1') }
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

const cancel = (a: App, name: string, run = 'run_never'): Promise<unknown> =>
  a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'cancelRun',
      input: { ...base, operation: operationId(name), run: run as RunId, urgency: 'force' },
    } as SessionCommand as never,
    guards: [],
  })
const archive = (a: App, name: string): Promise<unknown> =>
  a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'control',
      input: { ...base, operation: operationId(name), intent: { kind: 'archive' } },
    } as never,
    guards: [],
  })
const stopTool = (a: App, name: string, session = 'session-1'): Promise<unknown> =>
  a.port.commit({
    access: a.access(TENANT_A, session),
    command: {
      kind: 'stopCall',
      input: {
        ...base,
        session: sessionId(session),
        operation: operationId(name),
        producer: { kind: 'tool', call: 'tool-1' },
      },
    } as never,
    guards: [],
  })
const selectModel = (a: App, name: string, route: string): Promise<unknown> =>
  a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'change',
      input: {
        ...base,
        operation: operationId(name),
        declaration: { kind: 'model', name: route, basis: evidence(route) },
      },
    } as never,
    guards: [],
  })
const identityOf = (operation: string, attempt: number) =>
  ({
    scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
    transactionDomain: 'dom_0',
    operation: operationId(operation),
    protocolVersion: '2',
    operationKey: `${operationId(operation)}#${attempt}`,
  }) as const

async function started() {
  const a = await app()
  ok(await a.create(TENANT_A))
  return a
}

describe('SL07: an operation identity belongs to one operation, whatever its form', () => {
  it('the same identity with another input is a conflict that names the identity and writes nothing', async () => {
    const a = await started()
    const first = ok(await a.accept(TENANT_A, 'session-1', 'one'))
    const before = ok(await a.port.readWork(a.access(TENANT_A)))
    const other = await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'accept',
        input: { ...base, operation: operationId('accept-one'), value: { kind: 'ordinary', input: 'other' } },
      } as never,
      guards: [],
    })
    expect(failureOf(other)).toEqual({ kind: 'conflict', operation: operationId('accept-one') })
    expect(ok(await a.port.readWork(a.access(TENANT_A)))).toEqual(before)
    const again = ok<{ recovered: boolean }>(await a.accept(TENANT_A, 'session-1', 'one'))
    expect(again.recovered).toBe(true)
    expect({ ...again, recovered: false }).toEqual(first)
  })

  it('a control command on the identity of a batch is a conflict', async () => {
    const a = await started()
    ok(await a.accept(TENANT_A, 'session-1', 'one'))
    expect(failureOf(await cancel(a, 'accept-one'))).toEqual({ kind: 'conflict', operation: operationId('accept-one') })
  })

  it('a batch command on the identity of a control answer is a conflict and changes nothing', async () => {
    const a = await started()
    ok(await cancel(a, 'shared'))
    const clash = await archive(a, 'shared')
    expect(failureOf(clash)).toEqual({ kind: 'conflict', operation: operationId('shared') })
    expect(ok<{ lifecycle: string }>(await a.port.readWork(a.access(TENANT_A))).lifecycle).not.toBe(
      'archived',
    )
  })

  it('cancelRun and stopCall share one domain: a stopCall on a cancelRun identity is a conflict', async () => {
    const a = await started()
    ok(await cancel(a, 'shared'))
    const clash = await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'stopCall',
        input: { ...base, operation: operationId('shared'), producer: { kind: 'model', call: 'm-1' } },
      } as never,
      guards: [],
    })
    expect(failureOf(clash)).toEqual({ kind: 'conflict', operation: operationId('shared') })
  })

  it('queryOperation on a control identity and queryControlOperation on a batch identity both conflict', async () => {
    const a = await started()
    ok(await a.accept(TENANT_A, 'session-1', 'one'))
    ok(await cancel(a, 'answered'))
    const asBatch = await a.port.queryOperation({ ...a.access(TENANT_A), operation: operationId('answered') })
    const asControl = await a.port.queryControlOperation({
      ...a.access(TENANT_A),
      operation: operationId('accept-one'),
    })
    expect(failureOf(asBatch)).toEqual({ kind: 'conflict', operation: operationId('answered') })
    expect(failureOf(asControl)).toEqual({ kind: 'conflict', operation: operationId('accept-one') })
  })

  // Known limitation: the storage identity is `<SessionOperationId>#<generation>` inside the tenant
  // domain (session-storage-sql SPEC W1), so one identity is one operation per tenant, not per
  // session. An identity of another session answers `conflict` and writes nothing, which is the
  // safe side; the conflict domain (tenant, session, identity) of session-contract SL07 relies on
  // OP-00 never reusing an identity across sessions.
  it('an identity already used in another session of the tenant is a conflict, and writes nothing there', async () => {
    const a = await app()
    ok(await a.create(TENANT_A, 'session-1'))
    ok(await a.create(TENANT_A, 'session-2'))
    ok(await a.accept(TENANT_A, 'session-1', 'same'))
    const before = ok(await a.port.readWork(a.access(TENANT_A, 'session-2')))
    expect(failureOf(await a.accept(TENANT_A, 'session-2', 'same'))).toEqual({
      kind: 'conflict',
      operation: operationId('accept-same'),
    })
    expect(ok(await a.port.readWork(a.access(TENANT_A, 'session-2')))).toEqual(before)
  })
})

describe('stopCall of a Tool target', () => {
  it('is unsupported on a fresh identity, a used identity and an unknown session, and writes nothing', async () => {
    const a = await started()
    ok(await a.accept(TENANT_A, 'session-1', 'one'))
    const before = ok(await a.port.readWork(a.access(TENANT_A)))
    const mark = a.provider.calls.length
    expect(kindOf(await stopTool(a, 'fresh'))).toBe('unsupported')
    expect(kindOf(await stopTool(a, 'accept-one'))).toBe('unsupported')
    expect(kindOf(await stopTool(a, 'ghost', 'no-such-session'))).toBe('unsupported')
    expect(a.provider.calls.length).toBe(mark)
    expect(ok(await a.port.readWork(a.access(TENANT_A)))).toEqual(before)
    const asked = await a.port.queryControlOperation({ ...a.access(TENANT_A), operation: operationId('fresh') })
    expect(ok<{ kind: string }>(asked).kind).toBe('unknown')
  })
})

describe('control answers', () => {
  it('an answer-only cancelRun writes no revision, replays its answer and is read back by queryControlOperation', async () => {
    const a = await started()
    const before = ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A)))
    const first = ok<{ answer: unknown }>(await cancel(a, 'none'))
    expect(first.answer).toEqual({ kind: 'not-found' })
    expect(ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A))).revision).toBe(before.revision)
    expect(ok(await cancel(a, 'none'))).toEqual(first)
    const resolved = await a.port.queryControlOperation({ ...a.access(TENANT_A), operation: operationId('none') })
    expect(ok(resolved)).toEqual({ kind: 'committed', receipt: first })
  })

  it('a malformed cancelRun is invalid and saves neither an answer nor an operation', async () => {
    const a = await started()
    expect(failureOf(await cancel(a, 'bad', ''))).toMatchObject({ kind: 'invalid', field: 'run' })
    const resolved = ok<{ kind: string }>(
      await a.port.queryControlOperation({ ...a.access(TENANT_A), operation: operationId('bad') }),
    )
    expect(resolved.kind).toBe('unknown')
  })
})

describe('commit response evidence', () => {
  it('a refused commit keeps the original failure basis in the rolled back receipt', async () => {
    const a = await started()
    const refused = failureOf(await cancel(a, 'bad', ''))
    const receipt = await a.provider.storage.query(identityOf('bad', 1))
    expect(receipt.kind).toBe('rolled_back')
    const stop = (receipt as unknown as { responses: { reply: { kind: string; basis: { failure: unknown } } }[] })
      .responses.at(-1)?.reply
    expect(stop?.kind).toBe('conflict')
    expect(stop?.basis.failure).toEqual(refused)
  })

  it('the next call of a rejected identity runs a later attempt generation and is refused the same way', async () => {
    const a = await started()
    const first = failureOf(await cancel(a, 'bad', ''))
    const second = failureOf(await cancel(a, 'bad', ''))
    expect(second).toEqual(first)
    expect((await a.provider.storage.query(identityOf('bad', 2))).kind).toBe('rolled_back')
  })

  it('a reply lost after the commit ran is commit-unknown, and the recall is the original receipt', async () => {
    const a = await started()
    a.provider.loseNextReply()
    expect(failureOf(await a.accept(TENANT_A, 'session-1', 'lost'))).toEqual({
      kind: 'commit-unknown',
      operation: operationId('accept-lost'),
    })
    const recalled = ok<{ recovered: boolean; revision: string }>(await a.accept(TENANT_A, 'session-1', 'lost'))
    expect(recalled.recovered).toBe(true)
    expect(recalled.revision).toBe('2')
  })
})

describe('queryOperation', () => {
  it('asks the original receipt first and does not ask the storage about attempts when it is found', async () => {
    const a = await app()
    const created = ok<{ receipt: unknown }>(await a.create(TENANT_A, 'session-1'))
    const mark = a.provider.calls.length
    const resolved = ok(
      await a.port.queryOperation({ ...a.access(TENANT_A), operation: operationId('create-session-1') }),
    )
    expect(resolved).toEqual({ kind: 'committed', receipt: created.receipt })
    const seen = a.provider.calls.slice(mark)
    expect(seen.map(call => call.kind)).toEqual(['commit'])
    expect((seen[0] as { identity: { operation: string } }).identity.operation).toBe('session.lookup')
  })

  it('an operation without a receipt is asked of the storage under its original identity and is unknown, not not-committed (R7)', async () => {
    const a = await started()
    const mark = a.provider.calls.length
    const resolved = ok<{ kind: string; exclusion?: { owner: string } }>(
      await a.port.queryOperation({ ...a.access(TENANT_A), operation: operationId('never') }),
    )
    // The entry that tells a participating operation from a Session operation is absent (R7), so a
    // clean generation 1 is not proof that the operation was never committed.
    expect(resolved.kind).toBe('unknown')
    expect(resolved.exclusion).toBeUndefined()
    const asked = a.provider.calls.slice(mark).filter(call => call.kind === 'query')
    expect(asked.map(call => (call as { identity: unknown }).identity)).toEqual([identityOf('never', 1)])
  })

  it('a rolled back attempt answers attempt-rejected, which does not prove the original was not committed', async () => {
    const a = await started()
    await cancel(a, 'bad', '')
    const resolved = ok<{ kind: string; original: string }>(
      await a.port.queryOperation({ ...a.access(TENANT_A), operation: operationId('bad') }),
    )
    expect(resolved).toMatchObject({ kind: 'attempt-rejected', original: 'unknown' })
  })

  it('is denied for a session the tenant does not have, before any attempt is asked', async () => {
    const a = await started()
    const mark = a.provider.calls.length
    const resolved = await a.port.queryOperation({
      ...a.access(TENANT_A, 'ghost'),
      operation: operationId('never'),
    })
    expect(kindOf(resolved)).toBe('denied')
    expect(a.provider.calls.slice(mark).filter(call => call.kind === 'query')).toEqual([])
  })
})

describe('readModelSelection', () => {
  it('is not-ready before a selection, then the saved selection with the commit that saved it', async () => {
    const a = await started()
    expect(kindOf(await a.port.readModelSelection(a.access(TENANT_A)))).toBe('not-ready')
    const saved = ok<{ source: unknown }>(await selectModel(a, 'select-a', 'route-a'))
    ok(await a.accept(TENANT_A, 'session-1', 'later'))
    const read = ok<{ selection: unknown; source: unknown; revision: string }>(
      await a.port.readModelSelection(a.access(TENANT_A)),
    )
    expect(read.selection).toEqual({ name: 'route-a', basis: evidence('route-a') })
    expect(read.source).toEqual(saved.source)
    expect(read.revision).toBe(ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A))).revision)
  })

  it('the latest selection wins and keeps its own source', async () => {
    const a = await started()
    ok(await selectModel(a, 'select-a', 'route-a'))
    const second = ok<{ source: unknown }>(await selectModel(a, 'select-b', 'route-b'))
    const read = ok<{ selection: { name: string }; source: unknown }>(
      await a.port.readModelSelection(a.access(TENANT_A)),
    )
    expect(read.selection.name).toBe('route-b')
    expect(read.source).toEqual(second.source)
  })

  it('a read that does not return is unavailable, not not-ready', async () => {
    const a = await started()
    a.provider.failReads('session.model-selection')
    expect(kindOf(await a.port.readModelSelection(a.access(TENANT_A)))).toBe('unavailable')
  })
})
