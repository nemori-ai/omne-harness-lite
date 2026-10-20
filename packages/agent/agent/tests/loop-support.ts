// Values and the assembly that the Loop tests share: a `LoopFacts` builder for the evaluator, and the
// test assembly with the generic evaluator adopted, the conditions and selection scripted and a Model
// that answers each admitted call with one text reply once the test lets it. The doubles answer what
// the test scripted; nothing here proves a real provider.
import {
  agentEvaluator,
  createAgentRuntime,
  type AgentDependencies,
  type AgentProvider,
} from '@omne-harness/agent'
import { createTestAgentDependencies, type TestAgentControls } from '@omne-harness/agent/testing'
import {
  decodeInputBatchId,
  type AgentExecutionId,
  type ControlRecord,
  type InputBatch,
  type LoopFacts,
  type PendingCall,
  type ProducerDecisionView,
  type ResultResponsibility,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeDispatchId,
  decodeModelOperationId,
  decodeResultVersion,
  type ModelRuntime,
  type ResultPart,
} from '@omne-harness/model-contract'
import {
  adoption,
  checkpoint,
  consumption,
  evidence,
  inputId,
  modelCall,
  ok,
  operation,
  producedResult,
  tenantA,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'

/**
 * A value whose consumer reads only the fields given. The rest of the contract shape is left out on
 * purpose; the coordinator and the evaluator never read it.
 */
function stub<T>(fields: unknown): T {
  return fields as T
}

// ---------------------------------------------------------------------------------------------
// LoopFacts

export function conditions(
  progression: RuntimeConditions['progression']['kind'] = 'evaluate-completion',
): RuntimeConditions {
  return {
    source: evidence('conditions'),
    configuration: adoption('configuration'),
    progression: { kind: progression, basis: evidence('progression') },
    model: adoption('model'),
    context: evidence('context'),
    bindings: [],
  }
}

export function inputBatch(count: number): InputBatch {
  return {
    id: ok(decodeInputBatchId(`batch-${count}`)),
    watermark: evidence('watermark'),
    ordered: Array.from({ length: count }, (_, index) => inputId(`input-${index + 1}`)),
  }
}

export const pendingCall: PendingCall = {
  kind: 'model',
  action: stub('step-1/main'),
  consumption: consumption('step-1/main/reply'),
  position: { owner: 'agent', work: 'exec-1/step-1', position: 'I3', purpose: 'main' },
  fixed: evidence('fixed'),
  call: modelCall('one'),
  admission: ok(decodeModelOperationId('mop_one')),
  purpose: 'main',
}

export const unresolvedProducer: ProducerDecisionView = {
  kind: 'unresolved',
  pending: pendingCall,
  source: evidence('producer'),
}

export const cancelControl: ControlRecord = {
  operation: operation('cancel-1'),
  command: { kind: 'cancel', reason: evidence('cancel') },
  stages: { accepted: { state: 'reached', source: evidence('accepted') } },
}

export function responsibility(state: 'owed' | 'custody' | 'processed'): ResultResponsibility {
  return {
    result: producedResult('one'),
    consumption: consumption('step-1/main/reply'),
    custody: state === 'custody' ? evidence('custody') : null,
    completion: state === 'processed' ? evidence('completion') : null,
    release: { kind: 'pending' },
  }
}

/** Facts of a current execution at `position` with nothing pending, overridden field by field. */
export function loopFacts(position: string, overrides: Partial<LoopFacts> = {}): LoopFacts {
  return {
    advancement: { kind: 'current', source: evidence('advancement') },
    checkpoint: checkpoint(position),
    conditions: conditions(),
    batch: inputBatch(0),
    inputs: [],
    producers: [],
    consumption: [],
    replyAdmissions: {
      through: evidence('admissions'),
      rule: adoption('admission-rule'),
      lastAdmission: null,
      consecutiveDenials: '0',
      totalDenials: '0',
    },
    controls: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// The Loop assembly

export const selected: SelectedModel = {
  recipient: { route: 'route-1', profile: adoption('profile') },
  resolution: stub({ kind: 'resolved', selectable: true }),
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
}

export const REPLY_TEXT = 'hello from the model'

function replyParts(): readonly ResultPart[] {
  return [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'text',
        id: stub('blk_reply'),
        visibility: { toHuman: true, toModel: true },
        text: REPLY_TEXT,
      },
    },
  ]
}

/** A gate that the test opens; the Model settles no admitted call before it is open. */
export type Gate = Readonly<{ open(): void; opened: Promise<void> }>

export function gate(): Gate {
  let open = () => {}
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { open, opened }
}

/**
 * The Model runtime whose admit, once it succeeds, lets the scripted call start and settle with one
 * text reply after `release` opens. The admit answer itself is not changed.
 */
function respondingModels(
  models: ModelRuntime<Principal>,
  controller: TestAgentControls<Principal>['models'],
  release: Promise<void>,
): ModelRuntime<Principal> {
  return {
    ...models,
    calls: {
      ...models.calls,
      async admit(input) {
        const admitted = await models.calls.admit(input)
        if ('ok' in admitted) {
          void release.then(() => {
            const call = { tenant: input.tenant, call: input.call }
            controller.start({
              ...call,
              dispatch: ok(decodeDispatchId('mdisp_1')),
              firstContent: 'observed',
            })
            controller.settle({
              ...call,
              version: ok(decodeResultVersion('mrver_1')),
              termination: { kind: 'completed', reason: 'stop' },
              parts: replyParts(),
              source: evidence(`settled/${input.call}`),
              pageSize: 10,
              pageTargetBytes: 65536,
            })
          })
        }
        return admitted
      },
    },
  }
}

export type LoopAssembly = Readonly<{
  provider: AgentProvider<Principal>
  dependencies: AgentDependencies<Principal, ContentBlock>
  controls: TestAgentControls<Principal>
  /** Lets the Model settle every call it admitted and will admit. */
  release: Gate
}>

/**
 * The test assembly with the generic evaluator adopted for the bound definition, the conditions of
 * `executions` evaluating completion, one selected model, and the responding Model. `wrap` may put a
 * recorder around the dependencies before the factory sees them.
 */
export async function loopAssembly(
  executions: readonly AgentExecutionId[],
  wrap: (
    dependencies: AgentDependencies<Principal, ContentBlock>,
  ) => AgentDependencies<Principal, ContentBlock> = dependencies => dependencies,
): Promise<LoopAssembly> {
  const { dependencies, controls } = createTestAgentDependencies<Principal>()
  const release = gate()
  controls.adoptions.define(adoption('definition'), {
    definition: stub({ category: 'AgentDefinition', name: 'test' }),
    evaluator: agentEvaluator,
    extensions: [],
  })
  for (const execution of executions) controls.conditions.define(execution, conditions())
  controls.selection.select.always(() => ({ ok: selected }))
  const assembled = wrap({
    ...dependencies,
    models: respondingModels(dependencies.models, controls.models, release.opened),
  })
  const provider = ok(await createAgentRuntime(assembled, options()))
  return { provider, dependencies: assembled, controls, release }
}

export const alice = { principal: 'alice', tenant: tenantA } as const
