import { expect, test, vi } from 'vitest'
import type { AdmissionPassRecord } from '@omne-harness-lite/tool-admission'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { batchHost, piece, toolCall } from './action-support.ts'

test('a durable final is reused and only the unfinished candidate enters the next judgment', async () => {
  const h = await batchHost()
  h.register()
  const original = h.log.append
  const firstWritten = Promise.withResolvers<void>()
  const append = vi.spyOn(h.log, 'append').mockImplementation(async (...args) => {
    const entry = args[1][0]!
    const payload = copyJsonValue(entry.payload)
    if ('failed' in payload) throw new Error('Expected JSON conclusion')
    const parsed = inspectRunnerConclusion({
      session: h.source.scope.session,
      tenant: h.source.scope.tenant,
      entry: { ...entry, payload: payload.ok, session: h.source.scope.session, position: 1 },
    })
    if ('invalid' in parsed || 'unrelated' in parsed) throw new Error('Expected runner conclusion')
    if (parsed.conclusion.callId === 'b') {
      await firstWritten.promise
      // A definite non-write. Unknown physical writes have a separate owner protocol.
      return { failure: 'invalidInput' }
    }
    const result = await original(...args)
    firstWritten.resolve()
    return result
  })
  try {
    expect(await h.run()).toEqual({ failure: 'invalidInput' })
    const partial = await h.entries()
    expect('entries' in partial && partial.entries).toHaveLength(1)
    append.mockRestore()
    await h.reopen()
    expect(await h.run()).toMatchObject({
      admissions: [
        { callId: 'a', token: expect.any(String) },
        { callId: 'b', token: expect.any(String) },
      ],
    })
    expect(h.captured.map(batch => batch.map(item => item.call.callId))).toEqual([
      ['a', 'b'],
      ['b'],
    ])
    const complete = await h.entries()
    expect('entries' in complete && complete.entries).toHaveLength(2)
  } finally {
    firstWritten.resolve()
    append.mockRestore()
    await h.close()
  }
})

test('an outstanding unknown write prevents restarting any member of the batch', async () => {
  const h = await batchHost()
  h.register()
  const unknown = vi.spyOn(h.owner, 'hasUnknown').mockReturnValue(true)
  const reads = vi.spyOn(h.log, 'readByKey')
  try {
    expect(await h.run()).toEqual({ failure: 'unavailable' })
    expect(h.admission).not.toHaveBeenCalled()
    expect(reads).not.toHaveBeenCalled()
  } finally {
    unknown.mockRestore()
    await h.close()
  }
})

test('one admission call serves the batch; durable finals survive replay and physical reopen', async () => {
  const h = await batchHost()
  h.register()
  try {
    const first = await h.run()
    expect(first).toMatchObject({
      gate: { kind: 'available' },
      admissions: [
        { callId: 'a', token: expect.stringMatching(/^admission\.2\./) },
        { callId: 'b', token: expect.any(String) },
      ],
    })
    expect(h.admission).toHaveBeenCalledTimes(1)
    expect(h.captured[0]?.map(item => item.call.callId)).toEqual(['a', 'b'])
    expect(await h.run()).toEqual(first)
    await h.reopen()
    expect(await h.run()).toEqual(first)
    expect(h.admission).toHaveBeenCalledTimes(1)
    const read = await h.entries()
    expect('entries' in read && read.entries).toHaveLength(2)
  } finally {
    await h.close()
  }
})

test('preceding rewrites are durable and the single judgment sees the effective arguments', async () => {
  const h = await batchHost()
  h.register()
  h.registry.registerBuiltin('example:rewrite', async input => {
    if (input.position !== 'before_action') throw new Error('Unexpected position')
    return {
      kind: 'output',
      value: {
        kind: 'rewrite',
        subject: {
          ...input.subject,
          call: { ...input.subject.call, arguments: { rewritten: input.subject.call.callId } },
        },
      },
    }
  })
  try {
    const result = await h.run([piece('example:rewrite', 'rewrite'), piece()])
    expect(result).toHaveProperty('admissions')
    expect(h.captured[0]?.map(item => item.call.arguments)).toEqual([
      { rewritten: 'a' },
      { rewritten: 'b' },
    ])
    expect(h.admission).toHaveBeenCalledTimes(1)
  } finally {
    await h.close()
  }
})

test('an earlier veto finishes its item and cannot deadlock the remaining admission candidate', async () => {
  const h = await batchHost()
  h.register()
  h.registry.registerBuiltin('example:gate', async input => ({
    kind: 'output',
    value:
      input.position === 'before_action' && input.subject.call.callId === 'a'
        ? { kind: 'veto', reason: 'blocked a' }
        : { kind: 'observed' },
  }))
  try {
    const result = await h.run([piece('example:gate'), piece()])
    expect(result).toMatchObject({
      results: [{ effect: { kind: 'vetoed' } }, { effect: { kind: 'proceed' } }],
    })
    expect(h.captured[0]?.map(item => item.call.callId)).toEqual(['b'])
    expect(h.admission).toHaveBeenCalledTimes(1)
    if ('failure' in result) throw new Error(result.failure)
    expect(result.admissions?.[0]).not.toHaveProperty('token')
    expect(result.admissions?.[1]).toHaveProperty('token')
  } finally {
    await h.close()
  }
})

