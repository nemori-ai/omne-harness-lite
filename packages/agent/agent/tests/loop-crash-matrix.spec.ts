// The crash matrix of the Loop. The re-entry of an execution is a function of its Journal alone:
// whatever coordinator ran before is gone, with everything it kept in memory. So the property is
// checked at every point where the durable state can differ: after each call of a port that
// leaves something durable (a Journal write, a Model admission, an admission prepare), the
// coordinator is dropped, the attachment is handed back in its place, a new coordinator resumes
// from the Journal, and the run must end as the uninterrupted run ends.
//
// A recovery route that names a node is not enough (`loop-recovery.spec.ts` checks the names): the
// node must run in a coordinator that holds nothing but the Journal. A node that needs a frame
// only its predecessor built in memory fails here.
import { describe, expect, it } from 'vitest'
import { agentEvaluator, type AgentDependencies } from '@omne-harness/agent'
import type { ExecutionSnapshot } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { createExecutionCoordinator, createResumedCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import {
  acceptedInput,
  evidence,
  execution,
  ok,
  operation,
  loadWithEntries,
  type Principal,
} from './journal-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

/** The calls that leave something durable; a crash is injected after each of them. */
const JOURNAL_WRITES = [
  'open',
  'commit',
  'prepareFinish',
  'tryFinish',
  'commitSettlement',
  'submit',
  'control',
  'acknowledge',
  'recordResult',
  'attach',
  'detach',
] as const

class Crashed extends Error {}

/** `at`: the durable call after which the process dies; 0 never. `seen` names each durable call. */
type Crash = { at: number; calls: number; dead: boolean; seen: string[] }

/** Every function of `port` refuses once the process is dead; the durable ones are counted. */
function mortal<T extends object>(
  port: T,
  crash: Crash,
  durable: readonly string[],
  name: string,
): T {
  const out: Record<string, unknown> = { ...(port as Record<string, unknown>) }
  for (const [key, value] of Object.entries(port)) {
    if (typeof value !== 'function') continue
    out[key] = async (...args: unknown[]) => {
      if (crash.dead) throw new Crashed(`${name}.${key} after the crash`)
      const answer: unknown = await (value as (...given: unknown[]) => unknown).apply(port, args)
      if (durable.includes(key)) {
        crash.calls += 1
        const input = args[0] as { operation?: unknown } | undefined
        crash.seen.push(`${name}.${key}${input?.operation ? ` ${String(input.operation)}` : ''}`)
        if (crash.calls === crash.at) crash.dead = true
      }
      return answer
    }
  }
  return out as T
}

function wrapped(crash: Crash) {
  return (d: Dependencies): Dependencies => ({
    ...d,
    journal: mortal(d.journal, crash, JOURNAL_WRITES, 'journal'),
    handoff: mortal(d.handoff, crash, ['prepare'], 'handoff'),
    models: { ...d.models, calls: mortal(d.models.calls, crash, ['admit'], 'models') },
  })
}

const entry = (assembly: LoopAssembly) => ({
  ports: assembly.dependencies,
  binding: options().binding,
  evaluator: agentEvaluator,
  access: alice,
  execution: execution(),
  idle() {},
})

const load = (assembly: LoopAssembly): Promise<ExecutionSnapshot> =>
  loadWithEntries(assembly.controls.journal.provider, { ...alice, execution: execution() })

/** What a finished run leaves, as far as an interruption must not change it. */
function outcomeOf(snapshot: ExecutionSnapshot | null) {
  if (snapshot === null) return null
  return {
    state: snapshot.state.kind,
    conclusion: snapshot.state.kind === 'ended' ? snapshot.state.conclusion.kind : null,
    handoffs: snapshot.handoffs.map(record => record.history.kind),
  }
}

/** The uninterrupted run, or the run that dies after durable call `at` and is resumed. */
async function run(at: number) {
  const crash: Crash = { at, calls: 0, dead: false, seen: [] }
  const assembly = await loopAssembly([execution()], wrapped(crash))
  assembly.release.open()
  const first = createExecutionCoordinator({
    ...entry(assembly),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
  })
  try {
    const accepted = await first.accept()
    if ('ok' in accepted) await first.runExecution()
  } catch (error) {
    if (!(error instanceof Crashed)) throw error
  }
  if (!crash.dead) return { crash, snapshot: await load(assembly), position: null, error: null }

  // The process is gone. A new one holds nothing but the Journal.
  crash.dead = false
  crash.at = 0
  const opened = await load(assembly).catch(() => null)
  if (opened === null) {
    // The execution was never opened: the caller of invoke replays it with the same operation.
    try {
      const again = createExecutionCoordinator({
        ...entry(assembly),
        operation: operation('invoke-exec-1'),
        initial: acceptedInput('input-exec-1', 'hello exec-1'),
        grant: null,
      })
      ok(await again.accept())
      ok(await again.runExecution())
      return { crash, snapshot: await load(assembly), position: 'not-opened', error: null }
    } catch (error) {
      return { crash, snapshot: null, position: 'not-opened', error: String(error) }
    }
  }
  const before = opened
  const position = `${before.state.kind}@${before.checkpoint.position}`
  if (before.state.kind === 'ended') return { crash, snapshot: before, position, error: null }
  try {
    let recovery = before.state.kind === 'suspended' ? before.state.handoff : null
    if (recovery === null) {
      const authority = before.executionAttachment
      if (authority === null) throw new Error('an open execution without an attachment')
      // The recovery entry of the host hands the attachment back in the place of the lost runtime.
      recovery = ok(
        await assembly.dependencies.journal.detach({
          ...alice,
          execution: execution(),
          operation: operation(`lost-${at}`),
          authority,
          reason: evidence('lost'),
        }),
      )
    }
    const resumed = createResumedCoordinator(entry(assembly))
    ok(await resumed.resume({ operation: operation(`resume-${at}`), recovery, grant: null }))
    for (let pass = 0; pass < 20; pass += 1) {
      const ran = await resumed.runExecution()
      if ('failure' in ran) throw new Error(`the pass failed: ${JSON.stringify(ran.failure)}`)
      if ((await load(assembly)).state.kind === 'ended') break
      const wake = await resumed.waitForWake({
        reconciliationDelayMs: 1,
        signal: new AbortController().signal,
      })
      if ('failure' in wake) throw new Error(`the wait failed: ${JSON.stringify(wake.failure)}`)
      if (wake.ok === 'stopped') break
    }
    return { crash, snapshot: await load(assembly), position, error: null }
  } catch (error) {
    return { crash, snapshot: await load(assembly), position, error: String(error) }
  }
}

describe('the crash matrix: a run that dies after any durable call ends as the uninterrupted run', () => {
  it('one model reply without tools', async () => {
    const whole = await run(0)
    const expected = outcomeOf(whole.snapshot)
    expect(expected).toMatchObject({ state: 'ended', conclusion: 'complete' })
    const rows: string[] = []
    for (let at = 1; at <= whole.crash.calls; at += 1) {
      const cut = await run(at)
      const same = JSON.stringify(outcomeOf(cut.snapshot)) === JSON.stringify(expected)
      if (process.env['CRASH_MATRIX_TABLE'] !== undefined)
        console.log(
          `${same && cut.error === null ? 'ok  ' : 'FAIL'} ${at} ${whole.crash.seen[at - 1]} -> ${cut.position}`,
        )
      if (same && cut.error === null) continue
      rows.push(
        `after call ${at} (${whole.crash.seen[at - 1]}), found ${cut.position}: ` +
          `${cut.error ?? JSON.stringify(outcomeOf(cut.snapshot))}`,
      )
    }
    expect(
      rows,
      `the cuts that did not end as the uninterrupted run:\n${rows.join('\n')}\n`,
    ).toEqual([])
  })
})
