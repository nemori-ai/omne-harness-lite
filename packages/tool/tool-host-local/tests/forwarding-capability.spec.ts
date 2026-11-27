import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { toolsCapabilityOf, type ToolInvokeOutcome } from '@omne-harness/tool-contract'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { createLocalToolForwarding } from '@omne-harness/tool-host-local'
import { forwardingFixture } from './forwarding-values.ts'

const scope = (signal = new AbortController().signal): ToolExecutionScope => ({
  limits: {
    authorBufferBytes: 1024,
    authorBufferItems: 4,
    authorWaitHistoryBytes: 1024,
    authorWaitHistoryItems: 4,
  },
  context: {
    mode: 'managed',
    signal,
    body: {
      begin: async () => fail({ kind: 'unavailable', operation: 'begin', reason: 'unused' }),
      append: async () => fail({ kind: 'unavailable', operation: 'append', reason: 'unused' }),
      seal: async () => fail({ kind: 'unavailable', operation: 'seal', reason: 'unused' }),
      inspect: async () => fail({ kind: 'unavailable', operation: 'inspect', reason: 'unused' }),
    },
    emit: async () => fail({ kind: 'closed', reason: 'unused' }),
    wait: async () => fail({ kind: 'closed', reason: 'unused' }),
  },
  finish: async () => succeed(undefined),
})
it('returns within the attempt budget, closes its attachment, and drains a late admission without stopping it', async () => {
  const f = await forwardingFixture()
  const delayed = Promise.withResolvers<ToolInvokeOutcome>()
  let invoked = 0
  const provider = createLocalToolForwarding({
    attemptMs: 10,
    runtime: () => undefined,
    catalog: () => undefined,
    reader: () => undefined,
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => succeed(f.target),
    forwarding: () => ({
      resume: async () => ({ kind: 'association-unknown' }),
      invoke: async () => {
        invoked++
        return delayed.promise
      },
    }),
  })
  const attached = provider.bind(f.parent, scope())
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  expect(await capability.execute(f.intent)).toEqual({
    kind: 'association-unknown',
    parent: f.reference,
  })
  expect(invoked).toBe(1)
  await attached.finish('returned')
  expect(toolsCapabilityOf(attached.context)).toBeUndefined()
  expect(await capability.execute(f.intent)).toMatchObject({ kind: 'rejected' })
  let drained = false
  const closing = provider.close().then(result => {
    drained = true
    return result
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(drained).toBe(false)
  delayed.resolve({ kind: 'commit-unknown', reference: f.reference })
  await expect(closing).resolves.toMatchObject({ pending: 0 })
  expect(invoked).toBe(1)
})
it('aborting during accepted target preparation ends only the author wait and drains the original work', async () => {
  const f = await forwardingFixture()
  const gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  let invoked = 0
  const abort = new AbortController()
  const provider = createLocalToolForwarding({
    attemptMs: 250,
    runtime: () => undefined,
    catalog: () => undefined,
    reader: () => undefined,
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => {
      entered.resolve()
      await gate.promise
      return succeed(f.target)
    },
    forwarding: () => ({
      resume: async () => ({ kind: 'association-unknown' }),
      invoke: async input => {
        expect(input.intent).toEqual(f.intent)
        invoked++
        return { kind: 'association-unknown' }
      },
    }),
  })
  const attached = provider.bind(f.parent, scope(abort.signal))
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  const supplied = { ...f.intent }
  const answer = capability.execute(supplied)
  await entered.promise
  supplied.name = 'retargeted-after-acceptance'
  abort.abort()
  await expect(answer).resolves.toEqual({ kind: 'association-unknown', parent: f.reference })
  await attached.finish('returned')
  let drained = false
  const closing = provider.close().then(value => {
    drained = true
    return value
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(drained).toBe(false)
  gate.resolve()
  await closing
  expect(invoked).toBe(1)
})
it('reads the current catalog and returns a command-tool overview without asking for command usage', async () => {
  const f = await forwardingFixture()
  let usages = 0,
    profiles = 0
  const known = f.parent.request.availability
  const profile = {
    capabilities: { owner: 'consumer', record: 'profile', revision: '1', digest: 'sha256:profile' },
    conversion: null,
    attachmentAccess: {
      owner: 'consumer',
      record: 'attachments',
      revision: '1',
      digest: 'sha256:attachments',
    },
  }
  const asked: string[] = []
  const provider = createLocalToolForwarding({
    attemptMs: 20,
    runtime: () => undefined,
    forwarding: () => undefined,
    reader: () => undefined,
    consumer: async () => {
      profiles++
      return succeed(profile)
    },
    prepareTarget: async () => succeed(f.target),
    catalog: () => ({
      search: async input => {
        expect(input.consumer).toEqual(profile)
        asked.push(input.invocation)
        expect(input).not.toHaveProperty('programmable')
        return succeed({ entries: [{ ...known, resident: true }], next: null })
      },
      inspect: async () => succeed(known),
      inspectEach: async () => succeed([succeed(known)]),
      usage: async () => {
        usages++
        return fail({ kind: 'denied', action: 'usage' })
      },
    }),
  })
  const attached = provider.bind(f.parent, scope())
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  expect(await capability.inspect({ name: 'Tools', command: null })).toEqual(
    succeed({ ...known, usage: null }),
  )
  expect(usages).toBe(0)
  expect(await capability.search({ query: 'tools', after: null, limit: 5 })).toMatchObject({
    ok: { entries: [{ resident: true }] },
  })
  expect(profiles).toBe(2)
  // TL-75: the condition of a search becomes the catalog's own filter for what a program can call.
  await capability.search({ query: 'tools', after: null, limit: 5, programmable: true })
  expect(asked).toEqual([f.parent.request.invocation.kind, 'programmatic'])
  expect(profiles).toBe(3)
  await attached.finish('returned')
  expect(await capability.search({ query: '', after: null, limit: 5 })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(profiles).toBe(3)
  await provider.close()
})
it('clears unknown responsibility using the original parent when another Tools call resumes it', async () => {
  const f = await forwardingFixture()
  let recovered = false
  const provider = createLocalToolForwarding({
    attemptMs: 100,
    runtime: () => undefined,
    catalog: () => undefined,
    reader: () => undefined,
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => succeed(f.target),
    forwarding: () => ({
      resume: async () =>
        recovered
          ? { kind: 'accepted', reference: f.reference, state: f.call.state, recovered: true }
          : { kind: 'association-unknown' },
      invoke: async () => ({ kind: 'commit-unknown', reference: f.reference }),
    }),
  })
  const first = provider.bind(f.parent, scope())
  const executing = toolsCapabilityOf(first.context)
  if (executing === undefined) throw new Error('missing attachment')
  expect(await executing.execute(f.intent)).toMatchObject({
    kind: 'pending',
    reason: 'commit-unknown',
  })
  await first.finish('returned')
  recovered = true
  const reading = provider.bind(
    {
      ...f.parent,
      request: {
        ...f.parent.request,
        consumer: { ...f.parent.request.consumer, position: 'reader-call' },
      },
    },
    scope(),
  )
  const reader = toolsCapabilityOf(reading.context)
  if (reader === undefined) throw new Error('missing attachment')
  const result = await reader.readResult({
    kind: 'forwarding',
    reference: f.reference,
    after: null,
  })
  expect(result).toMatchObject({
    content: [
      {
        kind: 'text',
        text: JSON.stringify({
          kind: 'pending',
          reference: f.reference,
          parent: f.reference,
          reason: 'waiting',
        }),
      },
    ],
  })
  await reading.finish('returned')
  expect(await provider.close()).toEqual({ pending: 0, unknown: 0 })
})

it('keeps a timed-out invocation lookup pending at the same target reference without forwarding', async () => {
  const f = await forwardingFixture()
  const lookup = Promise.withResolvers<void>()
  let resumed = 0
  const provider = createLocalToolForwarding({
    attemptMs: 10,
    runtime: () => ({
      queries: {
        lookup: async () => {
          await lookup.promise
          return fail({ kind: 'unavailable', dependency: 'test-lookup', diagnostic: 'offline' })
        },
      },
    }),
    catalog: () => undefined,
    reader: () => undefined,
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => succeed(f.target),
    forwarding: () => ({
      resume: async () => {
        resumed++
        return { kind: 'association-unknown' }
      },
      invoke: async () => ({ kind: 'association-unknown' }),
    }),
  })
  const attached = provider.bind(f.parent, scope())
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  try {
    expect(
      await capability.readResult({ kind: 'invocation', reference: f.reference, after: null }),
    ).toMatchObject({
      content: [
        {
          kind: 'text',
          text: JSON.stringify({ kind: 'pending', reference: f.reference, reason: 'waiting' }),
        },
      ],
    })
    expect(resumed).toBe(0)
  } finally {
    lookup.resolve()
    await attached.finish('returned')
    await provider.close()
  }
})

it.each(['execute', 'forwarding-read'] as const)(
  'drains a late definite failure from %s while retaining its externally issued unknown parent reference',
  async operation => {
    const f = await forwardingFixture()
    const gate = Promise.withResolvers<void>()
    let invoked = 0
    const provider = createLocalToolForwarding({
      attemptMs: 10,
      runtime: () => undefined,
      catalog: () => undefined,
      reader: () => undefined,
      consumer: async () => fail({ kind: 'denied', action: 'unused' }),
      prepareTarget: async () => {
        await gate.promise
        return fail({ kind: 'denied', action: 'admit' })
      },
      forwarding: () => ({
        resume: async () => {
          if (operation === 'forwarding-read') {
            await gate.promise
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          }
          return { kind: 'association-unknown' }
        },
        invoke: async () => {
          invoked++
          return { kind: 'association-unknown' }
        },
      }),
    })
    const attached = provider.bind(f.parent, scope())
    const capability = toolsCapabilityOf(attached.context)
    if (capability === undefined) throw new Error('missing attachment')
    try {
      if (operation === 'execute')
        expect(await capability.execute(f.intent)).toEqual({
          kind: 'association-unknown',
          parent: f.reference,
        })
      else
        expect(
          await capability.readResult({ kind: 'forwarding', reference: f.reference, after: null }),
        ).toMatchObject({
          content: [
            {
              kind: 'text',
              text: JSON.stringify({ kind: 'association-unknown', parent: f.reference }),
            },
          ],
        })
      await attached.finish('returned')
      let drained = false
      const closing = provider.close().then(value => {
        drained = true
        return value
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(drained).toBe(false)
      gate.resolve()
      expect(await closing).toEqual({ pending: 0, unknown: 1 })
      expect(invoked).toBe(0)
      expect(await f.source.forwarding.lookup({ ...f.parent, reference: f.reference })).toEqual({
        ok: { kind: 'unresolved' },
      })
    } finally {
      gate.resolve()
      await attached.finish('returned')
      await provider.close()
    }
  },
)

// C102: an accepted target that settles within the attempt bound comes back as its result; one that does not stays pending.
it.each([
  ['settles after two looks', 2, 'completed'],
  ['never settles', Number.POSITIVE_INFINITY, 'pending'],
] as const)(
  'execute waits within attemptMs for a target that %s (SPEC execute, C102)',
  async (_label, running, kind) => {
    const f = await forwardingFixture()
    let looks = 0
    let presented = 0
    const provider = createLocalToolForwarding({
      attemptMs: 60,
      runtime: () => ({
        queries: {
          lookup: async () => {
            looks += 1
            const state = looks > running ? f.call.state : { ...f.call.state, phase: 'running' }
            return succeed({ kind: 'found', state })
          },
        },
      }),
      catalog: () => undefined,
      reader: () => ({
        present: async () => 'presented',
        read: async () => fail({ kind: 'unused' }),
      }),
      consumer: async () => fail({ kind: 'denied', action: 'unused' }),
      prepareTarget: async () => succeed(f.target),
      forwarding: () => ({
        resume: async () => ({ kind: 'association-unknown' }),
        invoke: async () => ({ kind: 'accepted', reference: f.reference, state: f.call.state }),
        presented: () => {
          presented += 1
        },
      }),
    } as never)
    const attached = provider.bind(f.parent, scope())
    const capability = toolsCapabilityOf(attached.context)
    if (capability === undefined) throw new Error('missing attachment')
    const answer = await capability.execute(f.intent)
    expect(answer.kind).toBe(kind)
    if (kind === 'completed')
      expect(answer).toMatchObject({ reference: f.reference, value: 'presented' })
    else expect(answer).toMatchObject({ reference: f.reference, reason: 'waiting' })
    expect(looks).toBeGreaterThan(kind === 'completed' ? 2 : 1)
    // Only a result brought back lets the parent release its copy; a pending one keeps it for read_result.
    expect(presented).toBe(kind === 'completed' ? 1 : 0)
    await attached.finish('returned')
    await provider.close()
  },
)

it('a target that went to the background is answered as background at once, not looked at again until the bound (C102)', async () => {
  const f = await forwardingFixture()
  let looks = 0
  const provider = createLocalToolForwarding({
    attemptMs: 60,
    runtime: () => ({
      queries: {
        lookup: async () => {
          looks += 1
          const foreground = { kind: 'background' } as never
          return succeed({
            kind: 'found',
            state: { ...f.call.state, phase: 'running', foreground },
          })
        },
      },
    }),
    catalog: () => undefined,
    reader: () => ({
      present: async () => 'presented',
      read: async () => fail({ kind: 'unused' }),
    }),
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => succeed(f.target),
    forwarding: () => ({
      resume: async () => ({ kind: 'association-unknown' }),
      invoke: async () => ({ kind: 'accepted', reference: f.reference, state: f.call.state }),
    }),
  } as never)
  const attached = provider.bind(f.parent, scope())
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  expect(await capability.execute(f.intent)).toMatchObject({
    kind: 'pending',
    reference: f.reference,
    reason: 'background',
  })
  expect(looks).toBe(1)
  await attached.finish('returned')
  await provider.close()
})

it('a target that settles between the last look and the bound is still brought back: at the bound it gets one more look (C102)', async () => {
  const f = await forwardingFixture()
  let settled = false
  let presented = 0
  setTimeout(() => (settled = true), 26)
  const provider = createLocalToolForwarding({
    attemptMs: 30,
    runtime: () => ({
      queries: {
        lookup: async () =>
          succeed({
            kind: 'found',
            state: settled ? f.call.state : { ...f.call.state, phase: 'running' },
          }),
      },
    }),
    catalog: () => undefined,
    reader: () => ({
      present: async () => 'presented',
      read: async () => fail({ kind: 'unused' }),
    }),
    consumer: async () => fail({ kind: 'denied', action: 'unused' }),
    prepareTarget: async () => succeed(f.target),
    forwarding: () => ({
      resume: async () => ({ kind: 'association-unknown' }),
      invoke: async () => ({ kind: 'accepted', reference: f.reference, state: f.call.state }),
      presented: () => {
        presented += 1
      },
    }),
  } as never)
  const attached = provider.bind(f.parent, scope())
  const capability = toolsCapabilityOf(attached.context)
  if (capability === undefined) throw new Error('missing attachment')
  expect(await capability.execute(f.intent)).toMatchObject({
    kind: 'completed',
    value: 'presented',
  })
  expect(presented).toBe(1)
  await attached.finish('returned')
  await provider.close()
})
