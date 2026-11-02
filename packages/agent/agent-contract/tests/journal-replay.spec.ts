// The trace replay driver of the `./testing` entry against a scripted performer: it accepts a
// trace whose every step is observed as the model expects it, and it reports the first step whose
// reply or state differs, without running the steps after it. The embedded traces are the ones the
// TLC simulation of verification/models/Finishing.tla exported. The runs against real Journals
// are in packages/agent/agent and packages/session/session-adapters.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  agentJournalReplayTraces,
  agentJournalViolatingTraces,
} from '@omne-harness/agent-contract/testing'
import {
  checkJournalTrace,
  JournalReplayMismatch,
  type JournalReplayObservation,
  type JournalReplayStep,
  type JournalReplayTrace,
} from '../src/testing-journal-replay.ts'

const exported: unknown = JSON.parse(
  readFileSync(new URL('../verification/models/finishing-traces.json', import.meta.url), 'utf8'),
)

/** A performer that observes each step as the trace expects, except where `change` says. */
function performer(
  change: (step: JournalReplayStep, index: number) => JournalReplayObservation | undefined = () =>
    undefined,
) {
  const performed: number[] = []
  const perform = async (step: JournalReplayStep, index: number) => {
    performed.push(index)
    return change(step, index) ?? { reply: step.reply, state: step.state }
  }
  return { performed, perform }
}

async function mismatchOf(
  trace: JournalReplayTrace,
  perform: Parameters<typeof checkJournalTrace>[1],
): Promise<JournalReplayMismatch> {
  const outcome = await checkJournalTrace(trace, perform).then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(outcome).toBeInstanceOf(JournalReplayMismatch)
  if (!(outcome instanceof JournalReplayMismatch)) throw new Error('unreachable')
  return outcome
}

const longest = [...agentJournalReplayTraces].sort((a, b) => b.steps.length - a.steps.length)[0]

describe('the embedded traces', () => {
  it('are the traces the TLC simulation exported, conforming and violating', () => {
    expect(exported).toMatchObject({
      conforming: agentJournalReplayTraces,
      violating: agentJournalViolatingTraces,
    })
  })

  it('cover an ordinary end, a cancelled end and each of the violating properties', () => {
    const ends = agentJournalReplayTraces.map(trace => trace.steps.at(-1)?.state)
    expect(ends).toContainEqual(
      expect.objectContaining({ status: 'ended', conclusion: 'complete' }),
    )
    expect(ends).toContainEqual(expect.objectContaining({ status: 'ended', conclusion: 'failed' }))
    expect(ends).toContainEqual(
      expect.objectContaining({ status: 'ended', conclusion: 'cancelled' }),
    )
    expect(agentJournalViolatingTraces.length).toBeGreaterThan(0)
    expect(longest?.steps.length ?? 0).toBeGreaterThan(5)
  })
})

describe('checkJournalTrace', () => {
  it('passes every trace whose every step is observed as expected and performs each step once', async () => {
    for (const trace of agentJournalReplayTraces) {
      const { performed, perform } = performer()
      await checkJournalTrace(trace, perform)
      expect(performed).toEqual(trace.steps.map((_, index) => index))
    }
  })

  for (const where of ['first', 'middle', 'last'] as const) {
    it(`reports the ${where} step whose reply differs and performs no later step`, async () => {
      if (longest === undefined) throw new Error('no trace')
      const at =
        where === 'first'
          ? 0
          : where === 'last'
            ? longest.steps.length - 1
            : longest.steps.length >> 1
      const { performed, perform } = performer((step, index) =>
        index === at ? { reply: `not ${step.reply}`, state: step.state } : undefined,
      )
      const mismatch = await mismatchOf(longest, perform)
      expect(mismatch.step).toBe(at)
      expect(mismatch.message).toContain(longest.steps[at]?.action ?? '?')
      expect(performed).toEqual(longest.steps.slice(0, at + 1).map((_, index) => index))
    })

    it(`reports the ${where} step whose state differs`, async () => {
      if (longest === undefined) throw new Error('no trace')
      const at =
        where === 'first'
          ? 0
          : where === 'last'
            ? longest.steps.length - 1
            : longest.steps.length >> 1
      const { perform } = performer((step, index) =>
        index === at
          ? { reply: step.reply, state: { ...step.state, handoff: !step.state.handoff } }
          : undefined,
      )
      expect((await mismatchOf(longest, perform)).step).toBe(at)
    })
  }

  it('reports each field of the state', async () => {
    if (longest === undefined) throw new Error('no trace')
    const fields: readonly ((state: JournalReplayStep['state']) => JournalReplayStep['state'])[] = [
      state => ({ ...state, status: state.status === 'ended' ? 'settling' : 'ended' }),
      state => ({ ...state, conclusion: state.conclusion === 'failed' ? 'complete' : 'failed' }),
      state => ({ ...state, route: state.route === 'author' ? 'cancellation' : 'author' }),
    ]
    for (const field of fields) {
      const { perform } = performer((step, index) =>
        index === 0 ? { reply: step.reply, state: field(step.state) } : undefined,
      )
      expect((await mismatchOf(longest, perform)).step).toBe(0)
    }
  })

  it('reports the forbidden step of each violating trace when the performer keeps the protocol', async () => {
    for (const trace of agentJournalViolatingTraces) {
      const last = trace.steps.length - 1
      // A Journal that keeps the protocol answers the last step otherwise.
      const { perform } = performer((step, index) =>
        index === last ? { reply: 'kept the protocol', state: step.state } : undefined,
      )
      expect((await mismatchOf(trace, perform)).step).toBe(last)
    }
  })
})