test('an earlier ask withholds every token, including already final items on the next pass', async () => {
  const h = await batchHost()
  h.register()
  h.registry.registerBuiltin('example:gate', async input => ({
    kind: 'output',
    value:
      input.position === 'before_action' && input.subject.call.callId === 'a'
        ? {
            kind: 'ask',
            card: {
              explanation: 'check a',
              options: [{ id: 'yes', label: 'Yes' }],
              about: { position: 'before_action', callId: 'a' },
            },
          }
        : { kind: 'observed' },
  }))
  try {
    const chain = [piece('example:gate'), piece()]
    const result = await h.run(chain)
    expect(result).toMatchObject({
      results: [{ effect: { kind: 'asked' } }, { effect: { kind: 'proceed' } }],
    })
    expect(result).not.toHaveProperty('admissions')
    expect(await h.run(chain)).toEqual(result)
    expect(h.admission).toHaveBeenCalledTimes(1)
  } finally {
    await h.close()
  }
})

test('cancellation releases the barrier even when another actual contribution has not stopped', async () => {
  const h = await batchHost()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    stop = new AbortController()
  h.register()
  h.registry.registerBuiltin('example:slow', async input => {
    if (input.position === 'before_action' && input.subject.call.callId === 'a') {
      entered.resolve()
      await release.promise
    }
    return { kind: 'output', value: { kind: 'observed' } }
  })
  try {
    const result = h.run([piece('example:slow', 'observe'), piece()], stop.signal)
    await entered.promise
    stop.abort()
    expect(await result).toEqual({ failure: 'cancelled' })
    expect(h.admission).not.toHaveBeenCalled()
  } finally {
    release.resolve()
    await h.close()
  }
})

test('one source failure releases candidates already waiting for admission', async () => {
  const h = await batchHost()
  h.register()
  const open = h.scope.ports.openHandles
  let calls = 0
  vi.spyOn(h.scope.ports, 'openHandles').mockImplementation(async (...args) =>
    ++calls === 1 ? { unavailable: true } : open(...args),
  )
  try {
    expect(await h.run()).toEqual({ failure: 'unavailable' })
    expect(h.admission).not.toHaveBeenCalled()
  } finally {
    await h.close()
  }
})

test('an absent contribution records the actual official fallback and returns no token', async () => {
  const h = await batchHost()
  try {
    const result = await h.run()
    expect(result).toMatchObject({
      gate: { kind: 'missing', reason: 'contribution' },
      results: [{ effect: { kind: 'vetoed' } }, { effect: { kind: 'vetoed' } }],
    })
    if ('failure' in result) throw new Error(result.failure)
    expect(result.admissions?.some(item => item.token !== undefined)).toBe(false)
    expect(result.results.every(item => item.conclusions[0]?.skipped === 'unavailable')).toBe(true)
  } finally {
    await h.close()
  }
})

test('an absent official definition stays explicit without inventing a chain or conclusion', async () => {
  const h = await batchHost()
  h.register()
  try {
    const result = await h.run([])
    expect(result).toMatchObject({
      gate: { kind: 'missing', reason: 'chain' },
      chain: [],
      results: [{ conclusions: [] }, { conclusions: [] }],
    })
    expect(h.admission).not.toHaveBeenCalled()
    if ('failure' in result) throw new Error(result.failure)
    expect(result.admissions?.some(item => item.token !== undefined)).toBe(false)
  } finally {
    await h.close()
  }
})

test('a real all-unparseable batch checks the gate without creating a fake pass or empty admit', async () => {
  const h = await batchHost([toolCall('a', 'echo', true)])
  try {
    expect(await h.run()).toEqual({
      gate: { kind: 'missing', reason: 'contribution' },
      chain: [piece()],
      results: [],
      admissions: [],
    })
    h.register()
    expect(await h.run()).toEqual({
      gate: { kind: 'available' },
      chain: [piece()],
      results: [],
      admissions: [],
    })
    expect(h.admission).not.toHaveBeenCalled()
    const read = await h.entries()
    expect('entries' in read && read.entries).toHaveLength(0)
  } finally {
    await h.close()
  }
})

test('an unlisted name is excluded from judgment while its sibling receives a formal token', async () => {
  const h = await batchHost([toolCall('a', 'unknown'), toolCall('b')])
  h.register()
  try {
    const result = await h.run()
    expect(h.captured[0]?.map(item => item.call.callId)).toEqual(['b'])
    expect(result).toMatchObject({
      results: [{ effect: { kind: 'proceed' } }, { effect: { kind: 'proceed' } }],
    })
    if ('failure' in result) throw new Error(result.failure)
    expect(result.admissions?.[0]).not.toHaveProperty('token')
    expect(result.admissions?.[1]).toHaveProperty('token')
  } finally {
    await h.close()
  }
})

