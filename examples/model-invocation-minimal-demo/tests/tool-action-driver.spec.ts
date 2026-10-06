import { expect, test } from 'vitest'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { inspectDriverEntry } from '../src/tool-driver-codec.ts'
import { createToolDriverJournal } from '../src/tool-driver-journal.ts'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { scope, toolCall } from './tool-driver-history-fixture.ts'

test('real Cordis runner and admission publish the batch before returning a durable, verifiable locator', async () => {
  const f = await actionIntegrationFixture()
  try {
    const result = await f.dispatch()
    if (result.kind !== 'complete')
      throw new Error(
        JSON.stringify({
          result,
          runner: await f.current.dispatch.mock.results[0]?.value,
          pass: await Promise.all(f.current.forPass.mock.results.map(item => item.value)),
          append: await Promise.all(f.current.append.mock.results.map(item => item.value)),
        }),
      )
    expect(result).toMatchObject({
      kind: 'complete',
      completion: { gate: { kind: 'available' }, items: [{ decision: { kind: 'allow' } }] },
    })
    if (result.kind !== 'complete') throw new Error(JSON.stringify(result))
    const token = result.admissions[0]?.token
    if (token === undefined) throw new Error('missing admission')
    expect(
      await f.current.admission.verifyToken(f.current.toolAccess, scope, token, f.f.calls[0]!),
    ).toHaveProperty('kind', 'valid')
    expect(
      await f.current.authorization.authorize(
        f.current.toolAccess,
        scope,
        'session.log.coordinate',
      ),
    ).toMatchObject({ reason: 'notAuthorized' })
    expect(await f.dispatch()).toEqual(result)
    expect(f.current.dispatch).toHaveBeenCalledTimes(1)
    const oldGeneration = f.current.backing.operations.ownerGeneration
    await f.reopen()
    expect(f.current.backing.operations.ownerGeneration).not.toBe(oldGeneration)
    expect(await f.dispatch()).toEqual(result)
    expect(f.current.dispatch).not.toHaveBeenCalled()
    expect(
      await f.current.admission.verifyToken(f.current.toolAccess, scope, token, f.f.calls[0]!),
    ).toHaveProperty('kind', 'valid')
  } finally {
    await f.close()
  }
})

test('missing official contribution durably denies every original member, including unparseable calls', async () => {
  const f = await actionIntegrationFixture({
    official: false,
    calls: [toolCall('a'), toolCall('b', true)],
  })
  try {
    const result = await f.dispatch()
    expect(result).toMatchObject({
      kind: 'complete',
      admissions: [],
      completion: { gate: { kind: 'missing', reason: 'contribution' } },
    })
    if (result.kind !== 'complete') throw new Error(JSON.stringify(result))
    expect(result.completion.items.map(item => item.decision)).toEqual(
      [0, 1].map(() => ({
        kind: 'denied',
        conclusion: result.completion.key,
        reason: {
          kind: 'admission_unavailable',
          by: OFFICIAL_ADMISSION_NAME,
          conclusion: result.completion.key,
          explanation: expect.any(String),
        },
      })),
    )
  } finally {
    await f.close()
  }
})

