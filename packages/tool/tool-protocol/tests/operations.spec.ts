import { describe, expect, it } from 'vitest'
import { toolProtocol } from '@omne-harness/tool-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']
const reference = 'tool-invocation:v1:call:admission'
const call = {
  phase: 'running',
  relation: 'background',
  result: null,
  terminal: null,
  effect: 'unknown',
  controls: [{ operation: 'top_1', intent: 'stop', progress: 'accepted' }],
}

describe('tool/v1', () => {
  it('is tool major 1 with three login reads and one observation, each counted as access', () => {
    expect(toolProtocol.name).toBe('tool')
    expect(toolProtocol.major).toBe(1)
    expect(Object.keys(toolProtocol.operations).sort()).toEqual([
      'read-call',
      'read-call-output',
      'read-call-result',
    ])
    expect(Object.keys(toolProtocol.observations)).toEqual(['observe-call'])
    for (const operation of Object.values(toolProtocol.operations)) {
      expect([operation.identity, operation.effect, operation.limit]).toEqual([
        'login',
        'read',
        'small',
      ])
      expect(operation.countsAsAccess).toBe(true)
      expect(Object.keys(operation.outcomes).sort()).toEqual([...always].sort())
    }
    const observe = toolProtocol.observations['observe-call']
    expect([observe.identity, observe.ends, observe.countsAsAccess]).toEqual([
      'login',
      ['closed', 'stale-instance'],
      true,
    ])
  })
})

describe('read-call', () => {
  const read = toolProtocol.operations['read-call']

  it('names one call by its reference and answers its phase, relation, terminal, effect and controls', () => {
    expectRoundTrip(read.body, { tenant, reference })
    expect(readSample(read.body, { tenant })).toEqual({ ok: false })
    expect(readSample(read.body, { tenant, reference: '' })).toEqual({ ok: false })
    expectRoundTrip(read.outcomes.succeeded, { call })
    expectRoundTrip(read.outcomes.succeeded, {
      call: {
        ...call,
        phase: 'settled',
        result: 'tres_1',
        terminal: { kind: 'failed', detail: 'exit 2' },
        effect: 'occurred',
        controls: [],
      },
    })
    expect(
      readSample(read.outcomes.succeeded, { call: { ...call, relation: 'detached' } }),
    ).toEqual({ ok: false })
    expect(
      readSample(read.outcomes.succeeded, {
        call: { ...call, controls: [{ ...call.controls[0], progress: 'done' }] },
      }),
    ).toEqual({ ok: false })
  })
})

describe('read-call-result', () => {
  const read = toolProtocol.operations['read-call-result']

  it('reads one result version a page at a time', () => {
    expectRoundTrip(read.body, { tenant, reference, result: 'tres_1', cursor: null })
    expectRoundTrip(read.body, { tenant, reference, result: 'tres_1', cursor: 'page-2' })
    expect(readSample(read.body, { tenant, reference, cursor: null })).toEqual({ ok: false })
    expectRoundTrip(read.outcomes.succeeded, {
      result: 'tres_1',
      terminal: { kind: 'completed', detail: null },
      effect: 'not-occurred',
      content: [{ kind: 'text', text: 'done' }],
      next: null,
    })
  })
})

describe('observe-call', () => {
  const observe = toolProtocol.observations['observe-call']

  it('opens on a reference and streams a snapshot, deltas and gaps', () => {
    expectRoundTrip(observe.open, { tenant, reference })
    expectRoundTrip(observe.frame, { kind: 'snapshot', call, process: [] })
    expectRoundTrip(observe.frame, { kind: 'delta', call, process: [{ index: '0' }] })
    expectRoundTrip(observe.frame, { kind: 'gap' })
    expect(readSample(observe.frame, { kind: 'refreshing' })).toEqual({ ok: false })
  })
})
