import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { completedFinal, createMemoryToolOutputCustody } from '@omne-harness/tool-contract/testing'
import type {
  ToolExecutionScope,
  ToolFinalEnvelope,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createRuntimeAuthorExecution } from '../src/runtime-author.ts'
import { createLiveAuthorExecution } from '../src/live-author-execution.ts'
import { authorAccess, authorModule, loadAuthor, settings, unbox } from './author-values.ts'
import {
  adoption,
  callId,
  evidence,
  instanceId,
  operationId,
  request,
} from './coordinator-values.ts'
import { configuration } from './runtime-composition/fixture.ts'
import { unavailableBodyWrites } from './body-writer-values.ts'

// Memory custody and the final receipt are provider doubles; these cases prove ordering, not durability.
async function setup(closing: ReturnType<ToolExecutionScope['finish']>, holdRaw = false) {
  const loaded = unbox(await loadAuthor(authorModule(async () => 'unused')))
  const registration = readToolRegistration(loaded.implementation)
  if (registration?.kind !== 'function' || registration.operation.author.kind !== 'ordinary')
    throw new Error('ordinary function fixture required')
  const original = registration.operation
  const operation = {
    ...original,
    author: {
      ...original.author,
      codec: {
        adoption: original.author.codec.adoption,
        encode: (value: unknown) => succeed(new TextEncoder().encode(JSON.stringify(value))),
        decode: (bytes: Uint8Array) => succeed(JSON.parse(new TextDecoder().decode(bytes))),
      },
    },
  }
  const call = callId('return-order')
  const start = {
    kind: 'start' as const,
    executor: loaded.executor,
    operation: operationId('start-return-order'),
    execution: { tenant: authorAccess.tenant, call, instance: instanceId, generation: '1' },
  }
  const execution = createLiveAuthorExecution({ start, release() {} })
  const custody = createMemoryToolOutputCustody<unknown>()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const finals: ToolFinalEnvelope<ToolMessageContentBlock>[] = []
  const runtime = createRuntimeAuthorExecution({
    bodyWrites: unavailableBodyWrites,
    configuration,
    custody: {
      inspect: custody.inspect,
      async preserve(input) {
        entered.resolve()
        if (holdRaw) await release.promise
        return custody.preserve(input)
      },
    },
    finalCustody: {
      async preserveFinal(input) {
        finals.push(input.final)
        return succeed({
          ...completedFinal(),
          raw: input.final.raw,
          terminal: input.final.terminal,
          effect: input.final.effect,
        })
      },
    },
  })
  const access = { ...authorAccess, call }
  const rawInput = { ...access, operation: operationId(`${start.operation}/raw`) }
  const pending = runtime.settle({
    ...access,
    start,
    request: request({
      availability: {
        kind: 'available',
        definition: loaded.definition,
        executor: loaded.executor,
        layer: loaded.key.layer,
      },
      settings,
    }),
    operation,
    arguments: {},
    outcome: { kind: 'returned', value: 'original-business-receipt' },
    closing,
    execution,
  })
  const read = async () => {
    const found = unbox(await custody.inspect(rawInput))
    if (found.kind !== 'retained') return found.kind
    return JSON.parse(new TextDecoder().decode(await custody.controls.readBytes(found.raw)))
  }
  const stop = () =>
    execution.live.stop({
      ...access,
      start,
      operation: operationId('stop-return-order'),
      adoption: adoption('stop-return-order'),
      inputDigest: 'stop-return-order',
      intent: { kind: 'stop' },
      source: evidence('stop-return-order'),
    })
  return {
    runtime,
    pending,
    entered: entered.promise,
    release: release.resolve,
    finals,
    read,
    stop,
  }
}

it('keeps the original readable while closing is pending and publishes no final early', async () => {
  const closing = Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
  const f = await setup(closing.promise)
  try {
    await expect.poll(f.read).toBe('original-business-receipt')
    expect(f.finals).toEqual([])
    closing.resolve(succeed(undefined))
    expect(await f.pending).toHaveProperty('ok.terminal.kind', 'completed')
  } finally {
    closing.resolve(succeed(undefined))
    f.runtime.close()
  }
})

it('keeps the returned bytes when a confirmed closing fault produces a failed final', async () => {
  const f = await setup(Promise.resolve(fail({ kind: 'invalid', reason: 'open author wait' })))
  try {
    expect(await f.pending).toHaveProperty('ok.terminal.kind', 'failed')
    expect(await f.read()).toBe('original-business-receipt')
    expect(f.finals[0]?.terminal).toEqual({
      kind: 'failed',
      cause: 'executor',
      diagnostic: 'open author wait',
    })
  } finally {
    f.runtime.close()
  }
})

it('preserves the original stop identity when cancellation wins closing during raw custody', async () => {
  const closing = Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
  const f = await setup(closing.promise, true)
  try {
    await f.entered
    unbox(await f.stop())
    closing.resolve(fail({ kind: 'cancelled', reason: 'original stop' }))
    f.release()
    expect(await f.pending).toHaveProperty('ok.terminal', {
      kind: 'interrupted',
      cause: { kind: 'control', operation: 'stop-return-order', withdrawn: false },
    })
    expect(await f.read()).toBe('original-business-receipt')
  } finally {
    f.release()
    f.runtime.close()
  }
})

it.each(['success', 'invalid'] as const)(
  'does not rewrite confirmed %s closing for a later stop during raw custody',
  async outcome => {
    const f = await setup(
      Promise.resolve(
        outcome === 'success'
          ? succeed(undefined)
          : fail({ kind: 'invalid', reason: 'open author wait' }),
      ),
      true,
    )
    try {
      await f.entered
      unbox(await f.stop())
      f.release()
      expect(await f.pending).toHaveProperty(
        'ok.terminal.kind',
        outcome === 'success' ? 'completed' : 'failed',
      )
    } finally {
      f.release()
      f.runtime.close()
    }
  },
)

it('keeps raw custody without publishing a final when closing responsibility is unknown', async () => {
  const f = await setup(
    Promise.resolve(fail({ kind: 'unknown', operation: 'finish', reason: 'lost closing reply' })),
  )
  try {
    expect(await f.pending).toHaveProperty('failure.dependency', 'author-scope')
    expect(await f.read()).toBe('original-business-receipt')
    expect(f.finals).toEqual([])
  } finally {
    f.runtime.close()
  }
})
