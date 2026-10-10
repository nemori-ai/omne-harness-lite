import { readFileSync } from 'node:fs'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  validate as validateProfile,
} from '@omne-harness-lite/model-profile'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  type AuthorizedCallObserver,
  type ModelLogCategory,
  type ModelLogPurpose,
  type ObserverReceiver,
  type ObserverScope,
  type ObserverScopeResult,
  type SettlementContention,
  type SettlementOwner,
  type SettlementRegistration,
  type SettlementScheduler,
  type SettlementTask,
  type SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementRequest,
  SettlementStagedBatch,
} from '@omne-harness-lite/model-request-runtime-local'
import type { AppendResult, LogEntry, OwnedLogEntry } from '@omne-harness-lite/session-log'
import type { ReadTx, Storage, WriteTx } from '@omne-harness-lite/storage'

export function identifier<K extends 'SessionRef' | 'OrganizationId' | 'AccountId'>(
  value: string,
  kind: K,
) {
  const parsed = parseOpaqueIdentifier(value, kind)
  if ('invalidInput' in parsed) throw new Error(`invalid fixture ${kind}`)
  return parsed.ok
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !isJsonNumber(value)
  )
}

function object(value: JsonValue | undefined): JsonObject {
  if (!isObject(value)) throw new Error('expected normative object')
  return value
}

export function settlementExpectation() {
  const source = readFileSync(
    new URL('../../../core/model-response/tests/fixtures/response-examples.md', import.meta.url),
    'utf8',
  )
  const section = source.slice(source.indexOf('### E-1 '), source.indexOf('### E-2 '))
  const literal = /```json\n([\s\S]*?)\n```/u.exec(section)?.[1]
  if (literal === undefined) throw new Error('normative E-1 JSON absent')
  const parsed = readJsonStrict(literal)
  if ('failed' in parsed) throw new Error(`normative E-1 parse: ${parsed.failed}`)
  const copied = copyJsonValue(parsed.ok)
  if ('failed' in copied) throw new Error('invalid normative object')
  const original = object(copied.ok)
  const { runId: _runId, ...call } = object(original.call)
  const { attemptId: _attemptId, ...facts } = original
  const response: JsonObject = { ...facts, call }
  const judgment = judgeModelResponse(response)
  if ('rejected' in judgment) throw new Error(`normative no-Run response: ${judgment.rejected}`)
  const route = object(response.route)
  const profile = validateProfile('ModelProfileSnapshot', route.profileSnapshot)
  if (!profile.valid) throw new Error('normative profile snapshot rejected')
  const profileRef = judgeModelProfileDocument('ModelProfileRef', route.profile)
  if ('rejected' in profileRef)
    throw new Error(`normative profile reference: ${profileRef.rejected}`)
  const parameters = judgeModelProfileDocument('ModelRequestParameters', route.parameters)
  if ('rejected' in parameters) throw new Error(`normative parameters: ${parameters.rejected}`)
  const scope = parseTenantId({ organization: 'org_7fd2c1', account: 'acc_91ab40' })
  if ('invalidInput' in scope) throw new Error('normative tenant')
  const tenant = scope.ok
  const session = identifier('c4-e-session', 'SessionRef')
  const capture = (category: ModelLogCategory, value: unknown) => {
    const result = captureModelLogValue({ category, input: { kind: 'value', value } })
    if (!('ok' in result)) throw new Error(`normative capture ${category}: ${result.reason}`)
    return result.ok
  }
  const prepare = (category: ModelLogCategory, value: unknown, purpose: ModelLogPurpose) => {
    const result = prepareModelLogEntry({
      session,
      shell: { tenant },
      captured: capture(category, value),
      purpose,
      messagePrefix: [],
    })
    if (!('ok' in result)) throw new Error(`normative prepare: ${result.reason}`)
    return result.ok
  }
  const dispatched = {
    kind: 'model_call_dispatched',
    call: 'mc_19f3',
    dispatch: 1,
    response: 'resp_4c1e9a',
    adaptation: route.adaptation,
    profile: route.profile,
    profileSnapshot: route.profileSnapshot,
    provider: route.provider,
    selectedBy: route.selectedBy,
    credentialScope: route.credentialScope,
    parameters: route.parameters,
  }
  const opened = {
    kind: 'model_call_opened',
    call: 'mc_19f3',
    dispatch: 1,
    firstTokenAt: object(response.timing).firstTokenAt,
  }
  const anchors = [
    prepare('record', dispatched, { kind: 'record' }),
    prepare('record', opened, { kind: 'record' }),
  ]
  const journal: { entries: readonly LogEntry[]; tail: number } = {
    entries: anchors.map((entry, index) => ({ ...entry, session, position: index + 1 })),
    tail: 2,
  }
  const entries: readonly OwnedLogEntry[] = [
    prepare('message', response.reply, {
      kind: 'persistedMessage',
      response: capture('response', response),
    }),
    prepare('response', response, { kind: 'response' }),
  ]
  const request: SettlementRequest = {
    target: { call: 'mc_19f3', dispatch: 1, response: 'resp_4c1e9a' },
    current: { messageId: 'msg_51', disposition: 'persisted' },
    response,
  }
  const staged: SettlementStagedBatch = {
    target: request.target,
    current: request.current,
    entries,
    condition: { kind: 'unconditional' },
  }
  return { session, tenant, response, request, anchors, journal, entries, staged }
}

