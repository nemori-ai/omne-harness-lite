import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { readAttemptStarted } from '@omne-harness-lite/session-runtime'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  type OriginalIssueAdmission,
  readModelLogEnvelope,
} from '@omne-harness-lite/model-request-runtime'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { type SessionLog, type AppendResult, type LogEntry } from '@omne-harness-lite/session-log'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { AnchoredInvocationInput } from '../src/anchored-invocation-types.ts'
import type {
  PlannedSemantics,
  TransportAdapter,
  SendResult,
} from '@omne-harness-lite/model-request-runtime'
import {
  request,
  policy as invokePolicy,
  content,
  fixturePlan,
  fixtureProjection,
  fixtureReadFacts,
  type FixtureEnd,
} from './invoke-policy-fixture.ts'
import { ControlledSettlementOwner, noWaitScheduler, policy } from './settlement-fixture.ts'

export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('resolver')
  }
  const promise = new Promise<T>(accept => {
    resolve = accept
  })
  return { promise, resolve }
}
export interface TestPlan extends PlannedSemantics {
  readonly body: JsonObject
}
export function transport(
  options: {
    readonly beforeSend?: () => Promise<void>
    readonly stop?: () => Promise<void>
    readonly end?: FixtureEnd
    readonly sent?: SendResult<object>
    readonly afterContent?: () => Promise<void>
  } = {},
) {
  let plans = 0,
    sends = 0,
    stopped = 0
  let plan: TestPlan | undefined
  const adapter: TransportAdapter<TestPlan, object> = {
    async plan(input, execution) {
      plans++
      plan = Object.freeze({
        ...fixturePlan(input),
        body: Object.freeze({ originalBytes: 'unchanged' }),
      })
      return { planned: plan }
    },
    projectOutput: fixtureProjection,
    async send(planned) {
      if (planned !== plan) throw new Error('replanned or copied wire body')
      sends++
      await options.beforeSend?.()
      return options.sent ?? { response: {} }
    },
    async *read(_response, _planned, signal) {
      try {
        for (const event of content()) {
          if (signal.aborted) return { aborted: true, readFacts: fixtureReadFacts() }
          yield event
          if (event.t === 'fill') await options.afterContent?.()
        }
        return {
          ...(options.end ?? {
            ended: 'end',
            stopReason: 'stop',
            servingProvider: 'actual-provider',
            upstreamModel: 'actual-model',
            upstreamRequestId: 'actual-id',
          }),
          readFacts: fixtureReadFacts(),
        }
      } finally {
        await options.stop?.()
        stopped++
      }
    },
  }
  return {
    adapter,
    plans: () => plans,
    sends: () => sends,
    stopped: () => stopped,
    planned: () => plan,
  }
}
export function payload(entry: LogEntry): JsonObject {
  const attempt = readAttemptStarted(entry)
  if ('kind' in attempt && attempt.kind === 'fact') {
    const copied = copyJsonValue(attempt.fact)
    if ('failed' in copied || !jsonObject(copied.ok)) throw new Error('attempt fixture')
    return copied.ok
  }
  const decoded = readModelLogEnvelope(entry.payload)
  if ('failure' in decoded || decoded.kind !== 'model' || !jsonObject(decoded.envelope.value))
    throw new Error('model payload')
  return decoded.envelope.value
}
function jsonObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export async function harness(
  work: (value: {
    input: AnchoredInvocationInput<TestPlan, object>
    log: Awaited<ReturnType<typeof openSqlLogFixture>>
    owner: ControlledSettlementOwner
    controller: AbortController
    writes: {
      readonly count: number
      readonly entries: readonly unknown[]
      readonly fence: unknown
      readonly condition: unknown
    }[]
    wrapOriginal: (replacement: OriginalIssueAdmission) => void
    wrap: (log: SessionLog) => void
    revoke: () => void
    released: () => number
    dir: string
  }) => Promise<void>,
) {
  const root = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/m1-anchored-invocation/jsonl/', import.meta.url),
  )
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'actual-'))
  const sql = new DatabaseSync(join(dir, 'owner.sqlite'))
  sql.exec(
    'CREATE TABLE session_owner(session TEXT PRIMARY KEY, organization TEXT NOT NULL, account TEXT NOT NULL)',
  )
  sql
    .prepare('INSERT INTO session_owner VALUES(?,?,?)')
    .run('anchored-session', 'test-org', 'test-account')
  const tenant = parseTenantId(
    sql
      .prepare('SELECT organization,account FROM session_owner WHERE session=?')
      .get('anchored-session'),
  )
  const session = parseOpaqueIdentifier('anchored-session', 'SessionRef')
  const message = parseOpaqueIdentifier('anchored-message', 'MessageId')
  if (!('ok' in tenant) || !('ok' in session) || !('ok' in message))
    throw new Error('actual identity source')
  const log = await openSqlLogFixture({ dir: join(dir, 'log') })
  const writes: {
    count: number
    entries: readonly unknown[]
    fence: unknown
    condition: unknown
  }[] = []
  let port: SessionLog = log
  let generation: object | null = {}
  const originalGeneration = generation
  const recording: SessionLog = {
    readByKey: (...args) => port.readByKey(...args),
    readSince: (...args) => port.readSince(...args),
    async append(s, entries, fence, condition): Promise<AppendResult> {
      writes.push({ count: entries.length, entries, fence, condition })
      return port.append(s, entries, fence, condition)
    },
  }
  let issuePort: OriginalIssueAdmission = log.fixtureOriginalIssue
  const originalIssue: OriginalIssueAdmission = {
    async admitOriginal(value) {
      writes.push({
        count: 1,
        entries: [value.entry],
        fence:
          value.entry.run === undefined
            ? { kind: 'unfenced' }
            : { kind: 'fenced', run: value.entry.run, attempt: value.entry.attempt },
        condition: { kind: 'tailEquals', tail: value.source.tail },
      })
      return issuePort.admitOriginal(value)
    },
    consumeOriginal: claim => issuePort.consumeOriginal(claim),
  }
  const owner = new ControlledSettlementOwner()
  const controller = new AbortController()
  let released = 0
  const input: AnchoredInvocationInput<TestPlan, object> = {
    settlementFactory: sessionModelSettlement,
    planInput: request(),
    transport: transport().adapter,
    credential: '503',
    policy: invokePolicy(),
    signal: controller.signal,
    responseId: 'anchored-response',
    messageId: message.ok,
    profile: { origin: 'official', routeName: request().routeName },
    selectedBy: 'session',
    credentialScope: { layer: 'tenant', tenant: tenant.ok },
    settlement: {
      binding: {
        session: session.ok,
        tenant: tenant.ok,
        log: recording,
        readPrefix(this: import('@omne-harness-lite/model-request-runtime').SettlementLogBinding) {
          return log.fixturePrefix({ session: this.session, tenant: this.tenant }, this.log)
        },
        originalIssue,
        generation: originalGeneration,
        currentGeneration: () => generation,
      },
      owner,
      settlementContention: policy(),
      settlementScheduler: noWaitScheduler,
      diagnostic() {},
    },
    async releaseBorrowed() {
      released++
    },
  }
  try {
    await work({
      input,
      log,
      owner,
      controller,
      writes,
      wrapOriginal: replacement => {
        issuePort = replacement
      },
      wrap: replacement => {
        port = replacement
      },
      revoke: () => {
        generation = null
      },
      released: () => released,
      dir,
    })
  } finally {
    await log.close()
    sql.close()
  }
}
