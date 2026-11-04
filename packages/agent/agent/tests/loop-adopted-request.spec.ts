// FIXED-FACTS F2 (R2-D224): the main-purpose M0 records `checkpoint.adoptedRequest` in its own
// commit, and that slot is the only one that survives the call's settlement, the cleared `calls`,
// the tool round trip and the next I1. Only the next main-purpose M0 replaces it.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type {
  AgentCheckpoint,
  ExecutionSnapshot,
  JournalCommit,
  Preparation,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { readyPreparation } from '@omne-harness/agent/testing'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { controlAssembly } from './fixtures/control-assembly.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  fixedToolRequest,
  pushToolResult,
  textBlock,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'
import { adoption, execution, ok, type Principal } from './journal-support.ts'
import { alice, commitNodeOf, eventually, invoke, loopAssembly } from './loop-support.ts'

type Recorded = Readonly<{
  node: string
  execution: string
  checkpoint: AgentCheckpoint
  effects: JournalCommit<Principal>['effects']
}>
type PrepareAnswer = Parameters<
  Awaited<ReturnType<typeof controlAssembly>>['controls']['requests']['prepare']['always']
>[0]

/** The opaque state the preparing side hands over with each ready preparation of `action`. */
function stateOf(action: string): Preparation['state'] {
  return { kind: 'string', value: `record/${action}` }
}

/**
 * The default preparation (assembled first, ready on review) whose ready answer carries the state
 * of its action and the given purpose, so a test can tell which preparation a record came from.
 */
function preparing(purpose: (action: string) => Preparation['purpose'] = () => 'main') {
  const prepare: PrepareAnswer = input => {
    const { request, capacity, ...common } = readyPreparation(input)
    if (input.previous !== null)
      return succeed({
        ...common,
        kind: 'ready',
        request,
        capacity,
        state: stateOf(input.action),
        purpose: purpose(input.action),
      })
    const { system, messages, tools, toolChoice, parameters, representation, source } = request
    return succeed({
      ...common,
      kind: 'assembled',
      input: { system, messages, tools, toolChoice, parameters, representation, source },
    })
  }
  return prepare
}

/** Records every Journal commit's node, checkpoint and effects, in commit order. */
function recording(commits: Recorded[]) {
  return (dependencies: AgentDependencies<Principal, ContentBlock>) => ({
    ...dependencies,
    journal: {
      ...dependencies.journal,
      commit(input: JournalCommit<Principal>) {
        commits.push({
          node: commitNodeOf(input.operation),
          execution: input.execution,
          checkpoint: structuredClone(input.checkpoint),
          effects: structuredClone(input.effects),
        })
        return dependencies.journal.commit(input)
      },
    },
  })
}

/** The tool assembly of `toolAssembly`, with the commit recorder around its Journal. */
async function toolRound(
  commits: Recorded[],
  purpose?: (action: string) => Preparation['purpose'],
) {
  const record = recording(commits)
  const assembly = await controlAssembly({}, dependencies =>
    record({
      ...dependencies,
      toolRequests: {
        async describe() {
          return { ok: adoption('read_file') }
        },
        async prepare(input: Readonly<{ consumer: Parameters<typeof fixedToolRequest>[0] }>) {
          return { ok: fixedToolRequest(input.consumer) }
        },
      },
    }),
  )
  assembly.controls.requests.prepare.always(preparing(purpose))
  const reference = ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId('tcall_one')),
      admission: ok(decodeToolOperationId('top_one')),
    }),
  )
  // Agent keeps the receipt as an original fact and never reads it as the current state, so the
  // test does not build a full ToolState.
  assembly.controls.tools.invoke.always(async () => ({
    kind: 'accepted',
    reference,
    state: {} as ToolState,
    recovered: false,
  }))
  return assembly
}

async function load(
  assembly: Pick<Awaited<ReturnType<typeof controlAssembly>>, 'dependencies'>,
  id = 'exec-1',
): Promise<ExecutionSnapshot> {
  return ok(await assembly.dependencies.journal.load({ ...alice, execution: execution(id) }))
}

/** The checkpoint of the first commit at `node` in step `step`. */
function at(commits: readonly Recorded[], node: string, step: string): AgentCheckpoint {
  const found = commits.find(commit => commit.node === node && commit.checkpoint.step === step)
  if (found === undefined) throw new Error(`no ${node} commit in ${step}`)
  return found.checkpoint
}

/**
 * The `adoptedRequest` the main M0 of a checkpoint's own commit must have written. The ready
 * preparation is not saved (R2-D292), so its schema and state come from the scripted preparation.
 */
function expectedOf(checkpoint: AgentCheckpoint) {
  const [call] = checkpoint.calls
  if (call?.kind !== 'model') throw new Error('not an M0 checkpoint')
  return {
    reference: call.reference,
    fixed: call.fixed,
    schema: expect.objectContaining({ name: 'preparation-state' }),
    record: stateOf(call.action),
  }
}

