import { expect, it, vi } from 'vitest'
import { canonicalDigest } from '@omne-harness/tool'
import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { resolveToolInvocationRef, type ToolBodyWriter } from '@omne-harness/tool-contract'
import { adoption } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

it('binds the author body writer to its invocation without author-supplied identity', async () => {
  let bytes: string | undefined
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    unbox(
      await context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: '正文🙂',
        end: true,
      }),
    )
    const sealed = unbox(await context.body.seal('answer', '1'))
    bytes = sealed.bodyBytes
    expect(unbox(await context.body.inspect('answer'))).toEqual({ kind: 'sealed', body: sealed })
    return 'writer completed'
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('body-writer')))
    const result = await world.settled(reference)
    expect(result.terminal, JSON.stringify(result.terminal)).toEqual({ kind: 'completed' })
    expect(bytes).toBe('10')
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('recognizes a committed body close after its reply is lost without executing the author again', async () => {
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    unbox(
      await context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: 'saved',
        end: true,
      }),
    )
    unbox(await context.body.seal('answer', '1'))
    return 'original business receipt'
  })
  const commit = world.store.commit.bind(world.store)
  const closingReceipts = new Set<string>()
  let lostReply = false
  vi.spyOn(world.store, 'commit').mockImplementation(async input => {
    const closed = input.writes.flatMap(write =>
      write.kind === 'put' &&
      write.record.kind === 'body-writer-scope' &&
      write.record.scope.state.kind === 'closed'
        ? [write.record.scope.state]
        : [],
    )
    const answer = await commit(input)
    if (answer.kind === 'committed' && closed.length > 0) {
      for (const state of closed) closingReceipts.add(canonicalDigest(state))
      if (!lostReply) {
        lostReply = true
        return { kind: 'unknown', diagnostic: 'body close committed; response lost' }
      }
    }
    return answer
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('close-reply-lost')))
    const result = await world.settled(reference)
    expect(result.terminal, JSON.stringify(result.terminal)).toEqual({ kind: 'completed' })
    expect(lostReply).toBe(true)
    expect(closingReceipts.size).toBe(1)
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('keeps the return barrier pending until the closed writer inventory is recovered', async () => {
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    void context.body.append('answer', '1', {
      kind: 'text',
      block: 'one',
      text: 'pending seal',
      end: true,
    })
    void context.body.seal('answer', '1')
    return 'original business receipt'
  })
  let closed = false
  let fragment: string | undefined
  let recoveredAfterClose = false
  const commit = world.store.commit.bind(world.store)
  vi.spyOn(world.store, 'commit').mockImplementation(async input => {
    const answer = await commit(input)
    if (
      answer.kind === 'committed' &&
      input.writes.some(
        write =>
          write.kind === 'put' &&
          write.record.kind === 'body-writer-scope' &&
          write.record.scope.state.kind === 'closed',
      )
    )
      closed = true
    return answer
  })
  const write = world.input.materials.store.write.bind(world.input.materials.store)
  vi.spyOn(world.input.materials.store, 'write').mockImplementation(async input => {
    fragment ??= input.operation
    if (input.operation === fragment) {
      if (!closed)
        return {
          failure: {
            kind: 'unavailable',
            dependency: 'test-fragment',
            diagnostic: 'wait for close',
          },
        }
      recoveredAfterClose = true
    }
    return write(input)
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('close-pending-writes')))
    const result = await world.settled(reference)
    expect(result.terminal, JSON.stringify(result.terminal)).toEqual({ kind: 'completed' })
    expect(recoveredAfterClose).toBe(true)
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it.each(['stop', 'retire'] as const)(
  'ends close retry on %s while preserving the original closing identity',
  async mode => {
    const world = await fixture(async (_value, _environment, context) => {
      const representation = ordinaryReturnFixture(adoption('output')).body
      if (representation.kind !== 'text') throw new Error('text fixture required')
      unbox(await context.body.begin('answer', representation))
      unbox(
        await context.body.append('answer', '1', {
          kind: 'text',
          block: 'one',
          text: 'saved',
          end: true,
        }),
      )
      unbox(await context.body.seal('answer', '1'))
      return 'original business receipt'
    })
    const commit = world.store.commit.bind(world.store)
    const intents = new Set<string>()
    let attempts = 0
    let retiring = false
    vi.spyOn(world.store, 'commit').mockImplementation(async input => {
      for (const write of input.writes) {
        if (
          write.kind !== 'put' ||
          write.record.kind !== 'body-writer-scope' ||
          write.record.scope.state.kind !== 'closed'
        )
          continue
        const state = write.record.scope.state
        intents.add(
          canonicalDigest({ operation: state.operation, exit: state.exit, source: state.source }),
        )
        attempts++
        if (!retiring && world.signals.get('{"value":"retry-stop"}')?.aborted !== true)
          return { kind: 'unavailable', diagnostic: 'close provider temporarily unavailable' }
      }
      return commit(input)
    })
    try {
      const reference = accepted(await world.api.invoke(world.invocation('retry-stop')))
      await expect.poll(() => attempts).toBeGreaterThanOrEqual(2)
      if (mode === 'stop') {
        expect(
          await world.api.commands.control({ ...world.query(reference), intent: { kind: 'stop' } }),
        ).toHaveProperty('kind', 'committed')
        expect((await world.settled(reference)).terminal).toHaveProperty('kind', 'interrupted')
      } else {
        retiring = true
        await world.plugins.close()
      }
      expect(intents.size).toBe(1)
      expect(world.plugins.diagnostics().pendingBodyScopes).toBe(0)
      expect(world.launches()).toBe(1)
    } finally {
      retiring = true
      await world.close()
    }
  },
)

