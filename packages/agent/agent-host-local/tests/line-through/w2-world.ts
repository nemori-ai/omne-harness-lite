// The joint world of wave 2 (C-JOINT, J1 to J6): the CP3 world with the parts that wave 2 adds.
//
// Real (the product parts under test; the CP3 list in ./world.ts stays true):
// - the `agentJournal` plugin of session-adapters with the trusted cancellation installation
//   (`createSessionAgentJournalPlugin`, R2-D35), over the real sqlite-provider;
// - with `earlier: 'session'` the history source of the Session log for the earlier context (AD-04,
//   `createSessionHistorySource`), which provides `contextHolderSources` in place of the K-RQ holder
//   double; by default the earlier context is the history of that double;
// - the Model receiver of CP3 and the Tool receiver (`createLocalToolReceiver`) over the session-log
//   Journal of the session.
//
// Doubles (each one is named where it is built):
// - the Tool runtime (`createScriptedToolRuntime`) and the Tool request preparation
//   (`AgentDependencies.toolRequests`, R2-D36: a fixed full request of a fixed schema);
// - the Model: the scripted provider and result pusher, each reply with a fixed delay;
// - the adopted-request and read-eligibility parts of the holder, and the Runtime Context handoff, are
//   the CP3 doubles; AD-03 and the scope lookup are not installed here.
//
// Real, from the parent branch that has C-ADAPTERS: AD-02 (`createSessionJournalInterpretationPlugin`)
// and the handoff provider (`createSessionMessageHandoffPlugin`), mounted after the Agent host. The
// Session provider and the Context and Agent factories take the products' `measure` observers
// (R2-D17), whose events go to the recorder of the scenario. `earlier: 'session'` installs AD-04.
import { createAgentRuntime, type AgentDependencies } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  type Access,
  type AgentExecutionId,
  type DurableEvidence,
  type EventPage,
  type ExecutionSnapshot,
  type PendingCall,
} from '@omne-harness/agent-contract'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeResultVersion,
  type DispatchId,
  type ResultPart,
} from '@omne-harness/model-contract'
import { historySessionOf } from '@omne-harness/session-adapters'
import {
  createSessionAgentJournalPlugin,
  createSessionHistorySource,
  createSessionJournalInterpretationPlugin,
  createSessionMessageHandoffPlugin,
  createSessionModelLogConsumptionPlugin,
} from '@omne-harness/session-adapters/cordis'
import { createSessionProviderPlugin } from '@omne-harness/session-cordis/cordis'
import { createAgentContextPlugin } from '@omne-harness/agent-context/cordis'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import {
  encodeToolInvocationRef,
  decodeToolCallId,
  decodeToolOperationId,
  type ToolDelivery,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  judgeToolInvokeRequest,
} from '@omne-harness/tool-contract/provider'
import {
  creation,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createLocalToolReceiver, createToolReceiverState } from '../../src/index.ts'
import { createAgentHostLocalPlugin, createAgentHostPlugin } from '../../src/host-plugin.ts'
import {
  COORDINATOR,
  SESSION,
  intakeAccess,
  textOf,
  TENANT,
  executionOf,
  ok,
  openLineWorld,
  type ModelAdmission,
  type PluginMount,
} from './world.ts'
import {
  countingStorage,
  createRoundCounters,
  recordStage,
  type MeasureEvent,
  type RoundCounters,
  type StageRecorder,
} from './w2-measure.ts'

type Dependencies = AgentDependencies<unknown, ContentBlock>
type Original = Extract<ResultPart, { kind: 'sealed' }>['block']
type Sleep = (ms: number) => Promise<void>
const sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const text = (id: string, body: string): ContentBlock =>
  ({ kind: 'text', id, visibility: { toHuman: true, toModel: true }, text: body }) as ContentBlock

/** A reply block of the Model double: a text. */
export const replyText = (id: string, body: string): ContentBlock => text(`blk_${id}`, body)

