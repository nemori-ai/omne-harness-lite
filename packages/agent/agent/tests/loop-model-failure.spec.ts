import { describe, expect, it } from 'vitest'
import { agentEvaluator, type AgentDependencies } from '@omne-harness/agent'
import type { PendingCall } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeDispatchId,
  decodeResultVersion,
  resolveModelInvocationRef,
  type ModelFaultCause,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import {
  acceptedInput,
  evidence,
  execution,
  loadWithEntries,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
type Settle = Readonly<{ termination: Termination; parts: readonly ResultPart[] }>
const half: ResultPart = { kind: 'partial', content: 'text', value: 'half a reply', trims: [] }
const lost = (
  cause: ModelFaultCause = 'stream-lost',
  parts: readonly ResultPart[] = [half],
): Settle => ({
  termination: {
    kind: 'failed',
    fault: { cause, diagnostic: 'response-body-lost', upstreamStatus: null },
  } as Termination,
  parts,
})
const reply: Settle = {
  termination: { kind: 'completed', reason: 'stop' },
  parts: [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'text',
        id: acceptedInput('reply').content.blocks[0].id,
        visibility: { toHuman: true, toModel: true },
        text: 'the whole reply',
      },
    },
  ],
}
const truncated: Settle = {
  termination: { kind: 'completed', reason: 'limit' },
  parts: [...reply.parts, half],
}

type Scripted = Readonly<{
  assembly: LoopAssembly
  calls: string[]
  coordinator(): ReturnType<typeof createExecutionCoordinator>
}>

async function scripted(script: readonly Settle[]): Promise<Scripted> {
  const calls: string[] = []
  const assembly: LoopAssembly = await loopAssembly(
    [execution()],
    (d: Dependencies): Dependencies => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const admitted = await d.models.calls.admit(input)
            if ('ok' in admitted) {
              const settle = script[calls.length]
              calls.push(input.call)
              if (settle === undefined)
                throw new Error(`no scripted result for call ${calls.length}`)
              assembly.controls.models.settle({
                tenant: input.tenant,
                call: input.call,
                version: ok(decodeResultVersion(`mrver_${calls.length}`)),
                termination: settle.termination,
                parts: settle.parts,
                source: evidence(`settled-${calls.length}`),
                pageSize: 4,
                pageTargetBytes: 65536,
              })
              await assembly.controls.pusher?.settled({ tenant: input.tenant, call: input.call })
            }
            return admitted
          },
        },
      },
    }),
  )
  const entry = {
    ports: assembly.dependencies,
    binding: options().binding,
    compactionProvider: options().configuration.compactionProvider,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    idle() {},
  }
  const coordinator = () =>
    createExecutionCoordinator({
      ...entry,
      operation: operation('invoke-exec-1'),
      initial: [acceptedInput('input-exec-1', 'hello exec-1')],
      grant: null,
    })
  return { assembly, calls, coordinator }
}

async function load(assembly: LoopAssembly) {
  return await loadWithEntries(assembly.controls.journal.provider, {
    ...alice,
    execution: execution(),
  })
}

async function messageRoles(assembly: LoopAssembly) {
  const page = ok(
    await assembly.dependencies.journal.output.read({
      ...alice,
      execution: execution(),
      after: null,
      limit: 100,
    }),
  )
  if (page.kind !== 'page') throw new Error('a gap in a new execution')
  return page.events.flatMap(event =>
    event.body.kind === 'message' ? [event.body.message.role] : [],
  )
}

function replyHandoffs(assembly: LoopAssembly) {
  return assembly.controls.handoff.prepare.calls.filter(
    call => call.request.kind === 'execution' && call.request.source.kind === 'model-reply',
  )
}

async function causeRecord(assembly: LoopAssembly) {
  const { state } = await load(assembly)
  if (state.kind !== 'ended' || state.conclusion.kind !== 'fail')
    throw new Error(`the execution did not fail: ${JSON.stringify(state)}`)
  return state.conclusion.cause.record
}

describe('a main call that settled as failed fails the run with its cause', () => {
  it.each([
    ['a stream lost after some content', lost(), 'stream-lost'],
    [
      'an upstream failure before any content',
      lost('upstream-unavailable', []),
      'upstream-unavailable',
    ],
    ['a refused credential', lost('credential', []), 'credential'],
  ] as const)(
    '%s: one call, no other call, and no reply in the history',
    async (_name, settle, cause) => {
      const run = await scripted([settle, reply])
      const c = run.coordinator()
      ok(await c.accept())
      ok(await c.runExecution())
      expect(run.calls).toHaveLength(1)
      expect(await causeRecord(run.assembly)).toBe(
        `${execution()}/step-1/model-failed/${cause}/response-body-lost`,
      )
      const saved = await load(run.assembly)
      expect(saved.checkpoint.calls).toEqual([])
      expect(saved.checkpoint.voided).toEqual([])
      expect(Object.hasOwn(saved.checkpoint, 'modelRetry')).toBe(false)
      expect(await messageRoles(run.assembly)).toEqual([])
      expect(replyHandoffs(run.assembly)).toEqual([])
      ok(await c.runExecution())
      expect(run.calls).toHaveLength(1)
    },
  )

  it('a completed reply that was cut short fails as model-truncated and enters no history', async () => {
    const run = await scripted([truncated, reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(1)
    expect(await causeRecord(run.assembly)).toBe(`${execution()}/step-1/model-truncated`)
    expect(await messageRoles(run.assembly)).toEqual([])
  })
})

describe('a main call that fails after a tool round', () => {
  async function failOpenModelCall(assembly: Awaited<ReturnType<typeof toolAssembly>>) {
    let pending: PendingCall | undefined
    await eventually(async () => {
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      pending = read.checkpoint.calls.find(call => call.kind === 'model')
      if (pending?.kind !== 'model') return false
      const found = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      return found.kind === 'found' && found.state.phase !== 'settled'
    })
    if (pending?.kind !== 'model') throw new Error('model call not saved')
    const { call } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    assembly.controls.models.start({
      ...alice,
      call,
      dispatch: ok(decodeDispatchId('mdisp_lost')),
      firstContent: 'observed',
    })
    const failed = lost()
    assembly.controls.models.settle({
      ...alice,
      call,
      version: ok(decodeResultVersion('mrver_lost')),
      termination: failed.termination,
      parts: failed.parts,
      source: evidence('model-lost'),
      pageSize: 4,
      pageTargetBytes: 65536,
    })
    await assembly.controls.pusher?.settled({ ...alice, call })
  }

  it('fails the run with its cause, and the tool call was sent once', async () => {
    const assembly = await toolAssembly()
    let accepted = 0
    assembly.controls.tools.invoke.always(async () => {
      accepted += 1
      return {
        kind: 'accepted',
        reference: ok(
          encodeToolInvocationRef({
            tenant: alice.tenant,
            call: ok(decodeToolCallId(`tcall_${accepted}`)),
            admission: ok(decodeToolOperationId(`top_${accepted}`)),
          }),
        ),
        state: {} as ToolState,
        recovered: false,
      }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [tool] = await associatedTools(assembly, 1)
    if (tool === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(tool, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    await failOpenModelCall(assembly)
    await eventually(
      async () =>
        ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state
          .kind === 'ended',
    )
    const ended = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(ended.checkpoint.step).toBe('step-2')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    expect(accepted).toBe(1)
  })
})