it('closes author body admission when the host retires before the author returns', async () => {
  const entered = Promise.withResolvers<ToolBodyWriter>()
  const release = Promise.withResolvers<void>()
  const representation = ordinaryReturnFixture(adoption('output')).body
  if (representation.kind !== 'text') throw new Error('text fixture required')
  const world = await fixture(async (_value, _environment, context) => {
    unbox(await context.body.begin('answer', representation))
    entered.resolve(context.body)
    await release.promise
    return 'late return'
  })
  try {
    accepted(await world.api.invoke(world.invocation('retire-body')))
    const writer = await entered.promise
    await world.plugins.close()
    expect(
      await writer.append('answer', '1', { kind: 'text', block: 'one', text: 'late', end: true }),
    ).toHaveProperty('failure.kind', 'cancelled')
    expect(await writer.begin('late', representation)).toHaveProperty('failure.kind', 'cancelled')
    expect(world.plugins.diagnostics().pendingBodyScopes).toBe(0)
    expect(world.launches()).toBe(1)
  } finally {
    release.resolve()
    await world.close()
  }
})

it('recovers a staged body append through the host driver without rerunning the author', async () => {
  let first: unknown
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    first = await context.body.append('answer', '1', {
      kind: 'text',
      block: 'one',
      text: 'recover me',
      end: true,
    })
    await expect
      .poll(async () => unbox(await context.body.inspect('answer')), { timeout: 1000 })
      .toMatchObject({ kind: 'open', confirmedThrough: '1' })
    unbox(await context.body.seal('answer', '1'))
    return 'recovered'
  })
  vi.spyOn(world.input.materials.store, 'write').mockImplementationOnce(async () => {
    throw new Error('material provider temporarily unavailable')
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('recover-body')))
    const result = await world.settled(reference)
    expect(first).toHaveProperty('failure.kind', 'unknown')
    expect(result.terminal, JSON.stringify(result.terminal)).toEqual({ kind: 'completed' })
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('settles author failure when an incomplete body cannot be sealed by recovery', async () => {
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    unbox(
      await context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: 'incomplete',
        end: false,
      }),
    )
    unbox(await context.body.seal('answer', '1'))
    return 'unreachable'
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('incomplete-body')))
    const result = await world.settled(reference)
    expect(result.terminal).toMatchObject({ kind: 'failed', cause: 'executor' })
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('settles author failure without waiting for an unused fragment provider to recover', async () => {
  const world = await fixture(async (_value, _environment, context) => {
    const representation = ordinaryReturnFixture(adoption('output')).body
    if (representation.kind !== 'text') throw new Error('text fixture required')
    unbox(await context.body.begin('answer', representation))
    unbox(
      await context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: 'discard me',
        end: true,
      }),
    )
    return 'unreachable'
  })
  let blocked: string | undefined
  const write = world.input.materials.store.write.bind(world.input.materials.store)
  vi.spyOn(world.input.materials.store, 'write').mockImplementation(async input => {
    blocked ??= input.operation
    return input.operation === blocked
      ? {
          failure: {
            kind: 'unavailable',
            dependency: 'test-fragment',
            diagnostic: 'fragment store unavailable',
          },
        }
      : write(input)
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('discard-body')))
    const result = await world.settled(reference)
    expect(result.terminal).toMatchObject({ kind: 'failed', cause: 'executor' })
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('does not let a stuck fragment recovery block an already failed author settlement', async () => {
  let entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const world = await fixture(
    async (_value, _environment, context) => {
      const representation = ordinaryReturnFixture(adoption('output')).body
      if (representation.kind !== 'text') throw new Error('text fixture required')
      unbox(await context.body.begin('answer', representation))
      void context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: 'stuck',
        end: true,
      })
      await entered.promise
      throw new Error('author failed after admitting the fragment')
    },
    undefined,
    1,
  )
  const blocked = new Map<string, string>()
  const attempts = new Map<string, number>()
  const write = world.input.materials.store.write.bind(world.input.materials.store)
  vi.spyOn(world.input.materials.store, 'write').mockImplementation(async input => {
    if (!blocked.has(input.call)) blocked.set(input.call, input.operation)
    if (input.operation === blocked.get(input.call)) {
      attempts.set(input.call, (attempts.get(input.call) ?? 0) + 1)
      entered.resolve()
      await release.promise
    }
    return write(input)
  })
  try {
    for (const key of ['stuck-body', 'next-stuck-body']) {
      const reference = accepted(await world.api.invoke(world.invocation(key)))
      const result = await world.settled(reference)
      expect(result.terminal).toMatchObject({ kind: 'failed', cause: 'executor' })
      await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
      expect(world.plugins.diagnostics().executor?.pendingBodyRecoveries).toBe(1)
      entered = Promise.withResolvers<void>()
    }
    expect([...attempts.values()]).toEqual([2, 1])
    expect(world.launches()).toBe(2)
  } finally {
    release.resolve()
    await world.close()
  }
})

