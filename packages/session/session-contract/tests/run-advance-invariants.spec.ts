// Machine guard of the RunAdvance model (verification/models/run-advance/RunAdvance.tla): a seeded
// random sequence of accept, startRun, input hand-over, finishRun and probes by a stale attempt is
// committed through decide and reduce, as a storage participant would, and every step checks
//   I-R1 a startRun never commits while a Run is active,
//   I-R2 an attempt that does not hold the advance is answered stale-advance,
//   I-R3 an input is handed over at most once,
//   I-R4 the first terminal of a Run is the one it keeps.
// A failure prints the seed and the step.
import { describe, expect, it } from 'vitest'
import { createMemorySessionHistorySource } from '@omne-harness/session-contract/testing'
import {
  decide,
  expectedRevision,
  judgeAdvance,
  reduce,
  type HistoryEntry,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  memoryAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('tester')
const base = { tenant: access.tenant, session: access.session }

/** mulberry32: a small seeded generator, so a red run names the seed that reproduces it. */
function random(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { below: (n: number) => Math.floor(next() * n) }
}

/** One session's log: decide and reduce over a memory history, as decide-reduce.spec.ts does. */
function log() {
  const history = createMemorySessionHistorySource()
  const rows: HistoryEntry[] = []
  const loginRead = (previous: WorkSnapshot | null) => {
    const first = previous?.pending[0]
    return first === undefined
      ? {}
      : { firstInput: { input: first, origin: ordinaryInput(first).origin } }
  }
  /** The next snapshot, or null when decide refuses the command. */
  return (previous: WorkSnapshot | null, command: SessionCommand): WorkSnapshot | null => {
    const guards = command.kind === 'startRun' ? [] : initializationGuards(command, previous)
    const material =
      previous === null
        ? undefined
        : history.read(
            previous,
            rows,
            command.kind === 'startRun'
              ? { kind: 'selected', inputs: previous.pending.slice(0, 1) }
              : command.kind === 'receive' && command.input.fact.kind === 'input-handover'
                ? { kind: 'selected', inputs: [command.input.fact.input] }
                : { kind: 'pending', inputs: previous.pending },
          )
    const read =
      previous !== null && material !== undefined
        ? { ...previous, historyIndex: material.index }
        : previous
    const decision = decide(read, command, guards, null, {
      compaction: null,
      ...(material === undefined ? {} : { history: material.reads }),
      ...(command.kind === 'startRun' ? loginRead(read) : {}),
    })
    if (decision.kind !== 'entries') return null
    const revision = String(
      read === null ? 1 : Number(read.revision) + 1,
    ) as WorkSnapshot['revision']
    const entries: HistoryEntry[] = decision.entries.map((entry, index) => ({
      ...entry,
      id: String(rows.length + index + 1) as HistoryEntry['id'],
      revision,
    }))
    const reduced = reduce(read, { revision, entries }, material?.reads)
    if (reduced.kind !== 'reduced') throw new Error(`reduce: ${reduced.diagnostic}`)
    rows.push(...entries)
    return {
      ...reduced.snapshot,
      historyIndex: history.read(reduced.snapshot, rows, {
        kind: 'pending',
        inputs: reduced.snapshot.pending,
      }).index,
    }
  }
}

/** How often each committed command and probe was reached over all seeds. */
const reached: Record<string, number> = {}

async function run(seed: number, length: number): Promise<string[]> {
  const rnd = random(seed)
  const commit = log()
  const violations: string[] = []
  let s = commit(null, {
    kind: 'create',
    input: { ...base, operation: operationId('create'), creation: creation() },
  })
  if (s === null) throw new Error('create')
  let inputs = 0
  let ops = 0
  const op = (name: string) => operationId(`${name}-${String((ops += 1))}`)
  const firstTerminal = new Map<string, string>()
  for (let step = 0; step < length; step++) {
    const where = `seed=${String(seed)} step=${String(step)}`
    const roll = rnd.below(10)
    const active = s.run.kind === 'active' ? s.run : null
    let command: SessionCommand | null = null
    if (roll < 3 && inputs < 6) {
      command = {
        kind: 'accept',
        input: {
          ...base,
          operation: op('accept'),
          value: ordinaryInput(`input-${String((inputs += 1))}`),
        },
      }
    } else if (roll < 5) {
      command = {
        kind: 'startRun',
        input: {
          ...base,
          operation: op('start'),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'i' },
        },
      }
    } else if (roll < 7 && active !== null && s.pending.length + s.handed.length > 0) {
      // Already handed inputs are offered again: a second hand-over must be refused.
      const offered = [...s.pending, ...s.handed]
      const input = offered[rnd.below(offered.length)]
      if (input !== undefined)
        command = {
          kind: 'receive',
          input: {
            ...base,
            operation: op('handover'),
            fact: {
              kind: 'input-handover',
              execution: active.execution.execution,
              input,
              result: { kind: 'accepted', receipt: evidence(`r-${String(ops)}`) },
            },
          },
        }
    } else if (roll < 9) {
      // A finishRun on an ended Run must not change its terminal (I-R4).
      const target = active?.run ?? (s.run.kind === 'terminal' ? s.run.terminal.run : null)
      if (target !== null)
        command = {
          kind: 'finishRun',
          input: {
            ...base,
            operation: op('finish'),
            run: target,
            expected: expectedRevision(s, 'finishRun'),
            bounded: { kind: 'uninterpretable', evidence: evidence('u') },
          },
        }
    } else if (active !== null && active.advance !== null) {
      // I-R2: an attempt that does not hold the advance is stale, whatever the revision.
      const stale = { ...active.advance, attempt: `stale-${String(step)}` as never }
      const judged = judgeAdvance(s, {
        kind: 'attempt',
        advance: stale,
        expected: expectedRevision(s, 'release'),
      })
      if (judged.kind !== 'stale-advance') violations.push(`I-R2 ${where}: ${judged.kind}`)
      reached.probe = (reached.probe ?? 0) + 1
    }
    if (command === null) continue
    const wasActive = s.run.kind === 'active'
    const next = commit(s, command)
    if (
      next === null &&
      command.kind === 'receive' &&
      command.input.fact.kind === 'input-handover' &&
      s.handed.includes(command.input.fact.input)
    )
      reached['refused-handover'] = (reached['refused-handover'] ?? 0) + 1
    if (next === null) continue
    reached[command.kind] = (reached[command.kind] ?? 0) + 1
    if (command.kind === 'startRun' && wasActive)
      violations.push(`I-R1 ${where}: a startRun committed while a Run was active`)
    if (
      command.kind === 'receive' &&
      command.input.fact.kind === 'input-handover' &&
      s.handed.includes(command.input.fact.input)
    )
      violations.push(`I-R3 ${where}: a second hand-over of one input committed`)
    const handed = next.handed
    if (new Set(handed).size !== handed.length)
      violations.push(`I-R3 ${where}: an input was handed over twice: ${JSON.stringify(handed)}`)
    if (next.run.kind === 'terminal') {
      const outcome = JSON.stringify(next.run.terminal)
      const first = firstTerminal.get(next.run.terminal.run)
      if (first === undefined) firstTerminal.set(next.run.terminal.run, outcome)
      else if (first !== outcome)
        violations.push(
          `I-R4 ${where}: the terminal changed by ${command.kind}: ${first} -> ${outcome}`,
        )
    }
    s = next
  }
  return violations
}

