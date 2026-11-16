import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import {
  agentToolDeliverySchema,
  createAgentRuntime,
  type AgentDependencies,
} from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  type Access,
  type AgentExecutionId,
  type DurableEvidence,
  type EventPage,
  type ExecutionSnapshot,
  type Material,
  type PendingCall,
} from '@omne-harness/agent-contract'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantEquals } from '@omne-harness/legal-identity'
import { agentToolReceptionTargetsKey } from '@omne-harness/agent-cordis-contract/cordis'
import {
  decodeDispatchId,
  decodeProviderName,
  decodeResultVersion,
  type DispatchId,
  type ModelDelivery,
  type ResultPart,
} from '@omne-harness/model-contract'
import { historySessionOf } from '@omne-harness/session-adapters'
import {
  createSessionAgentJournalPlugin,
  createSessionHistorySource,
  createSessionJournalInterpretationPlugin,
  createSessionMessageHandoffPlugin,
  createSessionModelLogConsumptionPlugin,
  createSessionToolLogConsumptionPlugin,
  type JournalPublicationReport,
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
  type LineWorldOptions,
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

export const replyText = (id: string, body: string): ContentBlock => text(`blk_${id}`, body)

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

export function reasoningStateBlock(id: string, payload = 'opaque'): Original {
  const identity = judgeBlockIdentity({
    id: `blk_${id}`,
    visibility: { toHuman: false, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  return { ...identity.ok, kind: 'reasoning_state', payload, pairs: [] } as unknown as Original
}

export type ModelStep = Readonly<{
  parts: readonly (ContentBlock | Original)[]
  reason: 'stop' | 'tool-suggestions'
  delayMs?: number
  cost?: string
  partial?: readonly ContentBlock[]
  hold?: Promise<unknown>
}>

export type ModelScript = (admission: ModelAdmission) => ModelStep

export type ModelReplyRecord = Readonly<{
  index: number
  call: string
  definedDelay: number
  actualStart: number
  actualEnd: number
  pushed: unknown
}>

export type ToolStep = Readonly<{
  content: readonly ContentBlock[]
  delayMs?: number
  hold?: Promise<unknown>
}>
export type ToolScript = (index: number, request: ToolInvokeRequest) => ToolStep

function readToolDelivery(
  material: Material<ContentBlock>,
): { tenant: string; delivery: ToolDelivery<ContentBlock> } | null {
  if (material.kind !== 'facts') return null
  const { schema } = material
  if (
    schema.owner !== agentToolDeliverySchema.owner ||
    schema.name !== agentToolDeliverySchema.name ||
    schema.revision !== agentToolDeliverySchema.revision ||
    schema.digest !== agentToolDeliverySchema.digest
  )
    return null
  const value = plainJson(material.value) as { tenant?: unknown; delivery?: unknown } | null
  if (value === null || typeof value !== 'object') return null
  if (
    typeof value.tenant !== 'string' ||
    typeof value.delivery !== 'object' ||
    value.delivery === null
  )
    return null
  return { tenant: value.tenant, delivery: value.delivery as ToolDelivery<ContentBlock> }
}

function plainJson(value: unknown): unknown {
  const tree = value as {
    kind?: string
    value?: unknown
    lexeme?: string
    items?: unknown[]
    entries?: { key: string; value: unknown }[]
  }
  switch (tree?.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return (tree.items ?? []).map(plainJson)
    case 'object':
      return Object.fromEntries(
        (tree.entries ?? []).map(entry => [entry.key, plainJson(entry.value)]),
      )
    default:
      return null
  }
}

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
          returns: ordinaryReturnFixture(adoption('codec')),
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
      limits: { concurrency: 1, scopeBudget: null, foregroundMs: null, backgroundAfterMs: null },
    }),
  )
}

type AssociatedTool = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>

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

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${stable(member)}`).join(',')}}`
}

