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
  it('is tool major 1 with four login reads and one observation, each counted as access', () => {
    expect(toolProtocol.name).toBe('tool')
    expect(toolProtocol.major).toBe(1)
    expect(Object.keys(toolProtocol.operations).sort()).toEqual([
      'list-call-children',
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
    expect(readSample(read.body, { tenant }).ok).toBe(false)
    expect(readSample(read.body, { tenant, reference: '' }).ok).toBe(false)
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
    ).toMatchObject({ ok: false })
    expect(
      readSample(read.outcomes.succeeded, {
        call: { ...call, controls: [{ ...call.controls[0], progress: 'done' }] },
      }),
    ).toMatchObject({ ok: false })
  })
})

describe('read-call-result', () => {
  const read = toolProtocol.operations['read-call-result']

  it('reads one result version a page at a time', () => {
    expectRoundTrip(read.body, { tenant, reference, result: 'tres_1', cursor: null })
    expectRoundTrip(read.body, { tenant, reference, result: 'tres_1', cursor: 'page-2' })
    expect(readSample(read.body, { tenant, reference, cursor: null }).ok).toBe(false)
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
    expect(readSample(observe.frame, { kind: 'refreshing' }).ok).toBe(false)
  })
})

describe('list-call-children', () => {
  const list = toolProtocol.operations['list-call-children']
  const item = {
    ordinal: 0,
    tool: 'Files',
    command: 'read',
    preview: 'read a.txt',
    state: 'completed',
    child: reference,
  }

  it('names the parent by its reference with a cursor that may be null', () => {
    expectRoundTrip(list.body, { tenant, reference, cursor: null })
    expectRoundTrip(list.body, { tenant, reference, cursor: '49' })
    expect(readSample(list.body, { tenant, reference }).ok).toBe(false)
    expect(readSample(list.body, { tenant, cursor: null }).ok).toBe(false)
  })

  it('answers a page of positions: ordinal, tool, command, preview, one state word and the child reference', () => {
    expectRoundTrip(list.outcomes.succeeded, { items: [], next: null })
    expectRoundTrip(list.outcomes.succeeded, {
      items: [
        item,
        { ...item, ordinal: 3, command: null, preview: '', state: 'waiting', child: null },
      ],
      next: '3',
    })
    const page = (changed: object) => ({ items: [{ ...item, ...changed }], next: null })
    expect(readSample(list.outcomes.succeeded, page({ state: 'paused' })).ok).toBe(false)
    expect(readSample(list.outcomes.succeeded, page({ ordinal: -1 })).ok).toBe(false)
    expect(readSample(list.outcomes.succeeded, page({ ordinal: 'one' })).ok).toBe(false)
    expect(readSample(list.outcomes.succeeded, page({ tool: '' })).ok).toBe(false)
  })

  it.each([
    'queued',
    'running',
    'waiting',
    'background',
    'completed',
    'failed',
    'denied',
    'stopped',
    'unknown',
  ])('carries the state word %s', state => {
    expectRoundTrip(list.outcomes.succeeded, { items: [{ ...item, state }], next: null })
  })
})
