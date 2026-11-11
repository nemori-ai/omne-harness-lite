// What the answer of a start intent says while the call waits for the head or a slot (SPEC 20,
// P02): the entries ahead, the slots held of the tool and of the scope, the tool limit and the
// scope budget, where `null` reads as no limit.
import { afterEach, describe, expect, it } from 'vitest'
import { adoption, evidence, failure, fixedOf, functionDefinition, ok } from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  toStarting,
  writeContext,
  type StartHarness,
} from './start-values.ts'

afterEach(auditQueues)

type Limits = Readonly<{ concurrency: number | null; scopeBudget: number | null }>

/** The request parts of a call of tool `name` in the one scope, with its limits. */
function toolIn(name: string, limits: Limits) {
  return {
    availability: {
      kind: 'available' as const,
      definition: functionDefinition({ name, adoption: adoption(name) }),
      executor: adoption('exec'),
      layer: { kind: 'official' as const },
    },
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant-1') },
    limits: { ...limits, foregroundMs: null, backgroundAfterMs: null },
  }
}

/** Takes an admitted call to `queued`, its queue entry `ready`, without asking to start. */
async function toQueued(harness: StartHarness, call: string): Promise<void> {
  const preparation = ok(
    await harness.commands.planPreparation({
      ...(await writeContext(harness, call, `${call}/plan`)),
      request: fixedOf(harness.internalRequests, call),
      purpose: 'initial',
      environmentAdoption: adoption('environment'),
    }),
  )
  ok(
    await harness.commands.prepared({
      ...(await writeContext(harness, call, `${call}/prepared`)),
      preparation,
      resources: { owner: 'o', record: 'env', revision: '1', digest: 'd' },
    }),
  )
  ok(await harness.commands.enqueue(await writeContext(harness, call, `${call}/enqueue`)))
}

/** The diagnostic of the wait of a queued call that is asked to start and does not get its turn. */
async function waitOf(harness: StartHarness, call: string): Promise<string> {
  const answer = failure(
    await harness.commands.prepareStart(await writeContext(harness, call, `${call}/start`)),
  )
  expect(answer).toMatchObject({ kind: 'unavailable', dependency: 'tool-queue' })
  if (answer.kind !== 'unavailable') throw new Error('unreachable')
  return answer.diagnostic
}

describe('20 queue wait diagnostic (P02)', () => {
  it('names the call and its ordinal, and counts the entries ahead that do not hold a slot', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1', toolIn('read_file', { concurrency: 1, scopeBudget: null }))
    await admitCall(harness, 'c2', toolIn('read_file', { concurrency: 1, scopeBudget: null }))
    await admitCall(harness, 'c3', toolIn('read_file', { concurrency: 1, scopeBudget: null }))
    // c1 and c2 still prepare: both are ahead of c3, and neither holds a slot.
    await toQueued(harness, 'c3')
    expect(await waitOf(harness, 'c3')).toBe(
      'call c3 waits at ordinal 3: 2 ahead, 0 held of this tool (tool limit 1), 0 held in the scope (no scope budget)',
    )
  })

  it('counts the held slots of the tool against its tool limit', async () => {
    const harness = startHarness()
    const limits = { concurrency: 2, scopeBudget: 5 }
    await admitCall(harness, 'c1', toolIn('read_file', limits))
    await admitCall(harness, 'c2', toolIn('read_file', limits))
    await admitCall(harness, 'c3', toolIn('read_file', limits))
    await toStarting(harness, 'c1')
    await toStarting(harness, 'c2')
    await toQueued(harness, 'c3')
    expect(await waitOf(harness, 'c3')).toBe(
      'call c3 waits at ordinal 3: 0 ahead, 2 held of this tool (tool limit 2), 2 held in the scope (scope budget 5)',
    )
  })

  it('counts the held slots of the scope against its budget while the tool has no limit, other tools included', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1', toolIn('read_file', { concurrency: null, scopeBudget: 1 }))
    await admitCall(harness, 'c2', toolIn('write_file', { concurrency: null, scopeBudget: 1 }))
    await toStarting(harness, 'c1')
    await toQueued(harness, 'c2')
    expect(await waitOf(harness, 'c2')).toBe(
      'call c2 waits at ordinal 2: 0 ahead, 0 held of this tool (no tool limit), 1 held in the scope (scope budget 1)',
    )
  })

  it('says no tool limit and no scope budget when both are null and the call only waits for its turn', async () => {
    const harness = startHarness()
    const unlimited = { concurrency: null, scopeBudget: null }
    await admitCall(harness, 'c1', toolIn('read_file', unlimited))
    await admitCall(harness, 'c2', toolIn('read_file', unlimited))
    await toQueued(harness, 'c2')
    expect(await waitOf(harness, 'c2')).toBe(
      'call c2 waits at ordinal 2: 1 ahead, 0 held of this tool (no tool limit), 0 held in the scope (no scope budget)',
    )
  })

  it('the answer writes no record and is no failure of the call', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1', toolIn('read_file', { concurrency: 1, scopeBudget: null }))
    await admitCall(harness, 'c2', toolIn('read_file', { concurrency: 1, scopeBudget: null }))
    await toQueued(harness, 'c2')
    const commits = harness.memory.commits
    await waitOf(harness, 'c2')
    expect(harness.memory.commits).toBe(commits)
    expect((await harness.state('c2')).phase).toBe('queued')
  })
})