export type W2Options = Readonly<{
  model: ModelScript
  modelDelivery?: (delivery: ModelDelivery) => ModelDelivery
  tool?: ToolScript
  defaultDelayMs?: number
  receiverRecords?: number
  root?: string
  storageLimits?: LineWorldOptions['storageLimits']
  maxRunSteps?: number
  modelRetry?: NonNullable<LineWorldOptions['hostConfig']>['modelRetry']
  progression?: 'evaluate-completion' | 'continue'
  onHandoff?: (input: unknown, answer: unknown) => void
  wrapAgentDependencies?: (dependencies: Dependencies) => Dependencies
  wrapModelReceiver?: LineWorldOptions['wrapModelReceiver']
  receptionTargets?: LineWorldOptions['receptionTargets']
  earlier?: 'double' | 'session'
  plugins?: readonly PluginMount[]
  toolRequests?: Partial<NonNullable<Dependencies['toolRequests']>>
  report?: (report: JournalPublicationReport) => void
  wrapStorage?: NonNullable<LineWorldOptions['wrapStorage']>
}>

const LONG_RUN_LIMITS = {
  maxJsonMembers: 200_000_000,
  maxCommandBytes: 1 << 30,
  maxRequestBytes: 1 << 30,
  globalInFlightWriteBytes: 2 ** 31,
  maxResponseBytes: 1 << 28,
  maxOperationResponseBytes: 1 << 28,
  globalWriteResponseBytes: 2 ** 31,
  maxReadResultBytes: 1 << 28,
  globalReadResultBytes: 2 ** 31,
  groupMaxInputBytes: 1 << 30,
  groupMaxResponseReservationBytes: 1 << 30,
  journalSizeLimitBytes: 1 << 30,
  walReadPauseBytes: 1 << 30,
  walWriteStopBytes: 2 ** 31,
} as const

const DEFAULT_DELAY_MS = 300
const RELEASES_PER_SAVE = 3