it.each(['invoke', 'maintenance', 'denied', 'dependency'] as const)(
  'a replacement host recovers admitted body fragments via %s without attaching the old author',
  async trigger => {
    const returned = Promise.withResolvers<string>()
    const staged = Promise.withResolvers<ToolBodyWriter>()
    const world = await fixture(async (_value, _environment, context) => {
      const representation = ordinaryReturnFixture(adoption('output')).body
      if (representation.kind !== 'text') throw new Error('text fixture required')
      unbox(await context.body.begin('answer', representation))
      const append = await context.body.append('answer', '1', {
        kind: 'text',
        block: 'one',
        text: 'durable before replacement',
        end: true,
      })
      expect(append).toHaveProperty('failure.kind', 'unavailable')
      staged.resolve(context.body)
      return returned.promise
    })
    let available = false
    let recovered = false
    let attempts = 0
    const operations = new Set<string>()
    const payloads = new Set<string>()
    const write = world.input.materials.store.write.bind(world.input.materials.store)
    vi.spyOn(world.input.materials.store, 'write').mockImplementation(async input => {
      attempts++
      operations.add(input.operation)
      payloads.add(Buffer.from(input.bytes).toString('base64'))
      if (!available)
        return {
          failure: { kind: 'unavailable', dependency: 'test-fragment', diagnostic: 'offline' },
        }
      const answer = await write(input)
      if ('ok' in answer) recovered = true
      return answer
    })
    let next: Awaited<ReturnType<typeof world.newExecutor>> | null = null
    try {
      const request = world.invocation('replacement-writer')
      const reference = accepted(await world.api.invoke(request))
      const writer = await staged.promise
      if (trigger === 'dependency') {
        await world.external.dispose()
        expect(world.plugins.diagnostics().retired).toBe(true)
        expect(
          await writer.begin('late', { kind: 'text', codec: adoption('output') }),
        ).toHaveProperty('failure.kind', 'cancelled')
        expect(
          await writer.append('answer', '2', {
            kind: 'text',
            block: 'late',
            text: 'must not be admitted',
            end: true,
          }),
        ).toHaveProperty('failure.kind', 'cancelled')
      } else await world.plugins.close()
      const previousAttempts = attempts
      next = await world.newExecutor()
      const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
      const wake = { tenant: world.tenantA, call: parts.call }
      const restored = next
      if (trigger === 'denied') {
        world.revoke()
        available = true
        expect(await restored.plugins.recoverBodies(wake)).toHaveProperty('failure.kind', 'denied')
        expect(attempts).toBe(previousAttempts)
        expect(restored.plugins.diagnostics().executor?.knownCalls).toBe(0)
        return
      }
      const wakeOriginal = async () => {
        if (trigger === 'invoke')
          expect(accepted(await restored.api.invoke(request))).toBe(reference)
        else expect(await restored.plugins.recoverBodies(wake)).toEqual({ ok: { queued: true } })
      }
      await wakeOriginal()
      await expect.poll(() => attempts).toBeGreaterThan(previousAttempts)
      expect(next.plugins.diagnostics().executor?.knownCalls).toBe(1)
      await wakeOriginal()
      available = true
      await expect.poll(() => recovered).toBe(true)
      expect(operations.size).toBe(1)
      expect(payloads.size).toBe(1)
      expect(world.launches()).toBe(1)
      expect(
        unbox(await next.api.instances.current(world.streamQuery(reference))).current,
      ).toBeNull()
      await next.schedule(wake)
      await expect.poll(() => next?.plugins.diagnostics().executor?.knownCalls).toBe(0)
    } finally {
      returned.resolve('cleanup')
      await next?.close()
      await world.close()
    }
  },
)
