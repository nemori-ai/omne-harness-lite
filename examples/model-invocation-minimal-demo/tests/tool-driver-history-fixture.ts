import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REGISTERED_CATEGORIES } from '@omne-harness-lite/asset-registry'
import { judgeContentBlock, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  isConclusion,
  judgeDefinition,
  judgeValue,
  type Conclusion,
} from '@omne-harness-lite/loop-extension'
import { prepareRunnerConclusion, type RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  type ModelLogCategory,
  type ModelLogPurpose,
  type CapturedModelLogValue,
} from '@omne-harness-lite/model-request-runtime'
import type { Message } from '@omne-harness-lite/messages'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import {
  createRuntimeContext,
  runtimeContextMigrations,
} from '@omne-harness-lite/runtime-context-local'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations, type MigrationFragment } from '@omne-harness-lite/storage'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import type { CheckedPrefix, LogEntryInput, OwnedLogEntry } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import {
  readSettlementPrefix,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { driverKey, prepareDriverEntry } from '../src/tool-driver-codec.ts'

export const at = '2026-10-04T00:00:00Z'
export const scope = {
  tenant: unwrap(parseTenantId({ organization: 'history-org', account: 'history-user' })),
  session: unwrap(parseOpaqueIdentifier('history-session', 'SessionRef')),
}
export const origin = { run: 'run', attempt: 1, assistantMessage: 'reply-1' }
export interface FixtureTool {
  readonly name: string
  readonly capability: string
  readonly asset: string
  readonly version: string
  readonly definition: ToolDefinition
}
export const tool = {
  name: 'echo',
  capability: 'tool:echo',
  asset: 'echo-asset',
  version: '1',
  definition: {
    name: 'echo',
    description: 'Echo',
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: { type: 'object', properties: {}, description: 'Input' },
    permissions: { execute: { default: 'auto' } },
  },
} satisfies FixtureTool
export function toolCall(id = 'call', unparseable = false): ToolCallBlock {
  const judged = judgeContentBlock({
    kind: 'tool_call',
    id: `block-${id}`,
    callId: id,
    tool: 'echo',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    ...(unparseable ? { unparseable: true, rawArguments: '{broken' } : { arguments: {} }),
  })
  if (!('ok' in judged) || judged.ok.kind !== 'tool_call' || !judged.ok.complete)
    throw new Error('call fixture')
  return judged.ok
}
export function officialPiece(
  name = OFFICIAL_ADMISSION_NAME,
  power: RunnerPiece['power'] = 'veto',
): RunnerPiece {
  const result = judgeDefinition({
    name,
    position: 'before_action',
    power,
    implementation: { kind: 'builtin', builtinName: name },
  })
  if ('rejected' in result) throw new Error('piece fixture')
  return {
    definition: result.ok,
    power,
    ...(name === OFFICIAL_ADMISSION_NAME ? { fallback: 'admission' as const } : {}),
  }
}
export const dk = (parts: string[]) => `tool-driver/1/${JSON.stringify(parts)}`

/** Controlled data provenance through real public codecs and the physical JSONL owner. No network model is claimed here. */
export async function historyFixture(
  calls: readonly ToolCallBlock[] = [toolCall()],
  permission: 'auto' | 'forbid' = 'auto',
  adoptedTool: FixtureTool = tool,
  additionalMigrations: readonly MigrationFragment[] = [],
  contextSeed: ContextSessionSeed = { required: [], initial: [], fixed: [] },
) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-driver-history-'))
  const logDir = join(dir, 'logs')
  await mkdir(logDir)
  const options = {
    dir: logDir,
    processOwnership: { current: 'history-test', observeExit: async () => 'exited' as const },
  }
  let log = await openJsonlSessionLog(options)
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'context.sqlite'),
    migrations: composeMigrations([...runtimeContextMigrations, ...additionalMigrations]),
    upgrade: false,
  })
  const messages: Exclude<Message, { type: 'system' }>[] = []
  let currentAttempt = 1
  async function append(entries: readonly LogEntryInput[]) {
    const before = await log.readSince(scope.session, 0)
    if ('failure' in before) throw new Error('read fixture')
    const result = await log.append(
      scope.session,
      entries,
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: before.tail },
    )
    if ('failure' in result) throw new Error(`append fixture ${result.failure}`)
  }
  function capture(category: ModelLogCategory, value: unknown): CapturedModelLogValue {
    const result = captureModelLogValue({ category, input: { kind: 'value', value } })
    if (!('ok' in result)) throw new Error(`capture fixture ${category}: ${result.reason}`)
    return result.ok
  }
  function model(
    category: ModelLogCategory,
    value: unknown,
    purpose: ModelLogPurpose = { kind: category },
    withRun = true,
  ) {
    const captured = capture(category, value)
    const prepared = prepareModelLogEntry({
      ...scope,
      shell: { tenant: scope.tenant, ...(withRun ? { run: 'run', attempt: currentAttempt } : {}) },
      captured,
      purpose,
      messagePrefix: messages,
    })
    if (!('ok' in prepared)) throw new Error(`prepare fixture ${category}: ${prepared.reason}`)
    if (captured.message !== null && captured.message.type !== 'system')
      messages.push(captured.message)
    return prepared.ok
  }
  function driver(value: unknown): OwnedLogEntry {
    const result = prepareDriverEntry(scope, value)
    if ('invalid' in result) throw new Error(`driver fixture: ${JSON.stringify(value)}`)
    return result.entry
  }
  async function attempt(n: number) {
    currentAttempt = n
    const started = model('message', {
      id: `started-${n}`,
      type: 'system_reminder',
      createdAt: at,
      nature: 'event',
      source: {
        kind: 'attempt_started',
        attempt: n,
        reason: n === 1 ? 'first' : 'resumed_after_wait',
        at,
      },
      blocks: [],
    })
    const value = {
      kind: 'attempt_adopted',
      run: 'run',
      attempt: n,
      adoption: dk(['attempt', 'run', `${n}e0`]),
      startedMessageKey: started.dedupeKey,
      context: contextSeed.initial.filter(value =>
        contextSeed.required.some(
          registration =>
            registration.key === value.key && registration.consumers.includes('model'),
        ),
      ),
      tools: [adoptedTool],
      report: {
        session: scope.session,
        runId: 'run',
        attempt: n,
        computedAt: 1,
        snapshots: REGISTERED_CATEGORIES.map(category => ({ category, filledAt: 1 })),
        availability: [],
        mcpActions: [],
        endpointHoldings: [],
        skillGate: [],
        effectivePermissions: {
          echo: {
            capability: { category: 'tool', name: 'echo' },
            item: 'execute',
            value: { allowed: [permission] },
            from: 'tenant',
            tenantAutoWritable: true,
          },
        },
      },
    }
    const key = driverKey(value)
    if (typeof key !== 'string') throw new Error('adoption fixture')
    await append([started, driver(value)])
    return key
  }
  async function reply(blocks: readonly unknown[] = calls) {
    const call = `model-${currentAttempt}`,
      responseId = `response-${currentAttempt}`
    const binding = {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: 'teaching/model', revision: 'one' },
      configuration: { revision: 'one', values: {} },
    }
    const snapshot = {
      adaptation: binding,
      providers: ['first'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 20,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: at,
    }
    const route = {
      adaptation: binding,
      profile: { origin: 'official', routeName: 'teaching/model' },
      profileSnapshot: snapshot,
      provider: 'first',
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
      parameters: {},
    }
    await append([
      model('record', {
        kind: 'model_call_created',
        call,
        creationKey: `create-${call}`,
        payload: { kind: 'created', locator: call, version: 'v1', digest: 'a'.repeat(64) },
        createdAt: at,
      }),
    ])
    await append([
      model('record', {
        kind: 'model_call_dispatched',
        call,
        dispatch: 1,
        response: responseId,
        ...route,
      }),
    ])
    await append([
      model('record', { kind: 'model_call_opened', call, dispatch: 1, firstTokenAt: at }),
    ])
    const message = {
      id: `reply-${currentAttempt}`,
      type: 'assistant',
      response: responseId,
      ending: 'complete',
      createdAt: at,
      blocks,
    }
    const response = {
      id: responseId,
      call: { callId: call, runId: 'run' },
      attemptId: currentAttempt,
      dispatch: 1,
      route,
      outcome: 'complete',
      reply: message,
      replyDisposition: 'persisted',
      timing: { sentAt: at, firstTokenAt: at, endedAt: at },
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_tokens: 'unknown',
        cache_write_tokens: 0,
        source: 'upstream',
      },
      inputCalibration: {
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
        observedInput: { kind: 'unavailable', reason: 'missing_usage' },
        outputGroup: { kind: 'unavailable', reason: 'not_retained' },
      },
      cost: { cost_usd: 0, source: 'upstream_usage' },
    }
    const responseCapture = capture('response', response)
    const result = model('message', message, {
      kind: 'persistedMessage',
      response: responseCapture,
    })
    await append([result, model('response', response)])
    return result.dedupeKey!
  }
  async function conclusion(
    call = calls[0]!,
    extension = OFFICIAL_ADMISSION_NAME,
    output: unknown = { kind: 'observed' },
    anchor = `action-${call.callId}`,
    power: RunnerPiece['power'] = 'veto',
  ) {
    const judged = judgeValue('Conclusion', {
      position: 'before_action',
      extension,
      power,
      at,
      callId: call.callId,
      output,
    })
    if (!('ok' in judged) || !isConclusion(judged.ok)) throw new Error('conclusion shape fixture')
    const prepared = prepareRunnerConclusion({
      ...scope,
      execution: { kind: 'withRun', run: 'run', attempt: currentAttempt },
      anchor,
      occurrence: { kind: 'final' },
      value: judged.ok as unknown as Conclusion,
      reminders: [],
    })
    if ('invalidInput' in prepared) throw new Error('conclusion fixture')
    await append([prepared.entry])
    return prepared.entry.dedupeKey!
  }
  async function prefix(): Promise<CheckedPrefix> {
    const result = await log.readSince(scope.session, 0)
    if ('failure' in result) throw new Error('prefix fixture')
    return { scope, ownerGeneration: 'owner-one', ...result }
  }
  const context = createRuntimeContext({
    log,
    storage,
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    now: () => at,
  })
  const initialized = await context.initializer.initializeContextSession(scope, contextSeed)
  if (initialized.kind !== 'applied') throw new Error('context fixture')
  context.closeAdmission()
  await context.drain()
  const user = model(
    'message',
    { id: 'inbound', type: 'user', createdAt: at, blocks: [] },
    { kind: 'message' },
    false,
  )
  await append([user, driver({ kind: 'run_started', run: 'run', inboundKey: user.dedupeKey, at })])
  const adoption = await attempt(1)
  const replyKey = await reply()
  const generation = {},
    registration: SettlementRegistration = {
      start(_kind, operation) {
        const controller = new AbortController(),
          completion = operation(controller.signal)
        return {
          completion,
          requestStop: () => controller.abort(),
          stopped: completion.then(
            () => undefined,
            () => undefined,
          ),
        }
      },
      release() {},
    }
  let active = true
  return {
    dir: logDir,
    storage,
    options,
    get log() {
      return log
    },
    append,
    driver,
    model,
    attempt,
    reply,
    replyKey,
    conclusion,
    prefix,
    adoption,
    calls,
    async modelPrefix() {
      const result = await readSettlementPrefix({
        binding: {
          ...scope,
          log,
          generation,
          currentGeneration: () => (active ? generation : null),
        },
        registration,
      })
      if (!('prefix' in result)) throw new Error('settlement prefix fixture')
      return result.prefix
    },
    revoke() {
      active = false
    },
    async reopen() {
      await log.close()
      log = await openJsonlSessionLog(options)
    },
    async close() {
      await storage.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export async function completeActions(f: Awaited<ReturnType<typeof historyFixture>>) {
  const items = []
  for (const call of f.calls) {
    if (call.unparseable)
      items.push({
        callId: call.callId,
        effectiveCall: call,
        conclusions: [],
        decision: { kind: 'notExecutable', reason: 'unparseable' },
      })
    else {
      const key = await f.conclusion(call)
      items.push({
        callId: call.callId,
        effectiveCall: call,
        anchor: `action-${call.callId}`,
        conclusions: [key],
        decision: { kind: 'allow', conclusion: key },
      })
    }
  }
  const value = {
    kind: 'actions_completed',
    origin,
    adoption: f.adoption,
    chain: [officialPiece()],
    completion: {
      key: dk(['actions', origin.assistantMessage]),
      gate: { kind: 'available' },
      items,
    },
  }
  await f.append([f.driver(value)])
  return value
}