test('a judgment failure vetoes every candidate with visible error facts', async () => {
  const h = await batchHost()
  h.admission.mockResolvedValue({ kind: 'failed', reason: 'unavailable' })
  h.register()
  try {
    const result = await h.run()
    expect(result).toMatchObject({
      results: [{ effect: { kind: 'vetoed' } }, { effect: { kind: 'vetoed' } }],
    })
    if ('failure' in result) throw new Error(result.failure)
    expect(result.results.every(item => item.conclusions[0]?.skipped === 'errored')).toBe(true)
    expect(result.admissions?.some(item => item.token !== undefined)).toBe(false)
  } finally {
    await h.close()
  }
})

test('withdrawal during the real contribution invalidates its returned decisions for the entire round', async () => {
  const h = await batchHost()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const original = h.admission.getMockImplementation()!
  h.admission.mockImplementation(async (...args) => {
    const result = await original(...args)
    entered.resolve()
    await release.promise
    return result
  })
  const withdraw = h.register()
  try {
    const work = h.run()
    await entered.promise
    withdraw()
    release.resolve()
    const result = await work
    expect(result).toMatchObject({
      results: [{ effect: { kind: 'vetoed' } }, { effect: { kind: 'vetoed' } }],
    })
    if ('failure' in result) throw new Error(result.failure)
    expect(result.admissions?.some(item => item.token !== undefined)).toBe(false)
  } finally {
    release.resolve()
    await h.close()
  }
})

test('cancellation invalidates the captured pass before its contribution promise finishes', async () => {
  const h = await batchHost()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    stop = new AbortController()
  let record: AdmissionPassRecord | undefined
  h.admission.mockImplementation(async (access, scope, pass) => {
    const found = await h.passes.source.read(access, scope, pass)
    if (found.kind !== 'found') throw new Error('Expected actual pass')
    record = found.record
    entered.resolve()
    await release.promise
    return { kind: 'failed', reason: 'unavailable' }
  })
  h.register()
  try {
    const work = h.run(undefined, stop.signal)
    await entered.promise
    expect(record?.isActive()).toBe(true)
    stop.abort()
    expect(record?.isActive()).toBe(false)
    expect(await work).toEqual({ failure: 'cancelled' })
  } finally {
    release.resolve()
    await h.close()
  }
})

for (const permission of [
  'unavailable',
  {
    capability: { category: 'tool', name: 'example:echo' },
    item: 'execute',
    value: { allowed: ['auto'] },
    from: 'tenant',
  },
])
  test('unavailable permission evidence does not become a default tier', async () => {
    const h = await batchHost(undefined, { echo: permission })
    h.register()
    try {
      const result = await h.run()
      expect(result).toMatchObject({
        results: [{ effect: { kind: 'vetoed' } }, { effect: { kind: 'vetoed' } }],
      })
      expect(h.admission).not.toHaveBeenCalled()
      if ('failure' in result) throw new Error(result.failure)
      expect(result.results.every(item => item.conclusions[0]?.skipped === 'unavailable')).toBe(
        true,
      )
    } finally {
      await h.close()
    }
  })

test('not_in_composition remains a candidate with no invented tenantAutoWritable', async () => {
  const h = await batchHost(undefined, { echo: 'not_in_composition' })
  h.admission.mockImplementation(async (_access, _scope, _pass, batch) => {
    expect(
      batch.every(
        item =>
          item.effectivePermission === 'not_in_composition' &&
          !Object.hasOwn(item, 'tenantAutoWritable'),
      ),
    ).toBe(true)
    return {
      kind: 'decisions',
      results: [
        { kind: 'deny', reason: 'not_held' },
        { kind: 'deny', reason: 'not_held' },
      ],
    }
  })
  h.register()
  try {
    const result = await h.run()
    expect(h.admission).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      results: [
        { conclusions: [{ output: { kind: 'veto', reason: 'not_held' } }] },
        { conclusions: [{ output: { kind: 'veto', reason: 'not_held' } }] },
      ],
    })
  } finally {
    await h.close()
  }
})

test('more than one permission tier is an unreadable source, never a chosen default', async () => {
  const h = await batchHost(undefined, {
    echo: {
      capability: { category: 'tool', name: 'example:echo' },
      item: 'execute',
      value: { allowed: ['auto', 'ask'] },
      from: 'tenant',
      tenantAutoWritable: true,
    },
  })
  h.register()
  try {
    expect(await h.run()).toEqual({ failure: 'unavailable' })
    expect(h.admission).not.toHaveBeenCalled()
  } finally {
    await h.close()
  }
})
