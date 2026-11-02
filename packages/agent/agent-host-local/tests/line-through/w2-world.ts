// The joint world of wave 2 (C-JOINT, J1 to J6): the CP3 world with the parts that wave 2 adds.
//
// Real (the product parts under test; the CP3 list in ./world.ts stays true):
// - the `agentJournal` plugin of session-adapters with the trusted cancellation installation
//   (`createSessionAgentJournalPlugin`, R2-D35), over the real sqlite-provider;
// - the history source of the Session log for the earlier context (AD-04,
//   `createSessionHistorySource`) in place of the K-RQ holder double, leased from
//   `contextHolderSources` by a borrower plugin;
// - the Model receiver of CP3 and the Tool receiver (`createLocalToolReceiver`) over the session-log
//   Journal of the session.
//
// Doubles (each one is named where it is built):
// - the Tool runtime (`createScriptedToolRuntime`) and the Tool request preparation
//   (`AgentDependencies.toolRequests`, R2-D36: a fixed full request of a fixed schema);
// - the Model: the scripted provider and result pusher, each reply with a fixed delay;
// - the adopted-request and read-eligibility parts of the holder, and the Runtime Context handoff, are
//   the CP3 doubles; AD-03 and the scope lookup are not installed here;
// - AD-02 (interpretation of the Agent's publication), the handoff plugin and the measurement
//   events of Session, Context and Agent are parts of other closures. A scenario that needs one of
//   them is a named placeholder until the closure is in the parent branch. This world does not stand
//   in for them.
import { createAgentRuntime, type AgentDependencies } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  type Access,
  type AgentExecutionId,
  type DurableEvidence,
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
import { createAgentHostPlugin } from '../../src/host-plugin.ts'
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

export async function openW2World(options: W2Options) {
  const counters: RoundCounters = createRoundCounters()
  const earlier = options.earlier ?? 'double'
  const delay = options.defaultDelayMs ?? DEFAULT_DELAY_MS
  const replies: ModelReplyRecord[] = []
  const toolRequests: ToolInvokeRequest[] = []
  const prepared: unknown[] = []
  /** The Model call identities in the order they were admitted. */
  const modelCalls: string[] = []
  const toolPushes: Promise<unknown>[] = []
  let recorder: StageRecorder | null = null

  // --- the Session provider: the real one, its history face observed ---
  // The measurement observers are the `measure` parameters of the products (R2-D17): the Session
  // and Context plugin factories, and the factory of the Agent runtime. They call the recorder of
  // the scenario, when there is one, with the clock read at the call.
  const observe = (event: unknown): void => recorder?.observe(event as MeasureEvent)
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
    hostPlugin: createAgentHostPlugin((dependencies: Dependencies, runtimeOptions) =>
      createAgentRuntime(
        {
          ...dependencies,
          // The answers of the request preparation, kept so a scenario can say why a call was not made.
          requests: {
            ...dependencies.requests,
            prepare: async input => {
              const answer = await dependencies.requests.prepare(input)
              prepared.push(answer)
              return answer
            },
          },
          // Double (R2-D36): the prepared request of the fixed schema.
          toolRequests: {
            describe: async () => ({ ok: testAdoption('w2-read_file') }),
            prepare: async input => {
              const request = fixedToolRequest(input.consumer)
              toolRequests.push(request)
              return { ok: request }
            },
          },
        },
        runtimeOptions,
        { measure: observe },
      ),
    ),
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
      return [...history, [ad02.plugin], [handoff, combination], ...(options.plugins ?? [])]
    },
    wrapTransactions: port => ({
      ...port,
      commitLog: async value => {
        counters.ad02Commit()
        const commit = port.commitLog
        if (commit === undefined) throw new Error('the Session transactions offer no commitLog')
        return commit.call(port, value)
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

  // --- the Tool receiver and the Tool double ---
  const execution = async (): Promise<AgentExecutionId> => {
    const found = await w.runExecution()
    if (found === null) throw new Error('no execution')
    return found
  }
  const agentAccess: Access<unknown> = { principal: COORDINATOR, tenant: TENANT }
  const toolState = createToolReceiverState<unknown>()
  const targetsOf = async (access: Access<unknown>, who: AgentExecutionId) => {
    const loaded = await w.journal().load({ ...access, execution: who })
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
    if (answer !== null && 'ok' in answer) counters.receive('tool')
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
    const work = ok(await w.transactions.readWork(intakeAccess))
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
   * Waits for `probe` on later turns, at most `ms` milliseconds. Each turn moves the manual Agent
   * clock past one reconciliation check: the receivers write through their own Journal copy, so the
   * plugin's event stream does not wake the Agent, and it picks a saved result up at that check (CP3).
   */
  async function until(probe: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
    const end = Date.now() + ms
    while (!(await probe())) {
      if (Date.now() > end) throw new Error('the condition never held')
      w.clock.advanceTo(new Date(Date.parse(w.clock.now()) + 1100).toISOString())
      await sleep(100)
    }
  }

  /** The Run that Session last ended, null before the first end. */
  async function lastTerminal(): Promise<string | null> {
    const { run } = ok(await w.transactions.readWork(intakeAccess))
    return run.kind === 'terminal' ? String(run.terminal.run) : null
  }

  /**
   * One round: the input goes in through the intake face and the Run goes to its terminal, with the
   * counters and the recorder of the scenario open around it. Returns the counts of the round.
   */
  async function runRound(round: number, body: string, ms = 60_000) {
    counters.begin(round)
    recorder?.beginRound(round, `round-${round}`)
    try {
      const before = await lastTerminal()
      await accept(`in-${round}`, body)
      // The terminal of the earlier Run stays in the snapshot until the next Run starts.
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
    until,
    lastTerminal,
    runRound,
    createSession,
    accept,
    counters,
    replies,
    toolRequests,
    prepared,
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