test('request fields cannot replace the host-owned complete batch, report or opaque grants', async () => {
  const f = await actionIntegrationFixture({ calls: [toolCall('a'), toolCall('b')] })
  try {
    const read = await f.current.source()
    if ('failure' in read) throw new Error(read.failure)
    const prefix = await f.f.prefix()
    expect(
      await createToolDriverJournal({
        owner: f.current.owner.operations,
        access: f.current.toolAccess,
        recovery: f.current.owner.recovery,
        scope,
      }),
    ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    const request = read.request
    expect(
      await f.current.runner.dispatch(
        { ...request, actions: request.actions.slice(0, 1), anchors: request.anchors.slice(0, 1) },
        new AbortController().signal,
      ),
    ).toEqual({ failure: 'invalidInput' })
    expect(
      await f.current.runner.dispatch(
        {
          ...request,
          admission: { ...request.admission, grants: { ...request.admission.grants } },
        },
        new AbortController().signal,
      ),
    ).toEqual({ failure: 'invalidInput' })
    expect((await f.f.prefix()).tail).toEqual(prefix.tail)
  } finally {
    await f.close()
  }
})

test('a lost completion receipt returns no partial token and is recognized without rerunning official admission', async () => {
  const f = await actionIntegrationFixture()
  let armed = true
  const append = f.current.append,
    original = f.f.log.append
  try {
    append.mockImplementation(async (...args) => {
      const first = args[1][0],
        copied = copyJsonValue(first?.payload)
      const inspected =
        first && 'ok' in copied
          ? inspectDriverEntry(scope, {
              ...first,
              payload: copied.ok,
              session: scope.session,
              position: 1,
            })
          : undefined
      const result = await original(...args)
      if (
        armed &&
        inspected &&
        'value' in inspected &&
        inspected.value.kind === 'actions_completed' &&
        !('failure' in result)
      ) {
        armed = false
        return { failure: 'unavailable' }
      }
      return result
    })
    expect(await f.dispatch()).toEqual({ kind: 'rejected', reason: 'unavailable' })
    const persisted = await f.f.prefix()
    expect(await f.dispatch()).toMatchObject({ kind: 'complete', admissions: [{ callId: 'call' }] })
    expect((await f.f.prefix()).tail).toEqual(persisted.tail)
    expect(f.current.dispatch).toHaveBeenCalledTimes(1)
    expect(f.current.forPass).toHaveBeenCalledTimes(1)
  } finally {
    append.mockImplementation(original)
    await f.close()
  }
})

test('a fully unparseable model batch has no fabricated per-call pass but does have a durable gate decision', async () => {
  const f = await actionIntegrationFixture({ calls: [toolCall('bad', true)] })
  try {
    expect(await f.dispatch()).toMatchObject({
      kind: 'complete',
      admissions: [],
      completion: {
        gate: { kind: 'available' },
        items: [{ conclusions: [], decision: { kind: 'notExecutable', reason: 'unparseable' } }],
      },
    })
    expect(f.current.forPass).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('cold reopening resumes only unfinished judgments and withholds every token until the batch is complete', async () => {
  const f = await actionIntegrationFixture({ calls: [toolCall('a'), toolCall('b')] })
  let blocked = true
  const original = f.f.log.append
  const append = f.current.append.mockImplementation(
    async (...args: Parameters<SessionLog['append']>) => {
      const first = args[1][0],
        copied = copyJsonValue(first?.payload)
      if (first && 'ok' in copied) {
        const inspected = inspectRunnerConclusion({
          ...scope,
          entry: { ...first, payload: copied.ok, session: scope.session, position: 1 },
        })
        if (
          'conclusion' in inspected &&
          inspected.conclusion.callId === 'b' &&
          inspected.conclusion.extension === OFFICIAL_ADMISSION_NAME &&
          blocked
        )
          return { failure: 'invalidInput' }
      }
      return original(...args)
    },
  )
  try {
    expect(await f.dispatch()).toMatchObject({ kind: 'rejected' })
    const partial = await f.f.prefix()
    const finals = partial.entries.flatMap(entry => {
      const value = inspectRunnerConclusion({ ...scope, entry })
      return 'conclusion' in value ? [value.conclusion.callId] : []
    })
    expect(finals).toEqual(['a'])
    const history = await f.current.journal.read()
    if ('unavailable' in history) throw new Error('partial actual history unavailable')
    expect([...history.calls.values()].every(item => item.batch.kind === 'pending')).toBe(true)
    append.mockImplementation(original)
    blocked = false
    await f.reopen()
    const result = await f.dispatch()
    expect(result).toMatchObject({
      kind: 'complete',
      admissions: [{ callId: 'a' }, { callId: 'b' }],
    })
    const completed = await f.f.prefix()
    const finalCalls = completed.entries.flatMap(entry => {
      const value = inspectRunnerConclusion({ ...scope, entry })
      return 'conclusion' in value ? [value.conclusion.callId] : []
    })
    expect(finalCalls).toEqual(['a', 'b'])
  } finally {
    append.mockImplementation(original)
    await f.close()
  }
})
