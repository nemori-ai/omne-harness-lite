import { createHash } from 'node:crypto'
import { agentEvaluator, type AgentDependencies } from '@omne-harness/agent'
import { createTestAgentDependencies, readyPreparation } from '@omne-harness/agent/testing'
import type {
  CompactionOutcome,
  CompactionRequest,
  CompactionTaskState,
  ContextCompaction,
  FinishIntent,
  Preparation,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from '../../src/canonical.ts'
import { createExecutionCoordinator } from '../../src/loop/coordinator.ts'
import { options } from '../factory-support.ts'
import {
  acceptedInput,
  evidence,
  execution,
  ok,
  operation,
  type Principal,
} from '../journal-support.ts'
import { alice, conditions, selected } from '../loop-support.ts'
import { compactionAdoption, compactionInput, compactionInputRef } from './compaction-input.ts'
import { serializedCompaction } from './serialized-compaction.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
// A test replaces a port of the assembled dependencies to inject a fault.
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** A run whose first preparation needs compaction: the service answers `ended`, or a complete summary. */
export async function compactionLoop(
  lose?: Parameters<typeof serializedCompaction>[1],
  ended?: Exclude<CompactionOutcome, { kind: 'completed' }>,
  wrap: (dependencies: Dependencies) => Dependencies = dependencies => dependencies,
) {
  const f = createTestAgentDependencies<Principal>({
    journal: { participants: ['context-transition', 'processed'] },
  })
  const frozen = compactionInput()
  const message = judgeMessage({
    id: frozen.outputMessageId,
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        visibility: { toHuman: true, toModel: true },
        text: 'The original work is still open.',
      },
    ],
    covers: { from: frozen.history.origin, to: frozen.history.upper },
    retained: [],
    derivation: evidence('generation'),
  })
  if (!('ok' in message) || message.ok.role !== 'compaction')
    throw new Error('invalid summary fixture')
  const outcome: CompactionOutcome = ended ?? { kind: 'completed', message: message.ok }
  const result = {
    version: '1',
    evidence: evidence('service-result'),
    digest: `sha256:${createHash('sha256').update(canonical(outcome)).digest('hex')}`,
  }
  let task: CompactionTaskState | null = null
  const requests: CompactionRequest[] = []
  let ready: Extract<Preparation, { kind: 'ready' }> | null = null
  f.controls.adoptions.define(options().binding.definition, {
    definition: {
      category: 'AgentDefinition',
      type: 'master',
      summary: 'Works on what the person asks for.',
      name: 'test',
      references: [],
      attributes: [],
    },
    evaluator: agentEvaluator,
    extensions: [],
  })
  f.controls.conditions.define(execution(), conditions())
  f.controls.selection.select.always(() => succeed(selected))
  f.controls.requests.prepare.always(input => {
    ready = readyPreparation(input)
    const { id, purpose, position, source, state, schema } = ready
    return succeed({
      id,
      purpose,
      position,
      source,
      state,
      schema,
      kind: 'needs-compaction',
      input: compactionInputRef(frozen),
      original: { input: evidence('original'), alterations: [], beforeModelCall: null },
    })
  })
  f.controls.requests.assessCompaction.always(input =>
    succeed({
      kind: 'accepted',
      value: {
        preparation: input.original.id,
        task: input.task,
        consumption: input.consumption,
        result: input.result,
        received: input.received,
        message: input.message,
        history: frozen.history.source,
        epoch: frozen.history.epoch,
        admission: evidence('budget'),
      },
    }),
  )
  f.controls.requests.resume.always(() =>
    ready === null ? fail({ kind: 'unsupported' }) : succeed(ready),
  )
  const service: ContextCompaction<Principal> = {
    admit: async (input: Parameters<typeof f.dependencies.compaction.admit>[0]) => {
      requests.push(input.request)
      task = {
        ref: input.request.ref,
        revision: '2',
        phase: 'terminal',
        result,
        outcome,
        custody: 'provider',
        physical: 'settled',
      }
      return succeed(task)
    },
    inspect: async () =>
      task === null
        ? succeed({ kind: 'missing' as const })
        : succeed({ kind: 'found' as const, state: task }),
    cancel: f.dependencies.compaction.cancel,
    acknowledge: async input => {
      const receipt = evidence('release')
      task = {
        ref: input.ref,
        revision: '3',
        phase: 'handed-off',
        result,
        receipt,
        physical: 'settled',
      }
      return succeed({ ref: input.ref, result, receipt })
    },
  }
  const transport = lose === undefined ? null : serializedCompaction(service, lose)
  const finishes: FinishIntent[] = []
  const dependencies: Mutable<Dependencies> = wrap({
    ...f.dependencies,
    journal: {
      ...f.dependencies.journal,
      tryFinish(input: Parameters<typeof f.dependencies.journal.tryFinish>[0]) {
        finishes.push(structuredClone(input.intent))
        return f.dependencies.journal.tryFinish(input)
      },
    },
    compactionInputs: { read: async () => succeed(frozen) },
    compaction: transport?.remote ?? service,
  })
  const entry = {
    ports: dependencies,
    binding: options().binding,
    compactionProvider: { authority: 'test', adoption: compactionAdoption },
    jointCommits: ['context-transition', 'processed'],
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    idle() {},
  } as const
  const coordinator = () =>
    createExecutionCoordinator({
      ...entry,
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
    })
  const current = coordinator()
  ok(await current.accept())
  return {
    ...f,
    dependencies,
    current,
    entry,
    requests,
    frozen,
    message: message.ok,
    result,
    transport,
    finishes,
  }
}