/** A reply block of the Model double: a tool call suggestion with empty arguments. */
export function toolCallBlock(callId: string, name = 'read_file'): Original {
  const identity = judgeBlockIdentity({
    id: `blk_${callId}`,
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  return {
    ...identity.ok,
    kind: 'tool_call',
    callId,
    name,
    arguments: { kind: 'object', entries: [] },
  } as unknown as Original
}

// --- the Model double -------------------------------------------------------------------------------

/** What one admitted Model call does. The delay and the gates are of the double, not of the product. */
export type ModelStep = Readonly<{
  parts: readonly (ContentBlock | Original)[]
  reason: 'stop' | 'tool-suggestions'
  /** The fixed delay of the reply, in milliseconds. Counts never depend on it. */
  delayMs?: number
  /** A cost the dispatch reports, as the lexeme of USD (known, source `billable`). */
  cost?: string
  /** Blocks the call shows before it ends; with `hold`, the call stays in this state. */
  partial?: readonly ContentBlock[]
  /** The call does not settle until this promise does. */
  hold?: Promise<unknown>
}>

export type ModelScript = (admission: ModelAdmission) => ModelStep

/** One reply of the double, as the recorder and the tests see it. */
export type ModelReplyRecord = Readonly<{
  index: number
  call: string
  definedDelay: number
  actualStart: number
  actualEnd: number
  pushed: unknown
}>

// --- the Tool double --------------------------------------------------------------------------------

/** What the Tool double does with one invoke. The delay and the gate are of the double. */
export type ToolStep = Readonly<{
  /** The result content. */
  content: readonly ContentBlock[]
  delayMs?: number
  /** The result is not pushed until this promise settles. */
  hold?: Promise<unknown>
}>
export type ToolScript = (index: number, request: ToolInvokeRequest) => ToolStep

/** The full request of the fixed schema (R2-D36), shaped by the consumer the Agent names. */
function fixedToolRequest(consumer: ToolInvokeRequest['consumer']): ToolInvokeRequest {
  const adoption = (name: string) => testAdoption(`w2-${name}`)
  return ok(
    judgeToolInvokeRequest({
      availability: {
        kind: 'available',
        executor: adoption('executor'),
        layer: { kind: 'official' },
        definition: {
          adoption: adoption('read_file'),
          name: 'read_file',
          description: 'Read a file.',
          requiredCapabilities: [],
          backgroundAllowed: false,
          declarations: {
            adoption: adoption('tool-declarations'),
            environment: null,
            attachments: [],
            inputModalities: [],
            outputModalities: [],
            settings: null,
          },
          kind: 'function',
          parameters: {
            schema: { kind: 'object', entries: [] },
            vocabulary: adoption('json-schema'),
            descriptions: [],
          },
          returns: { kind: 'ordinary', program: { kind: 'none' } },
        },
      },
      command: null,
      arguments: { original: '{}', effective: '{}', complete: true },
      settings: adoption('settings'),
      context: adoption('context'),
      workspace: null,
      environment: null,
      requesterScope: { ref: 'tool-scope' },
      resources: [],
      scope: {
        owner: 'test-scope',
        key: 'one',
        grant: { owner: 'w2', record: 'scope-grant', revision: '1', digest: 'w2:scope-grant' },
      },
      consumer,
      batchDecision: null,
      mode: 'foreground',
      limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
    }),
  )
}

type AssociatedTool = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>

/** The associated Tool calls the checkpoint of a snapshot names, in the order of the batch. */
function associatedOf(snapshot: ExecutionSnapshot): AssociatedTool[] {
  return [
    ...snapshot.checkpoint.calls,
    ...(snapshot.checkpoint.batch?.actions ?? []).flatMap(action =>
      action.call === null ? [] : [action.call],
    ),
  ].filter(
    (call): call is AssociatedTool => call.kind === 'tool' && call.association === 'associated',
  )
}

// --- the options and the world -----------------------------------------------------------------------

export type W2Options = Readonly<{
  model: ModelScript
  tool?: ToolScript
  /** The fixed delay of the Model and Tool doubles when a step names none. */
  defaultDelayMs?: number
  receiverRecords?: number
  /** A storage directory to use and leave in place, for a scenario that reopens it. */
  root?: string
  /** What the Agent does after a reply; default finish when it evaluates complete. */
  progression?: 'evaluate-completion' | 'continue'
  /** Called with each `agentMessageHandoff.prepare` input of the Agent and its answer. */
  onHandoff?: (input: unknown, answer: unknown) => void
  /**
   * The earlier context: `double` (default) is the history of the K-RQ holder double of CP3;
   * `session` is AD-04, the history source of the Session log.
   */
  earlier?: 'double' | 'session'
  /** Parts of other closures: `plugins` mount after the Agent host, `handoff: 'external'` keeps the scripted one out. */
  plugins?: readonly PluginMount[]
}>

/** The delay the doubles use when nothing else is said: it also keeps the Agent's own commits ahead of the reply. */
const DEFAULT_DELAY_MS = 300
/** How many waits of the Agent one saved result lets the clock release. */
const RELEASES_PER_SAVE = 3

export async function openW2World(options: W2Options) {
  const counters: RoundCounters = createRoundCounters()
  const earlier = options.earlier ?? 'double'
  const delay = options.defaultDelayMs ?? DEFAULT_DELAY_MS
  const replies: ModelReplyRecord[] = []
  const toolRequests: ToolInvokeRequest[] = []
  // Double (R2-D36): the prepared request of the fixed schema.
  const toolRequestSource: NonNullable<Dependencies['toolRequests']> = {
    describe: async () => ({ ok: testAdoption('w2-read_file') }),
    prepare: async input => {
      const request = fixedToolRequest(input.consumer)
      toolRequests.push(request)
      return { ok: request }
    },
  }
  /** The Model call identities in the order they were admitted. */
  const modelCalls: string[] = []
  const toolPushes: Promise<unknown>[] = []
  let recorder: StageRecorder | null = null

  // --- the Session provider: the real one, its history face observed ---
  // The measurement observers are the `measure` parameters of the products (R2-D17): the Session
  // and Context plugin factories, and the factory of the Agent runtime. They call the recorder of
  // the scenario, when there is one, with the clock read at the call.
  /** How many Runs Session has ended in this process: the `round-complete` events it gave. */
  let roundsComplete = 0
  /**
   * The receivers write through their own Journal copy, so the plugin's event stream does not wake the
   * Agent; it picks a saved result up at its reconciliation check (CP3). The doubles move the manual
   * Agent clock past one check right after each saved result: the trigger is the save, not a timer.
   */
  let afterSave: () => void = () => undefined
  const observe = (event: unknown): void => {
    if ((event as { kind?: string }).kind === 'round-complete') roundsComplete += 1
    recorder?.observe(event as MeasureEvent)
  }
  class ObservedSession extends createSessionProviderPlugin({ measure: observe }) {
    override get history() {
      return counters.observeHistory(super.history)
    }
  }

  const w = await openLineWorld({
    wrapStorage: storage => countingStorage(storage, counters),
    journalPlugin: combination => [
      createSessionAgentJournalPlugin({
        // Real plugin; the installation is the test installation of agent-contract/testing.
        cancellation: {
          installation: testCancellationPolicyInstallation,
          policy: createTestCancellationPolicy(),
        },
      }),
      combination,
    ],
    handoff: 'external',
    // The manual clock is moved by `until`, far faster than real time: no instance idles out.
    hostConfig: { instanceIdleMs: 2_000_000_000 },
    ...(options.receiverRecords === undefined ? {} : { receiverRecords: options.receiverRecords }),
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.progression === undefined ? {} : { progression: options.progression }),
    // Real: the production factory, with the products' `measure` observer and the Tool request
    // source of R2-D36 (a double: a fixed full request of a fixed schema).
    hostPlugin:
      options.onHandoff === undefined
        ? createAgentHostLocalPlugin({ measure: observe, toolRequests: toolRequestSource })
        : observedHandoffHost(options.onHandoff, toolRequestSource, observe),
    // `earlier: 'session'` is real (AD-04): the K-RQ holder sources over the Session log replace the
    // holder double. The fixed request facts of the narrow adoption source are those of the world's
    // adopted-request double. By default the earlier context is the history of the holder double.
    ...(earlier === 'session' ? { holder: 'external' as const } : {}),
    sessionProvider: ObservedSession,
    contextPlugin: createAgentContextPlugin({ measure: observe }),
    plugins: ({ adopted, combination, coordinator }) => {
      // Real (AD-02): the Agent's publication is interpreted into the session log, woken by the
      // Journal plugin's `agent-published` event. Real: the handoff provider and its records.
      const ad02 = createSessionJournalInterpretationPlugin<string>({ coordinator })
      const handoff = createSessionMessageHandoffPlugin<string>({
        coordinator,
        principalIdentity: principal => `principal:${principal}`,
        provider: testAdoption('w2-handoff'),
      })
      const history =
        earlier === 'session'
          ? (() => {
              const ad04 = createSessionHistorySource({ heads: { sessionOf: headOf }, adopted })
              return [[ad04.lowerBound], [ad04.source]] as const
            })()
          : []
      // Real (AD-05): the Model results the Agent received enter the session log, so the replies are
      // history rows of the next round. AD-06 (Tool results) is not woken by the Journal yet and has no
      // delivery reader; it is not mounted.
      const ad05 = createSessionModelLogConsumptionPlugin<string>({ coordinator })
      return [
        ...history,
        [ad02.plugin],
        [ad05.plugin],
        [handoff, combination],
        ...(options.plugins ?? []),
      ]
    },
    wrapTransactions: port => ({
      ...port,
      commitLog: async value => {
        const commit = port.commitLog
        if (commit === undefined) throw new Error('the Session transactions offer no commitLog')
        const answer = await commit.call(port, value)
        counters.ad02Commit('ok' in answer)
        return answer
      },
    }),
    wrapModelReceiver: receiver => ({
      ...receiver,
      push: async input => {
        const answer = await receiver.push(input)
        if ('ok' in answer) counters.receive('model')
        return answer
      },
    }),
    model: async admission => {
      counters.modelRequest()
      modelCalls.push(String(admission.call))
      const step = options.model(admission)
      const definedDelay = step.delayMs ?? delay
      const { pusher, tenant, call, index } = admission
      const target = { tenant, call }
      const actualStart = performance.now()
      await sleep(definedDelay)
      const dispatch = decodeDispatchId(`mdisp_w2_${index}`)
      const version = decodeResultVersion(`mrver_w2_${index}`)
      if ('failure' in dispatch || 'failure' in version) throw new Error('model identities')
      pusher.controller.start({ ...target, dispatch: dispatch.ok, firstContent: 'observed' })
      if (step.partial !== undefined)
        pusher.controller.emit({
          ...target,
          blocks: step.partial.map(block => ({ kind: 'visible', block })) as never,
        })
      if (step.cost !== undefined) recordCost(admission, dispatch.ok, step)
      if (step.hold !== undefined) await step.hold
      let pushed: unknown
      try {
        pusher.controller.settle({
          ...target,
          version: version.ok,
          termination: { kind: 'completed', reason: step.reason },
          parts: step.parts.map(block => ({ kind: 'sealed' as const, trims: [], block })) as never,
          source: evidenceOf(`w2/model/${call}`),
          pageSize: 10,
          pageTargetBytes: 65536,
        })
        pushed = await pusher.settled(target)
        afterSave()
      } catch (error) {
        // A call that a control ended while the double held it cannot settle: the late result is
        // the double's, and the scenario reads what became of it from `replies`.
        pushed = { late: String(error) }
      }
      const actualEnd = performance.now()
      replies.push({ index, call: String(call), definedDelay, actualStart, actualEnd, pushed })
      recorder?.stub({
        kind: 'model',
        provider: 'scripted-model',
        invocationId: String(call),
        definedDelay,
        actualStart,
        actualEnd,
      })
      return pushed
    },
  })

  // Each saved result lets the clock release `RELEASES_PER_SAVE` of the reconciliation waits that the
  // Agent arms after it, each one by moving the clock to its instant. A wait for the idle reclaim is far
  // away and is never released. Unused releases do not carry into the next round. The number of
  // releases follows the saves, not the time a test takes.
  let budget = 0
  let releases = 0
  let driving = true
  afterSave = () => {
    budget += RELEASES_PER_SAVE
  }
  const nearWait = (): number | null => {
    const horizon = Date.parse(w.clock.now()) + 60_000
    const instants = w.clock
      .pending()
      .map(instant => Date.parse(instant))
      .filter(at => at <= horizon)
    return instants.length === 0 ? null : Math.min(...instants)
  }
  const driver = (async () => {
    while (driving) {
      const at = budget > 0 ? nearWait() : null
      if (at !== null) {
        budget -= 1
        releases += 1
        w.clock.advanceTo(new Date(at).toISOString())
      }
      await sleep(2)
    }
  })()

  // --- the Tool receiver and the Tool double ---
  const execution = async (): Promise<AgentExecutionId> => {
    const found = await w.runExecution()
    if (found === null) throw new Error('no execution')
    return found
  }
  const agentAccess: Access<unknown> = { principal: COORDINATOR, tenant: TENANT }
  const toolState = createToolReceiverState<unknown>()
  const targetsOf = async (access: Access<unknown>, who: AgentExecutionId) => {
    const loaded = await w.probeLog.load({ ...access, execution: who })
    if ('failure' in loaded) return loaded
    const instance = loaded.ok.executionAttachment?.instance
    return {
      ok:
        instance === undefined
          ? []
          : associatedOf(loaded.ok).map(pending => ({ execution: who, instance, pending })),
    }
  }
  const made = createLocalToolReceiver<unknown>(
    {
      provider: w.sessionLog,
      access: w.access.port,
      capacity: () => ({
        records: options.receiverRecords ?? 10000,
        bytes: 64 * 1024 * 1024,
        attachments: 10000,
        inFlight: 64,
      }),
      targets: {
        async resolve(input) {
          const found = await targetsOf(input.access, await execution())
          if ('failure' in found) return found
          const target = found.ok.find(
            item =>
              item.pending.reference === input.reference &&
              JSON.stringify(item.pending.position) === JSON.stringify(input.consumer),
          )
          return { ok: target ?? null }
        },
        forExecution: input => targetsOf(input.access, input.execution),
      },
    },
    toolState,
  )
  if ('failure' in made) throw new Error(`tool receiver: ${JSON.stringify(made.failure)}`)
  const toolReceiver = made.ok
  const toolScript: ToolScript =
    options.tool ?? (() => ({ content: [text('blk_tool_result', 'tool result')] }))

  let toolInvokes = 0
  w.tools.invoke.always(async ({ request }): Promise<ToolInvokeOutcome> => {
    counters.toolInvoke()
    const index = (toolInvokes += 1) - 1
    const step = toolScript(index, request)
    const call = `tcall_w2_${index}`
    const reference = ok(
      encodeToolInvocationRef({
        tenant: TENANT,
        call: ok(decodeToolCallId(call)),
        admission: ok(decodeToolOperationId(`top_w2_${index}`)),
      }),
    )
    toolPushes.push(deliver(index, call, reference, request, step))
    return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
  })

  /** The Tool double pushes its result to the receiver once the Agent has saved the association. */
  async function deliver(
    index: number,
    call: string,
    reference: AssociatedTool['reference'],
    request: ToolInvokeRequest,
    step: ToolStep,
  ): Promise<unknown> {
    const definedDelay = step.delayMs ?? delay
    const actualStart = performance.now()
    await sleep(definedDelay)
    if (step.hold !== undefined) await step.hold
    const delivery: ToolDelivery<ContentBlock> = {
      kind: 'result',
      key: {
        kind: 'result',
        producer: 'tool',
        reference,
        result: ok(decodeToolResultVersion(`result-w2-${index}`)),
      },
      consumer: request.consumer,
      delivery: ok(decodeToolDeliveryId(`delivery-w2-${index}`)),
      relation: 'original',
      terminal: { kind: 'completed' },
      actualTerminal: null,
      effect: { kind: 'not-occurred', evidence: evidenceOf(`w2/tool/effect/${index}`) },
      source: evidenceOf(`w2/tool/result/${index}`),
      value: {
        content: step.content,
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      },
      account: null,
    }
    // The association is saved after the Tool answers accepted; a push before it finds no target.
    let answer: Awaited<ReturnType<typeof toolReceiver.push>> | null = null
    for (let attempt = 0; attempt < 200; attempt += 1) {
      answer = await toolReceiver.push({
        access: agentAccess,
        delivery,
        signal: new AbortController().signal,
      })
      if ('ok' in answer) break
      await sleep(20)
    }
    if (answer !== null && 'ok' in answer) {
      counters.receive('tool')
      afterSave()
    }
    const actualEnd = performance.now()
    recorder?.stub({
      kind: 'tool',
      provider: 'scripted-tool',
      invocationId: call,
      definedDelay,
      actualStart,
      actualEnd,
    })
    return answer
  }

  /** A dispatch record that reports a cost, so the account of the call can be read back. */
  function recordCost(admission: ModelAdmission, dispatch: DispatchId, step: ModelStep): void {
    const { tenant, call, operation, pusher } = admission
    pusher.controller.recordDispatch({
      tenant,
      call,
      record: {
        dispatch,
        supplier: {
          adoption: testAdoption('cp3-supplier'),
          recipient: 'recipient',
          model: 'model',
          credential: { kind: 'factory' },
        },
        intent: operation,
        send: 'started',
        firstContent: 'observed',
        terminal: { kind: 'completed', reason: step.reason },
        account: {
          subject: { kind: 'model_call', id: call },
          usage: [{ name: 'input', state: 'known', lexeme: '10', unit: 'token' }],
          cost: [{ state: 'known', lexeme: step.cost ?? '0', unit: 'USD', source: 'billable' }],
          trimmed: { state: 'unknown', unit: 'token' },
          place: 'suite',
          duration: { state: 'unknown' },
          receipt: 'received',
          revision: '0',
        },
        materialization: null,
      },
    })
  }

  /** The intake face creates the session; every scenario starts here. */
  async function createSession(name: string): Promise<void> {
    w.bindings.controls.bind(TENANT, sessionId(SESSION))
    ok(
      await w.intake.management.create({
        ...intakeAccess,
        operation: operationId(`${name}-create`),
        creation: creation(),
      }),
    )
    if (earlier !== 'session') return
    // The create bound the context scope of the session; the Runtime Context handoff double has to
    // know it before the Agent reads the readable context (double: K-RC).
    const work = ok(await w.probe.readWork(intakeAccess))
    for (const binding of work.contextScopes ?? []) {
      const scope = decodeScopeRef({ ref: binding.scope })
      if ('failure' in scope) throw new Error('the context scope of the session is not a scope ref')
      await w.holdScope(scope.ok)
    }
  }

  /** The intake face accepts one ordinary input; S1 wakes and starts the Run. */
  async function accept(name: string, body: string): Promise<void> {
    ok(
      await w.intake.work.accept({
        ...intakeAccess,
        operation: operationId(`${name}-accept`),
        value: ordinaryInput(name, body),
      }),
    )
  }

  /**
   * Waits for `probe` on later turns, at most `ms` milliseconds. It does not touch the clock: the
   * doubles move the manual Agent clock once after each saved result (`afterSave`).
   */
  async function until(probe: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
    const end = Date.now() + ms
    while (!(await probe())) {
      if (Date.now() > end) throw new Error('the condition never held')
      await sleep(20)
    }
  }

  /**
   * The invocation references of the Model calls the Agent saved for the execution: the identity
   * under which Session knows a Model call as a producer (AD-05 writes `key.reference`).
   */
  async function modelReferences(): Promise<string[]> {
    const loaded = ok(await w.probeLog.load({ ...agentAccess, execution: await execution() }))
    return loaded.checkpoint.calls.flatMap(call => (call.kind === 'model' ? [call.reference] : []))
  }

  /**
   * How far the Agent's events of the execution reach (`emitted`, the last sequence of its output)
   * and how far AD-02 has interpreted them into the session log (`readThrough`, from Session).
   */
  async function progress(
    who: AgentExecutionId,
  ): Promise<{ emitted: string; readThrough: string }> {
    let emitted = '0'
    const read = async (after: string | null): Promise<EventPage> =>
      ok(await w.probeLog.output.read({ ...agentAccess, execution: who, after, limit: 1000 }))
    for (
      let page = await read(null);
      ;
      page = await read(page.kind === 'page' ? page.next : null)
    ) {
      if (page.kind !== 'page') throw new Error('the output has a gap')
      emitted = page.events.at(-1)?.sequence ?? emitted
      if (page.caughtUp || page.events.length === 0) break
    }
    const work = ok(await w.probe.readWork(intakeAccess))
    const held = work.executions?.find(item => item.execution.execution === String(who))
    return { emitted, readThrough: held?.execution.readThrough ?? '0' }
  }

  /** The Run that Session last ended, null before the first end. */
  async function lastTerminal(): Promise<string | null> {
    const { run } = ok(await w.probe.readWork(intakeAccess))
    return run.kind === 'terminal' ? String(run.terminal.run) : null
  }

  /**
   * One round: the input goes in through the intake face and the Run goes to its terminal, with the
   * counters and the recorder of the scenario open around it. Returns the counts of the round.
   */
  async function runRound(round: number, body: string, ms = 60_000) {
    counters.begin(round)
    budget = 0
    recorder?.beginRound(round, `round-${round}`)
    try {
      const before = await lastTerminal()
      await accept(`in-${round}`, body)
      // The terminal of the earlier Run stays in the snapshot until the next Run starts. The reads of
      // the wait are not counted.
      await until(async () => {
        const ended = await lastTerminal()
        return ended !== null && ended !== before
      }, ms)
    } finally {
      // A round that did not end still closes its counters, so the failure names the counts.
      counters.end()
    }
    return counters.rounds.at(-1)!
  }

  return {
    ...w,
    async close(): Promise<void> {
      driving = false
      await driver
      await w.close()
    },
    until,
    releases: () => releases,
    roundCompletes: () => roundsComplete,
    lastTerminal,
    progress,
    modelReferences,
    runRound,
    createSession,
    accept,
    counters,
    replies,
    toolRequests,
    modelCalls,
    toolPushes,
    toolReceiver,
    toolState,
    execution,
    agentAccess,
    /** Records the measurement events of the three segments under one clock. */
    startRecording: (logCount: () => number = () => w.commits.length): StageRecorder => {
      recorder = recordStage({ logCount })
      return recorder
    },
    isOwnTenant: (who: Access<unknown>) => tenantEquals(who.tenant, TENANT),
    executionOf,
  }
}

/**
 * The agent-host plugin over a wrapped factory that reports every `agentMessageHandoff.prepare` of the
 * Agent with its answer. A scenario that has to read the Agent's own handoffs again after a kill needs
 * it; it is the production factory `createAgentRuntime` with one observed dependency, and no scenario
 * but J5 takes it.
 */
function observedHandoffHost(
  onHandoff: (input: unknown, answer: unknown) => void,
  toolRequests: NonNullable<Dependencies['toolRequests']>,
  observe: (event: unknown) => void,
) {
  return createAgentHostPlugin((dependencies: Dependencies, runtimeOptions) =>
    createAgentRuntime(
      {
        ...dependencies,
        toolRequests,
        handoff: {
          ...dependencies.handoff,
          prepare: async input => {
            const answer = await dependencies.handoff.prepare(input)
            onHandoff(input, answer)
            return answer
          },
        },
      },
      runtimeOptions,
      { measure: observe },
    ),
  )
}

/** The session that a head evidence of the Journal names (R2-D14, `historySessionOf`). */
function headOf(evidence: DurableEvidence) {
  const named = historySessionOf(evidence)
  return named !== null && named.tenant === textOf(TENANT) && named.session === SESSION
    ? { tenant: TENANT, session: sessionId(SESSION) }
    : null
}

function evidenceOf(record: string): DurableEvidence {
  return { owner: 'w2', record, revision: '1', digest: `w2:${record}` }
}

export type W2World = Awaited<ReturnType<typeof openW2World>>
