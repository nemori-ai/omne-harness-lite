import {
  agentEvaluator,
  createAgentRuntime,
  type AgentConfiguration,
  type AgentDependencies,
  type AgentProvider,
  type AgentRuntimeExtras,
} from '@omne-harness/agent'
import {
  createTestAgentDependencies,
  testAdoption,
  type TestAgentControls,
} from '@omne-harness/agent/testing'
import {
  decodeInputBatchId,
  decodeReplyAdmissionSequence,
  type AcceptedInput,
  type AgentEvent,
  type AgentExecutionHandle,
  type AgentExecutionId,
  type AgentObservation,
  type AgentOperationId,
  type AgentState,
  type ExecutionSnapshot,
  type ControlRecord,
  type HandoffPrepare,
  type HandoffRequest,
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

function stub<T>(fields: unknown): T {
  return fields as T
}

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
      prefix: { sequence: ok(decodeReplyAdmissionSequence('0')), basis: evidence('admissions') },
    },
    controls: [],
    ...overrides,
  }
}

export const selected: SelectedModel = {
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: stub({ kind: 'resolved', selectable: true }),
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
}

export const REPLY_TEXT = 'hello from the model'

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

export type Gate = Readonly<{ open(): void; opened: Promise<void>; isOpen(): boolean }>

export function gate(): Gate {
  let released = false
  let open = () => {}
  const opened = new Promise<void>(resolve => {
    open = () => {
      released = true
      resolve()
    }
  })
  return { open, opened, isOpen: () => released }
}

function respondingModels(
  models: ModelRuntime<Principal>,
  controller: TestAgentControls<Principal>['models'],
  release: Gate,
  reply: ScriptedReply,
  pusher: NonNullable<TestAgentControls<Principal>['pusher']>,
): ModelRuntime<Principal> {
  return {
    ...models,
    calls: {
      ...models.calls,
      async admit(input) {
        const admitted = await models.calls.admit(input)
        if ('ok' in admitted) {
          const responding = release.opened.then(async () => {
            const call = { tenant: input.tenant, call: input.call }
            controller.start({
              ...call,
              dispatch: ok(decodeDispatchId('mdisp_1')),
              firstContent: 'observed',
            })
            controller.recordDispatch({
              ...call,
              record: {
                dispatch: ok(decodeDispatchId('mdisp_1')),
                supplier: input.request.suppliers[0],
                intent: input.operation,
                send: 'started',
                firstContent: 'observed',
                terminal: { kind: 'completed', reason: 'stop' },
                account: null,
                materialization: null,
              },
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
            await pusher.settled(call)
          })
          if (release.isOpen()) await responding
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
  release: Gate
}>

export async function loopAssembly(
  executions: readonly AgentExecutionId[],
  wrap: (
    dependencies: AgentDependencies<Principal, ContentBlock>,
  ) => AgentDependencies<Principal, ContentBlock> = dependencies => dependencies,
  reply: ScriptedReply = ONE_TEXT,
  configuration: Partial<AgentConfiguration> = { reconciliationDelaysMs: [1000] },
  extras: AgentRuntimeExtras = {},
): Promise<LoopAssembly> {
  const { dependencies, controls } = createTestAgentDependencies<Principal>({
    receivingPrincipal: 'alice',
  })
  const release = gate()
  controls.adoptions.define(adoption('definition'), {
    definition: stub({ category: 'AgentDefinition', name: 'test' }),
    evaluator: agentEvaluator,
    extensions: [],
  })
  for (const execution of executions) controls.conditions.define(execution, conditions())
  controls.selection.select.always(() => ({ ok: selected }))
  if (controls.pusher === null) throw new Error('public result pusher required')
  const assembled = wrap({
    ...dependencies,
    models: respondingModels(dependencies.models, controls.models, release, reply, controls.pusher),
  })
  const guarded = assembled
  const provider = ok(await createAgentRuntime(guarded, options(configuration), extras))
  return { provider, dependencies: guarded, controls, release }
}

export const alice = { principal: 'alice', tenant: tenantA } as const

export function losingEntryNotifications(
  dependencies: AgentDependencies<Principal, ContentBlock>,
  lost: { pages: number } = { pages: 0 },
): AgentDependencies<Principal, ContentBlock> {
  const { journal } = dependencies
  return {
    ...dependencies,
    journal: {
      ...journal,
      output: {
        ...journal.output,
        async *events(input) {
          for await (const page of journal.output.events(input)) {
            const dropped =
              'ok' in page &&
              page.ok.kind === 'page' &&
              page.ok.events.length > 0 &&
              page.ok.events.every(event => event.body.kind === 'entry')
            if (dropped) lost.pages += 1
            else yield page
          }
        },
      },
    },
  }
}

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

export async function eventually(probe: () => Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (await probe()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('the condition never held')
}

// A stop has no public channel: wait until `position` has stayed for 20 more turns while `observe`
// still shows the execution occupied.
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

export function replyCandidate(
  call: Pick<HandoffPrepare, 'request'> | undefined,
): Extract<HandoffRequest, { kind: 'execution' }>['candidate'] | undefined {
  return call?.request.kind === 'execution' ? call.request.candidate : undefined
}

export function handoffOperationOf(call: Pick<HandoffPrepare, 'request'>): AgentOperationId {
  const reference = call.request.reference
  return reference.kind === 'execution' ? reference.operation : reference.entry
}

export function commitNodeOf(operation: string): string {
  if (operation.endsWith('/prepare')) return 'Q1'
  if (operation.endsWith('/resolve')) return 'Q2'
  return operation.split('/')[0] ?? ''
}
