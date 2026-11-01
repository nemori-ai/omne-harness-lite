// The pure rules of cancelRun and stopCall over the lookups that the provider fills inside the
// transaction (FR-01: a missing item is unknown, never absence).
import { describe, expect, it } from 'vitest'
import {
  decide,
  type DecideReads,
  type RunId,
  type SessionCommand,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

const base = { compaction: null } satisfies DecideReads
const run = 'run_other' as RunId
const model = { kind: 'model' as const, call: 'm1' }
const unavailable = { kind: 'rejected', failure: { kind: 'unavailable', owner: 'session-history' } }

async function frame() {
  const s = await open()
  const snapshot = await s.read()
  const cancel = (reads: DecideReads, target = run) =>
    decide(
      snapshot,
      {
        kind: 'cancelRun',
        input: { ...s.base, operation: operationId('c'), run: target, urgency: 'graceful' },
      },
      [],
      null,
      reads,
    )
  const stop = (reads: DecideReads) =>
    decide(
      snapshot,
      { kind: 'stopCall', input: { ...s.base, operation: operationId('s'), producer: model } },
      [],
      null,
      reads,
    )
  return { s, snapshot, cancel, stop }
}

describe('cancelRun over DecideReads.runs', () => {
  it('a missing item, a stale cover and a double item are unknown', async () => {
    const f = await frame()
    expect(f.cancel(base)).toMatchObject(unavailable)
    expect(
      f.cancel({ ...base, runs: [{ kind: 'absent', run, covered: '0' as never }] }),
    ).toMatchObject(unavailable)
    const absent = { kind: 'absent' as const, run, covered: f.snapshot.revision }
    expect(f.cancel({ ...base, runs: [absent, absent] })).toMatchObject(unavailable)
    expect(
      f.cancel({ ...base, runs: [{ ...absent, run: 'run_unrelated' as RunId }] }),
    ).toMatchObject(unavailable)
  })

  it('a covered absence is not-found, a terminal is ended, and neither writes entries', async () => {
    const f = await frame()
    expect(
      f.cancel({ ...base, runs: [{ kind: 'absent', run, covered: f.snapshot.revision }] }),
    ).toEqual({ kind: 'control-answer', answer: { kind: 'not-found' }, source: f.snapshot.source })
    const terminal = { run, outcome: 'completed' as const, evidence: evidence('done') }
    expect(
      f.cancel({ ...base, runs: [{ kind: 'bound', run, bound: evidence('b'), terminal }] }),
    ).toEqual({
      kind: 'control-answer',
      answer: { kind: 'ended', terminal },
      source: terminal.evidence,
    })
  })

  it('a lookup that lacks the terminal of the snapshot is unknown, not a new failure kind', async () => {
    const f = await frame()
    const active = f.snapshot.run.kind === 'active' ? f.snapshot.run.run : run
    const terminal = {
      ...f.snapshot,
      run: {
        kind: 'terminal' as const,
        terminal: { run: active, outcome: 'cancelled' as const, evidence: evidence('x') },
      },
    }
    const decision = decide(
      terminal,
      {
        kind: 'cancelRun',
        input: { ...f.s.base, operation: operationId('c'), run: active, urgency: 'force' },
      },
      [],
      null,
      { ...base, runs: [{ kind: 'bound', run: active, bound: evidence('b'), terminal: null }] },
    )
    expect(decision).toMatchObject(unavailable)
  })

  it('an active bound Run is cancelled by entries', async () => {
    const f = await frame()
    const active = f.snapshot.run.kind === 'active' ? f.snapshot.run.run : run
    const decision = f.cancel(
      { ...base, runs: [{ kind: 'bound', run: active, bound: evidence('b'), terminal: null }] },
      active,
    )
    expect(decision.kind).toBe('entries')
  })
})

describe('stopCall over DecideReads.calls', () => {
  it('requires exactly one item of the same kind and call', async () => {
    const f = await frame()
    expect(f.stop(base)).toMatchObject(unavailable)
    const wrongKind = {
      kind: 'absent' as const,
      producer: { kind: 'tool' as const, call: 'm1' },
      covered: f.snapshot.revision,
    }
    expect(f.stop({ ...base, calls: [wrongKind] })).toMatchObject(unavailable)
    expect(
      f.stop({ ...base, calls: [{ kind: 'absent', producer: model, covered: '0' as never }] }),
    ).toMatchObject(unavailable)
  })

  it('answers not-found only for a covered absence and ended for a recorded end', async () => {
    const f = await frame()
    expect(
      f.stop({
        ...base,
        calls: [{ kind: 'absent', producer: model, covered: f.snapshot.revision }],
      }),
    ).toMatchObject({ kind: 'control-answer', answer: { kind: 'not-found' } })
    const terminal = {
      producer: model,
      version: '1',
      outcome: 'failed' as const,
      source: evidence('src'),
      recorded: evidence('rec'),
    }
    expect(
      f.stop({
        ...base,
        calls: [{ kind: 'bound', producer: model, bound: evidence('b'), terminal }],
      }),
    ).toMatchObject({
      kind: 'control-answer',
      answer: { kind: 'ended', terminal },
      source: terminal.source,
    })
  })

  it('refuses a Tool target as unsupported before any other input is read', async () => {
    const f = await frame()
    const tool: SessionCommand = {
      kind: 'stopCall',
      input: { ...f.s.base, operation: operationId('t'), producer: { kind: 'tool', call: 't' } },
    }
    const unsupported = { kind: 'rejected', failure: { kind: 'unsupported' } }
    expect(decide(f.snapshot, tool, [], null, base)).toEqual(unsupported)
    expect(decide(null, tool, [], null, base)).toEqual(unsupported)
  })
})

describe('format refusals are not saved as answers (r2.2 4.2)', () => {
  const invalid = { kind: 'rejected', failure: { kind: 'invalid' } }

  async function malformed() {
    const f = await frame()
    const active = f.snapshot.run.kind === 'active' ? f.snapshot.run.run : run
    const cancel = (target: string, urgency: string, reads: DecideReads) =>
      decide(
        f.snapshot,
        {
          kind: 'cancelRun',
          input: {
            ...f.s.base,
            operation: operationId('c'),
            run: target as RunId,
            urgency: urgency as 'force',
          },
        },
        [],
        null,
        reads,
      )
    const stop = (producer: { kind: string; call: string }) =>
      decide(
        f.snapshot,
        {
          kind: 'stopCall',
          input: {
            ...f.s.base,
            operation: operationId('s'),
            producer: producer as typeof model,
          },
        },
        [],
        null,
        {
          ...base,
          calls: [
            { kind: 'absent', producer: producer as typeof model, covered: f.snapshot.revision },
          ],
        },
      )
    return { f, active, cancel, stop }
  }

  it('cancelRun with an empty run is invalid, not a saved not-found', async () => {
    const m = await malformed()
    const reads = {
      ...base,
      runs: [{ kind: 'absent' as const, run: '' as RunId, covered: m.f.snapshot.revision }],
    }
    expect(m.cancel('', 'graceful', reads)).toMatchObject({
      ...invalid,
      failure: { kind: 'invalid', field: 'run' },
    })
  })

  it('cancelRun with an unregistered urgency is invalid and cancels nothing', async () => {
    const m = await malformed()
    const reads = {
      ...base,
      runs: [{ kind: 'bound' as const, run: m.active, bound: evidence('b'), terminal: null }],
    }
    expect(m.cancel(m.active, 'abort', reads)).toMatchObject({
      ...invalid,
      failure: { kind: 'invalid', field: 'urgency' },
    })
  })

  it('stopCall with an unregistered producer kind is invalid, not a saved not-found', async () => {
    const m = await malformed()
    expect(m.stop({ kind: 'agent', call: 'm1' })).toMatchObject({
      ...invalid,
      failure: { kind: 'invalid', field: 'producer.kind' },
    })
  })

  it('stopCall with an empty producer call is invalid, not a saved not-found', async () => {
    const m = await malformed()
    expect(m.stop({ kind: 'model', call: '' })).toMatchObject({
      ...invalid,
      failure: { kind: 'invalid', field: 'producer.call' },
    })
  })
})