describe('FIXED-FACTS F2: the main M0 records the adopted request', () => {
  it('records the call reference, the fixed basis and the ready state with calls and effects', async () => {
    const commits: Recorded[] = []
    const assembly = await loopAssembly([execution()], recording(commits))
    assembly.controls.requests.prepare.always(preparing())
    ok(await invoke(assembly))
    await eventually(async () => commits.some(commit => commit.node === 'M0'))

    const m0 = commits.find(commit => commit.node === 'M0')
    if (m0 === undefined) throw new Error('no M0 commit')
    const [call] = m0.checkpoint.calls
    if (call?.kind !== 'model') throw new Error('M0 did not save the model call')
    // One commit: the call, the adopted context, the effect intent and the adopted request.
    expect(m0.effects.map(effect => effect.pending)).toEqual([call])
    expect(m0.checkpoint.adoptedContext).not.toBeNull()
    expect(m0.checkpoint.adoptedRequest).toEqual({
      reference: call.reference,
      fixed: call.fixed,
      schema: expect.objectContaining({ name: 'preparation-state' }),
      record: stateOf(call.action),
    })
    expect(m0.checkpoint.adoptedRequest).toEqual(expectedOf(m0.checkpoint))
    // Nothing before M0 wrote it: the I1 and P1 commits of the same step still hold the initial null.
    expect(at(commits, 'I1', m0.checkpoint.step).adoptedRequest).toBeNull()
    expect(at(commits, 'P1', m0.checkpoint.step).adoptedRequest).toBeNull()

    const loaded = (await load(assembly)).checkpoint
    expect(loaded.adoptedRequest).toEqual(m0.checkpoint.adoptedRequest)
  })

  it('keeps it through the settled call, the cleared calls, the tool in flight and the next I1, until the next main M0 replaces it', async () => {
    const commits: Recorded[] = []
    const assembly = await toolRound(commits)
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no associated Tool call')

    const first = at(commits, 'M0', 'step-1')
    const adopted = first.adoptedRequest
    expect(adopted).toEqual(expectedOf(first))

    // The main call has settled: `calls` holds only the tool in flight, the request survives.
    const inFlight = (await load(assembly)).checkpoint
    expect(inFlight.calls.map(call => call.kind)).toEqual(['tool'])
    expect(inFlight.adoptedRequest).toEqual(adopted)
    // Between the settlement and the tool call `calls` was empty; the slot held in every commit.
    const sinceM0 = commits.slice(commits.findIndex(commit => commit.node === 'M0'))
    const cleared = sinceM0.filter(commit => commit.checkpoint.calls.length === 0)
    expect(cleared.length).toBeGreaterThan(0)
    for (const commit of cleared) expect(commit.checkpoint.adoptedRequest).toEqual(adopted)

    expect(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(pending, { name: 'one', content: [textBlock('file', 'blk_file')] }),
      ),
    ).toHaveProperty('ok')
    await eventually(async () =>
      commits.some(c => c.node === 'M0' && c.checkpoint.step === 'step-2'),
    )

    // The next I1 and P1 prepare again in memory (R2-D292); neither touches it.
    const i1 = at(commits, 'I1', 'step-2')
    expect(i1.requestPreparation).toBeNull()
    expect(i1.adoptedRequest).toEqual(adopted)
    expect(at(commits, 'P1', 'step-2').adoptedRequest).toEqual(adopted)

    // The next main M0 replaces it with its own request.
    const second = at(commits, 'M0', 'step-2')
    expect(second.adoptedRequest).toEqual(expectedOf(second))
    expect(second.adoptedRequest).not.toEqual(adopted)
    expect((await load(assembly)).checkpoint.adoptedRequest).toEqual(second.adoptedRequest)
  })

  it('keeps the main request when the next M0 records a request of another purpose', async () => {
    const commits: Recorded[] = []
    const assembly = await toolRound(commits, action =>
      action.startsWith('step-2/') ? 'compaction' : 'main',
    )
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(pending, { name: 'one', content: [textBlock('file', 'blk_file')] }),
      ),
    ).toHaveProperty('ok')
    await eventually(async () =>
      commits.some(c => c.node === 'M0' && c.checkpoint.step === 'step-2'),
    )

    const first = at(commits, 'M0', 'step-1')
    expect(first.adoptedRequest).toEqual(expectedOf(first))
    const second = at(commits, 'M0', 'step-2')
    expect(second.requestPreparation).toBeNull()
    expect(second.calls.map(call => call.kind)).toEqual(['model'])
    // That M0 neither writes its own request nor clears the main one.
    expect(second.adoptedRequest).toEqual(first.adoptedRequest)
  })

  it('starts each new execution with null, not with the request of an earlier one', async () => {
    const commits: Recorded[] = []
    const assembly = await loopAssembly(
      [execution('exec-1'), execution('exec-2')],
      recording(commits),
    )
    assembly.controls.requests.prepare.always(preparing())
    assembly.release.open()
    ok(await invoke(assembly, 'exec-1'))
    await eventually(async () => (await load(assembly, 'exec-1')).state.kind === 'ended')
    expect((await load(assembly, 'exec-1')).checkpoint.adoptedRequest).not.toBeNull()

    ok(await invoke(assembly, 'exec-2'))
    await eventually(async () =>
      commits.some(commit => commit.execution === execution('exec-2') && commit.node === 'M0'),
    )
    const second = commits.filter(commit => commit.execution === execution('exec-2'))
    const m0 = second.findIndex(commit => commit.node === 'M0')
    expect(m0).toBeGreaterThan(0)
    for (const commit of second.slice(0, m0)) expect(commit.checkpoint.adoptedRequest).toBeNull()
    expect(second[m0]?.checkpoint.adoptedRequest).toEqual(expectedOf(second[m0]!.checkpoint))
  })
})
