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
import {
  createTestAgentDependencies,
  testAdoption,
  type TestAgentControls,
} from '@omne-harness/agent/testing'
import {
  decodeInputBatchId,
  type AcceptedInput,
  type AgentEvent,
  type AgentExecutionHandle,
  type AgentExecutionId,
  type AgentObservation,
  type AgentState,
  type ExecutionSnapshot,
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
  encodeModelInvocationRef,
  type ModelRuntime,
  type ResultPart,
} from '@omne-harness/model-contract'
import {
  acceptedInput,
  adoption,
  checkpoint,
  consumption,
  evidence,
  execution,
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
  reference: ok(
    encodeModelInvocationRef({
      tenant: tenantA,
      call: modelCall('one'),
      admission: ok(decodeModelOperationId('mop_one')),
    }),
  ),
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
  // A Model request accepts only an adoption whose digest is 64 hex digits, as testAdoption mints.
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: stub({ kind: 'resolved', selectable: true }),
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
}

export const REPLY_TEXT = 'hello from the model'

/** The reply the Model settles each call with: one sealed text part per text, `pageSize` per page. */
export type ScriptedReply = Readonly<{ texts: readonly string[]; pageSize: number }>

const ONE_TEXT: ScriptedReply = { texts: [REPLY_TEXT], pageSize: 10 }

function replyParts(reply: ScriptedReply): readonly ResultPart[] {
  return reply.texts.map((text, index) => ({
    kind: 'sealed',
    trims: [],
    block: {
      kind: 'text',
      id: stub(`blk_reply_${index}`),
      visibility: { toHuman: true, toModel: true },
      text,
    },
  }))
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
 * The Model runtime whose admit, once it succeeds, lets the scripted call start and settle with
 * `reply` after `release` opens. The admit answer itself is not changed.
 */
function respondingModels(
  models: ModelRuntime<Principal>,
  controller: TestAgentControls<Principal>['models'],
  release: Promise<void>,
  reply: ScriptedReply,
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
              parts: replyParts(reply),
              source: evidence(`settled/${input.call}`),
              pageSize: reply.pageSize,
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
  reply: ScriptedReply = ONE_TEXT,
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
    models: respondingModels(dependencies.models, controls.models, release.opened, reply),
  })
  const provider = ok(await createAgentRuntime(assembled, options()))
  return { provider, dependencies: assembled, controls, release }
}

export const alice = { principal: 'alice', tenant: tenantA } as const

/** The invoke of execution `id` under operation `invoke-<id>`, with its own input unless `input`. */
export function invoke(
  assembly: Pick<LoopAssembly, 'provider'>,
  id = 'exec-1',
  change: Readonly<{ input?: AcceptedInput }> = {},
) {
  return assembly.provider.runtime.invoke({
    ...alice,
    execution: execution(id),
    operation: operation(`invoke-${id}`),
    initial: change.input ?? acceptedInput(`input-${id}`, `hello ${id}`),
    grant: null,
  })
}

/** Every event of the execution through the handle, until the ended event. */
export async function eventsOf(handle: AgentExecutionHandle<Principal>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  const controller = new AbortController()
  for await (const page of handle.output.events({
    ...alice,
    execution: handle.execution,
    after: null,
    signal: controller.signal,
  })) {
    const read = ok(page)
    if (read.kind !== 'page') throw new Error('a gap in a new execution')
    events.push(...read.events)
    if (read.events.some(event => event.body.kind === 'ended')) break
  }
  controller.abort()
  return events
}

/** The state that `observe` shows now. */
export async function shown(assembly: Pick<LoopAssembly, 'provider'>): Promise<AgentState> {
  const controller = new AbortController()
  for await (const seen of assembly.provider.observation.observe({
    ...alice,
    signal: controller.signal,
  }) as AsyncIterable<AgentObservation>) {
    controller.abort()
    if (seen.kind === 'state') return seen.value
  }
  throw new Error('observe showed no state')
}

/** Calls `probe` on later turns of the event loop until it holds, at most 200 times. */
export async function eventually(probe: () => Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (await probe()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('the condition never held')
}

/**
 * Waits until the run of exec-1 has stopped with `position` in the Journal, read through the
 * unwrapped memory Journal so that a test's counted port sees no extra call. A stop has no public
 * channel yet (S-14 of #558): the position must stay for 20 more turns, and `observe` must still show
 * the execution occupied. Returns the state of the execution.
 */
export async function stoppedAt(
  assembly: LoopAssembly,
  position: string,
): Promise<ExecutionSnapshot['state']> {
  const read = async () => {
    const loaded = await assembly.controls.journal.port.load({ ...alice, execution: execution() })
    return 'ok' in loaded ? loaded.ok : null
  }
  await eventually(async () => (await read())?.checkpoint.position === position)
  for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
  const snapshot = await read()
  if (snapshot?.checkpoint.position !== position)
    throw new Error(`the run went on past ${position}: ${snapshot?.checkpoint.position}`)
  const state = await shown(assembly)
  if (state.kind !== 'occupied' || state.execution !== execution())
    throw new Error(`the runtime shows ${state.kind}, not the stopped execution`)
  return snapshot.state
}