describe('RunAdvance guard: decide and reduce keep the Run and attempt invariants', () => {
  it('I-R1 to I-R4 hold over 60 seeded command sequences', { timeout: 30_000 }, async () => {
    const violations: string[] = []
    for (let seed = 1; seed <= 60; seed++) violations.push(...(await run(seed, 30)))
    expect(violations).toEqual([])
    for (const kind of ['accept', 'startRun', 'receive', 'finishRun', 'probe', 'refused-handover'])
      expect(reached[kind] ?? 0, kind).toBeGreaterThan(20)
  })

  it('the sequences start Runs, hand inputs over and end Runs', async () => {
    // The schedule reaches the interesting states: without them the invariants hold vacuously.
    const commit = log()
    let s = commit(null, {
      kind: 'create',
      input: { ...base, operation: operationId('create'), creation: creation() },
    })
    s = commit(s, {
      kind: 'accept',
      input: { ...base, operation: operationId('accept'), value: ordinaryInput('input-1') },
    })
    const start: SessionCommand = {
      kind: 'startRun',
      input: {
        ...base,
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'i' },
      },
    }
    s = commit(s, start)
    expect(s?.run.kind).toBe('active')
    expect(
      commit(s, { ...start, input: { ...start.input, operation: operationId('start-2') } }),
    ).toBeNull()
  })
})