export class NativeSettlementOwner implements SettlementOwner {
  readonly name = 'c4-e-native-owner'
  active = 0
  releases = 0
  running = 0
  readonly tasks: SettlementTask<unknown>[] = []
  readonly starts: SettlementTaskKind[] = []
  readonly admission = () => 'open' as const
  readonly opened = () => ({ confirmed: true as const })
  readonly unresolvedWrites = (): readonly SettlementTask<AppendResult>[] => []
  readonly acquire: SettlementOwner['acquire'] = limit => {
    if (ExactDecimal.from(this.active).compare(ExactDecimal.from(limit)) >= 0)
      return { unavailable: true }
    this.active++
    let running = 0
    let released = false
    const registration: SettlementRegistration = {
      start: <T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) => {
        if (released) throw new Error('registration already released')
        running++
        this.running++
        this.starts.push(kind)
        const controller = new AbortController()
        const completion = Promise.resolve().then(() => operation(controller.signal))
        const stopped = completion
          .then(
            () => undefined,
            () => undefined,
          )
          .then(() => {
            running--
            this.running--
          })
        const task = { completion, stopped, requestStop: () => controller.abort() }
        this.tasks.push(task)
        return task
      },
      release: () => {
        if (running !== 0 || released) throw new Error('live or repeated registration release')
        released = true
        this.active--
        this.releases++
      },
    }
    return { registration }
  }
  async drain() {
    for (const task of this.tasks) task.requestStop()
    await Promise.allSettled(this.tasks.flatMap(task => [task.completion, task.stopped]))
    if (this.running !== 0 || this.active !== 0) throw new Error('native settlement owner retained')
  }
}

export const contention: SettlementContention = {
  name: 'c4-e-one-submission-zero-wait',
  limits: { submissions: 1, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
  decide: () => ({ proceed: { waitMs: 0 } }),
}
export const scheduler: SettlementScheduler = {
  nowMonotonicMs: () => 0,
  wait() {
    throw new Error('zero-wait policy cannot start a timer')
  },
}

export class StageStorage implements Storage {
  private stage: 'disarmed' | 'commit' | 'refuse' = 'disarmed'
  private readsToRefuse = 0
  stageAttempts = 0
  stageCommits = 0
  readRefusals = 0
  constructor(private readonly storage: Storage) {}
  arm(stage: 'commit' | 'refuse', reads: number) {
    this.stage = stage
    this.readsToRefuse = reads
  }
  disarm() {
    this.stage = 'disarmed'
    this.readsToRefuse = 0
  }
  async read<T>(operation: (tx: ReadTx) => Promise<T>): Promise<T> {
    if (this.readsToRefuse > 0 && this.stage === 'disarmed') {
      this.readsToRefuse--
      this.readRefusals++
      throw new Error('stage readback refused')
    }
    return await this.storage.read(operation)
  }
  async write<T>(operation: (tx: WriteTx) => Promise<T>): Promise<T> {
    const stage = this.stage
    if (stage === 'disarmed') return await this.storage.write(operation)
    this.stage = 'disarmed'
    this.stageAttempts++
    if (stage === 'commit') {
      await this.storage.write(operation)
      this.stageCommits++
    }
    throw new Error(stage === 'commit' ? 'committed stage receipt lost' : 'stage write refused')
  }
}

export function observerHost(scope: ObserverScope) {
  const held = Promise.withResolvers<void>()
  const deliveryRecheck = Promise.withResolvers<void>()
  const receiverStopped = Promise.withResolvers<void>()
  let permission: ObserverScopeResult = { valid: true }
  let stopped = false
  let stopping: Promise<void> | undefined
  let active = 0
  let stopCalls = 0
  const tasks: Promise<void>[] = []
  const received: string[] = []
  const receiver: ObserverReceiver = {
    receive(serialized) {
      if (stopped) throw new Error('receiver admission closed')
      received.push(serialized)
      active++
      const completion = received.length === 1 ? held.promise : Promise.resolve()
      const taskStopped = completion.then(() => {
        active--
      })
      tasks.push(taskStopped)
      return { completion, stopped: taskStopped }
    },
    stop() {
      if (stopped) return
      stopped = true
      stopCalls++
      stopping = Promise.all(tasks).then(() => {
        receiverStopped.resolve()
      })
    },
    stopped: receiverStopped.promise,
  }
  const authorization: AuthorizedCallObserver = {
    check(target) {
      if (target !== scope.target) throw new Error('unexpected observer target')
      if (!('valid' in permission)) deliveryRecheck.resolve()
      return permission
    },
    open: () => ({ receiver }),
    close: async () => ({ released: true }),
  }
  return {
    authorization,
    receiver,
    received,
    deliveryRecheck: deliveryRecheck.promise,
    revoke(reason: 'observer_scope_mismatch' | 'unavailable') {
      permission = reason === 'unavailable' ? { unavailable: true } : { invalidInput: { reason } }
    },
    finish: () => held.resolve(),
    state: () => ({ active, stopCalls }),
    async close() {
      held.resolve()
      receiver.stop()
      await stopping
      await receiver.stopped
      await Promise.all(tasks)
      if (active !== 0) throw new Error('observer task retained')
    },
  }
}

export async function closeAll(operations: readonly (() => Promise<void>)[]) {
  const failures: unknown[] = []
  for (const operation of operations) {
    const [result] = await Promise.allSettled([Promise.resolve().then(operation)])
    if (result?.status === 'rejected') failures.push(result.reason)
  }
  if (failures.length !== 0) throw new AggregateError(failures, 'fixture cleanup failed')
}