export async function openW2World(options: W2Options) {
  const counters: RoundCounters = createRoundCounters()
  const earlier = options.earlier ?? 'double'
  const delay = options.defaultDelayMs ?? DEFAULT_DELAY_MS
  const replies: ModelReplyRecord[] = []
  const toolRequests: ToolInvokeRequest[] = []
  const toolRequestSource: NonNullable<Dependencies['toolRequests']> = {
    describe: async () => ({ ok: { kind: 'tool', definition: testAdoption('w2-read_file') } }),
    prepare: async input => {
      const request = fixedToolRequest(input.consumer)
      toolRequests.push(request)
      return { ok: request }
    },
    ...options.toolRequests,
  }
  const modelCalls: string[] = []
  const receivedFailures: unknown[] = []
  const toolPushes: Promise<unknown>[] = []
  let recorder: StageRecorder | null = null

  let roundsComplete = 0
  const answeredTerminals = new Set<string>()
  const endedRuns: { run: string; execution: AgentExecutionId; outcome: string }[] = []
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

  const consumers: {
    ad05?: (target: never) => Promise<unknown>
    ad06?: (target: never) => Promise<unknown>
  } = {}
  const w = await openLineWorld({
    wrapStorage: storage => {
      const counted = countingStorage(storage, counters)
      return options.wrapStorage === undefined ? counted : options.wrapStorage(counted)
    },
    journalPlugin: combination => [
      createSessionAgentJournalPlugin({
        cancellation: {
          installation: testCancellationPolicyInstallation,
          policy: createTestCancellationPolicy(),
        },
        ...(options.report === undefined ? {} : { report: options.report }),
      }),
      combination,
    ],
    ...(options.report === undefined ? {} : { journalReport: options.report }),
    ...(options.receptionTargets === undefined
      ? {}
      : { receptionTargets: options.receptionTargets }),
    handoff: 'external',
    hostConfig: {
      instanceIdleMs: 2_000_000_000,
      ...(options.maxRunSteps === undefined ? {} : { maxRunSteps: options.maxRunSteps }),
      ...(options.modelRetry === undefined ? {} : { modelRetry: options.modelRetry }),
    },
    ...(options.receiverRecords === undefined ? {} : { receiverRecords: options.receiverRecords }),
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.progression === undefined ? {} : { progression: options.progression }),
    storageLimits: { ...LONG_RUN_LIMITS, ...options.storageLimits },
    hostPlugin:
      options.onHandoff === undefined && options.wrapAgentDependencies === undefined
        ? createAgentHostLocalPlugin({ measure: observe, toolRequests: toolRequestSource })
        : observedHandoffHost(options, toolRequestSource, observe),
    ...(earlier === 'session' ? { holder: 'external' as const } : {}),
    sessionProvider: ObservedSession,
    contextPlugin: createAgentContextPlugin({ measure: observe }),
    plugins: ({ combination, coordinator }) => {
      const ad02 = createSessionJournalInterpretationPlugin<string>({ coordinator })
      const handoff = createSessionMessageHandoffPlugin<string>({
        coordinator,
        principalIdentity: principal => `principal:${principal}`,
        provider: testAdoption('w2-handoff'),
      })
      const history =
        earlier === 'session'
          ? (() => {
              const ad04 = createSessionHistorySource({ heads: { sessionOf: headOf } })
              return [[ad04.lowerBound], [ad04.source]] as const
            })()
          : []
      const ad05 = createSessionModelLogConsumptionPlugin<string>({ coordinator })
      const ad06 = createSessionToolLogConsumptionPlugin({
        toolDeliveries: readToolDelivery,
        coordinator,
      })
      consumers.ad05 = ad05.consume as never
      consumers.ad06 = ad06.consume as never
      return [
        ...history,
        [ad02.plugin],
        [ad05.plugin],
        [ad06.plugin],
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
        const ended = value.observation.consequences.find(
          consequence => consequence.kind === 'ended',
        )
        if ('ok' in answer && ended !== undefined) {
          answeredTerminals.add(String(value.observation.run))
          endedRuns.push({
            run: String(value.observation.run),
            execution: executionOf(value.observation.execution),
            outcome: ended.outcome,
          })
        }
        return answer
      },
    }),
    wrapProvider: provider => {
      const received = (provider as { received?: { commit: (input: never) => Promise<unknown> } })
        .received
      if (received === undefined) return provider
      return {
        ...provider,
        received: {
          ...received,
          commit: async (input: never) => {
            const answer = await received.commit(input)
            if (typeof answer === 'object' && answer !== null && 'failure' in answer)
              receivedFailures.push(answer)
            return answer
          },
        },
      }
    },
    wrapModelReceiver: receiver => {
      const wrapped = options.wrapModelReceiver?.(receiver) ?? receiver
      return {
        ...wrapped,
        push: async input => {
          const delivery = options.modelDelivery?.(input.delivery) ?? input.delivery
          const answer = await wrapped.push({ ...input, delivery })
          if ('ok' in answer) counters.receive('model')
          return answer
        },
      }
    },
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

  const warnings: string[] = []
  w.ctx.logger.exporter({
    export: message => {
      if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
    },
  })

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
          : associatedOf(loaded.ok).map(pending => ({
              execution: who,
              instance,
              definition: loaded.ok.checkpoint.definition,
              pending,
            })),
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
      targets:
        options.receptionTargets === 'journal'
          ? {
              resolve(input) {
                const targets = w.ctx.get(agentToolReceptionTargetsKey)
                if (targets === undefined)
                  throw new Error('agentToolReceptionTargets is not provided')
                return targets.resolve(input)
              },
              forExecution(input) {
                const targets = w.ctx.get(agentToolReceptionTargetsKey)
                if (targets === undefined)
                  throw new Error('agentToolReceptionTargets is not provided')
                return targets.forExecution(input)
              },
            }
          : {
              async resolve(input) {
                const found = await targetsOf(input.access, await execution())
                if ('failure' in found) return found
                const target = found.ok.find(
                  item =>
                    item.pending.reference === input.reference &&
                    stable(item.pending.position) === stable(input.consumer),
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

  function recordCost(admission: ModelAdmission, dispatch: DispatchId, step: ModelStep): void {
    const { tenant, call, operation, pusher } = admission
    pusher.controller.recordDispatch({
      tenant,
      call,
      record: {
        dispatch,
        supplier: {
          adoption: testAdoption('cp3-supplier'),
          provider: ok(decodeProviderName('recipient')),
          model: 'model',
          credential: { layer: 'official' },
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
    const work = ok(await w.probe.readWork(intakeAccess))
    for (const binding of work.contextScopes ?? []) {
      const scope = decodeScopeRef({ ref: binding.scope })
      if ('failure' in scope) throw new Error('the context scope of the session is not a scope ref')
      await w.holdScope(scope.ok)
    }
  }

  async function accept(name: string, body: string): Promise<void> {
    ok(
      await w.intake.work.accept({
        ...intakeAccess,
        operation: operationId(`${name}-accept`),
        value: ordinaryInput(name, body),
      }),
    )
  }

  // Waits for `probe` on later turns, at most `ms`; it must not touch the clock, which the doubles
  // move once after each saved result (`afterSave`).
  async function until(probe: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
    const end = Date.now() + ms
    while (!(await probe())) {
      if (Date.now() > end) throw new Error('the condition never held')
      await sleep(20)
    }
  }

  async function modelReferences(): Promise<string[]> {
    const loaded = ok(await w.probeLog.load({ ...agentAccess, execution: await execution() }))
    return loaded.checkpoint.calls.flatMap(call => (call.kind === 'model' ? [call.reference] : []))
  }

  async function progress(
    who: AgentExecutionId,
  ): Promise<{ emitted: string; readThrough: string }> {
    let emitted = '0'
    const read = async (after: string | null): Promise<EventPage> =>
      ok(await w.probeLog.output.read({ ...agentAccess, execution: who, after, limit: 100 }))
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

  async function lastTerminal(): Promise<string | null> {
    const { run } = ok(await w.probe.readWork(intakeAccess))
    return run.kind === 'terminal' ? String(run.terminal.run) : null
  }

  async function lastOutcome(): Promise<string | null> {
    const { run } = ok(await w.probe.readWork(intakeAccess))
    return run.kind === 'terminal' ? run.terminal.outcome : null
  }

  async function runRound(round: number, body: string, ms = 60_000) {
    counters.begin(round)
    budget = 0
    recorder?.beginRound(round, `round-${round}`)
    try {
      const before = await lastTerminal()
      await accept(`in-${round}`, body)
      await until(async () => {
        const ended = await lastTerminal()
        return ended !== null && ended !== before && answeredTerminals.has(ended)
      }, ms)
    } finally {
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
    warnings,
    consumers,
    releases: () => releases,
    roundCompletes: () => roundsComplete,
    lastTerminal,
    lastOutcome,
    endedRuns: (): readonly { run: string; execution: AgentExecutionId; outcome: string }[] =>
      endedRuns,
    progress,
    modelReferences,
    runRound,
    createSession,
    accept,
    counters,
    replies,
    toolRequests,
    modelCalls,
    receivedFailures,
    toolPushes,
    toolReceiver,
    toolState,
    execution,
    agentAccess,
    startRecording: (logCount: () => number = () => w.commits.length): StageRecorder => {
      recorder = recordStage({ logCount })
      return recorder
    },
    isOwnTenant: (who: Access<unknown>) => tenantEquals(who.tenant, TENANT),
    executionOf,
  }
}

function observedHandoffHost(
  options: Pick<W2Options, 'onHandoff' | 'wrapAgentDependencies'>,
  toolRequests: NonNullable<Dependencies['toolRequests']>,
  observe: (event: unknown) => void,
) {
  return createAgentHostPlugin((dependencies: Dependencies, runtimeOptions) => {
    const observed: Dependencies = {
      ...dependencies,
      toolRequests,
      handoff: {
        ...dependencies.handoff,
        prepare: async input => {
          const answer = await dependencies.handoff.prepare(input)
          options.onHandoff?.(input, answer)
          return answer
        },
      },
    }
    return createAgentRuntime(
      options.wrapAgentDependencies?.(observed) ?? observed,
      runtimeOptions,
      { measure: observe },
    )
  })
}

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
