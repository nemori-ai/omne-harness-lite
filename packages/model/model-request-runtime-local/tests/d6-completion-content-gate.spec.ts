import { describe, expect, it } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import type { DiagnosticEvent } from '../src/diagnostics-types.ts'
import { adapter, deferred, policy, request } from './invoke-policy-fixture.ts'

function observed() {
  const events: DiagnosticEvent[] = []
  const emitter = () => ({
    record(event: DiagnosticEvent) {
      events.push(event)
      return { dropped: 'closed' as const }
    },
    close() {},
  })
  return { events, emitter }
}

describe('D6 S-63 first-content gate diagnostic stages', () => {
  it('records waiting then failed without claiming first content or visible blocks', async () => {
    const wire = adapter()
    const diagnostics = observed()
    const handle = invokeModel({
      ...request(),
      transport: wire.transport,
      credential: 'controlled-key',
      signal: new AbortController().signal,
      policy: policy(),
      diagnosticEmitterFactory: diagnostics.emitter,
      beforeFirstContent: async () => {
        throw new Error('controlled durable opened failure')
      },
    })
    const result = await handle.outcome
    if (!('outcome' in result)) throw new Error('sent invocation result missing')
    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { cause: 'unrecognized', localError: 'before_first_content' },
      blocks: [],
    })
    expect(result.timing.firstTokenAt).toBeUndefined()
    expect(handle.snapshot().firstContentAt).toBeUndefined()
    expect(
      handle
        .snapshot()
        .blocks.every(block => block.closed === false && block.content === undefined),
    ).toBe(true)
    expect(wire.sends()).toBe(1)
    expect(wire.reads()).toBe(1)
    expect(wire.stopped()).toBe(1)
    expect(
      diagnostics.events.filter(
        event => event.source === 'invocation' && event.stage === 'content_gate',
      ),
    ).toEqual([
      {
        source: 'invocation',
        stage: 'content_gate',
        outcome: 'waiting',
        facts: { kind: 'transport', gate: 'waiting' },
      },
      {
        source: 'invocation',
        stage: 'content_gate',
        outcome: 'failed',
        facts: { kind: 'transport', gate: 'failed' },
      },
    ])
    expect(diagnostics.events.some(event => event.stage === 'first_content')).toBe(false)
    expect(diagnostics.events.some(event => event.stage === 'stream_end')).toBe(true)
    expect(diagnostics.events.some(event => event.stage === 'reply_handoff')).toBe(true)
  })

  it('keeps a late accepted gate from publishing content after actual cancellation', async () => {
    const held = deferred()
    const wire = adapter()
    const diagnostics = observed()
    const handle = invokeModel({
      ...request(),
      transport: wire.transport,
      credential: 'controlled-key',
      signal: new AbortController().signal,
      policy: policy(),
      diagnosticEmitterFactory: diagnostics.emitter,
      beforeFirstContent: () => held.promise,
    })
    await expect
      .poll(() =>
        diagnostics.events.some(
          event => event.stage === 'content_gate' && event.outcome === 'waiting',
        ),
      )
      .toBe(true)
    handle.abort()
    held.resolve()
    const result = await handle.outcome
    if (!('outcome' in result)) throw new Error('sent invocation result missing')
    expect(result.outcome).toBe('interrupted')
    expect(result.blocks).toEqual([])
    expect(result.timing.firstTokenAt).toBeUndefined()
    expect(handle.snapshot().firstContentAt).toBeUndefined()
    expect(
      handle
        .snapshot()
        .blocks.every(block => block.closed === false && block.content === undefined),
    ).toBe(true)
    expect(wire.sends()).toBe(1)
    expect(wire.stopped()).toBe(1)
    expect(diagnostics.events.some(event => event.stage === 'first_content')).toBe(false)
    expect(
      diagnostics.events.some(
        event => event.stage === 'content_gate' && event.outcome === 'accepted',
      ),
    ).toBe(false)
  })
})
