import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  resolveToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { evidence, loadWithEntries, ok, operation } from './journal-support.ts'
import { alice, invoke } from './loop-support.ts'
import {
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolReceiver,
  type AssociatedTool,
} from './fixtures/tool-call.ts'

const TURNS = 1500
// A judgment that stays unknown this long, with time passing, is not going to change by itself.
const SETTLED_UNKNOWN_TURNS = 80

const turn = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

type Ran = Readonly<{
  commits: readonly string[]
  refused: string | null
  state: string
  // The cancellation is established and waits for a Tool call whose acceptance was never recorded.
  awaitsUnknownTool: boolean
}>

// A Tool call that was accepted but whose acceptance could not be recorded stays unknown until the
// Tool answers for it: the cancellation is established and waits, it is not a stopped driver.
const cancelled = (ran: Ran): boolean => ran.state === 'ended:cancelled' || ran.awaitsUnknownTool

// One Run with one tool call, driven to its end. From commit `at` on the advance is revoked and
// every commit and condition read answers stale-advance, until the cancellation reaches the
// Journal `delay` turns later.
async function drivenRun(at: number | null, delay = 3): Promise<Ran> {
  const commits: string[] = []
  let refused: string | null = null
  const window = { revoked: false, turns: 0, arrived: false }
  const inWindow = () => window.revoked && !window.arrived
  const stale = () => Promise.resolve(fail({ kind: 'stale-advance' as const }))
  // The driver's own writes: each is refused inside the window.
  const guarded = (written: string): boolean => {
    const ordinal = commits.push(written) - 1
    if (ordinal === at) {
      window.revoked = true
      refused = written
    }
    return inWindow()
  }
  const assembly = await toolAssembly({}, {}, {}, ports => ({
    ...ports,
    conditions: {
      ...ports.conditions,
      read: input => (inWindow() ? stale() : ports.conditions.read(input)),
    },
    journal: {
      ...ports.journal,
      commit: input => (guarded(input.operation) ? stale() : ports.journal.commit(input)),
      prepareFinish: input =>
        guarded(input.operation) ? stale() : ports.journal.prepareFinish(input),
      tryFinish: input => (guarded(input.operation) ? stale() : ports.journal.tryFinish(input)),
    },
  }))
  let calls = 0
  assembly.controls.tools.invoke.always(async () => {
    calls += 1
    return {
      kind: 'accepted',
      reference: ok(
        encodeToolInvocationRef({
          tenant: alice.tenant,
          call: ok(decodeToolCallId(`tcall_call-${String(calls)}`)),
          admission: ok(decodeToolOperationId(`top_call-${String(calls)}`)),
        }),
      ),
      state: {} as ToolState,
      recovered: false,
    }
  })
  // The Tool accepts a withdrawal and then reports the call as interrupted by it.
  const stop = ok(decodeToolOperationId('top_stop'))
  let stopped = false
  assembly.controls.tools.commands.control.always(input => {
    stopped = true
    const parts = ok(resolveToolInvocationRef(input.reference, alice.tenant))
    return {
      kind: 'committed' as const,
      operation: ok(encodeToolOperationRef({ ...parts, operation: stop })),
      receipt: {
        operation: stop,
        state: {} as ToolState,
        progress: { kind: 'accepted' as const, evidence: evidence('stop-accepted') },
      },
    }
  })
  const handle = ok(await invoke(assembly))
  const input = { ...alice, execution: handle.execution }
  const read = () => loadWithEntries(assembly.dependencies, input)
  const modelCallOf = async (step: string) =>
    (await read()).checkpoint.calls.some(
      call => call.kind === 'model' && call.action.startsWith(`${step}/`),
    )
  const associated = async (): Promise<AssociatedTool | undefined> =>
    ((await read()).checkpoint.batch?.actions ?? []).flatMap(action =>
      action.call?.kind === 'tool' && action.call.association === 'associated' ? [action.call] : [],
    )[0]
  const script: readonly (() => Promise<boolean>)[] = [
    async () => (await modelCallOf('step-1')) && (await deliverToolSuggestion(assembly), true),
    async () => {
      const pending = await associated()
      if (pending === undefined) return false
      ok(
        await pushToolResult(
          toolReceiver(assembly),
          toolDelivery(
            pending,
            stopped
              ? {
                  name: 'one',
                  terminal: {
                    kind: 'interrupted',
                    cause: { kind: 'control', operation: stop, withdrawn: false },
                  },
                }
              : { name: 'one', content: [textBlock('result', 'blk_result')] },
          ),
        ),
      )
      return true
    },
    async () =>
      (await modelCallOf('step-2')) &&
      (await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final'), true),
  ]
  let stage = 0
  let unknownFor = 0
  for (let turns = 0; turns < TURNS; turns += 1) {
    const now = await read()
    if (now.state.kind === 'ended') break
    unknownFor = now.settlement.judgments.at(-1)?.decision.kind === 'unknown' ? unknownFor + 1 : 0
    if (unknownFor > SETTLED_UNKNOWN_TURNS) break
    if (inWindow()) {
      window.turns += 1
      if (window.turns > delay) {
        ok(
          await handle.control.control({
            ...input,
            operation: operation('cancel-in-window'),
            command: { kind: 'cancel', reason: evidence('cancel') },
          }),
        )
        window.arrived = true
      }
    }
    // The Model and the Tool go on answering whatever the Run does: a cancellation settles on their answers.
    const advance = script[stage]
    if (advance !== undefined && (await advance().catch(() => false))) stage += 1
    // Time passes: a driver that sleeps until its next check is woken.
    const [due] = assembly.controls.clock.pending()
    if (due !== undefined) assembly.controls.clock.advanceTo(due)
    await turn()
  }
  const last = await read()
  return {
    commits,
    refused,
    state:
      last.state.kind === 'ended'
        ? `ended:${last.state.conclusion.kind}`
        : `${last.state.kind}@${last.checkpoint.position}`,
    awaitsUnknownTool:
      last.settlement.candidate?.conclusion.kind === 'cancelled' &&
      last.settlement.judgments.at(-1)?.decision.kind === 'unknown' &&
      last.checkpoint.calls.some(call => call.kind === 'tool' && call.association === 'intent'),
  }
}

const baseline = await drivenRun(null)

describe('a revoked advance whose cause has not reached the Journal yet', () => {
  it('lets the unrevoked Run complete, through every kind of node', () => {
    expect(baseline.state).toBe('ended:complete')
    const nodes = new Set(baseline.commits.map(commit => commit.split('/')[0]))
    for (const node of ['E3', 'I0', 'M0', 'A0', 'F1', 'F2', 'F3']) expect(nodes).toContain(node)
  })

  it.each(baseline.commits.map((commit, at) => [at, commit] as const))(
    'settles the cancellation when commit %i (%s) is the first refused one',
    async at => {
      const ran = await drivenRun(at)
      expect(cancelled(ran), ran.state).toBe(true)
    },
  )

  it(
    'settles the cancellation wherever the window opens and however late the cause arrives',
    { tags: ['slow'] },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: baseline.commits.length - 1 }),
          fc.integer({ min: 0, max: 40 }),
          async (at, delay) => {
            const ran = await drivenRun(at, delay)
            expect(cancelled(ran), ran.state).toBe(true)
          },
        ),
        { numRuns: 40 },
      )
    },
  )
})