describe('the Run-layer expected of the advance commands (I-R2, PM-02, PM-05, R2-D327)', () => {
  /** A session with one accepted input and a started Run, committed through decide and reduce. */
  function startedRun() {
    const commit = log()
    let s = commit(null, {
      kind: 'create',
      input: { ...base, operation: operationId('create'), creation: creation() },
    })
    s = commit(s, {
      kind: 'accept',
      input: { ...base, operation: operationId('accept-1'), value: ordinaryInput('input-1') },
    })
    s = commit(s, {
      kind: 'startRun',
      input: {
        ...base,
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'i' },
      },
    })
    if (s === null || s.run.kind !== 'active') throw new Error('no started Run')
    return { commit, s }
  }
  const accept = (name: string): SessionCommand => ({
    kind: 'accept',
    input: { ...base, operation: operationId(`accept-${name}`), value: ordinaryInput(name) },
  })
  const claim = (name: string, s: WorkSnapshot, expected: string): SessionCommand => {
    if (s.run.kind !== 'active') throw new Error('no active Run')
    return {
      kind: 'claim',
      input: {
        ...base,
        operation: operationId(`claim-${name}`),
        run: s.run.run,
        instance: { owner: 'agent', id: name },
        continuity: evidence(`continuity-${name}`),
        expected: expected as WorkSnapshot['revision'],
      },
    }
  }
  const release = (s: WorkSnapshot): SessionCommand => {
    if (s.run.kind !== 'active' || s.run.advance === null) throw new Error('no advance')
    return {
      kind: 'release',
      input: {
        ...base,
        operation: operationId(`release-${s.revision}`),
        advance: s.run.advance,
        expected: expectedRevision(s, 'release'),
        handover: evidence('handover'),
      },
    }
  }
  const refusal = (s: WorkSnapshot, command: SessionCommand) => {
    const decision = decide(s, command, [], null, { compaction: null })
    return decision.kind === 'rejected' ? decision.failure : decision
  }

  it('reduce moves the Run-layer revision on a start, an attempt change and a release, not on an accept', () => {
    const { commit, s } = startedRun()
    if (s.run.kind !== 'active') throw new Error('no active Run')
    expect(s.run.revision).toBe(s.revision)
    const accepted = commit(s, accept('input-2'))
    if (accepted === null || accepted.run.kind !== 'active') throw new Error('accept')
    expect(accepted.revision).not.toBe(s.revision)
    expect(accepted.run.revision).toBe(s.revision)
    const released = commit(accepted, release(accepted))
    if (released === null || released.run.kind !== 'active') throw new Error('release')
    expect(released.run.revision).toBe(released.revision)
  })

  it('a bounded close that read the Run layer holds after unrelated accepts; a release before it answers changed', () => {
    const { commit, s } = startedRun()
    if (s.run.kind !== 'active') throw new Error('no active Run')
    const close = (expected: string): SessionCommand => ({
      kind: 'finishRun',
      input: {
        ...base,
        operation: operationId(`close-${expected}`),
        run: s.run.kind === 'active' ? s.run.run : ('' as never),
        expected: expected as WorkSnapshot['revision'],
        bounded: { kind: 'uninterpretable', evidence: evidence('u') },
      },
    })
    const read = expectedRevision(s, 'finishRun')
    let busy: WorkSnapshot | null = s
    for (const name of ['input-2', 'input-3', 'input-4']) busy = commit(busy, accept(name))
    if (busy === null) throw new Error('accept')
    expect(
      judgeAdvance(busy, {
        kind: 'bounded',
        run: s.run.run,
        expected: read,
        basis: { kind: 'uninterpretable', evidence: evidence('u') },
      }),
    ).toEqual({ kind: 'ok' })
    const closed = commit(busy, close(read))
    expect(closed?.run.kind).toBe('terminal')
    const released = commit(busy, release(busy))
    if (released === null) throw new Error('release')
    expect(refusal(released, close(read))).toEqual({
      kind: 'changed',
      revision: expectedRevision(released, 'finishRun'),
    })
  })

  it('of two claims that read the same Run layer only the first holds; the second is stale-advance', () => {
    const { commit, s } = startedRun()
    const released = commit(s, release(s))
    if (released === null) throw new Error('release')
    const read = expectedRevision(released, 'claim')
    // An unrelated accept between the read and the claims does not stop the first.
    const busy = commit(released, accept('input-2'))
    if (busy === null) throw new Error('accept')
    const first = commit(busy, claim('r1', busy, read))
    if (first === null || first.run.kind !== 'active') throw new Error('first claim refused')
    expect(first.run.ordinal).toBe('2')
    expect(refusal(first, claim('r2', first, read))).toEqual({
      kind: 'stale-advance',
      current: first.run.advance,
    })
  })

  it('a claim that sends the snapshot revision after an unrelated commit is refused (R2-D343)', () => {
    const { commit, s } = startedRun()
    const released = commit(s, release(s))
    if (released === null) throw new Error('release')
    // An accept moves the snapshot revision, not the Run-layer revision. A claim that names the
    // snapshot revision of its read is not a Run-layer expected, so it does not hold.
    const busy = commit(released, accept('input-2'))
    if (busy === null || busy.run.kind !== 'active') throw new Error('accept')
    expect(busy.revision).not.toBe(expectedRevision(busy, 'claim'))
    expect(refusal(busy, claim('stale', busy, busy.revision))).toEqual({
      kind: 'changed',
      revision: expectedRevision(busy, 'claim'),
    })
    // The same claim with the Run-layer revision it read holds.
    expect(commit(busy, claim('fresh', busy, expectedRevision(released, 'claim')))?.run.kind).toBe(
      'active',
    )
  })
})
