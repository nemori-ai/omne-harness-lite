import { agentEvaluator, type AgentDependencies } from '@omne-harness/agent'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeResultVersion,
  type CallContact,
  type ModelCallId,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import { parseRetryPolicy, type RetryPolicy } from '@omne-harness/retry'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  createExecutionCoordinator,
  createResumedCoordinator,
  type ExecutionEntry,
  type ResumeEntry,
} from '../src/loop/coordinator.ts'
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
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

export type Dependencies = AgentDependencies<Principal, ContentBlock>
export type Settle = Readonly<{ termination: Termination; parts: readonly ResultPart[] }>
export type Retrying = Parameters<NonNullable<ExecutionEntry<Principal>['modelRetrying']>>
export type Counts = { loads: number; received: number; inputs: number }

export const START = '1970-01-01T00:00:00Z'
export const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString()

export const policy = (change: Partial<RetryPolicy> = {}) =>
  parseRetryPolicy({
    maxAttempts: 3,
    maxElapsedMs: 60_000,
    delaysMs: [1000, 2000],
    jitter: 0.5,
    ...change,
  })

export const failed = (): Settle => ({
  termination: {
    kind: 'failed',
    fault: { cause: 'stream-lost', diagnostic: 'response-body-lost', upstreamStatus: null },
  },
  parts: [],
})

export const replyOf = (text: string): Settle => ({
  termination: { kind: 'completed', reason: 'stop' },
  parts: [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'text',
        id: acceptedInput(`reply-${text.length}`).content.blocks[0].id,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    },
  ],
})

export const contactAnswer = (kind: Exclude<CallContact['kind'], 'lost'>) => () =>
  ({ ok: { kind } }) as const
export const lostContact = () =>
  ({ ok: { kind: 'lost', evidence: evidence('state-lock') } }) as const

type Admitted = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type Takeover = Readonly<{
  assembly: LoopAssembly
  admitted: Admitted[]
  retrying: Retrying[]
  counts: Counts
  coordinator(): ReturnType<typeof createExecutionCoordinator>
  rebuild(): Promise<ReturnType<typeof createResumedCoordinator>>
  settle(index: number, settle: Settle): Promise<void>
}>

export function resumeEntry(
  dependencies: Dependencies,
  change: Partial<ResumeEntry<Principal>> = {},
): ResumeEntry<Principal> {
  return {
    ports: dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    idle() {},
    ...change,
  }
}

export async function rebuilt(
  dependencies: Dependencies,
  entry: ResumeEntry<Principal>,
  name: string,
): Promise<ReturnType<typeof createResumedCoordinator>> {
  const loaded = ok(await dependencies.journal.load({ ...alice, execution: execution() }))
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an open execution without an attachment')
  const recovery = ok(
    await dependencies.journal.detach({
      ...alice,
      execution: execution(),
      operation: operation(`lost-${name}`),
      authority,
      reason: evidence('lost'),
    }),
  )
  const resumed = createResumedCoordinator(entry)
  ok(await resumed.resume({ operation: operation(`resume-${name}`), recovery, grant: null }))
  return resumed
}

function counting(d: Dependencies, counts: Counts): Dependencies {
  return {
    ...d,
    journal: {
      ...d.journal,
      load: input => {
        counts.loads += 1
        return d.journal.load(input)
      },
      inputs: input => {
        counts.inputs += 1
        return d.journal.inputs(input)
      },
    },
    entries: {
      ...d.entries,
      receivedOf: input => {
        counts.received += 1
        return d.entries.receivedOf(input)
      },
    },
  }
}

export async function takeover(
  script: readonly (Settle | null)[],
  retry: RetryPolicy = policy(),
  wrap: (d: Dependencies) => Dependencies = d => d,
): Promise<Takeover> {
  const admitted: Admitted[] = []
  const retrying: Retrying[] = []
  const counts: Counts = { loads: 0, received: 0, inputs: 0 }
  const settle = async (index: number, result: Settle) => {
    const call = admitted[index]
    if (call === undefined) throw new Error(`call ${index} was not admitted`)
    assembly.controls.models.settle({
      ...call,
      version: ok(decodeResultVersion(`mrver_${index + 1}`)),
      termination: result.termination,
      parts: result.parts,
      source: evidence(`settled-${index + 1}`),
      pageSize: 4,
      pageTargetBytes: 65536,
    })
    await assembly.controls.pusher?.settled(call)
  }
  const assembly: LoopAssembly = await loopAssembly([execution()], inner =>
    counting(
      {
        ...wrap(inner),
        models: {
          ...inner.models,
          calls: {
            ...inner.models.calls,
            async admit(input) {
              const answer = await inner.models.calls.admit(input)
              if ('failure' in answer) return answer
              const index = admitted.length
              admitted.push({ tenant: input.tenant, call: input.call })
              const result = script[index]
              if (result === undefined) throw new Error(`no scripted result for call ${index}`)
              if (result !== null) await settle(index, result)
              return answer
            },
          },
        },
      },
      counts,
    ),
  )
  const entry = resumeEntry(assembly.dependencies, {
    modelRetry: { policy: retry, random: () => 0 },
    modelRetrying: (...event: Retrying) => retrying.push(event),
  })
  let rebuilds = 0
  return {
    assembly,
    admitted,
    retrying,
    counts,
    settle,
    coordinator: () =>
      createExecutionCoordinator({
        ...entry,
        operation: operation('invoke-exec-1'),
        initial: acceptedInput('input-exec-1', 'hello exec-1'),
        grant: null,
      }),
    rebuild: () => rebuilt(assembly.dependencies, entry, String((rebuilds += 1))),
  }
}

export async function saved(dependencies: Pick<LoopAssembly, 'controls'>) {
  return await loadWithEntries(dependencies.controls.journal.provider, {
    ...alice,
    execution: execution(),
  })
}

export async function assistantTexts(assembly: Pick<LoopAssembly, 'dependencies'>) {
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
    event.body.kind === 'message' && event.body.message.role === 'assistant'
      ? event.body.message.blocks.flatMap(block => (block.kind === 'text' ? [block.text] : []))
      : [],
  )
}

export async function causeRecord(assembly: Pick<LoopAssembly, 'controls'>) {
  const { state } = await saved(assembly)
  if (state.kind !== 'ended' || state.conclusion.kind !== 'fail')
    throw new Error(`the execution did not fail: ${JSON.stringify(state)}`)
  return state.conclusion.cause.record
}
